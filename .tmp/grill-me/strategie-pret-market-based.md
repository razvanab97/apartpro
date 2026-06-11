# Grill: Strategie Preț bazată pe date de piață (Monitor)
Started: 2026-06-11

## Summary of the Idea
Utilizatorul vrea o secțiune de strategie de preț bazată pe datele din tab-ul Monitor (prețuri concurente, disponibilități), nu pe statistici istorice proprii (ADR/Ocupare/RevPAR). 
Sistemul existent (Strategie tab cu performanță istorică) a fost implementat dar nu corespunde nevoii reale.
Obiectiv: pe baza trendului prețurilor de piață și al disponibilităților (cât de repede dispar listingurile = cerere), utilizatorul să poată decide un preț optim.

Context tehnic:
- `booking_monitor_history`: scanări cu `checkin`, `checkout`, `scanned_at`, `total_properties`, `lowest_price`, `top5` (array JSON cu prețurile concurenților), `platform`
- Scanările sunt triggerate manual de utilizator (script Python)
- Tab Monitor existent: arată ultima scanare per zi pentru o perioadă selectată

## Open Threads
- Unde se integrează: tab Monitor extins vs tab Strategie înlocuit vs sub-tab nou
- Ce statistici de piață sunt utile: trend preț, trend disponibilitate, vel. de ocupare
- Cum se traduce statistica în recomandare de preț concretă
- Granularitatea: per perioadă (checkin/checkout) vs per lună vs per sezon
- Ce face utilizatorul cu recomandarea: sugestie vizuală vs câmp prefilled vs reguli automate

## Decisions Log

### Q1: Unde se integrează vizualizarea statisticilor de piață — sub-tab în Monitor, sau tab Strategie?
- **Recommended:** Sub-tab „📊 Statistici" în Monitor
- **User's answer / preference:** Tot în tab-ul Strategie — înlocuim conținutul existent cu date de piață
- **Rationale / constraints:** Utilizatorul vrea un singur loc pentru strategie, nu dispersat în Monitor
- **Knock-on effects:** Tab-ul Strategie existent (performanță istorică ADR/Ocupare/RevPAR + reguli preț) se înlocuiește complet cu vizualizare market-based; codul vechi se șterge

### Q2: Ce vizualizare centrală — grafic dublu linie (preț + disponibilitate) sau tabel comparativ?
- **Recommended:** Grafic per perioadă grupate pe luni: linie preț minim piață + linie % disponibilitate rămasă suprapuse
- **User's answer / preference:** Merge pe recomandat
- **Rationale / constraints:** Utilizatorul vrea să vadă corelația preț-cerere vizual, nu în tabel
- **Knock-on effects:** Nevoie de calcul % disponibilitate = (total_properties_ultima_scanare / total_properties_prima_scanare) * 100; grafic cu dual-axis (preț RON stânga, % dreapta); grupare pe luna de check-in

### Q3: Cum grupezi perioadele pe axa X — luni sau zile-până-la-checkin?
- **Recommended:** Pe luna de check-in (Ian–Dec) = sezonalitate
- **User's answer / preference:** Vrea și granularitate intra-zi: câte proprietăți existau la ora X, la ora Y etc., per zi a săptămânii (ex. luni)
- **Rationale / constraints:** Vrea să vadă viteza de ocupare în cursul zilei — cât de repede dispar listingurile pe parcursul unei zile
- **Knock-on effects:** Avem deja `buildMarketTransitions` care calculează `unavailablePerHour` și `hour`; datele există în `booking_monitor_history.scanned_at`; nevoie de două view-uri distincte în Strategie: (1) sezonalitate lunară și (2) velocitate intra-zi per zi-a-săptămânii

### Q4: Ce metrici de preț vrei în graficul intra-zi?
- **Recommended:** Dropdown zi-săptămână + lună; axa X = oră; axa Y = total_properties + preț minim
- **User's answer / preference:** Vrea și numărul de proprietăți ȘI prețurile; vrea un preț mediu al zilei între cel mai ieftin și cel mai scump
- **Rationale / constraints:** Vrea să vadă spread-ul de preț, nu doar minimul
- **Knock-on effects:** LIMITARE TEHNICĂ: `top5` conține doar cele 5 cele mai ieftine listinguri — nu avem prețul maxim al pieței. Disponibil: `lowest_price` (min), `median(top5.prices)` (median al celor mai ieftini 5), `max(top5.prices)` (al 5-lea cel mai ieftin). De clarificat cu utilizatorul dacă median top5 e suficient ca proxy pentru „preț mediu"

