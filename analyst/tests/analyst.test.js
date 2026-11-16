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
        expect(header.endsWith(',miss_type,gk_move,opp_gk,numbers,opp_def,match_id')).toBe(true);
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
        expect(row.length).toBe(23);
    });
    test('未入力は空文字', () => {
        const row = HA.csv.shotToRow({ mode: 'attack', result: 'miss' }, {}, []);
        expect(row[14]).toBe('');
        expect(row[15]).toBe('');
        expect(row[16]).toBe('');
    });
});


describe('分析担当用 v2: 飛んだ先・GKの動き・きっかけ', () => {
    test('飛んだ先の左右は最後の文字で決まる（枠外も）', () => {
        expect(HA.stats.courseSide('TL')).toBe('L');
        expect(HA.stats.courseSide('OTR')).toBe('R');
        expect(HA.stats.courseSide('')).toBe(null);
    });
    test('枠外の区分を見分ける', () => {
        expect(HA.stats.isOutCourse('OTL')).toBe(true);
        expect(HA.stats.isOutCourse('TL')).toBe(false);
    });
    test('自チームのシュート: 何も入っていなければ 飛んだ先・GKの動き が未入力', () => {
        expect(HA.stats.missingAfterTags({ mode: 'attack', result: 'save' })).toEqual(['course', 'gkMove']);
        expect(HA.stats.missingAfterTags({ mode: 'attack', result: 'miss' })).toEqual(['missType', 'course', 'gkMove']);
    });
    test('ブロックは飛んだ先もGKの動きも求めない', () => {
        expect(HA.stats.missingAfterTags({ mode: 'attack', result: 'miss', missType: 'block' })).toEqual([]);
        expect(HA.stats.needsGkMove({ mode: 'attack', result: 'miss', missType: 'block' })).toBe(false);
    });
    test('相手のシュート: 枠内だけGKの動きを求める', () => {
        expect(HA.stats.missingAfterTags({ mode: 'defense', result: 'save', course: 'TL' })).toEqual(['gkMove']);
        expect(HA.stats.missingAfterTags({ mode: 'defense', result: 'miss', missType: 'out', course: 'OL' })).toEqual([]);
        expect(HA.stats.needsGkMove({ mode: 'defense', result: 'miss', missType: 'out' })).toBe(false);
    });
    test('ターンオーバーは対象外。全部入っていれば未入力なし', () => {
        expect(HA.stats.missingAfterTags({ mode: 'attack', result: 'turnover' })).toEqual([]);
        const full = { mode: 'attack', result: 'miss', missType: 'out', course: 'OTR', gkMove: 'U' };
        expect(HA.stats.missingAfterTags(full)).toEqual([]);
        expect(HA.stats.countMissingAfterTags([full, { mode: 'attack', result: 'goal' }])).toBe(1);
    });
    test('GKの動き（段階）ごとの集計は枠内だけを数える', () => {
        const shots = [
            { mode: 'attack', result: 'goal', course: 'TL', gkMove: 'LV2' },
            { mode: 'attack', result: 'save', course: 'TL', gkMove: 'LV2' },
            { mode: 'attack', result: 'miss', course: 'OTL', gkMove: 'LV2' },
            { mode: 'attack', result: 'goal', course: 'BR' },
            { mode: 'defense', result: 'save', course: 'BL', gkMove: 'LV0' }
        ];
        const a = HA.stats.aggregateGkMove(shots, 'attack');
        expect(a.LV2).toEqual({ g: 1, s: 2 });
        expect(a.none).toEqual({ g: 1, s: 1 });
        expect(HA.stats.aggregateGkMove(shots, 'defense').LV0).toEqual({ g: 0, s: 1 });
    });
    test('前の版の値（左右など）は未入力として扱う', () => {
        expect(HA.stats.missingAfterTags({ mode: 'attack', result: 'goal', course: 'TL', gkMove: 'L' })).toEqual(['gkMove']);
        expect(HA.stats.missingAfterTags({ mode: 'attack', result: 'goal', course: 'TL', gkMove: 'LV3' })).toEqual([]);
    });
    test('きっかけは攻守で分けて数える', () => {
        const cues = [
            { kind: 'クロス', mode: 'attack' }, { kind: 'クロス', mode: 'attack' },
            { kind: '1対1', mode: 'attack' }, { kind: 'クロス', mode: 'defense' }
        ];
        expect(HA.stats.countCues(cues, 'attack')).toEqual({ 'クロス': 2, '1対1': 1 });
        expect(HA.stats.countCues(cues, 'defense')).toEqual({ 'クロス': 1 });
        expect(HA.stats.countCues([], 'attack')).toEqual({});
    });
    test('CSV: シュートの行に新しい列が入る', () => {
        const shot = { mode: 'attack', result: 'miss', missType: 'out', course: 'OTR', gkMove: 'LV1',
                       oppGk: '12', numbers: 'minus', oppDef: '51' };
        const row = HA.csv.shotToRow(shot, { date: '2026-11-16', opponent: 'Test' }, []);
        expect(row[7]).toBe('OTR');
        expect(row.slice(17)).toEqual(['out', 'LV1', '12', 'minus', '51', '2026-11-16_Test']);
    });
    test('CSV: きっかけは result=cue の行として末尾に付く', () => {
        const match = { date: '2026-11-16', opponent: 'Test',
            shots: [{ mode: 'attack', result: 'goal', period: 1, time: 10 }],
            cues: [{ kind: 'クロス', mode: 'attack', period: 1, time: 5, numbers: 'even' }] };
        const lines = HA.csv.matchToCsv(match, []).split('\n');
        expect(lines.length).toBe(3);
        const cols = lines[2].split(',');
        expect(cols[5]).toBe('cue');
        expect(cols[16]).toBe('クロス');
    });
});
