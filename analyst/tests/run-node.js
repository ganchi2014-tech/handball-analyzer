// node でテストを回すための小さな実行役（ブラウザを開かずに確認したいとき用）。
//   使い方:  node tests/run-node.js      （analyst フォルダで実行）
// ブラウザで見る場合は tests/tests.html を開く。
'use strict';
const path = require('path');

global.window = global;
// roster.js が触る最小限の代用品
global.localStorage = {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
};

const suites = [];
let current = null;
global.describe = (name, fn) => { current = { name, tests: [] }; suites.push(current); fn(); current = null; };
global.test = global.it = (name, fn) => { (current || (suites[suites.push({ name: '(root)', tests: [] }) - 1])).tests.push({ name, fn }); };
global.expect = (actual) => ({
    toBe(e) { if (actual !== e) throw new Error(`Expected ${JSON.stringify(e)}, got ${JSON.stringify(actual)}`); },
    toEqual(e) { const a = JSON.stringify(actual), b = JSON.stringify(e); if (a !== b) throw new Error(`Expected ${b}, got ${a}`); },
    toBeTruthy() { if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`); },
    toBeFalsy() { if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`); },
    toContain(sub) {
        if (typeof actual === 'string' && !actual.includes(sub)) throw new Error(`Expected "${actual}" to contain "${sub}"`);
        if (Array.isArray(actual) && !actual.includes(sub)) throw new Error(`Expected array to contain ${JSON.stringify(sub)}`);
    },
    toBeCloseTo(e, places = 2) { if (Math.abs(actual - e) > Math.pow(10, -places) / 2) throw new Error(`Expected ${actual} ≈ ${e}`); },
    not: { toBe(e) { if (actual === e) throw new Error(`Expected not ${JSON.stringify(e)}`); } }
});

const root = path.join(__dirname, '..');
['lib/roster.js', 'lib/stats.js', 'lib/csv.js'].forEach(f => require(path.join(root, f)));
['stats.test.js', 'roster.test.js', 'csv.test.js', 'analyst.test.js'].forEach(f => require(path.join(__dirname, f)));

(async () => {
    let passed = 0, failed = 0;
    for (const s of suites) {
        for (const t of s.tests) {
            try { await t.fn(); passed++; }
            catch (e) { failed++; console.log(`✗ ${s.name} › ${t.name}\n    ${e.message}`); }
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();
