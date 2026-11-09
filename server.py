from flask import Flask, render_template, jsonify, request, Response
from pathlib import Path
from fitparse import FitFile
import sqlite3, os, subprocess
import xml.etree.ElementTree as ET
# systemctl --user restart service-grxcm-db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATENBANK = "/home/tm/Laufwerk-T/GarminEdge130Plus-fit/fitdb.db"
FIT_VERZEICHNIS = "/home/tm/Laufwerk-T/GarminEdge130Plus-fit"
app = Flask(__name__, template_folder="templates", static_folder="static")

def get_versiontxt():
    try:
        pfad = os.path.join(BASE_DIR, "version.txt")
        if os.path.exists(pfad):
            return Path(pfad).read_text(encoding="utf-8").strip()
    except Exception:
        pass
    return "dev"

@app.context_processor
def inject_version():
    return dict(versiontxt=get_versiontxt())


@app.route("/")
def index(): 
    return render_template("index.html")

@app.route("/api/activities")
def activities():
    with sqlite3.connect(DATENBANK) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""SELECT * FROM activities ORDER BY datum DESC, startzeit DESC""")
        daten = [dict(row) for row in cursor.fetchall()]
    return jsonify(daten)

@app.route("/api/activities/<int:activity_id>", methods=["PATCH"])
def update_activity(activity_id):
    daten_body = request.get_json() or {}
    spalte = daten_body.get("spalte")
    wert = daten_body.get("wert")

    with sqlite3.connect(DATENBANK) as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE activities SET {spalte} = ? WHERE id = ?", (wert, activity_id))
        conn.commit()

    return jsonify({"success": True, "id": activity_id, "spalte": spalte, "wert": wert})

@app.route("/api/activities/<int:activity_id>", methods=["DELETE"])
def delete_activity(activity_id):
    with sqlite3.connect(DATENBANK) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM activities WHERE id = ?", (activity_id,))
        conn.commit()
    return jsonify({"success": True, "id": activity_id})

@app.route("/api/fitimportpy", methods=["POST"])
def run_fitimportpy():
    try:
        script_path = os.path.join(BASE_DIR, "fitimport.py")
        result = subprocess.run(
            ["python3", script_path], 
            capture_output=True, 
            text=True, 
            check=True
        )
        return jsonify({
            "success": True, 
            "message": "Import erfolgreich ausgeführt.",
            "output": result.stdout
        })
    except subprocess.CalledProcessError as e:
        return jsonify({
            "success": False, 
            "message": "Fehler beim Importieren.",
            "error": e.stderr
        }), 500

@app.route("/api/activities/<int:activity_id>/gpx", methods=["GET"])
def gpxexport(activity_id):
    with sqlite3.connect(DATENBANK) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT datei FROM activities WHERE id = ?", (activity_id,))
        row = cursor.fetchone()
        
    if not row or not row["datei"]:
        return "Aktivität oder Datei nicht gefunden", 404
        
    fit_pfad = None
    matching_files = list(Path(FIT_VERZEICHNIS).rglob(row["datei"]))
    if matching_files:
        fit_pfad = matching_files[0]

    if not fit_pfad or not fit_pfad.exists():
        return "FIT-Datei auf dem System nicht gefunden", 404

    try:
        fit = FitFile(str(fit_pfad))
        SEMICIRCLE_FACTOR = 180.0 / (2**31)

        # GPX XML-Struktur aufbauen
        gpx = ET.Element("gpx", {
            "version": "1.1",
            "creator": "grxcm-db",
            "xmlns": "http://www.topografix.com/GPX/1/1"
        })
        trk = ET.SubElement(gpx, "trk")
        trkseg = ET.SubElement(trk, "trkseg")

        for record in fit.get_messages("record"):
            lat = record.get_value("position_lat")
            lon = record.get_value("position_long")
            
            if lat is not None and lon is not None:
                lat_deg = f"{lat * SEMICIRCLE_FACTOR:.6f}"
                lon_deg = f"{lon * SEMICIRCLE_FACTOR:.6f}"
                
                trkpt = ET.SubElement(trkseg, "trkpt", {"lat": lat_deg, "lon": lon_deg})
                
                # Höhe (falls vorhanden)
                ele = record.get_value("enhanced_altitude") or record.get_value("altitude")
                if ele is not None:
                    ele_el = ET.SubElement(trkpt, "ele")
                    ele_el.text = str(round(float(ele), 1))
                    
                # Zeitstempel (falls vorhanden)
                time_val = record.get_value("timestamp")
                if time_val is not None:
                    time_el = ET.SubElement(trkpt, "time")
                    time_el.text = time_val.strftime("%Y-%m-%dT%H:%M:%SZ")

        gpx_data = ET.tostring(gpx, encoding="utf-8", xml_declaration=True)
        gpx_name = fit_pfad.stem + ".gpx"

        return Response(
            gpx_data,
            mimetype="application/gpx+xml",
            headers={"Content-Disposition": f"attachment; filename={gpx_name}"}
        )
    except Exception as e:
        return f"Fehler bei der Konvertierung: {str(e)}", 500


if __name__ == "__main__":
    app.run(host="localhost", port=5000, debug=False)