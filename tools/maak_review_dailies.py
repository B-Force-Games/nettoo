"""Publiceer een gecontroleerde Daily-selectie zonder antwoorden opnieuw te genereren.

De selectie bewaart review-ID's, definitieve tekst, schaal en fotobronnen. Daardoor
komen frontend en SQL altijd uit dezelfde versie en blijven reserveringen traceerbaar.
"""
import argparse
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'puzzels/daily_selectie_20260927.json'
def read_js(path):
    text=path.read_text(encoding='utf-8-sig')
    return json.loads(text[text.index('{'):].strip().rstrip(';'))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selection',type=Path,default=MANIFEST)
    args=parser.parse_args()
    selection=json.loads(args.selection.read_text(encoding='utf8'))
    data_path=ROOT/'data/netto_frontend_puzzles.js'
    data=read_js(data_path)
    translations=read_js(ROOT/'data/netto_bronnen_en.js')
    daily=[];meta={};seen=set()
    for p in selection['puzzles']:
        questions=p['questions']
        assert len(questions)==3 and len({q['category'] for q in questions})==3
        assert len({q['unit'] for q in questions})==3
        a,b,c=[q['answer'] for q in questions]
        assert all(isinstance(n,int) and n>0 for n in (a,b,c))
        assert {'+':a+b,'−':a-b,'×':a*b,'÷':a/b}[p['operator']]==c
        entry={k:p[k] for k in ('id','number','date','operator')}
        entry.update(name=f"Daily #{p['number']}",categories=[q['category'] for q in questions],
                     calculation=f"{a} {p['operator']} {b} = {c}",
                     question_ids=[q['id'] for q in questions],edition=selection['edition'],
                     photo=p['photo'],source_library_id=None)
        for i,q in enumerate(questions,1):
            assert q['id'] not in seen and q['status'].startswith('APPROVED')
            seen.add(q['id'])
            entry[f'q{i}_label']=q['question'];entry[f'q{i}_answer']=q['answer']
            meta[q['question']]={'id':q['id'],'original':q['original'],'unit':q['unit'],
                'subtitle':q['subtitle'] or '', 'bron':q['source'],'uitleg':q['evidence'],
                'uitleg_en':translations.get(q['evidence'],q['evidence'])}
        daily.append(entry)
    assert 20<=len(daily)<=30
    # Oude statische puzzels blijven herstelbaar, maar worden niet meer aangeboden.
    archive=ROOT/'puzzels/dailies_voor_review_20260927.json'
    if not archive.exists():
        archive.write_text(json.dumps(data['daily'],ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    data.update(daily=daily,daily_edition=selection['edition'],daily_review=meta)
    data_path.write_text('// Gegenereerde puzzels; gecontroleerde Dailies via tools/maak_review_dailies.py.\nwindow.NETTO_REBUILT_PUZZLES = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf8')
    if args.selection.resolve()!=MANIFEST.resolve():
        MANIFEST.write_text(json.dumps(selection,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    def sqltext(v): return "'"+str(v).replace("'","''")+"'"
    values=[]
    for p in daily:
        values.append('  ('+', '.join(sqltext(v) for v in [p['id'],p['date'],p['operator'],p['q1_label'],p['q2_label'],p['q3_label']])+', '+', '.join(str(p[f'q{i}_answer']) for i in (1,2,3))+')')
    template=(ROOT/'supabase/review_daily_template.sql').read_text(encoding='utf8')
    sql=template.replace('-- SELECTIE_WAARDEN',',\n'.join(values))
    (ROOT/'supabase/vervang_dailies_20260927.sql').write_text(sql,encoding='utf8')
    print(f"{len(daily)} Dailies, {len(seen)} unieke goedgekeurde vragen; frontend en SQL bijgewerkt.")

if __name__=='__main__':
    main()
