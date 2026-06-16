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

import json, sys, re, urllib.request
from datetime import date, timedelta

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

    # Total proprietati — incearca mai multe surse
    total = 0
    # 1. H1 vizibil ("349 proprietăți" sau "349 de proprietăți" sau "au fost găsite 349")
    try:
        h1 = page.locator('h1').first.inner_text()
        print(f"  H1: {h1!r}")
        m = re.search(r'(\d[\d.]*)\s*(?:de\s+)?proprietăț', h1, re.IGNORECASE) or \
            re.search(r'găsite?\s+(\d[\d.]*)', h1, re.IGNORECASE) or \
            re.search(r'(\d[\d.]*)\s+(?:de\s+)?cazăr', h1, re.IGNORECASE)
        if m:
            total = int(m.group(1).replace('.', ''))
            print(f"  Total din H1: {total}")
    except:
        pass
    # 2. Element dedicat cu numărul de rezultate
    if not total:
        for sel in [
            '[data-testid="header-number-of-results"]',
            '[data-testid="results-header-container"] h1',
            '.sr-usp-overlay__title',
        ]:
            try:
                txt = page.locator(sel).first.inner_text()
                m = re.search(r'(\d[\d.]*)', txt)
                if m:
                    total = int(m.group(1).replace('.', ''))
                    print(f"  Total din {sel}: {total}")
                    break
            except:
                pass
    # 3. JSON embedded în pagină
    if not total:
        try:
            m = re.search(r'"nbresults":(\d+)', page.content())
            if m:
                total = int(m.group(1))
                print(f"  Total din JSON: {total}")
        except:
            pass

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
    print("  Scanez pagina 1...")
    for step in range(10):
        page.evaluate(f"window.scrollTo(0, {(step + 1) * 1300})")
        page.wait_for_timeout(600)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(800)
    batch1 = _extract_cards(page)
    raw.extend(batch1)
    print(f"    → {len(batch1)} carduri")

    # Pagina 2 (offset=25) — prinde proprietatile ieftine de pe pagina 2
    try:
        url2 = BASE + '&offset=25'
        page.goto(url2, wait_until='domcontentloaded', timeout=20000)
        page.wait_for_timeout(3000)
        for step in range(8):
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
    try:
        url3 = BASE + '&offset=50'
        page.goto(url3, wait_until='domcontentloaded', timeout=20000)
        page.wait_for_timeout(3000)
        for step in range(8):
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

    # Total din titlu
    total = 0
    try:
        content = page.content()
        m = re.search(r'(\d+)\s*de\s*locuințe?\s*în\s*Iași', content, re.IGNORECASE) or \
            re.search(r'(\d+)\s*locuințe?\s*în\s*Iași', content, re.IGNORECASE)
        if m:
            total = int(m.group(1))
    except:
        pass

    # Extrage text complet si parseaza perechi (nume, pret)
    text = page.inner_text('main') if page.locator('main').count() else page.inner_text('body')

    # Pattern: "în total X L RON" apare dupa fiecare card
    # Extractie: pentru fiecare "în total X L RON", cauta numele in liniile anterioare
    lines = [l.strip() for l in text.split('\n') if l.strip()]

    entries = []
    for i, line in enumerate(lines):
        # Detecteaza pretul: "în total 196 L RON" sau "196 L RON în total"
        m_pret = re.search(r'în total\s+(\d[\d.]*)\s*L\s*RON', line, re.IGNORECASE) or \
                 re.search(r'(\d[\d.]*)\s*L\s*RON\s*în total', line, re.IGNORECASE) or \
                 re.search(r'^(\d[\d.]*)\s*L\s*RON$', line)
        if not m_pret:
            continue

        price = int(m_pret.group(1).replace('.', ''))
        if not (50 < price < 5000):
            continue

        # Cauta numele — linie care contine "Apartament în" sau "Studio" sau "Hotel" sau "Locuință"
        name = ''
        for j in range(i-1, max(0, i-20), -1):
            c = lines[j]
            if re.match(r'^(Apartament|Studio|Hotel|Locuință|Cazare|Vila|Garsonieră)', c, re.IGNORECASE):
                # Urmatoarea linie e de obicei subtitlul/descrierea
                if j+1 < len(lines) and len(lines[j+1]) > 5 and not re.match(r'^\d|^Gazdă|^în total|^Afișează|^Scor|^Super|^Alegerea|^Nou', lines[j+1]):
                    name = lines[j+1][:80]
                else:
                    name = c[:80]
                break

        if not name:
            # Fallback: ia linia imediat inainte care nu e metadata
            for j in range(i-1, max(0, i-5), -1):
                c = lines[j]
                if len(c) > 5 and not re.match(r'^\d|^Gazdă|^în total|^Afișează|^Scor|^Super|^Alegerea|^Nou|^·|^\.|^,', c):
                    name = c[:80]
                    break

        if name and not any(e['name'] == name for e in entries):
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
        browser = p.chromium.launch(headless=False)

        for checkin, checkout in date_pairs:
            if platform in ('booking', 'both'):
                page = browser.new_page()
                results, total = scan_booking(checkin, checkout, page)
                page.close()
                process_and_save('booking', checkin, checkout, results, total)

            if platform in ('airbnb', 'both'):
                page = browser.new_page()
                results, total = scan_airbnb(checkin, checkout, page)
                page.close()
                process_and_save('airbnb', checkin, checkout, results, total)

        browser.close()

if __name__ == '__main__':
    main()
