#!/usr/bin/env python3
"""Maak de vaste GitHub Pages-ingangen voor Netto zonder kopieën in Git te bewaren."""

from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/netto_frontend_puzzles.js"
SCREENS = (
    "daily", "daily-archive", "puzzles", "connections", "race",
    "race/online", "leaderboard", "settings", "how-to-play",
    "submit-question", "about", "photo-credits",
)


def puzzles() -> dict:
    raw = DATA.read_text(encoding="utf-8").strip()
    return json.loads(raw.split("window.NETTO_REBUILT_PUZZLES =", 1)[1].strip().rstrip(";"))


def connection(puzzle: dict) -> bool:
    answers = [puzzle.get(f"q{i}_answer") for i in (1, 2, 3)]
    if any(not isinstance(a, int) or a <= 0 for a in answers) or len(set(answers)) != 3:
        return False
    if not all(puzzle.get(f"q{i}_label") for i in (1, 2, 3)):
        return False
    families = set()
    for a in answers:
        for b in answers:
            if a == b:
                continue
            for c in answers:
                if c in (a, b):
                    continue
                if a + b == c or a - b == c:
                    families.add("sum")
                if a * b == c or a == b * c:
                    families.add("product")
    return len(families) == 1


def routes(data: dict) -> dict[str, str]:
    items = {name: "index.html" for name in SCREENS}
    items["stats"] = "stats.html"
    items["admin"] = "admin.html"
    for puzzle in data["library"]:
        number = int(puzzle["number"])
        items[f"puzzles/{number}"] = "index.html"
        if connection(puzzle):
            items[f"connections/{number}"] = "index.html"
    # Ook nog niet gepubliceerde dagpuzzels kunnen uit de database komen.
    first = min(date.fromisoformat(puzzle["date"]) for puzzle in data["daily"])
    last = date.today() + timedelta(days=366)
    day = first
    while day <= last:
        items[f"daily/{day.strftime('%y-%m-%d')}"] = "index.html"
        day += timedelta(days=1)
    return items


def make_entry(source: str, route: str) -> str:
    depth = route.count("/") + 1
    base = "../" * depth
    if "<head>" not in source:
        raise ValueError("De HTML-pagina heeft geen head-element")
    source = source.replace(
        'content="https://b-force-games.github.io/nettoo/"',
        f'content="https://b-force-games.github.io/nettoo/{route}/"', 1,
    )
    return source.replace("<head>", f'<head>\n<base href="{base}">', 1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=ROOT / "website")
    args = parser.parse_args()
    site = args.site.resolve()
    if not (site / "index.html").is_file():
        parser.error(f"Geen Netto-site gevonden in {site}")
    data = puzzles()
    entries = routes(data)
    originals = {name: (site / name).read_text(encoding="utf-8") for name in set(entries.values())}
    for route, filename in entries.items():
        target = site / route / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(make_entry(originals[filename], route), encoding="utf-8")
    print(f"{len(entries)} routepagina's gemaakt in {site}")


if __name__ == "__main__":
    main()
