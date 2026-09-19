/* ==================================================================================================
MODULE BOUNDARY: Background-Resistant Timers
================================================================================================== */

// CURRENT STATE: Swaps the host page's global timers for Web Worker driven ones.
// TARGET STATE: Stay a tiny drop-in that keeps the game engine running in background tabs.
// PUT HERE: Only timer plumbing.
// DO NOT PUT HERE: Game logic or anything aware of poker state.

// Browsers throttle setTimeout/setInterval in background tabs down to about once per
// minute, which suspends the host's whole game engine whenever the shared-table tab is
// not in front: bots stop acting and state sync stalls until someone looks at the tab.
// Worker threads are not throttled, so the host routes its timers through a worker -
// the worker keeps exact time and pings back, and message events still fire normally
// in hidden tabs.
export function installBackgroundResistantTimers() {
	if (
		typeof Worker === "undefined" || typeof URL === "undefined" ||
		typeof Blob === "undefined"
	) {
		return;
	}

	let worker = null;
	try {
		const workerSource = `
	const timers = new Map();
	onmessage = (event) => {
		const { type, id, delay } = event.data;
		if (type === "set") {
			timers.set(id, setTimeout(() => {
				timers.delete(id);
				postMessage(id);
			}, delay));
			return;
		}
		const handle = timers.get(id);
		if (handle !== undefined) {
			clearTimeout(handle);
			timers.delete(id);
		}
	};
`;
		worker = new Worker(
			URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" })),
		);
	} catch {
		return; // keep the native timers
	}

	const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
	const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
	const nativeSetInterval = globalThis.setInterval.bind(globalThis);
	const nativeClearInterval = globalThis.clearInterval.bind(globalThis);
	const pendingTimeouts = new Map();
	const intervals = new Map();
	// Start far above any plausible native timer id, so ids handed out here never
	// collide with timers created before the install, and unknown ids fall through
	// to the native clear functions.
	let nextId = 2 ** 31;

	worker.onmessage = (event) => {
		const entry = pendingTimeouts.get(event.data);
		if (!entry) {
			return;
		}
		pendingTimeouts.delete(event.data);
		entry.callback(...entry.args);
	};

	globalThis.setTimeout = (callback, delay = 0, ...args) => {
		if (typeof callback !== "function") {
			return nativeSetTimeout(callback, delay, ...args);
		}
		const id = nextId++;
		pendingTimeouts.set(id, { callback, args });
		worker.postMessage({
			type: "set",
			id,
			delay: Math.max(0, Number(delay) || 0),
		});
		return id;
	};

	globalThis.clearTimeout = (id) => {
		if (pendingTimeouts.has(id)) {
			pendingTimeouts.delete(id);
			worker.postMessage({ type: "clear", id });
			return;
		}
		nativeClearTimeout(id);
	};

	globalThis.setInterval = (callback, delay = 0, ...args) => {
		if (typeof callback !== "function") {
			return nativeSetInterval(callback, delay, ...args);
		}
		const id = nextId++;
		const state = { cancelled: false, timeoutId: 0 };
		const tick = () => {
			if (state.cancelled) {
				return;
			}
			state.timeoutId = globalThis.setTimeout(tick, delay);
			callback(...args);
		};
		state.timeoutId = globalThis.setTimeout(tick, delay);
		intervals.set(id, state);
		return id;
	};

	globalThis.clearInterval = (id) => {
		const state = intervals.get(id);
		if (state) {
			state.cancelled = true;
			globalThis.clearTimeout(state.timeoutId);
			intervals.delete(id);
			return;
		}
		nativeClearInterval(id);
	};
}
