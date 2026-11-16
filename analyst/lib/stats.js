// Pure statistical aggregations on shots array.
// Exposes window.HA.stats
(function () {
    'use strict';

    function computeScore(shots) {
        let us = 0, opp = 0;
        (shots || []).forEach(s => {
            if (s.result !== 'goal') return;
            if (s.mode === 'attack') us++;
            else if (s.mode === 'defense') opp++;
        });
        return { us, opp };
    }

    function computeMatchQuickStats(match) {
        let attShots = 0, attGoals = 0, attTO = 0;
        (match && match.shots || []).forEach(s => {
            if (s.mode === 'attack') {
                if (s.result === 'turnover') attTO++;
                else attShots++;
                if (s.result === 'goal') attGoals++;
            }
        });
        const denom = attShots + attTO;
        const attackEfficiency = denom === 0 ? 0 : Math.round((attGoals / denom) * 100);
        return { attShots, attGoals, attTO, attackEfficiency };
    }

    function computeDashboard(shots) {
        let attackTotal = 0, attackShots = 0, attackGoals = 0;
        let defShotsOnTarget = 0, gkSaves = 0;
        (shots || []).forEach(shot => {
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
        return {
            attackTotal, attackShots, attackGoals,
            defShotsOnTarget, gkSaves,
            attackEfficiency: attackTotal === 0 ? 0 : Math.round((attackGoals / attackTotal) * 100),
            shotAccuracy: attackShots === 0 ? 0 : Math.round((attackGoals / attackShots) * 100),
            saveRate: defShotsOnTarget === 0 ? 0 : Math.round((gkSaves / defShotsOnTarget) * 100)
        };
    }

    function aggregateByPeriod(shots) {
        const halves = {
            1: { us: 0, opp: 0, attShots: 0, attTO: 0 },
            2: { us: 0, opp: 0, attShots: 0, attTO: 0 }
        };
        (shots || []).forEach(s => {
            const p = s.period === 2 ? 2 : 1;
            if (s.mode === 'attack') {
                if (s.result === 'goal') halves[p].us++;
                if (s.result === 'turnover') halves[p].attTO++;
                else halves[p].attShots++;
            } else {
                if (s.result === 'goal') halves[p].opp++;
            }
        });
        return halves;
    }

    function aggregateByAttackType(shots) {
        const types = {
            set: { goals: 0, shots: 0 },
            fast: { goals: 0, shots: 0 },
            '7m': { goals: 0, shots: 0 }
        };
        let untagged = 0;
        (shots || []).forEach(s => {
            if (s.mode !== 'attack' || s.result === 'turnover') return;
            const t = s.attackType;
            if (!types[t]) { untagged++; return; }
            types[t].shots++;
            if (s.result === 'goal') types[t].goals++;
        });
        return { types, untagged };
    }

    function aggregateByCourse(shots) {
        const zones = ['TL', 'TR', 'ML', 'MR', 'BL', 'BR'];
        const make = () => Object.fromEntries(zones.map(z => [z, { g: 0, s: 0 }]));
        const off = make(), def = make();
        (shots || []).forEach(sh => {
            if (!sh.course || !zones.includes(sh.course)) return;
            if (sh.result !== 'goal' && sh.result !== 'save') return;
            const bucket = sh.mode === 'attack' ? off[sh.course] : def[sh.course];
            if (sh.result === 'goal') bucket.g++;
            else bucket.s++;
        });
        return { zones, off, def };
    }

    function aggregateTurnoverReasons(shots) {
        const off = {}, def = {};
        let offUnk = 0, defUnk = 0;
        (shots || []).forEach(s => {
            if (s.result !== 'turnover') return;
            const bucket = s.mode === 'attack' ? off : def;
            if (!s.toReason) {
                if (s.mode === 'attack') offUnk++; else defUnk++;
                return;
            }
            bucket[s.toReason] = (bucket[s.toReason] || 0) + 1;
        });
        return { off, def, offUnk, defUnk };
    }


    // ── 分析担当用: 状況（ノーマーク / ジャンプ / ステップ / 接触あり） ──
    // 7m とターンオーバーは状況の対象外。
    const SITUATIONS = ['free', 'jump', 'step', 'contact'];

    function needsSituation(s) {
        return !!s && s.result !== 'turnover' && s.attackType !== '7m';
    }

    function countMissingSituation(shots) {
        let n = 0;
        (shots || []).forEach(s => {
            if (needsSituation(s) && !SITUATIONS.includes(s.situation)) n++;
        });
        return n;
    }

    function emptySituationRow() {
        const row = {};
        SITUATIONS.forEach(k => { row[k] = { g: 0, s: 0 }; });
        row.none = { g: 0, s: 0 };
        return row;
    }

    // 自チームの選手ごと・状況ごとの「入った数 / 打った数」
    function aggregateSituationByPlayer(shots) {
        const players = {};
        const total = emptySituationRow();
        (shots || []).forEach(s => {
            if (s.mode !== 'attack' || !needsSituation(s)) return;
            const key = SITUATIONS.includes(s.situation) ? s.situation : 'none';
            const name = s.player || '(選手なし)';
            if (!players[name]) players[name] = emptySituationRow();
            players[name][key].s++;
            total[key].s++;
            if (s.result === 'goal') { players[name][key].g++; total[key].g++; }
        });
        return { players, total };
    }

    // 自チームGKごと・状況ごとの「止めた数 / 枠内に来た数」
    function aggregateSituationByGk(shots) {
        const gks = {};
        (shots || []).forEach(s => {
            if (s.mode !== 'defense' || !needsSituation(s)) return;
            if (s.result !== 'goal' && s.result !== 'save') return;
            const key = SITUATIONS.includes(s.situation) ? s.situation : 'none';
            const name = s.gk || '(GKなし)';
            if (!gks[name]) gks[name] = emptySituationRow();
            gks[name][key].s++;                       // s = 枠内に来た数
            if (s.result === 'save') gks[name][key].g++; // g = 止めた数
        });
        return gks;
    }

    // 画面上の左右（コート図の横位置）を3つに分ける
    function sideOf(x) {
        if (x == null || x === '') return null;
        const v = Number(x);
        if (isNaN(v)) return null;
        if (v < 100 / 3) return 'L';
        if (v > 200 / 3) return 'R';
        return 'C';
    }

    // 相手の攻撃の読み取り: 状況ごとの得点 / アシストの出どころ / よく出る形
    function aggregateOpponentPatterns(shots) {
        const bySituation = emptySituationRow();   // g = 失点, s = 打たれた数
        const byAssist = {};
        const patternMap = {};
        let goals = 0, goalsNoAssist = 0;
        (shots || []).forEach(s => {
            if (s.mode !== 'defense' || !needsSituation(s)) return;
            const sit = SITUATIONS.includes(s.situation) ? s.situation : 'none';
            bySituation[sit].s++;
            if (s.result !== 'goal') return;
            bySituation[sit].g++;
            goals++;
            if (!s.assist) { goalsNoAssist++; return; }
            byAssist[s.assist] = (byAssist[s.assist] || 0) + 1;
            const key = [s.assist, sideOf(s.x) || '-', sit].join('|');
            patternMap[key] = (patternMap[key] || 0) + 1;
        });
        const patterns = Object.keys(patternMap).map(k => {
            const p = k.split('|');
            return { assist: p[0], side: p[1], situation: p[2], count: patternMap[k] };
        }).sort((a, b) => b.count - a.count);
        return { bySituation, byAssist, patterns, goals, goalsNoAssist };
    }

    window.HA = window.HA || {};
    window.HA.stats = {
        computeScore,
        computeMatchQuickStats,
        computeDashboard,
        aggregateByPeriod,
        aggregateByAttackType,
        aggregateByCourse,
        aggregateTurnoverReasons,
        SITUATIONS,
        needsSituation,
        countMissingSituation,
        aggregateSituationByPlayer,
        aggregateSituationByGk,
        sideOf,
        aggregateOpponentPatterns
    };
})();
