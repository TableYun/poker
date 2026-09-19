const kv = await Deno.openKv();

const SYNC_VIEW_SCHEMA_VERSION = 7;
const primaryOrigin = "https://tableyun.github.io";
const devOrigin = "http://127.0.0.1:5500";
const STATE_TTL = 86_400_000;
const ACTION_TTL = 120_000;
const allowedActionNames = new Set(["fold", "check", "call", "raise", "allin"]);
const allowedOrigins = new Set([
	primaryOrigin,
	devOrigin,
	"http://localhost:8734",
]);

// Long polling: how long a ?wait=1 request may be held open, and how often the held
// request re-checks KV for changes. Holding requests open slashes the request count
// against Deno Deploy's usage limits compared to tight client-side polling.
const LONG_POLL_MAX_WAIT = 20_000;
const LONG_POLL_CHECK_INTERVAL = 750;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
const baseCorsHeaders = {
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Vary": "Origin",
};

// This file is the Deno Deploy entry point.
// Keep the small seat-projection helpers local here instead of importing browser modules, so
// the backend remains deployable as a standalone Deno entry and does not depend on GitHub Pages.
function withCors(origin, headers = {}) {
	const corsHeaders = { ...baseCorsHeaders };
	if (origin && allowedOrigins.has(origin)) {
		corsHeaders["Access-Control-Allow-Origin"] = origin;
	}
	return { ...corsHeaders, ...headers };
}

function jsonResponse(body, origin, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: withCors(origin, {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		}),
	});
}

function textResponse(body, status, origin) {
	return new Response(body, {
		status,
		headers: withCors(origin, { "Cache-Control": "no-store" }),
	});
}

function emptyResponse(origin, status = 204) {
	return new Response(null, {
		status,
		headers: withCors(origin, { "Cache-Control": "no-store" }),
	});
}

