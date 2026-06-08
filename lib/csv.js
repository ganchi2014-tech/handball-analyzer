// CSV generation + download (Excel-compatible with UTF-8 BOM).
// Exposes window.HA.csv
(function () {
    'use strict';

    const HEADERS = ['date', 'opponent', 'period', 'time_s', 'mode', 'result',
                     'attack_type', 'course', 'player', 'rosterId', 'gk', 'to_reason', 'x', 'y'];

    function escape(v) {
        const s = v == null ? '' : String(v);
        return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function shotToRow(shot, match, roster) {
        // roster (Array) から player 名で rosterId を逆引き
        let rosterId = shot.rosterId || '';
        if (!rosterId && shot.player && Array.isArray(roster)) {
            const found = roster.find(p => p && p.name === shot.player);
            if (found) rosterId = found.rosterId || '';
        }
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
            rosterId,
            shot.gk || '',
            shot.toReason || '',
            shot.x == null ? '' : Number(shot.x).toFixed(2),
            shot.y == null ? '' : Number(shot.y).toFixed(2)
        ];
    }

    function matchToCsv(match, roster) {
        const r = roster || (window.HA && window.HA.roster && window.HA.roster.load ? window.HA.roster.load() : null);
        const lines = [HEADERS.map(escape).join(',')];
        ((match && match.shots) || []).forEach(s => {
            lines.push(shotToRow(s, match, r).map(escape).join(','));
        });
        return lines.join('\n');
    }

    function matchesToCsv(matches, roster) {
        const r = roster || (window.HA && window.HA.roster && window.HA.roster.load ? window.HA.roster.load() : null);
        const lines = [HEADERS.map(escape).join(',')];
        (matches || []).forEach(match => {
            ((match && match.shots) || []).forEach(s => {
                lines.push(shotToRow(s, match, r).map(escape).join(','));
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

    // Returns one of: 'shared' | 'downloaded' | 'aborted'
    // - 'shared'      : user passed it through navigator.share()
    // - 'downloaded'  : share not supported (or file share unsupported) → file saved via download attribute
    // - 'aborted'     : user dismissed the share sheet without picking a destination
    async function shareOrDownload(filename, content) {
        const bom = String.fromCharCode(0xFEFF);
        const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
        const canShareFiles = typeof navigator !== 'undefined'
            && typeof navigator.canShare === 'function'
            && typeof File !== 'undefined';
        if (canShareFiles) {
            try {
                const file = new File([blob], filename, { type: 'text/csv;charset=utf-8' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: filename,
                        text: 'Handball Analyzer data'
                    });
                    return 'shared';
                }
            } catch (e) {
                if (e && e.name === 'AbortError') return 'aborted';
                console.warn('share failed, falling back to download', e);
            }
        }
        // Fallback to download
        download(filename, content);
        return 'downloaded';
    }

    window.HA = window.HA || {};
    window.HA.csv = {
        HEADERS,
        escape,
        shotToRow,
        matchToCsv,
        matchesToCsv,
        safeFilenamePart,
        download,
        shareOrDownload
    };
})();
