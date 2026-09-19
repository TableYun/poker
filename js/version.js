/*
Version log writing guide:
- Write from the player's or game's point of view, not from the code's point of view.
- Describe functional behavior and gameplay impact instead of internal helpers, tags, thresholds, or refactors.
- Keep titles short, plain-language, and feature-oriented.
- Keep notes concise and focused on what changed in play, pacing, risk, or clarity.
- Do not mention log, speedmode, or internal diagnostics changes in public version entries.
- Keep internal batch or output-location changes out of the public version log.
- Group related tuning work into one coherent entry instead of listing every small internal step.
- Add optional contributor credits as dedicated metadata instead of release notes.
*/

export const APP_VERSION = "1.9.16";

export const VERSION_LOG = [
	{
		version: "1.9.16",
		date: "2026-09-19",
		title: "모바일 카드 확대와 빈 카드 수정",
		notes: [
			"휴대폰에서 내 카드가 화면 폭의 4분의 1 크기로 더 크게 표시됩니다.",
			"모바일 데이터에서 카드 그림 파일이 로드에 실패해 한 장이 하얗게 비어 보이던 문제를 고쳤습니다. 이제 원격 화면도 카드 전체를 미리 저장해 두고 사용합니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.15",
		date: "2026-09-19",
		title: "모바일에서 내 카드 잘 보이게",
		notes: [
			"세로로 긴 휴대폰 화면에서 내 카드가 너무 작아지고 딜러·블라인드 배지에 가려지던 문제를 고쳤습니다. 내 카드는 항상 충분한 크기로 표시됩니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.14",
		date: "2026-09-19",
		title: "중간 참가자 턴 순서 수정",
		notes: [
			"게임 도중 참가하거나 복귀한 플레이어의 액션 순서가 좌석 위치와 어긋나던 문제를 고쳤습니다. 이제 턴은 항상 좌석 순서대로 돌아갑니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.13",
		date: "2026-09-19",
		title: "동기화 서버 이전",
		notes: [
			"멀티플레이 동기화 서버를 Cloudflare(poker-sync.tableyun.workers.dev)로 옮겼습니다. 무료 한도가 하루 10만 요청으로 넉넉해져 원격 플레이가 안정적으로 유지됩니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.12",
		date: "2026-09-19",
		title: "동기화 롱폴링 전환",
		notes: [
			"원격 화면과 호스트가 서버 변화를 기다리는 방식(롱폴링)으로 바뀌어, 동기화 서버 요청 수가 약 90% 줄었습니다. 무료 사용량 한도 안에서 훨씬 오래 플레이할 수 있습니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.11",
		date: "2026-09-19",
		title: "원격 동기화 요청량 감소",
		notes: [
			"원격 테이블·내 카드 화면이 서버에 상태를 물어보는 주기를 완화해, 동기화 서버 사용량을 크게 줄였습니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.10",
		date: "2026-09-19",
		title: "원격 화면에서 내 자리 표시 수정",
		notes: [
			"원격 테이블에서 내 좌석이 다른 참가자들과 함께 위쪽에 섞여 나오던 문제를 고쳤습니다. 이제 내 자리가 아래 중앙에 크게 나오고, 폴드해도 내 카드는 선명하게 유지됩니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.9",
		date: "2026-09-19",
		title: "내 자리 중심 레이아웃",
		notes: [
			"혼자 플레이하거나 원격 링크로 참가하면 내 카드가 화면 아래 중앙에 크게 나오고, 다른 참가자들은 위쪽에 작게 일렬로 배치됩니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.8",
		date: "2026-09-19",
		title: "참가 링크는 항상 전체 테이블로",
		notes: [
			"참가 QR·링크가 예전 주소여도 이제 자동으로 전체 테이블 화면으로 이동합니다. 카드 화면은 전체 테이블의 전환 버튼으로만 열립니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.7",
		date: "2026-09-19",
		title: "자동 업데이트와 로그 스크롤",
		notes: [
			"새 버전이 배포되면 자동으로 감지해서 한 번만 새로고침하고 바로 적용됩니다. 이제 두 번씩 새로고침할 필요가 없습니다.",
			"내 카드 화면의 진행 로그가 자체 스크롤 영역으로 바뀌어, 로그가 쌓여도 콜·폴드 버튼이 밀려나지 않습니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.6",
		date: "2026-09-19",
		title: "원격 참가 첫 화면 개선",
		notes: [
			"QR이나 링크로 참가하면 이제 처음부터 전체 테이블 화면이 열립니다. 동반 카드 화면은 전환 버튼으로 이동할 수 있습니다.",
			"내 카드 화면이 가로로 넓거나 낮은 창(PC 브라우저 등)에서도 카드가 이름·칩·버튼을 가리지 않습니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.5",
		date: "2026-09-19",
		title: "리바인·자리비움·중간 참가",
		notes: [
			"칩을 다 잃어도 좌석이 사라지지 않고, 언제든 리바인을 눌러 다음 핸드부터 복귀할 수 있습니다.",
			"사람 좌석에 자리비움 버튼이 생겼습니다. 자리비움 중에는 자동으로 체크/폴드되고, 다음 핸드부터 쉬며, 복귀를 누르면 다시 참가합니다.",
			"봇 좌석의 X로 봇을 내보낼 수 있습니다. 핸드 중에는 예약되어 핸드가 끝나면 나가고, 빈 자리에 이름을 입력하면 새 플레이어가 다음 핸드부터 참가합니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.4",
		date: "2026-09-19",
		title: "공개된 카드가 두 장 모두 보이게 개선",
		notes: [
			"내 좌석의 카드 두 장이 겹치지 않고 나란히 보이며, 폴드한 뒤에도 그대로 확인할 수 있습니다.",
			"쇼다운이나 봇이 카드를 공개할 때도 두 장이 나란히 펼쳐져 승자의 패를 바로 알 수 있습니다.",
			"아웃 표시가 좌석 구석에서 잘리지 않고 카드 위 중앙에 한 줄로 나옵니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.3",
		date: "2026-09-19",
		title: "화면 안정성과 족보 표시 개선",
		notes: [
			"베팅 조작 화면이 뜨거나 아웃 표시가 나타나도 좌석이 더 이상 화면 위아래로 잘리지 않습니다.",
			"리모트 화면에서 내가 폴드해도 내 카드는 계속 선명하게 보입니다 (다른 사람 카드만 흐려짐).",
			"원페어·투페어·트리플·포카드에는 어떤 숫자인지 표시됩니다 (예: “K원페어”).",
		],
		estimated: false,
	},
	{
		version: "1.9.2",
		date: "2026-09-19",
		title: "진행 속도 2배 업",
		notes: [
			"봇이 생각하는 시간, 알림 표시 속도, 커뮤니티 카드 공개 간격, 칩 이동 애니메이션을 모두 절반으로 줄여 게임이 훨씬 빠르게 진행됩니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.1",
		date: "2026-09-19",
		title: "화면 스크롤 없이 한눈에",
		notes: [
			"테이블 화면이 스크롤 없이 한 화면에 다 들어오도록 좌석과 카드 크기를 화면 높이에 맞춰 조정합니다.",
		],
		estimated: false,
	},
	{
		version: "1.9.0",
		date: "2026-09-19",
		title: "봇 이름 개선",
		notes: [
			"빈 좌석을 채우는 봇 이름이 “봇 1”, “봇 2” 대신 흔한 이름으로 바뀝니다.",
		],
		estimated: false,
	},
	{
		version: "1.8.0",
		date: "2026-09-19",
		title: "블라인드 업 설정과 레이즈/올인 이펙트",
		notes: [
			"시작 전에 “블라인드 업” 체크를 해제하면 블라인드가 오르지 않고 처음 금액으로 계속 진행됩니다.",
			"새 라운드 대기 시간의 기본값을 20초에서 5초로 줄이고, 푸터에서 3~60초 사이로 직접 설정할 수 있습니다.",
			"레이즈하면 좌석에 노란색 펄스가, 올인하면 빨간색 글로우가 떠서 한눈에 알아볼 수 있습니다.",
		],
		estimated: false,
	},
	{
		version: "1.7.0",
		date: "2026-09-19",
		title: "아웃 표시 추가",
		notes: [
			"플랍이나 턴에서 스트레이트 이상을 완성하지 못한 핸드는 남은 카드로 완성할 확률과 필요한 카드를 보여주는 노란색 “아웃” 표시가 뜹니다.",
			"이미 스트레이트 이상을 만들었거나 리버에서는 표시되지 않습니다.",
		],
		estimated: false,
	},
	{
		version: "1.6.0",
		date: "2026-09-19",
		title: "테이블 확장과 리바인",
		notes: [
			"테이블 좌석이 6명에서 8명까지 늘어나 더 많은 친구와 봇이 함께할 수 있습니다.",
			"파산한 플레이어는 핸드 사이에 좌석에서 새 스택으로 리바인해 계속 참여할 수 있습니다.",
			"좌석과 테이블 스타일을 다듬어 가독성을 높였습니다.",
		],
		estimated: false,
	},
	{
		version: "1.5.2",
		date: "2026-08-22",
		title: "Sharper paired-board calls",
		notes: [
			"Bots now judge private pair strength more carefully when a paired board makes a hand look like two pair.",
			"Weak lower pairs and small pocket pairs are easier to release under pressure, while stronger board pairs and overpairs keep their defensive role.",
			"Postflop defense stays active without relying on structurally weak bluffcatchers.",
		],
		estimated: false,
	},
	{
		version: "1.5.1",
		date: "2026-08-22",
		title: "Cleaner multi-raised pots",
		notes: [
			"Bots are now more selective when calling additional preflop raises with fragile hands that play poorly after the flop.",
			"Suited, connected, paired, and otherwise playable hands keep their role while weaker speculative hands reach fewer difficult pots.",
		],
		estimated: false,
	},
	{
		version: "1.5.0",
		date: "2026-07-31",
		title: "Your-turn sound alerts",
		credit: {
			name: "dedodgingese",
			url: "https://github.com/dedodgingese",
		},
		notes: [
			"A short sound now signals when it is time for a human player to act.",
			"Solo games play the alert on the shared table, while multiplayer alerts stay on the active player's companion or remote view.",
			"A saved Sound on/off control lets each device silence alerts.",
		],
		estimated: false,
	},
	{
		version: "1.4.0",
		date: "2026-06-19",
		title: "Continue saved games",
		notes: [
			"Unfinished Solo vs Bots games can now be continued after reopening the table on the same device.",
			"A startup prompt lets you continue the saved game or start fresh.",
		],
		estimated: false,
	},
	{
		version: "1.2.9",
		date: "2026-06-15",
		title: "Smarter preflop realization",
		notes: [
			"Bots now judge fragile short-handed starts more by connectivity, suitedness, domination risk, and position instead of one narrow offsuit rule.",
			"Low connected offsuit hands can still stay active when they play well enough, while disconnected trash stays out.",
			"Small-blind heads-up and three-handed button pots should keep their action, with fewer passive weak limps.",
		],
		estimated: false,
	},
	{
		version: "1.2.8",
		date: "2026-06-15",
		title: "Cleaner short-handed starts",
		notes: [
			"Bots now avoid more weak offsuit junk limps when first in from the small blind heads-up or the button three-handed.",
			"Playable suited hands, connectors, pairs, and stronger broadways keep their normal short-handed role.",
			"Short-handed pots should still stay active, but fewer fragile offsuit starts should reach weak flops.",
		],
		estimated: false,
	},
	{
		version: "1.2.7",
		date: "2026-06-14",
		title: "Sharper first-in preflop ranges",
		notes: [
			"Bots now keep more playable broadway hands and small pairs in suitable first-in spots instead of folding them too often.",
			"Early seats and fuller tables stay more selective, so the added playability should not turn into broad loose opening.",
			"Late and short-handed first-in pots should feel more credible while the overall tournament pace stays close to the previous version.",
		],
		estimated: false,
	},
	{
		version: "1.2.6",
		date: "2026-05-13",
		title: "More active tournament play",
		notes: [
			"Bots now play short-handed tournament spots more actively, especially when stealing blinds or defending against steals.",
			"Button and small-blind situations should create more realistic pressure instead of waiting too often for premium hands.",
			"Marginal blind defenses are still trimmed in the riskiest spots, so the added action stays more disciplined.",
		],
		estimated: false,
	},
	{
		version: "1.2.5",
		date: "2026-05-12",
		title: "Better flop defense",
		notes: [
			"Bots now defend more plausible high-card flops with ace-high, overcards, or useful backdoor potential when the price is close.",
			"Very weak no-pair hands and bad weak draws are still released, so the added defense should not turn into broad loose calling.",
			"Standard flop bluffs should have less automatic success against hands that still belong in a defended range.",
		],
		estimated: false,
	},
	{
		version: "1.2.4",
		date: "2026-05-11",
		title: "Cleaner multiway call defense",
		notes: [
			"Bots now avoid more weak offsuit ace and king calls with the lowest kickers when facing raises in multiway pots.",
			"Heads-up blind defense, suited versions, stronger broadways, pairs, and aggressive preflop lines keep their normal role.",
			"These hands should create fewer weak high-card and fragile pair spots after the flop without making playable hands broadly disappear.",
		],
		estimated: false,
	},
	{
		version: "1.2.3",
		date: "2026-05-11",
		title: "Cleaner heads-up blind limps",
		notes: [
			"Heads-up small-blind bots now avoid open-limping the weakest offsuit ace hands, choosing a raise or fold more often instead.",
			"Suited aces, suited kings, connectors, pairs, and normal raising ranges keep their active role.",
			"Weak ace starts should create fewer high-card and weak-pair rescue spots without making the small blind broadly tighter.",
		],
		estimated: false,
	},
	{
		version: "1.2.2",
		date: "2026-05-11",
		title: "Cleaner small-pair starts",
		notes: [
			"Bots now avoid open-limping the smallest pairs from most first-in seats, choosing a raise or fold instead.",
			"Cheap heads-up small-blind limps stay available, so short-handed blind play keeps its lower-cost option.",
			"Small pair starts should create fewer weak underpair flops without removing normal pair aggression.",
		],
		estimated: false,
	},
	{
		version: "1.2.1",
		date: "2026-05-11",
		title: "Cleaner blind defense",
		notes: [
			"Bots now defend the big blind a little more selectively with weak suited hands after a raise.",
			"Weak suited misses should reach the flop less often, while pairs, broadways, suited connectors, and other playable defenses keep their normal role.",
			"Postflop action and showdown flow stay close to the previous version.",
		],
		estimated: false,
	},
	{
		version: "1.2.0",
		date: "2026-05-10",
		title: "Automatic next round",
		notes: [
			"After a completed hand, the New Round button now shows a short countdown before the next hand starts automatically.",
			"A compact cancel control can stop the automatic start while keeping the normal New Round button available.",
			"Game-over summaries stay manual and do not start another hand.",
		],
		estimated: false,
	},
	{
		version: "1.1.0",
		date: "2026-05-02",
		title: "Stronger game engine foundation",
		notes: [
			"Core poker flow now runs through clearer shared engine paths for actions, betting rounds, streets, hand starts, hand endings, and showdown results.",
			"Bot tournaments can be validated across much larger simulated samples, making bot tuning less noisy and reducing the risk of rule regressions.",
			"All-ins, side pots, heads-up blinds, action order, bustouts, and full-hand runouts now have broader direct coverage.",
			"The visible table experience stays the same while the rules foundation becomes faster to validate and safer to evolve.",
		],
		estimated: false,
	},
	{
		version: "1.0.30",
		date: "2026-04-29",
		title: "Stronger checked postflop ranges",
		notes: [
			"Bots can now keep more real value in their checking range after the flop, so a checked street is less automatically weak.",
			"Some strong value hands now check with the intention of raising if an opponent bets into them.",
			"Broader value checks can still continue through normal call-or-raise decisions, improving defense without making bots broadly more aggressive.",
		],
		estimated: false,
	},
	{
		version: "1.0.29",
		date: "2026-04-26",
		title: "Sharper first-in preflop choices",
		notes: [
			"Bots now choose first-in raises and limps with more attention to position, hand shape, and short-handed table flow.",
			"Weak dominated open-limps are less common, while pairs, suited hands, connectors, and stronger broadways keep their playable role.",
			"Small-blind heads-up and button three-handed spots stay active without turning every first-in hand into raise-or-fold poker.",
		],
		estimated: false,
	},
	{
		version: "1.0.28",
		date: "2026-04-26",
		title: "More context-aware preflop calls",
		notes: [
			"Bots now judge passive preflop calls more by position, price, and blind-defense context.",
			"Weak dominated hands are easier to release, while suited hands, pairs, and connected hands keep their playable role.",
			"Short-handed play keeps its action, but passive calls should now produce cleaner flop ranges.",
		],
		estimated: false,
	},
	{
		version: "1.0.27",
		date: "2026-04-26",
		title: "Cleaner passive preflop calls",
		notes: [
			"Bots now avoid more weak offsuit hands in passive preflop call and limp spots.",
			"Playable suited hands, pairs, and stronger broadways remain active, while dominated junk reaches the flop less often.",
			"Flop defense is now supported by cleaner preflop inputs instead of rescuing too many weak missed hands later.",
		],
		estimated: false,
	},
	{
		version: "1.0.26",
		date: "2026-04-26",
		title: "Cleaner late-street bluffcatching",
		notes: [
			"Bots now release more weak Turn and River bluffcatchers when their hand strength mostly comes from the board.",
			"Thin public-pair and kicker-only continues are less likely to carry defense against pressure.",
			"Private made hands, clear pair value, and real drawing equity before the River keep their existing defensive role.",
		],
		estimated: false,
	},
	{
		version: "1.0.25",
		date: "2026-04-26",
		title: "More credible postflop defense",
		notes: [
			"Bots now defend postflop with more emphasis on credible hand quality instead of filling call frequency with weak bluffcatchers.",
			"Cheap bets are still defended more readily, but weak board-only, kicker-only, and bad-price draw hands are easier to release.",
			"Flop calls stay selective, with extra defense coming from plausible equity rather than broad weak-pair continues.",
		],
		estimated: false,
	},
	{
		version: "1.0.24",
		date: "2026-04-24",
		title: "Cleaner side-pot all-ins",
		notes: [
			"Bots no longer turn all-in side-pot calls into raises when no opponent can call extra chips.",
			"Late-hand all-ins now stay closer to the real available action, reducing misleading reraise pressure.",
			"Strong value can still raise normally when at least one live opponent can call the extra amount.",
		],
		estimated: false,
	},
	{
		version: "1.0.23",
		date: "2026-04-23",
		title: "More selective pair play after the flop",
		notes: [
			"Bots now separate strong pair value more clearly from weaker or board-driven pair spots after the flop.",
			"Checked-to pair bets and reraises became more selective, especially in multiway pots and other thin early-tournament situations.",
			"Weaker pair hands are less likely to bloat pots, while clear value hands still keep their normal pressure.",
			"Short-stack postflop decisions stay aggressive with real value but are less eager to stack off with marginal pair strength.",
			"Internal speedmode reporting was updated so these weaker pair spots stay visible in diagnostics.",
		],
		estimated: false,
	},
	{
		version: "1.0.22",
		date: "2026-04-19",
		title: "Fixed tournament sizing and early deep-stack frequency",
		notes: [
			"Replaced preflop sizing with fixed tournament-style opens, 3-bets, squeezes, and 4-bets.",
			"Made preflop IP/OOP sizing follow the current hand's action order relative to the last aggressor.",
			"Capped postflop sizing to clear 30, 40, 55, and 75 percent pot buckets.",
			"Reduced early deep-stack reraises so level 0-1 pots escalate less often before stacks naturally get shallow.",
			"Kept normal opens, standard checked-to aggression, and Harrington short-stack behavior intact.",
		],
		estimated: false,
	},
	{
		version: "1.0.21",
		date: "2026-04-14",
		title: "Slowplay and bustout-call tightening",
		notes: [
			"Restricted postflop slowplay to clearer trap spots so strong value hands no longer check back rivers, multiway spots, or other thin-delay situations.",
			"Added an edge-scaled postflop elimination-relief path for heads-up tournament-life calls with strong private made hands on unpaired boards.",
			"Kept paired-board all-in folds structurally tighter so dangerous trips and full-house runouts still respect the tougher stackoff context.",
		],
		estimated: false,
	},
	{
		version: "1.0.20",
		date: "2026-04-13",
		title: "MDF defense and alpha bluffing",
		notes: [
			"Added MDF-based postflop defense so bots no longer overfold thin bluff-catch spots.",
			"Extended that MDF defense to marginal and thin turn situations so more weak-but-playable hands stay in the game.",
			"Made pure bluffs follow a clearer alpha-based frequency model so bluffing and defending now work from the same basic risk-reward idea.",
		],
		estimated: false,
	},
	{
		version: "1.0.19",
		date: "2026-04-09",
		title: "Marginal-edge postflop tuning",
		notes: [
			"Added a shared treatment for marginal postflop hands so thin spots behave more consistently.",
			"Made small made hands and weak draws more pot-control oriented under pressure.",
			"Kept thin heads-up river bluff-catching available while trimming fragile hope-calls.",
		],
		estimated: false,
	},
	{
		version: "1.0.18",
		date: "2026-04-07",
		title: "Minimum-aware reraise calls",
		notes: [
			"Stopped some over-forced reraises from being inflated into larger raises than intended.",
			"Kept real short-stack all-ins available while softening awkward non-all-in escalation.",
		],
		estimated: false,
	},
	{
		version: "1.0.17",
		date: "2026-04-06",
		title: "Edge-first postflop sizing and reraise damping",
		notes: [
			"Reworked postflop bet sizing so edge matters more than noisy spot modifiers.",
			"Reduced forced overbetting and calmer multi-raise escalation.",
			"Made aggressive postflop lines feel more controlled and less swingy.",
		],
		estimated: false,
	},
	{
		version: "1.0.16",
		date: "2026-04-05",
		title: "Postflop cost curve and speedmode diagnostics",
		notes: [
			"Made private hand improvements matter more in postflop decisions.",
			"Improved postflop risk handling and checked-to filtering.",
			"Added better internal reporting for blocked follow-up spots.",
		],
		estimated: false,
	},
	{
		version: "1.0.15",
		date: "2026-04-03",
		title: "Spot-first non-value tuning",
		notes: [
			"Made non-value postflop decisions react more to the actual spot structure.",
			"Tightened loose stabs so passive spots need cleaner permission before turning aggressive.",
		],
		estimated: false,
	},
	{
		version: "1.0.14",
		date: "2026-04-03",
		title: "Situational non-value read tuning",
		notes: [
			"Made postflop reads more situational instead of table-average based.",
			"Tightened free bluffing while keeping normal c-bets and barrels available.",
		],
		estimated: false,
	},
	{
		version: "1.0.13",
		date: "2026-04-03",
		title: "Postflop premium rescue guardrail",
		notes: [
			"Added a safety net so very strong postflop hands no longer fold away too often.",
			"Kept the rest of the postflop logic intact around that narrow guardrail.",
		],
		estimated: false,
	},
	{
		version: "1.0.12",
		date: "2026-04-03",
		title: "River low-edge call guardrail",
		notes: [
			"Stopped busted draw pressure from leaking into finished river boards.",
			"Added a river safety check to cut very weak bluff-catch calls.",
		],
		estimated: false,
	},
	{
		version: "1.0.11",
		date: "2026-04-02",
		title: "Score-based private edge signals",
		notes: [
			"Reworked private postflop edge signals to be more score-based and direct.",
			"Added a new `meaningful` lift tier between kicker and structural spots.",
			"Updated logs and summaries so these spot types stay visible.",
		],
		estimated: false,
	},
	{
		version: "1.0.10",
		date: "2026-04-02",
		title: "Private-edge postflop guardrails",
		notes: [
			"Stopped dedicated bluff lines from leaking into private made hands.",
			"Added a small private-edge check for postflop value and protection raises.",
			"Expanded logs and docs so private-edge spots are easier to read.",
		],
		estimated: false,
	},
	{
		version: "1.0.9",
		date: "2026-04-02",
		title: "Premium preflop no-fold guardrail",
		notes: [
			"Added a simple guardrail so premium preflop hands no longer fold away.",
			"Kept the rest of the tournament bot logic unchanged around that safety check.",
			"Aligned the premium threshold across runtime and debug output.",
		],
		estimated: false,
	},
	{
		version: "1.0.8",
		date: "2026-04-02",
		title: "Legacy bot baseline restored",
		notes: [
			"Restored the older heuristic tournament bot as the active default.",
			"Moved the bot back toward more playable tournament-style behavior.",
			"Updated the docs so they match the live runtime again.",
		],
		estimated: false,
	},
	{
		version: "1.0.7",
		date: "2026-04-01",
		title: "Short-handed opens and passive-street probes",
		notes: [
			"Improved short-handed opening ranges, especially in late short-table spots.",
			"Made bots react better after passive heads-up streets.",
			"Added a few more heads-up probe opportunities to reduce full check-through lines.",
		],
		estimated: false,
	},
	{
		version: "1.0.6",
		date: "2026-03-31",
		title: "Spot-based bot baseline stabilization",
		notes: [
			"Finished the move to more explicit preflop spot policies.",
			"Cleaned up short-stack and multi-raised behavior.",
			"Split postflop made-hand defense into clearer strength tiers.",
			"Added a small stab tune for checked-to weak spots.",
		],
		estimated: false,
	},
	{
		version: "1.0.5",
		date: "2026-03-31",
		title: "TAG bot tuning consolidation",
		notes: [
			"Moved the bot toward a clearer TAG-style baseline.",
			"Reworked unopened preflop ranges by seat and table size.",
			"Retuned heads-up and short-handed play to stay active without getting sloppy.",
			"Kept public-board safety while allowing more real c-bets and semibluffs.",
		],
		estimated: false,
	},
	{
		version: "1.0.4",
		date: "2026-03-31",
		title: "Hand-based blind progression",
		notes: [
			"Changed blind progression from orbit-based jumps to a hand-based cadence.",
			"Cleaned up the blind ladder to feel more like a normal tournament structure.",
			"Kept the rest of the table flow unchanged.",
		],
		estimated: false,
	},
	{
		version: "1.0.3",
		date: "2026-03-30",
		title: "Tournament unopened raise-or-fold",
		notes: [
			"Switched unopened green-zone preflop play to raise-or-fold.",
			"Standardized normal tournament open sizes around 2.5bb.",
			"Left push-or-fold and other preflop branches alone.",
		],
		estimated: false,
	},
	{
		version: "1.0.2",
		date: "2026-03-30",
		title: "Public-board postflop fix",
		notes: [
			"Split postflop strength into private aggression and public-board defense.",
			"Stopped weak board-made hands from value-raising too often.",
			"Kept narrow semibluff exceptions for stronger draw spots.",
		],
		estimated: false,
	},
	{
		version: "1.0.1",
		date: "2026-03-30",
		title: "Spot-aware bot reads",
		notes: [
			"Replaced table-average reads with more spot-aware bot reads.",
			"Made limped, raised, multi-raised, and multiway spots matter more directly.",
			"Reduced loose non-value aggression in crowded or strength-shown spots.",
		],
		estimated: false,
	},
	{
		version: "1.0.0",
		date: "2026-03-29",
		title: "Stable first public version",
		notes: [
			"Established the first stable public version of the table.",
			"Unified winner and chip-transfer rendering across views.",
			"Fixed a few remaining side-pot edge cases.",
		],
		estimated: false,
	},
	{
		version: "0.9.0",
		date: "2026-03-25",
		title: "Full remote multiplayer table",
		notes: [
			"Added a dedicated remote table view.",
			"Added remote actions and switching between companion and full-table views.",
			"Synced action labels and winner reactions across remote views.",
		],
		estimated: true,
	},
	{
		version: "0.6.0",
		date: "2026-03-16",
		title: "Session overlays and playback polish",
		notes: [
			"Added stats, log, and instructions overlays.",
			"Added winner reactions.",
			"Added fast forward for bot-only hands.",
		],
		estimated: true,
	},
	{
		version: "0.5.0",
		date: "2026-01-31",
		title: "Tournament-style bot upgrades",
		notes: [
			"Expanded the bots toward more tournament-style play.",
			"Improved postflop handling and spectator presentation.",
			"Kept app updates rolling out more reliably during active iteration.",
		],
		estimated: true,
	},
	{
		version: "0.4.0",
		date: "2025-12-22",
		title: "Synced companion view",
		notes: [
			"Added backend-backed state sync for the companion view.",
			"Added synced polling and notifications in the hole-card view.",
			"Established the optional sync architecture described in the README.",
		],
		estimated: true,
	},
	{
		version: "0.3.0",
		date: "2025-06-15",
		title: "Offline-ready table",
		notes: [
			"Added service-worker caching and offline fallback behavior.",
			"Improved update handling for cached builds.",
			"Reached the first offline-ready table state.",
		],
		estimated: true,
	},
	{
		version: "0.2.0",
		date: "2025-06-09",
		title: "Bots and adaptive table flow",
		notes: [
			"Added bot auto-seating and the first basic bot strategy.",
			"Improved bot actions with better pot-odds and position awareness.",
			"Added early player stats tracking for bot behavior.",
		],
		estimated: true,
	},
	{
		version: "0.1.0",
		date: "2025-06-05",
		title: "Playable local poker table",
		notes: [
			"Added the core local table flow with betting, pot tracking, and notifications.",
			"Added showdown evaluation and side-pot handling.",
			"Reached the first clearly playable local version.",
		],
		estimated: true,
	},
];
