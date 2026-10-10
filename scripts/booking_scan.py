#!/usr/bin/env python3
"""
ApartPro — Booking + Airbnb Monitor (TOP 10)
Instalare (o singura data):
  pip3 install playwright
  python3 -m playwright install

Rulare:
  python3 ~/Desktop/booking_scan.py                          # ambele, maine -> poimaine
  python3 ~/Desktop/booking_scan.py 2026-06-07 2026-06-08   # date specifice, ambele
  python3 ~/Desktop/booking_scan.py 2026-06-07 2026-06-08 booking
  python3 ~/Desktop/booking_scan.py 2026-06-07 2026-06-08 airbnb
"""

import json, sys, re, os, urllib.request
from datetime import date, timedelta

PROFILE_DIR = os.path.expanduser('~/Desktop/.booking_scan_profile')

SUPABASE_URL = "https://lsmraxevzkmupaidianv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzbXJheGV2emttdXBhaWRpYW52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkwMDA5NywiZXhwIjoyMDk1NDc2MDk3fQ.CagkIVPFE6r8D1oZPoxvs3jzJDR3HSwtx0GzM0etpss"

OUR_IDENTIFIERS = [
    'ab homes','abhomes','ab-homes',
    'ex59','gs08','hd02','l83','l88','l94','l99',
    'n32','n33','nt9','vm07','c64','cg40',
    'comfy & chic','palas skynest','skyport',
    'newton urban','green station','hideout rozelor',
    'peaceful copou','airy palas','vila pacurari','vila păcurari',
]

def is_ours(name):
    lower = name.lower()
    for id_ in OUR_IDENTIFIERS:
        if id_ in lower:
            return True, id_.upper()
    return False, None

def save_to_supabase(platform, checkin, checkout, results, total, lowest_price, we_are_lowest, our_lowest_rank):
    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/booking_monitor_history",
        data=json.dumps({
            'platform': platform,
            'checkin': checkin,
            'checkout': checkout,
            'total_properties': total or None,
            'lowest_price': lowest_price,
            'top5': results,
            'we_are_lowest': we_are_lowest,
            'our_lowest_rank': our_lowest_rank,
        }).encode(),
        method='POST', headers=headers
    )
    urllib.request.urlopen(req, timeout=10)
    print(f"  ✓ Salvat in Supabase ({platform})")

def _extract_cards(page):
    """Extrage carduri din pagina curenta si returneaza lista {name, price}."""
    raw = []
    cards = page.locator('[data-testid="property-card"]').all()
    for card in cards:
        try:
            name = card.locator('[data-testid="title"]').first.inner_text().strip()
            price = 0
            card_text = card.inner_text()
            m_redus = re.search(r'Preț actual\s+([\d.]+)\s*lei', card_text)
            if m_redus:
                price = int(m_redus.group(1).replace('.', ''))
            else:
                nums = [int(n.replace('.', '')) for n in re.findall(r'(\d[\d.]*)\s*lei', card_text)
                        if 50 < int(n.replace('.', '')) < 10000]
                if nums:
                    price = min(nums)
            if name and price > 50 and not any(r['name'] == name for r in raw):
                raw.append({'name': name, 'price': price, 'priceText': f'{price} lei'})
        except:
            continue
    return raw


