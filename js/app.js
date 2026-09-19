/* ==================================================================================================
MODULE BOUNDARY: Main Table Runtime
================================================================================================== */

// CURRENT STATE: Coordinates browser-facing game flow, bots, sync, local persistence, timers,
// analytics, and DOM effects. Showdown resolution/commit state, hand-end/next-hand transition
// state, browserless hand/tournament runners, hand-start setup, turn-action resolution,
// betting-round start state, betting-round progress decisions, and street progression decisions
// are extracted; browser orchestration remains here.
// TARGET STATE: app.js should stay as the browser-facing orchestrator only. Pure poker rules and
// state transforms should live in gameEngine.js, while reusable UI, sync, and control primitives
// should live in shared/*.
// PUT HERE: Engine orchestration, notifications, timers, sync, local save/restore, analytics, bot
// playback, and flow-specific DOM wiring.
// DO NOT PUT HERE: Pure poker rules, reusable action math, sync schema helpers, or generic
// render-only helpers.
// PREFERENCE: Extend the existing modules before introducing new ones.

/* --------------------------------------------------------------------------------------------------
Imports
---------------------------------------------------------------------------------------------------*/

import {
	chooseBotAction,
	enqueueBotAction,
	normalizeBotActionRequest,
	setBotPlaybackFast,
} from "./bot.js";
import {
	advanceDealer,
	calculateWinProbabilities,
	createBettingRoundProgressState,
	createBettingRoundStartPlan,
	createHandContextState,
	createHandEndPlan,
	createNextHandTransitionPlan,
	createPlayerSpotState,
	createShowdownCommitPlan,
	dealCommunityCardsForPhase,
	dealHoleCardsForNewHand,
	getBettingRoundStartExit,
	getBlindLevelUpdateForHand,
	getBotRevealDecision,
	getCurrentPhase,
	getNextBettingRoundStep,
	getNextPhasePlan,
	getPlayerActionFollowUpEffects,
	getResolvedTurnContinuation,
	getVisibleSolvedHand,
	INITIAL_BIG_BLIND,
	INITIAL_DECK,
	INITIAL_SMALL_BLIND,
	isAllInRunout,
	postBlinds,
	recordPlayerActionStats,
	resolveShowdown,
	resolveTurnAction,
	shuffleArray,
} from "./gameEngine.js";
import QrCreator from "./qr-creator.js";
import {
	getActionButtonLabel,
	getPlayerActionState,
} from "./shared/actionModel.js";
import { createHumanTurnController } from "./shared/humanTurnController.js";
import { initSound, initSoundButton, playTurnChime } from "./shared/sound.js";
import {
	buildPublicPlayerView,
	buildSyncView,
} from "./shared/syncViewModel.js";
import {
	clearSeatActionVisualState,
	clearChipTransferAnimation,
	clearRenderedSeat,
	renderChipStacks,
	renderChipTransferAnimation,
	renderCommunityCards as renderTableCommunityCards,
	renderHostSeat,
	renderNotificationBar,
	renderSeatActiveState,
	renderSeatActiveStates,
	renderSeatResolvedAction,
	renderSeatRotation,
	renderSeatSetupState,
} from "./shared/tableViewRenderer.js";
import { initServiceWorker } from "./serviceWorkerRegistration.js";
import { initCardImageRecovery } from "./shared/cardImageRecovery.js";
import { installBackgroundResistantTimers } from "./shared/backgroundTimers.js";
import { APP_VERSION, VERSION_LOG } from "./version.js";

// The host tab runs the whole game engine on timers; install the worker-backed timers
// first so bots keep acting and state keeps syncing even when this tab is not in front.
installBackgroundResistantTimers();

/* --------------------------------------------------------------------------------------------------
Configuration And DOM References
---------------------------------------------------------------------------------------------------*/

const startButton = document.querySelector("#start-button");
const newRoundControls = document.querySelector("#new-round-controls");
const startButtonLabel = document.querySelector("#start-button-label");
const newRoundCountdown = document.querySelector("#new-round-countdown");
const newRoundCountdownValue = document.querySelector(
	"#new-round-countdown-value",
);
const newRoundCancelButton = document.querySelector("#new-round-cancel-button");
const instructionsButton = document.querySelector("#instructions-button");
const blindUpControl = document.querySelector("#blind-up-control");
const blindUpCheckbox = document.querySelector("#blind-up-checkbox");
const rotateIcons = document.querySelectorAll(".seat .rotate");
const closeButtons = document.querySelectorAll(".close");
const rebuyButtons = document.querySelectorAll(".rebuy");
const awayButtons = document.querySelectorAll(".away");
const addBotButtons = document.querySelectorAll(".add-bot");
const tableMainEl = document.querySelector("main");
const notification = document.querySelector("#notification");
const foldButton = document.querySelector("#fold-button");
const actionButton = document.querySelector("#action-button");
const amountControls = document.querySelector("#amount-controls");
const amountDecrementButton = document.querySelector(
	"#amount-decrement-button",
);
const statsButton = document.querySelector("#stats-button");
const logButton = document.querySelector("#log-button");
const fastForwardButton = document.querySelector("#fast-forward-button");
const potEl = document.getElementById("pot");
const communityCardSlots = document.querySelectorAll(
	"#community-cards .cardslot",
);
const tableRenderTarget = {
	potEl,
	chipTransferTimer: null,
	activeChipTransferId: null,
	activeChipTransferState: null,
};
const overlayBackdrop = document.querySelector("#overlay-backdrop");
const resumeGameOverlay = document.querySelector("#resume-game-overlay");
const resumeContinueButton = document.querySelector("#resume-continue-button");
const resumeNewButton = document.querySelector("#resume-new-button");
const statsOverlay = document.querySelector("#stats-overlay");
const statsCloseButton = document.querySelector("#stats-close-button");
const statsTableBody = document.querySelector("#stats-table-body");
const logOverlay = document.querySelector("#log-overlay");
const logCloseButton = document.querySelector("#log-close-button");
const versionButton = document.querySelector("#version-button");
const soundButton = document.querySelector("#sound-button");
const roundDelayInput = document.querySelector("#round-delay-input");
const versionOverlay = document.querySelector("#version-overlay");
const versionCloseButton = document.querySelector("#version-close-button");
const versionList = document.querySelector("#version-list");
const instructionsOverlay = document.querySelector("#instructions-overlay");
const instructionsCloseButton = document.querySelector(
	"#instructions-close-button",
);
const logList = document.querySelector("#log-list");
const amountSlider = document.querySelector("#amount-slider");
const amountIncrementButton = document.querySelector(
	"#amount-increment-button",
);
const sliderOutput = document.querySelector("output");
const seatRefs = Array.from(document.querySelectorAll(".seat")).map((
	seatEl,
	seatSlot,
) => ({
	seatSlot,
	seatEl,
	nameEl: seatEl.querySelector("h3"),
	totalEl: seatEl.querySelector(".chips .total"),
	betEl: seatEl.querySelector(".chips .bet"),
	stackChipEls: seatEl.querySelectorAll(".stack-visual img"),
	dealerEl: seatEl.querySelector(".dealer"),
	smallBlindEl: seatEl.querySelector(".small-blind"),
	bigBlindEl: seatEl.querySelector(".big-blind"),
	rotateEl: seatEl.querySelector(".rotate"),
	closeEl: seatEl.querySelector(".close"),
	rebuyEl: seatEl.querySelector(".rebuy"),
	awayEl: seatEl.querySelector(".away"),
	addBotEl: seatEl.querySelector(".add-bot"),
	winProbabilityEl: seatEl.querySelector(".win-probability"),
	handStrengthEl: seatEl.querySelector(".hand-strength"),
	outsEl: seatEl.querySelector(".outs"),
	cardEls: seatEl.querySelectorAll(".card"),
	qrContainer: seatEl.querySelector(".qr"),
	qrLink: seatEl.querySelector(".qr-link"),
	remoteLink: seatEl.querySelector(".remote-table-link"),
	winnerReactionEl: seatEl.querySelector(".winner-reaction"),
	winnerReactionTimer: null,
	actionLabelTimer: null,
	playerSeatIndex: null,
	clearActionLabelState: null,
	clearWinnerReactionState: null,
}));
const overlays = {
	stats: {
		el: statsOverlay,
		beforeOpen: () => renderStatsOverlay(),
	},
	resume: {
		el: resumeGameOverlay,
		blocking: true,
	},
	log: {
		el: logOverlay,
		canOpen: () => !!logList && logList.childElementCount > 0,
	},
	version: {
		el: versionOverlay,
		beforeOpen: () => renderVersionOverlay(),
	},
	instructions: {
		el: instructionsOverlay,
	},
};

/* --------------------------------------------------------------------------------------------------
Runtime Flags And Mutable UI State
---------------------------------------------------------------------------------------------------*/

const MAX_ITEMS = 8;
const notifArr = [];
const pendingNotif = [];
let isNotifProcessing = false;
let notifTimer = null;
const DEFAULT_NOTIF_INTERVAL = 375;
let NOTIF_INTERVAL = DEFAULT_NOTIF_INTERVAL;
const FAST_FORWARD_NOTIF_INTERVAL = 0;
const DEFAULT_ACTION_LABEL_DURATION = 1500;
let ACTION_LABEL_DURATION = DEFAULT_ACTION_LABEL_DURATION;
const FAST_FORWARD_ACTION_LABEL_DURATION = 180;
const DEFAULT_RUNOUT_PHASE_DELAY = 1500;
let RUNOUT_PHASE_DELAY = DEFAULT_RUNOUT_PHASE_DELAY;
const FAST_FORWARD_RUNOUT_PHASE_DELAY = 320;
const FAST_FORWARD_CHIP_TRANSFER_DURATION = 160;
const FAST_FORWARD_CHIP_TRANSFER_STEPS = 8;
const DEFAULT_CHIP_TRANSFER_STEPS = 30;
const WINNER_REACTION_DURATION = 1000;
const DEFAULT_NEW_ROUND_COUNTDOWN_SECONDS = 5;
const MIN_NEW_ROUND_COUNTDOWN_SECONDS = 3;
const MAX_NEW_ROUND_COUNTDOWN_SECONDS = 60;
const NEW_ROUND_COUNTDOWN_STORAGE_KEY = "poker:new-round-countdown-seconds";
let NEW_ROUND_COUNTDOWN_SECONDS = DEFAULT_NEW_ROUND_COUNTDOWN_SECONDS;
const BLIND_UP_STORAGE_KEY = "poker:blind-up-enabled";
let blindUpEnabled = true;
const NEW_ROUND_COUNTDOWN_INTERVAL = 1000;
const SAVED_GAME_SCHEMA_VERSION = 1;
const SAVED_GAME_STORAGE_KEY = "poker:saved-game:v1";

const HISTORY_LOG = false; // Set to true to enable history logging in the console
let DEBUG_FLOW = false; // Set to true for verbose game-flow logging
const CHIP_UNIT = 10;
const STARTING_STACK = 2000;

const speedModeParam = new URLSearchParams(globalThis.location.search).get(
	"speedmode",
);
const SPEED_MODE = speedModeParam !== null && speedModeParam !== "0" &&
	speedModeParam !== "false";
if (SPEED_MODE) {
	NOTIF_INTERVAL = 0;
	ACTION_LABEL_DURATION = 0;
	RUNOUT_PHASE_DELAY = 0;
	DEBUG_FLOW = true;
}

const STATE_SYNC_ENDPOINT = "https://poker-sync.tableyun.workers.dev/state";
const ACTION_SYNC_ENDPOINT = "https://poker-sync.tableyun.workers.dev/action";
let tableId = null;
const STATE_SYNC_DELAY = 750;
const ACTION_POLL_INTERVAL = 1000;
let stateSyncTimer = null;
let stateSyncTimerDelay = null;
let runoutPhaseTimer = null;
let chipTransferFinishTimer = null;
let newRoundCountdownTimer = null;
let newRoundCountdownSeconds = 0;
let summaryButtonsVisible = false;
let handFastForwardActive = false;
let autoplayToGameEnd = false;
let nextChipTransferId = 1;
let pendingSavedGameSnapshot = null;
let currentFlowState = { type: "setup" };
let currentGameSaveEligible = false;

// --- Analytics --------------------------------------------------------------
let totalHands = 0;
let hadHumansAtStart = false;
let exitEventSent = false;

/* --------------------------------------------------------------------------------------------------
Game Constants And Game State
---------------------------------------------------------------------------------------------------*/

const WINNER_REACTION_EMOJIS = {
	reveal: ["😉", "😜", "🤭"],
	uncontested: ["😎", "😏", "😌"],
	split: ["🤝"],
	lucky: ["🥹", "😆", "😮‍💨"],
	comeback: ["💪", "😅"],
	monsterHand: ["🤩", "🥳"],
	strongHand: ["😁", "😄", "😬"],
	bigPot: ["🤑"],
	fallback: ["🙂", "😊"],
};
const WINNER_REACTION_MONSTER_HANDS = new Set([
	"Full House",
	"Four of a Kind",
	"Straight Flush",
]);
const WINNER_REACTION_STRONG_HANDS = new Set(["Straight", "Flush"]);
const WINNER_REACTION_LUCKY_MIN_GAP = 15;
const CARD_SUIT_SYMBOLS = {
	C: "♣",
	D: "♦",
	H: "♥",
	S: "♠",
};
// Display-only Korean labels for the raw hand names pokersolver returns (e.g. via showdown potResults).
// Internal comparisons (WINNER_REACTION_*_HANDS) key off the original English names, not this map.
const HAND_NAME_KO = {
	"Royal Flush": "로열 플러시",
	"Straight Flush": "스트레이트 플러시",
	"Four of a Kind": "포카드",
	"Full House": "풀하우스",
	Flush: "플러시",
	Straight: "스트레이트",
	"Three of a Kind": "트리플",
	"Two Pair": "투페어",
	Pair: "원페어",
	"High Card": "하이카드",
};

function translateHandName(name) {
	return HAND_NAME_KO[name] ?? name;
}

// Common American first names, transliterated to Korean, used for auto-filled bot seats.
const BOT_NAME_POOL = [
	"존",
	"마이크",
	"제임스",
	"에밀리",
	"사라",
	"케빈",
	"제니퍼",
	"데이비드",
	"애슐리",
	"크리스",
	"제시카",
	"브라이언",
	"엠마",
	"라이언",
	"올리비아",
	"매튜",
	"소피아",
	"조쉬",
	"한나",
	"타일러",
	"메건",
	"앤드류",
	"니콜",
	"브랜든",
];

const gameState = {
	currentPhaseIndex: 0,
	currentBet: 0,
	pot: 0,
	activeSeatIndex: null,
	handId: 0,
	nextDecisionId: 1,
	blindLevel: 0,
	gameStarted: false,
	gameFinished: false,
	openCardsMode: false,
	spectatorMode: false,
	raisesThisRound: 0,
	handInProgress: false,
	deck: INITIAL_DECK.slice(),
	cardGraveyard: [],
	communityCards: [],
	players: [],
	allPlayers: [],
	chipTransfer: null,
	pendingAction: null,
	smallBlind: INITIAL_SMALL_BLIND,
	bigBlind: INITIAL_BIG_BLIND,
	lastRaise: INITIAL_BIG_BLIND,
	handContext: createHandContextState(),
};

gameState.toJSON = function () {
	return {
		currentPhaseIndex: this.currentPhaseIndex,
		currentBet: this.currentBet,
		pot: this.pot,
		lastRaise: this.lastRaise,
		smallBlind: this.smallBlind,
		bigBlind: this.bigBlind,
		raisesThisRound: this.raisesThisRound,
		blindLevel: this.blindLevel,
		handContext: this.handContext ? { ...this.handContext } : null,
		communityCards: this.communityCards.slice(),
		pendingAction: this.pendingAction ? { ...this.pendingAction } : null,
		players: this.players,
		timestamp: Date.now(),
	};
};

/* --------------------------------------------------------------------------------------------------
Saved Game Persistence
---------------------------------------------------------------------------------------------------*/

function getLocalStorage() {
	try {
		return globalThis.localStorage ?? null;
	} catch (error) {
		console.warn("saved game storage unavailable", error);
		return null;
	}
}

function clampNewRoundCountdownSeconds(seconds) {
	return Math.min(
		MAX_NEW_ROUND_COUNTDOWN_SECONDS,
		Math.max(MIN_NEW_ROUND_COUNTDOWN_SECONDS, seconds),
	);
}

