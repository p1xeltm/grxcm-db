// Globale Variablen für geladene Aktivitäten, Leaflet-Karte und Track-Layer
let alleAktivitaeten = [];
let map = null;
let aktuellerTrackLayer = null;
let aktiveActivityId = null;
let alterZellenWert = '';


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

        aktuellerTrackLayer = L.polyline(rawTrack, {
            color: 'hsl(331, 100%, 50%)',
            weight: 3,
            opacity: 0.85,
            smoothFactor: 1
        }).addTo(map);

        map.fitBounds(aktuellerTrackLayer.getBounds(), { padding: [20, 20] });

    } catch (e) {
        console.error('Fehler beim Parsen/Zeichnen des Tracks:', e);
    }
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

// Reset der aktiven Auswahl, Lösch-Button und Track-Layer
function resetAuswahl() {
    aktiveActivityId = null;
    const loeschBtn = document.getElementById('button-loeschen');
    if (loeschBtn) {
        loeschBtn.classList.remove('aktiv', 'bestaetigung');
        loeschBtn.textContent = '✗';
    }
    if (aktuellerTrackLayer && map) {
        map.removeLayer(aktuellerTrackLayer);
        aktuellerTrackLayer = null;
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

        if (!istSuche && !istEdit) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            el.blur();
        } else if (e.key === 'Escape') {
            AbbruchEsc(el, istSuche ? '' : alterZellenWert);
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
                
                // Lösch-Button aktivieren und Bestätigung zurücksetzen
                const loeschBtn = document.getElementById('button-loeschen');
                if (loeschBtn) {
                    loeschBtn.classList.add('aktiv');
                    loeschBtn.classList.remove('bestaetigung');
                    loeschBtn.textContent = '✗';
                }

                zeigeTrackAufKarte(aktiveActivityId);
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
    initListenerImport();
    initListenerLoeschen();
    initListenerTastatur();
    initListenerRadMittelklick();
    initListenerTabellenKlick();
    initListenerEditieren();
});