def _detect_total(page):
    """Cauta numarul total de proprietati in TOATE sursele posibile de pe pagina.
    Booking serveste variante diferite de pagina (uneori H1-ul vizibil e genericul
    SEO "Hoteluri si proprietati in Iasi...", iar numarul real e in alt H1/element
    sau doar in textul brut al paginii) - de aceea verificam mai multe surse, nu doar
    primul H1."""
    total = 0
    # 1. TOATE H1-urile (nu doar primul) — Booking poate avea 2+ H1 pe pagina
    try:
        h1s = page.locator('h1').all_inner_texts()
        for h1 in h1s:
            print(f"  H1: {h1!r}")
            m = re.search(r'(\d[\d.]*)\s*(?:de\s+)?propriet[aă]ț', h1, re.IGNORECASE) or \
                re.search(r'g[aă]site?\s+(\d[\d.]*)', h1, re.IGNORECASE) or \
                re.search(r'(\d[\d.]*)\s+(?:de\s+)?caz[aă]r', h1, re.IGNORECASE)
            if m:
                total = int(m.group(1).replace('.', ''))
                print(f"  Total din H1: {total}")
                return total
    except:
        pass
    # 2. Element dedicat cu numărul de rezultate
    for sel in [
        '[data-testid="header-number-of-results"]',
        '[data-testid="results-header-container"] h1',
        '[data-testid="results-header-container"]',
        '.sr-usp-overlay__title',
    ]:
        try:
            txt = page.locator(sel).first.inner_text(timeout=2000)
            m = re.search(r'(\d[\d.]*)', txt)
            if m:
                total = int(m.group(1).replace('.', ''))
                print(f"  Total din {sel}: {total}")
                return total
        except:
            pass
    # 3. JSON embedded în pagină
    try:
        m = re.search(r'"nbresults":(\d+)', page.content())
        if m:
            total = int(m.group(1))
            print(f"  Total din JSON: {total}")
            return total
    except:
        pass
    # 4. Fallback final: cauta textul "au fost gasite NUMAR proprietati" oriunde in textul paginii
    try:
        body_text = page.inner_text('body')
        m = re.search(r'g[aă]site\s*([\d.,\s]+)\s*propriet[aă]ț', body_text, re.IGNORECASE) or \
            re.search(r'([\d.,\s]+)\s*properties found', body_text, re.IGNORECASE)
        if m:
            total = int(re.sub(r'[^\d]', '', m.group(1)))
            print(f"  Total din text brut: {total}")
            return total
    except:
        pass
    print("  ⚠ Nu am gasit numarul total de proprietati pe pagina (posibil blocaj anti-bot)")
    return 0


def _count_via_pagination(page, max_steps=18):
    """Fallback cand nu gasim numarul scris explicit pe pagina: deruleaza
    in josul rezultatelor si numara proprietatile UNICE (dupa nume) care se
    incarca progresiv (lazy-load).

    IMPORTANT — limita reala descoperita prin testare directa: pagina de
    cautare Booking NU are paginare numerotata reala, iar &offset= in URL nu
    avanseaza fiabil prin lista (la sortare dupa pret cu multe preturi egale,
    ordinea se reamesteca intre cereri si "paginile" se suprapun masiv).
    Lazy-load-ul pe o singura incarcare se plafoneaza in jur de 75-100 carduri,
    indiferent cat de mult deruelzi - Booking nu expune restul prin aceasta
    pagina. Deci acest numar e un MINIM confirmat, NU totalul exact (care e
    aproape mereu mai mare, de regula 150-450 in Iasi) - mai util decat "?",
    dar nu trateaza-l ca pe cifra exacta din H1."""
    print("  🔢 Nu am gasit total scris — numar prin scroll (minim, nu exact)...")
    seen = set()
    fara_nou = 0
    for i in range(max_steps):
        try:
            if page.is_closed():
                print("  ⚠ Pagina inchisa in timpul numararii — ma opresc cu ce am numarat")
                break
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(700)
            titles = page.locator('[data-testid="property-card"] [data-testid="title"]').all_inner_texts()
            nou = 0
            for t in titles:
                t = t.strip()
                if t and t not in seen:
                    seen.add(t)
                    nou += 1
            if nou == 0:
                fara_nou += 1
                if fara_nou >= 3:
                    break
            else:
                fara_nou = 0
        except Exception as e:
            print(f"  ⚠ Numarare intrerupta la pasul {i}: {e}")
            break
    total = len(seen)
    print(f"  🔢 Minim confirmat prin scroll: {total} proprietati (Booking nu a mai incarcat altele pe aceasta pagina — totalul real e probabil mai mare)")
    return total


