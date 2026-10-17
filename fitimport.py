import sqlite3
import json
import math
from datetime import timezone
from zoneinfo import ZoneInfo
from pathlib import Path
from fitparse import FitFile

FIT_VERZEICHNIS = "/home/tm/Laufwerk-T/GarminEdge130Plus-fit"
DATENBANK = "/home/tm/Laufwerk-T/GarminEdge130Plus-fit/fitdb.db"
EPSILON = 0.00005


def perpendicular_distance(point, line_start, line_end):
    lat, lon = point[0], point[1]
    start_lat, start_lon = line_start[0], line_start[1]
    end_lat, end_lon = line_end[0], line_end[1]

    dx = end_lon - start_lon
    dy = end_lat - start_lat

    if dx == 0 and dy == 0:
        return math.hypot(lat - start_lat, lon - start_lon)

    t = ((lat - start_lat) * dy + (lon - start_lon) * dx) / (dy * dy + dx * dx)
    t = max(0, min(1, t))

    proj_lat = start_lat + t * dy
    proj_lon = start_lon + t * dx

    return math.hypot(lat - proj_lat, lon - proj_lon)


def douglas_peucker(points, epsilon):
    if len(points) < 3:
        return points

    dmax = 0.0
    index = 0
    end = len(points) - 1

    for i in range(1, end):
        d = perpendicular_distance(points[i], points[0], points[end])
        if d > dmax:
            index = i
            dmax = d

    if dmax > epsilon:
        rec_results1 = douglas_peucker(points[:index + 1], epsilon)
        rec_results2 = douglas_peucker(points[index:], epsilon)
        return rec_results1[:-1] + rec_results2
    else:
        return [points[0], points[end]]


def extract_gps_track(fit):
    SEMICIRCLE_FACTOR = 180.0 / (2**31)
    raw_points = []

    for record in fit.get_messages("record"):
        lat = record.get_value("position_lat")
        lon = record.get_value("position_long")

        if lat is not None and lon is not None:
            lat_deg = round(lat * SEMICIRCLE_FACTOR, 6)
            lon_deg = round(lon * SEMICIRCLE_FACTOR, 6)
            raw_points.append([lat_deg, lon_deg])

    if raw_points:
        simplified = douglas_peucker(raw_points, EPSILON)
        return json.dumps(simplified)
    
    return None


conn = sqlite3.connect(DATENBANK)
cursor = conn.cursor()

# Laden bereits importierter .fit-Dateien aus fitdb.db
cursor.execute("SELECT datei FROM activities")
bereits_importiert = {row[0] for row in cursor.fetchall()}

# Filtern neuer .fit-Dateien
neue_dateien = [
    f for f in sorted(Path(FIT_VERZEICHNIS).glob("*.fit")) 
    if f.name not in bereits_importiert
]

for fit_datei in neue_dateien:
    try:
        fit = FitFile(str(fit_datei))
        session = next(fit.get_messages("session"), None)

        start_time_utc = session.get_value("start_time")
        total_distance = session.get_value("total_distance") or 0
        total_ascent = session.get_value("total_ascent") or 0
        total_timer_time = session.get_value("total_timer_time") or 0
        avg_speed = session.get_value("avg_speed") or 0

        # Berücksichtigung UTC-Zeit in Ortszeit Berlin (Sommer-/Winterzeit)
        if start_time_utc:
            start_time_utc = start_time_utc.replace(tzinfo=timezone.utc)
            start_time_local = start_time_utc.astimezone(ZoneInfo("Europe/Berlin"))
            datum_str = str(start_time_local.date())
            startzeit_str = str(start_time_local.strftime("%H:%M:%S"))
        else:
            datum_str, startzeit_str = None, None

        track_json = extract_gps_track(fit)

        cursor.execute("""
            INSERT INTO activities (datei, datum, startzeit, distanz, anstieg, zeit, avg, track)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            fit_datei.name,
            datum_str,
            startzeit_str,
            round(float(total_distance) / 1000, 2),
            int(total_ascent),
            int(round(float(total_timer_time))),
            round(float(avg_speed) * 3.6, 2),
            track_json
        ))
        print(f"{fit_datei.name} importiert (inkl. Track)")

    except Exception as e:
        print(f"error >> {fit_datei.name} >> {e}")

conn.commit()
conn.close()