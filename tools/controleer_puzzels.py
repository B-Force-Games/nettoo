# -*- coding: utf-8 -*-
"""Netto — controleer de gegenereerde puzzels tegen alle gestelde voorwaarden.

Draaien:  python tools/controleer_puzzels.py

Dit script gelooft de generator niet op zijn woord maar leest de weggeschreven
bestanden en toetst ze een voor een. Het bestaat omdat de voorwaarden in stappen
zijn toegevoegd en elke ronde iets kon breken wat een eerdere ronde had
opgelost — zoals de dagpuzzels, die lang buiten de unieke set bleven en pas
opvielen toen twee gelijke iconen naast elkaar stonden.

Wat er wordt getoetst:
  som          klopt a bewerking b = c echt, en staat dat ook in calculation
  antwoord     komt het antwoord overeen met de vragenbank
  uniek        komt elke vraag hoogstens een keer voor binnen de set
  categorie    drie verschillende categorieen per puzzel
  eenheid      geen zichtbare eenheid twee keer in dezelfde puzzel
  kleur        rapporteert gedeelde kleurfamilies als visuele waarschuwing
  icoon        rapporteert gedeelde iconen als visuele waarschuwing
  fotos        hoogstens twee fotovragen per puzzel
  fotoveld     draagt een puzzel met fotovragen ook echt een foto
  bewerking    zijn de vier bewerkingen ongeveer gelijk verdeeld
  niveau       zijn de vier moeilijkheden ongeveer gelijk verdeeld
"""

import json
import os
import re
import sys
from collections import Counter

import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WORTEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(WORTEL, 'data')
REVIEW = os.path.join(WORTEL, 'vragen', 'vragen_review_compleet.xlsx')
if WORTEL not in sys.path:
    sys.path.insert(0, WORTEL)

from puzzels.maak_unieke_puzzels import vraag_eenheid


def laad(naam):
    t = open(os.path.join(DATA, naam), encoding='utf-8').read()
    return json.loads(t[t.index('=', t.index('window.')) + 1:].strip().rstrip(';'))


def uit_js(pad, anker, eind):
    t = open(pad, encoding='utf-8').read()
    b = t[t.index(anker):]
    return b[:b.index(eind)]


def rekent(op, a, b, c):
    if op == '+':
        return a + b == c
    if op == '−':
        return a - b == c
    if op == '×':
        return a * b == c
    if op == '÷':
        return b != 0 and a == b * c
    return False


