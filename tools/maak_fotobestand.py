# -*- coding: utf-8 -*-
"""Netto — koppel foto's aan vragen en schrijf ze weg voor de frontend.

Draaien:  python tools/maak_fotobestand.py

WELKE FOTO EEN VRAAG KRIJGT
  1. Jouw keuze in vragen/fotokeuze.xlsx, kolom "Keuze". Een 1, 2 of 3 wijst een
     van de getoonde kandidaten aan; een 0 betekent dat je ze alle drie hebt
     afgekeurd en dat de vraag geen foto krijgt.
  2. Anders: de hoofdafbeelding uit de infobox van het bronartikel, en verder
     niets.

Dat "en verder niets" is een besluit, geen tekortkoming. De infoboxfoto klopt
per definitie, want hij hoort bij het artikel waar het antwoord vandaan komt.
Alle andere kandidaten worden geraden — uit de vraagtekst of uit een tekstzoek-
opdracht op Commons — en zitten er ongeveer drie van de tien keer naast. Dat
leverde een negentiende-eeuwse cola-advertentie bij een vraag over een blikje,
en een Maya-god bij een vraag over de negen Muzen.

Die geraden kandidaten verdwijnen niet: ze staan in het keuzeblad en wachten op
een mens. Zolang die keuze er niet is heeft de vraag geen foto, en dat is beter
dan een verkeerde.

WAT ERUIT KOMT
data/netto_fotos.js met per vraagtekst het adres van de afbeelding, de
Commons-bestandspagina, de licentie en de maker. Die laatste twee zijn nodig
voor de naamsvermelding: CC BY en CC BY-SA eisen dat, en zonder die gegevens is
achteraf niet meer na te gaan van wie een foto is.
"""

import json
import os
import re
import sys
import unicodedata
import urllib.parse

import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WORTEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REVIEW = os.path.join(WORTEL, 'vragen', 'vragen_review_compleet.xlsx')
KEUZE = os.path.join(WORTEL, 'vragen', 'fotokeuze.xlsx')
FOTOS = os.path.join(WORTEL, 'fotos')
DATA = os.path.join(WORTEL, 'data')
SPIEGEL = os.path.join(WORTEL, 'website', 'data')


def woorden(tekst):
    kaal = ''.join(c for c in unicodedata.normalize('NFD', tekst)
                   if unicodedata.category(c) != 'Mn').lower()
    return set(re.findall(r'[a-z]{4,}', kaal))


# Bestandsnamen die een beeld aankondigen dat je niet naast een schatvraag
# wilt. De zoekronde vond bij een vraag over de Armeense genocide een foto van
# een dood kind; historisch van waarde, maar niet als illustratie in een spel.
#
# De woorden staan als patroon met woordgrenzen, niet als losse tekst. Een
# eerdere versie zocht op "dead" en gooide daarmee de Dode Zee weg
# (Dead_sea_german.jpg). "dead" telt daarom alleen voor een dode iemand, en
# "grave" alleen in een massagraf of een kerkhof.
ONGESCHIKT = {'corpse', 'corpses', 'cadaver', 'massacre', 'atrocity', 'atrocities',
              'execution', 'executed', 'hanged', 'lynching', 'mutilated', 'genocide',
              'holocaust', 'autopsy', 'morgue', 'graveyard', 'wounded', 'killed',
              'casualties', 'starving', 'lijk', 'lijken', 'slachtoffer', 'slachtoffers'}
# "dead" telt alleen samen met een persoon: de Dode Zee en de Dead Sea Scrolls
# moeten er gewoon doorheen kunnen.
PERSOON = {'body', 'bodies', 'child', 'children', 'girl', 'boy', 'man', 'men',
           'woman', 'women', 'soldier', 'soldiers', 'victim', 'victims', 'baby'}


def geschikt_beeld(titel, geblokkeerde_bestanden=()):
    bestandsnaam = str(titel or '').removeprefix('File:')
    if bestandsnaam in geblokkeerde_bestanden:
        return False
    losse = set(re.findall(r'[a-z]+', str(titel or '').lower()))
    if losse & ONGESCHIKT:
        return False
    if 'dead' in losse and (losse & PERSOON):
        return False
    return not ('mass' in losse and 'grave' in losse)


