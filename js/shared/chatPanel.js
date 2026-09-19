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

	function setVisible(visible) {
		panel?.classList.toggle("hidden", !visible);
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
		messagesEl.scrollTop = messagesEl.scrollHeight;
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
