// Tests for lib/csv.js

describe('HA.csv.escape', () => {
    test('returns plain string for safe input', () => {
        expect(HA.csv.escape('hello')).toBe('hello');
        expect(HA.csv.escape(42)).toBe('42');
    });
    test('handles null/undefined as empty', () => {
        expect(HA.csv.escape(null)).toBe('');
        expect(HA.csv.escape(undefined)).toBe('');
    });
    test('quotes values with comma', () => {
        expect(HA.csv.escape('a,b')).toBe('"a,b"');
    });
    test('quotes values with quotes and doubles inner quotes', () => {
        expect(HA.csv.escape('he said "hi"')).toBe('"he said ""hi"""');
    });
    test('quotes values with newlines', () => {
        expect(HA.csv.escape('line1\nline2')).toBe('"line1\nline2"');
    });
});

describe('HA.csv.shotToRow', () => {
    test('produces ordered cells from a shot', () => {
        const shot = {
            period: 1, time: 30, mode: 'attack', result: 'goal',
            attackType: 'set', course: 'TL', player: '③赤塚', gk: '桑原',
            toReason: null, x: 12.34, y: 56.78
        };
        const match = { date: '2026-05-25', opponent: 'Test' };
        const row = HA.csv.shotToRow(shot, match);
        // Order should match HEADERS
        expect(row[0]).toBe('2026-05-25');
        expect(row[1]).toBe('Test');
        expect(row[2]).toBe(1);
        expect(row[3]).toBe(30);
        expect(row[4]).toBe('attack');
        expect(row[5]).toBe('goal');
        expect(row[6]).toBe('set');
        expect(row[7]).toBe('TL');
        expect(row[8]).toBe('③赤塚');
        expect(row[9]).toBe('桑原');
        expect(row[10]).toBe('');
        expect(row[11]).toBe('12.34');
        expect(row[12]).toBe('56.78');
    });
    test('handles null x/y for turnovers', () => {
        const shot = { period: 1, mode: 'attack', result: 'turnover', x: null, y: null };
        const row = HA.csv.shotToRow(shot, { date: '', opponent: '' });
        expect(row[11]).toBe('');
        expect(row[12]).toBe('');
    });
});

describe('HA.csv.matchToCsv', () => {
    test('produces header + 1 line per shot', () => {
        const match = {
            date: '2026-05-25', opponent: 'Test',
            shots: [
                { period: 1, time: 0, mode: 'attack', result: 'goal', x: 50, y: 50 },
                { period: 1, time: 10, mode: 'defense', result: 'save', x: 30, y: 60 }
            ]
        };
        const csv = HA.csv.matchToCsv(match);
        const lines = csv.split('\n');
        expect(lines.length).toBe(3); // header + 2 rows
        expect(lines[0]).toContain('date');
        expect(lines[0]).toContain('result');
        expect(lines[1]).toContain('goal');
        expect(lines[2]).toContain('save');
    });
    test('header-only for empty shots', () => {
        const csv = HA.csv.matchToCsv({ shots: [] });
        const lines = csv.split('\n');
        expect(lines.length).toBe(1);
    });
});

describe('HA.csv.matchesToCsv', () => {
    test('flattens multiple matches into one CSV', () => {
        const matches = [
            { date: '2026-05-25', opponent: 'A', shots: [{ mode: 'attack', result: 'goal' }] },
            { date: '2026-05-26', opponent: 'B', shots: [{ mode: 'attack', result: 'miss' }, { mode: 'attack', result: 'goal' }] }
        ];
        const csv = HA.csv.matchesToCsv(matches);
        const lines = csv.split('\n');
        expect(lines.length).toBe(4); // header + 3 rows
        expect(lines[1]).toContain('2026-05-25');
        expect(lines[2]).toContain('2026-05-26');
        expect(lines[3]).toContain('2026-05-26');
    });
});

describe('HA.csv.shareOrDownload (fallback path)', () => {
    test('returns "downloaded" when navigator.canShare is unavailable', async () => {
        const origCanShare = navigator.canShare;
        const origCreate = URL.createObjectURL;
        const origRevoke = URL.revokeObjectURL;
        const origAClick = HTMLAnchorElement.prototype.click;
        // Force fallback: stub canShare to undefined
        delete navigator.canShare;
        URL.createObjectURL = () => 'blob:test';
        URL.revokeObjectURL = () => {};
        HTMLAnchorElement.prototype.click = function () {};
        try {
            const result = await HA.csv.shareOrDownload('test.csv', 'a,b\n1,2');
            expect(result).toBe('downloaded');
        } finally {
            if (origCanShare) navigator.canShare = origCanShare;
            URL.createObjectURL = origCreate;
            URL.revokeObjectURL = origRevoke;
            HTMLAnchorElement.prototype.click = origAClick;
        }
    });
    test('returns "downloaded" when canShare returns false', async () => {
        const origCanShare = navigator.canShare;
        const origCreate = URL.createObjectURL;
        const origAClick = HTMLAnchorElement.prototype.click;
        navigator.canShare = () => false;
        URL.createObjectURL = () => 'blob:test';
        HTMLAnchorElement.prototype.click = function () {};
        try {
            const result = await HA.csv.shareOrDownload('test.csv', 'a,b\n1,2');
            expect(result).toBe('downloaded');
        } finally {
            if (origCanShare) navigator.canShare = origCanShare;
            else delete navigator.canShare;
            URL.createObjectURL = origCreate;
            HTMLAnchorElement.prototype.click = origAClick;
        }
    });
});

describe('HA.csv.safeFilenamePart', () => {
    test('strips problematic chars', () => {
        expect(HA.csv.safeFilenamePart('a/b\\c?d*e:f|g"h<i>j%k')).toBe('a_b_c_d_e_f_g_h_i_j_k');
    });
    test('truncates to 40 chars', () => {
        const long = 'a'.repeat(100);
        expect(HA.csv.safeFilenamePart(long).length).toBe(40);
    });
    test('handles null/empty', () => {
        expect(HA.csv.safeFilenamePart(null)).toBe('');
        expect(HA.csv.safeFilenamePart('')).toBe('');
    });
});
