# Grill: Repostare automată Publi24 — mai multe conturi
Started: 2026-06-14

## Summary of the Idea
Automatizarea apăsării butonului „Repostează" pe Publi24 pentru anunțurile de apartamente, pe mai multe conturi simultan. În loc să intri manual în fiecare cont și să dai click pe „Repostează" la fiecare anunț, un script/tool integrat în ApartPro face asta automat sau cu un singur click.

## Open Threads
- ~~Câte conturi și frecvență~~ ✅
- ~~Unde rulează~~ ✅
- ~~Credențiale~~ ✅
- ~~Ce anunțuri~~ ✅
- ~~Scheduling~~ ✅
- ~~Browser~~ ✅
- ~~Notificări~~ ✅
- ~~Missed jobs~~ ✅

## Decisions Log

### Q1: Câte conturi Publi24 ai și cât de des trebuie să dai Repostează?
- **Recommended:** Dacă sunt 3+ conturi și repostezi zilnic, merită automatizat complet
- **User's answer / preference:** 7 conturi — 6 cu câte 5 anunțuri, 1 cu 10 anunțuri = **40 anunțuri total**
- **Rationale / constraints:** Volum mare — 40 click-uri manuale pe zi e complet nesustenabil
- **Knock-on effects:** Automatizarea completă e justificată; scriptul trebuie să itereze prin toate conturile și toate anunțurile; durata estimată per repostare ~2-5s = ~3-4 minute total dacă e secvențial

### Q2: Cât de des și cu ce orar — zilnic automat sau declanșat manual?
- **Recommended:** Zilnic automat la ora 09:00, fără intervenție
- **User's answer / preference:** Zilnic automat, dar la **ore diferite** per cont/anunț — ar fi ideal
- **Rationale / constraints:** Ore diferite = comportament mai natural, mai greu de detectat ca bot de Publi24
- **Knock-on effects:** Fiecare cont primește un slot orar diferit (ex. cont1→08:15, cont2→09:40, cont3→11:05 etc.); orele pot fi fixe configurabile sau randomizate într-un interval (ex. 08:00–13:00); nevoie de scheduler persistent — un cron job pe server sau Vercel Cron Jobs nu sunt suficiente dacă repostarea necesită browser; cel mai probabil: script Python local cu `schedule` library + ore configurabile per cont

### Q3: Unde rulează scriptul — PC local sau server/VPS?
- **Recommended:** VPS mic (~5$/lună) care rulează 24/7
- **User's answer / preference:** **PC local** — rulează când e PC-ul pornit, fără costuri suplimentare
- **Rationale / constraints:** Vrea să evite costuri extra; acceptă că dacă PC-ul e închis la ora programată, repostarea din acea zi se pierde
- **Knock-on effects:** Script Python care rulează în background (pornit manual sau la startup Windows/Mac); dacă PC-ul e pornit și ora a trecut, poate face repostarea imediat la pornire sau o sare; nevoie de mecanism „missed job" — dacă ora a trecut cu mai puțin de X ore, repostează oricum

### Q4: Cum se stochează credențialele celor 7 conturi?
- **Recommended:** Fișier local `conturi.json` cu email + parolă + ora preferată per cont
- **User's answer / preference:** Merge pe recomandare — fișier local simplu, editabil direct
- **Rationale / constraints:** Datele nu pleacă din PC; editabil manual fără UI special
- **Knock-on effects:** Format `conturi.json`: array de obiecte `{email, parola, ora_repostare: "09:15", conturi_anunturi: [...]}` sau ora e randomizată dintr-un interval; scriptul citește fișierul la pornire

### Q5: Browser vizibil sau headless (invizibil)?
- **Recommended:** Headless — rulează silențios în background, loghează erorile în fișier
- **User's answer / preference:** Merge pe recomandare — headless
- **Rationale / constraints:** Nu vrea întreruperi în timpul muncii
- **Knock-on effects:** Playwright sau Selenium cu `headless=True`; log file `repostare.log` cu timestamp + cont + status per anunț; notificare la erori (de definit: popup Windows/Mac sau email?)

