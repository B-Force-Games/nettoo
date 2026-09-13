# -*- coding: utf-8 -*-
"""Netto — bouw puzzelsets waarin elke vraag hoogstens een keer voorkomt.

Draaien:
    python puzzels/maak_unieke_puzzels.py --doel puzzels
    python puzzels/maak_unieke_puzzels.py --doel race

DE HARDE EIS
Binnen een set komt elke vraag precies een keer voor, of helemaal niet. Met
1409 vragen en drie vragen per puzzel ligt het plafond dus op 469 puzzels per
set. Dat is geen keuze van dit script maar rekenkunde.

"Puzzels" en "Daily Archive" delen een set: wat je in de bibliotheek tegenkomt
verschijnt niet nog eens in een dagpuzzel. Race krijgt een eigen set, apart
gegenereerd, zodat een vraag daar opnieuw gebruikt mag worden — de speler
ervaart die modi als losse dingen. Binnen een race blijft elke vraag uniek.

WAAROM NIET GEWOON GRETIG PAKKEN
Wie steeds de eerst passende combinatie neemt, houdt aan het eind vragen over
die nergens meer in passen: alle partners zijn dan al opgebruikt. Daarom kiest
dit script telkens de vraag met de mínste overgebleven mogelijkheden. Dat is de
gebruikelijke manier om stranden te voorkomen en levert in de praktijk enkele
tientallen puzzels meer op.

MOEILIJKHEID
De score telt drie dingen op:
  - de bewerking      optellen is makkelijker dan delen
  - de grootte        grote getallen zijn lastiger te schatten (logaritmisch,
                      want van 10 naar 100 scheelt meer dan van 1000 naar 1090)
  - de rondheid       1000 schat je makkelijker dan 1037, dus elke nul aan het
                      eind maakt een getal makkelijker

De grenzen tussen de vier niveaus worden niet vast gekozen maar afgeleid uit de
verdeling van alle gevonden combinaties. Daardoor komt er per niveau ongeveer
evenveel uit, wat de eis was. De makkelijkste tien procent valt af, zodat de set
niet volloopt met sommen als 2 + 2 = 4.
"""

import argparse
import json
import math
import os
import re
import random
import sys
from collections import Counter, defaultdict

import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WORTEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REVIEW = os.path.join(WORTEL, 'vragen', 'vragen_review_compleet.xlsx')
DATA = os.path.join(WORTEL, 'data')
SPIEGEL = os.path.join(WORTEL, 'website', 'data')

STIJL = os.path.join(WORTEL, 'css', 'styles.css')
KERN = os.path.join(WORTEL, 'js', 'core.js')
FOTOS = os.path.join(WORTEL, 'fotos')
MAX_FOTOS_PER_PUZZEL = 2

OPERATORS = ('+', '−', '×', '÷')
OPERATOR_GEWICHT = {'+': 0.0, '−': 8.0, '×': 14.0, '÷': 18.0}
NIVEAUS = ('easy', 'intermediate', 'hard', 'extremely-hard')

