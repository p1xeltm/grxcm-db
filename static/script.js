// Globale Zustände & Konstanten
let alleAktivitaeten = [], map = null, aktuellerTrackLayer = null, aktuellerHoverMarker = null;
let aktuellerRawTrack = null, meinHoehenChart = null, aktiveActivityId = null, alterZellenWert = '';

const MONATE = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const RAEDER = ['', '#exceed', '#terra', '#c62o', '#slx99'];

const $ = (id) => document.getElementById(id);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();


/*
  =================================================================================
    HELFER & FORMATIERUNG
  ================================================================================= 
*/

function getTrack(akt) {
    if (!akt?.track) return null;
    try {
        const t = typeof akt.track === 'string' ? JSON.parse(akt.track) : akt.track;
        return Array.isArray(t) && t.length ? t : null;
    } catch { return null; }
}

const formatDatum = (s) => {
    if (!s) return '';
    const [, m, t] = s.split('-');
    return t ? `${MONATE[parseInt(m, 10) - 1] || m} ${t}` : s;
};

const formatZahl = (w, n = 2) => (w == null || w === '') ? '' : Number(w).toFixed(n).replace('.', ',');

const formatZeit = (sek) => !sek ? '' : [
    Math.floor(sek / 3600),
    String(Math.floor((sek % 3600) / 60)).padStart(2, '0'),
    String(sek % 60).padStart(2, '0')
].join(':');

const getRadKlasse = (r) => {
    const name = (r || '').toLowerCase().trim().replace('#', '');
    return name ? `rad-${name}` : '';
};


/*
  =================================================================================
    KARTE & HÖHENPROFIL
  ================================================================================= 
*/

function initKarte() {
    if (!$('osmkarte')) return;
    map = L.map('osmkarte', { zoomControl: false, attributionControl: false }).setView([48.5328, 9.3170], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18, opacity: 0.9, className: 'hillshade-layer', attribution: 'Esri, USGS, NOAA'
    }).addTo(map);

    const maxCtrl = L.control({ position: 'topright' });
    maxCtrl.onAdd = () => {
        const btn = L.DomUtil.create('div', 'leaflet-control-maximize');
        btn.textContent = '⛶';
        L.DomEvent.disableClickPropagation(btn);
        btn.onclick = () => toggleKarteMaximieren();
        return btn;
    };
    maxCtrl.addTo(map);
}

function toggleKarteMaximieren(erzwingeSchliessen = false) {
    if (!map) return;
    const container = map.getContainer();
    if (erzwingeSchliessen && !container.classList.contains('karte-maximiert')) return;

    container.classList.toggle('karte-maximiert', erzwingeSchliessen ? false : undefined);
    map.invalidateSize();
    if (aktuellerTrackLayer) map.fitBounds(aktuellerTrackLayer.getBounds(), { padding: [20, 20] });
}

function zeigeTrackAufKarte(id) {
    if (!map) return;
    if (aktuellerTrackLayer) map.removeLayer(aktuellerTrackLayer);
    aktuellerTrackLayer = null;

    const track = getTrack(alleAktivitaeten.find(a => a.id === id));
    if (!track) return;

    aktuellerTrackLayer = L.polyline(track, { color: cssVar('--col-track'), weight: 3, opacity: 0.85, smoothFactor: 1 }).addTo(map);
    map.fitBounds(aktuellerTrackLayer.getBounds(), { padding: [20, 20] });
}