def scan_booking(checkin, checkout, page):
    BASE = (
        f"https://www.booking.com/searchresults.ro.html"
        f"?ss=Ia%C8%99i%2C+Rom%C3%A2nia"
        f"&checkin={checkin}&checkout={checkout}"
        f"&group_adults=2&no_rooms=1&order=price"
    )
    print(f"\n🏨 BOOKING {checkin} → {checkout}\n")
    page.set_extra_http_headers({'Accept-Language': 'ro-RO,ro;q=0.9'})
    page.goto(BASE, wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(5000)

    # Inchide cookie popup
    for selector in ['button[id*="accept"]', 'button:has-text("Acceptă")', 'button:has-text("Accept")']:
        try:
            page.click(selector, timeout=1500)
            break
        except:
            pass
    page.wait_for_timeout(1500)

    total = _detect_total(page)
    if not total and not page.is_closed():
        total = _count_via_pagination(page)
        # numararea manuala deruleaza pana la finalul lazy-load-ului — ne intoarcem
        # sus pe pagina inainte de sortare si colectarea top-20, ca restul logicii
        # sa continue normal de la varful paginii
        try:
            if not page.is_closed():
                page.evaluate("window.scrollTo(0, 0)")
                page.wait_for_timeout(1000)
        except Exception as e:
            print(f"  ⚠ Nu m-am putut intoarce sus pe pagina: {e}")

    # Incearca sort prin click pe dropdown
    sorted_ok = False
    print("  Sortez după preț...")
    for trigger in [
        '[data-testid="sorters-dropdown-trigger"]',
        'button:has-text("Sortați după")',
        '[data-testid="searchresults-sort-trigger"]',
    ]:
        try:
            el = page.locator(trigger).first
            if el.is_visible(timeout=2000):
                el.click(force=True)
                page.wait_for_timeout(1500)
                for opt in [
                    '[data-testid="sorters-dropdown-item-price"]',
                    'a:has-text("Preț (mai mic")',
                    'button:has-text("Preț (mai mic")',
                    'li:has-text("Preț (mai mic")',
                ]:
                    try:
                        o = page.locator(opt).first
                        if o.is_visible(timeout=1500):
                            o.click(force=True)
                            page.wait_for_timeout(4000)
                            sorted_ok = True
                            print("  ✓ Sortat după preț (click)")
                            break
                    except:
                        pass
                if sorted_ok:
                    break
        except:
            pass

    if not sorted_ok:
        # order=price e deja in URL — reload cu param explicit
        print("  ⚠ Click sort nu a mers — folosesc URL cu order=price")

    raw = []

    # Pagina 1 — scroll pentru lazy loading
    # Booking poate inchide tab-ul automat in mijlocul scroll-ului (anti-bot) —
    # daca se intampla asta nu mai are rost sa continuam cu pagina 2/3 pe acest "page"
    print("  Scanez pagina 1...")
    page1_ok = True
    try:
        for step in range(10):
            if page.is_closed():
                raise RuntimeError("pagina s-a inchis (probabil anti-bot Booking)")
            page.evaluate(f"window.scrollTo(0, {(step + 1) * 1300})")
            page.wait_for_timeout(600)
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(800)
        batch1 = _extract_cards(page)
        raw.extend(batch1)
        print(f"    → {len(batch1)} carduri")
    except Exception as e:
        page1_ok = False
        print(f"  ⚠ Pagina 1 intrerupta: {e}")

    # Pagina 2 (offset=25) — prinde proprietatile ieftine de pe pagina 2
    if page1_ok and not page.is_closed():
        try:
            url2 = BASE + '&offset=25'
            page.goto(url2, wait_until='domcontentloaded', timeout=20000)
            page.wait_for_timeout(3000)
            for step in range(8):
                if page.is_closed():
                    raise RuntimeError("pagina s-a inchis (probabil anti-bot Booking)")
                page.evaluate(f"window.scrollTo(0, {(step + 1) * 1300})")
                page.wait_for_timeout(500)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(600)
            batch2 = _extract_cards(page)
            # adauga doar cele noi
            for r in batch2:
                if not any(x['name'] == r['name'] for x in raw):
                    raw.append(r)
            print(f"  Scanez pagina 2... → {len(batch2)} carduri")
        except Exception as e:
            print(f"  Pagina 2 skip: {e}")

    # Pagina 3 (offset=50)
    if page1_ok and not page.is_closed():
        try:
            url3 = BASE + '&offset=50'
            page.goto(url3, wait_until='domcontentloaded', timeout=20000)
            page.wait_for_timeout(3000)
            for step in range(8):
                if page.is_closed():
                    raise RuntimeError("pagina s-a inchis (probabil anti-bot Booking)")
                page.evaluate(f"window.scrollTo(0, {(step + 1) * 1300})")
                page.wait_for_timeout(500)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(600)
            batch3 = _extract_cards(page)
            for r in batch3:
                if not any(x['name'] == r['name'] for x in raw):
                    raw.append(r)
            print(f"  Scanez pagina 3... → {len(batch3)} carduri")
        except Exception as e:
            print(f"  Pagina 3 skip: {e}")

    # Sorteaza dupa pret si ia top 20
    raw.sort(key=lambda x: x['price'])
    results = [{'rank': i + 1, **r} for i, r in enumerate(raw[:20])]
    print(f"\n  Total unice colectate: {len(raw)} → top 20 după preț:")
    for r in results:
        print(f"  #{r['rank']} {r['name']} — {r['price']} lei")

    return results, total

def scan_airbnb(checkin, checkout, page):
    url = (
        f"https://www.airbnb.com/s/Iasi--Romania/homes"
        f"?checkin={checkin}&checkout={checkout}"
        f"&adults=2&price_filter_input_type=0&sort_order=PRICE_LTE_THAN"
    )
    print(f"\n🏠 AIRBNB {checkin} → {checkout}\n")
    page.set_extra_http_headers({'Accept-Language': 'ro-RO,ro;q=0.9'})
    page.goto(url, wait_until='domcontentloaded', timeout=30000)
    page.wait_for_timeout(5000)

    # Inchide modals
    for selector in ['button[aria-label="Close"]', 'button[aria-label="Închide"]']:
        try:
            page.click(selector, timeout=1500)
        except:
            pass
    page.wait_for_timeout(2000)

    # Text complet al rezultatelor
    text = page.inner_text('main') if page.locator('main').count() else page.inner_text('body')
    lines = [l.strip() for l in text.split('\n') if l.strip()]

    # Total din titlu ("317 locuințe în Iași")
    total = 0
    for l in lines[:10]:
        m = re.search(r'(\d[\d.]*)\s*(?:de\s+)?locuințe?\s+în\s+Iași', l, re.IGNORECASE)
        if m:
            total = int(m.group(1).replace('.', ''))
            break

    # Airbnb a schimbat formatul pretului: acum "186 lei în total" / "270 lei în total, inițial 293 lei"
    # (cu spatiu fara-rupere intre suma si moneda), inainte "196 L RON". Acceptam ambele formate.
    RE_PRET = re.compile(r'^(\d[\d.]*)\s*(?:lei|L\s*RON|RON)\s+în total', re.IGNORECASE)
    RE_PRET_VECHI = re.compile(r'în total\s+(\d[\d.]*)\s*L\s*RON', re.IGNORECASE)
    RE_META = re.compile(r'^(Fotografia|Super-gazdă|Scor mediu|\d+,\d+\s*\(\d+\)|Nou$|Cazare nouă|Gazdă|Locuință din topul|Alegerea oaspeților|în total|Afișează|\d+\s*(dormitor|pat|baie|băi|canapea)|,$|·$)', re.IGNORECASE)

    # Anunturile sunt separate de "Fotografia 1 din N"; in fiecare: tipul ("Apartament în Iași"),
    # titlul (prima linie care nu e eticheta/scor/dotari) si pretul total
    carduri, curent = [], []
    for l in lines:
        if re.match(r'^Fotografia 1 din \d+', l) and curent:
            carduri.append(curent); curent = []
        curent.append(l)
    if curent:
        carduri.append(curent)

    entries = []
    for c in carduri:
        price = None
        for l in c:
            m = RE_PRET.search(l) or RE_PRET_VECHI.search(l)
            if m:
                price = int(m.group(1).replace('.', ''))
                break
        if price is None or not (50 < price < 5000):
            continue
        tip_idx = next((i for i, l in enumerate(c) if re.search(r'\bîn\s+Iași$', l)), None)
        name = ''
        for l in c[(tip_idx + 1 if tip_idx is not None else 0):]:
            if not RE_META.match(l) and len(l) > 3:
                name = l[:80]
                break
        tip = c[tip_idx] if tip_idx is not None else ''
        if len(name) < 12 and tip:          # titlu generic ("Apartament") -> adaugam tipul ca sa fie distinct
            name = f"{tip} · {name}"[:80] if name else tip
        if name and not any(e['name'] == name and e['price'] == price for e in entries):
            entries.append({'name': name, 'price': price})

    # Sorteaza dupa pret si ia top 10
    entries.sort(key=lambda x: x['price'])
    results = []
    for e in entries[:10]:
        results.append({
            'rank': len(results)+1,
            'name': e['name'],
            'price': e['price'],
            'priceText': f"{e['price']} RON"
        })
        print(f"  #{len(results)} {e['name']} — {e['price']} RON")

    return results, total

def process_and_save(platform, checkin, checkout, results, total):
    if not results:
        print(f"  ❌ Nu s-au gasit proprietati pe {platform}")
        return

    enriched = []
    for r in results:
        is_o, code = is_ours(r['name'])
        enriched.append({**r, 'isOurs': is_o, 'matchedCode': code})

    lowest_price    = min(r['price'] for r in enriched)
    our_results     = [r for r in enriched if r['isOurs']]
    we_are_lowest   = any(r['price'] == lowest_price for r in our_results)
    our_lowest_rank = min((r['rank'] for r in our_results), default=None)

    print(f"\n  📊 {total or '?'} proprietati disponibile")
    print(f"  💰 Pret minim: {lowest_price}")
    if we_are_lowest:
        print("  🏆 TU EȘTI CEL MAI IEFTIN!")
    elif our_lowest_rank:
        print(f"  📍 Ești pe locul #{our_lowest_rank}")
    else:
        print(f"  👀 AB Homes nu e in top 10")

    print()
    save_to_supabase(platform, checkin, checkout, enriched, total, lowest_price, we_are_lowest, our_lowest_rank)
    print(f"  ✅ {platform.upper()} gata!\n")

def main():
    from playwright.sync_api import sync_playwright

    args = sys.argv[1:]
    platform = 'both'
    if args and args[-1] in ('booking', 'airbnb'):
        platform = args.pop()

    date_pairs = []
    i = 0
    while i + 1 < len(args):
        date_pairs.append((args[i], args[i + 1]))
        i += 2

    if not date_pairs:
        today = date.today()
        date_pairs = [(str(today + timedelta(days=1)), str(today + timedelta(days=2)))]

    print(f"🗓 {len(date_pairs)} perioadă/perioade de scanat: {', '.join(f'{ci}→{co}' for ci, co in date_pairs)}\n")

    with sync_playwright() as p:
        # Profil PERSISTENT (cookie-uri salvate intre rulari), ca un Chrome normal —
        # nu un browser nou de fiecare data. Booking decide o singura data, la prima
        # vizita a profilului, ce varianta de pagina iti arata (cu sau fara numarul
        # "X proprietati gasite" scris explicit) si pastreaza acea varianta consecvent
        # pentru profilul respectiv. Un browser nou de fiecare data (fara cookie-uri)
        # nimerea la intamplare in oricare din variante, de unde "merge cand scanezi tu,
        # nu merge la urmatoarea rulare" desi nimic din cod nu s-a schimbat.
        context = p.chromium.launch_persistent_context(PROFILE_DIR, headless=False, locale='ro-RO')

        for checkin, checkout in date_pairs:
            if platform in ('booking', 'both'):
                try:
                    page = context.new_page()
                    results, total = scan_booking(checkin, checkout, page)
                    if not page.is_closed():
                        page.close()
                    process_and_save('booking', checkin, checkout, results, total)
                except Exception as e:
                    print(f"  ❌ BOOKING {checkin}→{checkout} a picat complet: {e}\n")

            if platform in ('airbnb', 'both'):
                try:
                    page = context.new_page()
                    results, total = scan_airbnb(checkin, checkout, page)
                    if not page.is_closed():
                        page.close()
                    process_and_save('airbnb', checkin, checkout, results, total)
                except Exception as e:
                    print(f"  ❌ AIRBNB {checkin}→{checkout} a picat complet: {e}\n")

        context.close()

if __name__ == '__main__':
    main()
