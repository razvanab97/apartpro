# Grill: Statistici Apartamente — Evoluție Zilnică
Started: 2026-06-13

## Summary of the Idea
Secțiunea de Statistici din ApartPro (Airbnb + Booking) trebuie gândită astfel încât să permită urmărirea evoluției tuturor apartamentelor zi de zi. Momentan există un upload manual de screenshot-uri/PDF-uri care extrage date prin AI (Claude Haiku), cu salvare în tabela `statistici_platforme`. Întrebarea e cum se structurează fluxul, UI-ul și datele pentru a putea monitoriza cu adevărat evoluția fiecărui apartament în timp, pe ambele platforme.

Context tehnic existent:
- Tabel `statistici_platforme` în Supabase (creat manual, nu în schema.sql)
- Upload manual: screenshot/PDF → AI extrage date → salvare
- Coloane: ocupare, tarif mediu, conversie, vizualizări, scor, etc.
- Pagina are 4 taburi: Upload / Azi / Evoluție / Comparație

## Open Threads
- Frecvența colectării: zilnic, săptămânal, sau la nevoie?
- Sursa datelor: manual (upload) vs. automatizat (scraping/API)
- Ce metrici sunt esențiale pentru urmărire zilnică vs. raportare periodică
- Dashboard principal: ce vede utilizatorul când deschide secțiunea?
- Alerte/notificări: există sau nu prag de alertă?
- Granularitate: per apartament individual sau agregat total portofoliu?
- Comparare: față de ziua precedentă, față de aceeași perioadă luna trecută?

## Decisions Log

### Q1: Cât de des vrei să introduci date noi — zilnic sau la nevoie?
- **Recommended:** Zilnic, dimineața după actualizarea platformelor
- **User's answer / preference:** Zilnic, dar automatizat dacă e posibil
- **Rationale / constraints:** Vrea evoluție continuă fără efort manual zilnic
- **Knock-on effects:** Trebuie evaluat ce se poate automatiza: Airbnb și Booking nu au API public → scraping sau upload manual rămân singurele opțiuni; automatizarea completă e dificilă tehnic, dar se poate simplifica fluxul manual (ex. un singur click care procesează toate screenshot-urile zilnice)

### Q2: De unde vin datele zilnice — screenshot manual sau alt flux?
- **Recommended:** Flux semi-automat — tu faci screenshot-urile, aplicația le procesează pe toate dintr-o singură acțiune
- **User's answer / preference:** Merge pe recomandare; confirmă că preluarea automată din platforme nu e posibilă (autentificare, risc ban cont)
- **Rationale / constraints:** Airbnb și Booking nu expun API pentru statistici de proprietar; scraping autentificat e fragil și riscant
- **Knock-on effects:** Fluxul zilnic devine: (1) faci screenshot-uri în Airbnb/Booking → (2) le încarci toate odată în aplicație → (3) un singur buton „Procesează tot" → (4) salvare automată; trebuie eliminat efortul de a selecta manual apartamentul și platforma pentru fiecare fișier

### Q3: Câte apartamente urmărești zilnic și pe câte platforme?
- **Recommended:** AI detectează automat apartamentul și platforma din screenshot dacă sunt >5-6 fișiere/zi
- **User's answer / preference:** Lista completă de apartamente active e deja în platformă (tabel `apartamente`, câmpurile `nume` + `nota`); AI-ul le poate folosi ca referință pentru auto-detecție
- **Rationale / constraints:** Nu are sens să selectezi manual când AI-ul poate corela numele proprietății din screenshot cu lista din DB
- **Knock-on effects:** Prompt-ul AI pentru extracție trebuie extins cu lista numelor de apartamente din DB, pentru auto-detecție apartament + platformă; selectoarele manuale din UI devin opționale (fallback dacă AI nu recunoaște)

