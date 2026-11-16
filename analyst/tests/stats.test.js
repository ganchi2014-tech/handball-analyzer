// Tests for lib/stats.js

describe('HA.stats.computeScore', () => {
    test('empty shots → 0-0', () => {
        expect(HA.stats.computeScore([])).toEqual({ us: 0, opp: 0 });
    });
    test('counts only result=goal', () => {
        const shots = [
            { mode: 'attack', result: 'goal' },
            { mode: 'attack', result: 'save' },
            { mode: 'attack', result: 'miss' },
            { mode: 'attack', result: 'turnover' }
        ];
        expect(HA.stats.computeScore(shots)).toEqual({ us: 1, opp: 0 });
    });
    test('separates attack vs defense goals', () => {
        const shots = [
            { mode: 'attack', result: 'goal' },
            { mode: 'attack', result: 'goal' },
            { mode: 'defense', result: 'goal' }
        ];
        expect(HA.stats.computeScore(shots)).toEqual({ us: 2, opp: 1 });
    });
});

describe('HA.stats.computeMatchQuickStats', () => {
    test('returns zeros for empty match', () => {
        const r = HA.stats.computeMatchQuickStats({ shots: [] });
        expect(r.attShots).toBe(0);
        expect(r.attGoals).toBe(0);
        expect(r.attTO).toBe(0);
        expect(r.attackEfficiency).toBe(0);
    });
    test('attack efficiency = goals / (shots + TO)', () => {
        const shots = [
            { mode: 'attack', result: 'goal' },
            { mode: 'attack', result: 'goal' },
            { mode: 'attack', result: 'save' },
            { mode: 'attack', result: 'turnover' }
        ];
        const r = HA.stats.computeMatchQuickStats({ shots });
        // 2 goals / (3 shots + 1 TO) = 2/4 = 50%
        expect(r.attShots).toBe(3);
        expect(r.attTO).toBe(1);
        expect(r.attGoals).toBe(2);
        expect(r.attackEfficiency).toBe(50);
    });
    test('ignores defense shots in offense stats', () => {
        const shots = [
            { mode: 'attack', result: 'goal' },
            { mode: 'defense', result: 'goal' },
            { mode: 'defense', result: 'save' }
        ];
        const r = HA.stats.computeMatchQuickStats({ shots });
        expect(r.attShots).toBe(1);
        expect(r.attGoals).toBe(1);
        expect(r.attTO).toBe(0);
    });
});

describe('HA.stats.computeDashboard', () => {
    test('attackEfficiency = goals / total attacks', () => {
        const shots = [
            { mode: 'attack', result: 'goal' },
            { mode: 'attack', result: 'miss' },
            { mode: 'attack', result: 'turnover' }
        ];
        const r = HA.stats.computeDashboard(shots);
        expect(r.attackTotal).toBe(3);
        expect(r.attackShots).toBe(2); // not counting TO
        expect(r.attackGoals).toBe(1);
        expect(r.attackEfficiency).toBe(33); // 1/3 = 33%
        expect(r.shotAccuracy).toBe(50);    // 1/2 = 50%
    });
    test('GK save rate = saves / on-target', () => {
        const shots = [
            { mode: 'defense', result: 'goal' },
            { mode: 'defense', result: 'goal' },
            { mode: 'defense', result: 'save' },
            { mode: 'defense', result: 'miss' } // not counted in target
        ];
        const r = HA.stats.computeDashboard(shots);
        expect(r.defShotsOnTarget).toBe(3);
        expect(r.gkSaves).toBe(1);
        expect(r.saveRate).toBe(33);
    });
});

describe('HA.stats.aggregateByPeriod', () => {
    test('splits shots by period field (default 1)', () => {
        const shots = [
            { mode: 'attack', result: 'goal', period: 1 },
            { mode: 'attack', result: 'goal', period: 2 },
            { mode: 'defense', result: 'goal', period: 2 },
            { mode: 'attack', result: 'goal' } // no period → 1
        ];
        const h = HA.stats.aggregateByPeriod(shots);
        expect(h[1].us).toBe(2); // period 1 + undefined
        expect(h[2].us).toBe(1);
        expect(h[2].opp).toBe(1);
    });
});

describe('HA.stats.aggregateByAttackType', () => {
    test('counts goals/shots per type', () => {
        const shots = [
            { mode: 'attack', result: 'goal', attackType: 'set' },
            { mode: 'attack', result: 'save', attackType: 'set' },
            { mode: 'attack', result: 'goal', attackType: 'fast' },
            { mode: 'attack', result: 'goal', attackType: '7m' }
        ];
        const { types, untagged } = HA.stats.aggregateByAttackType(shots);
        expect(types.set.shots).toBe(2);
        expect(types.set.goals).toBe(1);
        expect(types.fast.shots).toBe(1);
        expect(types['7m'].goals).toBe(1);
        expect(untagged).toBe(0);
    });
    test('untagged shots counted separately', () => {
        const shots = [
            { mode: 'attack', result: 'goal' /* no attackType */ }
        ];
        const { untagged } = HA.stats.aggregateByAttackType(shots);
        expect(untagged).toBe(1);
    });
});

describe('HA.stats.aggregateByCourse', () => {
    test('produces 6 zones, separates offense/defense', () => {
        const shots = [
            { mode: 'attack', result: 'goal', course: 'TL' },
            { mode: 'attack', result: 'save', course: 'TL' },
            { mode: 'defense', result: 'goal', course: 'BR' },
            { mode: 'attack', result: 'goal' /* no course */ }
        ];
        const { zones, off, def } = HA.stats.aggregateByCourse(shots);
        expect(zones.length).toBe(6);
        expect(off.TL.g).toBe(1);
        expect(off.TL.s).toBe(1);
        expect(def.BR.g).toBe(1);
        expect(off.ML.g).toBe(0);
    });
});

describe('HA.stats.aggregateTurnoverReasons', () => {
    test('counts TOs by reason, separates offense/defense', () => {
        const shots = [
            { mode: 'attack', result: 'turnover', toReason: 'pass' },
            { mode: 'attack', result: 'turnover', toReason: 'pass' },
            { mode: 'attack', result: 'turnover', toReason: 'dribble' },
            { mode: 'defense', result: 'turnover', toReason: 'foul' },
            { mode: 'attack', result: 'turnover' /* no reason */ },
            { mode: 'attack', result: 'goal' /* not TO */ }
        ];
        const { off, def, offUnk, defUnk } = HA.stats.aggregateTurnoverReasons(shots);
        expect(off.pass).toBe(2);
        expect(off.dribble).toBe(1);
        expect(off.foul).toBe(undefined);
        expect(def.foul).toBe(1);
        expect(offUnk).toBe(1);
        expect(defUnk).toBe(0);
    });
});