function loadNewRoundCountdownSeconds() {
	const storage = getLocalStorage();
	if (!storage) {
		return DEFAULT_NEW_ROUND_COUNTDOWN_SECONDS;
	}
	try {
		const stored = Number.parseInt(
			storage.getItem(NEW_ROUND_COUNTDOWN_STORAGE_KEY),
			10,
		);
		if (Number.isFinite(stored)) {
			return clampNewRoundCountdownSeconds(stored);
		}
	} catch (error) {
		console.warn("round delay storage read failed", error);
	}
	return DEFAULT_NEW_ROUND_COUNTDOWN_SECONDS;
}

function saveNewRoundCountdownSeconds(seconds) {
	const storage = getLocalStorage();
	if (!storage) {
		return;
	}
	try {
		storage.setItem(NEW_ROUND_COUNTDOWN_STORAGE_KEY, String(seconds));
	} catch (error) {
		console.warn("round delay storage write failed", error);
	}
}

function loadBlindUpEnabled() {
	const storage = getLocalStorage();
	if (!storage) {
		return true;
	}
	try {
		const stored = storage.getItem(BLIND_UP_STORAGE_KEY);
		return stored === null ? true : stored === "true";
	} catch (error) {
		console.warn("blind-up storage read failed", error);
		return true;
	}
}

function saveBlindUpEnabled(enabled) {
	const storage = getLocalStorage();
	if (!storage) {
		return;
	}
	try {
		storage.setItem(BLIND_UP_STORAGE_KEY, enabled ? "true" : "false");
	} catch (error) {
		console.warn("blind-up storage write failed", error);
	}
}

function initBlindUpControl() {
	blindUpEnabled = loadBlindUpEnabled();
	if (!blindUpCheckbox) {
		return;
	}
	blindUpCheckbox.checked = blindUpEnabled;
	blindUpCheckbox.addEventListener("change", () => {
		blindUpEnabled = blindUpCheckbox.checked;
		saveBlindUpEnabled(blindUpEnabled);
	}, false);
}

function initRoundDelayInput() {
	NEW_ROUND_COUNTDOWN_SECONDS = loadNewRoundCountdownSeconds();
	if (newRoundCountdownValue) {
		newRoundCountdownValue.textContent = String(NEW_ROUND_COUNTDOWN_SECONDS);
	}
	if (!roundDelayInput) {
		return;
	}
	roundDelayInput.value = String(NEW_ROUND_COUNTDOWN_SECONDS);
	roundDelayInput.addEventListener("change", () => {
		const parsed = Number.parseInt(roundDelayInput.value, 10);
		const next = clampNewRoundCountdownSeconds(
			Number.isFinite(parsed) ? parsed : DEFAULT_NEW_ROUND_COUNTDOWN_SECONDS,
		);
		NEW_ROUND_COUNTDOWN_SECONDS = next;
		roundDelayInput.value = String(next);
		saveNewRoundCountdownSeconds(next);
	}, false);
}

function clonePlainValue(value, fallback = null) {
	if (value === undefined) {
		return fallback;
	}
	try {
		return JSON.parse(JSON.stringify(value));
	} catch (error) {
		console.warn("saved game clone failed", error);
		return fallback;
	}
}

function normalizeNumber(value, fallback) {
	return Number.isFinite(value) ? value : fallback;
}

function createStatsSnapshot(stats = {}) {
	return {
		hands: normalizeNumber(stats.hands, 0),
		handsWon: normalizeNumber(stats.handsWon, 0),
		vpip: normalizeNumber(stats.vpip, 0),
		pfr: normalizeNumber(stats.pfr, 0),
		calls: normalizeNumber(stats.calls, 0),
		aggressiveActs: normalizeNumber(stats.aggressiveActs, 0),
		reveals: normalizeNumber(stats.reveals, 0),
		showdowns: normalizeNumber(stats.showdowns, 0),
		showdownsWon: normalizeNumber(stats.showdownsWon, 0),
		folds: normalizeNumber(stats.folds, 0),
		foldsPreflop: normalizeNumber(stats.foldsPreflop, 0),
		foldsPostflop: normalizeNumber(stats.foldsPostflop, 0),
		allins: normalizeNumber(stats.allins, 0),
	};
}

function createBotLineSnapshot(botLine = {}) {
	return {
		preflopAggressor: botLine.preflopAggressor === true,
		cbetIntent: botLine.cbetIntent ?? null,
		barrelIntent: botLine.barrelIntent ?? null,
		cbetMade: botLine.cbetMade === true,
		barrelMade: botLine.barrelMade === true,
		nonValueAggressionMade: botLine.nonValueAggressionMade === true,
		checkRaiseIntent: clonePlainValue(botLine.checkRaiseIntent, null),
		passiveValueCheckIntent: clonePlainValue(
			botLine.passiveValueCheckIntent,
			null,
		),
	};
}

function createPlayerSnapshot(player) {
	return {
		name: player.name,
		isBot: player.isBot === true,
		seatSlot: player.seatSlot,
		winnerReactionEmoji: player.winnerReactionEmoji || "",
		winnerReactionUntil: normalizeNumber(player.winnerReactionUntil, 0),
		isWinner: player.isWinner === true,
		actionState: player.actionState ? { ...player.actionState } : null,
		winProbability: typeof player.winProbability === "number"
			? player.winProbability
			: null,
		lastNonFinalWinProbability:
			typeof player.lastNonFinalWinProbability === "number"
				? player.lastNonFinalWinProbability
				: null,
		seatIndex: player.seatIndex,
		holeCards: Array.isArray(player.holeCards)
			? player.holeCards.slice(0, 2)
			: [null, null],
		visibleHoleCards: Array.isArray(player.visibleHoleCards)
			? player.visibleHoleCards.slice(0, 2)
			: [false, false],
		dealer: player.dealer === true,
		smallBlind: player.smallBlind === true,
		bigBlind: player.bigBlind === true,
		folded: player.folded === true,
		away: player.away === true,
		pendingRemoval: player.pendingRemoval === true,
		chips: normalizeNumber(player.chips, 0),
		allIn: player.allIn === true,
		totalBet: normalizeNumber(player.totalBet, 0),
		roundBet: normalizeNumber(player.roundBet, 0),
		stats: createStatsSnapshot(player.stats),
		botLine: createBotLineSnapshot(player.botLine),
		spotState: {
			...createPlayerSpotState(),
			...clonePlainValue(player.spotState, {}),
		},
	};
}

function createGameStateSnapshot() {
	return {
		currentPhaseIndex: gameState.currentPhaseIndex,
		currentBet: gameState.currentBet,
		pot: gameState.pot,
		activeSeatIndex: gameState.activeSeatIndex,
		handId: gameState.handId,
		nextDecisionId: gameState.nextDecisionId,
		blindLevel: gameState.blindLevel,
		gameStarted: gameState.gameStarted,
		gameFinished: gameState.gameFinished,
		openCardsMode: gameState.openCardsMode,
		spectatorMode: gameState.spectatorMode,
		raisesThisRound: gameState.raisesThisRound,
		handInProgress: gameState.handInProgress,
		deck: gameState.deck.slice(),
		cardGraveyard: gameState.cardGraveyard.slice(),
		communityCards: gameState.communityCards.slice(),
		activeSeatIndexes: gameState.players.map((player) => player.seatIndex),
		players: gameState.players.map(createPlayerSnapshot),
		allPlayers: gameState.allPlayers.map(createPlayerSnapshot),
		chipTransfer: clonePlainValue(gameState.chipTransfer, null),
		pendingAction: gameState.pendingAction ? { ...gameState.pendingAction } : null,
		smallBlind: gameState.smallBlind,
		bigBlind: gameState.bigBlind,
		lastRaise: gameState.lastRaise,
		handContext: clonePlainValue(gameState.handContext, createHandContextState()),
	};
}

function getLogEntriesSnapshot() {
	if (!logList) {
		return [];
	}
	return Array.from(logList.children).map((entry) => entry.textContent || "");
}

function hasExactlyOneHumanPlayer(players = []) {
	return Array.isArray(players) &&
		players.filter((player) => player?.isBot !== true).length === 1;
}

function createSavedGameSnapshot() {
	return {
		schemaVersion: SAVED_GAME_SCHEMA_VERSION,
		savedAt: Date.now(),
		appVersion: APP_VERSION,
		tableId,
		runtimeState: {
			totalHands,
			hadHumansAtStart,
			currentGameSaveEligible,
			exitEventSent,
			summaryButtonsVisible,
			handFastForwardActive,
			autoplayToGameEnd,
			nextChipTransferId,
			notifications: notifArr.slice(),
			pendingNotifications: pendingNotif.slice(),
			logEntries: getLogEntriesSnapshot(),
		},
		flowState: clonePlainValue(currentFlowState, { type: "unknown" }),
		gameState: createGameStateSnapshot(),
	};
}

function shouldSaveCurrentGame() {
	return !SPEED_MODE &&
		currentGameSaveEligible === true &&
		gameState.gameStarted === true &&
		gameState.gameFinished !== true &&
		hasExactlyOneHumanPlayer(gameState.players);
}

function shouldRemoveCurrentGameSave() {
	return currentGameSaveEligible === true &&
		gameState.gameStarted === true &&
		(
			gameState.gameFinished === true ||
			!hasExactlyOneHumanPlayer(gameState.players)
		);
}

function removeSavedGameSnapshot() {
	const storage = getLocalStorage();
	if (!storage) {
		return;
	}
	try {
		storage.removeItem(SAVED_GAME_STORAGE_KEY);
	} catch (error) {
		console.warn("saved game remove failed", error);
	}
}

function saveCurrentGameSnapshot() {
	if (!shouldSaveCurrentGame()) {
		if (shouldRemoveCurrentGameSave()) {
			removeSavedGameSnapshot();
		}
		return;
	}

	const storage = getLocalStorage();
	if (!storage) {
		return;
	}

	try {
		storage.setItem(
			SAVED_GAME_STORAGE_KEY,
			JSON.stringify(createSavedGameSnapshot()),
		);
	} catch (error) {
		console.warn("saved game write failed", error);
	}
}

function isValidSavedGameSnapshot(snapshot) {
	return snapshot?.schemaVersion === SAVED_GAME_SCHEMA_VERSION &&
		snapshot?.gameState?.gameStarted === true &&
		snapshot?.gameState?.gameFinished !== true &&
		Array.isArray(snapshot.gameState.allPlayers) &&
		Array.isArray(snapshot.gameState.players) &&
		hasExactlyOneHumanPlayer(snapshot.gameState.players) &&
		snapshot.flowState &&
		typeof snapshot.flowState.type === "string";
}

function readSavedGameSnapshot() {
	if (SPEED_MODE) {
		return null;
	}

	const storage = getLocalStorage();
	if (!storage) {
		return null;
	}

	try {
		const rawSnapshot = storage.getItem(SAVED_GAME_STORAGE_KEY);
		if (!rawSnapshot) {
			return null;
		}
		const snapshot = JSON.parse(rawSnapshot);
		if (isValidSavedGameSnapshot(snapshot)) {
			return snapshot;
		}
		storage.removeItem(SAVED_GAME_STORAGE_KEY);
	} catch (error) {
		console.warn("saved game read failed", error);
		removeSavedGameSnapshot();
	}
	return null;
}

function setCurrentFlowState(flowState) {
	currentFlowState = clonePlainValue(flowState, { type: "unknown" });
}

function createActiveTurnFlowState(player, cycles, progressState) {
	return {
		type: "active-turn",
		phaseIndex: gameState.currentPhaseIndex,
		seatIndex: player.seatIndex,
		cycles,
		progressState: {
			nextIndex: progressState.nextIndex,
			cycles: progressState.cycles,
		},
	};
}

function normalizeSavedProgressState(progressState) {
	if (
		!progressState ||
		!Number.isFinite(progressState.nextIndex) ||
		!Number.isFinite(progressState.cycles)
	) {
		return null;
	}
	return {
		nextIndex: progressState.nextIndex,
		cycles: progressState.cycles,
	};
}

function normalizeSavedPlayer(player) {
	return {
		name: typeof player?.name === "string" ? player.name : "Player",
		isBot: player?.isBot === true,
		seatSlot: normalizeNumber(player?.seatSlot, normalizeNumber(player?.seatIndex, 0)),
		winnerReactionEmoji: typeof player?.winnerReactionEmoji === "string"
			? player.winnerReactionEmoji
			: "",
		winnerReactionUntil: normalizeNumber(player?.winnerReactionUntil, 0),
		isWinner: player?.isWinner === true,
		actionState: player?.actionState ? { ...player.actionState } : null,
		winProbability: typeof player?.winProbability === "number"
			? player.winProbability
			: null,
		lastNonFinalWinProbability:
			typeof player?.lastNonFinalWinProbability === "number"
				? player.lastNonFinalWinProbability
				: null,
		seatIndex: normalizeNumber(player?.seatIndex, 0),
		holeCards: Array.isArray(player?.holeCards)
			? player.holeCards.slice(0, 2)
			: [null, null],
		visibleHoleCards: Array.isArray(player?.visibleHoleCards)
			? player.visibleHoleCards.slice(0, 2)
			: [false, false],
		dealer: player?.dealer === true,
		smallBlind: player?.smallBlind === true,
		bigBlind: player?.bigBlind === true,
		folded: player?.folded === true,
		away: player?.away === true,
		pendingRemoval: player?.pendingRemoval === true,
		chips: normalizeNumber(player?.chips, 0),
		allIn: player?.allIn === true,
		totalBet: normalizeNumber(player?.totalBet, 0),
		roundBet: normalizeNumber(player?.roundBet, 0),
		stats: createStatsSnapshot(player?.stats),
		botLine: createBotLineSnapshot(player?.botLine),
		spotState: {
			...createPlayerSpotState(),
			...clonePlainValue(player?.spotState, {}),
		},
	};
}

function restoreRuntimeState(runtimeState = {}) {
	totalHands = normalizeNumber(runtimeState.totalHands, 0);
	hadHumansAtStart = runtimeState.hadHumansAtStart === true;
	currentGameSaveEligible = runtimeState.currentGameSaveEligible === true;
	exitEventSent = false;
	handFastForwardActive = runtimeState.handFastForwardActive === true;
	autoplayToGameEnd = runtimeState.autoplayToGameEnd === true;
	nextChipTransferId = normalizeNumber(runtimeState.nextChipTransferId, 1);

	notifArr.splice(
		0,
		notifArr.length,
		...(Array.isArray(runtimeState.notifications)
			? runtimeState.notifications.slice(0, MAX_ITEMS)
			: []),
	);
	pendingNotif.splice(
		0,
		pendingNotif.length,
		...(Array.isArray(runtimeState.pendingNotifications)
			? runtimeState.pendingNotifications
			: []),
	);

	if (logList) {
		logList.replaceChildren();
		const logEntries = Array.isArray(runtimeState.logEntries)
			? runtimeState.logEntries
			: notifArr;
		logEntries.forEach((message) => {
			const logEntry = document.createElement("div");
			logEntry.textContent = message;
			logList.appendChild(logEntry);
		});
	}

	renderNotificationBar(notification, notifArr);
	setSummaryButtonsVisible(runtimeState.summaryButtonsVisible === true);
}

function restoreGameState(savedGameState) {
	const allPlayers = savedGameState.allPlayers.map(normalizeSavedPlayer);
	const playerBySeatIndex = new Map(
		allPlayers.map((player) => [player.seatIndex, player]),
	);
	const activeSeatIndexes = Array.isArray(savedGameState.activeSeatIndexes)
		? savedGameState.activeSeatIndexes
		: savedGameState.players.map((player) => player.seatIndex);
	const activePlayers = activeSeatIndexes
		.map((seatIndex) => playerBySeatIndex.get(seatIndex))
		.filter((player) => player !== undefined);

	Object.assign(gameState, {
		currentPhaseIndex: normalizeNumber(savedGameState.currentPhaseIndex, 0),
		currentBet: normalizeNumber(savedGameState.currentBet, 0),
		pot: normalizeNumber(savedGameState.pot, 0),
		activeSeatIndex: savedGameState.activeSeatIndex ?? null,
		handId: normalizeNumber(savedGameState.handId, 0),
		nextDecisionId: normalizeNumber(savedGameState.nextDecisionId, 1),
		blindLevel: normalizeNumber(savedGameState.blindLevel, 0),
		gameStarted: savedGameState.gameStarted === true,
		gameFinished: savedGameState.gameFinished === true,
		openCardsMode: savedGameState.openCardsMode === true,
		spectatorMode: savedGameState.spectatorMode === true,
		raisesThisRound: normalizeNumber(savedGameState.raisesThisRound, 0),
		handInProgress: savedGameState.handInProgress === true,
		deck: Array.isArray(savedGameState.deck)
			? savedGameState.deck.slice()
			: INITIAL_DECK.slice(),
		cardGraveyard: Array.isArray(savedGameState.cardGraveyard)
			? savedGameState.cardGraveyard.slice()
			: [],
		communityCards: Array.isArray(savedGameState.communityCards)
			? savedGameState.communityCards.slice()
			: [],
		players: activePlayers,
		allPlayers,
		chipTransfer: clonePlainValue(savedGameState.chipTransfer, null),
		pendingAction: null,
		smallBlind: normalizeNumber(savedGameState.smallBlind, INITIAL_SMALL_BLIND),
		bigBlind: normalizeNumber(savedGameState.bigBlind, INITIAL_BIG_BLIND),
		lastRaise: normalizeNumber(savedGameState.lastRaise, INITIAL_BIG_BLIND),
		handContext: {
			...createHandContextState(),
			...clonePlainValue(savedGameState.handContext, {}),
		},
	});
}

