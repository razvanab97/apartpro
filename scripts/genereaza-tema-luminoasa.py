#!/usr/bin/env python3
"""
Genereaza app/tema-luminoasa.css — tema "luminos / alb cremos" pentru TOATA aplicatia (cerut direct).

Aplicatia are culorile scrise direct in stilurile inline (mii de locuri), nu in variabile CSS. In loc sa
rescriem fiecare pagina, scriptul gaseste toate culorile din cod si genereaza reguli care le traduc in tema
luminoasa, cand <html data-theme="light">: fundalurile inchise devin crem / alb cald, textul deschis devine
inchis, accentele (verde / rosu / galben / albastru) devin variante mai inchise, ca sa se citeasca pe deschis.
Regulile se potrivesc pe atributul style serializat de browser (ex. "color: rgb(232, 244, 255)").

Ruleaza din nou dupa ce apar culori noi in cod:   python3 scripts/genereaza-tema-luminoasa.py
"""
import os, re, colorsys

RAD = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = ['app', 'components', 'lib']
L = '[data-theme="light"]'

INK = (33, 28, 20)          # text principal (aproape negru, cald)
INK_MUTED = (92, 80, 62)    # text estompat
LINE = (120, 96, 64)        # linii / chenare
CARD = '#FFFDF8'            # carduri, panouri
PAGE = '#F6F1E7'            # fundalul paginii (crem)

# accente (text) -> varianta inchisa, lizibila pe crem
ACCENT_TEXT = {
    (74, 222, 128): (21, 128, 61), (34, 197, 94): (21, 128, 61), (37, 211, 102): (21, 128, 61), (52, 211, 153): (4, 120, 87),
    (248, 113, 113): (200, 38, 38), (239, 68, 68): (200, 38, 38), (252, 165, 165): (185, 28, 28), (220, 38, 38): (185, 28, 28),
    (252, 211, 77): (161, 98, 7), (245, 158, 11): (161, 98, 7), (251, 191, 36): (161, 98, 7), (253, 224, 71): (161, 98, 7),
    (251, 146, 60): (194, 65, 12), (249, 115, 22): (194, 65, 12),
    (77, 163, 255): (29, 78, 216), (123, 200, 255): (29, 78, 216), (124, 155, 255): (55, 48, 163), (96, 165, 250): (29, 78, 216),
    (56, 189, 248): (3, 105, 161), (37, 99, 235): (29, 78, 216),
    (167, 139, 250): (109, 40, 217), (196, 181, 253): (109, 40, 217), (192, 132, 252): (126, 34, 206), (139, 92, 246): (109, 40, 217),
    (244, 114, 182): (190, 24, 93), (236, 72, 153): (190, 24, 93),
}
# solide de accent pe care textul alb TREBUIE sa ramana alb (butoane)
# solide albastru deschis -> albastru mai inchis, ca textul alb de pe butoane sa aiba contrast pe crem
BG_SOLID = {(77, 163, 255): (37, 112, 230), (96, 165, 250): (37, 112, 230), (123, 200, 255): (37, 112, 230)}
ACCENT_SOLID_RGB = {(77, 163, 255), (37, 99, 235), (34, 197, 94), (74, 222, 128), (239, 68, 68), (248, 113, 113),
                    (124, 58, 237), (139, 92, 246), (167, 139, 250), (37, 211, 102), (124, 155, 255), (245, 158, 11),
                    (220, 38, 38), (22, 163, 74), (59, 130, 246), (99, 102, 241), (16, 185, 129), (251, 146, 60)}


def fmt_alpha(a):
    s = ('%.3f' % a).rstrip('0').rstrip('.')
    return s if s else '0'


def ser(r, g, b, a=1.0):
    """Serializarea browserului: rgb(r, g, b) / rgba(r, g, b, a)."""
    return f'rgb({r}, {g}, {b})' if a >= 1 else f'rgba({r}, {g}, {b}, {fmt_alpha(a)})'