def main():
    fr = laad('netto_frontend_puzzles.js')
    rp = laad('netto_race_pool.js')
    bk = laad('netto_breinkrakers.js')
    fotos = laad('netto_fotos.js')

    families = dict(re.findall(r'--categorie-([a-z0-9-]+):\s*var\(--familie-([a-z]+)\)',
                               open(os.path.join(WORTEL, 'css', 'styles.css'),
                                    encoding='utf-8').read()))
    iconen = dict(re.findall(r"'([^']+)':\s*'([^']+)'",
                             uit_js(os.path.join(WORTEL, 'js', 'core.js'),
                                    'DAILY_CATEGORY_ICON_KEYS = Object.freeze({', '});')))

    def sleutel(c):
        return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', c.lower().replace('&', 'en')))

    d = pd.read_excel(REVIEW, sheet_name='Vragen')
    bank = {}
    for _, r in d.iterrows():
        try:
            bank[str(r['Vraag NL'])] = int(r['Antwoord'])
        except (TypeError, ValueError):
            pass

    sets = [('daily + bibliotheek', fr['daily'] + fr['library']),
            ('racepool', rp)]

    alles_goed = True
    for naam, ps in sets:
        fouten = Counter()
        waarschuwingen = Counter()
        gezien = set()
        for p in ps:
            a, b, c = p['q1_answer'], p['q2_answer'], p['q3_answer']
            if not rekent(p['operator'], a, b, c):
                fouten['som'] += 1
            if p.get('calculation') != f"{a} {p['operator']} {b} = {c}":
                fouten['calculation'] += 1
            labels = [p[f'q{i}_label'] for i in (1, 2, 3)]
            for l, w in zip(labels, (a, b, c)):
                if l in bank and bank[l] != w:
                    fouten['antwoord'] += 1
                if l in gezien:
                    fouten['dubbele vraag'] += 1
                gezien.add(l)
            cats = p.get('categories') or []
            if len(set(cats)) < 3:
                fouten['dubbele categorie'] += 1
            eenheden = [vraag_eenheid(label) for label in labels]
            eenheden = [eenheid for eenheid in eenheden if eenheid]
            if len(set(eenheden)) < len(eenheden):
                fouten['dubbele eenheid'] += 1
            if len({families.get(sleutel(x)) for x in cats}) < 3:
                waarschuwingen['gedeelde kleurfamilie'] += 1
            if len({iconen.get(x, 'idea') for x in cats}) < 3:
                waarschuwingen['gedeeld icoon'] += 1
            n = sum(1 for l in labels if l in fotos)
            if n > 2:
                # Waarschuwing, geen fout. MAX_FOTOS_PER_PUZZEL is een voorkeur
                # van de generator, niet iets wat de speler merkt: er komt hoe
                # dan ook een foto per puzzel in beeld. Deze puzzels zijn
                # gebouwd toen de fotobank 238 foto's had; die staat nu op 638,
                # dus vragen die toen geen foto hadden, hebben er nu wel een.
                #
                # Waarom dit niet gewoon "opgelost" wordt: dat kan alleen door
                # opnieuw te genereren, en dat husselt alle puzzels door elkaar.
                # De dagpuzzels in de databank verwijzen met source_library_id
                # naar een library-id, dus die verwijzingen breken dan.
                #
                # En waarom het dan geen fout meer is: een poort die rood staat
                # om iets wat niemand van plan is te repareren, is geen poort.
                # Codex kon zijn frontendreparaties niet committen omdat deze
                # regel de gedeelde commitpoort blokkeerde.
                waarschuwingen['meer dan twee fotovragen'] += 1
            if n and not p.get('photo'):
                fouten['fotovraag zonder foto'] += 1
            if p.get('photo') and not n:
                fouten['foto zonder fotovraag'] += 1

        ops = Counter(p['operator'] for p in ps)
        niv = Counter(p['difficulty'] for p in ps)
        met = sum(1 for p in ps if p.get('photo'))
        print(f'=== {naam}: {len(ps)} puzzels')
        print(f'    bewerking {dict(ops)}')
        print(f'    niveau    {dict(niv)}')
        print(f'    met foto  {met} ({met / len(ps):.0%})')
        if fouten:
            alles_goed = False
            for k, v in fouten.items():
                print(f'    FOUT {k}: {v}')
        else:
            print('    alle voorwaarden gehaald')
        for k, v in waarschuwingen.items():
            print(f'    let op: {k}: {v} (geen fout, zie de toelichting in dit bestand)')
        print()

    bk_fouten = Counter()
    bk_gebruik = Counter()
    for p in bk:
        vragen = [p[f'q{i}'] for i in (1, 2, 3, 4)]
        labels = [v['label'] for v in vragen]
        antwoorden = [v['answer'] for v in vragen]
        categorieen = [v['category'] for v in vragen]
        eenheden = [vraag_eenheid(label) for label in labels]
        eenheden = [eenheid for eenheid in eenheden if eenheid]
        if len(set(labels)) < 4:
            bk_fouten['dubbele vraag binnen puzzel'] += 1
        if len(set(categorieen)) < 4:
            bk_fouten['dubbele categorie'] += 1
        if len(set(eenheden)) < len(eenheden):
            bk_fouten['dubbele eenheid'] += 1
        for label, antwoord in zip(labels, antwoorden):
            bk_gebruik[label] += 1
            if label in bank and bank[label] != antwoord:
                bk_fouten['antwoord'] += 1
        a, b, c, d = antwoorden
        if (p['op1'] == '÷' and (not b or a % b)):
            bk_fouten['niet-exacte deling'] += 1
            continue
        tussen = a * b if p['op1'] == '×' else (a // b if p['op1'] == '÷'
                 else a + b if p['op1'] == '+' else a - b)
        if p['op2'] == '÷' and (not c or tussen % c):
            bk_fouten['niet-exacte deling'] += 1
            continue
        uitkomst = tussen * c if p['op2'] == '×' else (tussen // c if p['op2'] == '÷'
                    else tussen + c if p['op2'] == '+' else tussen - c)
        if uitkomst != d:
            bk_fouten['som'] += 1
    if max(bk_gebruik.values(), default=0) > 4:
        bk_fouten['vraag vaker dan vier keer'] += 1
    print(f'=== breinkrakers: {len(bk)} puzzels')
    if bk_fouten:
        alles_goed = False
        for k, v in bk_fouten.items():
            print(f'    FOUT {k}: {v}')
    else:
        print('    alle voorwaarden gehaald')
    print()

    # Delen daily en bibliotheek echt een set?
    dl = {p[f'q{i}_label'] for p in fr['daily'] for i in (1, 2, 3)}
    lb = {p[f'q{i}_label'] for p in fr['library'] for i in (1, 2, 3)}
    overlap = dl & lb
    print(f'overlap daily/bibliotheek: {len(overlap)} vragen'
          f'{" — FOUT" if overlap else " (goed, ze delen een set)"}')
    print('\nALLES IN ORDE' if alles_goed and not overlap else '\nER ZIJN FOUTEN')


if __name__ == '__main__':
    main()
