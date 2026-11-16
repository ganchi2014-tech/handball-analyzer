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


    // ── 分析担当用 v2: 飛んだ先 / ミスの中身 / GKの最初の動き / きっかけ ──
    // course   : 飛んだ先。枠内 TL/TR/ML/MR/BL/BR、枠外 OL=左 / OR=右 / OTL=左上 / OTR=右上
    // missType : ミスの中身 out=枠外 / block=DFのブロック
    // gkMove   : GKの最初の動き（シューター視点） L=左 / R=右 / F=前に出た / N=動かなかった / U=分からない
    const GK_MOVES = ['L', 'R', 'F', 'N', 'U'];
    const MISS_TYPES = ['out', 'block'];
    const OUT_COURSES = ['OL', 'OR', 'OTL', 'OTR'];

    function isOutCourse(course) { return OUT_COURSES.includes(course); }

    // 飛んだ先の左右（最後の文字で決まる）
    function courseSide(course) {
        if (!course || course.length < 2) return null;
        const c = course[course.length - 1];
        return c === 'L' ? 'L' : c === 'R' ? 'R' : null;
    }

    // 飛んだ先と GK の最初の動きの関係。付けるのは事実2つだけで、関係はここで機械的に出す。
    //   opposite=GKの逆 / same=GKと同じ側 / still=GKは動かなかった / front=GKが前に出た / unknown=分からない
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

    // きっかけ（何を狙ったか）の回数。cues = [{ kind, mode, period, time, ... }]
    function countCues(cues, mode) {
        const out = {};
        (cues || []).forEach(c => {
            if (!c || !c.kind) return;
            if (mode && c.mode !== mode) return;
            out[c.kind] = (out[c.kind] || 0) + 1;
        });
        return out;
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
        GK_MOVES, MISS_TYPES, OUT_COURSES, isOutCourse,
        courseSide, gkRelation, needsGkMove, missingAfterTags, countMissingAfterTags, aggregateGkRelation, countCues,
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