function resetRuntimeBeforeRestore() {
	if (notifTimer) {
		clearTimeout(notifTimer);
		notifTimer = null;
	}
	if (stateSyncTimer !== null) {
		clearTimeout(stateSyncTimer);
		stateSyncTimer = null;
		stateSyncTimerDelay = null;
	}
	if (runoutPhaseTimer) {
		clearTimeout(runoutPhaseTimer);
		runoutPhaseTimer = null;
	}
	clearNewRoundCountdown({ notify: false });
	clearChipTransferFinishTimer();
	clearChipTransferAnimation(tableRenderTarget);
	humanTurnController.hide();
	isNotifProcessing = false;
}

function renderRestoredGameState() {
	seatRefs.forEach((seatRef) => {
		clearRenderedSeat(seatRef);
		seatRef.playerSeatIndex = null;
		seatRef.clearActionLabelState = null;
		seatRef.clearWinnerReactionState = null;
		renderSeatSetupState(seatRef, {
			visible: false,
			isBot: false,
			nameEditable: false,
			controlsVisible: false,
		});
	});

	gameState.players.forEach((player) => {
		bindSeatRefPlayer(player);
		renderSeatSetupState(getSeatRef(player), {
			visible: true,
			isBot: player.isBot,
			nameEditable: false,
			controlsVisible: false,
		});
		renderPlayerSeat(player);
		if (
			!player.isBot &&
			gameState.handInProgress &&
			!gameState.openCardsMode &&
			!player.folded &&
			player.holeCards.every(Boolean)
		) {
			showPlayerQr(player, player.holeCards[0], player.holeCards[1]);
		} else {
			hidePlayerQr(player);
		}
	});

	// Benched roster members (busted humans awaiting rebuy, away players) keep their seat.
	const seatedSet = new Set(gameState.players);
	gameState.allPlayers.forEach((player) => {
		if (seatedSet.has(player) || (player.isBot && player.chips <= 0)) {
			return;
		}
		bindSeatRefPlayer(player);
		renderSeatSetupState(getSeatRef(player), {
			visible: true,
			isBot: player.isBot,
			nameEditable: false,
			controlsVisible: false,
		});
		renderPlayerSeat(player);
		hidePlayerQr(player);
	});
	updateSeatManagementControls();

	renderPot();
	renderTableCommunityCards(communityCardSlots, gameState.communityCards);
	renderPlayerChipStacks();
	updateFastForwardButton();
	renderStatsOverlay();
	syncLogUi();
	instructionsButton.classList.add("hidden");
	startButton.classList.toggle("hidden", gameState.handInProgress === true);
	if (!gameState.handInProgress) {
		setStartButtonLabel("새 라운드");
	}
}

function restoreTableUrl(savedTableId) {
	tableId = typeof savedTableId === "string" && savedTableId ? savedTableId : null;
	syncTableUrlWithState();
}

function resumeRestoredFlow(flowState = {}) {
	setCurrentFlowState(flowState);
	if (flowState.type === "chip-transfer") {
		gameState.chipTransfer = null;
		clearChipTransferAnimation(tableRenderTarget);
		finishHandAfterShowdown();
		return;
	}
	if (flowState.type === "runout") {
		setPhase();
		return;
	}
	if (flowState.type === "active-turn" && gameState.handInProgress) {
		startButton.classList.add("hidden");
		startBettingRound({
			resetRound: false,
			progressState: normalizeSavedProgressState(flowState.progressState),
			resumeTurn: {
				seatIndex: flowState.seatIndex,
				cycles: normalizeNumber(flowState.cycles, 0),
			},
		});
		return;
	}
	if (gameState.handInProgress) {
		startButton.classList.add("hidden");
		startBettingRound({ resetRound: false });
		return;
	}

	setCurrentFlowState({ type: "between-hands" });
	setSummaryButtonsVisible(true);
	setStartButtonLabel("새 라운드");
	startButton.classList.remove("hidden");
	startNewRoundCountdown();
	saveCurrentGameSnapshot();
}

function restoreSavedGame(snapshot) {
	resetRuntimeBeforeRestore();
	restoreRuntimeState(snapshot.runtimeState);
	restoreGameState(snapshot.gameState);
	currentGameSaveEligible = hasExactlyOneHumanPlayer(gameState.players);
	restoreTableUrl(snapshot.tableId);
	renderRestoredGameState();
	syncRuntimePlayback();
	resumeRestoredFlow(snapshot.flowState);
	queueStateSync(0);
}

function trackSavedGameResume() {
	if (SPEED_MODE) {
		return;
	}
	globalThis.umami?.track("Poker", {
		resumedGame: true,
	});
}

function openResumeGameOverlay(snapshot) {
	if (!resumeGameOverlay) {
		return;
	}
	pendingSavedGameSnapshot = snapshot;
	openOverlay("resume");
}

function closeResumeGameOverlay() {
	pendingSavedGameSnapshot = null;
	if (!resumeGameOverlay) {
		return;
	}
	resumeGameOverlay.classList.add("hidden");
	syncOverlayBackdrop();
}

function continueSavedGame() {
	const snapshot = pendingSavedGameSnapshot;
	if (!snapshot) {
		return;
	}
	removeSavedGameSnapshot();
	closeResumeGameOverlay();
	restoreSavedGame(snapshot);
	trackSavedGameResume();
}

function discardSavedGame() {
	removeSavedGameSnapshot();
	closeResumeGameOverlay();
}

function handlePageLifecycleSave() {
	saveCurrentGameSnapshot();
	trackUnfinishedExit();
}

/* --------------------------------------------------------------------------------------------------
Low-Level Utilities And Formatting Helpers
---------------------------------------------------------------------------------------------------*/

function logHistory(msg) {
	if (HISTORY_LOG) console.log(msg);
}

function logFlow(msg, data) {
	if (DEBUG_FLOW) {
		const ts = new Date().toISOString().slice(11, 23);
		if (data !== undefined) {
			console.log("%c" + ts, "color:#888", msg, data);
		} else {
			console.log("%c" + ts, "color:#888", msg);
		}
	}
}

function logSpeedmodeEvent(type, payload) {
	if (!SPEED_MODE) {
		return;
	}
	console.log("speedmode_event", { type, ...payload });
}

function clearBotCheckRaiseIntent(player, reason) {
	const intent = player.botLine?.checkRaiseIntent;
	if (!intent) {
		return;
	}

	logSpeedmodeEvent("bot_check_raise_intent_clear", {
		handId: gameState.handId ?? 0,
		player: player.name,
		seatIndex: player.seatIndex,
		reason,
		street: intent.street,
		edge: intent.edge,
		rawHandRank: intent.rawHandRank,
		rawHand: intent.rawHand,
		textureRisk: intent.textureRisk,
		structureTag: intent.structureTag,
		plannedAmount: intent.plannedAmount,
	});
	player.botLine.checkRaiseIntent = null;
}

function clearBotCheckRaiseIntents(reason) {
	gameState.players.forEach((player) =>
		clearBotCheckRaiseIntent(player, reason)
	);
}

function clearBotPassiveValueCheckIntent(player, reason) {
	const intent = player.botLine?.passiveValueCheckIntent;
	if (!intent) {
		return;
	}

	logSpeedmodeEvent("bot_passive_value_check_intent_clear", {
		handId: gameState.handId ?? 0,
		player: player.name,
		seatIndex: player.seatIndex,
		reason,
		street: intent.street,
		edge: intent.edge,
		rawHandRank: intent.rawHandRank,
		rawHand: intent.rawHand,
		textureRisk: intent.textureRisk,
		structureTag: intent.structureTag,
		plannedAmount: intent.plannedAmount,
	});
	player.botLine.passiveValueCheckIntent = null;
}

function clearBotPassiveValueCheckIntents(reason) {
	gameState.players.forEach((player) =>
		clearBotPassiveValueCheckIntent(player, reason)
	);
}

function buildSpeedmodeHandStartPlayers(players) {
	return players.map((player) => ({
		name: player.name,
		seatIndex: player.seatIndex,
		chipsStart: player.chips,
	}));
}

function buildSpeedmodeTotalBetByPlayer(contributors) {
	return contributors.reduce((totals, player) => {
		totals[player.name] = player.totalBet;
		return totals;
	}, {});
}

function buildSpeedmodeTotalBetBySeatIndex(contributors) {
	return contributors.reduce((totals, player) => {
		totals[player.seatIndex] = player.totalBet;
		return totals;
	}, {});
}

function buildSpeedmodePayoutByPlayer(totalPayoutByPlayer) {
	const payouts = {};
	for (const [player, amount] of totalPayoutByPlayer.entries()) {
		payouts[player.name] = amount;
	}
	return payouts;
}

function buildSpeedmodePayoutBySeatIndex(totalPayoutByPlayer) {
	const payouts = {};
	for (const [player, amount] of totalPayoutByPlayer.entries()) {
		payouts[player.seatIndex] = amount;
	}
	return payouts;
}

function createPageUrl(pageName) {
	const base = globalThis.location.origin +
		globalThis.location.pathname.replace(/[^/]*$/, "");
	return new URL(`${base}${pageName}`);
}

function formatPercent(numerator, denominator) {
	if (denominator === 0) {
		return "-";
	}
	return `${Math.round((numerator / denominator) * 100)}%`;
}

function getRandomItem(items) {
	return items[Math.floor(Math.random() * items.length)];
}

/* --------------------------------------------------------------------------------------------------
Seat And Player Binding Helpers
---------------------------------------------------------------------------------------------------*/

function getSeatRef(target) {
	if (typeof target === "number") {
		return seatRefs[target] ?? null;
	}
	if (!target) {
		return null;
	}
	if (target.seatEl) {
		return target;
	}
	if (typeof target.seatSlot === "number") {
		return seatRefs[target.seatSlot] ?? null;
	}
	return null;
}

function setPlayerActionState(player, actionName, labelUntil) {
	if (!player || !actionName || !Number.isFinite(labelUntil)) {
		clearPlayerActionState(player);
		return;
	}
	player.actionState = {
		name: actionName,
		labelUntil,
	};
}

function clearPlayerActionState(player) {
	if (!player) {
		return;
	}
	player.actionState = null;
}

function clearPlayerWinnerReactionState(player) {
	player.winnerReactionEmoji = "";
	player.winnerReactionUntil = 0;
}

function bindSeatRefPlayer(player) {
	const seatRef = getSeatRef(player);
	if (!seatRef) {
		return;
	}
	seatRef.playerSeatIndex = player.seatIndex;
	seatRef.clearActionLabelState = () => clearPlayerActionState(player);
	seatRef.clearWinnerReactionState = () =>
		clearPlayerWinnerReactionState(player);
}

function buildPlayerSeatState(
	player,
	communityCards = getCommunityCardCodes(),
) {
	const publicPlayerView = buildPublicPlayerView(
		player,
		communityCards,
		gameState,
	);
	const winProbabilityLabel = publicPlayerView.showWinProbability &&
			typeof publicPlayerView.winProbability === "number"
		? `${Math.round(publicPlayerView.winProbability)}%`
		: "";

	return {
		name: publicPlayerView.name,
		chips: publicPlayerView.chips,
		roundBet: publicPlayerView.roundBet,
		isHuman: player.isBot !== true,
		visibleCardCodes: publicPlayerView.publicHoleCards,
		dealer: publicPlayerView.dealer,
		smallBlind: publicPlayerView.smallBlind,
		bigBlind: publicPlayerView.bigBlind,
		folded: publicPlayerView.folded,
		allIn: publicPlayerView.allIn,
		active: gameState.activeSeatIndex === player.seatIndex,
		winner: publicPlayerView.winner,
		handStrengthLabel: publicPlayerView.handStrengthLabel,
		outsLabel: publicPlayerView.outsLabel,
		winProbabilityLabel,
		actionState: publicPlayerView.actionState,
		winnerReaction: publicPlayerView.winnerReaction,
	};
}

function renderPlayerSeat(player, communityCards = getCommunityCardCodes()) {
	const seatRef = getSeatRef(player);
	if (!seatRef) {
		return;
	}
	renderHostSeat(seatRef, buildPlayerSeatState(player, communityCards));
}

function renderPlayerResolvedAction(player) {
	const seatRef = getSeatRef(player);
	if (!seatRef) {
		return;
	}
	renderSeatResolvedAction(seatRef, {
		playerName: player.name,
		actionName: player.actionState?.name,
		labelUntil: player.actionState?.labelUntil,
		isFolded: player.folded,
	});
}

function getPlayerSeatRenderData(playerList = gameState.players) {
	return playerList
		.map((player) => {
			const seatRef = getSeatRef(player);
			if (!seatRef) {
				return null;
			}
			return {
				seatIndex: player.seatIndex,
				chips: player.chips,
				totalEl: seatRef.totalEl,
				stackChipEls: seatRef.stackChipEls,
			};
		})
		.filter((playerView) => playerView !== null);
}

function renderPlayerChipStacks(playerList = gameState.players) {
	renderChipStacks(getPlayerSeatRenderData(playerList));
}

function renderPlayerTotal(player) {
	renderPlayerSeat(player);
}

function setPlayerSeatName(player, text) {
	const nameEl = getSeatRef(player)?.nameEl ?? null;
	if (!nameEl) {
		return;
	}
	nameEl.textContent = text;
}

function showPlayerQr(player, card1, card2) {
	const seatRef = getSeatRef(player);
	if (!seatRef?.qrContainer || !seatRef.qrLink || !seatRef.remoteLink) {
		return;
	}

	seatRef.qrContainer.classList.remove("hidden");
	// On a synced table, joining lands on the full remote-table view first; the compact
	// card view stays reachable through its switch link. Without sync the QR falls back
	// to the standalone card page fed by URL params.
	let url;
	if (tableId !== null) {
		const remoteTableUrl = createPageUrl("remoteTable.html");
		remoteTableUrl.searchParams.set("tableId", tableId);
		remoteTableUrl.searchParams.set("seatIndex", `${player.seatIndex}`);
		url = remoteTableUrl.toString();
		seatRef.remoteLink.href = url;
		seatRef.remoteLink.classList.remove("hidden");
	} else {
		const holeCardsUrl = createPageUrl("hole-cards.html");
		holeCardsUrl.searchParams.set("card1", card1);
		holeCardsUrl.searchParams.set("card2", card2);
		holeCardsUrl.searchParams.set("name", player.name);
		holeCardsUrl.searchParams.set("chips", `${player.chips}`);
		holeCardsUrl.searchParams.set("seatIndex", `${player.seatIndex}`);
		holeCardsUrl.searchParams.set("t", `${Date.now()}`);
		url = holeCardsUrl.toString();
		seatRef.remoteLink.removeAttribute("href");
		seatRef.remoteLink.classList.add("hidden");
	}
	seatRef.qrLink.replaceChildren();
	seatRef.qrLink.href = url;
	QrCreator.render({
		text: url,
		size: 200,
		fill: "#333",
		background: "#fff",
		radius: 0,
	}, seatRef.qrLink);

	seatRef.qrContainer.dataset.url = url;
}

function hidePlayerQr(player) {
	const seatRef = getSeatRef(player);
	if (!seatRef?.qrContainer || !seatRef.qrLink || !seatRef.remoteLink) {
		return;
	}

	seatRef.qrContainer.classList.add("hidden");
	seatRef.qrLink.replaceChildren();
	seatRef.qrLink.removeAttribute("href");
	seatRef.remoteLink.removeAttribute("href");
	seatRef.remoteLink.classList.add("hidden");
	delete seatRef.qrContainer.dataset.url;
}

function resetPlayerRoundBet(player) {
	player.roundBet = 0;
	renderPlayerSeat(player);
}

function clearPlayerActionLabel(player) {
	clearPlayerActionState(player);
	renderPlayerResolvedAction(player);
}

function applyPlayerPatches(playerPatches) {
	playerPatches.forEach(({ player, patch }) => {
		Object.assign(player, patch);
	});
}

function applyGameStatePatch(gameStatePatch) {
	Object.assign(gameState, gameStatePatch);
}