def css(rgb, a):
    r, g, b = rgb
    return ser(r, g, b, a)


def lum(rgb):
    r, g, b = [c / 255 for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def sat(rgb):
    h, l, s = colorsys.rgb_to_hls(*[c / 255 for c in rgb])
    return s


def gaseste_culori():
    """Returneaza {(r,g,b,a): set(forme brute din cod)} - HTML-ul randat pe server pastreaza stilul exact
    cum e scris ("background:rgba(11,18,32,0.85)", "color:#FFFFFF"), iar elementele create in browser il
    normalizeaza ("background: rgba(11, 18, 32, 0.85)") - acoperim ambele forme."""
    culori = {}
    re_hex = re.compile(r'#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b')
    re_rgba = re.compile(r'rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)')
    for d in DIRS:
        for root, _, files in os.walk(os.path.join(RAD, d)):
            for f in files:
                if not f.endswith(('.tsx', '.ts')):
                    continue
                txt = open(os.path.join(root, f), encoding='utf-8', errors='ignore').read()
                for m in re_hex.finditer(txt):
                    h = m.group(1)
                    if len(h) == 3:
                        h = ''.join(c * 2 for c in h)
                    culori.setdefault((int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0), set()).add(m.group(0))
                for m in re_rgba.finditer(txt):
                    r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
                    if max(r, g, b) > 255:
                        continue
                    a = float(m.group(4)) if m.group(4) else 1.0
                    culori.setdefault((r, g, b, min(a, 1.0)), set()).add(m.group(0))
    return culori


def clasa(rgb):
    if rgb in ACCENT_TEXT:
        return 'accent'
    l, s = lum(rgb), sat(rgb)
    if l < 0.22:
        return 'dark'
    if l > 0.62 and (s < 0.25 or rgb[2] >= rgb[0]):   # alb / albastrui deschis (text + overlay-uri)
        return 'muted' if l < 0.86 or s > 0.5 else 'light'
    if s > 0.35:
        return 'accent-other'
    return 'mid'


def intunecat(rgb):
    h, l, s_ = colorsys.rgb_to_hls(*[c / 255 for c in rgb])
    r, g, b = colorsys.hls_to_rgb(h, min(l, 0.34), max(s_, 0.65))
    return (round(r * 255), round(g * 255), round(b * 255))


def main():
    culori = gaseste_culori()
    reg = []
    alb_texte = []
    for (r, g, b, a), brute in sorted(culori.items()):
        rgb = (r, g, b)
        t = ser(r, g, b, a)
        c = clasa(rgb)
        forme_n = [t]                      # normalizat de browser (cu spatii)
        forme_b = sorted(brute)            # exact ca in cod (randare pe server)
        sel_text = ', '.join([f'{L} [style^="color: {x}"], {L} [style*="; color: {x}"]' for x in forme_n] +
                             [f'{L} [style^="color:{x}"], {L} [style*=";color:{x}"]' for x in forme_b])
        sel_bg = ', '.join([f'{L} [style*="background: {x}"], {L} [style*="background-color: {x}"]' for x in forme_n] +
                           [f'{L} [style*="background:{x}"], {L} [style*="background-color:{x}"]' for x in forme_b])
        sel_border = ', '.join([f'{L} [style*="solid {x}"], {L} [style*="dashed {x}"], {L} [style*="border-color: {x}"], {L} [style*="border-color:{x}"]' for x in forme_n + forme_b])
        # TEXT
        if c == 'light':
            reg.append(f'{sel_text}{{color:{css(INK, max(0.78, a))}!important}}')
            alb_texte.extend([('n', t)] + [('b', x) for x in brute])
        elif c == 'muted':
            reg.append(f'{sel_text}{{color:{css(INK_MUTED, min(0.92, max(0.55, a * 1.25)))}!important}}')
        elif c == 'accent':
            reg.append(f'{sel_text}{{color:{css(ACCENT_TEXT[rgb], max(0.85, a))}!important}}')
        elif c == 'accent-other' and lum(rgb) > 0.45:
            reg.append(f'{sel_text}{{color:{css(intunecat(rgb), max(0.85, a))}!important}}')
        # FUNDAL
        if rgb in BG_SOLID and a >= 0.85:
            reg.append(f'{sel_bg}{{background:{css(BG_SOLID[rgb], a)}!important}}')
        elif c == 'dark':
            reg.append(f'{sel_bg}{{background:{CARD if a >= 0.5 else "rgba(255, 253, 248, 0.65)"}!important}}')
        elif c in ('light', 'muted'):
            reg.append(f'{sel_bg}{{background:{css(LINE, min(0.12, max(0.035, a * 0.8)))}!important}}')
        # CHENARE
        if c in ('dark', 'light', 'muted', 'mid'):
            reg.append(f'{sel_border}{{border-color:{css(LINE, min(0.32, max(0.12, a * 1.1)))}!important}}')
    # textul alb pe butoane cu fundal de accent plin ramane alb
    for (r, g, b, a), brute in culori.items():
        if (r, g, b) in ACCENT_SOLID_RGB and a >= 0.6:
            bgs = [('n', ser(r, g, b, a))] + [('b', x) for x in brute]
            sels = []
            for kb, bg in bgs:
                for kt, t in alb_texte:
                    if kb != kt:
                        continue
                    sp = ' ' if kb == 'n' else ''
                    sels.append(f'{L} [style*="background:{sp}{bg}"][style*="color:{sp}{t}"]')
            if sels:
                reg.append(', '.join(sels) + '{color:#FFFFFF!important}')

    baza = f'''/* GENERAT de scripts/genereaza-tema-luminoasa.py — nu edita manual; ruleaza scriptul din nou. */
{L}, {L} body {{ background:{PAGE}!important; color:{css(INK, 1)}; color-scheme:light; }}
{L} .tema-fundal {{ display:none!important; }}
{L} input, {L} select, {L} textarea {{ background:{CARD}!important; border-color:{css(LINE, 0.28)}!important; color:{css(INK, 1)}!important; }}
{L} input:focus, {L} select:focus, {L} textarea:focus {{ border-color:#2563EB!important; box-shadow:0 0 0 3px rgba(37, 99, 235, 0.14)!important; }}
{L} input::placeholder, {L} textarea::placeholder {{ color:{css(INK_MUTED, 0.5)}!important; }}
{L} select option {{ background:#FFFFFF; color:{css(INK, 1)}; }}
{L} label {{ color:{css(INK_MUTED, 0.85)}; }}
{L} thead th {{ color:{css(INK_MUTED, 0.75)}; border-bottom-color:{css(LINE, 0.18)}; }}
{L} tbody td {{ color:{css(INK, 0.85)}; border-bottom-color:{css(LINE, 0.12)}; }}
{L} tbody tr:hover td {{ background:rgba(37, 99, 235, 0.05); }}
{L} ::-webkit-scrollbar-thumb {{ background:{css(LINE, 0.28)}; }}
{L} .mpr-overlay {{ background:rgba(40, 32, 20, 0.45)!important; }}
{L} .mpr-sheet {{ background:{PAGE}!important; border-color:{css(LINE, 0.2)}!important; }}
{L} .mpr-tab {{ color:{css(INK_MUTED, 0.7)}!important; }}
{L} .mpr-tab.on {{ background:{CARD}!important; color:{css(INK, 1)}!important; }}
{L} svg text {{ fill:{css(INK, 1)}!important; }}
'''
    out = os.path.join(RAD, 'app', 'tema-luminoasa.css')
    open(out, 'w').write(baza + '\n'.join(reg) + '\n')
    print(f'{len(culori)} culori, {len(reg)} reguli -> {out} ({os.path.getsize(out)//1024} KB)')


if __name__ == '__main__':
    main()
