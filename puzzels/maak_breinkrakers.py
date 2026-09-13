#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genereer Breinkrakers-puzzels: 4 vragen in één formule.

Formule: a op1 b op2 c = d, gelezen VAN LINKS NAAR RECHTS. Niet de schoolregel
dus: "2 + 3 × 4" is hier 20 en niet 14. Elke puzzel heeft precies één
keer/deel- en één plus/min-bewerking, in wisselende volgorde:

    MA   a × b + c = d   de vertrouwde vorm; hier valt de leesregel toevallig
                         samen met de gewone rekenvolgorde
    AM   a + b × c = d   hier niet, en dat is de bedoeling: de speler moet de
                         som echt lezen in plaats van er een keersom in te zien

Alle vier de vragen komen uit de geverifieerde vragenbank, hebben binnen één
puzzel verschillende categorieën en zichtbare eenheden, en de formule klopt
exact.

Output:
  1. breinkrakers.xlsx          — 100.000 puzzels (tabblad Breinkrakers + Overzicht)
  2. data/netto_breinkrakers.js — 200 uitgekozen speelpuzzels voor de frontend
"""

from __future__ import annotations

import json
import math
import argparse
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

try:
    from puzzels.maak_unieke_puzzels import vraag_eenheid
except ModuleNotFoundError:
    # Bij rechtstreeks draaien staat de map puzzels/ zelf op sys.path.
    from maak_unieke_puzzels import vraag_eenheid

# Dezelfde bron als de gewone puzzels: elke vraag hierin heeft een
# gecontroleerde bron. De oude bank had die kolommen niet.
INPUT = Path("vragen/vragen_review_compleet.xlsx")
OUTPUT_XLSX = Path("puzzels/breinkrakers.xlsx")
OUTPUT_JS = Path("data/netto_breinkrakers.js")  # frontend-asset, blijft in de projectroot
TARGET_ROWS = 100_000
FRONTEND_TARGET = 200
FRONTEND_REUSE_CAP = 4
MAX_PLAY_VALUE = 1_000_000

# Minimale omvang van het grootste getal per niveau — zo beginnen zelfs de
# eerste puzzels met interessante waarden i.p.v. 2×2+2=6-sommetjes.
LEVEL_MIN_MAX_VALUE = {"Easy": 12, "Intermediate": 40, "Hard": 150, "Extremely Hard": 800}
# Bij tekort aan kandidaten mag de vloer stapsgewijs omlaag, maar nooit volledig weg.
FLOOR_RELAX_STEPS = [0, 0.5, 0.75]
# Plafond per bewerkingspaar, als deler van het quotum: eerst streng (een
# achtste, dus alle acht paren gelijk), daarna ruimer, ten slotte los.
COMBI_RELAX_STEPS = [8, 7, 6]
# Hoe vaak dezelfde halve som (a op1 b) in de speelbare lijst mag terugkomen.
HALF_REUSE_CAP = 2

BK_WEIGHTS = {"×": 14.0, "÷": 18.0, "+": 0.0, "−": 8.0}
COL_LETTERS = [chr(65 + i) for i in range(18)]
COL_WIDTHS = [11, 30, 11, 11, 14, 26, 66, 14, 26, 66, 14, 26, 66, 14, 26, 66, 16, 12]
HEADERS = [
    "Puzzel #", "Formule", "Bewerking 1", "Bewerking 2",
    "Antwoord 1", "Categorie 1", "Vraag 1",
    "Antwoord 2", "Categorie 2", "Vraag 2",
    "Antwoord 3", "Categorie 3", "Vraag 3",
    "Antwoord 4", "Categorie 4", "Vraag 4",
    "Difficulty", "Difficulty score",
]


@dataclass(frozen=True)
class Vraag:
    text: str
    category: str
    answer: int
    unit: str | None


def load_questions(path: Path) -> list[Vraag]:
    blad = pd.read_excel(path, sheet_name="Vragen")
    vragen = []
    for _, rij in blad.iterrows():
        try:
            antwoord = int(rij["Antwoord"])
        except (TypeError, ValueError):
            continue
        # 0 en 1 leveren lege bewerkingen op (b × 1 = b), dus die doen niet mee.
        if antwoord < 2:
            continue
        tekst = str(rij["Vraag NL"])
        vragen.append(Vraag(tekst, str(rij["Categorie"]), antwoord,
                            vraag_eenheid(tekst)))
    return vragen


def pas(x: int, op: str, y: int) -> int:
    """Eén stap in de formule. Delen is altijd exact: de tabellen laten geen
    combinatie toe waar het niet opgaat."""
    if op == "×":
        return x * y
    if op == "÷":
        return x // y
    if op == "+":
        return x + y
    return x - y


def halfsleutel(a: int, op1: str, b: int) -> tuple:
    if op1 in ("×", "+"):
        return (min(a, b), op1, max(a, b))
    return (a, op1, b)


def familie(op1: str) -> str:
    return "MA" if op1 in ("×", "÷") else "AM"


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def bk_score(op1: str, op2: str, values) -> float:
    return round(
        BK_WEIGHTS[op1] + BK_WEIGHTS[op2]
        + sum(math.log10(abs(float(v)) + 1.0) * 10.0 for v in values), 2)


def niveaugrenzen(scores: list[float]) -> list[float]:
    """Vier even grote banden, afgeleid uit de scores die er echt zijn.

    Vaste drempels liepen mis zodra de vragenbank veranderde: met de nieuwe,
    grotere antwoorden viel 90 procent in één bak en bleef Easy leeg."""
    geordend = sorted(scores)
    return [geordend[int(len(geordend) * deel)] for deel in (0.25, 0.5, 0.75)]


def bk_level(score: float, grenzen: list[float]) -> str:
    if score < grenzen[0]:
        return "Easy"
    if score < grenzen[1]:
        return "Intermediate"
    if score < grenzen[2]:
        return "Hard"
    return "Extremely Hard"


# ------------------------------------------------------------- xlsx-writer

def row_xml(row_number: int, cells: list) -> str:
    parts = [f'<row r="{row_number}">']
    for column, (kind, value) in enumerate(cells):
        ref = f"{COL_LETTERS[column]}{row_number}"
        if kind == "n":
            parts.append(f'<c r="{ref}"><v>{value}</v></c>')
        else:
            parts.append(f'<c r="{ref}" t="inlineStr"><is><t>{value}</t></is></c>')
    parts.append("</row>")
    return "".join(parts)


def cols_xml() -> str:
    parts = ["<cols>"]
    for i, width in enumerate(COL_WIDTHS, start=1):
        parts.append(f'<col min="{i}" max="{i}" width="{width}" customWidth="1"/>')
    parts.append("</cols>")
    return "".join(parts)


def write_data_sheet(zf: zipfile.ZipFile, name: str, rows: list) -> None:
    last_row = len(rows) + 1
    dim = f"A1:{COL_LETTERS[-1]}{last_row}"
    header = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="{dim}"/>'
        '<sheetViews><sheetView workbookViewId="0">'
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        '</sheetView></sheetViews>'
        + cols_xml() + "<sheetData>"
    )
    footer = f'</sheetData><autoFilter ref="{dim}"/></worksheet>'
    with zf.open(f"xl/worksheets/sheet1.xml", "w") as stream:
        stream.write(header.encode("utf-8"))
        stream.write(row_xml(1, [("s", h) for h in HEADERS]).encode("utf-8"))
        buffer: list[str] = []
        for index, cells in enumerate(rows, start=2):
            buffer.append(row_xml(index, cells))
            if len(buffer) >= 2000:
                stream.write("".join(buffer).encode("utf-8"))
                buffer.clear()
        if buffer:
            stream.write("".join(buffer).encode("utf-8"))
        stream.write(footer.encode("utf-8"))


def write_overview_sheet(zf: zipfile.ZipFile, stats: dict) -> None:
    lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<dimension ref="A1:B20"/><sheetData>',
    ]
    row_number = 0

    def add(label: str, value: object) -> None:
        nonlocal row_number
        row_number += 1
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            value_cell = f'<c r="B{row_number}"><v>{value}</v></c>'
        else:
            value_cell = f'<c r="B{row_number}" t="inlineStr"><is><t>{esc(str(value))}</t></is></c>'
        lines.append(
            f'<row r="{row_number}">'
            f'<c r="A{row_number}" t="inlineStr"><is><t>{esc(str(label))}</t></is></c>'
            f'{value_cell}</row>'
        )

    for key, value in stats.items():
        add(key, value)
    lines.append("</sheetData></worksheet>")
    with zf.open("xl/worksheets/sheet2.xml", "w") as stream:
        stream.write("".join(lines).encode("utf-8"))


def write_xlsx(path: Path, rows: list, stats: dict) -> None:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            "</Types>",
        )
        zf.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        zf.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            "<sheets>"
            '<sheet name="Breinkrakers" sheetId="1" r:id="rId1"/>'
            '<sheet name="Overzicht" sheetId="2" r:id="rId2"/>'
            "</sheets></workbook>",
        )
        zf.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
            '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            "</Relationships>",
        )
        zf.writestr(
            "xl/styles.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
            '<fills count="2"><fill><patternFill patternType="none"/></fill>'
            '<fill><patternFill patternType="gray125"/></fill></fills>'
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            "</styleSheet>",
        )
        write_data_sheet(zf, "Breinkrakers", rows)
        write_overview_sheet(zf, stats)


# ------------------------------------------------------------------ main

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--alleen-frontend', action='store_true',
                        help='laat het grote controlewerkboek ongemoeid')
    args = parser.parse_args()
    print(f"Inlezen: {INPUT}")
    questions = load_questions(INPUT)
    vals_all = [q.answer for q in questions]
    buckets: dict[int, list[int]] = defaultdict(list)
    for index, value in enumerate(vals_all):
        buckets[value].append(index)
    V = [v for v in sorted(buckets) if v <= MAX_PLAY_VALUE]
    n = len(V)
    print(f"Vragen: {len(questions)} | unieke waarden: {n}")

    # 1. De formule wordt van links naar rechts gelezen: (a op1 b) op2 c = d.
    #    Twee families, allebei met een keer/deel- en een plus/min-bewerking:
    #      MA  a × b + c   — de vertrouwde vorm, waar de rekenvolgorde toevallig
    #                        hetzelfde uitkomt
    #      AM  a + b × c   — hier niet, want links om rekenen geeft 20 en de
    #                        schoolregel 14. Dat is precies de bedoeling.
    #    tweede_map gaat als eerste omdat het de bereikbare tussenstanden h
    #    aflijnt; daarna hoeven alleen halve sommen met zo'n h te worden bewaard.
    tweede_map: dict[tuple[int, str], list[tuple[int, int, str]]] = defaultdict(list)
    for d in V:
        if d < 2:
            continue
        for c in V:
            if c < 2:
                continue
            if d - c >= 2:
                tweede_map[(d - c, "MA")].append((c, d, "+"))   # h + c = d
            tweede_map[(d + c, "MA")].append((c, d, "−"))       # h − c = d
            if d % c == 0 and d // c >= 2:
                tweede_map[(d // c, "AM")].append((c, d, "×"))  # h × c = d
            tweede_map[(d * c, "AM")].append((c, d, "÷"))       # h ÷ c = d

    half_pairs: dict[tuple[int, str], list[tuple[int, int, str]]] = defaultdict(list)
    for a in V:
        if a < 2:
            continue
        for b in V:
            if b < 2:
                continue
            for sleutel, paar in (
                ((a * b, "MA"), (a, b, "×")),
                ((a // b, "MA") if a % b == 0 and a // b >= 2 else None, (a, b, "÷")),
                ((a + b, "AM"), (a, b, "+")),
                ((a - b, "AM") if a - b >= 2 else None, (a, b, "−")),
            ):
                if sleutel is not None and sleutel in tweede_map:
                    half_pairs[sleutel].append(paar)

    cursors: dict[int, int] = defaultdict(int)

    def take_id(value: int, avoid: set[int]) -> int | None:
        bucket = buckets[value]
        size = len(bucket)
        start = cursors[value] % size
        for k in range(size):
            idx = (start + k) % size
            qid = bucket[idx]
            if qid not in avoid:
                cursors[value] = (idx + 1) % size
                return qid
        return None

    usable_keys = sorted(half_pairs, key=lambda k: (k[0], k[1]))
    print(f"Bruikbare tussenstanden: {len(usable_keys):,}")
    total_budget = TARGET_ROWS
    rows: list[tuple] = []
    seen_combo: set[tuple] = set()
    keys_zero = 0

    emitted_per_key: dict[tuple[int, str], int] = {}
    used_combo_indices: dict[tuple[int, str], set[int]] = defaultdict(set)
    key_data: dict[tuple[int, str], tuple] = {}
    combos_seen = 0
    for sleutel in usable_keys:
        pl = half_pairs[sleutel]
        tweede = tweede_map[sleutel]
        combos_total = len(pl) * len(tweede)
        key_data[sleutel] = (pl, tweede, combos_total)
        combos_seen += combos_total

    # Meerdere passes over de sleutels tot het budget op is: sleutels met veel
    # combinaties leveren in latere passes nog extra rijen.
    pass_index = 0
    while total_budget > 0:
        pass_index += 1
        progress = 0
        active_keys = [k for k in usable_keys if key_data[k][2] - emitted_per_key.get(k, 0) > 0]
        if not active_keys:
            break
        for position, sleutel in enumerate(active_keys):
            if total_budget <= 0:
                break
            pl, tweede, combos_total = key_data[sleutel]
            already = emitted_per_key.get(sleutel, 0)
            remaining_combos = combos_total - already
            used = used_combo_indices[sleutel]
            resterend = max(1, len(active_keys) - position)
            cap = min(remaining_combos,
                      max(1, total_budget // resterend + (1 if total_budget % resterend else 0)))
            emitted = 0
            offset = (position + already) % combos_total  # rotatie voor variatie
            # Met stappen van 1 pak je alleen de kop van de lijst, en daar
            # staan de keersommen: elk paar (a, b) heeft een product, lang niet
            # elk paar een heel quotient. Een stap die geen deler is van de
            # lijstlengte loopt er in één ronde helemaal doorheen, dus de vier
            # rijen per sleutel komen uit het hele rooster.
            stap = next((k for k in (104729, 7919, 613, 97, 7, 3) if math.gcd(k, combos_total) == 1), 1)
            prev_ids: dict[tuple, tuple] = {}
            for step in range(combos_total):
                if emitted >= cap or total_budget <= 0:
                    break
                combo_index = (offset + step * stap) % combos_total
                if combo_index in used:
                    continue
                a, b, op1 = pl[combo_index // len(tweede)]
                c, d, op2 = tweede[combo_index % len(tweede)]
                combo_key = (a, op1, b, op2, c)
                ids = assign_ids(a, b, c, d, buckets, take_id, questions)
                if ids is None:
                    continue
                if ids == prev_ids.get(combo_key):
                    continue  # geen nieuwe unieke vragen voor deze combinatie
                prev_ids[combo_key] = ids
                used.add(combo_index)
                seen_combo.add(combo_key)
                score = bk_score(op1, op2, (a, b, c, d))
                rows.append((a, b, op1, c, op2, d, ids, score))
                emitted += 1
                progress += 1
                total_budget -= 1
            emitted_per_key[sleutel] = already + emitted
            if emitted == 0 and already == 0:
                keys_zero += 1
        print(f"  pass {pass_index}: +{progress:,} rijen | budget over: {total_budget:,}")
        if progress == 0:
            break
    print(f"Waarde-combinaties gezien: {combos_seen:,} | sleutels zonder rij: {keys_zero:,} "
          f"| budget over: {total_budget:,}")

    grenzen = niveaugrenzen([r[7] for r in rows])
    rows = [r + (bk_level(r[7], grenzen),) for r in rows]
    print(f"Geselecteerd: {len(rows):,} puzzels | scoregrenzen: "
          + " / ".join(f"{g:.1f}" for g in grenzen))
    levels = Counter(r[8] for r in rows)
    for level in ("Easy", "Intermediate", "Hard", "Extremely Hard"):
        print(f"  {level}: {levels[level]:,}")

    # 2. Excel schrijven
    esc_text = [esc(q.text) for q in questions]
    esc_cat = [esc(q.category) for q in questions]
    xlsx_rows = []
    for number, (a, b, op1, c, op2, d, ids, score, level) in enumerate(rows, start=1):
        formula = f"{a} {op1} {b} {op2} {c} = {d}"
        answers = (a, b, c, d)
        cells = [("n", number), ("s", formula), ("s", op1), ("s", op2)]
        for k in range(4):
            cells += [("n", answers[k]), ("s", esc_cat[ids[k]]), ("s", esc_text[ids[k]])]
        cells += [("s", level), ("n", score)]
        xlsx_rows.append(cells)

    op1_counts = Counter(r[2] for r in rows)
    op2_counts = Counter(r[4] for r in rows)
    stats = {
        "Bronbestand": INPUT.name,
        "Vragen in bank": len(questions),
        "Puzzels in bestand": len(rows),
        "Leesregel": "van links naar rechts, dus (a op1 b) op2 c = d",
        "Eerst keer (×)": op1_counts["×"],
        "Eerst delen (÷)": op1_counts["÷"],
        "Eerst plus (+)": op1_counts["+"],
        "Eerst min (−)": op1_counts["−"],
        "Daarna keer (×)": op2_counts["×"],
        "Daarna delen (÷)": op2_counts["÷"],
        "Daarna plus (+)": op2_counts["+"],
        "Daarna min (−)": op2_counts["−"],
        "Easy": levels["Easy"],
        "Intermediate": levels["Intermediate"],
        "Hard": levels["Hard"],
        "Extremely Hard": levels["Extremely Hard"],
    }
    if not args.alleen_frontend:
        print(f"Schrijven: {OUTPUT_XLSX} ...")
        write_xlsx(OUTPUT_XLSX, xlsx_rows, stats)

    # 3. Frontend-subset: 200 speelpuzzels met een bewuste niveau-mix. Beide
    #    families komen aan bod, want een lijst met alleen "a × b + c" is
    #    precies de eentonigheid die we kwijt wilden.
    candidates = [r for r in rows if max(r[0], r[1], r[3], r[5]) <= MAX_PLAY_VALUE]
    candidates.sort(key=lambda r: r[7])
    cat_spread = lambda r: len({questions[i].category for i in r[6]})
    quotas = {"Easy": 4, "Intermediate": 58, "Hard": 92, "Extremely Hard": 46}
    chosen: list[tuple] = []
    uses: Counter = Counter()
    halven: Counter = Counter()
    front_seen: set[tuple] = set()
    for level in ("Easy", "Intermediate", "Hard", "Extremely Hard"):
        quota = quotas[level]
        for relax, deler in zip(FLOOR_RELAX_STEPS, COMBI_RELAX_STEPS):
            floor = LEVEL_MIN_MAX_VALUE[level] * (1.0 - relax)
            filled = sum(1 for r in chosen if r[8] == level)
            # Zonder plafond per bewerkingspaar loopt de lijst vol met "+ dan
            # delen": die combinatie heeft veruit de meeste kandidaten, terwijl
            # juist "a + b x c" de vorm is die de leesregel laat zien.
            combi_plafond = math.ceil(quota / deler) if deler else quota
            per_combi = Counter((r[2], r[4]) for r in chosen if r[8] == level)
            for r in candidates:
                if filled >= quota or len(chosen) >= FRONTEND_TARGET:
                    break
                if r[8] != level:
                    continue
                ids = r[6]
                key = (r[0], r[2], r[1], r[4], r[3])
                if key in front_seen:
                    continue
                if any(uses[i] >= FRONTEND_REUSE_CAP for i in ids):
                    continue
                if max(r[0], r[1], r[3], r[5]) < floor:
                    continue
                if len(chosen) < FRONTEND_TARGET // 2 and cat_spread(r) < 2:
                    continue
                if per_combi[(r[2], r[4])] >= combi_plafond:
                    continue
                # Dezelfde halve som twee keer leest als een herhaling:
                # "8760 - 343 : 443" naast "8760 - 343 : 19". Bij keer en plus
                # telt de volgorde niet mee, want 225 x 139 en 139 x 225 zien
                # er voor de speler hetzelfde uit.
                if halven[halfsleutel(r[0], r[2], r[1])] >= HALF_REUSE_CAP:
                    continue
                front_seen.add(key)
                chosen.append(r)
                halven[halfsleutel(r[0], r[2], r[1])] += 1
                per_combi[(r[2], r[4])] += 1
                uses.update(ids)
                filled += 1
            if filled >= quota:
                break
    chosen.sort(key=lambda r: r[7])
    print(f"Frontend-subset: {len(chosen)} puzzels | max vraaghergebruik: {max(uses.values())}")
    front_levels = Counter(r[8] for r in chosen)
    for level in ("Easy", "Intermediate", "Hard", "Extremely Hard"):
        print(f"  frontend {level}: {front_levels[level]}")
    front_fam = Counter(familie(r[2]) for r in chosen)
    print(f"  eerst keer/delen: {front_fam['MA']} | eerst plus/min: {front_fam['AM']}")

    puzzles = []
    for number, (a, b, op1, c, op2, d, ids, score, level) in enumerate(chosen, start=1):
        puzzles.append({
            "id": f"bk-{number}",
            "number": number,
            "op1": op1,
            "op2": op2,
            "formula": f"{a} {op1} {b} {op2} {c} = {d}",
            "difficulty": level.lower().replace(" ", "-"),
            "difficulty_score": score,
            "q1": {"label": questions[ids[0]].text, "answer": a, "category": questions[ids[0]].category},
            "q2": {"label": questions[ids[1]].text, "answer": b, "category": questions[ids[1]].category},
            "q3": {"label": questions[ids[2]].text, "answer": c, "category": questions[ids[2]].category},
            "q4": {"label": questions[ids[3]].text, "answer": d, "category": questions[ids[3]].category},
        })
        # Rekenproef per puzzel, expliciet van links naar rechts
        assert pas(pas(a, op1, b), op2, c) == d, f"Rekenfout in {a} {op1} {b} {op2} {c} = {d}"
    assert len({p["id"] for p in puzzles}) == len(puzzles)

    OUTPUT_JS.write_text(
        "// Netto Breinkrakers — gegenereerd door maak_breinkrakers.py\n"
        "// Formule: a op1 b op2 c = d, van links naar rechts gelezen.\n"
        "// Elke puzzel heeft een keer/deel- en een plus/min-bewerking, in\n"
        "// wisselende volgorde: 2 + 3 × 4 is hier 20 en niet 14.\n"
        "window.NETTO_BREINKRAKERS = "
        + json.dumps(puzzles, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    if args.alleen_frontend:
        print(f"Klaar: {OUTPUT_JS} ({len(puzzles)} speelpuzzels); "
              f"{OUTPUT_XLSX} bewust niet gewijzigd")
    else:
        size_mb = OUTPUT_XLSX.stat().st_size / (1024 * 1024)
        print(f"Klaar: {OUTPUT_XLSX} ({size_mb:.1f} MB, {len(rows):,} puzzels) "
              f"+ {OUTPUT_JS} ({len(puzzles)} speelpuzzels)")


def assign_ids(a, b, c, d, buckets, take_id, questions):
    """Koppel vier waarden aan vier inhoudelijk verschillende vragen."""
    waarden = (a, b, c, d)

    def zoek(positie, gebruikt, categorieen, eenheden):
        if positie == len(waarden):
            return ()
        geweigerd = set(gebruikt)
        while True:
            qid = take_id(waarden[positie], geweigerd)
            if qid is None:
                return None
            geweigerd.add(qid)
            vraag = questions[qid]
            if vraag.category in categorieen:
                continue
            if vraag.unit and vraag.unit in eenheden:
                continue
            vervolg = zoek(
                positie + 1,
                gebruikt | {qid},
                categorieen | {vraag.category},
                eenheden | ({vraag.unit} if vraag.unit else set()),
            )
            if vervolg is not None:
                return (qid,) + vervolg

    return zoek(0, set(), set(), set())


if __name__ == "__main__":
    main()