function applyHandContextPatch(handContextPatch) {
	if (!handContextPatch) {
		return;
	}
	if (!gameState.handContext) {
		gameState.handContext = createHandContextState();
	}
	Object.assign(gameState.handContext, handContextPatch);
}

function clearPlayerWinnerReaction(player) {
	clearPlayerWinnerReactionState(player);
	renderPlayerSeat(player);
}

function showPlayerWinnerReaction(player, emoji, visibleUntil) {
	player.winnerReactionEmoji = emoji;
	player.winnerReactionUntil = visibleUntil;
	renderPlayerSeat(player);
}

/* --------------------------------------------------------------------------------------------------
Render And Overlay Helpers
---------------------------------------------------------------------------------------------------*/

function renderPot() {
	potEl.textContent = gameState.pot;
}

function setCommunityCards(cardCodes) {
	gameState.communityCards = cardCodes.slice();
	renderTableCommunityCards(communityCardSlots, gameState.communityCards);
}

function setPlayerVisibleHoleCards(player, visibleHoleCards) {
	player.visibleHoleCards = visibleHoleCards.slice();
	renderPlayerHoleCards(player);
}

function renderPlayerHoleCards(player) {
	renderPlayerSeat(player);
}

function getStatsPlayers() {
	return gameState.allPlayers.slice().sort((a, b) => {
		if (b.chips !== a.chips) {
			return b.chips - a.chips;
		}
		return a.seatIndex - b.seatIndex;
	});
}

function createStatsCell(tagName, value) {
	const cell = document.createElement(tagName);
	cell.textContent = `${value}`;
	return cell;
}

function renderStatsOverlay() {
	if (!statsTableBody) {
		return;
	}

	statsTableBody.replaceChildren();
	getStatsPlayers().forEach((player) => {
		const row = document.createElement("tr");
		row.appendChild(createStatsCell("th", player.name));
		row.appendChild(createStatsCell("td", player.chips));
		row.appendChild(createStatsCell("td", player.stats.hands));
		row.appendChild(createStatsCell("td", player.stats.handsWon));
		row.appendChild(
			createStatsCell(
				"td",
				formatPercent(player.stats.handsWon, player.stats.hands),
			),
		);
		row.appendChild(createStatsCell("td", player.stats.showdowns));
		row.appendChild(createStatsCell("td", player.stats.showdownsWon));
		row.appendChild(
			createStatsCell(
				"td",
				formatPercent(
					player.stats.showdownsWon,
					player.stats.showdowns,
				),
			),
		);
		row.appendChild(createStatsCell("td", player.stats.folds));
		row.appendChild(createStatsCell("td", player.stats.foldsPreflop));
		row.appendChild(createStatsCell("td", player.stats.foldsPostflop));
		row.appendChild(createStatsCell("td", player.stats.allins));
		statsTableBody.appendChild(row);
	});
}

function renderVersionOverlay() {
	if (!versionList) {
		return;
	}

	versionList.replaceChildren();
	VERSION_LOG.forEach((entry) => {
		const versionEntry = document.createElement("article");
		versionEntry.className = "version-entry";

		const heading = document.createElement("div");
		heading.className = "version-entry-heading";

		const versionLabel = document.createElement("h3");
		versionLabel.className = "version-entry-version";
		versionLabel.textContent = `v${entry.version}`;
		heading.appendChild(versionLabel);

		const title = document.createElement("p");
		title.className = "version-entry-title";
		title.textContent = entry.title;
		heading.appendChild(title);

		const meta = document.createElement("span");
		meta.className = "version-entry-meta";
		meta.textContent = entry.date;
		heading.appendChild(meta);

		if (entry.credit) {
			const credit = document.createElement("a");
			credit.className = "version-entry-credit";
			credit.href = entry.credit.url;
			credit.target = "_blank";
			credit.rel = "noopener noreferrer";
			credit.textContent = `기여: @${entry.credit.name}`;
			heading.appendChild(credit);
		}

		const notes = document.createElement("ul");
		notes.className = "version-entry-notes";
		entry.notes.forEach((note) => {
			const noteItem = document.createElement("li");
			noteItem.textContent = note;
			notes.appendChild(noteItem);
		});

		versionEntry.appendChild(heading);
		versionEntry.appendChild(notes);
		versionList.appendChild(versionEntry);
	});
}

function syncOverlayBackdrop() {
	const isOverlayOpen = Object.values(overlays).some(({ el }) =>
		el && !el.classList.contains("hidden")
	);
	overlayBackdrop.classList.toggle("hidden", !isOverlayOpen);
}

function isBlockingOverlayOpen() {
	return Object.values(overlays).some((overlay) =>
		overlay.blocking === true &&
		overlay.el &&
		!overlay.el.classList.contains("hidden")
	);
}

function openOverlay(name) {
	const overlay = overlays[name];
	if (!overlay) {
		return;
	}
	if (overlay.canOpen && !overlay.canOpen()) {
		return;
	}
	Object.entries(overlays).forEach(([key, entry]) => {
		entry.el?.classList.toggle("hidden", key !== name);
	});
	overlay.beforeOpen?.();
	syncOverlayBackdrop();
}

function closeOverlay(name) {
	const overlay = overlays[name];
	if (!overlay || overlay.blocking === true) {
		return;
	}
	overlay.el.classList.add("hidden");
	syncOverlayBackdrop();
}

function closeAllOverlays() {
	Object.values(overlays).forEach(({ el, blocking }) => {
		if (blocking !== true) {
			el?.classList.add("hidden");
		}
	});
	syncOverlayBackdrop();
}

function syncLogUi() {
	const hasLogHistory = !!logList && logList.childElementCount > 0;
	const showSummaryButtons = !SPEED_MODE && summaryButtonsVisible;

	statsButton.classList.toggle("hidden", !showSummaryButtons);
	logButton.classList.toggle("hidden", !showSummaryButtons || !hasLogHistory);
}

function setSummaryButtonsVisible(isVisible) {
	summaryButtonsVisible = isVisible;
	syncLogUi();
}

function setStartButtonLabel(text) {
	if (startButtonLabel) {
		startButtonLabel.textContent = text;
		startButtonLabel.classList.remove("hidden");
		return;
	}
	startButton.textContent = text;
}

function showNewRoundCountdown(seconds) {
	if (!newRoundCountdown || !newRoundCountdownValue) {
		setStartButtonLabel(`새 라운드 · ${seconds}초 후`);
		return;
	}
	newRoundCountdownValue.textContent = String(seconds);
	newRoundCountdown.classList.remove("hidden");
}

function clearNewRoundCountdown({ notify } = { notify: false }) {
	const wasActive = newRoundCountdownTimer !== null ||
		newRoundCountdownSeconds > 0;
	if (newRoundCountdownTimer !== null) {
		clearTimeout(newRoundCountdownTimer);
		newRoundCountdownTimer = null;
	}
	newRoundCountdownSeconds = 0;
	if (newRoundControls) {
		newRoundControls.classList.remove("new-round-countdown-active");
	}
	startButton.classList.remove("new-round-countdown-active");
	if (newRoundCountdown) {
		newRoundCountdown.classList.add("hidden");
	}
	if (newRoundCancelButton) {
		newRoundCancelButton.classList.add("hidden");
		newRoundCancelButton.classList.remove("new-round-countdown-active");
	}
	if (newRoundCountdownValue) {
		newRoundCountdownValue.textContent = String(
			NEW_ROUND_COUNTDOWN_SECONDS,
		);
	}
	if (!newRoundCountdown || !newRoundCountdownValue) {
		setStartButtonLabel("새 라운드");
	}
	if (notify && wasActive) {
		enqueueNotification("새 라운드 카운트다운이 취소되었습니다.");
	}
}

function tickNewRoundCountdown() {
	newRoundCountdownSeconds--;
	if (newRoundCountdownSeconds <= 0) {
		clearNewRoundCountdown({ notify: false });
		preFlop();
		return;
	}
	showNewRoundCountdown(newRoundCountdownSeconds);
	newRoundCountdownTimer = setTimeout(
		tickNewRoundCountdown,
		NEW_ROUND_COUNTDOWN_INTERVAL,
	);
}

function startNewRoundCountdown() {
	clearNewRoundCountdown({ notify: false });
	if (SPEED_MODE || autoplayToGameEnd) {
		return;
	}
	newRoundCountdownSeconds = NEW_ROUND_COUNTDOWN_SECONDS;
	showNewRoundCountdown(newRoundCountdownSeconds);
	if (newRoundControls) {
		newRoundControls.classList.add("new-round-countdown-active");
	}
	startButton.classList.add("new-round-countdown-active");
	if (newRoundCancelButton) {
		newRoundCancelButton.classList.remove("hidden");
		newRoundCancelButton.classList.add("new-round-countdown-active");
	}
	newRoundCountdownTimer = setTimeout(
		tickNewRoundCountdown,
		NEW_ROUND_COUNTDOWN_INTERVAL,
	);
}

function cancelNewRoundCountdown() {
	clearNewRoundCountdown({ notify: true });
}

/* --------------------------------------------------------------------------------------------------
Notification And Playback Helpers
---------------------------------------------------------------------------------------------------*/

function isFastPlaybackActive() {
	return SPEED_MODE || handFastForwardActive || autoplayToGameEnd;
}

function isTurboPlaybackActive() {
	return handFastForwardActive || autoplayToGameEnd;
}

function getNotifInterval() {
	if (SPEED_MODE) {
		return 0;
	}
	if (isTurboPlaybackActive()) {
		return FAST_FORWARD_NOTIF_INTERVAL;
	}
	return NOTIF_INTERVAL;
}

function getActionLabelDuration() {
	if (SPEED_MODE) {
		return 0;
	}
	if (isTurboPlaybackActive()) {
		return FAST_FORWARD_ACTION_LABEL_DURATION;
	}
	return ACTION_LABEL_DURATION;
}

function getPlayerActionNotificationText(playerName, actionName, amount = 0) {
	switch (actionName) {
		case "fold":
			return `${playerName} 폴드.`;
		case "check":
			return `${playerName} 체크.`;
		case "call":
			return `${playerName} ${amount} 콜.`;
		case "raise":
			return `${playerName} ${amount}(으)로 레이즈.`;
		case "allin":
			return `${playerName} 올인.`;
		default:
			return `${playerName}의 차례…`;
	}
}

function logSkippedPlayerActionProbability(
	player,
	action,
	skipProbabilityLogReason,
) {
	switch (skipProbabilityLogReason) {
		case "allin-runout-preflop":
			logFlow("winProbability: preflop all-in runout pending", {
				action,
				name: player.name,
			});
			break;
		case "fold-preflop":
			logFlow("winProbability: preflop fold skipped", {
				name: player.name,
			});
			break;
	}
}

function getRunoutPhaseDelay() {
	if (SPEED_MODE) {
		return 0;
	}
	if (isTurboPlaybackActive()) {
		return FAST_FORWARD_RUNOUT_PHASE_DELAY;
	}
	return RUNOUT_PHASE_DELAY;
}

function scheduleNextNotif() {
	if (notifTimer) {
		clearTimeout(notifTimer);
	}
	notifTimer = setTimeout(() => {
		notifTimer = null;
		showNextNotif();
	}, getNotifInterval());
}

function deliverNotification(msg) {
	// newest message first for tracking
	if (logList) {
		const logEntry = document.createElement("div");
		logEntry.textContent = msg;
		logList.prepend(logEntry);
	}
	notifArr.unshift(msg);
	if (notifArr.length > MAX_ITEMS) notifArr.pop();
	syncLogUi();
	queueStateSync();
	renderNotificationBar(notification, notifArr);
	logHistory(msg);
}

function flushPendingNotifications() {
	if (notifTimer) {
		clearTimeout(notifTimer);
		notifTimer = null;
	}
	if (pendingNotif.length === 0) {
		isNotifProcessing = false;
		return;
	}
	isNotifProcessing = true;
	while (pendingNotif.length > 0) {
		deliverNotification(pendingNotif.shift());
	}
	isNotifProcessing = false;
}

function refreshNotificationPlayback() {
	if (!isNotifProcessing || pendingNotif.length === 0) {
		return;
	}
	scheduleNextNotif();
}

function syncRuntimePlayback() {
	setBotPlaybackFast(handFastForwardActive || autoplayToGameEnd);
	if (isFastPlaybackActive()) {
		flushPendingNotifications();
		return;
	}
	refreshNotificationPlayback();
}

function clearChipTransferFinishTimer() {
	if (chipTransferFinishTimer === null) {
		return;
	}
	clearTimeout(chipTransferFinishTimer);
	chipTransferFinishTimer = null;
}

function enqueueNotification(msg) {
	pendingNotif.push(msg);
	if (isFastPlaybackActive()) {
		flushPendingNotifications();
		return;
	}
	if (!isNotifProcessing) {
		showNextNotif();
	}
}

function showNextNotif() {
	if (pendingNotif.length === 0) {
		isNotifProcessing = false;
		notifTimer = null;
		return;
	}
	isNotifProcessing = true;
	deliverNotification(pendingNotif.shift());
	scheduleNextNotif();
}

function clearActionLabels() {
	gameState.players.forEach((player) => {
		clearPlayerActionLabel(player);
	});
}

function getHumanPlayers() {
	return gameState.players.filter((p) => !p.isBot);
}

function getHumansWithChipsCount() {
	return gameState.players.filter((p) => !p.isBot && p.chips > 0).length;
}

function updateFastForwardButton() {
	if (!fastForwardButton) {
		return;
	}
	const humanPlayers = getHumanPlayers();
	const noHumanCanAct = humanPlayers.length === 0 ||
		humanPlayers.every((player) => player.folded);
	const shouldShow = !SPEED_MODE &&
		hadHumansAtStart &&
		gameState.handInProgress &&
		!gameState.gameFinished &&
		!handFastForwardActive &&
		!autoplayToGameEnd &&
		noHumanCanAct;
	fastForwardButton.classList.toggle("hidden", !shouldShow);
}

function resetRuntimeFastForward() {
	handFastForwardActive = false;
	autoplayToGameEnd = false;
	syncRuntimePlayback();
	updateFastForwardButton();
}

function activateFastForward() {
	if (
		!gameState.handInProgress || handFastForwardActive ||
		autoplayToGameEnd || SPEED_MODE
	) {
		return;
	}
	handFastForwardActive = true;
	clearActionLabels();
	syncRuntimePlayback();
	updateFastForwardButton();
	if (runoutPhaseTimer) {
		clearTimeout(runoutPhaseTimer);
		runoutPhaseTimer = null;
		setPhase();
	}
}

/* --------------------------------------------------------------------------------------------------
Analytics And Remote State-Sync Helpers
---------------------------------------------------------------------------------------------------*/

function getHandsPlayedBucket(handCount) {
	if (handCount < 35) return "<35";
	if (handCount <= 40) return "36-40";
	if (handCount <= 45) return "41-45";
	if (handCount <= 50) return "46-50";
	if (handCount <= 55) return "51-55";
	if (handCount <= 60) return "56-60";
	if (handCount <= 70) return "61-70";
	if (handCount <= 80) return "71-80";
	if (handCount <= 90) return "81-90";
	if (handCount <= 100) return "91-100";
	if (handCount <= 120) return "101-120";
	return ">120";
}

function getExitCounts() {
	const humansWithChipsAtExit =
		gameState.players.filter((p) => !p.isBot && p.chips > 0).length;
	const botsWithChipsAtExit =
		gameState.players.filter((p) => p.isBot && p.chips > 0).length;
	return { humansWithChipsAtExit, botsWithChipsAtExit };
}

function trackUnfinishedExit() {
	if (
		SPEED_MODE ||
		!globalThis.umami ||
		!gameState.gameStarted ||
		gameState.gameFinished ||
		exitEventSent ||
		!hadHumansAtStart
	) {
		return;
	}
	const { humansWithChipsAtExit, botsWithChipsAtExit } = getExitCounts();
	const exitCategory = humansWithChipsAtExit === 0
		? "last_human_bust"
		: "humans_left_with_chips";
	exitEventSent = true;
	globalThis.umami?.track("Poker", {
		finished: false,
		humansWithChipsAtExit,
		botsWithChipsAtExit,
		exitCategory,
	});
}

function registerBotReveal(player) {
	if (player?.stats) {
		player.stats.reveals++;
	}
	if (SPEED_MODE) {
		return;
	}
	globalThis.umami?.track("Poker", {
		botReveal: true,
	});
}

function hasStateSyncEnabled() {
	return tableId !== null;
}

function getHumanPlayerCount(players = gameState.players) {
	return players.filter((player) => !player.isBot).length;
}

