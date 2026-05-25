// Roster utilities — pure, no DOM.
// Exposes window.HA.roster
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

    function load() {
        try {
            const raw = localStorage.getItem(ROSTER_KEY);
            if (!raw) return makeDefault();
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr) || arr.length === 0) return makeDefault();
            return arr.map(item => {
                if (typeof item === 'string') return { name: item, isGK: false };
                if (item && typeof item.name === 'string') {
                    return { name: item.name, isGK: !!item.isGK };
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

    window.HA = window.HA || {};
    window.HA.roster = {
        KEY: ROSTER_KEY,
        DEFAULT_GKS_SHORT,
        DEFAULT_PLAYER_NAMES,
        stripGradePrefix,
        makeDefault,
        load,
        save,
        getGkShortNames
    };
})();