def past_bij_onderwerp(titel, bron):
    """Deelt de bestandsnaam een woord met de titel van het bronartikel?

    De oudere zoekronde vroeg prop=images op, en die geeft de afbeeldingen van
    een artikel terug op alfabetische bestandsnaam — niet in de volgorde waarin
    ze in de tekst staan. Bij het artikel over Antarctica leverde dat een foto
    van Antennarius striatus op, een hengelaarsvis, puur omdat die naam met een
    A begint. Dat verklaarde de matige kwaliteit van die ronde.

    Deze toets houdt er alleen de kandidaten aan over waarvan de bestandsnaam
    het onderwerp noemt: "CN Tower 1976" bij het artikel CN_Tower, "Hobbit
    runes" bij The_Hobbit. Van de 175 vragen die alleen zulke kandidaten hadden
    overleven er zo 62; de overige 113 waren willekeurig.
    """
    m = re.match(r'https://[a-z]+\.wikipedia\.org/wiki/(.+)', str(bron))
    if not m:
        return False
    onderwerp = woorden(urllib.parse.unquote(m.group(1)).replace('_', ' '))
    return bool(woorden(titel.replace('File:', '')) & onderwerp)


def lees(pad):
    if not os.path.exists(pad):
        return {}
    with open(pad, encoding='utf-8') as f:
        return json.load(f)


