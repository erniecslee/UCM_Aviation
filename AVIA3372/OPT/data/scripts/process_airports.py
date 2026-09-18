"""Build a compact US-airport/runway dataset for the OPT web app from OurAirports CSVs.

Source: https://ourairports.com/data/ (CC0 public domain), mirrored at
https://github.com/davidmegginson/ourairports-data
"""
import csv
import json
import os

RAW = os.path.join(os.path.dirname(__file__), "..", "raw")
OUT = os.path.join(os.path.dirname(__file__), "..", "processed")

KEEP_TYPES = {"large_airport", "medium_airport", "small_airport"}


def load_csv(name):
    with open(os.path.join(RAW, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def num(v, cast=float):
    if v is None or v == "":
        return None
    try:
        return cast(v)
    except ValueError:
        return None


def main():
    airports = load_csv("airports.csv")
    runways = load_csv("runways.csv")

    us_airports = {
        a["ident"]: a for a in airports if a["iso_country"] == "US" and a["type"] in KEEP_TYPES
    }

    runways_by_airport = {}
    for r in runways:
        if r["closed"] == "1":
            continue
        ident = r["airport_ident"]
        if ident not in us_airports:
            continue

        length_ft = num(r["length_ft"], int)
        width_ft = num(r["width_ft"], int)
        surface = (r["surface"] or "").strip()

        for end_prefix, other_prefix in (("le_", "he_"), ("he_", "le_")):
            rwy_ident = r[end_prefix + "ident"]
            if not rwy_ident:
                continue
            entry = {
                "id": rwy_ident,
                "reciprocal": r[other_prefix + "ident"] or None,
                "length_ft": length_ft,
                "width_ft": width_ft,
                "surface": surface,
                "lighted": r["lighted"] == "1",
                "heading_deg_true": num(r[end_prefix + "heading_degT"]),
                "displaced_threshold_ft": num(r[end_prefix + "displaced_threshold_ft"], int) or 0,
                "threshold_elevation_ft": num(r[end_prefix + "elevation_ft"], int),
                "lat": num(r[end_prefix + "latitude_deg"]),
                "lon": num(r[end_prefix + "longitude_deg"]),
            }
            runways_by_airport.setdefault(ident, []).append(entry)

    out = []
    for ident, a in us_airports.items():
        rwys = runways_by_airport.get(ident, [])
        if not rwys:
            continue
        out.append({
            "ident": a["ident"],
            "icao": a["icao_code"] or None,
            "iata": a["iata_code"] or None,
            "name": a["name"],
            "type": a["type"],
            "city": a["municipality"] or None,
            "state": (a["iso_region"] or "").replace("US-", "") or None,
            "lat": num(a["latitude_deg"]),
            "lon": num(a["longitude_deg"]),
            "elevation_ft": num(a["elevation_ft"], int),
            "runways": sorted(rwys, key=lambda x: x["id"]),
        })

    out.sort(key=lambda a: a["ident"])

    os.makedirs(OUT, exist_ok=True)
    out_path = os.path.join(OUT, "us_airports.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))

    total_rwy = sum(len(a["runways"]) for a in out)
    print(f"airports written: {len(out)}")
    print(f"runway ends written: {total_rwy}")
    print(f"output: {out_path} ({os.path.getsize(out_path)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
