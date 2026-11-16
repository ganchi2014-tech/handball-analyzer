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


    // ── 飛んだ先 / ミスの中身 / GKの動き（分析担当用と同じ決まり）──
    // course   : 飛んだ先。枠内 TL/TR/ML/MR/BL/BR、枠外 OL=左 / OR=右 / OTL=左上 / OTR=右上
    // missType : ミスの中身 out=枠外 / block=DFのブロック
    // gkMove   : GKが最初に動いた方向（シューター視点） L=左 / R=右 / F=前に出た / N=動かなかった / U=分からない
    // gkLv     : GKのLv（東岸先生の4段階） LV1=中間位置 / LV2=せーのドン / LV3=駆け引き / LV0=動かなかった
    const GK_MOVES = ['L', 'R', 'F', 'N', 'U'];
    const GK_LVS = ['LV1', 'LV2', 'LV3', 'LV0'];
    const GK_LV_LABELS = { LV1: '✋ 中間位置', LV2: '✊ せーのドン', LV3: '✌ かけひき', LV0: '✖ 動かなかった' };
    const MISS_TYPES = ['out', 'block'];
    const OUT_COURSES = ['OL', 'OR', 'OTL', 'OTR'];

    function isOutCourse(course) { return OUT_COURSES.includes(course); }

    // 飛んだ先の左右（最後の文字で決まる）
    function courseSide(course) {
        if (!course || course.length < 2) return null;
        const c = course[course.length - 1];
        return c === 'L' ? 'L' : c === 'R' ? 'R' : null;
    }

    // 飛んだ先と GK が最初に動いた方向の関係。付けるのは事実2つだけで、関係はここで機械的に出す。
    //   opposite=GKの逆 / same=GKと同じ側 / still=GKは動かなかった / front=GKが前に出た / unknown=分からない
    // 注意: GKの立ち位置は記録に無いので、「逆」は動いた向きと飛んだ先が逆、という意味まで。
    function gkRelation(s) {
        if (!s || !GK_MOVES.includes(s.gkMove)) return null;
        if (s.gkMove === 'U') return 'unknown';
        if (s.gkMove === 'N') return 'still';
        if (s.gkMove === 'F') return 'front';
        const side = courseSide(s.course);
        if (!side) return null;
        return s.gkMove === side ? 'same' : 'opposite';
    }

    // GKの動きを付ける対象か（ブロックは対象外。相手のシュートは枠内だけ）
    function needsGkMove(s) {
        if (!s || s.result === 'turnover' || !s.result) return false;
        if (s.missType === 'block') return false;
        if (s.mode === 'attack') return true;
        return s.result === 'goal' || s.result === 'save';
    }

    // まだ入っていない項目
    function missingAfterTags(s) {
        const miss = [];
        if (!s || s.result === 'turnover' || !s.result) return miss;
        if (s.result === 'miss' && !MISS_TYPES.includes(s.missType)) miss.push('missType');
        if (s.missType !== 'block' && !s.course) miss.push('course');
        if (needsGkMove(s) && !GK_MOVES.includes(s.gkMove)) miss.push('gkMove');
        return miss;
    }

    function countMissingAfterTags(shots) {
        let n = 0;
        (shots || []).forEach(s => { if (missingAfterTags(s).length > 0) n++; });
        return n;
    }

    // GKとの関係ごとの「入った数 / 枠内の数」。mode='attack' は相手GK、'defense' は自GK。
    function aggregateGkRelation(shots, mode) {
        const keys = ['opposite', 'same', 'still', 'front', 'unknown', 'none'];
        const out = {};
        keys.forEach(k => { out[k] = { g: 0, s: 0 }; });
        (shots || []).forEach(s => {
            if (!s || s.mode !== mode) return;
            if (s.result !== 'goal' && s.result !== 'save') return;
            const rel = gkRelation(s) || 'none';
            out[rel].s++;
            if (s.result === 'goal') out[rel].g++;
        });
        return out;
    }

    // GKのLvごとの「入った数 / 枠内の数」。mode='attack' は相手GK、'defense' は自GK。
    function aggregateGkLv(shots, mode) {
        const out = {};
        GK_LVS.concat(['none']).forEach(k => { out[k] = { g: 0, s: 0 }; });
        (shots || []).forEach(s => {
            if (!s || s.mode !== mode) return;
            if (s.result !== 'goal' && s.result !== 'save') return;
            const k = GK_LVS.includes(s.gkLv) ? s.gkLv : 'none';
            out[k].s++;
            if (s.result === 'goal') out[k].g++;
        });
        return out;
    }

    window.HA = window.HA || {};
    window.HA.stats = {
        GK_MOVES, GK_LVS, GK_LV_LABELS, MISS_TYPES, OUT_COURSES, isOutCourse,
        courseSide, gkRelation, needsGkMove, missingAfterTags, countMissingAfterTags, aggregateGkRelation, aggregateGkLv,
        computeScore,
        computeMatchQuickStats,
        computeDashboard,
        aggregateByPeriod,
        aggregateByAttackType,
        aggregateByCourse,
        aggregateTurnoverReasons
    };
})();