function zeigeHoehenprofil(id) {
    const ctx = $('hoehenprofilChart')?.getContext('2d');
    if (!ctx) return;
    if (meinHoehenChart) {
        meinHoehenChart.destroy();
        meinHoehenChart = null;
    }

    const akt = alleAktivitaeten.find(a => a.id === id);
    aktuellerRawTrack = getTrack(akt);
    if (!aktuellerRawTrack) return;

    const dist = Number(akt.distanz) || 0;
    const len = aktuellerRawTrack.length;
    const punkte = aktuellerRawTrack.map((p, i) => ({
        x: Number((len > 1 ? (i / (len - 1)) * dist : 0).toFixed(2)),
        y: p.length > 2 ? p[2] : 0
    }));

    const maxH = punkte.reduce((max, p) => Math.max(max, p.y), 0);
    const minH = punkte.reduce((min, p) => Math.min(min, p.y), maxH);
    const yMax = Math.ceil((maxH + 50) / 50) * 50;
    const yMin = Math.floor((minH > 0 ? minH * 0.9 : 0) / 50) * 50;

    const akzent = cssVar('--col-akzent1');
    const trackCol = cssVar('--col-track');

    meinHoehenChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                data: punkte,
                borderColor: akzent,
                backgroundColor: `color-mix(in srgb, ${akzent} 20%, transparent)`,
                borderWidth: 2,
                fill: true,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: false, axis: 'x' },
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            onHover: (_, active) => {
                if (!map || !aktuellerRawTrack) return;
                const p = active.length ? aktuellerRawTrack[active[0].index] : null;
                if (p) {
                    const pos = [p[0], p[1]];
                    aktuellerHoverMarker
                        ? aktuellerHoverMarker.setLatLng(pos)
                        : (aktuellerHoverMarker = L.circleMarker(pos, { radius: 6, color: 'white', fillColor: trackCol, fillOpacity: 1, weight: 2 }).addTo(map));
                } else if (aktuellerHoverMarker) {
                    map.removeLayer(aktuellerHoverMarker);
                    aktuellerHoverMarker = null;
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    min: 0,
                    max: dist,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { callback: v => (v % 10 === 0 ? `${v} km` : ''), font: { size: 10 } },
                    afterBuildTicks: s => {
                        const ticks = [];
                        for (let i = 0; i <= s.max; i += 5) ticks.push({ value: i });
                        s.ticks = ticks;
                    }
                },
                y: {
                    display: true,
                    min: yMin,
                    max: yMax,
                    ticks: { stepSize: 50, font: { size: 10 } },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        },
        plugins: [{
            id: 'verticalLine',
            afterDraw: (chart) => {
                const active = chart.getActiveElements();
                if (!active.length) return;
                const x = active[0].element.x;
                const { top, bottom } = chart.scales.y;
                chart.ctx.save();
                chart.ctx.beginPath();
                chart.ctx.moveTo(x, top);
                chart.ctx.lineTo(x, bottom);
                chart.ctx.lineWidth = 1;
                chart.ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
                chart.ctx.stroke();
                chart.ctx.restore();
            }
        }]
    });
}


/*
  =================================================================================
    DATENBANK, TABELLE & ZUSTAND
  ================================================================================= 
*/

async function ladeAktivitaeten() {
    try {
        alleAktivitaeten = await (await fetch('/api/activities')).json();
        rendereTabelle(alleAktivitaeten);
    } catch (err) { console.error('Fehler beim Laden:', err); }
}