### Q5: Câte listinguri salvăm și ce linii afișăm?
- **Recommended:** 3 linii: preț minim, mediană top5, prețul celui de-al 5-lea
- **User's answer / preference:** Vrea top 20 cel mai ieftin, să vadă cum evoluează; merge pe recomandare (3 linii: min, median, al 20-lea)
- **Rationale / constraints:** Top 20 dă un spread mai bun al pieței; al 20-lea preț = limita superioară a celor mai competitive 20
- **Knock-on effects:** SCHIMBARE NECESARĂ: în `app/api/booking-scan/route.ts` linia 32, `slice(0, 5)` → `slice(0, 20)`; câmpul se numește în continuare `top5` în DB (nu se redenumește); datele istorice vechi vor avea max 5 intrări în top5 — de tratat graceful în calcule

### Q6: Structura sub-taburi Strategie — înlocuim sau adăugăm?
- **Recommended:** 3 sub-taburi noi înlocuind complet conținutul existent (ADR/Ocupare/RevPAR/Reguli)
- **User's answer / preference:** Combină Performanță + Sezonalitate proprie într-un singur sub-tab și ADAUGĂ cele 3 noi (nu înlocuiește)
- **Rationale / constraints:** Utilizatorul vrea și statisticile proprii (ADR etc.) ȘI datele de piață
- **Knock-on effects:** 5 sub-taburi total în Strategie: (0) Performanță & Sezonalitate, (1) Evoluție piață, (2) Pattern zi/oră, (3) Sezonalitate piață, (4) Reguli Preț.

### Q7: Unde rămâne sub-tabul Reguli Preț?
- **Recommended:** Tab principal separat „⚙️ Reguli"
- **User's answer / preference:** Rămâne în Strategie ca al 5-lea sub-tab
- **Rationale / constraints:** Utilizatorul vrea totul grupat în Strategie
- **Knock-on effects:** Structura finală confirmată: 5 sub-taburi în Strategie

### Q8: Selecție perioadă în Evoluție piață — dropdown sau câmpuri libere?
- **Recommended:** Dropdown cu perioadele scanate din istoric
- **User's answer / preference:** Ambele — dropdown cu perioade existente + câmpuri dată libere
- **Rationale / constraints:** Dropdown pentru acces rapid la date existente; câmpuri pentru filtrare manuală
- **Knock-on effects:** Dropdown și câmpuri sunt sincronizate — selectezi din dropdown → se populează câmpurile; modifici câmpurile → dropdown arată „personalizat" sau se deselectează

## Resolved Plan

### Structura finală tab Strategie (5 sub-taburi)

| # | Sub-tab | Conținut |
|---|---------|----------|
| 0 | 📊 Performanță & Sezonalitate | ADR/Ocupare/RevPAR propriu + BarChart sezonalitate (combinat din cele 2 sub-taburi existente) |
| 1 | 📉 Evoluție piață | Dropdown perioade scanate + câmpuri dată libere; grafic: total_properties + lowest_price + median_top20 + price_20th per scanare |
| 2 | 📅 Pattern orar | Axa X = ora (0–23), filtre: zi-săptămână + lună check-in; linii: total_properties + preț minim + median |
| 3 | 📆 Sezonalitate piață | Agregare pe luna de check-in; prețul minim mediu, median, #20 per lună |
| 4 | ⚙️ Reguli Preț | CRUD existent `reguli_preturi` — neschimbat |

### Schimbări de cod necesare

1. **`app/api/booking-scan/route.ts` linia 32**: `slice(0, 5)` → `slice(0, 20)` — viitoarele scanări salvează top 20
2. **`app/preturi/page.tsx`** — înlocuire sub-taburi Strategie:
   - Combinare Performanță + Sezonalitate într-un singur sub-tab (JSX refactor)
   - Adăugare state + JSX pentru sub-taburile 1, 2, 3
   - Date sursă: `booking_monitor_history` (deja fetched în `history` state)
3. **Calcule noi** (client-side, din `history`):
   - `calcEvolPerioada(history, checkin, checkout)` → scanări sortate cronologic cu total_properties + prețuri
   - `calcPatternOrar(history, ziSapt, lunaCheckin)` → agregate per oră
   - `calcSezonalitatePiata(history)` → agregate per lună de check-in
4. **Graceful fallback**: scanările vechi au max 5 în top5 — median/20th se calculează din câte există

### Date disponibile în `history` (deja fetched la mount)
- `scanned_at`, `checkin`, `checkout`, `platform`, `total_properties`, `lowest_price`, `top5[]` (price, name, rank)
