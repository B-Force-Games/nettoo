"""Vervang de FTC-reeks door exclusieve, gecontroleerde puzzels zonder foto's.

Reserveringen voorkomen hergebruik uit Dailies en Puzzles. De selectie bewaart
de definitieve reviewvelden; de antwoorden worden nooit passend gemaakt.
"""
import argparse
import json
from pathlib import Path
from maak_review_dailies import read_js

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'puzzels/connection_selectie_20260927.json'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selection', type=Path, default=MANIFEST)
    args = parser.parse_args()
    selection = json.loads(args.selection.read_text(encoding='utf8'))
    reserved = set()
    for name in ('daily', 'library'):
        previous = json.loads((ROOT / f'puzzels/{name}_selectie_20260927.json').read_text(encoding='utf8'))
        reserved.update(previous['reserved'])
    assert not reserved.intersection(selection['reserved'])
    data_path = ROOT / 'data/netto_frontend_puzzles.js'
    data = read_js(data_path)
    translations = read_js(ROOT / 'data/netto_bronnen_en.js')
    translations['Bestaande bron opgehaald; het antwoord staat op de pagina.'] = 'See the linked source for the supporting information.'
    puzzles, metadata, seen = [], {}, set()
    assert 1 <= len(selection['puzzles']) <= 50
    for number, p in enumerate(selection['puzzles'], 1):
        assert p['number'] == number
        questions = p['questions']
        assert len(questions) == 3
        assert len({q['category'] for q in questions}) == 3
        assert len({q['unit'] for q in questions}) == 3
        a, b, c = [q['answer'] for q in questions]
        assert len({a,b,c}) == 3
        assert all(type(n) is int and 0 < n <= 9007199254740991 for n in (a,b,c))
        assert {'+':a+b==c, '−':a-b==c, '×':a*b==c, '÷':a==b*c}[p['operator']]
        entry = {k:p[k] for k in ('id','number','operator','difficulty','difficulty_score')}
        entry.update(name=f'Find the Connection #{number}', edition=selection['edition'],
                     categories=[q['category'] for q in questions], question_ids=[q['id'] for q in questions],
                     calculation=f"{a} {p['operator']} {b} = {c}")
        for i, q in enumerate(questions, 1):
            assert q['status'].startswith('APPROVED') and q['id'] not in seen
            seen.add(q['id'])
            assert q['question'] not in metadata
            entry[f'q{i}_label'], entry[f'q{i}_answer'] = q['question'], q['answer']
            metadata[q['question']] = {'id':q['id'], 'original':q['original'], 'unit':q['unit'],
                'subtitle':q.get('subtitle') or '', 'bron':q['source'], 'uitleg':q['evidence'],
                'uitleg_en':translations.get(q['evidence'],q['evidence'])}
        puzzles.append(entry)
    # Oude reeksen blijven herstelbaar, maar staan niet meer in de actieve catalogus.
    archive = ROOT / 'puzzels/connections_voor_review_20260927.json'
    if not archive.exists():
        archive.write_text(json.dumps(data.get('connection', []),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    data.update(connection=puzzles, connection_edition=selection['edition'], connection_review=metadata)
    data_path.write_text('// Gegenereerde puzzels; gecontroleerde reeksen via tools/maak_review_*.py.\nwindow.NETTO_REBUILT_PUZZLES = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
    if args.selection.resolve() != MANIFEST.resolve():
        MANIFEST.write_text(json.dumps(selection,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(f'{len(puzzles)} FTC-puzzels, {len(seen)} unieke goedgekeurde vragen, geen foto’s of overlap met andere exclusieve reeksen.')


if __name__ == '__main__':
    main()
