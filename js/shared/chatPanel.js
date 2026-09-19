/* ==================================================================================================
MODULE BOUNDARY: Table Chat Panel
================================================================================================== */

// CURRENT STATE: Renders the bottom-left chat panel and posts messages to the sync server.
// TARGET STATE: Stay a small shared widget; chat delivery rides along with state traffic.
// PUT HERE: Chat DOM handling and message posting only.
// DO NOT PUT HERE: Polling loops or game logic.

const MAX_RENDERED_MESSAGES = 60;

export function createChatPanel({ chatEndpoint, tableId, getSenderName }) {
	const panel = document.getElementById("chat-panel");
	const messagesEl = document.getElementById("chat-messages");
	const form = document.getElementById("chat-form");
	const input = document.getElementById("chat-input");
	let lastSeq = 0;
	let expanded = false;
	let logOpen = false;
	// The close control exists only for the expanded (mobile fullscreen) mode.
	const closeButton = document.createElement("button");
	closeButton.type = "button";
	closeButton.className = "chat-close hidden";
	closeButton.textContent = "닫기 ✕";
	panel?.prepend(closeButton);

	function setExpanded(next) {
		expanded = next === true;
		panel?.classList.toggle("expanded", expanded);
		closeButton.classList.toggle("hidden", !expanded);
		scrollToLatest();
		if (expanded) {
			input?.focus();
		} else {
			input?.blur();
		}
	}

	function scrollToLatest() {
		if (messagesEl) {
			messagesEl.scrollTop = messagesEl.scrollHeight;
		}
	}

	// The log stays collapsed to just the input bar until the input is tapped;
	// tapping anywhere outside the panel collapses it again.
	function setLogOpen(next) {
		logOpen = next === true;
		panel?.classList.toggle("log-open", logOpen);
		if (logOpen) {
			scrollToLatest();
		}
	}

	function setVisible(visible) {
		const wasHidden = panel?.classList.contains("hidden");
		panel?.classList.toggle("hidden", !visible);
		// Scrolls applied while the panel was display:none are no-ops, so redo on reveal.
		if (visible && wasHidden) {
			requestAnimationFrame(scrollToLatest);
		}
	}

	// Applies a chat tail from any sync response; already-seen ids are skipped.
	function applyChat(chat) {
		if (!chat || !messagesEl) {
			return;
		}
		(chat.messages ?? []).forEach((message) => {
			if (!message || message.id <= lastSeq) {
				return;
			}
			const line = document.createElement("div");
			line.className = "chat-line";
			const nameEl = document.createElement("strong");
			nameEl.textContent = message.name;
			line.appendChild(nameEl);
			line.appendChild(document.createTextNode(message.text));
			messagesEl.appendChild(line);
			lastSeq = Math.max(lastSeq, message.id);
		});
		if (typeof chat.seq === "number") {
			lastSeq = Math.max(lastSeq, chat.seq);
		}
		while (messagesEl.children.length > MAX_RENDERED_MESSAGES) {
			messagesEl.removeChild(messagesEl.firstChild);
		}
		scrollToLatest();
	}

	async function sendMessage(text) {
		const name = getSenderName();
		if (!name || !text || !tableId) {
			return;
		}
		try {
			await fetch(chatEndpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tableId, name, text }),
			});
		} catch (error) {
			console.warn("chat send failed", error);
		}
	}

	function init() {
		form?.addEventListener("submit", (event) => {
			event.preventDefault();
			const text = input.value.trim();
			if (!text) {
				return;
			}
			input.value = "";
			sendMessage(text);
		});
		// Typing in chat must not trigger table shortcuts.
		input?.addEventListener("keydown", (event) => event.stopPropagation());
		input?.addEventListener("focus", () => {
			if (!expanded) {
				setLogOpen(true);
			}
		});
		// Tapping the table ("the ground") closes the log and the fullscreen view.
		document.addEventListener("pointerdown", (event) => {
			if (panel?.contains(event.target)) {
				return;
			}
			setLogOpen(false);
			if (expanded) {
				setExpanded(false);
			}
		});
		// On phones, tapping the compact panel opens a large front-and-center chat view.
		panel?.addEventListener("click", (event) => {
			if (expanded || !globalThis.matchMedia("(max-width: 900px)").matches) {
				return;
			}
			if (event.target === input || event.target.closest(".chat-form button")) {
				return;
			}
			setExpanded(true);
		});
		closeButton.addEventListener("click", (event) => {
			event.stopPropagation();
			setExpanded(false);
		});
	}

	return {
		init,
		applyChat,
		setVisible,
		get lastSeq() {
			return lastSeq;
		},
	};
}
