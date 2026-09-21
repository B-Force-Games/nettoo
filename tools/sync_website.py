#!/usr/bin/env python3
"""Synchronize the canonical root frontend into the standalone website mirror."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "website"

# Only browser/runtime files belong in the mirror. Source work happens in ROOT.
MIRROR_FILES = (
    "index.html",
    "admin.html",
    "stats.html",
    "favicon.svg",
    "css/styles.css",
    "css/refinement.css",
    "css/admin.css",
    "css/stats-page.css",
    "js/core.js",
    "js/question-context.js",
    "js/puzzle-modes.js",
    "js/race.js",
    "js/submissions.js",
    "js/library.js",
    "js/app.js",
    "js/site-navigation.js",
    "js/stats-page.js",
    "js/i18n.js",
    "js/daily-photos.js",
    "data/netto_translations_en.js",
    "data/netto_bronnen.js",
    "data/netto_bronnen_en.js",
    "data/netto_frontend_puzzles.js",
    "data/netto_race_pool.js",
    "data/netto_breinkrakers.js",
)

# Mappen waarvan de volledige inhoud mee moet. De daily gebruikt alle foto's uit
# fotos/assets, dus een handmatige bestandslijst raakt hier gegarandeerd achter.
MIRROR_DIRS = (
    "fotos/assets",
)


def mirrored_files() -> tuple[str, ...]:
    files = list(MIRROR_FILES)
    for relative_dir in MIRROR_DIRS:
        source_dir = ROOT / relative_dir
        if not source_dir.is_dir():
            raise FileNotFoundError(f"Canonical directory is missing: {source_dir}")
        for path in sorted(source_dir.iterdir()):
            if path.is_file():
                files.append(f"{relative_dir}/{path.name}")
    return tuple(files)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def differing_files() -> list[str]:
    different: list[str] = []
    for relative in mirrored_files():
        source = ROOT / relative
        target = WEBSITE / relative
        if not source.is_file():
            raise FileNotFoundError(f"Canonical file is missing: {source}")
        if not target.is_file() or digest(source) != digest(target):
            different.append(relative)
    return different


def sync() -> list[str]:
    changed = differing_files()
    for relative in changed:
        source = ROOT / relative
        target = WEBSITE / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report drift without changing files",
    )
    args = parser.parse_args()

    changed = differing_files() if args.check else sync()
    if changed:
        action = "Out of sync" if args.check else "Synchronized"
        print(f"{action}: {', '.join(changed)}")
        return 1 if args.check else 0

    print("website/ is identical to the canonical frontend.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