async function update_dbFeld(id, spalte, wert) {
    const akt = alleAktivitaeten.find(a => a.id === id);
    const alt = akt?.[spalte];
    if (akt) akt[spalte] = wert;

    try {
        const res = await fetch(`/api/activities/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spalte, wert })
        });
        if (!res.ok) throw new Error();
    } catch {
        if (akt) akt[spalte] = alt;
        rendereTabelle(alleAktivitaeten);
    }
}

function rendereTabelle(liste) {
    $('daten').innerHTML = !liste.length
        ? '<tr><td colspan="8">Keine Treffer gefunden.</td></tr>'
        : liste.map(z => `
            <tr data-id="${z.id}">
                <td class="spalte-align-left spalte-datum"><span class="datum-text">${formatDatum(z.datum)}</span></td>
                <td class="spalte-align-center rad-zelle ${getRadKlasse(z.rad)}" title="${z.rad || ''}">${z.rad ? '◉' : ''}</td>
                <td class="spalte-align-left edit-zelle" data-spalte="titel" contenteditable="false" spellcheck="false">${z.titel || ''}</td>
                <td class="spalte-align-right">${formatZahl(z.distanz)}</td>
                <td class="spalte-align-right">${z.anstieg ?? ''}</td>
                <td class="spalte-align-right">${formatZeit(z.zeit)}</td>
                <td class="spalte-align-right">${formatZahl(z.avg, 1)}</td>
                <td class="spalte-align-right fav-zelle ${z.fav ? 'ist-favorit' : ''}">${z.fav ? '★' : ''}</td>
            </tr>`).join('');
}

function setHeaderButtonsAktiv(aktiv) {
    const loesch = $('button-loeschen');
    loesch?.classList.toggle('aktiv', aktiv);
    loesch?.classList.remove('bestaetigung');
    if (loesch) loesch.textContent = '✗';
    $('button-export')?.classList.toggle('aktiv', aktiv);
}

function resetAuswahl() {
    aktiveActivityId = null;
    setHeaderButtonsAktiv(false);
    [aktuellerTrackLayer, aktuellerHoverMarker].forEach(l => l && map && map.removeLayer(l));
    aktuellerTrackLayer = aktuellerHoverMarker = aktuellerRawTrack = null;
    if (meinHoehenChart) meinHoehenChart.destroy();
    meinHoehenChart = null;
}


/*
  =================================================================================
    EVENT-LISTENER & INITIALISIERUNG
  ================================================================================= 
*/

function initListener() {
    // Suche
    $('suche')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        rendereTabelle(alleAktivitaeten.filter(z => {
            const [j, m, t] = (z.datum || '').split('-');
            return `${formatDatum(z.datum)} ${z.datum || ''} ${t ? `${t}.${m}.${j} ${m}.${j}` : ''} ${z.rad || ''} ${z.titel || ''}`
                .toLowerCase().includes(q);
        }));
    });

    // Header-Buttons per Event-Delegation
    document.querySelector('.header-bereich')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        if (btn.id === 'button-export' && aktiveActivityId) {
            window.location.href = `/api/activities/${aktiveActivityId}/gpx`;
        } else if (btn.id === 'button-fitimportpy' && !btn.classList.contains('laden')) {
            btn.classList.add('laden');
            try {
                if ((await (await fetch('/api/fitimportpy', { method: 'POST' })).json()).success) {
                    resetAuswahl();
                    await ladeAktivitaeten();
                }
            } finally { btn.classList.remove('laden'); }
        } else if (btn.id === 'button-loeschen' && aktiveActivityId) {
            if (!btn.classList.contains('bestaetigung')) {
                btn.classList.add('bestaetigung');
                document.querySelector('#daten tr.aktive-zeile')?.classList.add('loesch-bestaetigung');
                return;
            }
            try {
                if ((await (await fetch(`/api/activities/${aktiveActivityId}`, { method: 'DELETE' })).json()).success) {
                    alleAktivitaeten = alleAktivitaeten.filter(a => a.id !== aktiveActivityId);
                    resetAuswahl();
                    rendereTabelle(alleAktivitaeten);
                }
            } catch { }
        }
    });

    // Tabellen-Interaktionen
    const daten = $('daten');
    daten?.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        const id = Number(tr.dataset.id);

        if (e.target.closest('.fav-zelle')) {
            const akt = alleAktivitaeten.find(a => a.id === id);
            if (!akt) return;
            const neu = akt.fav ? 0 : 1;
            e.target.classList.toggle('ist-favorit', neu === 1);
            e.target.textContent = neu ? '★' : '';
            return update_dbFeld(id, 'fav', neu);
        }
        if (e.target.closest('.rad-zelle')) {
            const titel = tr.querySelector('.edit-zelle');
            titel?.setAttribute('contenteditable', 'true');
            return titel?.focus();
        }

        document.querySelectorAll('#daten tr').forEach(r => r.classList.remove('aktive-zeile', 'loesch-bestaetigung'));
        tr.classList.add('aktive-zeile');
        aktiveActivityId = id;
        setHeaderButtonsAktiv(true);
        zeigeTrackAufKarte(id);
        zeigeHoehenprofil(id);
    });

    daten?.addEventListener('auxclick', (e) => {
        const zelle = e.button === 1 ? e.target.closest('.rad-zelle') : null;
        if (!zelle) return;
        e.preventDefault();
        const id = Number(zelle.closest('tr').dataset.id);
        const akt = alleAktivitaeten.find(a => a.id === id);
        if (!akt) return;

        const neu = RAEDER[(RAEDER.findIndex(r => r.toLowerCase() === (akt.rad || '').toLowerCase()) + 1) % RAEDER.length];
        zelle.className = `spalte-align-center rad-zelle ${getRadKlasse(neu)}`;
        zelle.title = neu;
        zelle.textContent = neu ? '◉' : '';
        update_dbFeld(id, 'rad', neu);
    });

    daten?.addEventListener('focusin', (e) => {
        if (!e.target.classList.contains('edit-zelle')) return;
        alterZellenWert = e.target.textContent;
        setTimeout(() => {
            const r = document.createRange(), s = window.getSelection();
            r.selectNodeContents(e.target); r.collapse(false);
            s.removeAllRanges(); s.addRange(r);
        }, 0);
    });

    daten?.addEventListener('focusout', (e) => {
        const zelle = e.target.closest('.edit-zelle');
        if (!zelle) return;
        const wert = zelle.textContent.trim();
        zelle.setAttribute('contenteditable', 'false');
        zelle.textContent = wert;
        update_dbFeld(Number(zelle.closest('tr').dataset.id), zelle.dataset.spalte, wert);
    });

    // Zentrale Tastatursteuerung (Esc / Enter)
    document.addEventListener('keydown', (e) => {
        const el = e.target, istSuche = el.id === 'suche', istEdit = el.classList?.contains('edit-zelle');
        if (e.key === 'Escape') {
            if ($('osmkarte')?.classList.contains('karte-maximiert')) return e.preventDefault(), toggleKarteMaximieren(true);
            const loesch = $('button-loeschen');
            if (loesch?.classList.contains('bestaetigung')) {
                e.preventDefault();
                loesch.classList.remove('bestaetigung');
                return document.querySelector('#daten tr.loesch-bestaetigung')?.classList.remove('loesch-bestaetigung');
            }
            if (!istSuche && !istEdit) return;
            istSuche ? (el.value = '', rendereTabelle(alleAktivitaeten)) : (el.textContent = alterZellenWert);
            el.blur();
        } else if (e.key === 'Enter' && (istSuche || istEdit)) {
            e.preventDefault();
            el.blur();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initKarte();
    ladeAktivitaeten();
    initListener();
});