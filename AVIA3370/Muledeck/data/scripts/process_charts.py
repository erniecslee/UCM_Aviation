"""
Convert the FAA d-TPP Metafile (data/raw/dtpp_metafile.xml) into a compact
per-airport chart index (data/processed/chart_index.json).

Source: https://aeronav.faa.gov/d-tpp/  (public domain US government data,
28-day publication cycle). Chart PDFs are NOT copied locally -- the app
links directly to the live FAA PDF (aeronav.faa.gov/d-tpp/<cycle>/<pdf>)
so charts always reflect the current published cycle.
"""
import json
import os
import xml.etree.ElementTree as ET

RAW = os.path.join(os.path.dirname(__file__), "..", "raw", "dtpp_metafile.xml")
OUT = os.path.join(os.path.dirname(__file__), "..", "processed", "chart_index.json")

# chart_code -> bucket shown in the app (SID / STAR / APP / TAXI).
# MIN (takeoff/alt minimums), HOT (hot spots), LAH (LAHSO), DAU are out of
# scope per the app's brief (chart lookup only, no dispatch minimums).
BUCKET = {
    "DP": "SID",
    "ODP": "SID",
    "STR": "STAR",
    "IAP": "APP",
    "APD": "TAXI",
}


def main():
    tree = ET.parse(RAW)
    root = tree.getroot()
    cycle = root.attrib.get("cycle")
    from_edate = root.attrib.get("from_edate")
    to_edate = root.attrib.get("to_edate")

    airports = {}
    for state in root.findall("state_code"):
        for city in state.findall("city_name"):
            for apt in city.findall("airport_name"):
                icao = apt.attrib.get("icao_ident") or ""
                if not icao:
                    continue
                entry = airports.setdefault(icao, {
                    "apt": apt.attrib.get("apt_ident"),
                    "name": apt.attrib.get("ID"),
                    "state": state.attrib.get("ID"),
                    "SID": [], "STAR": [], "APP": [], "TAXI": [],
                })
                for rec in apt.findall("record"):
                    code = (rec.findtext("chart_code") or "").strip()
                    bucket = BUCKET.get(code)
                    if not bucket:
                        continue
                    name = (rec.findtext("chart_name") or "").strip()
                    pdf = (rec.findtext("pdf_name") or "").strip()
                    if not pdf or pdf.upper() == "N/A":
                        continue
                    item = {"name": name, "pdf": pdf}
                    if item not in entry[bucket]:
                        entry[bucket].append(item)

    # Drop airports with nothing chartable at all.
    airports = {k: v for k, v in airports.items()
                if v["SID"] or v["STAR"] or v["APP"] or v["TAXI"]}

    out = {
        "cycle": cycle,
        "effective": from_edate,
        "expires": to_edate,
        "pdfBaseUrl": f"https://aeronav.faa.gov/d-tpp/{cycle}/",
        "airports": airports,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"chart_index: {len(airports)} airports, cycle {cycle} ({from_edate} - {to_edate})")


if __name__ == "__main__":
    main()
