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

    window.HA = window.HA || {};
    window.HA.stats = {
        computeScore,
        computeMatchQuickStats,
        computeDashboard,
        aggregateByPeriod,
        aggregateByAttackType,
        aggregateByCourse,
        aggregateTurnoverReasons
    };
})();