# Dit is dezelfde vraagontleding als de frontend gebruikt. Een puzzel met twee
# keer "jaar" of "landen" voelt ook met verschillende onderwerpen herhaald.
# Daarom is de zichtbare eenheid, niet alleen de categorie, een harde eis bij
# het combineren. Context zoals "bezoekers per jaar" telt bewust niet als jaar.
VRAAG_EENHEDEN = (
    (r'vierkante kilometers?|km[²2]', 'km²'),
    (r'vierkante meters?|m[²2]', 'm²'),
    (r'vierkante centimeters?|cm[²2]', 'cm²'),
    (r'kubieke meters?|m[³3]', 'm³'),
    (r'kubieke centimeters?|cm[³3]', 'cm³'),
    (r'kilometers? per uur|km/[uh]', 'km/u'),
    (r'kilometers? per seconde|km/s', 'km/s'),
    (r'meters? per seconde|m/s', 'm/s'),
    (r'graden? celsius|°c', '°C'),
    (r'graden? fahrenheit|°f', '°F'),
    (r'millimeters?|mm', 'mm'), (r'centimeters?|cm', 'cm'),
    (r'decimeters?|dm', 'dm'), (r'kilometers?|km', 'km'),
    (r'meters?|m', 'm'), (r'milligram(?:men)?|mg', 'mg'),
    (r'kilogram(?:men)?|kg', 'kg'), (r'gram(?:men)?|g', 'g'),
    (r'ton(?:nen)?', 'ton'), (r'milliliters?|ml', 'ml'),
    (r'centiliters?|cl', 'cl'), (r'liters?|l', 'liter'),
    (r'hectares?|ha', 'ha'), (r'procent(?:en)?', '%'),
    (r'graden?', 'graden'), (r'seconden?', 'sec'),
    (r'minu(?:ut|ten)', 'min'), (r'u(?:ur|ren)', 'uur'),
    (r'da(?:g|gen)', 'dagen'), (r'we(?:ek|ken)', 'weken'),
    (r'maanden?', 'maanden'), (r'ja(?:ar|ren)', 'jaar'),
    (r'eeuw(?:en)?', 'eeuwen'), (r"euro(?:s|’s|'s)?", 'euro'),
    (r'dollars?', 'dollar'),
)
TEL_OVERSLAAN = {
    'verschillende', 'officiele', 'officiële', 'individuele', 'erkende',
    'bekende', 'gepubliceerde', 'complete', 'standaard', 'totale', 'unieke',
    'actieve', 'echte', 'grote', 'kleine', 'afzonderlijke', 'belangrijkste',
    'centrale', 'natuurlijke', 'zware', 'gewone', 'huidige', 'oorspronkelijke',
}
TEL_GEEN = {'van', 'de', 'het', 'een', 'er', 'is', 'zijn', 'in', 'op', 'procent'}
TEL_SCHAAL = {
    'duizend': '× 1.000', 'miljoen': '× 1.000.000',
    'miljard': '× 1.000.000.000', 'biljoen': '× 1.000.000.000.000',
}


def vraag_eenheid(vraag):
    """Leid de eenheid af die de speler naast het invoerveld ziet."""
    tekst = ' '.join(str(vraag or '').lower().split())
    schaal = r'(?:(duizend|miljoen|miljard) )?'
    for begin in (r'\bin\s+', r'\bhoeveel\s+'):
        for patroon, label in VRAAG_EENHEDEN:
            treffer = re.search(begin + schaal + r'(?:' + patroon + r')(?![\w/])',
                                tekst)
            if treffer:
                return ((treffer.group(1) + ' ') if treffer.group(1) else '') + label
    if re.search(r'\bwelk percentage\b', tekst):
        return '%'
    if re.match(r'^in welk jaar\b', tekst):
        return 'jaar'

    treffer = re.search(r'\bhoeveel\s+(.+)', tekst)
    if not treffer:
        return None
    woorden = re.findall(r"[^\W\d_']+(?:'[^\W\d_]+)?", treffer.group(1), re.UNICODE)
    index = 0
    voorvoegsel = ''
    if woorden and woorden[0] in TEL_SCHAAL:
        voorvoegsel = TEL_SCHAAL[woorden[0]] + ' '
        index = 1
    while index < len(woorden) and woorden[index] in TEL_OVERSLAAN:
        index += 1
    woord = woorden[index] if index < len(woorden) else None
    if not woord or woord in TEL_GEEN:
        return voorvoegsel.strip() or None
    if len(woord) > 14:
        return voorvoegsel.strip() or None
    return voorvoegsel + woord


