// Globale Variablen für geladene Aktivitäten, Leaflet-Karte und Track-Layer
let alleAktivitaeten = [];
let map = null;
let aktuellerTrackLayer = null;


/*
  =================================================================================
    FUNKTIONEN
  ================================================================================= 
*/

// Funktion: Initialisierung Leaflet-Karte
function initKarte() {
    const mapElement = document.getElementById('osmkarte');
    if (!mapElement) return;

    map = L.map('osmkarte', {
        zoomControl: false,
        attributionControl: false
    }).setView([48.5328, 9.3170], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
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

    if (!aktivitaet.track) {
        console.warn('Kein Track für diese Aktivität vorhanden.');
        return;
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

// Hilfsfunktion: Ermittlung CSS-Klasse für jeweiliges Rad
function getRadKlasse(radName) {
    if (!radName) return '';
    const name = radName.toLowerCase().trim();
    
    if (name.includes('exceed')) return 'rad-exceed';
    if (name.includes('terra'))  return 'rad-terra';
    if (name.includes('c62o'))   return 'rad-c62o';
    if (name.includes('slx99'))  return 'rad-slx99';
    
    return '';
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
            <td class="spalte-align-left edit-zelle" data-id="${zeile.id}" data-spalte="titel" contenteditable="false" spellcheck="false"><span class="edit-text">${zeile.titel || ''}</span><span class="icon-edit">»</span></td>
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

// Funktion: Abbruch via Esc in Datenfeld oder Suchfeld
function abbrechen(element, zielWert) {
    if (element.id === 'suche') {
        element.value = zielWert;
        rendereTabelle(alleAktivitaeten);
    } else {
        const textSpan = element.querySelector('.edit-text');
        (textSpan || element).textContent = zielWert;
    }
    element.blur();
}


/*
  =================================================================================
    INITIALISIERUNG & ABFRAGEN
  ================================================================================= 
*/

document.addEventListener('DOMContentLoaded', () => {
    
    initKarte();

    // Abruf der Daten von API
    fetch('/api/activities')
        .then(antwort => antwort.json())
        .then(liste => {
            alleAktivitaeten = liste;
            rendereTabelle(alleAktivitaeten);
        })
        .catch(err => console.error('Fehler beim Laden der Aktivitäten:', err));

    // Event-Listener für Suchfeld
    document.getElementById('suche').addEventListener('input', function(e) {
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

    // Zentrale Tastatur-Event-Steuerung
    document.addEventListener('keydown', (e) => {
        const el = e.target;
        const istSuche = el.id === 'suche';
        const istEdit = el.classList?.contains('edit-zelle');

        if (!istSuche && !istEdit) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            el.blur();
        } else if (e.key === 'Escape') {
            abbrechen(el, istSuche ? '' : alterZellenWert);
        }
    });

    // Event-Listener für Klicks (edit_fav, Icon-Klick bei edit-Zellen & Zeilenauswahl)
    document.getElementById('daten').addEventListener('click', function(e) {
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

        if (e.target.classList.contains('icon-edit')) {
            const editZelle = e.target.closest('.edit-zelle');
            if (!editZelle) return;

            editZelle.setAttribute('contenteditable', 'true');
            editZelle.focus();
            return;
        }

        const tr = e.target.closest('tr');
        if (tr) {
            document.querySelectorAll('#daten tr').forEach(row => row.classList.remove('aktive-zeile'));
            tr.classList.add('aktive-zeile');

            const idZelle = tr.querySelector('.edit-zelle') || tr.querySelector('.fav-zelle') || tr.querySelector('.rad-zelle');
            if (idZelle && idZelle.dataset.id) {
                const activityId = Number(idZelle.dataset.id);
                zeigeTrackAufKarte(activityId);
            }
        }
    });

});


/*
  =================================================================================
    STEUERUNG BEIM EDITIEREN VON FELDERN (edit_rad, edit_titel)
  ================================================================================= 
*/

let alterZellenWert = '';

// Speicherung Ursprungswert vor Editieren + Cursor an Ende setzen
document.getElementById('daten').addEventListener('focusin', function(e) {
    if (!e.target.classList.contains('edit-zelle')) return;

    const textSpan = e.target.querySelector('.edit-text');
    alterZellenWert = textSpan ? textSpan.textContent : e.target.textContent;

    setTimeout(() => {
        const zielKnoten = textSpan || e.target;
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(zielKnoten);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }, 0);
});

// Speichern beim Verlassen eines Feldes
document.getElementById('daten').addEventListener('focusout', function(e) {
    const editZelle = e.target.closest('.edit-zelle');
    if (!editZelle) return;

    const activityId = Number(editZelle.dataset.id);
    const spalte = editZelle.dataset.spalte;
    
    const textSpan = editZelle.querySelector('.edit-text');
    const neuerWert = (textSpan ? textSpan.textContent : editZelle.textContent).trim();
    
    editZelle.setAttribute('contenteditable', 'false');
    editZelle.innerHTML = `<span class="edit-text">${neuerWert}</span><span class="icon-edit">»</span>`;

    if (spalte === 'rad') {
        editZelle.className = `spalte-align-left edit-zelle ${getRadKlasse(neuerWert)}`;
    }

    update_dbFeld(activityId, spalte, neuerWert);
});