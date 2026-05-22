#!/usr/bin/env python3
"""Generate stations.json and lines.json for the Mon Metro Paris PWA.

Source: Ile-de-France Mobilites open data (emplacement-des-gares-idf).

The IDFM GeoJSON contains one feature per (station x line). We deduplicate
by station name (normalized) and average coordinates so we end up with one
entry per physical station, with a lineIds array of every metro line that
serves it.

Usage:
    python3 scripts/generate_data.py [path/to/local-geojson]

If a local file path is given, it's used instead of fetching from the API
(useful when the export endpoint is rate-limited or unreachable).
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path

# Official IDFM line palette (post-2019 normalization).
LINES = [
    {"id": "1",    "name": "Ligne 1",    "colorHex": "#FFCD00", "textColorHex": "#000000", "sortOrder": 10},
    {"id": "2",    "name": "Ligne 2",    "colorHex": "#003CA6", "textColorHex": "#FFFFFF", "sortOrder": 20},
    {"id": "3",    "name": "Ligne 3",    "colorHex": "#837902", "textColorHex": "#FFFFFF", "sortOrder": 30},
    {"id": "3bis", "name": "Ligne 3bis", "colorHex": "#6EC4E8", "textColorHex": "#000000", "sortOrder": 35},
    {"id": "4",    "name": "Ligne 4",    "colorHex": "#CF009E", "textColorHex": "#FFFFFF", "sortOrder": 40},
    {"id": "5",    "name": "Ligne 5",    "colorHex": "#FF7E2E", "textColorHex": "#000000", "sortOrder": 50},
    {"id": "6",    "name": "Ligne 6",    "colorHex": "#6ECA97", "textColorHex": "#000000", "sortOrder": 60},
    {"id": "7",    "name": "Ligne 7",    "colorHex": "#FA9ABA", "textColorHex": "#000000", "sortOrder": 70},
    {"id": "7bis", "name": "Ligne 7bis", "colorHex": "#6ECA97", "textColorHex": "#000000", "sortOrder": 75},
    {"id": "8",    "name": "Ligne 8",    "colorHex": "#E19BDF", "textColorHex": "#000000", "sortOrder": 80},
    {"id": "9",    "name": "Ligne 9",    "colorHex": "#B6BD00", "textColorHex": "#000000", "sortOrder": 90},
    {"id": "10",   "name": "Ligne 10",   "colorHex": "#C9910D", "textColorHex": "#FFFFFF", "sortOrder": 100},
    {"id": "11",   "name": "Ligne 11",   "colorHex": "#704B1C", "textColorHex": "#FFFFFF", "sortOrder": 110},
    {"id": "12",   "name": "Ligne 12",   "colorHex": "#007852", "textColorHex": "#FFFFFF", "sortOrder": 120},
    {"id": "13",   "name": "Ligne 13",   "colorHex": "#6EC4E8", "textColorHex": "#000000", "sortOrder": 130},
    {"id": "14",   "name": "Ligne 14",   "colorHex": "#62259D", "textColorHex": "#FFFFFF", "sortOrder": 140},
]
VALID_LINE_IDS = {l["id"] for l in LINES}

IDFM_GEOJSON_URL = (
    "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/"
    "datasets/emplacement-des-gares-idf/exports/geojson"
)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def slugify(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    ascii_only = ascii_only.lower()
    ascii_only = re.sub(r"[^a-z0-9]+", "-", ascii_only).strip("-")
    return ascii_only


def normalize_name_for_dedup(name: str) -> str:
    """Aggressive normalization to merge variants like
    'Charles de Gaulle - Etoile' and 'Charles de Gaulle Etoile'."""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", ascii_only.lower())


def extract_line_id(raw: str) -> str | None:
    """Map a raw line label (e.g. 'METRO 3bis', '3 bis', 'Metro 14') to our id."""
    if not raw:
        return None
    s = raw.strip().lower()
    s = re.sub(r"^metro\s*", "", s)
    s = re.sub(r"\s+", "", s)  # '3 bis' -> '3bis'
    # IDFM uses '7b' for ligne 7bis, normalize.
    if re.fullmatch(r"\d{1,2}b", s):
        s = s + "is"
    if s in VALID_LINE_IDS:
        return s
    # sometimes labelled '03bis' or '03'
    m = re.match(r"^0?(\d{1,2})(bis|b)?$", s)
    if m:
        suffix = m.group(2) or ""
        if suffix == "b":
            suffix = "bis"
        candidate = m.group(1) + suffix
        if candidate in VALID_LINE_IDS:
            return candidate
    return None


def fetch_geojson(local_path: Path | None) -> dict:
    if local_path:
        print(f"Loading local GeoJSON: {local_path}", file=sys.stderr)
        with local_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    print(f"Downloading {IDFM_GEOJSON_URL} ...", file=sys.stderr)
    req = urllib.request.Request(
        IDFM_GEOJSON_URL,
        headers={"User-Agent": "mon-metro-paris/1.0 (data generator)"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def is_metro_feature(props: dict) -> bool:
    """Robust check across IDFM schema variants."""
    candidates = []
    for key in ("mode", "mode_", "modes", "res_com", "reseau"):
        v = props.get(key)
        if isinstance(v, str):
            candidates.append(v.lower())
    blob = " ".join(candidates)
    # Need 'metro' but NOT RER/Tram/Train/Funiculaire/Val
    if "metro" not in blob and "métro" not in blob:
        return False
    for bad in ("rer", "tram", "train", "transilien", "funiculaire", "val ", "navette"):
        if bad in blob:
            return False
    return True


def extract_line_label(props: dict) -> str:
    for key in ("indice_lig", "res_com", "ligne", "indice", "ligne_id", "indice_l"):
        v = props.get(key)
        if isinstance(v, str) and v.strip():
            return v
    return ""


def extract_name(props: dict) -> str:
    for key in ("nom_gares", "nom_gare", "nom", "name", "stop_name", "libelle"):
        v = props.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def build_stations(geojson: dict) -> list[dict]:
    grouped: dict[str, dict] = defaultdict(lambda: {
        "names": [],
        "lats": [],
        "lons": [],
        "lineIds": set(),
        "ids": [],
    })

    for feat in geojson.get("features", []):
        props = feat.get("properties", {}) or {}
        geom = feat.get("geometry") or {}
        if geom.get("type") != "Point":
            continue
        if not is_metro_feature(props):
            continue

        line_label = extract_line_label(props)
        line_id = extract_line_id(line_label)
        if not line_id:
            continue

        name = extract_name(props)
        if not name:
            continue

        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        lon, lat = coords[0], coords[1]
        if not (isinstance(lat, (int, float)) and isinstance(lon, (int, float))):
            continue

        key = normalize_name_for_dedup(name)
        bucket = grouped[key]
        bucket["names"].append(name)
        bucket["lats"].append(float(lat))
        bucket["lons"].append(float(lon))
        bucket["lineIds"].add(line_id)
        # Try to grab a stable per-station id if present.
        for k in ("id_ref_zdl", "id_ref_zdc", "id_ref_lda", "idrefliga", "idrefligc", "id_gares"):
            v = props.get(k)
            if v:
                bucket["ids"].append(str(v))

    stations = []
    for key, b in grouped.items():
        if not b["lineIds"]:
            continue
        # Most frequent display name (preserves accents and casing).
        name_counts: dict[str, int] = {}
        for n in b["names"]:
            name_counts[n] = name_counts.get(n, 0) + 1
        display_name = max(name_counts.items(), key=lambda kv: (kv[1], len(kv[0])))[0]
        lat = sum(b["lats"]) / len(b["lats"])
        lon = sum(b["lons"]) / len(b["lons"])
        if b["ids"]:
            id_counts: dict[str, int] = {}
            for i in b["ids"]:
                id_counts[i] = id_counts.get(i, 0) + 1
            station_id = "IDFM:" + max(id_counts.items(), key=lambda kv: kv[1])[0]
        else:
            station_id = "STA:" + key
        stations.append({
            "id": station_id,
            "name": display_name,
            "slug": slugify(display_name),
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "lineIds": sorted(b["lineIds"], key=lambda lid: next(
                (l["sortOrder"] for l in LINES if l["id"] == lid), 999)),
        })

    # Sort by station name for stable output.
    stations.sort(key=lambda s: s["slug"])

    # Compute geographic order per line via nearest-neighbor traversal starting
    # from the most distant pair of stations on that line. Works perfectly for
    # linear lines (1, 2, 4, 5, 6, 8, 9, 11, 12, 14, 3bis, 7bis); produces a
    # reasonable approximation for branched ones (7, 10, 13) — branch tip is
    # visited then the algorithm continues onto the second branch.
    add_per_line_order(stations)
    return stations


def add_per_line_order(stations: list[dict]) -> None:
    import math

    def hav(a, b):
        # Haversine distance in metres (good enough at metro scale).
        lat1, lon1 = a
        lat2, lon2 = b
        R = 6_371_000
        p1 = math.radians(lat1)
        p2 = math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return 2 * R * math.asin(math.sqrt(h))

    # Build per-line station bucket
    by_line: dict[str, list[dict]] = {}
    for s in stations:
        for lid in s["lineIds"]:
            by_line.setdefault(lid, []).append(s)

    for lid, line_stations in by_line.items():
        n = len(line_stations)
        if n == 0:
            continue
        pts = [(s["latitude"], s["longitude"]) for s in line_stations]

        # Find farthest pair (O(n^2) but n <= ~38, trivial).
        max_d = -1.0
        start_idx = 0
        for i in range(n):
            for j in range(i + 1, n):
                d = hav(pts[i], pts[j])
                if d > max_d:
                    max_d = d
                    start_idx = i

        # Nearest-neighbor greedy traversal from start_idx.
        visited = [False] * n
        order = [start_idx]
        visited[start_idx] = True
        for _ in range(n - 1):
            cur = order[-1]
            nearest = -1
            nd = float("inf")
            for k in range(n):
                if visited[k]:
                    continue
                d = hav(pts[cur], pts[k])
                if d < nd:
                    nd = d
                    nearest = k
            if nearest < 0:
                break
            order.append(nearest)
            visited[nearest] = True

        # Write the per-line order back onto each station.
        for rank, idx in enumerate(order):
            st = line_stations[idx]
            st.setdefault("orderByLine", {})[lid] = rank


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    local_path = None
    if len(sys.argv) > 1:
        local_path = Path(sys.argv[1]).expanduser().resolve()
        if not local_path.exists():
            print(f"Local file not found: {local_path}", file=sys.stderr)
            return 2

    try:
        geojson = fetch_geojson(local_path)
    except Exception as e:
        print(f"ERROR fetching IDFM GeoJSON: {e}", file=sys.stderr)
        print(
            "\nFallback: download manually from\n"
            "  https://data.iledefrance-mobilites.fr/explore/dataset/emplacement-des-gares-idf/\n"
            "(use the 'Exporter' button -> GeoJSON), then run:\n"
            "  python3 scripts/generate_data.py /path/to/file.geojson",
            file=sys.stderr,
        )
        return 1

    stations = build_stations(geojson)

    if not stations:
        print("ERROR: no metro stations found in the GeoJSON.", file=sys.stderr)
        return 3

    line_station_counts = defaultdict(int)
    for s in stations:
        for lid in s["lineIds"]:
            line_station_counts[lid] += 1

    print(f"Found {len(stations)} distinct metro stations.", file=sys.stderr)
    for line in LINES:
        c = line_station_counts.get(line["id"], 0)
        print(f"  {line['name']:<12} {c:>3} stations", file=sys.stderr)

    (DATA_DIR / "lines.json").write_text(
        json.dumps(LINES, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (DATA_DIR / "stations.json").write_text(
        json.dumps(stations, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {DATA_DIR/'lines.json'} and {DATA_DIR/'stations.json'}.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