function shouldEnableStateSyncForGame() {
	return getHumanPlayerCount() >= 2;
}

function syncTableUrlWithState() {
	const tableUrl = new URL(globalThis.location.href);
	if (tableId === null) {
		tableUrl.searchParams.delete("tableId");
	} else {
		tableUrl.searchParams.set("tableId", tableId);
	}
	globalThis.history.replaceState(null, "", tableUrl.toString());
}

function initStateSyncForGame() {
	if (!shouldEnableStateSyncForGame()) {
		tableId = null;
		syncTableUrlWithState();
		return;
	}

	const tableUrl = new URL(globalThis.location.href);
	tableId = tableUrl.searchParams.get("tableId") ||
		Math.random().toString(36).slice(2, 8);
	syncTableUrlWithState();
}

function createTurnToken() {
	return `${Date.now().toString(36)}${
		Math.random().toString(36).slice(2, 8)
	}`;
}

function setPendingAction(player) {
	if (
		!hasStateSyncEnabled() || !player || player.isBot || player.folded ||
		player.allIn
	) {
		if (gameState.pendingAction !== null) {
			gameState.pendingAction = null;
			queueStateSync(0);
		}
		return null;
	}

	const actionState = getPlayerActionState(gameState, player);
	const pendingAction = {
		seatIndex: player.seatIndex,
		turnToken: createTurnToken(),
		needToCall: actionState.needToCall,
		minAmount: actionState.minAmount,
		maxAmount: actionState.maxAmount,
		minRaise: actionState.minRaise,
		maxRaiseAmount: actionState.maxRaiseAmount,
		canCheck: actionState.canCheck,
		buttonLabel: getActionButtonLabel(actionState.minAmount, actionState),
	};
	gameState.pendingAction = pendingAction;
	queueStateSync(0);
	return pendingAction;
}

function clearPendingAction() {
	if (gameState.pendingAction === null) {
		return;
	}
	gameState.pendingAction = null;
	queueStateSync(0);
}

async function fetchPendingRemoteAction(turnToken) {
	if (!hasStateSyncEnabled() || !turnToken) {
		return null;
	}

	try {
		// wait=1: the server holds the request open until the remote player acts, so
		// waiting on a turn barely costs any requests.
		const url = `${ACTION_SYNC_ENDPOINT}?tableId=${
			encodeURIComponent(tableId)
		}&turnToken=${encodeURIComponent(turnToken)}&wait=1`;
		const res = await fetch(url, {
			cache: "no-store",
		});
		if (res.status === 204) {
			return null;
		}
		if (!res.ok) {
			logFlow("remote action poll failed", { status: res.status });
			return null;
		}
		return await res.json();
	} catch (error) {
		logFlow("remote action poll failed", error);
		return null;
	}
}

let lastStateSendAttemptAt = 0;

// Sync heartbeat: whatever happens to the normal debounced sync chain (a dropped timer,
// an exception in a callback, a run of failed requests), a running synced game re-sends
// its full state every few seconds, so remote views can never be starved for long.
setInterval(() => {
	if (!hasStateSyncEnabled() || !gameState.gameStarted) {
		return;
	}
	if (Date.now() - lastStateSendAttemptAt < 5000) {
		return;
	}
	if (stateSyncTimer !== null) {
		clearTimeout(stateSyncTimer);
		stateSyncTimer = null;
		stateSyncTimerDelay = null;
	}
	sendTableState();
}, 5000);

