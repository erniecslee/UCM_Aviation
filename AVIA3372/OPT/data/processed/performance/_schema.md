# Performance data JSON convention

All files in this folder were transcribed directly from the Boeing 737-800/CFM56-7B26
FCOM (`FCOM/B737NG FCOM.pdf`, source doc tag `"FCOM"`). Page numbers in `source.page`
are the PDF's own 1-based page numbers (which match the printed page footer on every
page checked, e.g. PDF page 613 = footer section `PD.30.1`). Section codes (e.g.
`PD.30.1`, `PI.32.4`) are Boeing's own chapter/section/subsection numbering and are
included in `source.section` for traceability.

There are three table shapes used across these files.

## 1. Grid tables

A value looked up by one or two axes (e.g. field-limit-weight by field-length x OAT).

```json
{
  "source": {"doc": "FCOM", "page": 614, "section": "PD.30.1 Flaps 5 Dry SL"},
  "unit": "1000 KG",
  "row_axis": {"name": "field_length_m", "unit": "m", "values": [1200, 1400, "..."]},
  "col_axis": {"name": "oat_c", "unit": "C", "values": [-40, 10, 14, "..."]},
  "data": [[58.1, 53.3, "..."], [63.7, 58.5, "..."], "..."],
  "notes": ""
}
```

- `data[i][j]` corresponds to `row_axis.values[i]` x `col_axis.values[j]`.
- `null` marks a blank / not-published cell. These are never guess-filled.
- A single-axis ("1D") table (e.g. V1(MCG), stab trim, a reference table) uses the
  same convention with only `row_axis` present (or a table with one axis of length 1
  effectively acting as a list) - see individual files.
- Where a 3rd axis exists (e.g. pressure altitude, in addition to field length x OAT),
  the top-level JSON is an **array** of the grid object above, and each element
  additionally carries a tagging key such as `"pressure_alt_ft"` alongside `source`.

## 2. Reference-distance + adjustment-factor tables

Used for the landing-distance style pages (ref distance + a set of additive
adjustment factors per 5000 kg / 1000 ft / 10 kt / 1% slope / 10 C / 5 kt / etc.)

```json
{
  "source": {"doc": "FCOM", "page": 1115, "section": "PI.32.1 Flaps 15"},
  "unit_dist": "m",
  "rows": [
    {
      "condition": "DRY", "config": "MAX MANUAL",
      "ref_dist_m": 1010,
      "wt_adj_per_5000kg": {"above": 70, "below": -60},
      "alt_adj_per_1000ft": {"std": 25, "high_ge_8000ft": 30},
      "wind_adj_per_10kt": {"head": -35, "tail": 125},
      "slope_adj_per_1pct": {"down": 15, "up": -10},
      "temp_adj_per_10c": {"above_isa": 25, "below_isa": -25},
      "app_spd_adj_per_5kt": 35,
      "reverse_thrust_adj": {"one_rev": 25, "no_rev": 50}
    }
  ],
  "notes": ""
}
```

- Field names describe exactly what a given page's own columns are. When a page's
  adjustment columns differ from the shape above (different increments, extra/missing
  factors, different braking-config or condition labels), the row's fields are adapted
  to match that page, but every field still self-describes with a name + implied unit
  (e.g. `wt_adj_per_5000kg`, `alt_adj_per_1000ft`) rather than being a bare number.
- `condition` / `config` (or similarly-named keys, adapted per page) identify which
  combination of runway condition / braking configuration the row is for.

## 3. Simple 1D tables

Same grid convention as (1) but with a single `row_axis` (no `col_axis`); `data` is
then a flat list aligned to `row_axis.values`, or (when there truly are two small axes,
e.g. flap x weight) a normal 2-axis grid per (1).

## General notes

- All numbers are transcribed as published; nothing is interpolated, extrapolated, or
  computed.
- Where a table spans a page break, or a value could not be confirmed with full
  confidence (jagged/triangular tables, small print, ambiguous column alignment,
  banded chart-hybrid layouts), the specific `notes` field for that table/section says
  so explicitly rather than presenting the number as equally reliable.
- Every top-level file (except `index.json`) traces back to one or more FCOM pages via
  `source`.
