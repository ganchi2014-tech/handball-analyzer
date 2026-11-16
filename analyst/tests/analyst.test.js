// 分析担当用の追加機能（状況 / アシスト / きっかけ）のテスト
// tests.html から読み込む。node で回す場合は tests/run-node.js を使う。

describe('HA.stats.needsSituation', () => {
    test('通常のシュートは状況が必要', () => {
        expect(HA.stats.needsSituation({ result: 'goal', attackType: 'set' })).toBe(true);
        expect(HA.stats.needsSituation({ result: 'miss', attackType: 'fast' })).toBe(true);
    });
    test('7m とターンオーバーは対象外', () => {
        expect(HA.stats.needsSituation({ result: 'goal', attackType: '7m' })).toBe(false);
        expect(HA.stats.needsSituation({ result: 'turnover', attackType: 'set' })).toBe(false);
    });
});

describe('HA.stats.countMissingSituation', () => {
    test('状況が入っていないシュートだけ数える', () => {
        const shots = [
            { mode: 'attack', result: 'goal', attackType: 'set', situation: 'free' },
            { mode: 'attack', result: 'save', attackType: 'set' },
            { mode: 'defense', result: 'goal', attackType: 'fast', situation: null },
            { mode: 'attack', result: 'goal', attackType: '7m' },
            { mode: 'attack', result: 'turnover', attackType: 'set' },
            { mode: 'attack', result: 'miss', attackType: 'set', situation: 'bogus' }
        ];
        expect(HA.stats.countMissingSituation(shots)).toBe(3);
    });
    test('空でも落ちない', () => {
        expect(HA.stats.countMissingSituation([])).toBe(0);
        expect(HA.stats.countMissingSituation(null)).toBe(0);
    });
});

describe('HA.stats.aggregateSituationByPlayer', () => {
    const shots = [
        { mode: 'attack', result: 'goal', attackType: 'set', situation: 'free', player: 'A' },
        { mode: 'attack', result: 'goal', attackType: 'set', situation: 'free', player: 'A' },
        { mode: 'attack', result: 'save', attackType: 'set', situation: 'free', player: 'A' },
        { mode: 'attack', result: 'goal', attackType: 'set', situation: 'contact', player: 'A' },
        { mode: 'attack', result: 'miss', attackType: 'set', situation: 'contact', player: 'A' },
        { mode: 'attack', result: 'goal', attackType: 'set', situation: 'jump', player: 'B' },
        { mode: 'attack', result: 'goal', attackType: 'set', player: 'B' },          // 未入力
        { mode: 'attack', result: 'goal', attackType: '7m', player: 'B' },           // 対象外
        { mode: 'attack', result: 'turnover', attackType: 'set', player: 'B' },      // 対象外
        { mode: 'defense', result: 'goal', attackType: 'set', situation: 'free' }    // 相手
    ];
    const r = HA.stats.aggregateSituationByPlayer(shots);
    test('選手ごと・状況ごとに 入った数/打った数 を出す', () => {
        expect(r.players.A.free).toEqual({ g: 2, s: 3 });
        expect(r.players.A.contact).toEqual({ g: 1, s: 2 });
        expect(r.players.B.jump).toEqual({ g: 1, s: 1 });
    });
    test('未入力は none に入る', () => {
        expect(r.players.B.none).toEqual({ g: 1, s: 1 });
    });
    test('7m・ターンオーバー・相手の攻撃は入らない', () => {
        expect(r.total.free).toEqual({ g: 2, s: 3 });
        const all = ['free', 'jump', 'step', 'contact', 'none'].reduce((n, k) => n + r.total[k].s, 0);
        expect(all).toBe(7);
    });
});

describe('HA.stats.aggregateSituationByGk', () => {
    const shots = [
        { mode: 'defense', result: 'save', attackType: 'set', situation: 'jump', gk: 'K1' },
        { mode: 'defense', result: 'goal', attackType: 'set', situation: 'jump', gk: 'K1' },
        { mode: 'defense', result: 'miss', attackType: 'set', situation: 'jump', gk: 'K1' }, // 枠外は入らない
        { mode: 'defense', result: 'save', attackType: '7m', gk: 'K1' },                      // 7m は入らない
        { mode: 'defense', result: 'goal', attackType: 'fast', situation: 'free', gk: 'K2' }
    ];
    const r = HA.stats.aggregateSituationByGk(shots);
    test('GKごとに 止めた数/枠内に来た数 を出す', () => {
        expect(r.K1.jump).toEqual({ g: 1, s: 2 });
        expect(r.K2.free).toEqual({ g: 0, s: 1 });
    });
});