### Q4: Ce vede utilizatorul pe ecranul principal al Statisticilor?
- **Recommended:** Dashboard „azi vs. ieri" — card per apartament cu metrici cheie + indicator verde/roșu față de ziua precedentă
- **User's answer / preference:** Merge pe recomandare
- **Rationale / constraints:** Vrea să vadă dintr-o privire dacă ceva s-a schimbat în rău
- **Knock-on effects:** Tab-ul „Azi" devine dashboard principal; fiecare card afișează delta față de înregistrarea precedentă; cardurile cu scăderi semnificative ies în evidență vizual; tabul „Upload" devine secundar (acces dintr-un buton „+ Adaugă date")

### Q5: Ce metrici vrei pe carduri — doar cheile sau toate?
- **Recommended:** Airbnb: ocupare, tarif/noapte, conversie, scor 5 stele; Booking: vizualizări, conversie pagină, ADR, scor comentarii
- **User's answer / preference:** Toate statisticile disponibile vizibile, dar cu accent pe câteva „generale" care arată evoluție/involuție clar
- **Rationale / constraints:** Vrea acces complet la date + evidențierea tendințelor pe metricile principale
- **Knock-on effects:** Card cu două zone: (1) metrici principale mari cu delta colorat (verde/roșu); (2) secțiune expandabilă sau grid secundar cu toate celelalte valori disponibile; metricile „principale" trebuie definite (următoarea întrebare)

### Q6: Care sunt metricile principale evidențiate pe card?
- **Recommended:** Airbnb: ocupare % + tarif/noapte + conversie globală; Booking: vizualizări + conversie pagină + ADR
- **User's answer / preference:** **Vizualizări** + **Loc în clasament** — acestea două sunt cele mai importante
- **Rationale / constraints:** Vizualizările arată cât de mult te vede piața; locul în clasament arată cât de competitiv ești față de alți proprietari
- **Knock-on effects:** `scor_pozitie_text` (Booking) și `rata_afisari_p1` (Airbnb) devin metrici principale; pe lângă acestea se mai adaugă și celelalte recomandate (ocupare, tarif, conversie, ADR); cardurile vor evidenția în mare: Vizualizări + Poziție/Clasament + metricile recomandate anterior (cu delta ±/săgeată sus/jos); restul în zona secundară

### Q8: Cum arată statisticile Airbnb?
- **Recommended:** % afișări prima pagină ca indicator principal de vizibilitate
- **User's answer / preference:** A trimis PDF complet Airbnb. Metrici disponibile confirmate:
  - **Ocupare**: rată % + nopți rezervate + nopți blocate + nopți fără rezervare + check-in-uri
  - **Tarif**: tarif mediu/noapte (RON) + comparație vs. anunțuri similare
  - **Durata șederii**: medie zile + comparație vs. similare
  - **Afișări**: total afișări pagină (235) + total afișări prima pagină căutare (1187)
  - **Conversie**: globală (1.01%) + căutare→prima pagină (70.4%) + vizite→rezervare (5.11%)
  - **Wishlist**: număr adăugări (8)
  - **NU există rang numeric** ca la Booking — vizibilitate = rata afișărilor prima pagină
- **Rationale / constraints:** OBSERVAȚIE CRITICĂ: ambele platforme afișează date cumulate pe 30/90 de zile, nu date de azi — evoluția zilnică = cum se mișcă rolling-ul de la o zi la alta
- **Knock-on effects:** Schema DB trebuie extinsă cu: `durata_medie_sedere`, `nopti_rezervate`, `nopti_blocate`, `nopti_fara_rezervare`, `checkin_uri`, `afisari_pagina_total`, `afisari_p1_total` (count absolut), `rata_conversie_cautari_p1`, `rata_conversie_vizite_rez`; pentru Booking: `scor_pozitie_rank` + `scor_pozitie_total` + `scor_pozitie_pct` + `completare_pagina_pct`

### Q9: Afișăm și comparația față de concurenți/anunțuri similare?
- **Recommended:** Da, badge verde/roșu pe fiecare metrică cu delta față de piață
- **User's answer / preference:** Da
- **Rationale / constraints:** Platformele oferă deja această comparație (ex. „cu 26.3% mai mare decât anunțuri similare"); e informație valoroasă să știi poziția relativă față de piață, nu doar valoarea absolută
- **Knock-on effects:** Schema DB primește câmpuri `_vs_similar` pentru fiecare metrică care are comparație disponibilă (ex. `rata_ocupare_vs_similar`, `tarif_vs_similar`, `wishlist_vs_similar`); AI-ul extrage și aceste valori comparative din screenshot; pe card: valoarea principală mare + badge mic „+26.3% vs. similare"

### Q10: Flux upload — toate deodată sau pe rând?
- **Recommended:** Toate deodată — drag & drop, AI detectează automat apartament + platformă, un singur buton Salvează tot
- **User's answer / preference:** Da, toate o dată
- **Rationale / constraints:** Zero selecții manuale; AI-ul primește lista de apartamente din DB și identifică din conținutul fiecărui screenshot căruia îi aparține
- **Knock-on effects:** Prompt-ul AI pentru extracție se extinde obligatoriu cu lista numelor din `apartamente` (nume + nota); câmpurile de selectare manuală din UI rămân vizibile doar ca fallback editabil după procesare, nu ca pas obligatoriu; procesarea se face în paralel (Promise.all) nu secvențial pentru viteză

### Q11: Structura taburilor — păstrăm sau restructurăm?
- **Recommended:** 3 taburi: Dashboard (principal) / Evoluție / Upload (ultimul)
- **User's answer / preference:** Restructurăm
- **Rationale / constraints:** Taburile vechi (Upload/Azi/Evoluție/Comparație) nu reflectă prioritățile reale de utilizare
- **Knock-on effects:** Structura nouă: (1) 📊 Dashboard — carduri azi vs. ieri toate apartamentele; (2) 📈 Evoluție — grafice în timp per apartament; (3) 📤 Upload — introducere date zilnice; tabul „Comparație" se absoarbe în Dashboard (cardurile arată deja comparația între apartamente)

### Q12: În tabul Evoluție — un grafic cu toate metricile sau grafice separate per metrică?
- **Recommended:** Grafice separate per metrică în grid — un singur grafic cu 8 linii ar fi ilizibil
- **User's answer / preference:** Ambele variante — și grafic combinat, și grafice individuale per metrică
- **Rationale / constraints:** Vrea flexibilitate: graficul combinat pentru corelații rapide, graficele individuale pentru detaliu per indicator
- **Knock-on effects:** Tab Evoluție are două sub-vizualizări: (A) „Grafic combinat" — selector de metrici cu toggle (bifezi ce linii vrei vizibile); (B) „Grafice individuale" — grid cu mini-grafice pentru fiecare metrică disponibilă; toggle sau sub-tab între cele două moduri

### Q13: Filtre pe Dashboard?
- **Recommended:** Dropdown platformă + sortare după o metrică
- **User's answer / preference:** Da, mai multe filtre
- **Rationale / constraints:** Cu 10+ apartamente filtrele devin esențiale pentru lizibilitate
- **Knock-on effects:** De definit ce filtre exact (următoarea întrebare)

### Q14: Ce filtre exact pe Dashboard?
- **Recommended:** Platformă + Sortare + Afișare (toate/scădere/creștere) + Perioadă dată
- **User's answer / preference:** Toate recomandate
- **Rationale / constraints:** Cu multe apartamente, combinarea filtrelor permite focus rapid pe probleme
- **Knock-on effects:** Bara de filtre Dashboard: (1) toggle Airbnb/Booking/Toate; (2) dropdown Sortare după: Ocupare/Vizualizări/Poziție/Tarif/Delta maxim; (3) toggle Afișare: Toate/Doar scăderi/Doar creșteri; (4) date picker cu navigare ←zi→ (implicit azi); filtrele se salvează în localStorage între sesiuni

### Q15: Alerte când scade semnificativ?
- **Recommended:** Alert vizual în aplicație — banner/secțiune roșie în fruntea Dashboard cu apartamentele cu probleme; prag configurabil per metrică
- **User's answer / preference:** Da
- **Rationale / constraints:** Fără push notification deocamdată — doar în aplicație
- **Knock-on effects:** Sus pe Dashboard: secțiune „⚠️ Atenție" (vizibilă doar când există alerte) cu lista apartamentelor care au depășit pragul de scădere; praguri default: vizualizări −20%, ocupare −15%, poziție clasament −10%; o pagină simplă de setări alerte unde poți modifica pragurile per metrică

### Q16: Tabela DB — extindem sau refacem de la zero?
- **Recommended:** Refacem de la zero cu DROP + CREATE — mai curat decât 15+ ALTER TABLE
- **User's answer / preference:** Refacem de la 0
- **Rationale / constraints:** Tabela e nouă, nu există date istorice valoroase de păstrat
- **Knock-on effects:** Generăm un SQL complet cu toate câmpurile stabilite în această sesiune; se rulează manual în Supabase SQL Editor; codul din `statistici-extract/route.ts` și `statistici/page.tsx` se actualizează corespunzător noii scheme

### Q17: Ordinea de implementare?
- **Recommended:** (1) Schema DB → (2) Upload îmbunătățit → (3) Dashboard → (4) Evoluție
- **User's answer / preference:** Merge pe recomandare
- **Rationale / constraints:** Fără schema corectă nimic nu funcționează; Upload vine imediat după pentru a începe colectarea de date reale; Dashboard și Evoluție depind de date acumulate

---

## Resolved Plan

### Structura finală pagina Statistici (3 taburi)

| # | Tab | Conținut |
|---|-----|----------|
| 1 | 📊 Dashboard | Pagina principală — carduri azi vs. ieri pentru toate apartamentele, cu filtre și alerte |
| 2 | 📈 Evoluție | Grafice în timp per apartament — mod combinat (linii selectabile) + mod grid (mini-grafice per metrică) |
| 3 | 📤 Upload | Introducere date zilnice — drag & drop toate fișierele, procesare paralelă cu AI, salvare cu un click |

---

### Bloc 1 — Schema DB nouă (`statistici_platforme`)

Refacere completă cu DROP + CREATE. Câmpuri:

**Identificare:**
- `id`, `apartament_id` (FK), `platforma` (airbnb/booking), `data_inregistrare`

**Airbnb — Ocupare:**
- `rata_ocupare`, `nopti_rezervate`, `nopti_blocate`, `nopti_fara_rezervare`, `checkin_uri`
- `rata_anulari`, `durata_medie_sedere`

**Airbnb — Tarif & Vizibilitate:**
- `tarif_mediu_noapte`, `tarif_vs_similar` (delta RON față de similare)
- `afisari_pagina_total`, `afisari_p1_total` (count absolut prima pagină)
- `rata_afisari_p1` (% afișări prima pagină)

**Airbnb — Conversie:**
- `rata_conversie_globala`, `rata_conversie_cautari_p1`, `rata_conversie_vizite_rez`

**Airbnb — Altele:**
- `wishlist_total`, `wishlist_vs_similar`
- `rata_ocupare_vs_similar`, `durata_sedere_vs_similar`

**Booking — Vizibilitate & Clasament:**
- `vizualizari_cautari`, `vizualizari_pagina`, `rezervari_confirmate`
- `scor_pozitie_rank` (int, ex. 559), `scor_pozitie_total` (int, ex. 686), `scor_pozitie_pct` (float, ex. 18.0)

**Booking — Conversie & Calitate:**
- `rata_conversie_cautari`, `rata_conversie_pagina`
- `adr`, `rata_anulari`
- `scor_comentarii`, `completare_pagina_pct`

**Comun:**
- `raw_extras` (JSONB) — orice câmp extras care nu se potrivește în schema fixă

---

### Bloc 2 — Upload îmbunătățit

**Flux zilnic:**
1. Drag & drop toate screenshot-urile/PDF-urile (ex. 10 fișiere)
2. AI procesează **în paralel** (Promise.all) fiecare fișier
3. Prompt extins cu lista numelor de apartamente din DB → **auto-detectare** apartament + platformă din conținut
4. Câmpurile de selectare manuală rămân **editabile** ca fallback după procesare (nu ca pas obligatoriu)
5. Un singur buton „💾 Salvează tot"

**Modificări tehnice:**
- `statistici-extract/route.ts` — prompt extins cu `aptList` (array de nume+id); returnează și `detected_apt_id` + `detected_platforma`
- `statistici/page.tsx` — procesare paralelă în loc de secvențială; selectoarele se auto-populează din răspunsul AI

---

### Bloc 3 — Dashboard

**Structură vizuală:**
- Bara de filtre: toggle Airbnb/Booking/Toate | Sortare după: Ocupare/Vizualizări/Poziție/Tarif/Delta maxim | Afișare: Toate/Scăderi/Creșteri | Date picker ←zi→
- Filtrele se salvează în localStorage
- Secțiune `⚠️ Atenție` (vizibilă doar când există alerte): apartamentele cu scăderi peste prag
  - Praguri default configurabile: vizualizări −20%, ocupare −15%, poziție clasament −10%
- Grid de carduri per apartament

**Cardul unui apartament:**
- Header: nume + badge platformă + data
- Metrici principale mari (cu delta ±): **Vizualizări** + **Poziție clasament** (Booking: `rang/total · mai bine decât X%`; Airbnb: `% afișări p1`) + Ocupare % + Tarif/noapte + Conversie
- Badge mic per metrică: `+26.3% vs. similare` (verde/roșu)
- Grid secundar: toate celelalte metrici disponibile (mai mici)

---

### Bloc 4 — Evoluție

- Selector apartament + platformă + perioadă
- **Mod A — Grafic combinat**: linii selectabile prin toggle per metrică (bifezi ce vrei vizibil)
- **Mod B — Grid mini-grafice**: câte un grafic per metrică disponibilă, toate pe pagină

---

### Ordinea de implementare
1. SQL schema nouă (rulat manual în Supabase)
2. Upload îmbunătățit (auto-detectare + procesare paralelă)
3. Dashboard (carduri + filtre + alerte)
4. Evoluție (grafice)

### Q7: Cum afișăm „loc în clasament" per platformă?
- **Recommended:** Per platformă diferit — Booking: text poziție, Airbnb: % afișări pagina 1
- **User's answer / preference:** Utilizatorul a trimis PDF cu dashboard Booking — poziția e numeric: `559 din 686` + procent „mai bine decât 18%"; nu text vag
- **Rationale / constraints:** Booking oferă rang numeric exact (X din Y proprietăți) + procent relativ față de concurenți; delta zilnic = scădere/creștere în rang numeric
- **Knock-on effects:** Schema DB trebuie să salveze: `scor_pozitie_rank` (int, ex. 559), `scor_pozitie_total` (int, ex. 686), `scor_pozitie_pct` (float, ex. 18.0) în loc de doar `scor_pozitie_text`; AI-ul extrage ambele numere din screenshot; pe card se afișează „559/686 · mai bine decât 18%" cu delta față de ziua precedentă; de asemenea Booking oferă și: completare pagina proprietății (78% vs 94% media zonei) + comparație set competitiv
