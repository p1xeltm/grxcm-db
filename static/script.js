// Globale Variablen für geladene Aktivitäten, Leaflet-Karte und Track-Layer
let alleAktivitaeten = [];
let map = null;
let aktuellerTrackLayer = null;
let aktiveActivityId = null;
let alterZellenWert = '';
let meinHoehenChart = null;
let aktuellerHoverMarker = null;
let aktuellerRawTrack = null;


/*
  =================================================================================
    F U N K T I O N E N
  ================================================================================= 
*/

// Funktion: Initialisierung Leaflet-Karte, inkl. Hillshading-Overlay
function initKarte() {
    const mapElement = document.getElementById('osmkarte');
    if (!mapElement) return;

    map = L.map('osmkarte', {
        zoomControl: false,
        attributionControl: false
    }).setView([48.5328, 9.3170], 13);

    // Basis-Karte (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(map);

    // Hillshading-Overlay
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        opacity: 0.9,
        className: 'hillshade-layer',
        attribution: 'Esri, USGS, NOAA'
    }).addTo(map);
}

// Funktion: Zeichnen des Tracks auf OSM-Karte
function zeigeTrackAufKarte(activityId) {
    const aktivitaet = alleAktivitaeten.find(a => a.id === activityId);
    if (!aktivitaet || !map) return;

    if (aktuellerTrackLayer) {
        map.removeLayer(aktuellerTrackLayer);
        aktuellerTrackLayer = null;
    }

    try {
        const rawTrack = typeof aktivitaet.track === 'string' 
            ? JSON.parse(aktivitaet.track) 
            : aktivitaet.track;

        if (!Array.isArray(rawTrack) || rawTrack.length === 0) return;

        // CSS-Variable --col-track direkt aus der style.css auslesen
        const computedStyle = getComputedStyle(document.documentElement);
        const trackFarbe = computedStyle.getPropertyValue('--col-track').trim();

        aktuellerTrackLayer = L.polyline(rawTrack, {
            color: trackFarbe,
            weight: 3,
            opacity: 0.85,
            smoothFactor: 1
        }).addTo(map);

        map.fitBounds(aktuellerTrackLayer.getBounds(), { padding: [20, 20] });

    } catch (e) { }
}