describe('HA.stats.sideOf', () => {
    test('横位置を左・中央・右に分ける', () => {
        expect(HA.stats.sideOf(10)).toBe('L');
        expect(HA.stats.sideOf(50)).toBe('C');
        expect(HA.stats.sideOf(90)).toBe('R');
        expect(HA.stats.sideOf('12.50')).toBe('L');
    });
    test('位置がなければ null', () => {
        expect(HA.stats.sideOf(null)).toBe(null);
        expect(HA.stats.sideOf('')).toBe(null);
    });
});

describe('HA.stats.aggregateOpponentPatterns', () => {
    const shots = [
        { mode: 'defense', result: 'goal', attackType: 'set', situation: 'free', assist: 'R45', x: 90 },
        { mode: 'defense', result: 'goal', attackType: 'set', situation: 'free', assist: 'R45', x: 85 },
        { mode: 'defense', result: 'goal', attackType: 'set', situation: 'free', assist: 'R45', x: 88 },
        { mode: 'defense', result: 'goal', attackType: 'set', situation: 'jump', assist: 'C', x: 50 },
        { mode: 'defense', result: 'goal', attackType: 'set', situation: 'jump', x: 50 },          // アシスト未入力
        { mode: 'defense', result: 'save', attackType: 'set', situation: 'free', x: 90 },
        { mode: 'defense', result: 'goal', attackType: '7m', x: 50 },                               // 対象外
        { mode: 'attack', result: 'goal', attackType: 'set', situation: 'free', x: 90 }            // 自チーム
    ];
    const r = HA.stats.aggregateOpponentPatterns(shots);
    test('状況ごとの 失点/打たれた数', () => {
        expect(r.bySituation.free).toEqual({ g: 3, s: 4 });
        expect(r.bySituation.jump).toEqual({ g: 2, s: 2 });
    });
    test('アシストの出どころを数える', () => {
        expect(r.byAssist.R45).toBe(3);
        expect(r.byAssist.C).toBe(1);
        expect(r.goals).toBe(5);
        expect(r.goalsNoAssist).toBe(1);
    });
    test('同じ形は回数の多い順に並ぶ', () => {
        expect(r.patterns[0]).toEqual({ assist: 'R45', side: 'R', situation: 'free', count: 3 });
        expect(r.patterns.length).toBe(2);
    });
});

describe('HA.csv（分析担当用の列）', () => {
    test('見出しの末尾に situation / assist / trigger が付く', () => {
        const csv = HA.csv.matchToCsv({ date: '2026-11-16', opponent: '練習', shots: [] }, []);
        const header = csv.split('\n')[0];
        expect(header.includes(',x,y,situation,assist,trigger,')).toBe(true);
        expect(header.endsWith(',miss_type,gk_move,start_from,start_how,opp_no,opp_gk,numbers,opp_def,match_id')).toBe(true);
    });
    test('1件の行に状況・アシスト・きっかけが入る', () => {
        const shot = {
            period: 1, time: 30, mode: 'defense', result: 'goal', attackType: 'set',
            x: 80, y: 60, situation: 'free', assist: 'R45', trigger: '右45のカットインから'
        };
        const row = HA.csv.shotToRow(shot, { date: '2026-11-16', opponent: 'Test' }, []);
        expect(row[14]).toBe('free');
        expect(row[15]).toBe('R45');
        expect(row[16]).toBe('右45のカットインから');
        expect(row.length).toBe(26);
    });
    test('未入力は空文字', () => {
        const row = HA.csv.shotToRow({ mode: 'attack', result: 'miss' }, {}, []);
        expect(row[14]).toBe('');
        expect(row[15]).toBe('');
        expect(row[16]).toBe('');
    });
});


