// Tests for lib/roster.js

describe('HA.roster.stripGradePrefix', () => {
    test('removes year prefix', () => {
        expect(HA.roster.stripGradePrefix('③赤塚')).toBe('赤塚');
        expect(HA.roster.stripGradePrefix('②新井')).toBe('新井');
        expect(HA.roster.stripGradePrefix('①関山')).toBe('関山');
    });
    test('returns name as-is if no prefix', () => {
        expect(HA.roster.stripGradePrefix('普通の名前')).toBe('普通の名前');
    });
    test('handles empty/null input', () => {
        expect(HA.roster.stripGradePrefix('')).toBe('');
        expect(HA.roster.stripGradePrefix(null)).toBe('');
    });
});

describe('HA.roster.makeDefault', () => {
    test('returns 32 players', () => {
        const r = HA.roster.makeDefault();
        expect(r.length).toBe(32);
    });
    test('each entry has name and isGK fields', () => {
        const r = HA.roster.makeDefault();
        r.forEach(p => {
            expect(typeof p.name).toBe('string');
            expect(typeof p.isGK).toBe('boolean');
        });
    });
    test('5 default GKs', () => {
        const r = HA.roster.makeDefault();
        const gks = r.filter(p => p.isGK);
        expect(gks.length).toBe(5);
    });
});

describe('HA.roster.getGkShortNames', () => {
    test('returns stripped names of GK entries only', () => {
        const roster = [
            { name: '③桑原', isGK: true },
            { name: '③赤塚', isGK: false },
            { name: '②田口', isGK: true }
        ];
        const gks = HA.roster.getGkShortNames(roster);
        expect(gks).toEqual(['桑原', '田口']);
    });
    test('handles empty roster', () => {
        expect(HA.roster.getGkShortNames([])).toEqual([]);
        expect(HA.roster.getGkShortNames(null)).toEqual([]);
    });
});

describe('HA.roster.load/save round-trip', () => {
    test('save then load returns the same data', () => {
        const original = [
            { name: '③テスト', isGK: false },
            { name: '①GK太郎', isGK: true }
        ];
        // Save under our test key
        const stash = localStorage.getItem(HA.roster.KEY);
        try {
            HA.roster.save(original);
            const loaded = HA.roster.load();
            expect(loaded).toEqual(original);
        } finally {
            if (stash === null) localStorage.removeItem(HA.roster.KEY);
            else localStorage.setItem(HA.roster.KEY, stash);
        }
    });
    test('load returns defaults if storage empty', () => {
        const stash = localStorage.getItem(HA.roster.KEY);
        try {
            localStorage.removeItem(HA.roster.KEY);
            const loaded = HA.roster.load();
            expect(loaded.length).toBe(32);
        } finally {
            if (stash !== null) localStorage.setItem(HA.roster.KEY, stash);
        }
    });
});