async function sendTableState() {
	lastStateSendAttemptAt = Date.now();
	// Building the payload happens inside its own guard: an exception here (e.g. a hand
	// evaluation blowing up on one player's cards) used to escape the retry chain and
	// silently kill state sync for the rest of the game - remote views froze while the
	// host looked fine.
	let payload;
	try {
		payload = {
			tableId: tableId,
			view: buildSyncView(gameState, notifArr.slice(0, MAX_ITEMS)),
		};
	} catch (error) {
		console.error("state sync payload build failed", error);
		logFlow("state sync build failed", error);
		queueStateSync(3000);
		return;
	}

	try {
		const res = await fetch(STATE_SYNC_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (!res.ok) {
			throw new Error(`state sync failed with status ${res.status}`);
		}
	} catch (error) {
		logFlow("state sync failed", error);
		queueStateSync();
	}
}

function queueStateSync(delay = STATE_SYNC_DELAY) {
	if (!hasStateSyncEnabled()) {
		return;
	}

	const nextDelay = Math.max(0, delay);
	if (stateSyncTimer !== null) {
		if (stateSyncTimerDelay !== null && stateSyncTimerDelay <= nextDelay) {
			return;
		}
		clearTimeout(stateSyncTimer);
	}

	stateSyncTimerDelay = nextDelay;
	stateSyncTimer = setTimeout(() => {
		stateSyncTimer = null;
		stateSyncTimerDelay = null;
		sendTableState();
	}, nextDelay);
}

const humanTurnController = createHumanTurnController({
	foldButton,
	actionButton,
	amountControls,
	amountSlider,
	sliderOutput,
	decrementButton: amountDecrementButton,
	incrementButton: amountIncrementButton,
	actionPollInterval: ACTION_POLL_INTERVAL,
	actionStep: CHIP_UNIT,
	onControlsHidden: updateFastForwardButton,
	onNewTurn: () => {
		if (!hasStateSyncEnabled()) {
			playTurnChime();
		}
	},
	setActiveTurnPlayer,
	setPendingAction,
	clearPendingAction,
	fetchPendingRemoteAction,
	applyTurnAction,
	continueAfterResolvedTurn,
	getPlayerActionState: (player) => getPlayerActionState(gameState, player),
	getResolvedTurnMeta,
});

/* --------------------------------------------------------------------------------------------------
Card Visibility, Hand-Strength, Reveal, And Winner-Reaction Logic
---------------------------------------------------------------------------------------------------*/

function revealPlayerHoleCards(player) {
	setPlayerVisibleHoleCards(player, [true, true]);
}

function getCommunityCardCodes() {
	return gameState.communityCards.slice();
}

function revealActiveHoleCards() {
	gameState.players.filter((p) => !p.folded).forEach((p) => {
		revealPlayerHoleCards(p);
		hidePlayerQr(p);
	});
	updateHandStrengthDisplays();
}

function formatCardLabel(cardCode) {
	if (!cardCode || cardCode.length < 2) {
		return "";
	}
	const rank = cardCode[0] === "T" ? "10" : cardCode[0];
	const suit = CARD_SUIT_SYMBOLS[cardCode[1]] || cardCode[1];
	return `${rank}${suit}`;
}

function applyBotReveal(player, revealDecision) {
	if (!revealDecision) {
		return;
	}
	if (gameState.spectatorMode) {
		updateHandStrengthDisplays();
		return;
	}
	const revealedCards = new Set(revealDecision.codes);
	setPlayerVisibleHoleCards(
		player,
		player.holeCards.map((cardCode) => revealedCards.has(cardCode)),
	);
	hidePlayerQr(player);
	updateHandStrengthDisplays();
}

function getLuckyWinnerReactionGap(player, showdownPlayers = []) {
	const playerSnapshot = player?.lastNonFinalWinProbability;
	if (typeof playerSnapshot !== "number" || !Array.isArray(showdownPlayers)) {
		return null;
	}

	let hasOtherSnapshot = false;
	let highestSnapshot = playerSnapshot;
	showdownPlayers.forEach((showdownPlayer) => {
		if (showdownPlayer === player) {
			return;
		}
		const showdownSnapshot = showdownPlayer?.lastNonFinalWinProbability;
		if (typeof showdownSnapshot !== "number") {
			return;
		}
		hasOtherSnapshot = true;
		if (showdownSnapshot > highestSnapshot) {
			highestSnapshot = showdownSnapshot;
		}
	});

	if (!hasOtherSnapshot || playerSnapshot === highestSnapshot) {
		return null;
	}

	return highestSnapshot - playerSnapshot;
}

function getWinnerReactionEmoji(player, context) {
	if (context.revealedPlayers.has(player)) {
		return getRandomItem(WINNER_REACTION_EMOJIS.reveal);
	}

	if (context.activePlayerCount === 1) {
		return getRandomItem(WINNER_REACTION_EMOJIS.uncontested);
	}

	if (context.mainPotWinnerCount > 1) {
		return getRandomItem(WINNER_REACTION_EMOJIS.split);
	}

	if (context.hadShowdown) {
		const luckyGap = getLuckyWinnerReactionGap(
			player,
			context.showdownPlayers,
		);
		if (
			luckyGap !== null &&
			luckyGap >= WINNER_REACTION_LUCKY_MIN_GAP
		) {
			return getRandomItem(WINNER_REACTION_EMOJIS.lucky);
		}
	}

	const totalPayout = context.totalPayout;
	const stackBeforePayout = context.stackBeforePayout;
	const stackAfterPayout = stackBeforePayout + totalPayout;
	if (
		stackBeforePayout <= 6 * context.bigBlind &&
		stackAfterPayout >= 12 * context.bigBlind &&
		stackAfterPayout >= stackBeforePayout * 3
	) {
		return getRandomItem(WINNER_REACTION_EMOJIS.comeback);
	}

	if (context.hadShowdown) {
		const solvedHand = getVisibleSolvedHand(player, context.communityCards);
		if (solvedHand) {
			if (
				solvedHand.descr === "Royal Flush" ||
				WINNER_REACTION_MONSTER_HANDS.has(solvedHand.name)
			) {
				return getRandomItem(WINNER_REACTION_EMOJIS.monsterHand);
			}
			if (WINNER_REACTION_STRONG_HANDS.has(solvedHand.name)) {
				return getRandomItem(WINNER_REACTION_EMOJIS.strongHand);
			}
		}
	}

	if (totalPayout >= Math.max(12 * context.bigBlind, stackBeforePayout)) {
		return getRandomItem(WINNER_REACTION_EMOJIS.bigPot);
	}

	return getRandomItem(WINNER_REACTION_EMOJIS.fallback);
}

function triggerMainPotWinnerReactions(context) {
	if (isFastPlaybackActive() || context.mainPotWinners.length === 0) {
		return;
	}

	context.mainPotWinners.forEach((player) => {
		const totalPayout = context.totalPayoutByPlayer.get(player) || 0;
		if (totalPayout <= 0) {
			return;
		}
		const emoji = getWinnerReactionEmoji(player, {
			...context,
			totalPayout,
			stackBeforePayout: player.chips,
		});
		const visibleUntil = Date.now() + WINNER_REACTION_DURATION;
		player.winnerReactionEmoji = emoji;
		player.winnerReactionUntil = visibleUntil;
		showPlayerWinnerReaction(player, emoji, visibleUntil);
		queueStateSync(0);
	});
}

function updateHandStrengthDisplays() {
	const communityCards = getCommunityCardCodes();
	gameState.players.forEach((player) =>
		renderPlayerSeat(player, communityCards)
	);
}

function updateWinProbabilityDisplays() {
	const communityCards = getCommunityCardCodes();
	gameState.players.forEach((player) =>
		renderPlayerSeat(player, communityCards)
	);
}

function computeSpectatorWinProbabilities(reason = "") {
	if (
		!gameState.spectatorMode &&
		!isAllInRunout(gameState.players, gameState.currentBet)
	) {
		return;
	}
	if (gameState.currentPhaseIndex === 0) {
		logFlow("winProbability: preflop skipped", { reason });
		updateWinProbabilityDisplays();
		return;
	}

	const communityCards = getCommunityCardCodes();
	const missingCount = 5 - communityCards.length;
	if (missingCount < 0) {
		logFlow("winProbability: invalid board state", {
			communityCards,
			missingCount,
		});
		return;
	}

	const activePlayers = gameState.players.filter((p) => !p.folded);
	if (activePlayers.length === 0) {
		updateWinProbabilityDisplays();
		return;
	}

	gameState.players.forEach((p) => {
		p.winProbability = p.folded ? 0 : null;
	});
	const result = calculateWinProbabilities(
		gameState.players,
		communityCards,
		gameState.deck,
	);

	if (result.status === "invalid_board") {
		logFlow("winProbability: invalid board state", {
			communityCards,
			missingCount,
		});
		return;
	}

	if (result.status === "no_players") {
		updateWinProbabilityDisplays();
		return;
	}

	if (result.status === "too_many_boards") {
		logFlow("winProbability: skipped heavy enumeration", {
			phase: getCurrentPhase(gameState.currentPhaseIndex),
			reason,
			missingCount,
			totalBoards: result.totalBoards,
			deckSize: gameState.deck.length,
		});
		updateWinProbabilityDisplays();
		return;
	}

	if (result.status === "no_boards") {
		logFlow("winProbability: no boards to evaluate", {
			deckSize: gameState.deck.length,
			missingCount,
		});
		updateWinProbabilityDisplays();
		return;
	}

	result.activePlayers.forEach((player) => {
		player.winProbability = result.probabilities.get(player) ?? null;
		if (missingCount > 0 && typeof player.winProbability === "number") {
			player.lastNonFinalWinProbability = player.winProbability;
		}
	});

	updateWinProbabilityDisplays();

	logFlow("winProbability", {
		phase: getCurrentPhase(gameState.currentPhaseIndex),
		reason,
		missingCount,
		totalBoards: result.totalBoards,
		boards: result.boardsSeen,
		players: result.activePlayers.map((player) => ({
			name: player.name,
			winProbability: Number(player.winProbability.toFixed(2)),
		})),
	});
}

/* --------------------------------------------------------------------------------------------------
Game Setup And Hand Lifecycle
---------------------------------------------------------------------------------------------------*/

function startGame() {
	if (!gameState.gameStarted) {
		resetRuntimeFastForward();
		totalHands = 0;
		gameState.handId = 0;
		gameState.nextDecisionId = 1;
		gameState.blindLevel = 0;
		gameState.smallBlind = INITIAL_SMALL_BLIND;
		gameState.bigBlind = INITIAL_BIG_BLIND;
		gameState.lastRaise = INITIAL_BIG_BLIND;
		gameState.handInProgress = false;
		createPlayers();
		hadHumansAtStart = gameState.players.some((p) => !p.isBot);
		currentGameSaveEligible = hasExactlyOneHumanPlayer(gameState.players);
		exitEventSent = false;

		if (gameState.players.length > 1) {
			seatRefs.forEach((seatRef) =>
				renderSeatSetupState(seatRef, {
					nameEditable: false,
					controlsVisible: false,
				})
			);
			startButton.classList.add("hidden");
			instructionsButton.classList.add("hidden");
			blindUpControl?.classList.add("hidden");
			closeAllOverlays();
			gameState.gameStarted = true;
			initStateSyncForGame();

			preFlop();
		} else {
			hadHumansAtStart = false;
			currentGameSaveEligible = false;
			seatRefs.forEach((seatRef) => {
				if (seatRef.nameEl.textContent === "") {
					renderSeatSetupState(seatRef, { visible: true });
				}
			});
			gameState.players = [];
			gameState.allPlayers = [];
			enqueueNotification("플레이어가 부족합니다");
		}
	} else {
		// New Round
		preFlop();
	}
}

function createPlayers() {
	gameState.players = [];
	gameState.allPlayers = [];
	const botNames = shuffleArray(BOT_NAME_POOL.slice());
	let botIndex = 0;
	for (const seatRef of seatRefs) {
		seatRef.playerSeatIndex = null;
		seatRef.clearActionLabelState = null;
		seatRef.clearWinnerReactionState = null;
		seatRef.seatEl.classList.remove("joinable", "sitting-out");
		if (seatRef.seatEl.classList.contains("hidden")) {
			continue;
		}
		if (seatRef.nameEl.textContent.trim() === "") {
			seatRef.nameEl.textContent = botNames[botIndex] ?? `봇 ${botIndex + 1}`;
			botIndex++;
			renderSeatSetupState(seatRef, { isBot: true });
		} else {
			renderSeatSetupState(seatRef, { isBot: false });
		}
	}

	const activeSeatRefs = seatRefs.filter((seatRef) =>
		!seatRef.seatEl.classList.contains("hidden")
	);
	for (const seatRef of activeSeatRefs) {
		const playerState = createPlayerState({
			name: seatRef.nameEl.textContent,
			isBot: seatRef.seatEl.classList.contains("bot"),
			seatSlot: seatRef.seatSlot,
			seatIndex: gameState.players.length,
		});
		bindSeatRefPlayer(playerState);
		gameState.players.push(playerState);
	}
	renderPlayerChipStacks();
	gameState.players.forEach((player) => {
		renderPlayerTotal(player);
		resetPlayerRoundBet(player);
		renderPlayerHoleCards(player);
	});
	gameState.allPlayers = gameState.players.slice();
}

function createPlayerState({ name, isBot, seatSlot, seatIndex }) {
	return {
		name,
		isBot,
		seatSlot,
		winnerReactionEmoji: "",
		winnerReactionUntil: 0,
		isWinner: false,
		actionState: null,
		winProbability: null,
		lastNonFinalWinProbability: null,
		seatIndex,
		holeCards: [null, null],
		visibleHoleCards: [false, false],
		dealer: false,
		smallBlind: false,
		bigBlind: false,
		folded: false,
		chips: STARTING_STACK,
		allIn: false,
		totalBet: 0,
		roundBet: 0,
		stats: {
			hands: 0,
			handsWon: 0,
			vpip: 0,
			pfr: 0,
			calls: 0,
			aggressiveActs: 0,
			reveals: 0,
			showdowns: 0,
			showdownsWon: 0,
			folds: 0,
			foldsPreflop: 0,
			foldsPostflop: 0,
			allins: 0,
		},
		botLine: {
			preflopAggressor: false,
			cbetIntent: null,
			barrelIntent: null,
			cbetMade: false,
			barrelMade: false,
			nonValueAggressionMade: false,
			checkRaiseIntent: null,
			passiveValueCheckIntent: null,
		},
		spotState: createPlayerSpotState(),
	};
}

function setDealer() {
	const dealerPlan = advanceDealer(gameState.players);
	if (!dealerPlan) {
		return;
	}
	applyPlayerPatches(dealerPlan.playerPatches);
	gameState.players = dealerPlan.players;
	if (dealerPlan.previousDealer) {
		renderPlayerSeat(dealerPlan.previousDealer);
	}
	renderPlayerSeat(dealerPlan.dealer);

	enqueueNotification(`${gameState.players[0].name} 딜러.`);
}

function updateBlindLevelForCurrentHand() {
	if (!blindUpEnabled) {
		return;
	}
	const blindLevelUpdate = getBlindLevelUpdateForHand(totalHands, gameState);
	if (!blindLevelUpdate) {
		return;
	}

	applyGameStatePatch(blindLevelUpdate.gameStatePatch);
	if (blindLevelUpdate.blindsChanged) {
		enqueueNotification(
			`블라인드가 ${gameState.smallBlind}/${gameState.bigBlind}(으)로 올랐습니다.`,
		);
	}
}

function setBlinds() {
	updateBlindLevelForCurrentHand();

	const blindPlan = postBlinds(gameState);
	applyPlayerPatches(blindPlan.playerPatches);
	applyGameStatePatch(blindPlan.gameStatePatch);
	blindPlan.playerPatches.forEach(({ player }) => {
		renderPlayerSeat(player);
	});
	renderPot();

	enqueueNotification(
		`${blindPlan.smallBlindPlayer.name} 스몰 블라인드 ${blindPlan.smallBlindAmount} 베팅.`,
	);
	enqueueNotification(
		`${blindPlan.bigBlindPlayer.name} 빅 블라인드 ${blindPlan.bigBlindAmount} 베팅.`,
	);
}

function dealCards() {
	const dealPlan = dealHoleCardsForNewHand(gameState);
	applyPlayerPatches(dealPlan.playerPatches);
	applyGameStatePatch(dealPlan.gameStatePatch);

	dealPlan.dealtPlayers.forEach(({ player, card1, card2 }) => {
		renderPlayerHoleCards(player);
		if (!player.isBot) {
			if (gameState.openCardsMode) {
				hidePlayerQr(player);
			} else {
				showPlayerQr(player, card1, card2);
			}
		} else {
			hidePlayerQr(player);
		}
	});
}

// Execute the standard pre-flop steps: rotate dealer, post blinds, deal cards, start betting.
function preFlop() {
	// --- Hand Start And Reset ---------------------------------------------------
	setCurrentFlowState({ type: "hand-start" });
	clearNewRoundCountdown({ notify: false });
	// Analytics: count hands and mark start time
	totalHands++;
	if (runoutPhaseTimer) {
		clearTimeout(runoutPhaseTimer);
		runoutPhaseTimer = null;
	}
	clearChipTransferFinishTimer();
	clearChipTransferAnimation(tableRenderTarget);

	startButton.classList.add("hidden");
	closeAllOverlays();
	setSummaryButtonsVisible(false);
	clearActionLabels();
	clearActiveTurnPlayer(false);
	applyBetweenHandsRosterChanges();

	const nextHandPlan = createNextHandTransitionPlan(gameState, totalHands);
	applyPlayerPatches(nextHandPlan.playerPatches);
	applyGameStatePatch(nextHandPlan.gameStatePatch);

	nextHandPlan.playerPatches.forEach(({ player }) => {
		clearPlayerWinnerReaction(player);
		renderPlayerSeat(player);
		renderPlayerHoleCards(player);
		hidePlayerQr(player);
	});
	setCommunityCards(gameState.communityCards);

	nextHandPlan.bustedPlayers.forEach((player) => {
		if (player.isBot) {
			// Busted bots leave, but their seat opens up for a new name or a fresh bot.
			freeBotSeat(player);
			enqueueNotification(`${player.name} 탈락! – 빈 자리에 이름 입력 또는 봇 추가 가능.`);
		} else {
			// Busted humans keep their seat and can press the rebuy button at any time
			// to return with a fresh stack on the next hand.
			getSeatRef(player)?.seatEl.classList.add("sitting-out");
			renderPlayerSeat(player);
			hidePlayerQr(player);
			enqueueNotification(`${player.name} 칩 소진 – 리바인하면 복귀합니다.`);
		}
		logFlow("player_bust", { name: player.name });
		logSpeedmodeEvent("player_bust", {
			handId: gameState.handId,
			player: player.name,
			seatIndex: player.seatIndex,
		});
	});
	updateSeatManagementControls();

	updateWinProbabilityDisplays();
	updateHandStrengthDisplays();

	// --- Game Over Check ---------------------------------------------------------
	// GAME OVER: only one player left at the table
	if (nextHandPlan.type === "game-over") {
		const champion = nextHandPlan.champion;
		clearActiveTurnPlayer(false);
		enqueueNotification(`${champion.name} 게임 승리! 🏆`);
		// Reveal champion's stack
		renderPlayerTotal(champion);
		renderPlayerSeat(champion);
		logFlow("tournament_end", { champion: champion.name });
		clearPendingAction();
		humanTurnController.hide();
		resetRuntimeFastForward();
		if (!SPEED_MODE) {
			globalThis.umami?.track("Poker", {
				champion: champion.name,
				botWon: champion.isBot,
				handsPlayed: getHandsPlayedBucket(totalHands),
				finished: true,
			});
			renderStatsOverlay();
			setSummaryButtonsVisible(true);
		}
		if (currentGameSaveEligible) {
			removeSavedGameSnapshot();
		}
		queueStateSync(0);
		return; // skip the rest of preFlop()
	}
	// ----------------------------------------------------------

	// --- Dealer, Blinds, Deal, And First Round ----------------------------------
	updateFastForwardButton();

	// Assign dealer
	setDealer();

	// post blinds
	setBlinds();
	const handStartPlayers = buildSpeedmodeHandStartPlayers(gameState.players);

	// Shuffle and deal new hole cards
	dealCards();
	if (totalHands === 1 && !SPEED_MODE) {
		globalThis.umami?.track("Poker", {
			players: gameState.players.length,
			bots: gameState.players.filter((p) => p.isBot).length,
			humans: gameState.players.filter((p) => !p.isBot).length,
		});
	}
	logSpeedmodeEvent("hand_start", {
		handId: gameState.handId,
		blindLevel: gameState.blindLevel,
		smallBlind: gameState.smallBlind,
		bigBlind: gameState.bigBlind,
		dealerSeatIndex: gameState.players.find((player) =>
			player.dealer
		)?.seatIndex ?? null,
		communityCards: [],
		players: handStartPlayers,
	});

	// Start first betting round (preflop)
	queueStateSync();
	startBettingRound();
}

function dealCommunityCards(amount) {
	const dealPlan = dealCommunityCardsForPhase(
		gameState,
		amount,
		communityCardSlots.length,
	);
	if (!dealPlan) {
		console.warn("Not enough empty slots for", amount);
		logFlow("dealCommunityCards: not enough slots");
		return;
	}
	applyGameStatePatch(dealPlan.gameStatePatch);
	renderTableCommunityCards(communityCardSlots, gameState.communityCards);
	updateHandStrengthDisplays();
	if (
		gameState.spectatorMode ||
		isAllInRunout(gameState.players, gameState.currentBet)
	) {
		computeSpectatorWinProbabilities("dealCommunityCards");
	}
}

function setPhase() {
	logFlow("setPhase", {
		phase: getCurrentPhase(gameState.currentPhaseIndex),
	});
	const phasePlan = getNextPhasePlan(gameState);
	if (phasePlan.botIntentResetReason) {
		clearBotCheckRaiseIntents(phasePlan.botIntentResetReason);
		clearBotPassiveValueCheckIntents(phasePlan.botIntentResetReason);
	}
	if (phasePlan.reason === "onlyActivePlayer") {
		return doShowdown();
	}

	applyGameStatePatch(phasePlan.gameStatePatch);
	applyHandContextPatch(phasePlan.handContextPatch);

	switch (phasePlan.phase) {
		case "flop":
			dealCommunityCards(phasePlan.cardsToDeal);
			enqueueNotification("플랍(3장) 공개.");
			startBettingRound();
			break;
		case "turn":
			dealCommunityCards(phasePlan.cardsToDeal);
			enqueueNotification("턴(4번째 카드) 공개.");
			startBettingRound();
			break;
		case "river":
			dealCommunityCards(phasePlan.cardsToDeal);
			enqueueNotification("리버(5번째 카드) 공개.");
			startBettingRound();
			break;
		case "showdown":
			doShowdown();
			break;
	}
	queueStateSync();
}

function queueRunoutPhaseAdvance(reason = "") {
	humanTurnController.hide();
	setCurrentFlowState({
		type: "runout",
		reason,
		phaseIndex: gameState.currentPhaseIndex,
	});
	const runoutPhaseDelay = getRunoutPhaseDelay();
	if (
		!isAllInRunout(gameState.players, gameState.currentBet) ||
		runoutPhaseDelay === 0
	) {
		saveCurrentGameSnapshot();
		return setPhase();
	}
	if (runoutPhaseTimer) {
		return;
	}
	logFlow("delay runout phase", {
		reason,
		phase: getCurrentPhase(gameState.currentPhaseIndex),
		delay: runoutPhaseDelay,
	});
	runoutPhaseTimer = setTimeout(() => {
		runoutPhaseTimer = null;
		setPhase();
	}, runoutPhaseDelay);
	saveCurrentGameSnapshot();
}

/* --------------------------------------------------------------------------------------------------
Turn Handling And Betting Round Flow
---------------------------------------------------------------------------------------------------*/

function notifyPlayerAction(player, action = "", amount = 0, actionMeta = {}) {
	recordPlayerActionStats(gameState, player, action, actionMeta);

	const msg = getPlayerActionNotificationText(player.name, action, amount);
	if (action) {
		setPlayerActionState(
			player,
			action,
			Date.now() + getActionLabelDuration(),
		);
	} else {
		clearPlayerActionState(player);
	}

	renderPlayerResolvedAction(player);

	const followUpEffects = getPlayerActionFollowUpEffects(
		gameState,
		player,
		action,
	);
	if (followUpEffects.clearWinProbability) {
		player.winProbability = 0;
	}
	if (followUpEffects.revealActiveHoleCards) {
		revealActiveHoleCards();
	} else if (followUpEffects.refreshHandStrength) {
		updateHandStrengthDisplays();
	}
	if (followUpEffects.recomputeSpectatorWinProbabilities) {
		computeSpectatorWinProbabilities(followUpEffects.probabilityReason);
	} else if (followUpEffects.skipProbabilityLogReason) {
		logSkippedPlayerActionProbability(
			player,
			action,
			followUpEffects.skipProbabilityLogReason,
		);
	}
	queueStateSync(0);
	updateFastForwardButton();
	enqueueNotification(msg);
}

function setActiveTurnPlayer(player) {
	const previousActiveSeatIndex = gameState.activeSeatIndex;
	gameState.activeSeatIndex = player.seatIndex;
	renderSeatActiveStates(seatRefs, gameState.activeSeatIndex);
	if (previousActiveSeatIndex !== player.seatIndex) {
		queueStateSync(0);
	}
}

function clearActiveTurnPlayer(sync = true) {
	renderSeatActiveStates(seatRefs, null);
	if (gameState.activeSeatIndex === null) {
		return;
	}
	gameState.activeSeatIndex = null;
	if (sync) {
		queueStateSync(0);
	}
}

function continueAfterResolvedTurn({
	player,
	cycles,
	nextPlayer,
	logPrefix,
	advanceReason,
}) {
	const continuation = getResolvedTurnContinuation(gameState, cycles);
	if (continuation.type === "next") {
		logFlow(`${logPrefix} next`, { name: player.name });
		nextPlayer();
	} else if (continuation.type === "wait") {
		logFlow(`${logPrefix} wait`, { name: player.name });
		nextPlayer();
	} else {
		clearActiveTurnPlayer(false);
		logFlow(`${logPrefix} advance`, { name: player.name });
		queueRunoutPhaseAdvance(advanceReason);
	}
}

function getResolvedTurnMeta(resolvedAction) {
	if (resolvedAction?.action === "fold") {
		return {
			logPrefix: "fold",
			advanceReason: "fold",
		};
	}
	if (resolvedAction?.action === "allin") {
		return {
			logPrefix: "human",
			advanceReason: "human-allin",
		};
	}
	return {
		logPrefix: "human",
		advanceReason: "human",
	};
}

function applyResolvedTurnActionPatches(player, resolvedAction) {
	Object.assign(player, resolvedAction.playerPatch);
	Object.assign(gameState, resolvedAction.gameStatePatch);

	if (Object.keys(resolvedAction.playerPatch).length > 0) {
		renderPlayerSeat(player);
	}
	if (
		Object.prototype.hasOwnProperty.call(
			resolvedAction.gameStatePatch,
			"pot",
		)
	) {
		renderPot();
	}
}

function applyTurnAction(player, actionRequest) {
	const resolvedAction = resolveTurnAction(gameState, player, actionRequest);
	if (!resolvedAction) {
		return null;
	}

	applyResolvedTurnActionPatches(player, resolvedAction);
	notifyPlayerAction(
		player,
		resolvedAction.action,
		resolvedAction.amount,
		resolvedAction.actionMeta,
	);
	if (resolvedAction.action === "fold") {
		hidePlayerQr(player);
	}
	return resolvedAction;
}

function runBotTurn({ player, cycles, nextPlayer }) {
	setActiveTurnPlayer(player);
	humanTurnController.hide();
	clearPlayerActionLabel(player);
	clearSeatActionVisualState(getSeatRef(player));
	setPlayerSeatName(player, "생각 중…");

	enqueueBotAction(() => {
		const decision = chooseBotAction(player, gameState);
		const actionRequest = normalizeBotActionRequest(decision);
		let resolvedAction = applyTurnAction(player, actionRequest);
		if (!resolvedAction) {
			logFlow("bot action fallback", {
				name: player.name,
				decision: decision?.action ?? null,
			});
			const fallbackActionState = getPlayerActionState(gameState, player);
			resolvedAction = applyTurnAction(
				player,
				fallbackActionState.canCheck
					? { action: "check" }
					: { action: "fold" },
			);
		}
		continueAfterResolvedTurn({
			player,
			cycles,
			nextPlayer,
			logPrefix: "bot",
			advanceReason: "bot",
		});
	});
}

function startBettingRound(options = {}) {
	// --- Round Reset -------------------------------------------------------------
	const shouldResetRound = options.resetRound !== false;
	if (shouldResetRound) {
		const roundStartPlan = createBettingRoundStartPlan(gameState);
		if (roundStartPlan.botIntentResetReason) {
			clearBotCheckRaiseIntents(roundStartPlan.botIntentResetReason);
			clearBotPassiveValueCheckIntents(roundStartPlan.botIntentResetReason);
		}
		applyPlayerPatches(roundStartPlan.playerPatches);
		applyGameStatePatch(roundStartPlan.gameStatePatch);
		applyHandContextPatch(roundStartPlan.handContextPatch);
		roundStartPlan.playerPatches.forEach(({ player, patch }) => {
			if ("roundBet" in patch) {
				renderPlayerSeat(player);
			}
		});
	}
	logFlow("startBettingRound", {
		phase: getCurrentPhase(gameState.currentPhaseIndex),
		currentBet: gameState.currentBet,
		lastRaise: gameState.lastRaise,
		order: gameState.players.map((p) => p.name),
		resume: !shouldResetRound,
	});
	// Clear action indicators from the previous betting round
	clearActiveTurnPlayer(false);
	if (shouldResetRound) {
		gameState.players.forEach((player) => {
			clearSeatActionVisualState(getSeatRef(player), { preserveAllIn: true });
		});
	}
	clearPendingAction();

	const startExit = getBettingRoundStartExit(gameState);
	if (startExit) {
		logFlow("skip betting round", {
			active: startExit.activePlayerCount,
			actionable: startExit.actionablePlayerCount,
		});
		clearActiveTurnPlayer(false);
		clearPendingAction();
		return queueRunoutPhaseAdvance(startExit.reason);
	}

	let progressState = normalizeSavedProgressState(options.progressState) ||
		createBettingRoundProgressState(gameState);
	const loggedStartPlayer = gameState.players.length > 0
		? gameState.players[progressState.nextIndex % gameState.players.length]
		: null;

	logFlow("betting start index", {
		index: progressState.nextIndex,
		player: loggedStartPlayer?.name ?? null,
	});

	// --- Turn Loop ----------------------------------------------------------------
	function nextPlayer() {
		const step = getNextBettingRoundStep(gameState, progressState);
		if (step.progressState) {
			progressState = step.progressState;
		}

		if (step.type === "advance" && step.reason === "nextPlayer") {
			logFlow("no actionable players, advance phase (nextPlayer)", {
				active: step.activePlayers.map((p) => ({
					name: p.name,
					allIn: p.allIn,
					roundBet: p.roundBet,
				})),
			});
			clearActiveTurnPlayer(false);
			clearPendingAction();
			return queueRunoutPhaseAdvance("nextPlayer");
		}

		logFlow(
			"nextPlayer",
			{
				index: step.index,
				cycles: step.previousCycles,
				name: step.player.name,
				folded: step.player.folded,
				allIn: step.player.allIn,
				roundBet: step.player.roundBet,
			},
		);

		if (step.reason === "foldedAllIn") {
			logFlow("skip folded/allin", { name: step.player.name });
			return setTimeout(nextPlayer, 0); // avoid recursive stack growth
		}

		if (step.reason === "waitUncalled") {
			logFlow("already matched bet", {
				name: step.player.name,
				cycles: step.cycles,
			});
			logFlow("wait uncalled", { name: step.player.name });
			return setTimeout(nextPlayer, 0); // schedule asynchronously to break call chain
		}

		if (step.type === "advance") {
			logFlow("already matched bet", {
				name: step.player.name,
				cycles: step.cycles,
			});
			logFlow("advance phase", { name: step.player.name });
			clearActiveTurnPlayer(false);
			clearPendingAction();
			return queueRunoutPhaseAdvance(step.reason);
		}

		if (step.reason === "firstPassMatched") {
			logFlow("already matched bet", {
				name: step.player.name,
				cycles: step.cycles,
			});
		}

		return runTurn(step.player, step.cycles, nextPlayer);
	}

	function runTurn(player, cycles, nextPlayer) {
		setCurrentFlowState(
			createActiveTurnFlowState(player, cycles, progressState),
		);

		// --- Bot Branch --------------------------------------------------------------
		// If this is a bot, choose an action based on hand strength
		if (player.isBot) {
			runBotTurn({
				player,
				cycles,
				nextPlayer,
			});
			saveCurrentGameSnapshot();
			return;
		}

		// --- Human Branch ------------------------------------------------------------
		// An away ("자리비움") human acts automatically - check when free, fold otherwise -
		// so the table keeps moving without them.
		if (player.away === true) {
			setActiveTurnPlayer(player);
			humanTurnController.hide();
			enqueueBotAction(() => {
				const actionState = getPlayerActionState(gameState, player);
				const resolvedAction = applyTurnAction(
					player,
					actionState.canCheck ? { action: "check" } : { action: "fold" },
				);
				const turnMeta = getResolvedTurnMeta(resolvedAction);
				continueAfterResolvedTurn({
					player,
					cycles,
					nextPlayer,
					logPrefix: turnMeta.logPrefix,
					advanceReason: turnMeta.advanceReason,
				});
			});
			saveCurrentGameSnapshot();
			return;
		}
		humanTurnController.runHumanTurn({
			player,
			cycles,
			nextPlayer,
		});
		saveCurrentGameSnapshot();
	}

	const resumeTurn = options.resumeTurn;
	if (
		resumeTurn &&
		Number.isFinite(resumeTurn.seatIndex) &&
		Number.isFinite(resumeTurn.cycles)
	) {
		const resumePlayer = gameState.players.find((player) =>
			player.seatIndex === resumeTurn.seatIndex
		);
		if (resumePlayer && !resumePlayer.folded && !resumePlayer.allIn) {
			runTurn(resumePlayer, resumeTurn.cycles, nextPlayer);
			return;
		}
	}

	nextPlayer();
}

/* --------------------------------------------------------------------------------------------------
Showdown And Payout Flow
---------------------------------------------------------------------------------------------------*/

// Build the synchronized payout transfer plan and let the shared table-view renderer
// animate the visible pot and stack counts from the final canonical state.
function getChipTransferStepCount() {
	if (isTurboPlaybackActive()) {
		return FAST_FORWARD_CHIP_TRANSFER_STEPS;
	}
	return DEFAULT_CHIP_TRANSFER_STEPS;
}

function getChipTransferDurationMs(amount) {
	if (isTurboPlaybackActive()) {
		return FAST_FORWARD_CHIP_TRANSFER_DURATION;
	}
	return Math.min(Math.max(amount * 10, 150), 1500);
}

function buildChipTransferState(transferQueue) {
	if (
		SPEED_MODE ||
		!Array.isArray(transferQueue) ||
		transferQueue.length === 0
	) {
		return null;
	}

	const startedAt = Date.now();
	return {
		id: nextChipTransferId++,
		startedAt,
		transfers: transferQueue.map((transfer) => ({
			seatIndex: transfer.player.seatIndex,
			amount: transfer.amount,
			durationMs: getChipTransferDurationMs(transfer.amount),
			stepCount: getChipTransferStepCount(),
		})),
	};
}

function applyChipTransferResults(commitPlan) {
	applyPlayerPatches(commitPlan.payoutPlayerPatches);
	applyGameStatePatch(commitPlan.payoutGameStatePatch);
}

function getChipTransferRemainingDuration(chipTransfer) {
	if (
		!chipTransfer || !Array.isArray(chipTransfer.transfers) ||
		chipTransfer.transfers.length === 0
	) {
		return 0;
	}

	const endAt = chipTransfer.transfers.reduce(
		(maxEndAt, transfer) =>
			Math.max(maxEndAt, chipTransfer.startedAt + transfer.durationMs),
		chipTransfer.startedAt,
	);
	return Math.max(0, Math.ceil(endAt - Date.now()));
}

function startChipTransferAnimation(commitPlan, onDone) {
	const transferQueue = commitPlan.transferQueue;
	if (!Array.isArray(transferQueue) || transferQueue.length === 0) {
		if (onDone) {
			onDone();
		}
		return;
	}

	clearChipTransferFinishTimer();
	clearChipTransferAnimation(tableRenderTarget);

	const chipTransfer = buildChipTransferState(transferQueue);
	gameState.chipTransfer = chipTransfer;
	applyChipTransferResults(commitPlan);

	if (!chipTransfer) {
		if (onDone) {
			onDone();
		}
		return;
	}

	renderChipTransferAnimation(tableRenderTarget, {
		finalPot: gameState.pot,
		players: getPlayerSeatRenderData(gameState.players),
		chipTransfer,
	});
	setCurrentFlowState({ type: "chip-transfer" });
	queueStateSync(0);
	saveCurrentGameSnapshot();

	chipTransferFinishTimer = setTimeout(() => {
		chipTransferFinishTimer = null;
		gameState.chipTransfer = null;
		clearChipTransferAnimation(tableRenderTarget);
		queueStateSync(0);
		if (onDone) {
			onDone();
		}
	}, getChipTransferRemainingDuration(chipTransfer));
}

function finishHandAfterShowdown() {
	const handEndPlan = createHandEndPlan(gameState);
	renderPlayerChipStacks();

	clearActiveTurnPlayer(false);
	applyGameStatePatch(handEndPlan.gameStatePatch);
	renderPot();

	humanTurnController.hide();
	if (SPEED_MODE) {
		queueStateSync();
		preFlop();
		return;
	}
	if (autoplayToGameEnd) {
		queueStateSync();
		preFlop();
		return;
	}
	if (handFastForwardActive && getHumansWithChipsCount() === 0) {
		handFastForwardActive = false;
		autoplayToGameEnd = true;
		syncRuntimePlayback();
		updateFastForwardButton();
		queueStateSync();
		preFlop();
		return;
	}
	handFastForwardActive = false;
	syncRuntimePlayback();
	updateFastForwardButton();
	renderStatsOverlay();
	setSummaryButtonsVisible(true);
	setStartButtonLabel("새 라운드");
	startButton.classList.remove("hidden");
	setCurrentFlowState({ type: "between-hands" });
	updateSeatManagementControls();
	startNewRoundCountdown();
	queueStateSync();
	saveCurrentGameSnapshot();
}

function doShowdown() {
	// --- Active Players And Showdown State ---------------------------------------
	const communityCards = getCommunityCardCodes();
	const showdownResult = resolveShowdown(
		gameState.players,
		communityCards,
		CHIP_UNIT,
	);
	const {
		activePlayers,
		contributors,
		hadShowdown,
		uncontestedWinner,
		mainPotWinners,
		winningPlayers,
		potResults,
		totalPayoutByPlayer,
		totalPot,
	} = showdownResult;
	const commitPlan = createShowdownCommitPlan(gameState, showdownResult);
	logSpeedmodeEvent("hand_result", {
		handId: gameState.handId,
		communityCards: communityCards.slice(),
		hadShowdown,
		uncontestedWinner: uncontestedWinner?.name ?? null,
		uncontestedWinnerSeatIndex: uncontestedWinner?.seatIndex ?? null,
		mainPotWinners: mainPotWinners.map((player) => player.name),
		mainPotWinnerSeatIndexes: mainPotWinners.map((player) =>
			player.seatIndex
		),
		winningPlayers: winningPlayers.map((player) => player.name),
		winningSeatIndexes: winningPlayers.map((player) => player.seatIndex),
		potResults: potResults.map((result) => ({ ...result })),
		totalPayoutByPlayer: buildSpeedmodePayoutByPlayer(totalPayoutByPlayer),
		totalPayoutBySeatIndex: buildSpeedmodePayoutBySeatIndex(
			totalPayoutByPlayer,
		),
		totalBetByPlayer: buildSpeedmodeTotalBetByPlayer(contributors),
		totalBetBySeatIndex: buildSpeedmodeTotalBetBySeatIndex(contributors),
		totalPot,
	});

	applyPlayerPatches(commitPlan.playerPatches);
	commitPlan.playerPatches.forEach(({ player }) => {
		renderPlayerSeat(player);
	});
	commitPlan.revealPlayers.forEach((player) => {
		hidePlayerQr(player);
	});
	if (commitPlan.revealPlayers.length > 0) {
		updateHandStrengthDisplays();
	}
	commitPlan.mainPotWinners.forEach((player) => {
		renderSeatActiveState(getSeatRef(player), false);
	});

	if (uncontestedWinner) {
		const revealedPlayers = new Set();
		const revealDecision = getBotRevealDecision(
			uncontestedWinner,
			communityCards,
		);
		if (revealDecision) {
			revealedPlayers.add(uncontestedWinner);
			applyBotReveal(uncontestedWinner, revealDecision);
			registerBotReveal(uncontestedWinner);
			enqueueNotification(
				`${uncontestedWinner.name} 카드 공개: ${
					revealDecision.codes.map(formatCardLabel).join(" ")
				}`,
			);
		} else {
			hidePlayerQr(uncontestedWinner);
		}
		triggerMainPotWinnerReactions({
			activePlayerCount: activePlayers.length,
			bigBlind: gameState.bigBlind,
			communityCards,
			contributors,
			hadShowdown,
			mainPotWinnerCount: mainPotWinners.length,
			mainPotWinners,
			revealedPlayers,
			showdownPlayers: activePlayers,
			totalPayoutByPlayer,
		});
		enqueueNotification(`${uncontestedWinner.name} ${totalPot} 획득!`);
		startChipTransferAnimation(commitPlan, () => {
			finishHandAfterShowdown();
		});
		return;
	}

	// Skip pure refund-only side pots in the log. They animate correctly, but they are not real wins.
	const filteredResults = potResults.filter((result) =>
		result.isRefundOnly !== true
	);

	// --- Notification Consolidation ----------------------------------------------
	// Consolidate notifications: if same player wins all pots, combine amounts
	if (filteredResults.length > 0) {
		const allSame = filteredResults.every((r) =>
			r.players.length === 1 &&
			r.players[0] === filteredResults[0].players[0]
		);
		if (allSame) {
			const total = filteredResults.reduce((sum, r) => sum + r.amount, 0);
			let msg = `${filteredResults[0].players[0]} ${total} 획득`;
			if (filteredResults[0].hand) {
				msg += ` (${translateHandName(filteredResults[0].hand)})`;
			}
			enqueueNotification(msg);
		} else {
			filteredResults.forEach((r) => {
				if (r.players.length === 1) {
					let msg = `${r.players[0]} ${r.amount} 획득`;
					if (r.hand) msg += ` (${translateHandName(r.hand)})`;
					enqueueNotification(msg);
				} else {
					enqueueNotification(
						`${r.players.join(" & ")} ${r.amount} 분할`,
					);
				}
			});
		}
	}

	triggerMainPotWinnerReactions({
		activePlayerCount: activePlayers.length,
		bigBlind: gameState.bigBlind,
		communityCards,
		contributors,
		hadShowdown,
		mainPotWinnerCount: mainPotWinners.length,
		mainPotWinners,
		revealedPlayers: new Set(),
		showdownPlayers: activePlayers,
		totalPayoutByPlayer,
	});

	// --- Payout Animation --------------------------------------------------------
	// Build one synced transfer plan and let host and remote play the same animation locally.
	startChipTransferAnimation(commitPlan, () => {
		finishHandAfterShowdown();
	});
	return; // exit doShowdown early because UI flow continues in animation
}

/* --------------------------------------------------------------------------------------------------
Seat-Editing Helpers
---------------------------------------------------------------------------------------------------*/

function rotateSeat(ev) {
	const seatEl = ev.currentTarget.closest(".seat");
	const seatRef = seatRefs.find((currentSeatRef) => currentSeatRef.seatEl === seatEl);
	const rotation = Number.parseInt(seatEl?.dataset.rotation ?? "0", 10);
	renderSeatRotation(seatRef, rotation + 90);
}

function deletePlayer(ev) {
	const seatEl = ev.currentTarget.closest(".seat");
	const seatRef = seatRefs.find((currentSeatRef) => currentSeatRef.seatEl === seatEl);
	if (!gameState.gameStarted || gameState.gameFinished) {
		renderSeatSetupState(seatRef, { visible: false });
		return;
	}
	if (!gameState.handInProgress) {
		removeBotBetweenHands(seatRef);
		return;
	}
	toggleBotPendingRemoval(seatRef);
}

/* --------------------------------------------------------------------------------------------------
Mid-Game Roster Management (rebuy, away, bot swap, joins)
---------------------------------------------------------------------------------------------------*/

function getRosterPlayerBySeatSlot(seatSlot) {
	return gameState.allPlayers.find((player) => player.seatSlot === seatSlot) ?? null;
}

function getNextRosterSeatIndex() {
	return gameState.allPlayers.reduce(
		(maxSeatIndex, player) => Math.max(maxSeatIndex, player.seatIndex),
		-1,
	) + 1;
}

// Reset the per-hand state of a player who leaves the seated lineup so their idle seat
// renders cleanly; the next-hand transition plan resets them again when they return.
function benchPlayerForNewHand(player) {
	Object.assign(player, {
		folded: false,
		allIn: false,
		roundBet: 0,
		totalBet: 0,
		holeCards: [null, null],
		visibleHoleCards: [false, false],
		dealer: false,
		smallBlind: false,
		bigBlind: false,
		actionState: null,
		winProbability: null,
		isWinner: false,
	});
}

// Between hands the seated lineup can change: away players sit out, benched players with
// chips return (rebuys and "복귀"), and names typed into freed seats join as new players.
function applyBetweenHandsRosterChanges() {
	if (!gameState.gameStarted) {
		return;
	}

	// Reserved bot kicks fire now that the hand is over.
	gameState.players
		.filter((player) => player.isBot && player.pendingRemoval === true)
		.forEach((player) => {
			if (gameState.players.length <= 2) {
				player.pendingRemoval = false;
				getSeatRef(player)?.seatEl.classList.remove("leaving");
				return;
			}
			freeBotSeat(player);
			enqueueNotification(
				`${player.name} 내보냄 – 빈 자리에 이름을 입력하면 다음 핸드부터 참가합니다.`,
			);
			logFlow("bot_removed", { name: player.name });
		});

	seatRefs.forEach((seatRef) => {
		if (
			seatRef.seatEl.classList.contains("hidden") ||
			!seatRef.seatEl.classList.contains("joinable")
		) {
			return;
		}
		const name = seatRef.nameEl.textContent.trim();
		if (name === "") {
			return;
		}
		const player = createPlayerState({
			name,
			isBot: false,
			seatSlot: seatRef.seatSlot,
			seatIndex: getNextRosterSeatIndex(),
		});
		gameState.allPlayers.push(player);
		bindSeatRefPlayer(player);
		seatRef.seatEl.classList.remove("joinable");
		renderSeatSetupState(seatRef, { isBot: false, nameEditable: false });
		enqueueNotification(`${name} 테이블 참가.`);
		logFlow("player_join", { name });
	});

	const seatedSet = new Set(gameState.players);
	const departing = gameState.players.filter((player) => player.away === true);
	const returning = gameState.allPlayers
		.filter((player) =>
			!seatedSet.has(player) && player.away !== true && player.chips > 0
		)
		.sort((a, b) => a.seatSlot - b.seatSlot);
	if (departing.length === 0 && returning.length === 0) {
		return;
	}

	const remaining = gameState.players.filter((player) => player.away !== true);
	// Never sit out so many players that the next hand cannot start - away players then
	// stay seated and simply auto-check/fold until someone else can take their place.
	const allowDepartures = remaining.length + returning.length >= 2;
	if (allowDepartures) {
		departing.forEach((player) => {
			benchPlayerForNewHand(player);
			getSeatRef(player)?.seatEl.classList.add("sitting-out");
			renderPlayerSeat(player);
			hidePlayerQr(player);
			enqueueNotification(`${player.name} 자리 비움.`);
			logFlow("player_away", { name: player.name });
		});
	}
	returning.forEach((player) => {
		getSeatRef(player)?.seatEl.classList.remove("sitting-out");
		enqueueNotification(`${player.name} 게임 참가.`);
		logFlow("player_return", { name: player.name });
	});
	// The players array is dealer-rotated, so appending would drop the newcomer into an
	// arbitrary spot in the turn order. Re-sort by physical seat instead - the dealer
	// button then advances seat by seat from whoever still holds it.
	gameState.players = (allowDepartures ? remaining : gameState.players.slice())
		.concat(returning)
		.sort((a, b) => a.seatSlot - b.seatSlot);
}

// A busted player (chips <= 0) can press rebuy at ANY time: seated ones (between hands)
// restart with a fresh stack right away, benched ones rejoin on the next hand.
function updateRebuySeatVisibility() {
	seatRefs.forEach((seatRef) => {
		seatRef.rebuyEl?.classList.add("hidden");
	});
	if (!gameState.gameStarted || gameState.gameFinished) {
		return;
	}
	gameState.allPlayers.forEach((player) => {
		if (player.chips > 0) {
			return;
		}
		const seated = gameState.players.includes(player);
		if (seated && gameState.handInProgress) {
			return; // still finishing the hand (busted all-in)
		}
		if (!seated && player.isBot) {
			return; // busted bots leave the table
		}
		getSeatRef(player)?.rebuyEl?.classList.remove("hidden");
	});
}

// Keeps the per-seat management controls in sync: rebuy buttons, the away/return toggle
// on human seats, and the between-hands kick (X) control on bot seats.
function updateSeatManagementControls() {
	updateRebuySeatVisibility();
	// Solo games focus the layout on the single human: their seat sits large at the
	// bottom center while the bots line up small along the top.
	const humanCount = gameState.allPlayers.filter((p) => p.isBot !== true).length;
	const ownFocus = gameState.gameStarted === true && humanCount === 1;
	tableMainEl?.classList.toggle("own-focus", ownFocus);
	// In the own-focus layout the other seats read left to right in the order turns
	// come after the human, like sitting at a real table.
	const focusHuman = ownFocus
		? gameState.allPlayers.find((p) => p.isBot !== true)
		: null;
	seatRefs.forEach((seatRef) => {
		seatRef.seatEl.style.order = focusHuman
			? `${(seatRef.seatSlot - focusHuman.seatSlot + 8) % 8}`
			: "";
	});
	seatRefs.forEach((seatRef) => {
		seatRef.awayEl?.classList.add("hidden");
		seatRef.addBotEl?.classList.add("hidden");
	});
	if (!gameState.gameStarted || gameState.gameFinished) {
		return;
	}
	// Open seats (no roster member) can take a fresh bot at any time.
	seatRefs.forEach((seatRef) => {
		const seatTaken = gameState.allPlayers.some((p) => p.seatSlot === seatRef.seatSlot);
		seatRef.addBotEl?.classList.toggle(
			"hidden",
			seatTaken || seatRef.seatEl.classList.contains("hidden"),
		);
	});
	gameState.allPlayers.forEach((player) => {
		const seatRef = getSeatRef(player);
		if (!seatRef) {
			return;
		}
		const seated = gameState.players.includes(player);
		if (!player.isBot && player.chips > 0 && seatRef.awayEl) {
			seatRef.awayEl.textContent = player.away === true ? "복귀" : "자리비움";
			seatRef.awayEl.classList.remove("hidden");
		}
		if (player.isBot) {
			// The kick control stays available during hands too - a mid-hand click only
			// reserves the removal for the end of the hand.
			seatRef.closeEl?.classList.toggle(
				"hidden",
				!(seated && gameState.players.length > 2),
			);
			seatRef.seatEl.classList.toggle(
				"leaving",
				seated && player.pendingRemoval === true,
			);
		} else {
			seatRef.closeEl?.classList.add("hidden");
		}
		seatRef.seatEl.classList.toggle("sitting-out", !seated);
	});
}

// Removes a bot from the roster and turns their seat into an open name-entry seat.
function freeBotSeat(player) {
	gameState.players = gameState.players.filter((p) => p !== player);
	gameState.allPlayers = gameState.allPlayers.filter((p) => p !== player);
	const seatRef = getSeatRef(player);
	if (!seatRef) {
		return;
	}
	seatRef.playerSeatIndex = null;
	seatRef.clearActionLabelState = null;
	seatRef.clearWinnerReactionState = null;
	clearRenderedSeat(seatRef);
	seatRef.seatEl.classList.remove("sitting-out", "bot", "leaving");
	seatRef.seatEl.classList.add("joinable");
	seatRef.closeEl?.classList.add("hidden");
	seatRef.nameEl.textContent = "";
	seatRef.totalEl.textContent = `${STARTING_STACK}`;
	renderSeatSetupState(seatRef, { visible: true, isBot: false, nameEditable: true });
}

function removeBotBetweenHands(seatRef) {
	const player = getRosterPlayerBySeatSlot(seatRef?.seatSlot);
	if (
		!player || !player.isBot || gameState.handInProgress ||
		!gameState.players.includes(player) || gameState.players.length <= 2
	) {
		return;
	}
	freeBotSeat(player);
	updateSeatManagementControls();
	enqueueNotification(
		`${player.name} 내보냄 – 빈 자리에 이름을 입력하면 다음 핸드부터 참가합니다.`,
	);
	logFlow("bot_removed", { name: player.name });
	queueStateSync();
	saveCurrentGameSnapshot();
}

// During a hand the kick is only reserved: the bot finishes the current hand and leaves
// when it ends. Clicking the X again cancels the reservation.
function toggleBotPendingRemoval(seatRef) {
	const player = getRosterPlayerBySeatSlot(seatRef?.seatSlot);
	if (!player || !player.isBot || !gameState.players.includes(player)) {
		return;
	}
	player.pendingRemoval = player.pendingRemoval !== true;
	seatRef.seatEl.classList.toggle("leaving", player.pendingRemoval);
	enqueueNotification(
		player.pendingRemoval
			? `${player.name} 내보내기 예약 – 이번 핸드가 끝나면 나갑니다.`
			: `${player.name} 내보내기 예약 취소.`,
	);
	logFlow("bot_removal_toggle", {
		name: player.name,
		pending: player.pendingRemoval,
	});
	saveCurrentGameSnapshot();
}

function pickAvailableBotName() {
	const usedNames = new Set(gameState.allPlayers.map((p) => p.name));
	const candidate = shuffleArray(BOT_NAME_POOL.slice())
		.find((name) => !usedNames.has(name));
	return candidate ?? `봇 ${getNextRosterSeatIndex() + 1}`;
}

// Puts a fresh bot on an open seat; it joins the game on the next hand through the
// same between-hands roster merge that seats returning players.
function handleAddBotClick(ev) {
	const seatEl = ev.currentTarget.closest(".seat");
	const seatRef = seatRefs.find((currentSeatRef) => currentSeatRef.seatEl === seatEl);
	if (
		!seatRef || !gameState.gameStarted || gameState.gameFinished ||
		getRosterPlayerBySeatSlot(seatRef.seatSlot)
	) {
		return;
	}
	const bot = createPlayerState({
		name: pickAvailableBotName(),
		isBot: true,
		seatSlot: seatRef.seatSlot,
		seatIndex: getNextRosterSeatIndex(),
	});
	gameState.allPlayers.push(bot);
	bindSeatRefPlayer(bot);
	seatRef.seatEl.classList.remove("joinable");
	seatRef.nameEl.textContent = bot.name;
	renderSeatSetupState(seatRef, { isBot: true, nameEditable: false });
	seatRef.seatEl.classList.add("sitting-out");
	renderPlayerSeat(bot);
	updateSeatManagementControls();
	enqueueNotification(`${bot.name} 봇 추가 – 다음 핸드부터 참가합니다.`);
	logFlow("bot_added", { name: bot.name });
	queueStateSync();
	saveCurrentGameSnapshot();
}

function handleRebuyClick(ev) {
	const seatEl = ev.currentTarget.closest(".seat");
	const seatRef = seatRefs.find((currentSeatRef) => currentSeatRef.seatEl === seatEl);
	const player = getRosterPlayerBySeatSlot(seatRef?.seatSlot);
	if (!player || player.chips > 0) {
		return;
	}
	player.chips = STARTING_STACK;
	renderPlayerSeat(player);
	renderPlayerChipStacks();
	seatRef.rebuyEl?.classList.add("hidden");
	if (gameState.players.includes(player)) {
		enqueueNotification(`${player.name} 리바인 (${STARTING_STACK} 칩).`);
	} else {
		enqueueNotification(
			`${player.name} 리바인 (${STARTING_STACK} 칩) – 다음 핸드부터 참가합니다.`,
		);
	}
	logFlow("player_rebuy", { name: player.name, chips: STARTING_STACK });
	updateSeatManagementControls();
	queueStateSync();
	saveCurrentGameSnapshot();
}

function handleAwayToggleClick(ev) {
	const seatEl = ev.currentTarget.closest(".seat");
	const seatRef = seatRefs.find((currentSeatRef) => currentSeatRef.seatEl === seatEl);
	const player = getRosterPlayerBySeatSlot(seatRef?.seatSlot);
	if (!player || player.isBot) {
		return;
	}
	player.away = player.away !== true;
	if (player.away) {
		enqueueNotification(`${player.name} 자리비움 – 다음 핸드부터 쉽니다.`);
		// If it is their turn right now, fold for them so the table keeps moving.
		if (
			gameState.activeSeatIndex === player.seatIndex &&
			gameState.players.includes(player) &&
			!foldButton.classList.contains("hidden")
		) {
			foldButton.click();
		}
	} else {
		enqueueNotification(`${player.name} 복귀 – 다음 핸드부터 참가합니다.`);
	}
	logFlow("player_away_toggle", { name: player.name, away: player.away });
	updateSeatManagementControls();
	queueStateSync();
	saveCurrentGameSnapshot();
}

/* --------------------------------------------------------------------------------------------------
App Bootstrap And Public API
---------------------------------------------------------------------------------------------------*/

function init() {
	initSound();
	initSoundButton(soundButton);
	initRoundDelayInput();
	initBlindUpControl();

	// Prevent framing
	if (globalThis.top !== globalThis.self) {
		try {
			globalThis.top.location.href = globalThis.location.href;
		} catch {
			alert(
				"No framing allowed. Please visit: https://tableyun.github.io/poker/",
			);
			throw new Error(
				"No framing allowed. Open the original: https://tableyun.github.io/poker/",
			);
		}
	}

	if (versionButton) {
		versionButton.textContent = `v${APP_VERSION}`;
	}

	document.addEventListener("touchstart", function () {}, false);
	document.addEventListener("keydown", (ev) => {
		if (ev.key === "Escape" && !isBlockingOverlayOpen()) {
			closeAllOverlays();
		}
	}, false);
	startButton.addEventListener("click", startGame, false);
	newRoundCancelButton.addEventListener(
		"click",
		cancelNewRoundCountdown,
		false,
	);
	instructionsButton.addEventListener(
		"click",
		() => openOverlay("instructions"),
		false,
	);
	versionButton.addEventListener(
		"click",
		() => openOverlay("version"),
		false,
	);
	notification.addEventListener("click", () => openOverlay("log"), false);
	statsButton.addEventListener("click", () => openOverlay("stats"), false);
	logButton.addEventListener("click", () => openOverlay("log"), false);
	fastForwardButton.addEventListener("click", activateFastForward, false);
	statsCloseButton.addEventListener(
		"click",
		() => closeOverlay("stats"),
		false,
	);
	logCloseButton.addEventListener("click", () => closeOverlay("log"), false);
	versionCloseButton.addEventListener(
		"click",
		() => closeOverlay("version"),
		false,
	);
	instructionsCloseButton.addEventListener(
		"click",
		() => closeOverlay("instructions"),
		false,
	);
	resumeContinueButton?.addEventListener("click", continueSavedGame, false);
	resumeNewButton?.addEventListener("click", discardSavedGame, false);
	overlayBackdrop.addEventListener("click", () => {
		if (!isBlockingOverlayOpen()) {
			closeAllOverlays();
		}
	}, false);
	globalThis.addEventListener("pagehide", handlePageLifecycleSave, false);
	globalThis.addEventListener(
		"beforeunload",
		handlePageLifecycleSave,
		false,
	);
	document.addEventListener(
		"visibilitychange",
		() => {
			if (document.visibilityState === "hidden") {
				handlePageLifecycleSave();
			}
		},
		false,
	);
	humanTurnController.init();
	renderPot();
	renderTableCommunityCards(communityCardSlots, gameState.communityCards);

	for (const rotateIcon of rotateIcons) {
		rotateIcon.addEventListener("click", rotateSeat, false);
	}
	for (const closeButton of closeButtons) {
		closeButton.addEventListener("click", deletePlayer, false);
	}
	for (const rebuyButton of rebuyButtons) {
		rebuyButton.addEventListener("click", handleRebuyClick, false);
	}
	for (const awayButton of awayButtons) {
		awayButton.addEventListener("click", handleAwayToggleClick, false);
	}
	for (const addBotButton of addBotButtons) {
		addBotButton.addEventListener("click", handleAddBotClick, false);
	}

	const savedGameSnapshot = readSavedGameSnapshot();
	if (savedGameSnapshot) {
		openResumeGameOverlay(savedGameSnapshot);
	}
}

globalThis.poker = {
	init,
	get players() {
		return gameState.allPlayers;
	},
	get gameFinished() {
		return gameState.gameFinished;
	},
	get handInProgress() {
		return gameState.handInProgress;
	},
	get reveals() {
		return gameState.allPlayers.map((player) => ({
			name: player.name,
			reveals: player.stats.reveals,
		}));
	},
};

poker.init();

/* --------------------------------------------------------------------------------------------------
 * Service Worker configuration
 * - USE_SERVICE_WORKER: enable or disable SW for this project
 * - SERVICE_WORKER_VERSION: bump to force new SW and new cache
 * - AUTO_RELOAD_ON_SW_UPDATE: reload page once after an update
 -------------------------------------------------------------------------------------------------- */
const USE_SERVICE_WORKER = true;
// Tied to the app version so every release gets a fresh service worker and cache.
const SERVICE_WORKER_VERSION = APP_VERSION;
const AUTO_RELOAD_ON_SW_UPDATE = true;

initCardImageRecovery();
initServiceWorker({
	useServiceWorker: USE_SERVICE_WORKER,
	serviceWorkerVersion: SERVICE_WORKER_VERSION,
	autoReloadOnUpdate: AUTO_RELOAD_ON_SW_UPDATE,
	appVersion: APP_VERSION,
});