// Funktion: Zeichnen des Höhenprofils inklusive Hover-Verbindung zur Karte
function zeigeHoehenprofil(activityId) {
    const aktivitaet = alleAktivitaeten.find(a => a.id === activityId);
    const canvasElement = document.getElementById('hoehenprofilChart');
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');

    if (!aktivitaet || !aktivitaet.track) {
        if (meinHoehenChart) {
            meinHoehenChart.destroy();
            meinHoehenChart = null;
        }
        aktuellerRawTrack = null;
        return;
    }

    try {
        const rawTrack = typeof aktivitaet.track === 'string' 
            ? JSON.parse(aktivitaet.track) 
            : aktivitaet.track;

        if (!Array.isArray(rawTrack) || rawTrack.length === 0) return;
        
        aktuellerRawTrack = rawTrack;

        const gesamtDistanz = Number(aktivitaet.distanz) || 0;
        const anzahlPunkte = rawTrack.length;

        const datenPunkte = rawTrack.map((punkt, index) => {
            const aktuelleDistanz = anzahlPunkte > 1 ? (index / (anzahlPunkte - 1)) * gesamtDistanz : 0;
            return {
                x: Number(aktuelleDistanz.toFixed(2)),
                y: punkt.length > 2 ? punkt[2] : 0
            };
        });

        const maxHoehe = datenPunkte.reduce((max, p) => Math.max(max, p.y), 0);
        const minHoehe = datenPunkte.reduce((min, p) => Math.min(min, p.y), maxHoehe);

        const zielMax = maxHoehe + 50;
        const gepuffertMin = minHoehe > 0 ? minHoehe * 0.9 : 0;

        const yMax = Math.ceil(zielMax / 50) * 50;
        const yMin = Math.floor(gepuffertMin / 50) * 50;

        const computedStyle = getComputedStyle(document.documentElement);
        const akzentFarbe = computedStyle.getPropertyValue('--col-akzent1').trim();
        const trackFarbe = computedStyle.getPropertyValue('--col-track').trim();

        if (meinHoehenChart) {
            meinHoehenChart.destroy();
        }

        meinHoehenChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    data: datenPunkte,
                    borderColor: akzentFarbe,
                    backgroundColor: `color-mix(in srgb, ${akzentFarbe} 20%, transparent)`,
                    borderWidth: 2,
                    fill: true,
                    pointRadius: 0,
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {mode: 'nearest', intersect: false, axis: 'x'},
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                
                onHover: (event, activeElements) => {
                    if (!map || !aktuellerRawTrack) return;

                    if (activeElements.length > 0) {
                        const index = activeElements[0].index;
                        const punkt = aktuellerRawTrack[index];
                        if (punkt) {
                            const latLng = [punkt[0], punkt[1]];

                            if (!aktuellerHoverMarker) {
                                aktuellerHoverMarker = L.circleMarker(latLng, {
                                    radius: 6,
                                    color: 'white',
                                    fillColor: trackFarbe,
                                    fillOpacity: 1,
                                    weight: 2
                                }).addTo(map);
                            } else {
                                aktuellerHoverMarker.setLatLng(latLng);
                            }
                        }
                    } else {
                        if (aktuellerHoverMarker) {
                            map.removeLayer(aktuellerHoverMarker);
                            aktuellerHoverMarker = null;
                        }
                    }
                },

                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        min: 0,
                        max: gesamtDistanz,
                        ticks: {
                            callback: function(value) {
                                if (value % 10 === 0) return value + ' km';
                                return '';
                            },
                            font: { size: 10 }
                        },
                        afterBuildTicks: function(scale) {
                            const maxVal = scale.max;
                            const ticks = [];
                            for (let i = 0; i <= maxVal; i += 5) {
                                ticks.push({ value: i });
                            }
                            scale.ticks = ticks;
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y: { 
                        display: true,
                        min: yMin, 
                        max: yMax, 
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { stepSize: 50, font: { size: 10 } }
                    }
                }
            },
            // --- HIER WURDE DAS PLUGIN EINGEFÜGT ---
            plugins: [{
                id: 'verticalLine',
                afterDraw: (chart) => {
                    const activeElements = chart.getActiveElements();
                    if (activeElements.length > 0) {
                        const ctx = chart.ctx;
                        const x = activeElements[0].element.x;
                        const topY = chart.scales.y.top;
                        const bottomY = chart.scales.y.bottom;

                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(x, topY);
                        ctx.lineTo(x, bottomY);
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'; // Korrigierte Klammer
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            }]
        });

    } catch (e) { }
}

// Funktion: Umwandlung Datum YYYY-MM-DD >> MON dd
function formatDatum(str) {
    if (!str) return '';
    const teile = str.split('-');
    if (teile.length !== 3) return str;

    const monate = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun','Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    const monatIndex = parseInt(teile[1], 10) - 1;
    const monatStr = monate[monatIndex] || teile[1];
    const tagStr = teile[2];

    return `${monatStr} ${tagStr}`;
}

// Funktion: Umwandlung Punkt<>Komma + 2 Nachkommastellen
function formatZahl(wert, stellen = 2) {
    if (wert === null || wert === undefined || wert === '') return '';
    return Number(wert).toFixed(stellen).replace('.', ',');
}

// Funktion: Umwandlung Sekunden in h:mm:ss
function formatZeit(sekunden) {
    if (!sekunden) return '';
    const h = Math.floor(sekunden / 3600);
    const m = Math.floor((sekunden % 3600) / 60);
    const s = sekunden % 60;
    const mStr = String(m).padStart(2, '0');
    const sStr = String(s).padStart(2, '0');
    return `${h}:${mStr}:${sStr}`;
}

// Funktion: Ermittlung CSS-Klasse für jeweiliges Rad
function getRadKlasse(radName) {
    if (!radName) return '';
    const name = radName.toLowerCase().trim().replace('#', '');
    return name ? `rad-${name}` : '';
}

