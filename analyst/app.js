/* ============================================================
 *  Handball Analyzer — app.js (bootstrap + DOM + state wiring)
 * ============================================================
 *
 *  Pure helpers (no DOM, testable) live in lib/:
 *    - lib/roster.js   : HA.roster  (load/save, defaults, name utils)
 *    - lib/stats.js    : HA.stats   (score, dashboard, aggregations)
 *    - lib/csv.js      : HA.csv     (escape, shotToRow, download)
 *
 *  Section map (search the BANNER text to jump):
 *    [STATE]          state {}, constants
 *    [UI REFS]        ui = { ... }
 *    [PERSISTENCE]    saveState / loadState / clearSavedState
 *    [TIMER+PERIOD]   timer toggle, period chip
 *    [GK ROW]         renderGkRow (dynamic from roster)
 *    [ROSTER]         playerPositions wrapper
 *    [PLAYER MODAL]   populatePlayerStep, bench toggle
 *    [LINEUP MODAL]   openLineupModal, bench/field player swap
 *    [COURT INPUT]    onCourtDown/Up/Move, swipe vs tap, hint
 *    [RESULT FLOW]    step-result → step-course → step-player
 *    [TURNOVER]       TO button, step-to-reason
 *    [PLOTS]          renderPlots, attachPlotLongPress
 *    [STATS / SUMMARY] calculateStats, generateSummary
 *    [SETTINGS MODAL] roster editor, data management
 *    [EDIT SHOT]      long-press → openEditShotModal
 *    [HISTORY+CSV]    archive, history modal, export
 *    [MODAL CLOSE]    attachSwipeDownClose for all modals
 *    [BOOT]           restore on load
 * ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    const state = {
        mode: 'attack',
        shots: [],
        currentDraftShot: null,
        timer: { running: false, seconds: 0, interval: null },
        score: { us: 0, opponent: 0 },
        currentGk: '桑原',
        rsFilter: 'all',
        lineup: [],            // 出場中の選手名（最大6名、GKを除く）
        period: 1,             // 1=前半, 2=後半
        inputMode: 'swipe',    // 'swipe' or 'modal'
        viewMatch: null,       // 履歴詳細を表示中なら match オブジェクト、現在試合なら null
        // 分析担当用 v2: 試合中の切替（押した状態が以後の記録に付く）
        numbers: 'even',       // even=同数 / plus=多い / minus=少ない / seven=7人攻撃
        oppDef: '',            // 相手の守備の形 60 / 51 / 321 / other（未選択は空）
        oppGk: ''              // 相手GKの背番号
    };

    const LINEUP_MAX = 6;
    const SWIPE_THRESHOLD_PX = 25;

    const ui = {
        app: document.getElementById('app'),
        modeAttack: document.getElementById('mode-attack'),
        modeDefense: document.getElementById('mode-defense'),
        courtContainer: document.getElementById('court-container'),
        plotsContainer: document.getElementById('plots-container'),
        instruction: document.getElementById('court-instruction'),
        modal: document.getElementById('action-modal'),
        stepResult: document.getElementById('step-result'),
        stepCourse: document.getElementById('step-course'),
        stepPlayer: document.getElementById('step-player'),
        stepToReason: document.getElementById('step-to-reason'),
        btnSkipCourse: document.getElementById('btn-skip-course'),
        btnSkipToReason: document.getElementById('btn-skip-to-reason'),
        toReasonBreakdown: document.getElementById('to-reason-breakdown'),
        lineupGrid: document.getElementById('lineup-grid'),
        benchGrid: document.getElementById('bench-grid'),
        lineupCount: document.getElementById('lineup-count'),
        lineupEmptyHint: document.getElementById('lineup-empty-hint'),
        lineupSection: document.getElementById('lineup-section'),
        btnEditLineup: document.getElementById('btn-edit-lineup'),
        benchToggle: document.getElementById('bench-toggle'),
        benchArrow: document.getElementById('bench-arrow'),
        lineupModal: document.getElementById('lineup-modal'),
        lineupOnGrid: document.getElementById('lineup-on-grid'),
        lineupBenchGrid: document.getElementById('lineup-bench-grid'),
        lineupOnCount: document.getElementById('lineup-on-count'),
        playerStepTitle: document.getElementById('player-step-title'),
        btnSkipPlayer: document.getElementById('btn-skip-player'),
        timeDisplay: document.getElementById('time-display'),
        timerToggle: document.getElementById('timer-toggle'),
        periodToggle: document.getElementById('period-toggle'),
        periodBreakdown: document.getElementById('period-breakdown'),
        attackTypeBreakdown: document.getElementById('attack-type-breakdown'),
        courseBreakdown: document.getElementById('course-breakdown'),
        inputModeChip: document.getElementById('input-mode-chip'),
        instructionText: document.getElementById('instruction-text'),
        swipeHint: document.getElementById('swipe-hint'),
        scoreUs: document.getElementById('score-us'),
        scoreOpponent: document.getElementById('score-opponent'),
        statAttackEfficiency: document.getElementById('stat-attack-efficiency'),
        statShotAccuracy: document.getElementById('stat-shot-accuracy'),
        statGkSave: document.getElementById('stat-gk-save-rate'),
        btnSaveText: document.getElementById('btn-save-text'),
        btnCancel: document.querySelectorAll('.btn-cancel'),
        btnUndo: document.getElementById('btn-undo'),
        btnReset: document.getElementById('btn-reset'),
        btnData: document.getElementById('btn-data'),
        btnTurnover: document.getElementById('btn-turnover'),
        summaryModal: document.getElementById('summary-modal'),
        summaryTbody: document.getElementById('summary-table-body'),
        sumAttackTotal: document.getElementById('sum-attack-total'),
        sumAttackShots: document.getElementById('sum-attack-shots'),
        sumAttackTurnovers: document.getElementById('sum-attack-turnovers'),
        sumAttackGoals: document.getElementById('sum-attack-goals'),
        sumAttackEfficiency: document.getElementById('sum-attack-efficiency'),
        sumShotAccuracy: document.getElementById('sum-shot-accuracy'),
        sumGkSaveRateSummary: document.getElementById('sum-gk-save-rate-summary'),
        sumDefTotal: document.getElementById('sum-def-total'),
        sumDefShots: document.getElementById('sum-def-shots'),
        sumDefTarget: document.getElementById('sum-def-target'),
        sumDefTurnovers: document.getElementById('sum-def-turnovers'),
        sumGkSaves: document.getElementById('sum-gk-saves'),
        gkIndividualStats: document.getElementById('gk-individual-stats'),
        btnDownloadImg: document.getElementById('btn-download-img'),
        toast: document.getElementById('toast'),
        gkBtns: document.querySelectorAll('.gk-btn'),
        dateInput: document.getElementById('match-date'),
        opponentInput: document.getElementById('match-opponent')
    };

    // ── Persistence (localStorage auto-save) ──
    const STORAGE_KEY = 'handball-analyst-state-v1';

    function saveState() {
        try {
            const snapshot = {
                shots: state.shots,
                score: state.score,
                timer: { seconds: state.timer.seconds },
                mode: state.mode,
                currentGk: state.currentGk,
                lineup: state.lineup,
                period: state.period,
                inputMode: state.inputMode,
                matchDate: ui.dateInput.value,
                matchOpponent: ui.opponentInput.value,
                cloudMatchId: state.cloudMatchId || null,
                numbers: state.numbers,
                oppDef: state.oppDef,
                oppGk: state.oppGk,
                savedAt: Date.now()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        } catch (e) {
            console.warn('saveState failed', e);
        }
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const snap = JSON.parse(raw);
            if (!snap || typeof snap !== 'object') return false;

            state.shots = Array.isArray(snap.shots) ? snap.shots : [];
            state.score = snap.score && typeof snap.score === 'object'
                ? { us: snap.score.us|0, opponent: snap.score.opponent|0 }
                : { us: 0, opponent: 0 };
            state.timer.seconds = (snap.timer && typeof snap.timer.seconds === 'number') ? snap.timer.seconds : 0;
            state.mode = snap.mode === 'defense' ? 'defense' : 'attack';
            state.currentGk = snap.currentGk || state.currentGk;
            state.lineup = Array.isArray(snap.lineup) ? snap.lineup.filter(p => playerPositions.includes(p)) : [];
            state.period = (snap.period === 2) ? 2 : 1;
            applyPeriodToUI();
            state.inputMode = snap.inputMode === 'modal' ? 'modal' : 'swipe';
            applyInputModeToUI();

            if (snap.matchDate) ui.dateInput.value = snap.matchDate;
            if (snap.matchOpponent) ui.opponentInput.value = snap.matchOpponent;
            state.cloudMatchId = snap.cloudMatchId || null;
            state.numbers = ['even', 'plus', 'minus', 'seven'].includes(snap.numbers) ? snap.numbers : 'even';
            state.oppDef = ['60', '51', '321', 'other'].includes(snap.oppDef) ? snap.oppDef : '';
            state.oppGk = typeof snap.oppGk === 'string' ? snap.oppGk : '';
            if (typeof applyLiveTagsToUI === 'function') applyLiveTagsToUI();

            // Mode radio + classes
            if (state.mode === 'defense') {
                ui.modeDefense.checked = true;
                ui.app.classList.remove('attack-mode');
                ui.app.classList.add('defense-mode');
                ui.btnSaveText.textContent = '🟡 自軍GKセーブ';
            } else {
                ui.modeAttack.checked = true;
                ui.app.classList.remove('defense-mode');
                ui.app.classList.add('attack-mode');
                ui.btnSaveText.textContent = '🟡 相手GKセーブ';
            }

            // GK row (re-render to reflect restored currentGk)
            if (typeof renderGkRow === 'function') renderGkRow();

            updateScoreDOM();
            updateTimer();
            renderPlots();
            calculateStats();

            // Hide the "tap to record" overlay if there's already data
            if (state.shots.length > 0) ui.instruction.style.opacity = '0';

            return state.shots.length > 0 || state.timer.seconds > 0
                || state.score.us > 0 || state.score.opponent > 0;
        } catch (e) {
            console.warn('loadState failed', e);
            return false;
        }
    }

    function clearSavedState() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }

    // Set today's date as default
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 10);
    ui.dateInput.value = localISOTime;

    // Persist match info on edit
    ui.dateInput.addEventListener('change', saveState);
    ui.opponentInput.addEventListener('input', saveState);

    // ── GK row: rendered from roster ──
    const gkContainer = document.getElementById('gk-toggle-container');
    function renderGkRow() {
        // Remove existing buttons (keep label)
        gkContainer.querySelectorAll('.gk-btn').forEach(b => b.remove());
        const gks = getGkShortNames();
        // Ensure currentGk is valid
        if (gks.length > 0 && !gks.includes(state.currentGk)) {
            state.currentGk = gks[0];
        }
        gks.forEach(short => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'gk-btn';
            if (short === state.currentGk) btn.classList.add('active');
            btn.setAttribute('data-gk', short);
            btn.textContent = short;
            btn.addEventListener('click', () => {
                state.currentGk = short;
                gkContainer.querySelectorAll('.gk-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                saveState();
            });
            gkContainer.appendChild(btn);
        });
    }
    // renderGkRow() is called after roster is loaded (below)

    // ── Roster (loadable, editable) — delegates to HA.roster ──
    const stripGradePrefix = HA.roster.stripGradePrefix;
    const makeDefaultRoster = HA.roster.makeDefault;
    function saveRoster() { HA.roster.save(state.roster); }

    state.roster = HA.roster.load();
    let playerPositions = state.roster.map(p => p.name);
    function refreshRosterDerivatives() {
        playerPositions = state.roster.map(p => p.name);
    }
    function getGkShortNames() {
        return HA.roster.getGkShortNames(state.roster);
    }
    renderGkRow();

    // ── Firebase /roster とリアルタイム同期（共通名簿マスター）──
    // mental app と同じ Firebase プロジェクトの /roster を購読して
    // 名簿が更新されたら自動で UI に反映する。
    (function initFirebaseRosterSync() {
        if (!window.FIREBASE_READY || !window.HA.roster.subscribeFirebase) return;
        let firstSync = true;
        HA.roster.subscribeFirebase((fbRoster) => {
            if (!Array.isArray(fbRoster) || fbRoster.length === 0) return;
            // 既存のロースターを Firebase の内容で置換
            state.roster = fbRoster.map(p => ({
                name: p.name,
                isGK: !!p.isGK,
                rosterId: p.rosterId || null
            }));
            HA.roster.save(state.roster);
            refreshRosterDerivatives();
            if (typeof renderGkRow === 'function') renderGkRow();
            // 設定モーダルが開いていれば再描画
            if (typeof renderRosterEditor === 'function') {
                try { renderRosterEditor(); } catch (e) {}
            }
            if (firstSync) {
                console.log('[analyzer] Firebase 名簿 ' + fbRoster.length + '名 同期');
                firstSync = false;
            }
        });
    })();

    // ── Home-screen lineup chip ──
    const btnHomeLineup = document.getElementById('btn-home-lineup');
    const homeLineupCount = document.getElementById('home-lineup-count');
    function updateHomeLineupCount() {
        if (!homeLineupCount) return;
        const n = state.lineup ? state.lineup.length : 0;
        homeLineupCount.textContent = `${n}/${LINEUP_MAX}`;
        if (btnHomeLineup) {
            btnHomeLineup.classList.toggle('empty', n === 0);
        }
    }
    if (btnHomeLineup) {
        btnHomeLineup.addEventListener('click', () => {
            openLineupModal();
        });
    }

    function createPlayerBtn(pos, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'player-btn';
        if (pos.startsWith('③')) btn.classList.add('grade-3');
        else if (pos.startsWith('②')) btn.classList.add('grade-2');
        else if (pos.startsWith('①')) btn.classList.add('grade-1');
        btn.textContent = pos;
        btn.onclick = onClick;
        return btn;
    }

    // ── Roster modal population (called when modal opens) ──
    function populatePlayerStep() {
        // Lineup grid
        ui.lineupGrid.innerHTML = '';
        state.lineup.forEach(p => {
            ui.lineupGrid.appendChild(createPlayerBtn(p, () => handlePlayerSelect(p)));
        });
        ui.lineupCount.textContent = `${state.lineup.length}/${LINEUP_MAX}`;

        // Empty hint + bench expansion behavior
        const hasLineup = state.lineup.length > 0;
        if (hasLineup) {
            ui.lineupEmptyHint.classList.add('hidden');
            // Bench starts collapsed when lineup is set
            ui.benchGrid.classList.add('hidden');
            ui.benchArrow.textContent = '▶';
        } else {
            ui.lineupEmptyHint.classList.remove('hidden');
            // Bench expanded when no lineup
            ui.benchGrid.classList.remove('hidden');
            ui.benchArrow.textContent = '▼';
        }

        // Bench grid (exclude lineup members)
        ui.benchGrid.innerHTML = '';
        playerPositions.forEach(p => {
            if (state.lineup.includes(p)) return;
            ui.benchGrid.appendChild(createPlayerBtn(p, () => handlePlayerSelect(p)));
        });
    }

    // Bench section collapse toggle
    ui.benchToggle.addEventListener('click', () => {
        const isHidden = ui.benchGrid.classList.toggle('hidden');
        ui.benchArrow.textContent = isHidden ? '▶' : '▼';
    });

    // ── Lineup edit modal (live swap, immediate commits) ──
    function openLineupModal() {
        renderLineupModal();
        ui.lineupModal.classList.remove('hidden');
    }

    window.closeLineupModal = function() {
        ui.lineupModal.classList.add('hidden');
    };

    function renderLineupModal() {
        // 出場中 grid — preserve roster order
        ui.lineupOnGrid.innerHTML = '';
        const onCourtSorted = playerPositions.filter(p => state.lineup.includes(p));
        onCourtSorted.forEach(p => {
            ui.lineupOnGrid.appendChild(createPlayerBtn(p, () => benchPlayer(p)));
        });
        ui.lineupOnCount.textContent = `${state.lineup.length}/${LINEUP_MAX}`;

        // ベンチ grid
        ui.lineupBenchGrid.innerHTML = '';
        const atMax = state.lineup.length >= LINEUP_MAX;
        playerPositions.forEach(p => {
            if (state.lineup.includes(p)) return;
            const btn = createPlayerBtn(p, () => fieldPlayer(p));
            if (atMax) btn.classList.add('disabled');
            ui.lineupBenchGrid.appendChild(btn);
        });
    }

    function benchPlayer(p) {
        state.lineup = state.lineup.filter(x => x !== p);
        saveState();
        renderLineupModal();
        populatePlayerStep();
        updateHomeLineupCount();
        showToast(`⬇ ${p.replace(/^[①②③]/, '')} ベンチへ`);
    }

    function fieldPlayer(p) {
        if (state.lineup.length >= LINEUP_MAX) {
            showToast(`⚠ 出場が満員（${LINEUP_MAX}名）`);
            return;
        }
        if (!state.lineup.includes(p)) state.lineup.push(p);
        // Keep stored order canonical (roster order)
        state.lineup = playerPositions.filter(x => state.lineup.includes(x));
        saveState();
        renderLineupModal();
        populatePlayerStep();
        updateHomeLineupCount();
        showToast(`⬆ ${p.replace(/^[①②③]/, '')} 出場へ`);
    }

    ui.btnEditLineup.addEventListener('click', openLineupModal);

    // Toggle logic
    ui.modeAttack.addEventListener('change', () => setMode('attack'));
    ui.modeDefense.addEventListener('change', () => setMode('defense'));

    function setMode(mode) {
        state.mode = mode;
        if (mode === 'attack') {
            ui.app.classList.remove('defense-mode');
            ui.app.classList.add('attack-mode');
            ui.btnSaveText.textContent = '🟡 相手GKセーブ';
        } else {
            ui.app.classList.remove('attack-mode');
            ui.app.classList.add('defense-mode');
            ui.btnSaveText.textContent = '🟡 自軍GKセーブ';
        }
        renderPlots();
        calculateStats();
        saveState();
    }

    // Timer
    ui.timerToggle.addEventListener('click', () => {
        if (state.timer.running) {
            clearInterval(state.timer.interval);
            state.timer.running = false;
            ui.timerToggle.textContent = '▶';
        } else {
            state.timer.running = true;
            ui.timerToggle.textContent = '⏸';
            state.timer.interval = setInterval(() => {
                state.timer.seconds++;
                updateTimer();
                // Save every 10s to limit writes while still being recoverable
                if (state.timer.seconds % 10 === 0) saveState();
            }, 1000);
        }
    });

    function updateTimer() {
        const m = Math.floor(state.timer.seconds / 60).toString().padStart(2, '0');
        const s = (state.timer.seconds % 60).toString().padStart(2, '0');
        ui.timeDisplay.textContent = `${m}:${s}`;
    }

    // ── Period (前半/後半) toggle ──
    function applyPeriodToUI() {
        ui.periodToggle.textContent = state.period === 2 ? '後半' : '前半';
        ui.periodToggle.setAttribute('data-period', String(state.period));
    }

    ui.periodToggle.addEventListener('click', () => {
        state.period = state.period === 1 ? 2 : 1;
        applyPeriodToUI();
        saveState();
        showToast(state.period === 2 ? '🟣 後半に切替' : '🔵 前半に切替');
    });

    // ── B1: Toast notification ──
    function showToast(message) {
        ui.toast.textContent = message;
        ui.toast.classList.add('show');
        clearTimeout(ui.toast._timer);
        ui.toast._timer = setTimeout(() => {
            ui.toast.classList.remove('show');
        }, 1500);
    }

    // ── A2: Turnover Button — opens reason step first ──
    if (ui.btnTurnover) {
        ui.btnTurnover.addEventListener('click', () => {
            state.currentDraftShot = {
                id: Date.now(),
                x: null,
                y: null,
                mode: state.mode,
                result: 'turnover',
                player: null,
                time: state.timer.seconds,
                gk: state.currentGk,
                period: state.period,
                attackType: 'set',
                toReason: null
            };
            // Open modal at the reason step
            ui.modal.classList.remove('hidden');
            ui.stepResult.classList.add('hidden');
            ui.stepCourse.classList.add('hidden');
            ui.stepPlayer.classList.add('hidden');
            ui.stepToReason.classList.remove('hidden');
            resetAnalystSteps();
            resetAttackChips('set');
        });
    }

    function proceedAfterToReason() {
        ui.stepToReason.classList.add('hidden');
        if (state.mode === 'defense') {
            // 相手のTO: 選手選択不要、即記録
            stampLiveTags(state.currentDraftShot);
            state.shots.push(state.currentDraftShot);
            state.currentDraftShot = null;
            ui.modal.classList.add('hidden');
            renderPlots();
            calculateStats();
            saveState();
            showToast('💨 相手ミス記録しました');
        } else {
            // 自TO: ミスした選手を選択
            ui.stepPlayer.classList.remove('hidden');
            ui.playerStepTitle.textContent = 'ミスした選手を選択（任意）';
            ui.btnSkipPlayer.style.display = 'block';
            populatePlayerStep();
        }
    }

    document.querySelectorAll('#step-to-reason .to-reason-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!state.currentDraftShot) return;
            state.currentDraftShot.toReason = e.target.getAttribute('data-reason');
            proceedAfterToReason();
        });
    });

    if (ui.btnSkipToReason) {
        ui.btnSkipToReason.addEventListener('click', () => {
            if (!state.currentDraftShot) return;
            state.currentDraftShot.toReason = null;
            proceedAfterToReason();
        });
    }

    // Skip player selection (for turnovers)
    if (ui.btnSkipPlayer) {
        ui.btnSkipPlayer.addEventListener('click', () => {
            if (!state.currentDraftShot) return;
            state.currentDraftShot.player = null;
            addShotAndClose();
            showToast('💨 ミス記録しました');
        });
    }

    // ── Court interactions (swipe / tap / long-press) ──
    let pointerStart = null;
    let courtLongPressTimer = null;
    const COURT_LONG_PRESS_MS = 600;
    const COURT_LONG_PRESS_MOVE_CANCEL = 10;

    function getEventCoords(e, phase) {
        if (phase === 'end' && e.changedTouches && e.changedTouches[0]) {
            return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        }
        if (e.touches && e.touches[0]) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function onCourtDown(e) {
        if (e.type === 'touchstart') e.preventDefault();
        const c = getEventCoords(e, 'start');
        if (c.x == null || c.y == null) return;
        pointerStart = c;
        // Start long-press timer → TO at this position
        if (courtLongPressTimer) clearTimeout(courtLongPressTimer);
        courtLongPressTimer = setTimeout(() => {
            courtLongPressTimer = null;
            if (!pointerStart) return;
            triggerToAtCourt(pointerStart);
            pointerStart = null; // consume — onCourtUp will short-circuit
            hideSwipeHint();
        }, COURT_LONG_PRESS_MS);
    }

    function clearCourtLongPress() {
        if (courtLongPressTimer) {
            clearTimeout(courtLongPressTimer);
            courtLongPressTimer = null;
        }
    }

    function triggerToAtCourt(startCoords) {
        const rect = ui.courtContainer.getBoundingClientRect();
        const xPct = ((startCoords.x - rect.left) / rect.width) * 100;
        const yPct = ((startCoords.y - rect.top) / rect.height) * 100;
        if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return;
        state.currentDraftShot = {
            id: Date.now(),
            x: xPct, y: yPct,
            mode: state.mode,
            result: 'turnover',
            player: null,
            time: state.timer.seconds,
            gk: state.currentGk,
            period: state.period,
            attackType: 'set',
            toReason: null
        };
        ui.modal.classList.remove('hidden');
        ui.stepResult.classList.add('hidden');
        ui.stepCourse.classList.add('hidden');
        ui.stepPlayer.classList.add('hidden');
        ui.stepToReason.classList.remove('hidden');
        resetAnalystSteps();
        resetAttackChips('set');
    }

    function onCourtUp(e) {
        clearCourtLongPress();
        if (!pointerStart) return;
        if (e.type === 'touchend') e.preventDefault();
        const c = getEventCoords(e, 'end');
        const dx = c.x - pointerStart.x;
        const dy = c.y - pointerStart.y;
        const dist = Math.hypot(dx, dy);
        const startCoords = pointerStart;
        pointerStart = null;
        hideSwipeHint();

        const rect = ui.courtContainer.getBoundingClientRect();
        const xPct = ((startCoords.x - rect.left) / rect.width) * 100;
        const yPct = ((startCoords.y - rect.top) / rect.height) * 100;
        if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return;

        ui.instruction.style.opacity = '0';

        state.currentDraftShot = {
            id: Date.now(), x: xPct, y: yPct,
            mode: state.mode, result: null, player: null,
            time: state.timer.seconds, gk: state.currentGk,
            period: state.period, attackType: 'set'
        };

        // Swipe path: result decided by gesture direction, modal opens at next-needed step
        if (state.inputMode === 'swipe' && dist >= SWIPE_THRESHOLD_PX) {
            let result;
            if (Math.abs(dx) > Math.abs(dy)) result = 'save';
            else if (dy < 0) result = 'goal';
            else result = 'miss';
            state.currentDraftShot.result = result;

            // Open modal but jump past step-result（分析担当用: 次は状況）
            openModal();
            ui.stepResult.classList.add('hidden');
            goToSituationOrNext();
        } else {
            // Tap (or swipe disabled): full modal
            openModal();
        }
    }

    function onCourtCancel() {
        clearCourtLongPress();
        pointerStart = null;
        hideSwipeHint();
    }

    // ── Swipe direction hint (shown during drag) ──
    function hideSwipeHint() {
        ui.swipeHint.classList.add('hidden');
    }
    function showSwipeHint(label, resultKey) {
        ui.swipeHint.textContent = label;
        ui.swipeHint.setAttribute('data-result', resultKey);
        ui.swipeHint.classList.remove('hidden');
    }
    function onCourtMove(e) {
        if (!pointerStart) return;
        const c = getEventCoords(e, 'move');
        if (c.x == null || c.y == null) return;
        const dx = c.x - pointerStart.x;
        const dy = c.y - pointerStart.y;
        const dist = Math.hypot(dx, dy);
        // Significant movement cancels the long-press TO trigger
        if (dist > COURT_LONG_PRESS_MOVE_CANCEL) clearCourtLongPress();
        if (state.inputMode !== 'swipe') return;
        if (dist < SWIPE_THRESHOLD_PX) {
            hideSwipeHint();
            return;
        }
        if (Math.abs(dx) > Math.abs(dy)) {
            showSwipeHint('🟡 セーブ', 'save');
        } else if (dy < 0) {
            showSwipeHint('🟢 ゴール', 'goal');
        } else {
            showSwipeHint('⚪ ミス', 'miss');
        }
    }

    ui.courtContainer.addEventListener('touchstart', onCourtDown, { passive: false });
    ui.courtContainer.addEventListener('touchmove',  onCourtMove, { passive: true });
    ui.courtContainer.addEventListener('touchend', onCourtUp, { passive: false });
    ui.courtContainer.addEventListener('touchcancel', onCourtCancel);
    ui.courtContainer.addEventListener('mousedown', onCourtDown);
    ui.courtContainer.addEventListener('mousemove', onCourtMove);
    ui.courtContainer.addEventListener('mouseup', onCourtUp);
    ui.courtContainer.addEventListener('mouseleave', onCourtCancel);

    // ── Input mode toggle ──
    function applyInputModeToUI() {
        ui.inputModeChip.setAttribute('data-input', state.inputMode);
        ui.inputModeChip.textContent = state.inputMode === 'swipe' ? '👆 スワイプ入力' : '📋 タップ入力';
        if (ui.instructionText) {
            ui.instructionText.textContent = state.inputMode === 'swipe'
                ? '↑ゴール / ←→セーブ / ↓ミス / 長押しでTO'
                : 'タップでシュート / 長押しでTO';
        }
    }

    ui.inputModeChip.addEventListener('click', (e) => {
        e.stopPropagation();
        state.inputMode = state.inputMode === 'swipe' ? 'modal' : 'swipe';
        applyInputModeToUI();
        saveState();
        showToast(state.inputMode === 'swipe' ? '👆 スワイプ入力に切替' : '📋 タップ入力に切替');
    });
    // Also stop touchstart/mousedown bubbling so court doesn't try to record a shot
    ['touchstart', 'mousedown', 'touchend', 'mouseup'].forEach(t => {
        ui.inputModeChip.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
    });

    applyInputModeToUI();

    // ── 分析担当用: 状況 / アシスト ステップ ──
    const stepSituation = document.getElementById('step-situation');
    const stepAssist = document.getElementById('step-assist');
    const attackTypeRow = document.getElementById('attack-type-row');
    const modalTitle = document.getElementById('modal-title');
    let pendingAssistShotId = null;

    function resetAnalystSteps() {
        stepSituation.classList.add('hidden');
        stepAssist.classList.add('hidden');
        attackTypeRow.style.display = '';
        modalTitle.textContent = 'シュート結果';
        pendingAssistShotId = null;
    }

    // 結果が決まった後の行き先（コース → 選手 / 保存）
    function proceedAfterResult() {
        const d = state.currentDraftShot;
        if (!d) return;
        if (d.result === 'goal' || d.result === 'save') {
            ui.stepCourse.classList.remove('hidden');
        } else if (state.mode === 'attack') {
            ui.stepPlayer.classList.remove('hidden');
        } else {
            addShotAndClose();
        }
    }

    // 結果の次は状況を聞く（7m は状況なし）
    function goToSituationOrNext() {
        const d = state.currentDraftShot;
        if (!d) return;
        if (d.attackType === '7m') {
            d.situation = null;
            proceedAfterResult();
            return;
        }
        stepSituation.classList.remove('hidden');
    }

    document.querySelectorAll('#step-situation .situation-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!state.currentDraftShot) return;
            state.currentDraftShot.situation = btn.getAttribute('data-situation');
            stepSituation.classList.add('hidden');
            proceedAfterResult();
        });
    });
    document.getElementById('btn-skip-situation').addEventListener('click', () => {
        if (!state.currentDraftShot) return;
        state.currentDraftShot.situation = null;
        stepSituation.classList.add('hidden');
        proceedAfterResult();
    });

    // 失点を保存した直後にアシストを聞く（閉じても失点の記録は残る）
    function openAssistStep(shotId) {
        ui.modal.classList.remove('hidden');
        ui.stepResult.classList.add('hidden');
        ui.stepCourse.classList.add('hidden');
        ui.stepPlayer.classList.add('hidden');
        ui.stepToReason.classList.add('hidden');
        stepSituation.classList.add('hidden');
        stepAssist.classList.remove('hidden');
        attackTypeRow.style.display = 'none';
        modalTitle.textContent = '失点を記録しました';
        pendingAssistShotId = shotId;
    }
    function finishAssist(value) {
        const shot = state.shots.find(s => s.id === pendingAssistShotId);
        if (shot) {
            shot.assist = value || null;
            saveState();
        }
        window.closeModal();
    }
    document.querySelectorAll('#step-assist .assist-btn').forEach(btn => {
        btn.addEventListener('click', () => finishAssist(btn.getAttribute('data-assist')));
    });
    document.getElementById('btn-skip-assist').addEventListener('click', () => finishAssist(null));

    function resetAttackChips(toType = 'set') {
        document.querySelectorAll('.atk-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-atk') === toType);
        });
    }

    function openModal() {
        ui.modal.classList.remove('hidden');
        ui.stepResult.classList.remove('hidden');
        ui.stepCourse.classList.add('hidden');
        ui.stepPlayer.classList.add('hidden');
        ui.stepToReason.classList.add('hidden');
        resetAnalystSteps();
        // Reset player step for normal shot flow
        ui.playerStepTitle.textContent = '選手を選択';
        ui.btnSkipPlayer.style.display = 'none';
        resetAttackChips('set');
        populatePlayerStep();
    }

    // Attack type chip handlers
    document.querySelectorAll('.atk-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const type = e.target.getAttribute('data-atk');
            document.querySelectorAll('.atk-chip').forEach(c => c.classList.remove('selected'));
            e.target.classList.add('selected');
            if (state.currentDraftShot) state.currentDraftShot.attackType = type;
        });
    });

    window.closeModal = function() {
        ui.modal.classList.add('hidden');
        state.currentDraftShot = null;
        resetAnalystSteps();
    }

    window.closeSummaryModal = function() {
        ui.summaryModal.classList.add('hidden');
        state.viewMatch = null;
    }

    document.querySelectorAll('#step-result .action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const result = e.target.getAttribute('data-result');
            state.currentDraftShot.result = result;

            // 分析担当用: 結果の次に状況を聞き、その後コース → 選手へ進む
            ui.stepResult.classList.add('hidden');
            goToSituationOrNext();
        });
    });

    // Course selection
    function proceedAfterCourse() {
        ui.stepCourse.classList.add('hidden');
        if (state.mode === 'attack') {
            ui.stepPlayer.classList.remove('hidden');
        } else {
            addShotAndClose();
        }
    }

    document.querySelectorAll('#step-course .zone-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!state.currentDraftShot) return;
            state.currentDraftShot.course = e.target.getAttribute('data-course');
            proceedAfterCourse();
        });
    });

    if (ui.btnSkipCourse) {
        ui.btnSkipCourse.addEventListener('click', () => {
            if (!state.currentDraftShot) return;
            state.currentDraftShot.course = null;
            proceedAfterCourse();
        });
    }

    function handlePlayerSelect(num) {
        if (!state.currentDraftShot) return;
        const isTurnover = state.currentDraftShot.result === 'turnover';
        state.currentDraftShot.player = num;
        // 名簿から rosterId を逆引き（Firebase 共通名簿）
        const entry = (state.roster || []).find(p => p && p.name === num);
        state.currentDraftShot.rosterId = (entry && entry.rosterId) || null;
        addShotAndClose();
        // B1: Toast feedback for turnovers
        if (isTurnover) {
            const shortName = num.replace(/^[①②③]/, '');
            showToast(`💨 ${shortName} - ミス記録`);
        }
    }

    function addShotAndClose() {
        // 7m attempts always plot on the 7m line center (regardless of where user tapped)
        if (state.currentDraftShot.attackType === '7m' && state.currentDraftShot.x != null) {
            state.currentDraftShot.x = 50;
            state.currentDraftShot.y = 53;
        }

        const added = state.currentDraftShot;
        if (added.attackType === '7m') added.situation = null;
        stampLiveTags(added);
        state.shots.push(added);

        if (added.result === 'goal') {
            if (added.mode === 'attack') state.score.us++;
            else state.score.opponent++;
            updateScoreDOM();
        }

        closeModal();
        renderPlots();
        calculateStats();
        saveState();

        // 分析担当用: 失点（7m以外）は保存した直後にアシストを聞く
        if (added.mode === 'defense' && added.result === 'goal' && added.attackType !== '7m') {
            openAssistStep(added.id);
        }
    }

    function updateScoreDOM() {
        ui.scoreUs.textContent = state.score.us;
        ui.scoreOpponent.textContent = state.score.opponent;
    }

    function renderPlots() {
        ui.plotsContainer.innerHTML = '';
        state.shots.forEach(shot => {
            if (shot.mode !== state.mode) return;
            // Skip turnovers without position (recorded via the legacy TO button)
            if (shot.result === 'turnover' && shot.x == null) return;

            const el = document.createElement('div');
            el.className = `plot-point plot-${shot.result} mode-${shot.mode}`;
            el.style.left = `${shot.x}%`;
            el.style.top = `${shot.y}%`;
            if (shot.player) el.textContent = shot.player.replace(/^[①②③]/, '').substring(0,2);
            attachPlotLongPress(el, shot.id);
            ui.plotsContainer.appendChild(el);
        });
    }

    // ── Long-press on plot to edit ──
    function attachPlotLongPress(plotEl, shotId) {
        let timer = null;
        let cancelled = false;
        function start(e) {
            cancelled = false;
            // Stop the court's mousedown/touchstart from also recording a new shot
            e.stopPropagation();
            timer = setTimeout(() => {
                if (!cancelled) openEditShotModal(shotId);
            }, 500);
        }
        function end(e) {
            cancelled = true;
            if (timer) { clearTimeout(timer); timer = null; }
        }
        plotEl.addEventListener('touchstart', start, { passive: false });
        plotEl.addEventListener('touchend', end);
        plotEl.addEventListener('touchcancel', end);
        plotEl.addEventListener('touchmove', end);  // drag cancels long-press
        plotEl.addEventListener('mousedown', start);
        plotEl.addEventListener('mouseup', end);
        plotEl.addEventListener('mouseleave', end);
    }

    // ── Dashboard stats (computation delegated to HA.stats) ──
    function calculateStats() {
        const d = HA.stats.computeDashboard(state.shots);
        ui.statAttackEfficiency.textContent = `${d.attackEfficiency}%`;
        ui.statShotAccuracy.textContent = `${d.shotAccuracy}%`;
        ui.statGkSave.textContent = `${d.saveRate}%`;
        updateMissingChip();
        if (typeof updateAfterTagChip === 'function') updateAfterTagChip();
    }

    // ── 分析担当用: 状況が未入力のシュート件数 ──
    const missingChip = document.getElementById('situation-missing-chip');
    function updateMissingChip() {
        if (!missingChip) return;
        const n = HA.stats.countMissingSituation(state.shots);
        missingChip.classList.toggle('hidden', n === 0);
        missingChip.textContent = n > 0 ? `状況 未入力 ${n}件　▶ 直す` : '';
    }
    if (missingChip) {
        missingChip.addEventListener('click', () => {
            const target = state.shots.find(s =>
                HA.stats.needsSituation(s) && !HA.stats.SITUATIONS.includes(s.situation));
            if (target) openEditShotModal(target.id);
        });
    }

    // ── 分析担当用 v2: 映像を見て後から足す項目が未入力の件数 ──
    const afterTagChip = document.getElementById('aftertag-missing-chip');
    function updateAfterTagChip() {
        if (!afterTagChip) return;
        const n = HA.stats.countMissingAfterTags(state.shots);
        afterTagChip.classList.toggle('hidden', n === 0);
        afterTagChip.textContent = n > 0 ? `🎬 映像を見て足す 未入力 ${n}件　▶ 順に足す` : '';
    }
    function nextMissingAfterTag(afterId) {
        // 記録した順に、まだ足りていない次の1本を返す（afterId の後ろを優先、無ければ先頭から）
        const list = state.shots.filter(s => HA.stats.missingAfterTags(s).length > 0);
        if (list.length === 0) return null;
        if (afterId != null) {
            const idx = state.shots.findIndex(s => s.id === afterId);
            const later = list.find(s => state.shots.indexOf(s) > idx);
            if (later) return later;
        }
        return list[0];
    }
    if (afterTagChip) {
        afterTagChip.addEventListener('click', () => {
            const target = nextMissingAfterTag(null);
            if (target) openEditShotModal(target.id);
        });
    }

    // ── 分析担当用 v2: 試合中の切替 ──
    function stampLiveTags(shot) {
        if (!shot) return;
        shot.numbers = state.numbers || 'even';
        shot.oppDef = state.oppDef || null;
        shot.oppGk = (state.oppGk || '').trim() || null;
    }
    function resetLiveTags() {
        state.numbers = 'even';
        state.oppDef = '';
        state.oppGk = '';
        applyLiveTagsToUI();
    }
    function applyLiveTagsToUI() {
        document.querySelectorAll('#live-numbers-row .sit-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-numbers') === state.numbers);
        });
        document.querySelectorAll('#live-oppdef-row .sit-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-oppdef') === state.oppDef);
        });
        const inp = document.getElementById('live-oppgk-input');
        if (inp) inp.value = state.oppGk || '';
    }
    document.querySelectorAll('#live-numbers-row .sit-chip').forEach(c => {
        c.addEventListener('click', () => {
            state.numbers = c.getAttribute('data-numbers');
            applyLiveTagsToUI();
            saveState();
        });
    });
    document.querySelectorAll('#live-oppdef-row .sit-chip').forEach(c => {
        c.addEventListener('click', () => {
            // もう一度押すと未選択に戻る
            const v = c.getAttribute('data-oppdef');
            state.oppDef = (state.oppDef === v) ? '' : v;
            applyLiveTagsToUI();
            saveState();
        });
    });
    const liveOppGkInput = document.getElementById('live-oppgk-input');
    if (liveOppGkInput) {
        liveOppGkInput.addEventListener('input', () => {
            state.oppGk = liveOppGkInput.value.trim();
            saveState();
        });
    }
    applyLiveTagsToUI();

    // 相手を「練習」にするボタン
    const btnPractice = document.getElementById('btn-practice');
    if (btnPractice) {
        btnPractice.addEventListener('click', () => {
            ui.opponentInput.value = '練習';
            saveState();
            showToast('相手を「練習」にしました');
        });
    }

    // ── B2: Undo with toast feedback ──
    ui.btnUndo.addEventListener('click', () => {
        if (state.shots.length === 0) return;
        const rm = state.shots.pop();
        if (rm.result === 'goal') {
            if (rm.mode === 'attack') state.score.us--;
            else state.score.opponent--;
            updateScoreDOM();
        }

        // Build undo feedback message
        const playerName = rm.player ? rm.player.replace(/^[①②③]/, '') : '';
        let undoMsg = '↩ ';
        if (rm.result === 'turnover') {
            undoMsg += playerName ? `${playerName}のミスを取消` : 'ミスを取消';
        } else if (rm.result === 'goal') {
            undoMsg += playerName ? `${playerName}のゴールを取消` : 'ゴールを取消';
        } else if (rm.result === 'save') {
            undoMsg += playerName ? `${playerName}のセーブを取消` : 'セーブを取消';
        } else {
            undoMsg += playerName ? `${playerName}のシュートミスを取消` : 'シュートミスを取消';
        }
        showToast(undoMsg);

        renderPlots();
        calculateStats();
        saveState();
    });

    ui.btnData.addEventListener('click', () => {
        generateSummary();
        ui.summaryModal.classList.remove('hidden');
    });

    // ── Summary modal action buttons ──
    const btnSummarySubmit  = document.getElementById('btn-summary-submit');
    const btnSummaryArchive = document.getElementById('btn-summary-archive');
    const btnSummaryReset   = document.getElementById('btn-summary-reset');
    if (btnSummarySubmit) {
        btnSummarySubmit.addEventListener('click', async () => {
            const match = state.viewMatch || {
                date: ui.dateInput.value,
                opponent: ui.opponentInput.value,
                shots: state.shots
            };
            if (!match.shots || match.shots.length === 0) {
                showToast('⚠ シュート記録がありません');
                return;
            }
            const status = document.getElementById('cloud-status');
            if (status) {
                status.classList.remove('hidden');
                status.className = 'submit-status';
                status.textContent = '📨 送信中…';
            }
            btnSummarySubmit.disabled = true;
            // 教師スプレッドシート と メンタルアプリ の両方に同時送信（silent=true で個別トースト抑制）
            // 片方が失敗してももう片方は完了させる
            const [teacher, mental] = await Promise.allSettled([
                submitMatchToTeacher(match, true),
                saveMatchToFirebase(match, true)
            ]);
            btnSummarySubmit.disabled = false;
            const tOk = teacher.status === 'fulfilled' && teacher.value && teacher.value.ok;
            const mOk = mental.status === 'fulfilled' && mental.value && mental.value.ok;
            if (status) {
                status.className = 'submit-status ' + (tOk && mOk ? 'success' : (tOk || mOk ? '' : 'error'));
                status.textContent = `📨 教師: ${tOk ? '✅' : '⚠'}　／　☁ メンタルアプリ: ${mOk ? '✅' : '⚠'}`;
            }
            showToast(tOk && mOk ? '✅ 両方に送信完了' : (tOk || mOk ? '⚠ 片方のみ成功（詳細は下の表示）' : '⚠ 送信失敗'));
        });
    }
    if (btnSummaryArchive) {
        btnSummaryArchive.addEventListener('click', () => {
            if (state.shots.length === 0) {
                showToast('⚠ 記録されたシュートがありません');
                return;
            }
            const m = archiveCurrentMatch();
            updateHistoryCount();
            showToast(`📚 「${m.date} vs ${m.opponent || '対戦相手'}」を履歴に保存`);
        });
    }
    if (btnSummaryReset) {
        btnSummaryReset.addEventListener('click', () => {
            if (state.shots.length === 0) {
                showToast('⚠ 既に新規状態です');
                return;
            }
            if (!confirm(`現在の試合データを消去して新規試合を開始します。\n（履歴は影響を受けません）\nよろしいですか？`)) return;
            clearCurrentMatch();
            showToast('🔄 新規試合を開始しました');
            window.closeSummaryModal();
        });
    }

    // ── C3: Running score filter ──
    document.querySelectorAll('.rs-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.rs-filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.rsFilter = e.target.getAttribute('data-rs-filter');
            renderRunningScore();
        });
    });

    function generateSummary(viewMatch) {
        // view mode toggle (used by renderRunningScore too)
        state.viewMatch = viewMatch || null;
        const shotsData = state.viewMatch ? (state.viewMatch.shots || []) : state.shots;
        const opponent = state.viewMatch
            ? (state.viewMatch.opponent || '対戦相手未入力')
            : (ui.opponentInput.value || '対戦相手未入力');
        const dateStr = state.viewMatch
            ? (state.viewMatch.date || '日付未設定')
            : (ui.dateInput.value || '日付未設定');
        const prefix = state.viewMatch ? '📚 履歴 — ' : '';
        document.getElementById('summary-match-info').textContent = `${prefix}${dateStr} VS ${opponent}`;
        // Historical view: hide archive/reset (they only apply to current match)
        const arcBtn = document.getElementById('btn-summary-archive');
        const rstBtn = document.getElementById('btn-summary-reset');
        if (arcBtn) arcBtn.style.display = state.viewMatch ? 'none' : '';
        if (rstBtn) rstBtn.style.display = state.viewMatch ? 'none' : '';

        // ── A1 + A3: 詳細なスタッツ集計 ──
        let attTotal = 0, attShots = 0, attGoals = 0, attTurnovers = 0;
        let defTotal = 0, defShots = 0, defTarget = 0, gkSaves = 0, defTurnovers = 0;
        const playerStats = {};
        const gkStats = {};

        shotsData.forEach(s => {
            if (s.mode === 'attack') {
                attTotal++;
                if (s.result === 'turnover') {
                    attTurnovers++;
                } else {
                    attShots++;
                }
                if (s.result === 'goal') attGoals++;
                
                // ── C2: 選手別にシュート数・TO数を個別追跡 ──
                if (s.player) {
                    if (!playerStats[s.player]) playerStats[s.player] = { goals: 0, shots: 0, turnovers: 0 };
                    if (s.result === 'turnover') {
                        playerStats[s.player].turnovers++;
                    } else {
                        playerStats[s.player].shots++;
                        if (s.result === 'goal') playerStats[s.player].goals++;
                    }
                }
            } else {
                defTotal++;
                if (s.result === 'turnover') {
                    defTurnovers++;
                } else {
                    defShots++; // A3: 枠外含む総被シュート数
                }
                if (s.result === 'goal' || s.result === 'save') {
                    defTarget++; // 枠内のみ
                    
                    const gkName = s.gk || '全体';
                    if (!gkStats[gkName]) gkStats[gkName] = { saves: 0, shots: 0 };
                    gkStats[gkName].shots++;
                    
                    if (s.result === 'save') {
                        gkSaves++;
                        gkStats[gkName].saves++;
                    }
                }
            }
        });

        // ── C1: 攻撃効率とシュート決定率を併記 ──
        const attackEfficiency = attTotal === 0 ? 0 : Math.round((attGoals / attTotal) * 100);
        const shotAccuracy = attShots === 0 ? 0 : Math.round((attGoals / attShots) * 100);
        const gkSaveRate = defTarget === 0 ? 0 : Math.round((gkSaves / defTarget) * 100);

        // Set summary stats
        ui.sumAttackTotal.textContent = attTotal;
        if (ui.sumAttackShots) ui.sumAttackShots.textContent = attShots;
        if (ui.sumAttackTurnovers) ui.sumAttackTurnovers.textContent = attTurnovers;
        ui.sumAttackGoals.textContent = attGoals;
        if (ui.sumAttackEfficiency) ui.sumAttackEfficiency.textContent = `${attackEfficiency}%`;
        if (ui.sumShotAccuracy) ui.sumShotAccuracy.textContent = `${shotAccuracy}%`;
        if (ui.sumGkSaveRateSummary) ui.sumGkSaveRateSummary.textContent = `${gkSaveRate}%`;
        if (ui.sumDefTotal) ui.sumDefTotal.textContent = defTotal;
        if (ui.sumDefShots) ui.sumDefShots.textContent = defShots;
        ui.sumDefTarget.textContent = defTarget;
        if (ui.sumDefTurnovers) ui.sumDefTurnovers.textContent = defTurnovers;
        ui.sumGkSaves.textContent = gkSaves;

        // ミニコート（シュート分布チャート）の描画
        const baseSvg = document.querySelector('.court-svg').cloneNode(true);
        baseSvg.style.transform = 'none';

        const miniAtt = document.getElementById('mini-court-attack');
        miniAtt.innerHTML = '';
        const svgAtt = baseSvg.cloneNode(true);
        svgAtt.style.transform = 'rotate(180deg)';
        miniAtt.appendChild(svgAtt);

        const miniDef = document.getElementById('mini-court-defense');
        miniDef.innerHTML = '';
        const svgDef = baseSvg.cloneNode(true);
        miniDef.appendChild(svgDef);

        const orderedShots = [...shotsData].sort((a,b) => (a.time || 0) - (b.time || 0));

        orderedShots.forEach(s => {
            if (s.result === 'turnover') return;
            const el = document.createElement('div');
            el.className = `plot-point plot-${s.result} mode-${s.mode}`;
            el.style.left = `${s.x}%`;
            el.style.top = `${s.y}%`;
            el.style.position = 'absolute';
            el.style.transform = 'scale(0.8)';
            
            if (s.player) {
                let shortName = s.player.replace(/^[①②③]/, '');
                if (shortName.length > 2) shortName = shortName.substring(0, 2);
                el.textContent = shortName;
                el.style.fontSize = '8px';
                el.style.lineHeight = '1';
            }

            if (s.mode === 'attack') {
                miniAtt.appendChild(el);
            } else {
                miniDef.appendChild(el);
            }
        });

        // GK別のスタッツ生成
        ui.gkIndividualStats.innerHTML = '';
        Object.keys(gkStats).forEach(gk => {
            const st = gkStats[gk];
            const rate = st.shots === 0 ? 0 : Math.round((st.saves / st.shots) * 100);
            ui.gkIndividualStats.innerHTML += `<div>・${gk}: セーブ ${st.saves}/${st.shots} (${rate}%)</div>`;
        });

        // ── 前半 / 後半 ブレイクダウン ──
        if (ui.periodBreakdown) {
            const halves = HA.stats.aggregateByPeriod(shotsData);
            const fmt = (h) => `${h.us} - ${h.opp}　<span style="color:#888; font-size:0.85em;">(ST ${h.attShots} / TO ${h.attTO})</span>`;
            ui.periodBreakdown.innerHTML =
                `<div style="margin-bottom:4px;"><strong style="color:var(--primary);">前半</strong>: ${fmt(halves[1])}</div>` +
                `<div><strong style="color:#9b59b6;">後半</strong>: ${fmt(halves[2])}</div>`;
        }

        // ── 攻撃種別ブレイクダウン（自チームのみ） ──
        if (ui.attackTypeBreakdown) {
            const labels = {
                set:  { label: 'セット',  color: 'var(--primary)' },
                fast: { label: '速攻',    color: 'var(--success)' },
                '7m': { label: '7m',      color: 'var(--save)' }
            };
            const { types, untagged } = HA.stats.aggregateByAttackType(shotsData);
            const cells = Object.entries(labels).map(([key, meta]) => {
                const t = types[key];
                const rate = t.shots === 0 ? '-' : `${Math.round((t.goals/t.shots)*100)}%`;
                return `<div><strong style="color:${meta.color};">${meta.label}</strong>: ${t.goals}/${t.shots} (${rate})</div>`;
            }).join('');
            const untaggedNote = untagged > 0 ? `<div style="color:#666; font-size:0.8em; margin-top:3px;">未分類: ${untagged}</div>` : '';
            ui.attackTypeBreakdown.innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">${cells}</div>${untaggedNote}`;
        }

        // ── コース別ブレイクダウン ──
        if (ui.courseBreakdown) {
            const { zones, off, def } = HA.stats.aggregateByCourse(shotsData);
            const renderGrid = (data, title, color, modeLabel) => {
                const cells = zones.map(z => {
                    const tot = data[z].g + data[z].s;
                    // For attack: goal rate = goals/onTarget. For defense: concede rate = goals/onTarget
                    const rate = tot === 0 ? '—' : `${Math.round((data[z].g/tot)*100)}%`;
                    return `<div class="course-cell"><div class="ratio">${rate}</div><div class="raw">${data[z].g}/${tot}</div></div>`;
                }).join('');
                return `<div class="course-mini-goal-wrapper">
                    <div class="course-mini-goal-title" style="color:${color};">${title}</div>
                    <div class="course-mini-goal">${cells}</div>
                    <div style="font-size:0.7rem; color:#888; margin-top:3px;">${modeLabel}</div>
                </div>`;
            };
            ui.courseBreakdown.innerHTML =
                renderGrid(off, 'オフェンス', 'var(--primary)', '決定率（得点/枠内）') +
                renderGrid(def, 'ディフェンス', 'var(--defense-primary)', '失点率（失点/枠内）');
        }

        // ── ターンオーバー理由ブレイクダウン ──
        if (ui.toReasonBreakdown) {
            const reasonLabels = {
                pass: '🔁 パスミス',
                dribble: '🏀 ドリブル',
                foul: '⚠️ オフェンスファール',
                passive: '⏱️ パッシブ',
                other: '❓ その他'
            };
            const { off: offReasons, def: defReasons, offUnk, defUnk } = HA.stats.aggregateTurnoverReasons(shotsData);
            function reasonsRow(bucket, unk, label, color) {
                const parts = Object.keys(reasonLabels)
                    .filter(k => bucket[k])
                    .map(k => `<span style="margin-right:10px;">${reasonLabels[k]}: <strong>${bucket[k]}</strong></span>`);
                if (unk > 0) parts.push(`<span style="color:#888; margin-right:10px;">未指定: ${unk}</span>`);
                const content = parts.length > 0 ? parts.join('') : '<span style="color:#666;">なし</span>';
                return `<div style="margin-bottom:4px;"><strong style="color:${color};">${label}</strong>: ${content}</div>`;
            }
            ui.toReasonBreakdown.innerHTML =
                reasonsRow(offReasons, offUnk, '自チーム', 'var(--primary)') +
                reasonsRow(defReasons, defUnk, '相手', 'var(--defense-primary)');
        }

        // ── C2: 選手別テーブル（シュート数列追加） ──
        ui.summaryTbody.innerHTML = '';
        Object.keys(playerStats).sort((a,b) => {
            let idxA = playerPositions.indexOf(a);
            let idxB = playerPositions.indexOf(b);
            if(idxA === -1) idxA = 999;
            if(idxB === -1) idxB = 999;
            return idxA - idxB;
        }).forEach(pNum => {
            const st = playerStats[pNum];
            const misses = st.shots - st.goals;
            const rate = st.shots === 0 ? 0 : Math.round((st.goals / st.shots) * 100);
            
            const tr = document.createElement('tr');
            // シュート数にTOがある場合は小さく表示
            const toLabel = st.turnovers > 0 ? `<span style="color:#e67e22; font-size:0.65rem;"> +${st.turnovers}TO</span>` : '';
            tr.innerHTML = `
                <td>${pNum}</td>
                <td>${st.shots}${toLabel}</td>
                <td>${st.goals}</td>
                <td>${misses}</td>
                <td>${rate}%</td>
            `;
            ui.summaryTbody.appendChild(tr);
        });

        // 分析担当用: 状況別・相手の点の取り方
        renderAnalystSummary(shotsData);

        // Render running score
        renderRunningScore();
    }

    // ── 分析担当用の集約表示 ──
    const SIT_KEYS = ['free', 'jump', 'step', 'contact'];
    const SIT_LABELS = { free: 'ノーマーク', jump: 'ジャンプ', step: 'ステップ', contact: '接触あり', none: '未入力' };
    const ASSIST_LABELS = { L45: '左45', C: 'センター', R45: '右45', LW: '左サイド', RW: '右サイド', PV: 'ポスト', SELF: '自分で持ち込み' };
    const SIDE_LABELS = { L: '左から', C: '中央から', R: '右から', '-': '' };

    function escHtml(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, ch => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    function sitCell(c) {
        return c.s === 0 ? '<span style="color:#555;">—</span>' : `${c.g}/${c.s}`;
    }
    function sitRowHtml(name, row, strong) {
        const cells = SIT_KEYS.map(k => `<td>${sitCell(row[k])}</td>`).join('');
        const none = row.none.s === 0 ? '<span style="color:#555;">—</span>' : `<span style="color:#e67e22;">${row.none.g}/${row.none.s}</span>`;
        const nm = strong ? `<strong>${escHtml(name)}</strong>` : escHtml(name);
        return `<td>${nm}</td>${cells}<td>${none}</td>`;
    }
    function orderByRoster(names) {
        return names.sort((a, b) => {
            let ia = playerPositions.indexOf(a), ib = playerPositions.indexOf(b);
            if (ia === -1) ia = 999;
            if (ib === -1) ib = 999;
            return ia - ib;
        });
    }

    function renderAnalystSummary(shotsData) {
        const missEl = document.getElementById('summary-situation-missing');
        const pBody = document.getElementById('situation-player-body');
        const gBody = document.getElementById('situation-gk-body');
        if (!missEl || !pBody || !gBody) return;

        const missing = HA.stats.countMissingSituation(shotsData);
        missEl.classList.toggle('hidden', missing === 0);
        missEl.textContent = missing > 0
            ? `⚠ 状況が未入力のシュートが ${missing} 件あります（下の表では「未入力」に入っています）`
            : '';

        // 選手別・状況別
        const { players, total } = HA.stats.aggregateSituationByPlayer(shotsData);
        const names = orderByRoster(Object.keys(players));
        pBody.innerHTML = '';
        if (names.length === 0) {
            pBody.innerHTML = '<tr><td colspan="6" style="color:#666;">記録なし</td></tr>';
        } else {
            names.forEach(n => {
                const tr = document.createElement('tr');
                tr.innerHTML = sitRowHtml(n, players[n], false);
                pBody.appendChild(tr);
            });
            const tr = document.createElement('tr');
            tr.innerHTML = sitRowHtml('チーム計', total, true);
            pBody.appendChild(tr);
        }

        // GK別・状況別
        const gks = HA.stats.aggregateSituationByGk(shotsData);
        const gkNames = Object.keys(gks);
        gBody.innerHTML = '';
        if (gkNames.length === 0) {
            gBody.innerHTML = '<tr><td colspan="6" style="color:#666;">記録なし</td></tr>';
        } else {
            gkNames.forEach(n => {
                const tr = document.createElement('tr');
                tr.innerHTML = sitRowHtml(n, gks[n], false);
                gBody.appendChild(tr);
            });
        }

        // 相手の点の取り方
        const op = HA.stats.aggregateOpponentPatterns(shotsData);
        const sitEl = document.getElementById('opponent-situation');
        const astEl = document.getElementById('opponent-assist');
        const patEl = document.getElementById('opponent-patterns');
        if (!sitEl || !astEl || !patEl) return;

        const sitKeys = op.bySituation.none.s > 0 ? SIT_KEYS.concat(['none']) : SIT_KEYS;
        sitEl.innerHTML = '<div class="opponent-title">状況ごと</div><div class="opponent-grid">' +
            sitKeys.map(k => `<div class="opponent-cell"><div class="lab">${SIT_LABELS[k]}</div><div class="val">${sitCell(op.bySituation[k])}</div></div>`).join('') +
            '</div>';

        const assistKeys = Object.keys(op.byAssist).sort((a, b) => op.byAssist[b] - op.byAssist[a]);
        let astHtml = '<div class="opponent-title">アシストの出どころ（失点 ' + op.goals + ' 本）</div>';
        if (assistKeys.length === 0) {
            astHtml += '<div style="color:#666;">まだ記録がありません</div>';
        } else {
            astHtml += assistKeys.map(k =>
                `<span class="opponent-tag">${escHtml(ASSIST_LABELS[k] || k)} <strong>${op.byAssist[k]}</strong></span>`).join('');
        }
        if (op.goalsNoAssist > 0) astHtml += `<span class="opponent-tag muted">未入力 ${op.goalsNoAssist}</span>`;
        astEl.innerHTML = astHtml;

        const repeated = op.patterns.filter(p => p.count >= 2).slice(0, 5);
        let patHtml = '<div class="opponent-title">2回以上出た形</div>';
        if (repeated.length === 0) {
            patHtml += '<div style="color:#666;">同じ形が2回以上出たものはまだありません</div>';
        } else {
            patHtml += repeated.map(p => {
                const parts = [escHtml(ASSIST_LABELS[p.assist] || p.assist) + ' →', SIDE_LABELS[p.side] || '', SIT_LABELS[p.situation] || ''];
                return `<div class="opponent-pattern"><span>${parts.filter(Boolean).join(' ')}</span><strong>×${p.count}</strong></div>`;
            }).join('');
        }
        patEl.innerHTML = patHtml;
    }

    // この記録を CSV で書き出す（分析担当用: 送信の代わり）
    const btnSummaryCsv = document.getElementById('btn-summary-csv');
    if (btnSummaryCsv) {
        btnSummaryCsv.addEventListener('click', () => {
            const match = state.viewMatch || {
                date: ui.dateInput.value,
                opponent: ui.opponentInput.value,
                shots: state.shots
            };
            if (!match.shots || match.shots.length === 0) {
                showToast('⚠ 記録がありません');
                return;
            }
            exportMatchCsv(match);
        });
    }

    // ── C3: ランニングスコア描画（フィルタ対応） ──
    function renderRunningScore() {
        const rsContainer = document.getElementById('running-score-container');
        rsContainer.innerHTML = '';
        let sUs = 0;
        let sOpp = 0;
        const shotsData = state.viewMatch ? (state.viewMatch.shots || []) : state.shots;
        const orderedShots = [...shotsData].sort((a,b) => (a.time || 0) - (b.time || 0));

        orderedShots.forEach(s => {
            const t = s.time || 0;
            const m = Math.floor(t / 60).toString().padStart(2, '0');
            const sec = (t % 60).toString().padStart(2, '0');
            
            let isGoal = (s.result === 'goal');
            if (isGoal) {
                if (s.mode === 'attack') sUs++;
                else sOpp++;
            }

            // C3: Apply filter
            if (state.rsFilter === 'goals' && !isGoal) return;

            const div = document.createElement('div');
            div.style.marginBottom = '6px';
            div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            div.style.padding = '6px 8px';
            div.style.borderRadius = '6px';

            let actionText = '';
            let color = '#ccc';

            if (s.mode === 'attack') {
                if (isGoal) {
                    actionText = `⚽ 得点 (${s.player || '-'})`;
                    color = 'var(--primary)';
                    div.style.background = 'rgba(52, 152, 219, 0.15)';
                } else if (s.result === 'save') {
                    actionText = `🧤 相手GKセーブ (${s.player || '-'})`;
                    color = '#888';
                } else if (s.result === 'turnover') {
                    const pName = s.player ? s.player.replace(/^[①②③]/, '') : '';
                    actionText = `💨 シュートなしミス${pName ? ` (${pName})` : ''}`;
                    color = '#e67e22';
                } else {
                    actionText = `❌ シュートミス (${s.player || '-'})`;
                    color = '#888';
                }
            } else {
                if (isGoal) {
                    actionText = `⚠️ 失点`;
                    color = 'var(--defense-primary)';
                    div.style.background = 'rgba(255, 71, 87, 0.15)';
                } else if (s.result === 'save') {
                    actionText = `🛡️ 自軍GKセーブ (${s.gk || '-'})`;
                    color = 'var(--success)';
                    div.style.background = 'rgba(46, 204, 113, 0.1)';
                } else if (s.result === 'turnover') {
                    actionText = `💨 相手シュートなしミス`;
                    color = '#e67e22';
                } else {
                    actionText = `💨 相手シュートミス`;
                    color = '#888';
                }
            }

            let txt = '';
            if (isGoal) {
                txt = `<span style="color:${color}; font-weight:bold;">[${m}:${sec}]</span> <span style="color:#fff; font-weight:bold; margin-left:8px;">${actionText}</span> <strong style="font-size:1.4em; color:#fff; float:right; text-shadow:0 0 10px ${color};">${sUs} - ${sOpp}</strong><div style="clear:both;"></div>`;
            } else {
                txt = `<span style="color:#555;">[${m}:${sec}]</span> <span style="color:${color}; margin-left:8px;">${actionText}</span> <span style="font-size:1.1em; color:#444; float:right;">${sUs} - ${sOpp}</span><div style="clear:both;"></div>`;
            }
            
            div.innerHTML = txt;
            rsContainer.appendChild(div);
        });

        if (rsContainer.children.length === 0) {
            rsContainer.innerHTML = '<div style="text-align:center; color:#666; margin-top:10px;">表示するデータがありません</div>';
        }
    }

    // 画像保存機能
    if (ui.btnDownloadImg) {
        ui.btnDownloadImg.addEventListener('click', async () => {
            const sumContent = document.querySelector('.summary-content');
            sumContent.classList.add('exporting');

            const actions = document.querySelector('.summary-actions');
            if (actions) actions.style.display = 'none';
            const modalBtns = document.querySelector('.modal-buttons');
            if (modalBtns) modalBtns.style.display = 'none';

            // Hide filter buttons during export
            const filterBtns = document.querySelector('.running-score-filter');
            if (filterBtns) filterBtns.style.display = 'none';

            await new Promise(r => setTimeout(r, 100));

            try {
                const canvas = await html2canvas(sumContent, {
                    backgroundColor: '#191e2d',
                    scale: 2
                });
                
                const dataURI = canvas.toDataURL('image/png');
                document.getElementById('exported-image').src = dataURI;
                document.getElementById('export-modal').classList.remove('hidden');

            } catch(e) {
                console.error("Image generation failed", e);
                alert("画像保存に失敗しました。");
            } finally {
                sumContent.classList.remove('exporting');
                if (actions) actions.style.display = '';
                if (modalBtns) modalBtns.style.display = 'flex';
                if (filterBtns) filterBtns.style.display = 'flex';
            }
        });
    }

    let resetConfirmTimer = null;
    ui.btnReset.addEventListener('click', () => {
        if (ui.btnReset.classList.contains('confirm-mode')) {
            state.shots = [];
            resetLiveTags();
            state.score = {us:0, opponent:0};
            clearInterval(state.timer.interval);
            state.timer = { running: false, seconds: 0, interval: null };
            state.period = 1;
            applyPeriodToUI();
            ui.timerToggle.textContent = '▶';
            updateTimer();
            updateScoreDOM();
            renderPlots();
            calculateStats();
            clearSavedState();

            ui.btnReset.classList.remove('confirm-mode');
            ui.btnReset.textContent = '↺ リセット';
            ui.btnReset.style.backgroundColor = 'transparent';
            ui.btnReset.style.borderColor = 'var(--border-color)';
            clearTimeout(resetConfirmTimer);
        } else {
            ui.btnReset.classList.add('confirm-mode');
            ui.btnReset.textContent = '本当に？';
            ui.btnReset.style.backgroundColor = '#e74c3c';
            ui.btnReset.style.borderColor = '#c0392b';
            
            resetConfirmTimer = setTimeout(() => {
                ui.btnReset.classList.remove('confirm-mode');
                ui.btnReset.textContent = '↺ リセット';
                ui.btnReset.style.backgroundColor = 'transparent';
                ui.btnReset.style.borderColor = 'var(--border-color)';
            }, 3000);
        }
    });

    // Note: app height is handled in CSS via 100dvh (dynamic viewport height).
    // We no longer set a fixed px height here — that caused court size to vary
    // depending on whether the iOS Safari URL bar was visible at load time.

    // ── Settings modal (roster + data management) ──
    const ui_settings = {
        modal: document.getElementById('settings-modal'),
        rosterList: document.getElementById('roster-list'),
        rosterCount: document.getElementById('roster-count'),
        rosterGkCount: document.getElementById('roster-gk-count'),
        newGrade: document.getElementById('new-player-grade'),
        newName: document.getElementById('new-player-name'),
        newGk: document.getElementById('new-player-gk'),
        btnAdd: document.getElementById('btn-add-player'),
        btnReset: document.getElementById('btn-reset-roster'),
        btnExportCurrent: document.getElementById('btn-export-current-csv'),
        btnExportAll: document.getElementById('btn-export-all-csv'),
        btnFinishMatch: document.getElementById('btn-finish-match'),
        btnOpen: document.getElementById('btn-settings')
    };

    function renderRosterEditor() {
        ui_settings.rosterList.innerHTML = '';
        state.roster.forEach((player, idx) => {
            const row = document.createElement('div');
            row.className = 'roster-edit-row';
            row.innerHTML = `
                <span class="player-name">${player.name}</span>
                <div class="roster-row-actions">
                    <button type="button" class="gk-toggle-btn ${player.isGK ? '' : 'inactive'}">GK</button>
                    <button type="button" class="delete-btn">削除</button>
                </div>
            `;
            row.querySelector('.gk-toggle-btn').addEventListener('click', () => {
                state.roster[idx].isGK = !state.roster[idx].isGK;
                saveRoster();
                refreshRosterDerivatives();
                renderRosterEditor();
                renderGkRow();
            });
            row.querySelector('.delete-btn').addEventListener('click', () => {
                if (!confirm(`「${player.name}」を名簿から削除しますか？\n（過去の試合データは保持されます）`)) return;
                state.roster.splice(idx, 1);
                saveRoster();
                refreshRosterDerivatives();
                // If this player was in lineup, remove from lineup
                state.lineup = state.lineup.filter(p => p !== player.name);
                saveState();
                renderRosterEditor();
                renderGkRow();
                populatePlayerStep();
                updateHomeLineupCount();
            });
            ui_settings.rosterList.appendChild(row);
        });
        ui_settings.rosterCount.textContent = state.roster.length;
        ui_settings.rosterGkCount.textContent = state.roster.filter(p => p.isGK).length;
    }

    function openSettingsModal() {
        renderRosterEditor();
        ui_settings.modal.classList.remove('hidden');
    }
    window.closeSettingsModal = function() {
        ui_settings.modal.classList.add('hidden');
    };
    ui_settings.btnOpen.addEventListener('click', openSettingsModal);

    ui_settings.btnAdd.addEventListener('click', () => {
        const nameTxt = ui_settings.newName.value.trim();
        if (!nameTxt) { showToast('⚠ 選手名を入力'); return; }
        const fullName = ui_settings.newGrade.value + nameTxt;
        if (state.roster.some(p => p.name === fullName)) {
            showToast('⚠ 同じ名前が既に存在'); return;
        }
        state.roster.push({ name: fullName, isGK: ui_settings.newGk.checked });
        saveRoster();
        refreshRosterDerivatives();
        ui_settings.newName.value = '';
        ui_settings.newGk.checked = false;
        renderRosterEditor();
        renderGkRow();
        populatePlayerStep();
        showToast(`✅ ${fullName} 追加`);
    });

    ui_settings.btnReset.addEventListener('click', () => {
        if (!confirm('名簿をデフォルト（初期メンバー32名）に戻します。よろしいですか？\n（試合データは消えません）')) return;
        state.roster = makeDefaultRoster();
        saveRoster();
        refreshRosterDerivatives();
        renderRosterEditor();
        renderGkRow();
        populatePlayerStep();
        showToast('✅ 名簿をリセット');
    });

    attachSwipeDownClose(ui_settings.modal, () => window.closeSettingsModal());

    // ── Edit shot modal (long-press on plot) ──
    let editingShotId = null;
    let editingPlayerCache = null;

    function recomputeScore() {
        const { us, opp } = HA.stats.computeScore(state.shots);
        state.score.us = us;
        state.score.opponent = opp;
        updateScoreDOM();
    }

    function openEditShotModal(shotId) {
        const shot = state.shots.find(s => s.id === shotId);
        if (!shot) return;
        editingShotId = shotId;
        editingPlayerCache = shot.player;

        const t = shot.time || 0;
        const mm = Math.floor(t / 60).toString().padStart(2, '0');
        const ss = (t % 60).toString().padStart(2, '0');
        document.getElementById('edit-shot-meta').textContent =
            `${shot.mode === 'attack' ? '🔵 オフェンス' : '🔴 ディフェンス'} / ${shot.period === 2 ? '後半' : '前半'} ${mm}:${ss}`;

        // Result selection
        document.querySelectorAll('#edit-result-row .edit-result-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-result') === shot.result);
        });
        // Attack type
        document.querySelectorAll('#edit-attack-type-row .atk-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-atk') === (shot.attackType || 'set'));
        });
        // Course
        document.querySelectorAll('#edit-course-grid .zone-btn').forEach(b => {
            b.classList.toggle('selected', b.getAttribute('data-course') === shot.course);
        });
        // v2: 飛んだ先はミスでも付ける（枠の外も近い所で）
        const showCourse = (shot.result === 'goal' || shot.result === 'save' || shot.result === 'miss');
        document.getElementById('edit-course-section').classList.toggle('hidden', !showCourse);
        refreshEditV2Sections(shot, shot.result, shot.attackType || 'set');
        document.querySelectorAll('#edit-misstype-row .sit-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-misstype') === shot.missType);
        });
        document.querySelectorAll('#edit-gkmove-row .sit-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-gkmove') === shot.gkMove);
        });
        document.querySelectorAll('#edit-startfrom-row .sit-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-startfrom') === shot.startFrom);
        });
        document.querySelectorAll('#edit-starthow-row .sit-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-starthow') === shot.startHow);
        });
        document.getElementById('edit-oppno-input').value = shot.oppNo || '';
        // 分析担当用: 状況 / アシスト / きっかけ
        document.getElementById('edit-situation-section').classList.toggle('hidden', !HA.stats.needsSituation(shot));
        document.querySelectorAll('#edit-situation-row .sit-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-situation') === shot.situation);
        });
        const showAssist = (shot.mode === 'defense' && shot.result === 'goal');
        document.getElementById('edit-assist-section').classList.toggle('hidden', !showAssist);
        document.querySelectorAll('#edit-assist-row .sit-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-assist') === shot.assist);
        });
        document.getElementById('edit-trigger-input').value = shot.trigger || '';
        // Player
        updateEditPlayerDisplay(shot.player);
        document.getElementById('edit-player-section').classList.toggle('hidden', shot.mode !== 'attack');

        // Remove any stale player picker
        const old = document.getElementById('edit-player-picker');
        if (old) old.remove();

        document.getElementById('edit-shot-modal').classList.remove('hidden');
    }

    // v2: 結果・攻撃種別に応じて、後から足す項目の出し入れを決める
    function refreshEditV2Sections(shot, result, atk) {
        const isShot = (result === 'goal' || result === 'save' || result === 'miss');
        const isSet = (atk || 'set') === 'set';
        document.getElementById('edit-misstype-section').classList.toggle('hidden', result !== 'miss');
        document.getElementById('edit-gkmove-section').classList.toggle('hidden', !isShot);
        document.getElementById('edit-start-section').classList.toggle('hidden', !(isShot && isSet));
        document.getElementById('edit-oppno-section').classList.toggle('hidden', !(shot && shot.mode === 'defense' && isShot));
    }

    function updateEditPlayerDisplay(player) {
        document.getElementById('edit-player-btn').textContent = player || '選手を選択';
    }

    window.closeEditShotModal = function() {
        editingShotId = null;
        editingPlayerCache = null;
        document.getElementById('edit-shot-modal').classList.add('hidden');
        const picker = document.getElementById('edit-player-picker');
        if (picker) picker.remove();
    };

    // Edit result buttons
    document.querySelectorAll('#edit-result-row .edit-result-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#edit-result-row .edit-result-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            const r = btn.getAttribute('data-result');
            document.getElementById('edit-course-section').classList.toggle('hidden', r !== 'goal' && r !== 'save' && r !== 'miss');
            const shot = state.shots.find(s => s.id === editingShotId);
            const atk = document.querySelector('#edit-attack-type-row .atk-chip.selected')?.getAttribute('data-atk') || 'set';
            refreshEditV2Sections(shot, r, atk);
        });
    });

    // Edit attack-type chips (scoped to edit modal)
    document.querySelectorAll('#edit-attack-type-row .atk-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#edit-attack-type-row .atk-chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            const shot = state.shots.find(s => s.id === editingShotId);
            const r = document.querySelector('#edit-result-row .edit-result-btn.selected')?.getAttribute('data-result') || (shot && shot.result);
            refreshEditV2Sections(shot, r, chip.getAttribute('data-atk'));
        });
    });

    // 分析担当用: 状況 / アシスト のチップ（もう一度押すと選択を外す）
    ['#edit-situation-row', '#edit-assist-row', '#edit-misstype-row', '#edit-gkmove-row', '#edit-startfrom-row', '#edit-starthow-row'].forEach(sel => {
        document.querySelectorAll(sel + ' .sit-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const was = chip.classList.contains('selected');
                document.querySelectorAll(sel + ' .sit-chip').forEach(c => c.classList.remove('selected'));
                if (!was) chip.classList.add('selected');
            });
        });
    });

    // Edit course buttons
    document.querySelectorAll('#edit-course-grid .zone-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#edit-course-grid .zone-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });
    document.getElementById('edit-course-clear').addEventListener('click', () => {
        document.querySelectorAll('#edit-course-grid .zone-btn').forEach(b => b.classList.remove('selected'));
    });

    // Player picker (inline expansion)
    document.getElementById('edit-player-btn').addEventListener('click', () => {
        const existing = document.getElementById('edit-player-picker');
        if (existing) { existing.remove(); return; }
        const picker = document.createElement('div');
        picker.id = 'edit-player-picker';
        picker.className = 'player-grid';
        picker.style.marginTop = '8px';
        picker.style.maxHeight = '30vh';
        picker.style.overflowY = 'auto';
        // "(なし)" option first
        const noneBtn = document.createElement('button');
        noneBtn.type = 'button';
        noneBtn.className = 'player-btn';
        noneBtn.textContent = '(なし)';
        if (!editingPlayerCache) noneBtn.classList.add('selected');
        noneBtn.addEventListener('click', () => {
            editingPlayerCache = null;
            updateEditPlayerDisplay(null);
            picker.remove();
        });
        picker.appendChild(noneBtn);
        state.roster.forEach(p => {
            const btn = createPlayerBtn(p.name, () => {
                editingPlayerCache = p.name;
                updateEditPlayerDisplay(p.name);
                picker.remove();
            });
            if (p.name === editingPlayerCache) btn.classList.add('selected');
            picker.appendChild(btn);
        });
        document.getElementById('edit-player-btn').after(picker);
    });

    // Save（goNext=true のときは、保存したあと未入力の次の1本を開く）
    function saveEditedShot(goNext) {
        if (editingShotId == null) return;
        const shot = state.shots.find(s => s.id === editingShotId);
        if (!shot) return;
        const savedId = shot.id;
        const newResult = document.querySelector('#edit-result-row .edit-result-btn.selected')?.getAttribute('data-result') || shot.result;
        const newAtk = document.querySelector('#edit-attack-type-row .atk-chip.selected')?.getAttribute('data-atk') || 'set';
        const newCourse = document.querySelector('#edit-course-grid .zone-btn.selected')?.getAttribute('data-course') || null;
        shot.result = newResult;
        shot.attackType = newAtk;
        // v2: 飛んだ先はミスでも残す
        shot.course = (newResult === 'goal' || newResult === 'save' || newResult === 'miss') ? newCourse : null;
        const pick = (sel, attr) => document.querySelector(sel + ' .sit-chip.selected')?.getAttribute(attr) || null;
        const isShotNow = (newResult === 'goal' || newResult === 'save' || newResult === 'miss');
        shot.missType = (newResult === 'miss') ? pick('#edit-misstype-row', 'data-misstype') : null;
        shot.gkMove = isShotNow ? pick('#edit-gkmove-row', 'data-gkmove') : null;
        if (isShotNow && newAtk === 'set') {
            shot.startFrom = pick('#edit-startfrom-row', 'data-startfrom');
            shot.startHow = pick('#edit-starthow-row', 'data-starthow');
        } else {
            shot.startFrom = null;
            shot.startHow = null;
        }
        shot.oppNo = (shot.mode === 'defense' && isShotNow)
            ? (document.getElementById('edit-oppno-input').value.trim() || null)
            : null;
        // 分析担当用: 状況 / アシスト / きっかけ
        shot.situation = HA.stats.needsSituation(shot)
            ? (document.querySelector('#edit-situation-row .sit-chip.selected')?.getAttribute('data-situation') || null)
            : null;
        shot.assist = (shot.mode === 'defense' && shot.result === 'goal')
            ? (document.querySelector('#edit-assist-row .sit-chip.selected')?.getAttribute('data-assist') || null)
            : null;
        shot.trigger = document.getElementById('edit-trigger-input').value.trim() || null;
        // 選手を付け替えたら rosterId も追従させる（旧IDのままだと mental 側で他人に配信される）
        if (shot.player !== editingPlayerCache) {
            const rp = (state.roster || []).find(p => p && p.name === editingPlayerCache);
            shot.rosterId = (rp && rp.rosterId) || null;
        }
        shot.player = editingPlayerCache;
        recomputeScore();
        renderPlots();
        calculateStats();
        saveState();
        showToast('✅ 編集を保存');
        window.closeEditShotModal();
        if (goNext) {
            const nxt = nextMissingAfterTag(savedId);
            if (nxt && nxt.id !== savedId) openEditShotModal(nxt.id);
            else if (!nxt) showToast('✅ 足す項目はすべて入りました');
        }
    }
    document.getElementById('btn-edit-save').addEventListener('click', () => saveEditedShot(false));
    document.getElementById('btn-edit-save-next').addEventListener('click', () => saveEditedShot(true));

    // Delete
    document.getElementById('btn-edit-delete').addEventListener('click', () => {
        if (editingShotId == null) return;
        if (!confirm('このシュートを削除しますか？\n（取り消しできません）')) return;
        state.shots = state.shots.filter(s => s.id !== editingShotId);
        recomputeScore();
        renderPlots();
        calculateStats();
        saveState();
        showToast('🗑 削除しました');
        window.closeEditShotModal();
    });

    attachSwipeDownClose(document.getElementById('edit-shot-modal'), () => window.closeEditShotModal());

    // ── Teacher submission (POST CSV to Apps Script endpoint) ──
    const SUBMIT_URL_KEY    = 'handball-analyst-submit-url-v1';
    const SUBMIT_NAME_KEY   = 'handball-analyst-student-name-v1';
    const DEVICE_ID_KEY     = 'handball-analyst-device-id-v1';
    // Built-in default endpoint — students don't need to set this manually
    const DEFAULT_SUBMIT_URL = 'https://script.google.com/macros/s/AKfycbw8ezXZOhDBc79CbAw-Qvle-Zqend_x-6sSnFPB5FCsiXVDxiyZTnvZKp044ZhHOJbE-A/exec';

    function getSubmitUrl()  {
        const saved = (localStorage.getItem(SUBMIT_URL_KEY) || '').trim();
        return saved || DEFAULT_SUBMIT_URL;
    }
    function getDeviceId() {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
            // 短くて読みやすい ID（生徒が後から見ても区別できる）
            id = 'dev-' + Math.random().toString(36).substring(2, 6)
                       + '-' + Math.random().toString(36).substring(2, 6);
            localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
    }
    function getStudentName() {
        const userName = (localStorage.getItem(SUBMIT_NAME_KEY) || '').trim();
        return userName || getDeviceId();
    }

    async function submitMatchToTeacher(match, silent) {
        // 分析担当用: 先生用の表には送らない（生徒の記録と混ざるのを防ぐ）
        return { ok: false, disabled: true };
        // eslint-disable-next-line no-unreachable
        const url = getSubmitUrl();
        const name = getStudentName();
        const status = document.getElementById('submit-status');
        function setStatus(cls, msg) {
            if (silent) return;
            if (!status) return;
            status.className = `submit-status ${cls}`;
            status.textContent = msg;
        }
        function toast(msg) { if (!silent) showToast(msg); }
        if (!match || !match.shots || match.shots.length === 0) {
            if (!silent) showToast('⚠ シュート記録がありません');
            return { ok: false, empty: true };
        }
        const filename = `handball_${HA.csv.safeFilenamePart(match.date || 'undated')}_${HA.csv.safeFilenamePart(match.opponent || 'match')}.csv`;
        const csv = HA.csv.matchToCsv(match);
        toast('📨 送信中…');
        setStatus('', '送信中…');
        try {
            const res = await fetch(url, {
                method: 'POST',
                // text/plain で送ることで CORS preflight を回避
                body: JSON.stringify({
                    studentName: name,
                    matchDate: match.date || '',
                    opponent: match.opponent || '',
                    filename,
                    csv
                })
            });
            // Apps Script は通常 JSON を返すが、エラー時は HTML の可能性も
            let data = null;
            const text = await res.text();
            try { data = JSON.parse(text); } catch (e) {
                throw new Error(`想定外のレスポンス: ${text.slice(0, 100)}`);
            }
            if (!data.ok) throw new Error(data.error || 'unknown');
            const msg = data.replaced ? '🔄 既存データを置換しました' : '✅ 送信完了';
            toast(msg);
            setStatus('success', `${msg}（${data.rowsAdded || 0}件追記）`);
            return { ok: true };
        } catch (e) {
            toast(`⚠ 送信失敗: ${e.message}`);
            setStatus('error', `送信失敗: ${e.message}`);
            return { ok: false, error: e.message };
        }
    }

    // Settings: load saved values into inputs, save on change
    const submitUrlInput  = document.getElementById('submit-url-input');
    const submitNameInput = document.getElementById('submit-name-input');
    const deviceIdDisplay = document.getElementById('device-id-display');
    if (submitUrlInput) {
        // Show only saved override (empty if using default)
        submitUrlInput.value = localStorage.getItem(SUBMIT_URL_KEY) || '';
        submitUrlInput.addEventListener('input', () => {
            localStorage.setItem(SUBMIT_URL_KEY, submitUrlInput.value);
        });
    }
    if (deviceIdDisplay) {
        deviceIdDisplay.textContent = getDeviceId();
    }
    if (submitNameInput) {
        // Show only the user-provided override (empty if relying on device ID)
        submitNameInput.value = localStorage.getItem(SUBMIT_NAME_KEY) || '';
        submitNameInput.addEventListener('input', () => {
            localStorage.setItem(SUBMIT_NAME_KEY, submitNameInput.value);
        });
    }

    const btnSubmitCurrent = document.getElementById('btn-submit-current');
    if (btnSubmitCurrent) {
        btnSubmitCurrent.addEventListener('click', () => {
            submitMatchToTeacher({
                date: ui.dateInput.value,
                opponent: ui.opponentInput.value,
                shots: state.shots
            });
        });
    }

    // ── Firebase クラウド保存（mental アプリ連携） ──
    // 試合データを /matches/{matchId} に丸ごと保存。
    // mental 顧問が「クラウド試合取込」でワンボタン配信する。
    async function saveMatchToFirebase(match, silent) {
        // 分析担当用: 選手用アプリ（クラウド）には送らない（選手の数字に混ざるのを防ぐ）
        return { ok: false, disabled: true };
        // eslint-disable-next-line no-unreachable
        const status = document.getElementById('cloud-status');
        function setStatus(cls, msg) {
            if (silent) return;
            if (!status) return;
            status.className = `submit-status ${cls}`;
            status.classList.remove('hidden');
            status.textContent = msg;
        }
        function toast(msg) { if (!silent) showToast(msg); }
        if (!window.fbDB) {
            toast('⚠ クラウド未接続');
            setStatus('error', 'Firebase に接続できていません');
            return { ok: false, error: 'no firebase' };
        }
        if (!match || !match.shots || match.shots.length === 0) {
            if (!silent) showToast('⚠ シュート記録がありません');
            return { ok: false, empty: true };
        }
        const date = match.date || new Date().toISOString().slice(0, 10);
        const opponent = match.opponent || 'unknown';
        const baseId = (date + '_' + opponent).replace(/[.#$\[\]\/]/g, '_');
        // 同日同相手の2本目（A戦/B戦）が1本目を黙って上書きしないようにする。
        // 一度この試合に割り当てたIDは再送時も使い回す（修正の上書きはOK）。
        let matchId = match.cloudMatchId || (!match.id ? state.cloudMatchId : null) || null;
        if (!matchId) {
            matchId = baseId;
            try {
                const snap = await window.fbDB.ref('matches/' + baseId).once('value');
                if (snap.exists()) {
                    if (confirm('クラウドに同じ日付・同じ相手の試合が既にあります。\n\n[OK] ＝ 別の試合として保存（同日2本目: A戦/B戦など）\n[キャンセル] ＝ 同じ試合の修正として上書き')) {
                        let n = 2;
                        while ((await window.fbDB.ref('matches/' + baseId + '_' + n).once('value')).exists()) n++;
                        matchId = baseId + '_' + n;
                    }
                }
            } catch (err) { console.warn('[cloud] 既存チェック失敗（従来どおり保存）', err); }
            // 割り当てたIDを記憶（current match は state、履歴は match オブジェクトへ）
            if (match.id) {
                match.cloudMatchId = matchId;
                try {
                    const history = loadHistory();
                    const h = history.find(m => m.id === match.id);
                    if (h) { h.cloudMatchId = matchId; saveHistory(history); }
                } catch (e2) {}
            } else {
                state.cloudMatchId = matchId;
                try { saveState(); } catch (e2) {}
            }
        }
        toast('☁ 送信中…');
        setStatus('', 'クラウドに送信中…');
        try {
            // roster から rosterId を補完しつつ shots を整形
            const roster = state.roster || [];
            const rows = match.shots.map(s => {
                let rosterId = s.rosterId || null;
                if (!rosterId && s.player) {
                    const found = roster.find(p => p && p.name === s.player);
                    if (found) rosterId = found.rosterId || null;
                }
                return {
                    date,
                    opponent,
                    period: s.period == null ? '' : s.period,
                    time_s: s.time == null ? '' : s.time,
                    mode: s.mode || '',
                    result: s.result || '',
                    attack_type: s.attackType || '',
                    course: s.course || '',
                    player: s.player || '',
                    rosterId: rosterId || '',
                    gk: s.gk || '',
                    to_reason: s.toReason || '',
                    x: s.x == null ? '' : Number(s.x).toFixed(2),
                    y: s.y == null ? '' : Number(s.y).toFixed(2)
                };
            });
            const payload = {
                date,
                opponent,
                savedAt: firebase.database.ServerValue.TIMESTAMP,
                rowCount: rows.length,
                rows
            };
            await window.fbDB.ref('matches/' + matchId).set(payload);
            toast('✅ メンタルアプリに送信完了');
            setStatus('success', `✅ 送信完了（${rows.length}件）。顧問が mental アプリで取り込めます。`);
            return { ok: true, rowCount: rows.length };
        } catch (e) {
            console.error('[cloud save]', e);
            toast('⚠ 送信失敗: ' + e.message);
            setStatus('error', '送信失敗: ' + e.message);
            return { ok: false, error: e.message };
        }
    }

    // btn-summary-cloud は廃止（btn-summary-submit が教師＋メンタルアプリ両方に送信）

    // ── Match history + CSV export (CSV utils delegated to HA.csv) ──
    const HISTORY_KEY = 'handball-analyst-history-v1';

    const ui_hist = {
        modal: document.getElementById('history-modal'),
        list: document.getElementById('history-list-container'),
        empty: document.getElementById('history-empty'),
        btnOpen: document.getElementById('btn-open-history'),
        btnExportAll: document.getElementById('btn-export-all-csv'),
        countSpan: document.getElementById('history-count')
    };

    function loadHistory() {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) { return []; }
    }
    function saveHistory(history) {
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
        catch (e) { console.warn('saveHistory failed', e); }
    }

    function updateHistoryCount() {
        ui_hist.countSpan.textContent = loadHistory().length;
    }

    function archiveCurrentMatch() {
        if (state.shots.length === 0) return null;
        const match = {
            id: Date.now(),
            date: ui.dateInput.value || '',
            opponent: ui.opponentInput.value || '',
            score: { us: state.score.us, opponent: state.score.opponent },
            shots: state.shots.map(s => ({ ...s })),
            timerSeconds: state.timer.seconds,
            cloudMatchId: state.cloudMatchId || null, // クラウド送信済みなら同じIDを引き継ぐ
            archivedAt: Date.now()
        };
        const history = loadHistory();
        history.unshift(match);
        saveHistory(history);
        return match;
    }

    function clearCurrentMatch() {
        state.shots = [];
        resetLiveTags();
        state.cloudMatchId = null; // 新規試合はクラウドIDも新規割当
        state.score = { us: 0, opponent: 0 };
        clearInterval(state.timer.interval);
        state.timer = { running: false, seconds: 0, interval: null };
        state.period = 1;
        applyPeriodToUI();
        ui.timerToggle.textContent = '▶';
        updateTimer();
        updateScoreDOM();
        renderPlots();
        calculateStats();
        ui.opponentInput.value = '';
        const today = new Date();
        const offset = today.getTimezoneOffset() * 60000;
        ui.dateInput.value = new Date(today.getTime() - offset).toISOString().slice(0, 10);
        saveState();
    }

    if (ui_settings.btnFinishMatch) {
        ui_settings.btnFinishMatch.addEventListener('click', () => {
            if (state.shots.length === 0) {
                showToast('⚠ 記録されたシュートがありません');
                return;
            }
            if (!confirm(`現在の試合（${state.shots.length} 件）を履歴に保存して新規試合を開始します。\nよろしいですか？`)) return;
            const match = archiveCurrentMatch();
            clearCurrentMatch();
            updateHistoryCount();
            showToast(`✅ 「${match.date} vs ${match.opponent || '対戦相手'}」を保存`);
            window.closeSettingsModal();
        });
    }

    // ── CSV export (low-level utils in HA.csv) ──
    async function exportMatchCsv(match) {
        if (!match.shots || match.shots.length === 0) {
            showToast('⚠ シュート記録がありません'); return;
        }
        const filename = `handball_${HA.csv.safeFilenamePart(match.date || 'undated')}_${HA.csv.safeFilenamePart(match.opponent || 'match')}.csv`;
        const outcome = await HA.csv.shareOrDownload(filename, HA.csv.matchToCsv(match));
        if (outcome === 'shared') showToast('📤 共有しました');
        else if (outcome === 'downloaded') showToast('📥 ダウンロードしました');
        // 'aborted' → silent
    }
    if (ui_settings.btnExportCurrent) {
        ui_settings.btnExportCurrent.addEventListener('click', () => {
            exportMatchCsv({
                date: ui.dateInput.value,
                opponent: ui.opponentInput.value,
                shots: state.shots
            });
        });
    }

    // ── History modal ──
    const computeMatchQuickStats = HA.stats.computeMatchQuickStats;
    function renderHistoryList() {
        const history = loadHistory();
        ui_hist.list.innerHTML = '';
        if (history.length === 0) {
            ui_hist.empty.classList.remove('hidden');
            return;
        }
        ui_hist.empty.classList.add('hidden');
        history.forEach(match => {
            const stats = computeMatchQuickStats(match);
            const row = document.createElement('div');
            row.className = 'history-entry';
            row.innerHTML = `
                <div class="history-row-top">
                    <div class="history-meta">
                        <div class="history-date">${match.date || '(日付未設定)'}</div>
                        <div class="history-opponent">vs ${match.opponent || '(対戦相手未入力)'}</div>
                    </div>
                    <div class="history-score">${match.score.us} - ${match.score.opponent}</div>
                </div>
                <div class="history-row-stats">
                    ST: ${stats.attShots} / TO: ${stats.attTO} / 攻撃効率: ${stats.attackEfficiency}%
                </div>
                <div class="history-row-actions">
                    <button type="button" class="btn-secondary-mini" data-action="view">📊 詳細</button>
                    <button type="button" class="btn-secondary-mini" data-action="csv">📤 CSV</button>
                    <button type="button" class="btn-secondary-mini delete" data-action="delete">🗑 削除</button>
                </div>
            `;
            row.querySelector('[data-action="view"]').addEventListener('click', () => {
                window.closeHistoryModal();
                window.closeSettingsModal();
                generateSummary(match);
                ui.summaryModal.classList.remove('hidden');
            });
            row.querySelector('[data-action="csv"]').addEventListener('click', () => exportMatchCsv(match));
            row.querySelector('[data-action="delete"]').addEventListener('click', () => {
                if (!confirm(`この試合（${match.date} vs ${match.opponent}）を履歴から削除しますか？`)) return;
                const filtered = loadHistory().filter(m => m.id !== match.id);
                saveHistory(filtered);
                updateHistoryCount();
                renderHistoryList();
                showToast('🗑 削除しました');
            });
            ui_hist.list.appendChild(row);
        });
    }

    function openHistoryModal() {
        renderHistoryList();
        ui_hist.modal.classList.remove('hidden');
    }
    window.closeHistoryModal = function() { ui_hist.modal.classList.add('hidden'); };

    ui_hist.btnOpen.addEventListener('click', openHistoryModal);

    ui_hist.btnExportAll.addEventListener('click', async () => {
        const history = loadHistory();
        if (history.length === 0) { showToast('⚠ 履歴がありません'); return; }
        const filename = `handball_all_${new Date().toISOString().slice(0,10)}.csv`;
        const outcome = await HA.csv.shareOrDownload(filename, HA.csv.matchesToCsv(history));
        if (outcome === 'shared') showToast('📤 共有しました');
        else if (outcome === 'downloaded') showToast('📥 ダウンロードしました');
    });

    attachSwipeDownClose(ui_hist.modal, () => window.closeHistoryModal());

    updateHistoryCount();

    // ── Restore saved data on load ──
    const hadData = loadState();
    updateHomeLineupCount();
    if (hadData) {
        // Slight delay so the toast appears after initial render
        setTimeout(() => showToast('🔄 前回のデータを復元しました'), 200);
    }

    // Extra safety: save on page hide/unload
    window.addEventListener('pagehide', saveState);
    window.addEventListener('beforeunload', saveState);

    // ── Modal: swipe-down (in top area) to close ──
    function attachSwipeDownClose(modalEl, closeFn) {
        const content = modalEl && modalEl.querySelector('.modal-content');
        if (!content) return;
        const HEADER_ZONE_PX = 80;
        const CLOSE_DY = 80;
        let touchStart = null;
        let mouseStart = null;

        content.addEventListener('touchstart', (e) => {
            const r = content.getBoundingClientRect();
            const t = e.touches[0];
            if (t.clientY - r.top > HEADER_ZONE_PX) { touchStart = null; return; }
            touchStart = { x: t.clientX, y: t.clientY };
        }, { passive: true });
        content.addEventListener('touchend', (e) => {
            if (!touchStart) return;
            const t = e.changedTouches[0];
            const dy = t.clientY - touchStart.y;
            const dx = Math.abs(t.clientX - touchStart.x);
            touchStart = null;
            if (dy > CLOSE_DY && dy > dx * 2) closeFn();
        });
        // Mouse fallback (for desktop / testing)
        content.addEventListener('mousedown', (e) => {
            const r = content.getBoundingClientRect();
            if (e.clientY - r.top > HEADER_ZONE_PX) { mouseStart = null; return; }
            mouseStart = { x: e.clientX, y: e.clientY };
        });
        content.addEventListener('mouseup', (e) => {
            if (!mouseStart) return;
            const dy = e.clientY - mouseStart.y;
            const dx = Math.abs(e.clientX - mouseStart.x);
            mouseStart = null;
            if (dy > CLOSE_DY && dy > dx * 2) closeFn();
        });
    }
    attachSwipeDownClose(ui.modal, () => window.closeModal());
    attachSwipeDownClose(ui.summaryModal, () => window.closeSummaryModal());
    attachSwipeDownClose(ui.lineupModal, () => window.closeLineupModal());
});
