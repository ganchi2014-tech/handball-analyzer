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
        lineupEditTemp: [],    // 編集モーダルの一時状態
        period: 1              // 1=前半, 2=後半
    };

    const LINEUP_MAX = 6;

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
        btnSkipCourse: document.getElementById('btn-skip-course'),
        lineupGrid: document.getElementById('lineup-grid'),
        benchGrid: document.getElementById('bench-grid'),
        lineupCount: document.getElementById('lineup-count'),
        lineupEmptyHint: document.getElementById('lineup-empty-hint'),
        lineupSection: document.getElementById('lineup-section'),
        btnEditLineup: document.getElementById('btn-edit-lineup'),
        benchToggle: document.getElementById('bench-toggle'),
        benchArrow: document.getElementById('bench-arrow'),
        lineupModal: document.getElementById('lineup-modal'),
        lineupEditGrid: document.getElementById('lineup-edit-grid'),
        lineupEditCount: document.getElementById('lineup-edit-count'),
        btnLineupSave: document.getElementById('btn-lineup-save'),
        playerStepTitle: document.getElementById('player-step-title'),
        btnSkipPlayer: document.getElementById('btn-skip-player'),
        timeDisplay: document.getElementById('time-display'),
        timerToggle: document.getElementById('timer-toggle'),
        periodToggle: document.getElementById('period-toggle'),
        periodBreakdown: document.getElementById('period-breakdown'),
        attackTypeBreakdown: document.getElementById('attack-type-breakdown'),
        courseBreakdown: document.getElementById('course-breakdown'),
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
    const STORAGE_KEY = 'handball-analyzer-state-v1';

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
                matchDate: ui.dateInput.value,
                matchOpponent: ui.opponentInput.value,
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

            if (snap.matchDate) ui.dateInput.value = snap.matchDate;
            if (snap.matchOpponent) ui.opponentInput.value = snap.matchOpponent;

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

            // GK button active state
            ui.gkBtns.forEach(b => {
                if (b.getAttribute('data-gk') === state.currentGk) b.classList.add('active');
                else b.classList.remove('active');
            });

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

    // GK Toggle logic
    ui.gkBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            ui.gkBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.currentGk = e.target.getAttribute('data-gk');
            saveState();
        });
    });

    // Player roster
    const playerPositions = [
        '③赤塚', '③岩噌', '③川崎', '③北村', '③辻', '③中田', '③伴', '③山本', '③桑原', '③杉本',
        '②新井', '②猪田', '②北林', '②田端', '②藤川', '②松岡', '②村田', '②安田', '②小川', '②田口',
        '①石黒', '①岩噌', '①大野', '①北川', '①嶌本', '①福原', '①増田', '①水田', '①宮崎', '①森井', '①山崎', '①関山'
    ];

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

    // ── Lineup edit modal ──
    function openLineupModal() {
        state.lineupEditTemp = [...state.lineup];
        renderLineupEditGrid();
        ui.lineupModal.classList.remove('hidden');
    }

    window.closeLineupModal = function() {
        ui.lineupModal.classList.add('hidden');
        state.lineupEditTemp = [];
    };

    function renderLineupEditGrid() {
        ui.lineupEditGrid.innerHTML = '';
        const atMax = state.lineupEditTemp.length >= LINEUP_MAX;
        playerPositions.forEach(p => {
            const selected = state.lineupEditTemp.includes(p);
            const btn = createPlayerBtn(p, () => toggleLineupEdit(p));
            if (selected) btn.classList.add('selected');
            else if (atMax) btn.classList.add('disabled');
            ui.lineupEditGrid.appendChild(btn);
        });
        ui.lineupEditCount.textContent = `${state.lineupEditTemp.length}/${LINEUP_MAX}`;
    }

    function toggleLineupEdit(p) {
        const i = state.lineupEditTemp.indexOf(p);
        if (i >= 0) {
            state.lineupEditTemp.splice(i, 1);
        } else {
            if (state.lineupEditTemp.length >= LINEUP_MAX) return;
            state.lineupEditTemp.push(p);
        }
        renderLineupEditGrid();
    }

    ui.btnEditLineup.addEventListener('click', openLineupModal);

    ui.btnLineupSave.addEventListener('click', () => {
        // Preserve roster order from playerPositions
        state.lineup = playerPositions.filter(p => state.lineupEditTemp.includes(p));
        state.lineupEditTemp = [];
        ui.lineupModal.classList.add('hidden');
        saveState();
        populatePlayerStep();
        showToast(`✅ 出場 ${state.lineup.length}名 設定`);
    });

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

    // ── A2: Turnover Button with optional player selection ──
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
                period: state.period
            };
            if (state.mode === 'defense') {
                // ディフェンスモード：相手チームなので選手選択不要、即記録
                state.shots.push(state.currentDraftShot);
                state.currentDraftShot = null;
                renderPlots();
                calculateStats();
                saveState();
                showToast('💨 相手ミス記録しました');
            } else {
                // オフェンスモード：選手選択モーダルを表示
                ui.modal.classList.remove('hidden');
                ui.stepResult.classList.add('hidden');
                ui.stepPlayer.classList.remove('hidden');
                ui.playerStepTitle.textContent = 'ミスした選手を選択（任意）';
                ui.btnSkipPlayer.style.display = 'block';
                populatePlayerStep();
            }
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

    // Court interactions
    ui.courtContainer.addEventListener('touchstart', handleCourtTap, {passive: false});
    ui.courtContainer.addEventListener('mousedown', handleCourtTap);

    function handleCourtTap(e) {
        if(e.type === 'touchstart') e.preventDefault();
        ui.instruction.style.opacity = '0';
        
        const rect = ui.courtContainer.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        if (!clientX || !clientY) return;

        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;

        state.currentDraftShot = { id: Date.now(), x, y, mode: state.mode, result: null, player: null, time: state.timer.seconds, gk: state.currentGk, period: state.period, attackType: 'set' };
        openModal();
    }

    function openModal() {
        ui.modal.classList.remove('hidden');
        ui.stepResult.classList.remove('hidden');
        ui.stepCourse.classList.add('hidden');
        ui.stepPlayer.classList.add('hidden');
        // Reset player step for normal shot flow
        ui.playerStepTitle.textContent = '選手を選択';
        ui.btnSkipPlayer.style.display = 'none';
        // Reset attack type chips to default
        document.querySelectorAll('.atk-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-atk') === 'set');
        });
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
    }

    window.closeSummaryModal = function() {
        ui.summaryModal.classList.add('hidden');
    }

    document.querySelectorAll('#step-result .action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const result = e.target.getAttribute('data-result');
            state.currentDraftShot.result = result;

            // Course step only for shots that hit the goalkeeper (goal or save).
            // Miss skips course; turnover doesn't pass through this handler.
            if (result === 'goal' || result === 'save') {
                ui.stepResult.classList.add('hidden');
                ui.stepCourse.classList.remove('hidden');
            } else if (state.mode === 'attack') {
                ui.stepResult.classList.add('hidden');
                ui.stepPlayer.classList.remove('hidden');
            } else {
                addShotAndClose();
            }
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

        state.shots.push(state.currentDraftShot);

        if (state.currentDraftShot.result === 'goal') {
            if (state.currentDraftShot.mode === 'attack') state.score.us++;
            else state.score.opponent++;
            updateScoreDOM();
        }

        closeModal();
        renderPlots();
        calculateStats();
        saveState();
    }

    function updateScoreDOM() {
        ui.scoreUs.textContent = state.score.us;
        ui.scoreOpponent.textContent = state.score.opponent;
    }

    function renderPlots() {
        ui.plotsContainer.innerHTML = '';
        state.shots.forEach(shot => {
            if (shot.mode !== state.mode) return;
            if (shot.result === 'turnover') return;

            const el = document.createElement('div');
            el.className = `plot-point plot-${shot.result} mode-${shot.mode}`;
            el.style.left = `${shot.x}%`;
            el.style.top = `${shot.y}%`;
            if (shot.player) el.textContent = shot.player.replace(/^[①②③]/, '').substring(0,2);
            ui.plotsContainer.appendChild(el);
        });
    }

    // ── A1: 攻撃効率 / シュート決定率 / GKセーブ率 を分離計算 ──
    function calculateStats() {
        let attackTotal = 0, attackShots = 0, attackGoals = 0;
        let defShotsOnTarget = 0, gkSaves = 0;

        state.shots.forEach(shot => {
            if (shot.mode === 'attack') {
                attackTotal++;
                if (shot.result !== 'turnover') attackShots++;
                if (shot.result === 'goal') attackGoals++;
            } else {
                if (shot.result === 'goal' || shot.result === 'save') {
                    defShotsOnTarget++;
                    if (shot.result === 'save') gkSaves++;
                }
            }
        });

        const attackEfficiency = attackTotal === 0 ? 0 : Math.round((attackGoals / attackTotal) * 100);
        const shotAccuracy = attackShots === 0 ? 0 : Math.round((attackGoals / attackShots) * 100);
        const saveRate = defShotsOnTarget === 0 ? 0 : Math.round((gkSaves / defShotsOnTarget) * 100);

        ui.statAttackEfficiency.textContent = `${attackEfficiency}%`;
        ui.statShotAccuracy.textContent = `${shotAccuracy}%`;
        ui.statGkSave.textContent = `${saveRate}%`;
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

    // ── C3: Running score filter ──
    document.querySelectorAll('.rs-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.rs-filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.rsFilter = e.target.getAttribute('data-rs-filter');
            renderRunningScore();
        });
    });

    function generateSummary() {
        // 対戦相手と日付をモーダルにセット
        const opponent = ui.opponentInput.value || '対戦相手未入力';
        const dateStr = ui.dateInput.value || '日付未設定';
        document.getElementById('summary-match-info').textContent = `${dateStr} VS ${opponent}`;

        // ── A1 + A3: 詳細なスタッツ集計 ──
        let attTotal = 0, attShots = 0, attGoals = 0, attTurnovers = 0;
        let defTotal = 0, defShots = 0, defTarget = 0, gkSaves = 0, defTurnovers = 0;
        const playerStats = {};
        const gkStats = {};

        state.shots.forEach(s => {
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

        const orderedShots = [...state.shots].sort((a,b) => (a.time || 0) - (b.time || 0));

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
            const halves = { 1: { us: 0, opp: 0, attShots: 0, attTO: 0 },
                             2: { us: 0, opp: 0, attShots: 0, attTO: 0 } };
            state.shots.forEach(s => {
                const p = s.period === 2 ? 2 : 1;
                if (s.mode === 'attack') {
                    if (s.result === 'goal') halves[p].us++;
                    if (s.result === 'turnover') halves[p].attTO++;
                    else halves[p].attShots++;
                } else {
                    if (s.result === 'goal') halves[p].opp++;
                }
            });
            const fmt = (h) => `${h.us} - ${h.opp}　<span style="color:#888; font-size:0.85em;">(ST ${h.attShots} / TO ${h.attTO})</span>`;
            ui.periodBreakdown.innerHTML =
                `<div style="margin-bottom:4px;"><strong style="color:var(--primary);">前半</strong>: ${fmt(halves[1])}</div>` +
                `<div><strong style="color:#9b59b6;">後半</strong>: ${fmt(halves[2])}</div>`;
        }

        // ── 攻撃種別ブレイクダウン（自チームのみ） ──
        if (ui.attackTypeBreakdown) {
            const types = {
                set:  { label: 'セット',  color: 'var(--primary)',  goals: 0, shots: 0 },
                fast: { label: '速攻',    color: 'var(--success)',  goals: 0, shots: 0 },
                '7m': { label: '7m',      color: 'var(--save)',     goals: 0, shots: 0 }
            };
            let untagged = 0;
            state.shots.forEach(s => {
                if (s.mode !== 'attack') return;
                if (s.result === 'turnover') return;
                const t = s.attackType;
                if (!types[t]) { untagged++; return; }
                types[t].shots++;
                if (s.result === 'goal') types[t].goals++;
            });
            const cells = Object.entries(types).map(([key, t]) => {
                const rate = t.shots === 0 ? '-' : `${Math.round((t.goals/t.shots)*100)}%`;
                return `<div><strong style="color:${t.color};">${t.label}</strong>: ${t.goals}/${t.shots} (${rate})</div>`;
            }).join('');
            const untaggedNote = untagged > 0 ? `<div style="color:#666; font-size:0.8em; margin-top:3px;">未分類: ${untagged}</div>` : '';
            ui.attackTypeBreakdown.innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">${cells}</div>${untaggedNote}`;
        }

        // ── コース別ブレイクダウン ──
        if (ui.courseBreakdown) {
            // For attack: each zone shows goals/onTarget (= goals + saves with that course recorded)
            // For defense: each zone shows goals/onTarget (failed/total) — i.e. failures to save
            const zones = ['TL', 'TR', 'BL', 'BR'];
            const off = { TL:{g:0,s:0}, TR:{g:0,s:0}, BL:{g:0,s:0}, BR:{g:0,s:0} };
            const def = { TL:{g:0,s:0}, TR:{g:0,s:0}, BL:{g:0,s:0}, BR:{g:0,s:0} };
            state.shots.forEach(sh => {
                if (!sh.course || !zones.includes(sh.course)) return;
                if (sh.result !== 'goal' && sh.result !== 'save') return;
                const bucket = sh.mode === 'attack' ? off[sh.course] : def[sh.course];
                if (sh.result === 'goal') bucket.g++;
                else bucket.s++;
            });
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

        // Render running score
        renderRunningScore();
    }

    // ── C3: ランニングスコア描画（フィルタ対応） ──
    function renderRunningScore() {
        const rsContainer = document.getElementById('running-score-container');
        rsContainer.innerHTML = '';
        let sUs = 0;
        let sOpp = 0;

        const orderedShots = [...state.shots].sort((a,b) => (a.time || 0) - (b.time || 0));

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
            
            const modalBtns = document.querySelector('.modal-buttons');
            modalBtns.style.display = 'none';

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
                modalBtns.style.display = 'flex';
                if (filterBtns) filterBtns.style.display = 'flex';
            }
        });
    }

    let resetConfirmTimer = null;
    ui.btnReset.addEventListener('click', () => {
        if (ui.btnReset.classList.contains('confirm-mode')) {
            state.shots = [];
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

    // Check iOS Safari to avoid bottom bar overlap
    const adjustHeight = () => { ui.app.style.height = `${window.innerHeight}px`; };
    window.addEventListener('resize', adjustHeight);
    adjustHeight();

    // ── Restore saved data on load ──
    const hadData = loadState();
    if (hadData) {
        // Slight delay so the toast appears after initial render
        setTimeout(() => showToast('🔄 前回のデータを復元しました'), 200);
    }

    // Extra safety: save on page hide/unload
    window.addEventListener('pagehide', saveState);
    window.addEventListener('beforeunload', saveState);
});