def main():
    hoofd = lees(os.path.join(FOTOS, 'hoofdafbeeldingen.json'))
    onderwerp = lees(os.path.join(FOTOS, 'onderwerpafbeeldingen.json'))
    oud = lees(os.path.join(FOTOS, 'kandidaten.json'))
    # Foto's die met de hand zijn aangewezen, meestal door een adres in het
    # beoordelingsblad te plakken. Die winnen het van elk voorstel: een mens
    # die de moeite neemt een betere foto op te zoeken heeft altijd gelijk.
    handmatig = lees(os.path.join(FOTOS, 'handmatige_fotos.json'))
    # Afgekeurd bij de visuele controle van alle 678 foto's. Deze lijst gaat
    # voor alles, ook voor een handmatige keuze.
    #
    # Waarom hij op vraagtekst werkt en niet op nummer: een afkeuring die als
    # nul in het keuzeblad landt, pakt alleen bij vragen die in dat blad staan.
    # Race- en breinkrakervragen staan er niet in, en daar bleef een afgekeurde
    # foto gewoon staan — de minaretten van de Taj Mahal overleefden zo twee
    # ronden. De vraagtekst is de sleutel waarop de frontend zoekt, dus dat is
    # de enige sleutel die nergens tussendoor glipt.
    blokkades = lees(os.path.join(FOTOS, 'geblokkeerd.json'))
    geblokkeerd = set(blokkades.get('vragen', []))
    geblokkeerde_bestanden = set(blokkades.get('bestanden', []))

    # Handmatige keuzes, als het blad al is ingevuld.
    keuzes = {}
    if os.path.exists(KEUZE):
        try:
            kb = pd.read_excel(KEUZE, sheet_name='Fotokeuze')
            for _, r in kb.iterrows():
                try:
                    k = int(r['Keuze'])
                except (TypeError, ValueError):
                    continue
                keuzes[int(r['Nr'])] = k
        except Exception as fout:
            print(f'keuzeblad niet gelezen ({fout}); alleen automatische keuze')

    d = pd.read_excel(REVIEW, sheet_name='Vragen')
    uit = {}
    telling = {'handmatig': 0, 'keuze': 0, 'hoofdafbeelding': 0, 'onderwerpartikel': 0, 'oude kandidaat': 0,
               'wacht op keuze': 0, 'afgekeurd': 0, 'geblokkeerd': 0, 'geen': 0}

    for _, r in d.iterrows():
        nr = int(r['Nr'])
        vraag = str(r['Vraag NL'])
        if vraag in geblokkeerd:
            telling['geblokkeerd'] += 1
            continue
        # De kandidatenlijst zoals die in het keuzeblad stond: hoofdafbeelding
        # vooraan, daarna wat de oudere ronde vond.
        beste = (hoofd.get(str(nr), {}).get('kandidaten') or [None])[0]
        if beste and not geschikt_beeld(beste.get('titel', ''), geblokkeerde_bestanden):
            beste = None
        bron_van_beste = 'hoofdafbeelding' if beste else None
        # Staat het antwoord niet op een Wikipedia-artikel, dan is er geen
        # infobox om uit te putten. Het onderwerp van de vraag heeft er meestal
        # zelf wel een: "Coca-Cola" levert een fles, waar de tekstzoekronde met
        # drie negentiende-eeuwse advertenties kwam.
        #
        # Die zoektocht raadt het onderwerp uit de vraagtekst en zit er in
        # ongeveer drie van de tien gevallen naast: "Muzen" leverde een Maya-god
        # op, "snaren" een foto van George Kooymans. Zeven op de tien is te
        # weinig om vanzelf toe te passen, dus deze kandidaten wachten op een
        # keuze in het werkblad. Hetzelfde geldt voor de oude zoekronde.
        gevonden = (onderwerp.get(str(nr), {}).get('kandidaten') or [None])[0]
        if gevonden and not geschikt_beeld(gevonden.get('titel', ''), geblokkeerde_bestanden):
            gevonden = None
        rest = [k for k in ([gevonden] if gevonden else []) +
                [k for k in (oud.get(str(nr), {}).get('kandidaten') or [])
                 if past_bij_onderwerp(k.get('titel', ''), r['Bron (geverifieerd)'])
                 and geschikt_beeld(k.get('titel', ''), geblokkeerde_bestanden)]
                if not beste or k.get('titel') != beste.get('titel')]
        lijst = ([beste] if beste else []) + rest[:2]

        eigen = handmatig.get(str(nr))
        if eigen and not geschikt_beeld(eigen.get('titel', ''), geblokkeerde_bestanden):
            eigen = None
        if eigen:
            telling['handmatig'] += 1
            uit[vraag] = {'url': eigen['url'], 'pagina': eigen['pagina'],
                          'licentie': eigen['licentie'], 'maker': eigen['maker']}
            continue

        keuze = keuzes.get(nr)
        if keuze == 0:
            telling['afgekeurd'] += 1
            continue
        if keuze and 1 <= keuze <= len(lijst):
            gekozen, herkomst = lijst[keuze - 1], 'keuze'
        elif beste:
            gekozen, herkomst = beste, bron_van_beste
        elif lijst:
            # Geen infoboxfoto en geen keuze: dan liever niets. Dit is precies
            # de groep waar de negentiende-eeuwse cola-advertenties in zaten.
            telling['wacht op keuze'] += 1
            continue
        else:
            telling['geen'] += 1
            continue

        telling[herkomst] += 1
        uit[vraag] = {'url': gekozen['miniatuur'], 'pagina': gekozen['pagina'],
                      'licentie': gekozen['licentie'], 'maker': gekozen['maker']}

    kop = ('// Netto — foto per vraag, gekoppeld op vraagtekst.\n'
           '// Gegenereerd door tools/maak_fotobestand.py\n'
           '// Alleen CC BY, CC BY-SA, CC0 en publiek domein; maker en licentie\n'
           '// staan erbij omdat de eerste twee naamsvermelding eisen.\n'
           'window.NETTO_FOTOS = ')
    tekst = kop + json.dumps(uit, ensure_ascii=False) + ';\n'
    for map_ in (DATA, SPIEGEL):
        with open(os.path.join(map_, 'netto_fotos.js'), 'w', encoding='utf-8') as f:
            f.write(tekst)

    for k, v in telling.items():
        print(f'  {k:16s} {v}')
    print(f'\n{len(uit)} vragen met een foto -> data/netto_fotos.js')


if __name__ == '__main__':
    main()
