# Grill: Generator Locații România
Started: 2026-06-18

## Summary of the Idea
A tool that generates random Romanian locations (city, street, house number) and lets the user pick the right one by pressing a button. Personal use, likely for listing/posting properties on platforms like Publi24 with varied/fake addresses.

## Open Threads
- Purpose: why does the user need fake/random Romanian addresses?
- Where does it live: standalone page in apartpro, separate tool, browser extension?
- UX: how many options shown at once? One at a time or multiple?
- Data source: hardcoded Romanian street DB, external API, AI-generated?
- Output: just display, or copy to clipboard / auto-fill a form?
- Does city need to match actual apartment location or truly random?

## Decisions Log

### Q1: Pentru ce vei folosi adresele generate?
- **Recommended:** Postare anunțuri pe Publi24/OLX ca să variezi adresa
- **User's answer:** Confirmat — pentru anunțuri pe platforme; nelimitat, pe baza Google Maps; doar localitate + stradă + număr, nimic personal
- **Rationale / constraints:** Google Maps = adrese reale; fără limite de generare; câmpuri strict: localitate, stradă, număr
- **Knock-on effects:** Necesită Google Maps API (Places/Geocoding); fără date personale; UX trebuie să fie rapid (buton → adresă nouă)

### Q2: Adresele din orice oraș sau dintr-un anumit oraș?
- **Recommended:** Orice oraș din România
- **User's answer:** Distribuție ponderată: 10% București, 60% zona Moldovei (Iași, Bacău, Neamț etc.), 30% restul țării
- **Rationale / constraints:** Reflectă zona de activitate; mai credibil pentru platforme în zona Moldovei
- **Knock-on effects:** Logica de selecție oraș trebuie să implementeze ponderile; lista de orașe din Moldova trebuie definită

### Q3: UX — o adresă sau mai multe simultan?
- **Recommended:** 3-5 adrese simultan, click pe cea dorită
- **User's answer:** Varianta B — 3-5 simultan, click pentru alegere
- **Rationale / constraints:** Mai rapid, fără să apese butonul de 10 ori
- **Knock-on effects:** Layout tip card-uri; după click → adresa selectată e copiată/afișată proeminent

### Q4: Unde va trăi tool-ul?
- **Recommended:** Pagină nouă în apartpro
- **User's answer:** Pagină nouă în apartpro, în secțiunea Șabloane Mesaje (tab nou)
- **Rationale / constraints:** Infrastructură existentă, nu reinventezi roata
- **Knock-on effects:** Tab nou în app/sabloane/page.tsx; structura existentă are 2 tab-uri (Șabloane + Mesaje în masă), adăugăm al 3-lea

### Q5: Ce se întâmplă după click pe o adresă?
- **Recommended:** Copiat automat în clipboard + toast "Copiat!"
- **User's answer:** Buton de copiere separat pentru fiecare câmp; format complet: Județ/Sector, Localitate, Stradă, Număr
- **Rationale / constraints:** Platformele (Publi24) au câmpuri separate, deci copierea per câmp e mai utilă
- **Knock-on effects:** Fiecare card afișează 4 câmpuri; fiecare câmp are butonul lui de copy; București → Sector (1-6) în loc de județ

### Q6: Sursă date — Google Maps API key sau alternativă?
- **Recommended:** Bază de date statică din OpenStreetMap/Nominatim (gratuit, fără key)
- **User's answer:** Fără API key, mergem pe baza de date statică
- **Rationale / constraints:** Nu are Google Maps API key; zero costuri; zero dependență externă la runtime
- **Knock-on effects:** Necesită un JSON/array pre-generat cu adrese reale din România; logica de filtrare pe ponderi (10%/60%/30%) se aplică pe acest dataset static

### Q7: Câte carduri și comportament după copiere?
- **Recommended:** 4 carduri în grid 2×2; batch rămâne pe ecran, "Generează alte 4" manual
- **User's answer:** Confirmat — 4 carduri 2×2, batch manual, rămâne pe ecran
- **Rationale / constraints:** Poți copia mai multe câmpuri din același card fără să dispară
- **Knock-on effects:** Layout 2×2 responsive; buton "Generează alte 4" prominent

### Q8: Filtru manual de județ/oraș?
- **Recommended:** Fără filtru, distribuție automată
- **User's answer:** Fără filtru
- **Rationale / constraints:** UI simplu; dacă vrea Iași specific, apasă Generează de câteva ori
- **Knock-on effects:** Niciuna — logica de selecție e pur probabilistică

## Resolved Plan

### Funcționalitate
Tab nou "📍 Generator Locații" în `app/sabloane/page.tsx` (al 3-lea tab).

### Date
- Fișier static `lib/locatii-romania.ts`: array de înregistrări `{judet, localitate, strada, region}` cu sute de adrese reale din România (extrase mental din cunoaștere OpenStreetMap)
- Numerele de stradă se generează random (1-150) la runtime — nu sunt hardcodate
- Regiuni: `'bucuresti'` | `'moldova'` | `'alte'`
- Ponderi: 10% București, 60% Moldova (Iași, Bacău, Neamț, Suceava, Vaslui, Galați, Vrancea, Botoșani), 30% restul

### Format afișat per card
- **Județ**: numele județului sau "Sector X" (1-6) pentru București
- **Localitate**: orașul/comuna
- **Stradă**: numele străzii (cu prefix: Strada/Bulevardul/Calea etc.)
- **Număr**: generat random 1-150
- Fiecare câmp are buton 📋 de copiere individuală

### UX
- Grid 2×2 (4 carduri)
- Batch rămâne pe ecran după copiere
- Buton "🔄 Generează alte 4" — generare manuală
- Toast "Copiat!" la fiecare copiere
- Fără filtru de județ/oraș

### Implementare
1. `lib/locatii-romania.ts` — datele statice + funcția `generateBatch(n=4)`
2. `GeneratorLocatiiContent` component în `app/sabloane/page.tsx`
3. Tab nou adăugat în bara de tab-uri existentă
