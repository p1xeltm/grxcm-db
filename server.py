from flask import Flask, render_template, jsonify, request
import sqlite3, os
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATENBANK = "/home/tm/Laufwerk-T/GarminEdge130Plus-fit/fitdb.db"
app = Flask(__name__, template_folder="templates", static_folder="static")

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

if __name__ == "__main__":
    app.run(host="localhost", port=5000, debug=True)