// Cloudflare Workers entry point for the poker sync backend.
// Same HTTP contract as api/main.js (Deno): GET/POST /state, GET/POST /action, with
// optional ?wait=1 long polling. Each table lives in its own Durable Object, so state
// is strongly consistent and long-poll waiters are woken by real pushes instead of
// storage polling.

const SYNC_VIEW_SCHEMA_VERSION = 7;
const primaryOrigin = "https://tableyun.github.io";
const devOrigin = "http://127.0.0.1:5500";
const STATE_TTL = 86_400_000;
const ACTION_TTL = 120_000;
const LONG_POLL_MAX_WAIT = 20_000;
const allowedActionNames = new Set(["fold", "check", "call", "raise", "allin"]);
const allowedOrigins = new Set([
	primaryOrigin,
	devOrigin,
	"http://localhost:8734",
]);
const baseCorsHeaders = {
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Vary": "Origin",
};

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

// A promise that resolves when notifyAll() fires or after timeoutMs, whichever is first.
function createWaiter(waiters, timeoutMs) {
	return new Promise((resolve) => {
		const entry = { resolve: null };
		const timer = setTimeout(() => {
			const index = waiters.indexOf(entry);
			if (index !== -1) {
				waiters.splice(index, 1);
			}
			resolve();
		}, timeoutMs);
		entry.resolve = () => {
			clearTimeout(timer);
			resolve();
		};
		waiters.push(entry);
	});
}

function notifyAll(waiters) {
	waiters.splice(0).forEach((entry) => entry.resolve());
}

export class PokerTable {
	constructor(ctx) {
		this.ctx = ctx;
		this.stateWaiters = [];
		this.actionWaiters = [];
	}

	async getRecord(key, ttl) {
		const record = await this.ctx.storage.get(key) ?? null;
		if (record && Date.now() - (record.storedAtMs ?? 0) > ttl) {
			await this.ctx.storage.delete(key);
			return null;
		}
		return record;
	}

	async fetch(request) {
		const url = new URL(request.url);
		const origin = request.headers.get("origin");

		if (url.pathname === "/state") {
			if (request.method === "GET") {
				return this.handleGetState(url, origin);
			}
			if (request.method === "POST") {
				return this.handlePostState(request, origin);
			}
			return textResponse("Method not allowed", 405, origin);
		}
		if (request.method === "GET") {
			return this.handleGetAction(url, origin);
		}
		if (request.method === "POST") {
			return this.handlePostAction(request, origin);
		}
		return textResponse("Method not allowed", 405, origin);
	}

	async handlePostState(request, origin) {
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

		const current = await this.getRecord("state", STATE_TTL);
		const version = (current?.version ?? 0) + 1;
		const record = {
			view,
			updatedAt: new Date().toISOString(),
			storedAtMs: Date.now(),
			version,
			schemaVersion: SYNC_VIEW_SCHEMA_VERSION,
		};
		await this.ctx.storage.put("state", record);
		notifyAll(this.stateWaiters);
		return jsonResponse({
			ok: true,
			version: record.version,
			updatedAt: record.updatedAt,
			schemaVersion: record.schemaVersion,
		}, origin);
	}

	async handleGetState(url, origin) {
		const seatIndex = parseInteger(url.searchParams.get("seatIndex"));
		const sinceParam = url.searchParams.get("sinceVersion");
		const sinceVersion = sinceParam ? Number.parseInt(sinceParam, 10) : 0;
		const longPoll = url.searchParams.get("wait") === "1";

		if (seatIndex === null) {
			return textResponse("Missing seatIndex", 400, origin);
		}

		let record = await this.getRecord("state", STATE_TTL);
		if (
			longPoll && !Number.isNaN(sinceVersion) &&
			(!record || record.version <= sinceVersion)
		) {
			await createWaiter(this.stateWaiters, LONG_POLL_MAX_WAIT);
			record = await this.getRecord("state", STATE_TTL);
		}
		if (!record) {
			return textResponse("Not found", 404, origin);
		}

		const payload = createSeatSyncPayload(record, seatIndex);
		if (!payload) {
			return textResponse("Seat not found", 404, origin);
		}
		if (!Number.isNaN(sinceVersion) && record.version <= sinceVersion) {
			return emptyResponse(origin);
		}
		return jsonResponse(payload, origin);
	}

	async handlePostAction(request, origin) {
		let data;
		try {
			data = await request.json();
		} catch {
			return textResponse("Invalid JSON", 400, origin);
		}

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

		await this.ctx.storage.put("action", {
			seatIndex,
			turnToken,
			action,
			amount,
			createdAt: new Date().toISOString(),
			storedAtMs: Date.now(),
		});
		notifyAll(this.actionWaiters);
		return jsonResponse({ ok: true }, origin);
	}

	async handleGetAction(url, origin) {
		const turnToken = url.searchParams.get("turnToken")?.trim() || "";
		const longPoll = url.searchParams.get("wait") === "1";
		if (!turnToken) {
			return textResponse("Missing turnToken", 400, origin);
		}

		let record = await this.getRecord("action", ACTION_TTL);
		if (longPoll && !record) {
			await createWaiter(this.actionWaiters, LONG_POLL_MAX_WAIT);
			record = await this.getRecord("action", ACTION_TTL);
		}
		if (!record) {
			return emptyResponse(origin);
		}
		await this.ctx.storage.delete("action");
		if (record.turnToken !== turnToken) {
			return emptyResponse(origin);
		}
		const { storedAtMs: _storedAtMs, ...payload } = record;
		return jsonResponse(payload, origin);
	}
}

async function routeRequest(request, env) {
	const url = new URL(request.url);
	if (url.pathname !== "/state" && url.pathname !== "/action") {
		return textResponse("Not found", 404, request.headers.get("origin"));
	}

	const origin = request.headers.get("origin");
	if (origin !== null && !allowedOrigins.has(origin)) {
		return textResponse("Forbidden", 403, origin);
	}

	if (request.method === "OPTIONS") {
		return emptyResponse(origin);
	}

	// The table id comes from the query on GETs and from the body on POSTs; the request
	// is forwarded to that table's Durable Object with the body re-serialized.
	let tableId = url.searchParams.get("tableId");
	let forwardBody = null;
	if (request.method === "POST") {
		let data;
		try {
			data = await request.json();
		} catch {
			return textResponse("Invalid JSON", 400, origin);
		}
		tableId = data?.tableId || tableId;
		forwardBody = JSON.stringify(data);
	}
	tableId = tableId || "default";

	const stub = env.POKER_TABLE.get(env.POKER_TABLE.idFromName(tableId));
	return stub.fetch(new Request(url.toString(), {
		method: request.method,
		headers: request.headers,
		body: forwardBody,
	}));
}

export default {
	async fetch(request, env) {
		try {
			return await routeRequest(request, env);
		} catch (error) {
			console.error("Unexpected error", error);
			return textResponse("Internal error", 500, request.headers.get("origin"));
		}
	},
};
