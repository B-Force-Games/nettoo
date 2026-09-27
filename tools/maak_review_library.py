"""Publiceer de redactionele puzzelselectie met controleerbare vraagreserveringen.

De definitieve selectie is de bron: antwoorden worden niet afgerond om een som
te laten passen. De bestaande FTC-reeks blijft apart beschikbaar bij vervanging.
"""
import argparse
from collections import Counter
import json
from pathlib import Path

from maak_review_dailies import read_js

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'puzzels/library_selectie_20260927.json'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selection', type=Path, default=MANIFEST)
    args = parser.parse_args()
    selection = json.loads(args.selection.read_text(encoding='utf8'))
    daily = json.loads((ROOT / 'puzzels/daily_selectie_20260927.json').read_text(encoding='utf8'))
    data_path = ROOT / 'data/netto_frontend_puzzles.js'
    data = read_js(data_path)
    translations = read_js(ROOT / 'data/netto_bronnen_en.js')
    translations['Bestaande bron opgehaald; het antwoord staat op de pagina.'] = 'See the linked source for the supporting information.'
    puzzles, metadata, seen = [], {}, set()
    levels = Counter(p['difficulty'] for p in selection['puzzles'])
    assert 1 <= len(selection['puzzles']) <= 100
    assert set(levels) == {'easy', 'intermediate', 'hard', 'extremely-hard'}
    assert not set(selection['reserved']).intersection(daily['reserved'])
    for p in selection['puzzles']:
        questions = p['questions']
        assert len(questions) == 3
        assert len({q['category'] for q in questions}) == 3
        assert len({q['unit'] for q in questions}) == 3
        a, b, c = [q['answer'] for q in questions]
        assert all(type(n) is int and 0 < n <= 9007199254740991 for n in (a, b, c))
        assert {'+': a+b == c, '−': a-b == c, '×': a*b == c, '÷': a == b*c}[p['operator']]
        entry = {k: p[k] for k in ('id', 'number', 'operator', 'difficulty', 'difficulty_score')}
        entry.update(name=f"Puzzle #{p['number']}", categories=[q['category'] for q in questions],
                     calculation=f"{a} {p['operator']} {b} = {c}",
                     question_ids=[q['id'] for q in questions], edition=selection['edition'])
        if p.get('photo'):
            assert all(p['photo'].get(k) for k in ('url', 'pagina', 'maker', 'licentie'))
            entry['photo'] = p['photo']
        for i, q in enumerate(questions, 1):
            assert q['status'].startswith('APPROVED') and q['id'] not in seen
            seen.add(q['id'])
            entry[f'q{i}_label'], entry[f'q{i}_answer'] = q['question'], q['answer']
            assert q['question'] not in metadata
            metadata[q['question']] = {
                'id': q['id'], 'original': q['original'], 'unit': q['unit'],
                'subtitle': q.get('subtitle') or '', 'bron': q['source'],
                'uitleg': q['evidence'], 'uitleg_en': translations.get(q['evidence'], q['evidence'])}
        puzzles.append(entry)
    assert len(seen) == 3 * len(puzzles)
    assert [p['number'] for p in puzzles] == list(range(1, len(puzzles) + 1))
    # FTC krijgt niet stilzwijgend andere puzzels of ongeldige voortgang.
    if 'connection' not in data:
        data['connection'] = data['library'] + data.get('reserve', [])
    data.update(library=puzzles, reserve=[], library_edition=selection['edition'], library_review=metadata)
    data_path.write_text('// Gegenereerde puzzels; gecontroleerde reeksen via tools/maak_review_dailies.py en tools/maak_review_library.py.\nwindow.NETTO_REBUILT_PUZZLES = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8')
    if args.selection.resolve() != MANIFEST.resolve():
        MANIFEST.write_text(json.dumps(selection, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(f'{len(puzzles)} puzzels, {dict(levels)}, {len(seen)} unieke goedgekeurde vragen; geen overlap met Dailies.')


if __name__ == '__main__':
    main()