### Q6: Cum să fii notificat — desktop, Telegram sau altceva?
- **Recommended:** Notificare desktop Mac — simplă, fără setup extra
- **User's answer / preference:** **Notificare locală Mac** (macOS notification)
- **Rationale / constraints:** PC-ul e Mac; vrea notificare nativă fără servicii externe
- **Knock-on effects:** `osascript -e 'display notification "..."'` sau librăria Python `pync`/`subprocess` apelând osascript; o notificare la final cu rezumat (ex. „✅ 40/40 anunțuri repostate") + notificare separată per eroare dacă un cont pică

### Q7: Dacă PC-ul era închis la ora programată — repostează la pornire sau sare ziua?
- **Recommended:** Repostează imediat la pornire dacă ora a trecut cu mai puțin de 6 ore
- **User's answer / preference:** **Repostează întotdeauna la pornire** dacă jobul zilei nu a rulat încă
- **Rationale / constraints:** Simplu și predictibil — dacă pornești PC-ul, repostarea se face indiferent de oră
- **Knock-on effects:** Scriptul salvează într-un fișier `last_run.json` data ultimei repostări per cont; la pornire verifică dacă contul a fost repostat azi — dacă nu, rulează imediat; la ora programată, dacă a rulat deja azi, sare

### Q8: Cum găsește scriptul anunțurile — descoperire automată sau listă fixă de URL-uri?
- **Recommended:** Descoperire automată — intră în cont, merge la „Anunțurile mele", repostează tot ce e activ
- **User's answer / preference:** Merge pe recomandare — descoperire automată
- **Rationale / constraints:** Nu trebuie întreținută nicio listă manuală; dacă adaugi/ștergi un anunț, scriptul se adaptează automat
- **Knock-on effects:** Flux per cont: login → navighează la pagina „Anunțurile mele" → găsește toate butoanele „Repostează" vizibile → click pe fiecare → confirmă dacă există dialog de confirmare → loghează rezultatul

---

## Resolved Plan

### Fișiere create
```
~/Desktop/publi24_repost/
  publi24_repost.py     ← scriptul principal
  conturi.json          ← credențiale + ore per cont
  last_run.json         ← generat automat, ține evidența ultimei rulări
  repostare.log         ← log detaliat cu timestamp + status per anunț
```

### `conturi.json` — format
```json
[
  { "email": "cont1@gmail.com", "parola": "pass1", "ora": "08:15" },
  { "email": "cont2@gmail.com", "parola": "pass2", "ora": "09:40" },
  { "email": "cont3@gmail.com", "parola": "pass3", "ora": "11:05" },
  { "email": "cont4@gmail.com", "parola": "pass4", "ora": "12:30" },
  { "email": "cont5@gmail.com", "parola": "pass5", "ora": "13:50" },
  { "email": "cont6@gmail.com", "parola": "pass6", "ora": "15:20" },
  { "email": "cont7@gmail.com", "parola": "pass7", "ora": "16:45" }
]
```

### Flux per cont (Playwright headless Chromium)
1. Login cu email + parolă
2. Navighează la „Anunțurile mele"
3. Găsește toate butoanele „Repostează" vizibile
4. Click pe fiecare + confirmă dialog dacă există
5. Loghează în `repostare.log`: `[timestamp] cont1@gmail.com | Anunț X | ✅ OK / ❌ Eroare`

### Scheduler (rulează continuu în background)
- La **pornirea scriptului**: verifică `last_run.json` — dacă vreun cont nu a fost repostat azi, îl rulează imediat
- La **ora programată** din `conturi.json`: rulează contul dacă nu a rulat deja azi
- Scriptul se adaugă la **Login Items** Mac pentru a porni automat cu PC-ul

### Notificări Mac (osascript)
- La final per cont: `✅ cont1 — 5/5 anunțuri repostate`
- La eroare: `❌ cont3 — login eșuat / 2/5 repostate`

### Instalare (o singură dată)
```bash
pip install playwright schedule
playwright install chromium
```

---

### Q9: Browser propriu sau Playwright cu Chromium izolat?
- **Recommended:** Playwright cu Chromium propriu — izolat de browserul personal
- **User's answer / preference:** Merge pe recomandare — Playwright + Chromium
- **Rationale / constraints:** Sesiunile Publi24 nu interferează cu ce are deschis în browser; instalare simplă cu un singur comandă
- **Knock-on effects:** `pip install playwright && playwright install chromium`; fiecare cont rulează într-un context browser separat (nu shared cookies); paralelism posibil între conturi dacă e nevoie de viteză
