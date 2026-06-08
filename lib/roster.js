// Roster utilities — pure, no DOM.
// Exposes window.HA.roster
// v2: Firebase /roster と同期。localStorage はオフライン用キャッシュ。
(function () {
    'use strict';
    const ROSTER_KEY = 'handball-analyzer-roster-v1';

    const DEFAULT_GKS_SHORT = ['桑原', '杉本', '小川', '田口', '関山'];
    const DEFAULT_PLAYER_NAMES = [
        '③赤塚', '③岩噌', '③川崎', '③北村', '③辻', '③中田', '③伴', '③山本', '③桑原', '③杉本',
        '②新井', '②猪田', '②北林', '②田端', '②藤川', '②松岡', '②村田', '②安田', '②小川', '②田口',
        '①石黒', '①岩噌', '①大野', '①北川', '①嶌本', '①福原', '①増田', '①水田', '①宮崎', '①森井', '①山崎', '①関山'
    ];

    function stripGradePrefix(name) {
        return String(name || '').replace(/^[①②③]/, '');
    }

    function makeDefault() {
        return DEFAULT_PLAYER_NAMES.map(name => ({
            name,
            isGK: DEFAULT_GKS_SHORT.includes(stripGradePrefix(name))
        }));
    }

    // ── Firebase /roster の学年自動計算ヘルパー ──
    function computeGrade(enrollmentYear, refDate) {
        if (!enrollmentYear) return 0;
        const d = refDate || new Date();
        const schoolYear = (d.getMonth() + 1) >= 4 ? d.getFullYear() : d.getFullYear() - 1;
        return schoolYear - enrollmentYear + 1;
    }
    function gradeSymbol(grade) {
        return ['', '①', '②', '③'][grade] || '';
    }
    // Firebase 名簿エントリ → analyzer 表示名
    function firebaseEntryToAnalyzerName(entry) {
        const g = computeGrade(entry.enrollmentYear);
        return gradeSymbol(g) + (entry.surname || '');
    }

    function load() {
        try {
            const raw = localStorage.getItem(ROSTER_KEY);
            if (!raw) return makeDefault();
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr) || arr.length === 0) return makeDefault();
            return arr.map(item => {
                if (typeof item === 'string') return { name: item, isGK: false, rosterId: null };
                if (item && typeof item.name === 'string') {
                    return { name: item.name, isGK: !!item.isGK, rosterId: item.rosterId || null };
                }
                return null;
            }).filter(Boolean);
        } catch (e) {
            console.warn('roster.load failed', e);
            return makeDefault();
        }
    }

    function save(roster) {
        try {
            localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
        } catch (e) {
            console.warn('roster.save failed', e);
        }
    }

    function getGkShortNames(roster) {
        return (roster || []).filter(p => p && p.isGK).map(p => stripGradePrefix(p.name));
    }

    // ── Firebase /roster から非同期読込 & ローカルキャッシュ更新 ──
    // 成功すると {name, isGK, rosterId} 配列を返す
    async function loadFromFirebase() {
        if (!window.fbDB) return null;
        try {
            const snap = await window.fbDB.ref('roster').once('value');
            const val = snap.val();
            if (!val) return null;
            const arr = Object.entries(val)
                .filter(([_, e]) => e && e.active !== false)
                .map(([rosterId, e]) => ({
                    name: firebaseEntryToAnalyzerName(e),
                    isGK: !!e.isGK,
                    rosterId,
                    enrollmentYear: e.enrollmentYear || null,
                    surname: e.surname || '',
                    fullName: e.fullName || ''
                }));
            // 学年→苗字順
            arr.sort((a, b) => {
                const ga = computeGrade(a.enrollmentYear);
                const gb = computeGrade(b.enrollmentYear);
                if (ga !== gb) return ga - gb;
                return (a.surname || '').localeCompare(b.surname || '', 'ja');
            });
            // ローカルにキャッシュ
            save(arr);
            return arr;
        } catch (e) {
            console.warn('[roster] Firebase load failed', e);
            return null;
        }
    }

    // ── Firebase /roster の変更を購読（リアルタイム同期） ──
    // callback(roster: Array) を変更のたびに呼ぶ
    function subscribeFirebase(callback) {
        if (!window.fbDB) return () => {};
        const ref = window.fbDB.ref('roster');
        const handler = ref.on('value', (snap) => {
            const val = snap.val();
            if (!val) { callback(makeDefault()); return; }
            const arr = Object.entries(val)
                .filter(([_, e]) => e && e.active !== false)
                .map(([rosterId, e]) => ({
                    name: firebaseEntryToAnalyzerName(e),
                    isGK: !!e.isGK,
                    rosterId,
                    enrollmentYear: e.enrollmentYear || null,
                    surname: e.surname || '',
                    fullName: e.fullName || ''
                }));
            arr.sort((a, b) => {
                const ga = computeGrade(a.enrollmentYear);
                const gb = computeGrade(b.enrollmentYear);
                if (ga !== gb) return ga - gb;
                return (a.surname || '').localeCompare(b.surname || '', 'ja');
            });
            save(arr);
            callback(arr);
        });
        return () => ref.off('value', handler);
    }

    window.HA = window.HA || {};
    window.HA.roster = {
        KEY: ROSTER_KEY,
        DEFAULT_GKS_SHORT,
        DEFAULT_PLAYER_NAMES,
        stripGradePrefix,
        makeDefault,
        load,
        save,
        getGkShortNames,
        // v2 Firebase API
        computeGrade,
        gradeSymbol,
        firebaseEntryToAnalyzerName,
        loadFromFirebase,
        subscribeFirebase
    };
})();
