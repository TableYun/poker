/* ==================================================================================================
MODULE BOUNDARY: Card Image Recovery
================================================================================================== */

// CURRENT STATE: Watches every card <img> on the page and retries failed loads.
// TARGET STATE: Stay a tiny, page-wide safety net for flaky mobile connections.
// PUT HERE: Only card-image load retry behavior.
// DO NOT PUT HERE: Rendering logic or anything that decides which card to show.

const MAX_RETRIES = 3;

// A dropped fetch on mobile data used to leave a card blank until the next hand. Failed
// card images now retry a few times with a cache-busting query and growing backoff.
export function initCardImageRecovery() {
	document.addEventListener("error", (event) => {
		const img = event.target;
		if (!(img instanceof HTMLImageElement)) {
			return;
		}
		const src = img.getAttribute("src") || "";
		if (!src.includes("cards/")) {
			return;
		}
		const retries = Number(img.dataset.cardRetries || "0");
		if (retries >= MAX_RETRIES) {
			return;
		}
		img.dataset.cardRetries = `${retries + 1}`;
		const baseSrc = src.split("?")[0];
		setTimeout(() => {
			// Only retry if the renderer hasn't already swapped the card in the meantime.
			if ((img.getAttribute("src") || "").split("?")[0] === baseSrc) {
				img.src = `${baseSrc}?retry=${Date.now()}`;
			}
		}, 400 * (retries + 1));
	}, true);

	document.addEventListener("load", (event) => {
		const img = event.target;
		if (img instanceof HTMLImageElement && img.dataset.cardRetries) {
			delete img.dataset.cardRetries;
		}
	}, true);
}
