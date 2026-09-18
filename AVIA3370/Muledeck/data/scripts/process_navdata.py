"""
Convert FAA NASR 28-day subscription CSVs (data/raw/nasr/) into compact JSON
used by the MuleDeck web app (data/processed/).

Source: https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/
Public domain US government data.
"""
import csv
import json
import os

RAW = os.path.join(os.path.dirname(__file__), "..", "raw", "nasr")
OUT = os.path.join(os.path.dirname(__file__), "..", "processed")
os.makedirs(OUT, exist_ok=True)


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def process_navaids():
    rows = read_csv(os.path.join(RAW, "NAV", "NAV_BASE.csv"))
    out = []
    for r in rows:
        if r["COUNTRY_CODE"] != "US":
            continue
        lat, lon = num(r["LAT_DECIMAL"]), num(r["LONG_DECIMAL"])
        if lat is None or lon is None:
            continue
        out.append({
            "id": r["NAV_ID"],
            "type": r["NAV_TYPE"],
            "name": r["NAME"],
            "state": r["STATE_CODE"],
            "lat": lat,
            "lon": lon,
            "freq": r["FREQ"] or None,
            "chan": r["CHAN"] or None,
            "elev": num(r["ELEV"]),
        })
    with open(os.path.join(OUT, "navaids.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"navaids: {len(out)} rows")
    return out


def process_fixes():
    rows = read_csv(os.path.join(RAW, "FIX", "FIX_BASE.csv"))
    out = []
    for r in rows:
        if r["COUNTRY_CODE"] != "US":
            continue
        lat, lon = num(r["LAT_DECIMAL"]), num(r["LONG_DECIMAL"])
        if lat is None or lon is None:
            continue
        out.append({
            "id": r["FIX_ID"],
            "lat": lat,
            "lon": lon,
            "artccHigh": r["ARTCC_ID_HIGH"] or None,
            "artccLow": r["ARTCC_ID_LOW"] or None,
            "use": (r["FIX_USE_CODE"] or "").strip() or None,
        })
    with open(os.path.join(OUT, "fixes.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"fixes: {len(out)} rows")
    return out


def process_airways(nav_by_id, fix_by_id):
    """Build a point lookup (navaid or fix, whichever matches) then
    assemble each airway as an ordered list of named, located points
    plus per-segment MEA data."""
    seg_rows = read_csv(os.path.join(RAW, "AWY", "AWY_SEG_ALT.csv"))

    def locate(ident):
        if ident in nav_by_id:
            n = nav_by_id[ident]
            return n["lat"], n["lon"]
        if ident in fix_by_id:
            n = fix_by_id[ident]
            return n["lat"], n["lon"]
        return None, None

    airways = {}
    for r in seg_rows:
        key = f'{r["AWY_LOCATION"]}:{r["AWY_ID"]}'
        aw = airways.setdefault(key, {
            "id": r["AWY_ID"],
            "location": r["AWY_LOCATION"],
            "segments": [],
        })
        seq = int(r["POINT_SEQ"])
        frm, to = r["FROM_POINT"], r["TO_POINT"]
        flat, flon = locate(frm)
        tlat, tlon = locate(to)
        if flat is None or tlat is None:
            continue
        mea = num(r["MIN_ENROUTE_ALT"])
        aw["segments"].append({
            "seq": seq,
            "from": frm, "fromLat": flat, "fromLon": flon,
            "to": to, "toLat": tlat, "toLon": tlon,
            "mea": mea,
            "artcc": r["ARTCC"] or None,
        })

    out = []
    for aw in airways.values():
        aw["segments"].sort(key=lambda s: s["seq"])
        if not aw["segments"]:
            continue
        # Ordered point chain (id + location) for route-string tracing.
        # Segments are already seq-ordered; consecutive from/to should
        # chain, but a real-world data gap can break that -- only trust
        # the chain while it actually connects, so a broken airway still
        # yields a usable (shorter) point list instead of a wrong one.
        points = [{"id": aw["segments"][0]["from"],
                   "lat": aw["segments"][0]["fromLat"],
                   "lon": aw["segments"][0]["fromLon"]}]
        for seg in aw["segments"]:
            if seg["from"] != points[-1]["id"]:
                break
            points.append({"id": seg["to"], "lat": seg["toLat"], "lon": seg["toLon"]})
        aw["points"] = points
        out.append(aw)
    with open(os.path.join(OUT, "airways.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"airways: {len(out)} airways, {sum(len(a['segments']) for a in out)} segments")


def process_artcc():
    base = {r["LOCATION_ID"]: r for r in read_csv(os.path.join(RAW, "ARB", "ARB_BASE.csv"))
            if r["COUNTRY_CODE"] == "US" and r["LOCATION_TYPE"] == "ARTCC"}
    seg_rows = read_csv(os.path.join(RAW, "ARB", "ARB_SEG.csv"))

    boundaries = {}
    for r in seg_rows:
        loc = r["LOCATION_ID"]
        if loc not in base:
            continue
        alt = r["ALTITUDE"]  # HIGH / LOW
        key = f"{loc}:{alt}"
        b = boundaries.setdefault(key, {
            "id": loc,
            "name": base[loc]["LOCATION_NAME"],
            "altitude": alt,
            "points": [],
        })
        lat, lon = num(r["LAT_DECIMAL"]), num(r["LONG_DECIMAL"])
        if lat is not None and lon is not None:
            b["points"].append((int(r["POINT_SEQ"]), lat, lon))

    NO_SUFFIX_HINTS = ("OCEANIC", "CONTROL", "CENTER", "FACILITY", "ARTCC")

    def display_label(name):
        title = name.title()
        for acro in ("Artcc", "Fir"):
            title = title.replace(acro, acro.upper())
        if any(h in name for h in NO_SUFFIX_HINTS):
            return title
        return f"{title} Center"

    features = []
    for b in boundaries.values():
        pts = [p[1:] for p in sorted(b["points"], key=lambda p: p[0])]
        if len(pts) < 3:
            continue
        ring = [[lon, lat] for lat, lon in pts]
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        features.append({
            "type": "Feature",
            "properties": {
                "id": b["id"], "name": b["name"], "label": display_label(b["name"]),
                "altitude": b["altitude"],
            },
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })
    fc = {"type": "FeatureCollection", "features": features}
    with open(os.path.join(OUT, "artcc_boundaries.geojson"), "w") as f:
        json.dump(fc, f, separators=(",", ":"))
    print(f"artcc boundaries: {len(features)} polygons ({len(base)} centers)")


if __name__ == "__main__":
    navaids = process_navaids()
    fixes = process_fixes()
    nav_by_id = {n["id"]: n for n in navaids}
    fix_by_id = {f["id"]: f for f in fixes}
    process_airways(nav_by_id, fix_by_id)
    process_artcc()