// Funktion: Aktualisieren von Datenbank-Feldern
async function update_dbFeld(activityId, spalte, wert) {
    const aktivitaet = alleAktivitaeten.find(a => a.id === activityId);
    const alterWert = aktivitaet ? aktivitaet[spalte] : null;

    if (aktivitaet) aktivitaet[spalte] = wert;

    try {
        const antwort = await fetch(`/api/activities/${activityId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spalte: spalte, wert: wert })
        });

        if (!antwort.ok) throw new Error('Netzwerk-Fehler');
    } catch (err) {
        console.error(`Fehler beim Speichern von ${spalte}:`, err);
        // Bei Fehler Wert zurückrollen
        if (aktivitaet) aktivitaet[spalte] = alterWert;
        rendereTabelle(alleAktivitaeten);
    }
}

// Funktion: Renderung von Tabellenzeilen
function rendereTabelle(liste) {
    const ziel = document.getElementById('daten');
    ziel.innerHTML = '';

    if (liste.length === 0) {
        ziel.innerHTML = '<tr><td colspan="8">Keine Treffer gefunden.</td></tr>';
        return;
    }

    liste.forEach(zeile => {
        const tr = document.createElement('tr');
        const istFav = Boolean(zeile.fav);
        const radKlasse = getRadKlasse(zeile.rad);
        const radSymbol = zeile.rad ? '◉' : '';
        
        tr.innerHTML = `
            <td class="spalte-align-left spalte-datum">
                <span class="datum-text">${formatDatum(zeile.datum)}</span>
            </td>
            <td class="spalte-align-center rad-zelle ${radKlasse}" data-id="${zeile.id}" title="${zeile.rad || ''}">${radSymbol}</td>
            <td class="spalte-align-left edit-zelle" data-id="${zeile.id}" data-spalte="titel" contenteditable="false" spellcheck="false">${zeile.titel || ''}</td>
            <td class="spalte-align-right">${formatZahl(zeile.distanz)}</td>
            <td class="spalte-align-right">${zeile.anstieg ?? ''}</td>
            <td class="spalte-align-right">${formatZeit(zeile.zeit)}</td>
            <td class="spalte-align-right">${formatZahl(zeile.avg, 1)}</td>
            <td class="spalte-align-right fav-zelle ${istFav ? 'ist-favorit' : ''}" data-id="${zeile.id}">
                ${istFav ? '★' : ''}
            </td>
        `;
        ziel.appendChild(tr);
    });
}

// Reset der aktiven Auswahl, Lösch-Button, export-Button und Track-Layer
function resetAuswahl() {
    aktiveActivityId = null;
    const loeschBtn = document.getElementById('button-loeschen');
    const exportBtn = document.getElementById('button-export');
    
    if (loeschBtn) {
        loeschBtn.classList.remove('aktiv', 'bestaetigung');
        loeschBtn.textContent = '✗';
    }
    if (exportBtn) {
        exportBtn.classList.remove('aktiv');
    }
    if (aktuellerTrackLayer && map) {
        map.removeLayer(aktuellerTrackLayer);
        aktuellerTrackLayer = null;
    }
    if (aktuellerHoverMarker && map) {
        map.removeLayer(aktuellerHoverMarker);
        aktuellerHoverMarker = null;
    }
    aktuellerRawTrack = null;
    if (meinHoehenChart) {
        meinHoehenChart.destroy();
        meinHoehenChart = null;
    }
}

// Funktion: Abbruch via Esc in Datenfeld oder Suchfeld
function AbbruchEsc(element, zielWert) {
    if (element.id === 'suche') {
        element.value = zielWert;
        rendereTabelle(alleAktivitaeten);
    } else {
        element.textContent = zielWert;
    }
    element.blur();
}

// Funktion: Datenabruf von API
function ladeAktivitaeten() {
    fetch('/api/activities')
        .then(antwort => antwort.json())
        .then(liste => {
            alleAktivitaeten = liste;
            rendereTabelle(alleAktivitaeten);
        })
        .catch(err => console.error('Fehler beim Laden der Aktivitäten:', err));
}


/*
  =================================================================================
    EVENT-LISTENER INIT-FUNKTIONEN
  ================================================================================= 
*/

// **** Listener: Suchfeld
function initListenerSuchfeld() {
    const sucheInput = document.getElementById('suche');
    if (!sucheInput) return;

    sucheInput.addEventListener('input', function(e) {
        const begriff = e.target.value.toLowerCase().trim();
        
        const gefiltert = alleAktivitaeten.find ? alleAktivitaeten.filter(zeile => {
            const anzeigeDatum = formatDatum(zeile.datum).toLowerCase();
            const rohDatum = zeile.datum || '';
            
            let deDatum = '';
            let monatJahr = '';
            if (rohDatum.includes('-')) {
                const [jahr, monat, tag] = rohDatum.split('-');
                deDatum = `${tag}.${monat}.${jahr}`;
                monatJahr = `${monat}.${jahr}`;
            }

            const rad = (zeile.rad || '').toLowerCase();
            const titel = (zeile.titel || '').toLowerCase();

            return anzeigeDatum.includes(begriff) || 
                   rohDatum.includes(begriff) || 
                   deDatum.includes(begriff) || 
                   monatJahr.includes(begriff) || 
                   rad.includes(begriff) || 
                   titel.includes(begriff);
        }) : [];

        rendereTabelle(gefiltert);
    });
}

// **** Listener: Button 'gpx-export'
function initListenerExport() {
    const exportBtn = document.getElementById('button-export');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
        if (!aktiveActivityId) return;
        window.location.href = `/api/activities/${aktiveActivityId}/gpx`;
    });
}

// **** Listener: Button 'fitimport.py'
function initListenerImport() {
    const importBtn = document.getElementById('button-fitimportpy');
    if (!importBtn) return;

    importBtn.addEventListener('click', async () => {
        if (importBtn.classList.contains('laden')) return;
        importBtn.classList.add('laden');

        try {
            const antwort = await fetch('/api/fitimportpy', { method: 'POST' });
            const ergebnis = await antwort.json();

            if (ergebnis.success) {
                resetAuswahl(); // <--- Hier Auswahl & Button zurücksetzen!
                
                const res = await fetch('/api/activities');
                alleAktivitaeten = await res.json();
                rendereTabelle(alleAktivitaeten);
            }
        } finally {
            importBtn.classList.remove('laden');
        }
    });
}

// **** Listener: Button 'Tour löschen'
function initListenerLoeschen() {
    const loeschBtn = document.getElementById('button-loeschen');
    if (!loeschBtn) return;

    loeschBtn.addEventListener('click', async () => {
        if (!aktiveActivityId) return;

        const aktiveZeile = document.querySelector('#daten tr.aktive-zeile');

        // Klick 1: Wechsel in Bestätigungsmodus
        if (!loeschBtn.classList.contains('bestaetigung')) {
            loeschBtn.classList.add('bestaetigung');
            if (aktiveZeile) {
                aktiveZeile.classList.add('loesch-bestaetigung');
            }
            return;
        }

        // Klick 2: tatsächliches Löschen
        try {
            const antwort = await fetch(`/api/activities/${aktiveActivityId}`, { method: 'DELETE' });
            const ergebnis = await antwort.json();

            if (ergebnis.success) {
                alleAktivitaeten = alleAktivitaeten.filter(a => a.id !== aktiveActivityId);
                resetAuswahl();
                rendereTabelle(alleAktivitaeten);
            }
        } catch (err) {}
    });
}

// **** Listener: Zentrale Tastatur-Steuerung (Enter / Esc)
function initListenerTastatur() {
    document.addEventListener('keydown', (e) => {
        const el = e.target;
        const istSuche = el.id === 'suche';
        const istEdit = el.classList?.contains('edit-zelle');

        if (e.key === 'Escape') {
            // Prüfung, ob Lösch-Bestätigungsmodus aktiv ist
            const loeschBtn = document.getElementById('button-loeschen');
            if (loeschBtn && loeschBtn.classList.contains('bestaetigung')) {
                e.preventDefault();
                loeschBtn.classList.remove('bestaetigung');
                
                const loeschZeile = document.querySelector('#daten tr.loesch-bestaetigung');
                if (loeschZeile) {
                    loeschZeile.classList.remove('loesch-bestaetigung');
                }
                return;
            }
            // Esc für Suchfeld und Editiermodus
            if (!istSuche && !istEdit) return;
            AbbruchEsc(el, istSuche ? '' : alterZellenWert);

        } else if (e.key === 'Enter') {
            if (!istSuche && !istEdit) return;
            e.preventDefault();
            el.blur();
        }
    });
}

// **** Listener: Mittelklick auf Rad-Klasse
function initListenerRadMittelklick() {
    const daten = document.getElementById('daten');
    if (!daten) return;

    daten.addEventListener('auxclick', function(e) {
        if (e.button === 1) {
            const radZelle = e.target.closest('.rad-zelle');
            if (radZelle) {
                e.preventDefault();
                
                const activityId = Number(radZelle.dataset.id);
                const aktivitaet = alleAktivitaeten.find(a => a.id === activityId);
                if (!aktivitaet) return;

                // Liste der verfügbaren Rad-Klassen
                const raeder = ['', '#exceed', '#terra', '#c62o', '#slx99'];
                const aktuellesRad = aktivitaet.rad || '';
                
                let currentIndex = raeder.findIndex(r => r.toLowerCase() === aktuellesRad.toLowerCase());
                if (currentIndex === -1) currentIndex = 0;
                
                const naechsterIndex = (currentIndex + 1) % raeder.length;
                const naechstesRad = raeder[naechsterIndex];

                aktivitaet.rad = naechstesRad;
                const radKlasse = getRadKlasse(naechstesRad);
                radZelle.className = `spalte-align-center rad-zelle ${radKlasse}`;
                radZelle.setAttribute('title', naechstesRad);
                radZelle.textContent = naechstesRad ? '◉' : '';

                update_dbFeld(activityId, 'rad', naechstesRad);
            }
        }
    });
}

// **** Listener: Klicks in der Tabelle (Favorit, Titel editieren, Zeile auswählen)
function initListenerTabellenKlick() {
    const daten = document.getElementById('daten');
    if (!daten) return;

    daten.addEventListener('click', function(e) {
        const favZelle = e.target.closest('.fav-zelle');
        if (favZelle) {
            const activityId = Number(favZelle.dataset.id);
            const aktivitaet = alleAktivitaeten.find(a => a.id === activityId);
            if (!aktivitaet) return;

            const neuerStatus = aktivitaet.fav ? 0 : 1;
            favZelle.classList.toggle('ist-favorit', neuerStatus === 1);
            favZelle.textContent = neuerStatus === 1 ? '★' : '';

            update_dbFeld(activityId, 'fav', neuerStatus);
            return;
        }

        const radZelle = e.target.closest('.rad-zelle');
        if (radZelle) {
            const tr = radZelle.closest('tr');
            const titelZelle = tr.querySelector('.edit-zelle');
            if (titelZelle) {
                titelZelle.setAttribute('contenteditable', 'true');
                titelZelle.focus();
            }
            return;
        }

        const tr = e.target.closest('tr');
        if (tr) {
            document.querySelectorAll('#daten tr').forEach(row => {
                row.classList.remove('aktive-zeile');
                row.classList.remove('loesch-bestaetigung');
            });
            tr.classList.add('aktive-zeile');

            const idZelle = tr.querySelector('.edit-zelle') || tr.querySelector('.fav-zelle') || tr.querySelector('.rad-zelle');
            if (idZelle && idZelle.dataset.id) {
                aktiveActivityId = Number(idZelle.dataset.id);
                
                // Aktivierung Lösch-Button und Reset Bestätitung zurücksetzen
                const loeschBtn = document.getElementById('button-loeschen');
                if (loeschBtn) {
                    loeschBtn.classList.add('aktiv');
                    loeschBtn.classList.remove('bestaetigung');
                    loeschBtn.textContent = '✗';
                }
                // Aktivierung Export-Button
                const exportBtn = document.getElementById('button-export');
                if (exportBtn) {
                    exportBtn.classList.add('aktiv');
                }

                zeigeTrackAufKarte(aktiveActivityId);
                zeigeHoehenprofil(aktiveActivityId);
            }
        }
    });
}

// **** Listener: In-Place Editing (focusin & focusout)
function initListenerEditieren() {
    const daten = document.getElementById('daten');
    if (!daten) return;

    // Speicherung Ursprungswert vor Editieren + Cursor an Ende setzen
    daten.addEventListener('focusin', function(e) {
        if (!e.target.classList.contains('edit-zelle')) return;

        alterZellenWert = e.target.textContent;

        setTimeout(() => {
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(e.target);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }, 0);
    });

    // Speichern beim Verlassen eines Feldes
    daten.addEventListener('focusout', function(e) {
        const editZelle = e.target.closest('.edit-zelle');
        if (!editZelle) return;

        const activityId = Number(editZelle.dataset.id);
        const spalte = editZelle.dataset.spalte;
        
        const neuerWert = editZelle.textContent.trim();
        
        editZelle.setAttribute('contenteditable', 'false');

        if (spalte === 'rad') {
            editZelle.className = `spalte-align-left edit-zelle ${getRadKlasse(neuerWert)}`;
        } else {
            editZelle.textContent = neuerWert;
        }

        update_dbFeld(activityId, spalte, neuerWert);
    });
}


/*
  =================================================================================
    HAUPT-INITIALISIERUNG
  ================================================================================= 
*/

document.addEventListener('DOMContentLoaded', () => {
    initKarte();
    ladeAktivitaeten();

    // Event-Listener über das Namensschema 'initListener...' initialisieren
    initListenerSuchfeld();
    initListenerExport();
    initListenerImport();
    initListenerLoeschen();
    initListenerTastatur();
    initListenerRadMittelklick();
    initListenerTabellenKlick();
    initListenerEditieren();
});