def kleurfamilies():
    """Leest uit de stylesheet welke categorie welke kleurfamilie krijgt.

    De frontend geeft elke vraagkaart een tint op basis van de categorie, maar
    29 categorieen delen 8 kleurfamilies. Drie verschillende categorieen in een
    puzzel kunnen dus twee keer dezelfde kleur opleveren, en dat gebeurde bij 28
    procent van de puzzels. De stylesheet is de enige plek waar die koppeling
    staat, dus die wordt hier gelezen in plaats van overgeschreven — anders
    lopen de twee stilletjes uiteen zodra iemand een kleur verandert.
    """
    uit = {}
    with open(STIJL, encoding='utf-8') as f:
        for regel in f:
            m = re.match(r"\s*--categorie-([a-z0-9-]+):\s*var\(--familie-([a-z]+)\)", regel)
            if m:
                uit[m.group(1)] = m.group(2)
    return uit


def fotos_per_vraag():
    """Foto per vraagtekst, gelezen uit data/netto_fotos.js.

    Dat bestand is de enige plek waar wordt beslist welke foto bij een vraag
    hoort — inclusief de handmatige keuzes uit fotokeuze.xlsx. De generator
    kiest dus niet zelf, want dan zouden de twee uiteenlopen zodra jij een rij
    invult.

    Drie foto's in een puzzel is zonde: dan hangen ze bij elkaar terwijl een
    andere puzzel er geen heeft. Twee is het plafond, en bij het vullen krijgt
    een puzzel zonder foto voorrang. Zo raken de 385 foto's over zo veel
    mogelijk puzzels verspreid in plaats van opgehoopt.
    """
    pad = os.path.join(DATA, 'netto_fotos.js')
    if not os.path.exists(pad):
        print('let op: data/netto_fotos.js ontbreekt — draai eerst '
              'tools/maak_fotobestand.py')
        return {}
    ruw = open(pad, encoding='utf-8').read()
    return json.loads(ruw[ruw.index('=', ruw.index('window.')) + 1:].strip().rstrip(';'))


def iconen():
    """Categorie naar icoonnaam, gelezen uit js/core.js.

    Negenentwintig categorieen delen zesentwintig iconen: Kunst en Mode delen
    het palet, Landbouw en Merken de fabriek, Records en Economie de grafiek.
    Twee gelijke iconen naast elkaar op het landingsscherm ziet er net zo
    slordig uit als twee gelijke kleuren, dus dit telt als aparte eis.
    """
    tekst = open(KERN, encoding='utf-8').read()
    begin = tekst.index('DAILY_CATEGORY_ICON_KEYS = Object.freeze({')
    blok = tekst[begin:tekst.index('});', begin)]
    return dict(re.findall(r"'([^']+)':\s*'([^']+)'", blok))


def categoriesleutel(categorie):
    """Zelfde omzetting als categorieKleurVariabele in js/core.js."""
    s = categorie.lower().replace('&', 'en')
    return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', s))


def rondheid(n):
    """Aantal nullen aan het eind, tot maximaal drie.

    1000 telt als drie, 250 als een, 1037 als nul. Ronde getallen zijn
    makkelijker te schatten en verlagen daarom de score.
    """
    if n == 0:
        return 0
    t = 0
    while n % 10 == 0 and t < 3:
        n //= 10
        t += 1
    return t


def score_van(operator, antwoorden):
    grootte = sum(math.log10(abs(a) + 1.0) * 10.0 for a in antwoorden)
    rond = sum(rondheid(a) * 4.0 for a in antwoorden)
    return round(OPERATOR_GEWICHT[operator] + grootte - rond, 2)


def lees_vragen():
    d = pd.read_excel(REVIEW, sheet_name='Vragen')
    vragen = []
    for _, r in d.iterrows():
        try:
            a = int(r['Antwoord'])
        except (TypeError, ValueError):
            continue
        # Nul en een leveren lege sommen op: b x 1 = b laat niets te rekenen
        # over. Ze blijven wel in de bank, maar niet als puzzelvraag.
        if a < 2:
            continue
        vragen.append({'nr': int(r['Nr']), 'antwoord': a,
                       'categorie': str(r['Categorie']),
                       'tekst': str(r['Vraag NL']),
                       'eenheid': vraag_eenheid(r['Vraag NL'])})
    return vragen


