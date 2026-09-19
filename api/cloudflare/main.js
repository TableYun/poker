// Cloudflare Workers entry point for the poker sync backend.
// Same HTTP contract as api/main.js (Deno): GET/POST /state, GET/POST /action. Each
// table lives in its own Durable Object, so state is strongly consistent. Requests are
// answered immediately; clients poll every couple of seconds (see handleGetState for
// why server-side long polling was removed).

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

export class PokerTable {
	constructor(ctx) {
		this.ctx = ctx;
	}

	async getRecord(key, ttl) {
		const record = await this.ctx.storage.get(key) ?? null;
		if (record && Date.now() - (record.storedAtMs ?? 0) > ttl) {
			await this.ctx.storage.delete(key);
			return null;
		}
		return record;
	}

	async getChat() {
		return await this.ctx.storage.get("chat") ?? { seq: 0, messages: [] };
	}

	// Chat rides along with the existing state traffic: reads attach anything newer
	// than the caller's sinceChat, so no extra polling requests are needed.
	buildChatTail(chat, sinceChat) {
		return {
			seq: chat.seq,
			messages: chat.messages.filter((message) => message.id > sinceChat),
		};
	}

	async handlePostChat(request, origin) {
		let data;
		try {
			data = await request.json();
		} catch {
			return textResponse("Invalid JSON", 400, origin);
		}
		const name = typeof data?.name === "string" ? data.name.trim().slice(0, 20) : "";
		const text = typeof data?.text === "string" ? data.text.trim().slice(0, 200) : "";
		if (!name || !text) {
			return textResponse("Missing name or text", 400, origin);
		}
		const chat = await this.getChat();
		chat.seq += 1;
		chat.messages.push({ id: chat.seq, name, text, at: Date.now() });
		if (chat.messages.length > 50) {
			chat.messages.splice(0, chat.messages.length - 50);
		}
		await this.ctx.storage.put("chat", chat);
		return jsonResponse({ ok: true, seq: chat.seq }, origin);
	}

	async fetch(request) {
		const url = new URL(request.url);
		const origin = request.headers.get("origin");

		if (url.pathname === "/chat") {
			if (request.method === "POST") {
				return this.handlePostChat(request, origin);
			}
			return textResponse("Method not allowed", 405, origin);
		}
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
		const chat = await this.getChat();
		return jsonResponse({
			ok: true,
			version: record.version,
			updatedAt: record.updatedAt,
			schemaVersion: record.schemaVersion,
			chat: this.buildChatTail(chat, parseInteger(data?.sinceChat) ?? 0),
		}, origin);
	}

	async handleGetState(url, origin) {
		const seatIndex = parseInteger(url.searchParams.get("seatIndex"));
		const sinceParam = url.searchParams.get("sinceVersion");
		const sinceVersion = sinceParam ? Number.parseInt(sinceParam, 10) : 0;

		const sinceChat = parseInteger(url.searchParams.get("sinceChat")) ?? 0;

		if (seatIndex === null) {
			return textResponse("Missing seatIndex", 400, origin);
		}

		// Long polling (?wait=1) is deliberately NOT honored anymore: holding requests open
		// inside the Durable Object left instances in a broken "reset" state under real
		// traffic, which froze every table until eviction. Plain short polling is rock
		// solid and well within Cloudflare's free request budget, so the parameter is
		// accepted for compatibility and simply answered immediately.
		let record = await this.getRecord("state", STATE_TTL);
		if (!record) {
			return textResponse("Not found", 404, origin);
		}

		const payload = createSeatSyncPayload(record, seatIndex);
		if (!payload) {
			return textResponse("Seat not found", 404, origin);
		}
		const chat = await this.getChat();
		if (
			!Number.isNaN(sinceVersion) && record.version <= sinceVersion &&
			chat.seq <= sinceChat
		) {
			return emptyResponse(origin);
		}
		payload.chat = this.buildChatTail(chat, sinceChat);
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
		return jsonResponse({ ok: true }, origin);
	}

	async handleGetAction(url, origin) {
		const turnToken = url.searchParams.get("turnToken")?.trim() || "";
		if (!turnToken) {
			return textResponse("Missing turnToken", 400, origin);
		}

		// ?wait=1 is not honored here either - see handleGetState for why holding requests
		// open broke Durable Object instances. Immediate answers, clients poll.
		const record = await this.getRecord("action", ACTION_TTL);
		if (!record) {
			return emptyResponse(origin);
		}
		if (record.turnToken !== turnToken) {
			// A stale long-poll from an earlier turn must never eat a fresh action - leave
			// it for the poller holding the current token. A new action overwrites the
			// record anyway, and the TTL cleans up abandoned ones.
			return emptyResponse(origin);
		}
		await this.ctx.storage.delete("action");
		const { storedAtMs: _storedAtMs, ...payload } = record;
		return jsonResponse(payload, origin);
	}
}

async function routeRequest(request, env) {
	const url = new URL(request.url);
	if (url.pathname === "/" || url.pathname === "") {
		// Friendly status page for anyone opening the API host directly in a browser.
		return textResponse(
			"poker-sync OK - 포커 게임 동기화 서버입니다. 게임은 https://tableyun.github.io/poker 에서 플레이하세요.",
			200,
			request.headers.get("origin"),
		);
	}
	if (
		url.pathname !== "/state" && url.pathname !== "/action" &&
		url.pathname !== "/chat"
	) {
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
