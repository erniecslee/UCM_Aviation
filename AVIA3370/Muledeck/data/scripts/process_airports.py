"""
Build the DEP/DEST airport search list + runway geometry from FAA NASR
APT_BASE / APT_RWY / APT_RWY_END (data/raw/nasr/APT/), public-use US
airports only. Cross-references chart_index.json (must be built first)
to flag which airports have published charts.
"""
import csv
import json
import os

RAW = os.path.join(os.path.dirname(__file__), "..", "raw", "nasr", "APT")
PROCESSED = os.path.join(os.path.dirname(__file__), "..", "processed")


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main():
    with open(os.path.join(PROCESSED, "chart_index.json")) as f:
        chart_icaos = set(json.load(f)["airports"].keys())

    base_rows = read_csv(os.path.join(RAW, "APT_BASE.csv"))
    rwy_rows = read_csv(os.path.join(RAW, "APT_RWY.csv"))
    end_rows = read_csv(os.path.join(RAW, "APT_RWY_END.csv"))

    # site_no -> list of runway-end dicts, keyed by RWY_ID
    ends_by_site_rwy = {}
    for r in end_rows:
        key = (r["SITE_NO"], r["RWY_ID"])
        lat, lon = num(r["LAT_DECIMAL"]), num(r["LONG_DECIMAL"])
        ends_by_site_rwy.setdefault(key, []).append({
            "id": r["RWY_END_ID"],
            "heading": num(r["TRUE_ALIGNMENT"]),
            "lat": lat,
            "lon": lon,
            "ils": r["ILS_TYPE"] or None,
        })

    rwys_by_site = {}
    for r in rwy_rows:
        site = r["SITE_NO"]
        ends = ends_by_site_rwy.get((site, r["RWY_ID"]), [])
        rwys_by_site.setdefault(site, []).append({
            "id": r["RWY_ID"],
            "lengthFt": num(r["RWY_LEN"]),
            "widthFt": num(r["RWY_WIDTH"]),
            "surface": r["SURFACE_TYPE_CODE"] or None,
            "ends": ends,
        })

    out = []
    for r in base_rows:
        if r["COUNTRY_CODE"] != "US":
            continue
        if r["FACILITY_USE_CODE"] != "PU" or r["SITE_TYPE_CODE"] != "A":
            continue
        lat, lon = num(r["LAT_DECIMAL"]), num(r["LONG_DECIMAL"])
        if lat is None or lon is None:
            continue
        icao = r["ICAO_ID"] or r["ARPT_ID"]
        out.append({
            "icao": icao,
            "faaId": r["ARPT_ID"],
            "name": r["ARPT_NAME"],
            "city": r["CITY"],
            "state": r["STATE_CODE"],
            "lat": lat,
            "lon": lon,
            "elevFt": num(r["ELEV"]),
            "artcc": r["RESP_ARTCC_ID"] or None,
            "hasCharts": icao in chart_icaos,
            "runways": rwys_by_site.get(r["SITE_NO"], []),
        })

    with open(os.path.join(PROCESSED, "us_airports.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"airports: {len(out)} public-use US airports, "
          f"{sum(1 for a in out if a['hasCharts'])} with published charts")


if __name__ == "__main__":
    main()
