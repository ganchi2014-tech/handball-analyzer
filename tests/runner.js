// Tiny browser-based test runner (jest-like API).
// No node/npm required. Open tests/tests.html to execute.

(function () {
    'use strict';

    const state = {
        suites: [],
        results: { passed: 0, failed: 0, errors: [] }
    };

    function describe(name, fn) {
        const suite = { name, tests: [] };
        state.suites.push(suite);
        state._currentSuite = suite;
        try { fn(); } finally { state._currentSuite = null; }
    }

    function test(name, fn) {
        if (!state._currentSuite) {
            state.suites.push({ name: '(root)', tests: [{ name, fn }] });
        } else {
            state._currentSuite.tests.push({ name, fn });
        }
    }

    function expect(actual) {
        return {
            toBe(expected) {
                if (actual !== expected) {
                    throw new Error(`Expected ${JSON.stringify(expected)} (${typeof expected}), got ${JSON.stringify(actual)} (${typeof actual})`);
                }
            },
            toEqual(expected) {
                const a = JSON.stringify(actual);
                const e = JSON.stringify(expected);
                if (a !== e) throw new Error(`Expected ${e}, got ${a}`);
            },
            toBeTruthy() {
                if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
            },
            toBeFalsy() {
                if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
            },
            toContain(sub) {
                if (typeof actual === 'string' && !actual.includes(sub)) {
                    throw new Error(`Expected "${actual}" to contain "${sub}"`);
                }
                if (Array.isArray(actual) && !actual.includes(sub)) {
                    throw new Error(`Expected array to contain ${JSON.stringify(sub)}`);
                }
            },
            toBeCloseTo(expected, places = 2) {
                const diff = Math.abs(actual - expected);
                if (diff > Math.pow(10, -places) / 2) {
                    throw new Error(`Expected ${actual} ≈ ${expected} (within ${places} decimal places)`);
                }
            },
            not: {
                toBe(expected) {
                    if (actual === expected) throw new Error(`Expected NOT ${expected}, got equal`);
                }
            }
        };
    }

    function runAll() {
        const out = document.getElementById('test-results');
        const summary = document.getElementById('test-summary');
        out.innerHTML = '';
        state.results = { passed: 0, failed: 0, errors: [] };

        state.suites.forEach(suite => {
            const suiteDiv = document.createElement('div');
            suiteDiv.className = 'suite';
            const title = document.createElement('div');
            title.className = 'suite-title';
            title.textContent = suite.name;
            suiteDiv.appendChild(title);

            suite.tests.forEach(t => {
                const row = document.createElement('div');
                row.className = 'test-row';
                try {
                    t.fn();
                    row.classList.add('pass');
                    row.innerHTML = `<span class="status">✓</span> ${t.name}`;
                    state.results.passed++;
                } catch (e) {
                    row.classList.add('fail');
                    row.innerHTML = `<span class="status">✗</span> ${t.name}<br><span class="error">${escapeHtml(e.message)}</span>`;
                    state.results.failed++;
                    state.results.errors.push({ suite: suite.name, name: t.name, error: e });
                }
                suiteDiv.appendChild(row);
            });
            out.appendChild(suiteDiv);
        });

        const total = state.results.passed + state.results.failed;
        summary.className = state.results.failed === 0 ? 'summary pass' : 'summary fail';
        summary.innerHTML = `
            <strong>${total}</strong> tests,
            <span class="ok">${state.results.passed} passed</span>,
            <span class="ng">${state.results.failed} failed</span>
        `;
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    window.describe = describe;
    window.test = test;
    window.it = test; // jest alias
    window.expect = expect;
    window.__runTests = runAll;
})();