function parseInteger(value) {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

function getTableKey(tableId) {
	return ["table", tableId];
}

function getActionKey(tableId) {
	return ["action", tableId];
}

function findSeatView(view, seatIndex) {
	if (!view || !Array.isArray(view.seatViews)) {
		return null;
	}
	return view.seatViews.find((seat) => seat.seatIndex === seatIndex) ?? null;
}

function createSeatSyncPayload(record, seatIndex) {
	const seat = findSeatView(record?.view, seatIndex);
	if (!seat || !record?.view?.table) {
		return null;
	}

	return {
		table: record.view.table,
		seat,
		version: record.version,
		updatedAt: record.updatedAt,
		schemaVersion: record.schemaVersion ?? SYNC_VIEW_SCHEMA_VERSION,
	};
}

async function getState(tableId) {
	const entry = await kv.get(getTableKey(tableId));
	return entry.value ?? null;
}

async function saveState(tableId, payload) {
	const current = await getState(tableId);
	const version = (current?.version ?? 0) + 1;
	const record = {
		// The backend persists the already-prepared view model.
		// The table is the canonical computation source; this endpoint only stores and projects it.
		view: payload.view,
		updatedAt: new Date().toISOString(),
		version,
		schemaVersion: SYNC_VIEW_SCHEMA_VERSION,
	};
	await kv.set(getTableKey(tableId), record, { expireIn: STATE_TTL });
	return record;
}

async function savePendingAction(tableId, actionRequest) {
	const record = {
		seatIndex: actionRequest.seatIndex,
		turnToken: actionRequest.turnToken,
		action: actionRequest.action,
		amount: actionRequest.amount ?? null,
		createdAt: new Date().toISOString(),
	};
	await kv.set(getActionKey(tableId), record, { expireIn: ACTION_TTL });
	return record;
}

async function consumePendingAction(tableId, turnToken) {
	const key = getActionKey(tableId);
	const entry = await kv.get(key);
	const record = entry.value ?? null;
	if (!record) {
		return null;
	}
	if (record.turnToken !== turnToken) {
		await kv.delete(key);
		return null;
	}
	await kv.delete(key);
	return record;
}

async function handlePostState(request, origin) {
	let data;
	try {
		data = await request.json();
	} catch {
		return textResponse("Invalid JSON", 400, origin);
	}

	const view = data?.view;
	if (!view || !view.table || !Array.isArray(view.seatViews)) {
		return textResponse("Missing view", 400, origin);
	}

	const tableId = data.tableId || "default";
	const record = await saveState(tableId, { view });
	return jsonResponse({
		ok: true,
		version: record.version,
		updatedAt: record.updatedAt,
		schemaVersion: record.schemaVersion,
	}, origin);
}

async function handleGetState(url, origin) {
	const tableId = url.searchParams.get("tableId") || "default";
	const seatIndex = parseInteger(url.searchParams.get("seatIndex"));
	const sinceParam = url.searchParams.get("sinceVersion");
	const sinceVersion = sinceParam ? Number.parseInt(sinceParam, 10) : 0;
	const longPoll = url.searchParams.get("wait") === "1";

	if (seatIndex === null) {
		return textResponse("Missing seatIndex", 400, origin);
	}

	let record = await getState(tableId);
	if (longPoll && !Number.isNaN(sinceVersion)) {
		// Hold the request open until the state moves past sinceVersion or the wait
		// budget runs out; the client re-polls right away after each response.
		const deadline = Date.now() + LONG_POLL_MAX_WAIT;
		while (
			(!record || record.version <= sinceVersion) &&
			Date.now() < deadline
		) {
			await sleep(LONG_POLL_CHECK_INTERVAL);
			record = await getState(tableId);
		}
	}
	if (!record) {
		return textResponse("Not found", 404, origin);
	}

	// The single view never receives the full synchronized table state.
	// It only gets its own seat projection plus the public table projection.
	const payload = createSeatSyncPayload(record, seatIndex);
	if (!payload) {
		return textResponse("Seat not found", 404, origin);
	}
	if (!Number.isNaN(sinceVersion) && record.version <= sinceVersion) {
		return emptyResponse(origin);
	}
	return jsonResponse(payload, origin);
}

async function handlePostAction(request, origin) {
	let data;
	try {
		data = await request.json();
	} catch {
		return textResponse("Invalid JSON", 400, origin);
	}

	const tableId = data?.tableId || "default";
	const seatIndex = parseInteger(data?.seatIndex);
	const turnToken = typeof data?.turnToken === "string" ? data.turnToken.trim() : "";
	const action = typeof data?.action === "string" ? data.action.trim().toLowerCase() : "";
	const amount = parseInteger(data?.amount);

	if (seatIndex === null) {
		return textResponse("Missing seatIndex", 400, origin);
	}
	if (!turnToken) {
		return textResponse("Missing turnToken", 400, origin);
	}
	if (!allowedActionNames.has(action)) {
		return textResponse("Invalid action", 400, origin);
	}
	if (action === "raise" && amount === null) {
		return textResponse("Missing amount", 400, origin);
	}

	await savePendingAction(tableId, {
		seatIndex,
		turnToken,
		action,
		amount,
	});
	return jsonResponse({ ok: true }, origin);
}

async function handleGetAction(url, origin) {
	const tableId = url.searchParams.get("tableId") || "default";
	const turnToken = url.searchParams.get("turnToken")?.trim() || "";
	const longPoll = url.searchParams.get("wait") === "1";
	if (!turnToken) {
		return textResponse("Missing turnToken", 400, origin);
	}

	if (longPoll) {
		// Hold the request open until a pending action shows up (peek without consuming),
		// so the host waiting on a remote player's turn barely costs any requests.
		const deadline = Date.now() + LONG_POLL_MAX_WAIT;
		while (Date.now() < deadline) {
			const entry = await kv.get(getActionKey(tableId));
			if (entry.value) {
				break;
			}
			await sleep(LONG_POLL_CHECK_INTERVAL);
		}
	}

	const record = await consumePendingAction(tableId, turnToken);
	if (!record) {
		return emptyResponse(origin);
	}
	return jsonResponse(record, origin);
}

function handleOptions(origin) {
	return emptyResponse(origin);
}

function routeRequest(request) {
	const url = new URL(request.url);
	if (url.pathname !== "/state" && url.pathname !== "/action") {
		return textResponse("Not found", 404, request.headers.get("origin"));
	}

	const origin = request.headers.get("origin");
	if (origin !== null && !allowedOrigins.has(origin)) {
		return textResponse("Forbidden", 403, origin);
	}

	if (request.method === "OPTIONS") {
		return handleOptions(origin);
	}

	if (url.pathname === "/state") {
		if (request.method === "GET") {
			return handleGetState(url, origin);
		}
		if (request.method === "POST") {
			return handlePostState(request, origin);
		}
		return textResponse("Method not allowed", 405, origin);
	}

	if (request.method === "GET") {
		return handleGetAction(url, origin);
	}
	if (request.method === "POST") {
		return handlePostAction(request, origin);
	}
	return textResponse("Method not allowed", 405, origin);
}

Deno.serve(async (request) => {
	try {
		return await routeRequest(request);
	} catch (error) {
		console.error("Unexpected error", error);
		return textResponse("Internal error", 500, request.headers.get("origin"));
	}
});