def waardedrietallen(waarden):
    """Alle (operator, a, b, c) op waardeniveau, met a op b = c."""
    vs = set(waarden)
    uit = []
    for a in waarden:
        for b in waarden:
            if a + b in vs:
                uit.append(('+', a, b, a + b))
            if a > b and a - b in vs:
                uit.append(('−', a, b, a - b))
            if a * b in vs:
                uit.append(('×', a, b, a * b))
            if b and a % b == 0 and a // b in vs:
                uit.append(('÷', a, b, a // b))
    return uit


def bouw(vragen, doel_aantal, seed, quota=10**9):
    rng = random.Random(seed)
    families = kleurfamilies()
    icoon = iconen()
    for q in vragen:
        # Kleur en icoon blijven beschikbaar voor de rapportage. Voor het
        # combineren is de inhoudelijke categorie leidend: twee verschillende
        # categorieen mogen bewust dezelfde kleurfamilie delen. Dat voorkomt
        # dat een visuele groepering onnodig tientallen goede puzzels kost.
        q['familie'] = (families.get(categoriesleutel(q['categorie']), q['categorie']),
                        icoon.get(q['categorie'], 'idea'))
    met_foto = fotos_per_vraag()
    for q in vragen:
        q['fotogegevens'] = met_foto.get(q['tekst'])
        q['foto'] = q['fotogegevens'] is not None
    per_waarde = defaultdict(list)
    for i, q in enumerate(vragen):
        per_waarde[q['antwoord']].append(i)
    waarden = sorted(per_waarde)

    drietallen = waardedrietallen(waarden)
    scores = sorted(score_van(op, (a, b, c)) for op, a, b, c in drietallen)
    # De makkelijkste drie procent valt af. Dat is gemeten: bij tien procent
    # kost de ondergrens bijna honderd puzzels, bij drie procent nog maar
    # veertig, terwijl het echte afval — 2 + 3 = 5 — er wel buiten blijft. De
    # makkelijkste som die zo binnenkomt is 2 x 15 = 30, en dat is nog een som.
    ondergrens = scores[int(len(scores) * 0.03)]
    grenzen = [scores[int(len(scores) * f)] for f in (0.325, 0.55, 0.775)]

    def niveau_van(s):
        if s < grenzen[0]:
            return 'easy'
        if s < grenzen[1]:
            return 'intermediate'
        if s < grenzen[2]:
            return 'hard'
        return 'extremely-hard'

    # Per vakje (bewerking x niveau) de bruikbare drietallen verzamelen.
    vakjes = {(op, n): [] for op in OPERATORS for n in NIVEAUS}
    for op, a, b, c in drietallen:
        s = score_van(op, (a, b, c))
        if s < ondergrens:
            continue
        vakjes[(op, niveau_van(s))].append((a, b, c, s))
    vrij = {i for i in range(len(vragen))}
    beschikbaar = {w: len(per_waarde[w]) for w in waarden}

    # Schaarste eerst. Van de 493 antwoordwaarden worden er 334 door maar een
    # vraag gedekt; zo'n waarde verdwijnt zodra die ene vraag elders belandt.
    # Door drietallen met een schaarse waarde vooraan te zetten worden ze
    # gebruikt terwijl hun partners nog bestaan. Dat scheelde bij het uitproberen
    # ruim twintig puzzels ten opzichte van een willekeurige volgorde, en gaf
    # bovendien de gelijkmatigste verdeling over de vier niveaus.
    for lijst in vakjes.values():
        rng.shuffle(lijst)
        lijst.sort(key=lambda t: -min(beschikbaar[t[0]], beschikbaar[t[1]],
                                      beschikbaar[t[2]]))

    def opties_voor(waarde, verboden_cats, verboden_eenheden, gebruikt, fotos_al):
        """Geef vrije vragen met verse visuele kenmerken en een verse eenheid.

        Bij gelijke geschiktheid wint de vraag die de fotoverdeling het beste
        dient: zolang de puzzel er nog geen heeft telt een foto als pluspunt, en
        bij twee foto's vallen de fotovragen af.

        De categorie-eis is hard: drie vragen uit dezelfde puzzel horen uit drie
        verschillende categorieen te komen. Bij het uitproberen bleek dat maar
        zes puzzels te kosten, tegenover eenenveertig puzzels die anders een
        dubbele categorie kregen. Die ruil is de moeite waard, dus valt een
        drietal af zodra een van de drie waarden geen verse categorie meer heeft.
        """
        opties = [i for i in per_waarde[waarde]
                  if i in vrij and i not in gebruikt
                  and vragen[i]['categorie'] not in verboden_cats
                  and (not vragen[i]['eenheid']
                       or vragen[i]['eenheid'] not in verboden_eenheden)]
        if fotos_al >= MAX_FOTOS_PER_PUZZEL:
            # Hard: liever een puzzel minder dan drie foto's op een hoop. De
            # uitwijk "neem dan toch maar een fotovraag" liet er dertien door.
            opties = [i for i in opties if not vragen[i]['foto']]
        elif fotos_al == 0:
            opties.sort(key=lambda i: not vragen[i]['foto'])
        return opties

    def kies_combinatie(waarden):
        """Zoek binnen één rekendrietal naar een geldige vragencombinatie.

        De oude versie koos voor iedere antwoordwaarde meteen de eerste vraag.
        Als die toevallig dezelfde eenheid had als een latere vraag, viel het
        hele rekendrietal af terwijl een tweede kandidaat wel paste. Met drie
        posities is volledige backtracking klein genoeg en voorkomt het dat de
        nieuwe eenhedenregel tientallen onnodige puzzels kost.
        """
        def zoek(positie, gebruikt, cats, eenheden, fotos):
            if positie == len(waarden):
                return []
            for index in opties_voor(waarden[positie], cats, eenheden,
                                     gebruikt, fotos):
                vraag = vragen[index]
                vervolg = zoek(
                    positie + 1,
                    gebruikt | {index},
                    cats | {vraag['categorie']},
                    eenheden | ({vraag['eenheid']} if vraag['eenheid'] else set()),
                    fotos + (1 if vraag['foto'] else 0),
                )
                if vervolg is not None:
                    return [index] + vervolg
            return None

        return zoek(0, set(), set(), set(), 0)

    puzzels = []
    volgorde = [(op, n) for n in NIVEAUS for op in OPERATORS]
    leeg = set()
    per_niveau = Counter()
    while len(puzzels) < doel_aantal and len(leeg) < len(volgorde):
        for cel in volgorde:
            if len(puzzels) >= doel_aantal:
                break
            # Een vol niveau telt als leeg. Zonder dat blijft de buitenste lus
            # doordraaien zolang er ergens nog een vakje open is, en wordt een
            # vol vakje elke ronde opnieuw doorzocht. Bij een plafond van 85 zit
            # easy al vroeg vol en liep het script daar eindeloos langs; de
            # eerste poging draaide daardoor twintig minuten zonder resultaat.
            if per_niveau[cel[1]] >= quota:
                leeg.add(cel)
            if cel in leeg:
                continue
            gevonden = None
            lijst = vakjes[cel]
            for idx in range(len(lijst) - 1, -1, -1):
                a, b, c, s = lijst[idx]
                if min(beschikbaar[a], beschikbaar[b], beschikbaar[c]) < 1:
                    lijst.pop(idx)
                    continue
                keuze = kies_combinatie((a, b, c))
                if keuze is None:
                    lijst.pop(idx)
                    continue
                gevonden = (keuze, a, b, c, s)
                lijst.pop(idx)
                break
            if gevonden is None:
                leeg.add(cel)
                continue
            keuze, a, b, c, s = gevonden
            per_niveau[cel[1]] += 1
            for i in keuze:
                vrij.discard(i)
                beschikbaar[vragen[i]['antwoord']] -= 1
            gekozen_vragen = [vragen[i] for i in keuze]
            # Heeft de puzzel twee fotovragen, dan wordt er een geloot. Met de
            # rng van deze run, zodat dezelfde seed dezelfde foto oplevert.
            kandidaten = [(n, q['fotogegevens'])
                          for n, q in enumerate(gekozen_vragen, start=1)
                          if q['fotogegevens']]
            plek, bron = rng.choice(kandidaten) if kandidaten else (None, None)
            puzzels.append({'op': cel[0], 'niveau': cel[1], 'score': s,
                            'vragen': gekozen_vragen, 'waarden': (a, b, c),
                            'foto': dict(bron, vraag=plek) if bron else None})
    return puzzels, grenzen, ondergrens


def als_puzzel(p, nr, prefix):
    q1, q2, q3 = p['vragen']
    a, b, c = p['waarden']
    return {
        'id': f'{prefix}-{nr:03d}', 'number': nr, 'name': f'Puzzel #{nr}',
        'operator': p['op'],
        'q1_label': q1['tekst'], 'q1_answer': a,
        'q2_label': q2['tekst'], 'q2_answer': b,
        'q3_label': q3['tekst'], 'q3_answer': c,
        'calculation': f"{a} {p['op']} {b} = {c}",
        'categories': [q1['categorie'], q2['categorie'], q3['categorie']],
        'difficulty': p['niveau'], 'difficulty_score': p['score'],
        **({'photo': p['foto']} if p.get('foto') else {}),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--doel', choices=['puzzels', 'race'], default='puzzels')
    ap.add_argument('--aantal', type=int, default=469)
    ap.add_argument('--seed', type=int, default=None)
    ap.add_argument('--quota', type=int, default=85,
                    help='hoogstens zoveel puzzels per moeilijkheidsniveau')
    ap.add_argument('--schrijf', action='store_true')
    args = ap.parse_args()

    seed = args.seed if args.seed is not None else (7 if args.doel == 'puzzels' else 91)
    vragen = lees_vragen()
    print(f'vragen bruikbaar als puzzelvraag: {len(vragen)}')
    print(f'plafond bij drie per puzzel: {len(vragen) // 3}\n')

    # Zonder plafond loopt easy door als de moeilijke vakjes al leeg zijn, en
    # wordt dat niveau bijna drie keer zo groot als extremely-hard. Een vast
    # plafond per niveau houdt de vier bij elkaar. Het is bewust een instelling
    # en geen tweede rekenronde: dat laatste verdubbelde de looptijd tot boven
    # het kwartier, en dat is te duur voor een getal dat je ook kunt kiezen.
    puzzels, grenzen, ondergrens = bouw(vragen, args.aantal, seed, args.quota)
    print(f'plafond per niveau: {args.quota}')
    print(f'gebouwd: {len(puzzels)} puzzels')
    print(f'vragen gebruikt: {len(puzzels) * 3} van {len(vragen)}')
    print(f'ondergrens score {ondergrens} | niveaugrenzen {grenzen}\n')
    print('per bewerking :', dict(Counter(p['op'] for p in puzzels)))
    print('per niveau    :', dict(Counter(p['niveau'] for p in puzzels)))
    dubbel_cat = sum(1 for p in puzzels
                     if len({q['categorie'] for q in p['vragen']}) < 3)
    dubbel_kleur = sum(1 for p in puzzels
                       if len({q['familie'][0] for q in p['vragen']}) < 3)
    dubbel_icoon = sum(1 for p in puzzels
                       if len({q['familie'][1] for q in p['vragen']}) < 3)
    dubbel_eenheid = sum(1 for p in puzzels
                         if len([q['eenheid'] for q in p['vragen'] if q['eenheid']])
                         != len({q['eenheid'] for q in p['vragen'] if q['eenheid']}))
    print(f'puzzels met een dubbele categorie: {dubbel_cat}')
    print(f'puzzels met een dubbele kleur    : {dubbel_kleur}')
    print(f'puzzels met een dubbel icoon     : {dubbel_icoon}')
    print(f'puzzels met een dubbele eenheid  : {dubbel_eenheid}')
    fv = Counter(sum(1 for q in p['vragen'] if q['foto']) for p in puzzels)
    met = len(puzzels) - fv[0]
    print(f'puzzels met minstens een foto    : {met} van {len(puzzels)} '
          f'({met / max(1, len(puzzels)):.0%})')
    print(f'fotos per puzzel                 : {dict(sorted(fv.items()))}')

    alle = [q['nr'] for p in puzzels for q in p['vragen']]
    assert len(alle) == len(set(alle)), 'een vraag komt twee keer voor'
    assert dubbel_cat == dubbel_eenheid == 0
    print('controle: elke vraag hoogstens een keer — in orde')

    if not args.schrijf:
        print('\n(proefdraai — voeg --schrijf toe om op te slaan)')
        return

    if args.doel == 'race':
        lijst = [als_puzzel(p, i, 'pool') for i, p in enumerate(puzzels, start=1)]
        schrijf_bestand('netto_race_pool.js', 'NETTO_RACE_POOL', lijst, args.doel)
        return

    # Bibliotheek en dagpuzzels delen een set, dus ze komen uit dezelfde ronde:
    # de eerste puzzels worden dagpuzzels en houden hun bestaande datum, de rest
    # vult de bibliotheek. Zo komt geen vraag in allebei voor, en gelden voor de
    # dagpuzzels dezelfde eisen — de oude set had negen van de vijfendertig met
    # twee gelijke iconen omdat hij nooit opnieuw gebouwd was.
    pad = os.path.join(DATA, 'netto_frontend_puzzles.js')
    ruw = open(pad, encoding='utf-8').read()
    bestaand = json.loads(ruw[ruw.index('=', ruw.index('window.')) + 1:].strip().rstrip(';'))
    # Oplopend op datum nummeren. De frontend leest het nummer niet uit dit
    # bestand maar rekent het uit als dagverschil met de eerste dagpuzzel die
    # een datum en nummer heeft. Nummer 1 op de nieuwste datum leverde daardoor
    # #0 en #-1 op voor de dagen ervoor. De lijst staat aflopend op datum, dus
    # hij moet eerst omgekeerd worden.
    datums = sorted(d['date'] for d in bestaand.get('daily', []) if d.get('date'))

    dagpuzzels = []
    for i, (datum, p) in enumerate(zip(datums, puzzels), start=1):
        dp = als_puzzel(p, i, 'daily')
        dp['date'] = datum
        dp['source_library_id'] = None
        dagpuzzels.append(dp)
    # Terug in de volgorde die de frontend verwacht: nieuwste eerst.
    dagpuzzels.reverse()
    bestaand['daily'] = dagpuzzels
    bestaand['library'] = [als_puzzel(p, i, 'library')
                           for i, p in enumerate(puzzels[len(dagpuzzels):], start=1)]
    bestaand['race'] = []
    print(f'dagpuzzels opnieuw gebouwd: {len(dagpuzzels)}')
    print(f'bibliotheek: {len(bestaand["library"])}')

    schrijf_bestand('netto_frontend_puzzles.js', 'NETTO_REBUILT_PUZZLES',
                    bestaand, args.doel)
    # Deze regel meldde eerder "dagpuzzels ongemoeid gelaten" en telde daarbij
    # de zojuist vervangen lijst. Dat was overgebleven uit de tijd dat het
    # archief met rust werd gelaten; nu wordt het meegebouwd.
    print(f"datums hergebruikt: {datums[0]} t/m {datums[-1]}" if datums else 'geen datums gevonden')


def schrijf_bestand(naam, globale, inhoud, doel):
    kop = ('// Netto — unieke puzzels: elke vraag komt binnen deze set hoogstens\n'
           '// een keer voor.\n'
           f'// Gegenereerd door puzzels/maak_unieke_puzzels.py --doel {doel}\n'
           f'window.{globale} = ')
    tekst = kop + json.dumps(inhoud, ensure_ascii=False) + ';\n'
    for map_ in (DATA, SPIEGEL):
        with open(os.path.join(map_, naam), 'w', encoding='utf-8') as f:
            f.write(tekst)
    print(f'\n-> data/{naam} (en de spiegel)')


if __name__ == '__main__':
    main()
