// CSV generation + download (Excel-compatible with UTF-8 BOM).
// Exposes window.HA.csv
(function () {
    'use strict';

    const HEADERS = ['date', 'opponent', 'period', 'time_s', 'mode', 'result',
                     'attack_type', 'course', 'player', 'gk', 'to_reason', 'x', 'y'];

    function escape(v) {
        const s = v == null ? '' : String(v);
        return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function shotToRow(shot, match) {
        return [
            (match && match.date) || '',
            (match && match.opponent) || '',
            shot.period == null ? '' : shot.period,
            shot.time == null ? '' : shot.time,
            shot.mode || '',
            shot.result || '',
            shot.attackType || '',
            shot.course || '',
            shot.player || '',
            shot.gk || '',
            shot.toReason || '',
            shot.x == null ? '' : Number(shot.x).toFixed(2),
            shot.y == null ? '' : Number(shot.y).toFixed(2)
        ];
    }

    function matchToCsv(match) {
        const lines = [HEADERS.map(escape).join(',')];
        ((match && match.shots) || []).forEach(s => {
            lines.push(shotToRow(s, match).map(escape).join(','));
        });
        return lines.join('\n');
    }

    function matchesToCsv(matches) {
        const lines = [HEADERS.map(escape).join(',')];
        (matches || []).forEach(match => {
            ((match && match.shots) || []).forEach(s => {
                lines.push(shotToRow(s, match).map(escape).join(','));
            });
        });
        return lines.join('\n');
    }

    function safeFilenamePart(s) {
        return String(s || '').replace(/[\/\\?%*:|"<>]/g, '_').slice(0, 40);
    }

    function download(filename, content) {
        const bom = String.fromCharCode(0xFEFF);
        const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            try { document.body.removeChild(a); } catch (e) {}
            URL.revokeObjectURL(url);
        }, 100);
    }

    window.HA = window.HA || {};
    window.HA.csv = {
        HEADERS,
        escape,
        shotToRow,
        matchToCsv,
        matchesToCsv,
        safeFilenamePart,
        download
    };
})();