describe('分析担当用 v2: 後から足す項目', () => {
    test('GKの動きと飛んだ先から関係を出す', () => {
        expect(HA.stats.gkRelation({ gkMove: 'L', course: 'TL' })).toBe('same');
        expect(HA.stats.gkRelation({ gkMove: 'L', course: 'BR' })).toBe('opposite');
        expect(HA.stats.gkRelation({ gkMove: 'N', course: 'BR' })).toBe('still');
        expect(HA.stats.gkRelation({ gkMove: 'F', course: 'ML' })).toBe('front');
        expect(HA.stats.gkRelation({ gkMove: 'U', course: 'ML' })).toBe('unknown');
        expect(HA.stats.gkRelation({ gkMove: 'L' })).toBe(null);
        expect(HA.stats.gkRelation({ course: 'TL' })).toBe(null);
    });
    test('自チームのセット攻撃: 何も足していなければ 飛んだ先・GKの動き・始まり方 が未入力', () => {
        const m = HA.stats.missingAfterTags({ mode: 'attack', result: 'save', attackType: 'set' });
        expect(m).toEqual(['course', 'gkMove', 'start']);
    });
    test('自チームのミス: 中身も未入力に数える', () => {
        const m = HA.stats.missingAfterTags({ mode: 'attack', result: 'miss', attackType: 'set' });
        expect(m).toEqual(['missType', 'course', 'gkMove', 'start']);
    });
    test('7m と速攻は始まり方を求めない', () => {
        expect(HA.stats.missingAfterTags({ mode: 'attack', result: 'goal', attackType: '7m', course: 'TL', gkMove: 'R' })).toEqual([]);
        expect(HA.stats.missingAfterTags({ mode: 'attack', result: 'goal', attackType: 'fast', course: 'TL', gkMove: 'N' })).toEqual([]);
    });
    test('相手のシュート: 枠内はGKの動き、失点は始まり方。枠外は何も求めない', () => {
        expect(HA.stats.missingAfterTags({ mode: 'defense', result: 'save', attackType: 'set' })).toEqual(['gkMove']);
        expect(HA.stats.missingAfterTags({ mode: 'defense', result: 'goal', attackType: 'set' })).toEqual(['gkMove', 'start']);
        expect(HA.stats.missingAfterTags({ mode: 'defense', result: 'miss', attackType: 'set' })).toEqual([]);
    });
    test('ターンオーバーは対象外。全部入っていれば未入力なし', () => {
        expect(HA.stats.missingAfterTags({ mode: 'attack', result: 'turnover' })).toEqual([]);
        const full = { mode: 'attack', result: 'miss', attackType: 'set', missType: 'out', course: 'TR', gkMove: 'U', startFrom: 'C', startHow: 'cross' };
        expect(HA.stats.missingAfterTags(full)).toEqual([]);
        expect(HA.stats.countMissingAfterTags([full, { mode: 'attack', result: 'goal' }])).toBe(1);
    });
    test('GKとの関係ごとの集計は枠内だけを数える', () => {
        const shots = [
            { mode: 'attack', result: 'goal', course: 'TL', gkMove: 'R' },
            { mode: 'attack', result: 'save', course: 'TL', gkMove: 'L' },
            { mode: 'attack', result: 'miss', course: 'TL', gkMove: 'R' },
            { mode: 'attack', result: 'goal', course: 'BR' },
            { mode: 'defense', result: 'save', course: 'BL', gkMove: 'L' }
        ];
        const a = HA.stats.aggregateGkRelation(shots, 'attack');
        expect(a.opposite).toEqual({ g: 1, s: 1 });
        expect(a.same).toEqual({ g: 0, s: 1 });
        expect(a.none).toEqual({ g: 1, s: 1 });
        const d = HA.stats.aggregateGkRelation(shots, 'defense');
        expect(d.same).toEqual({ g: 0, s: 1 });
    });
    test('CSV に後から足す項目と試合中の切替が入る', () => {
        const shot = { mode: 'defense', result: 'goal', attackType: 'set', gkMove: 'L', startFrom: 'R45', startHow: '1on1',
                       oppNo: '7', oppGk: '12', numbers: 'minus', oppDef: '51' };
        const row = HA.csv.shotToRow(shot, { date: '2026-11-16', opponent: 'Test' }, []);
        expect(row.slice(17)).toEqual(['', 'L', 'R45', '1on1', '7', '12', 'minus', '51', '2026-11-16_Test']);
    });
});
