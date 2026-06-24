# Grill: Secțiunea Task-uri (app/taskuri/page.tsx)
Started: 2026-06-24

## Summary of the Idea
Utilizatorul vrea să îmbunătățească secțiunea "Task-uri" din ERP-ul apartpro. Starea actuală (confirmată prin explorarea codului `app/taskuri/page.tsx`, 1044 linii):
- **Brain Dump AI**: modal de captură rapidă — text liber, dictare vocală (Web Speech API), upload poză (comprimată client-side) — trimis la `/api/ai` pentru clasificare automată (titlu, descriere, prioritate, business, persoană, dată limită, impact/effort score).
- **Kanban** cu 3 coloane: De făcut / În lucru / Finalizat. Sortare: urgență → dată limită → priority_score.
- **priority_score** calculat ca `round((impact*2 + (11-effort))/3)` la creare (din scorurile AI sau manuale 1-10).
- **Filtre**: business (Property Management, Marketplace, Spălătorie, Personal, Admin, Financiar, Alt business) și prioritate (urgentă/normală/scăzută).
- **Rutina zilei**: checklist fix cu 7 item-uri zilnice (mesaje checkout, curățenie, Publi24, comenzi, social media x2, prețuri) — fiecare bifare creează/șterge un task cu `business='__rutina__'`, exclus din Kanban-ul normal.
- **TaskProgress**: bară gamification — XP (10/task finalizat), nivel, progres zi/săptămână/lună, contor urgențe + total finalizate.
- **Notificări**: browser `Notification` API verificată la 60s pentru deadline-uri cu oră (cu 15 min înainte + exact la oră) + push notifications via service worker (`registerPush`).
- **Task-uri recurente**: `checkRecurente()` citește coloanele `recurent`/`interval_zile`/`data_urmatoare` din tabela `taskuri` — **cunoscut ca defect/incomplet**: aceste coloane au fost flagate într-o sesiune anterioară ca lipsind din schema live; SQL de adăugare a fost dat utilizatorului dar nu s-a confirmat rularea.

## Open Threads
Toate rezolvate — vezi Resolved Plan.

## Decisions Log

### Q1: Care e principala durere care te-a făcut să vrei să îmbunătățești secțiunea Task-uri acum?
- **Recommended:** Task-urile recurente nu funcționează (coloanele DB lipsesc, checkRecurente() e oarbă)
- **User's answer / preference:** Vrea funcții noi, nu bug-fixing — recurența nu e prioritatea acum.
- **Rationale / constraints:** —
- **Knock-on effects:** Bug-ul cu `recurent`/`interval_zile`/`data_urmatoare` rămâne neadresat în acest exercițiu, doar notat ca defect cunoscut, separat de scope-ul curent. Următoarea întrebare trebuie să identifice exact ce funcționalitate nouă.

### Q2: Ce tip de funcție nouă te interesează cel mai mult pentru Task-uri?
- **Recommended:** Delegare task-uri către staff
- **User's answer / preference:** Direcția principală e simplificarea radicală a capturării unui task (scris sau vorbit) — vrea să fie mult mai rapid și fără timp pierdut. A menționat și că e deschis la "alte idei" care îi ușurează treaba, dar capturarea rapidă e prioritatea #1.
- **Rationale / constraints:** Timpul pierdut la introducerea unui task e durerea reală, nu lipsa unei funcții anume.
- **Knock-on effects:** Am explorat codul și am găsit `classifyAndSave()` (linia 114 din `app/taskuri/page.tsx`) — funcție de "analizează + salvează direct" deja scrisă, dar **neconectată la niciun buton** (cod mort). De asemenea: nu există shortcut de tastatură (Enter/Cmd+Enter) și Brain Dump e accesibil doar din pagina /taskuri (niciun acces rapid din restul ERP-ului). Următoarea întrebare trebuie să stabilească exact cât de "instant" vrea să fie salvarea și dacă renunță la ecranul de review AI.

### Q3: Când scrii sau dictezi un task, ce se întâmplă după ce AI-ul îl clasifică?
- **Recommended:** Salvează automat, fără ecran de verificare
- **User's answer / preference:** Păstrează ecranul de verificare, dar vrea să fie mult mai rapid de confirmat.
- **Rationale / constraints:** Probabil vrea o plasă de siguranță pe ce salvează (AI poate greși prioritate/business), dar fără pasul lent de azi.
- **Knock-on effects:** `classifyAndSave()` (cod mort găsit la Q2) nu mai e soluția potrivită ca atare (skip total al review-ului) — trebuie adaptat: review rămâne, dar confirmarea trebuie redusă la un singur gest (ex. Enter/tastă rapidă, sau auto-focus pe butonul Salvează, eliminarea click-urilor inutile). Următor: definim concret ce înseamnă "mai rapid de confirmat" + accesul global la Brain Dump din restul ERP-ului.

### Q4: Vrei acces rapid la Brain Dump AI din orice pagină a ERP-ului?
- **Recommended:** Buton flotant vizibil pe toate paginile
- **User's answer / preference:** Vrea să reutilizeze butonul deja existent "AB Homes Assistant" (`components/Chatbot.tsx`, montat global în `components/Layout.tsx:211`) — să scrie acolo, de pe orice pagină, și acela să "perceapă" task-ul.
- **Rationale / constraints:** Infrastructura de buton flotant global EXISTĂ deja — nu trebuie construită de la zero. Dar acel widget e cablat azi exclusiv ca asistent pentru oaspeți (`getContext()` + `/api/chat` cu system prompt orientat spre întrebări despre apartamente/prețuri), text-only, fără mic/poză.
- **Knock-on effects:** Trebuie clarificat cum distinge widget-ul un task de o întrebare normală (Q5) și ce se întâmplă cu funcția lui actuală de asistent pentru oaspeți (nu trebuie stricată).

### Q5: Cum ar trebui să-și dea seama widget-ul dacă un mesaj e task vs întrebare normală?
- **Recommended:** Buton/toggle explicit în chat
- **User's answer / preference:** Toggle explicit — confirmat exact recomandarea.
- **Rationale / constraints:** Elimină ambiguitatea/riscul de eroare față de detectare automată din conținut.
- **Knock-on effects:** UI-ul widget-ului Chatbot are nevoie de un buton/toggle nou lângă caseta de input. Când e activ "mod Task", mesajul trimis nu mai merge la `/api/chat` (asistent oaspeți) ci la fluxul de clasificare AI pentru task-uri (`/api/ai`, aceeași logică ca BrainDumpModal). Trebuie decis: (a) rezultatul clasificării apare ca un mini-card de review chiar în firul de chat, cu buton rapid de confirmare (consistent cu Q3 — review păstrat dar rapid), sau (b) deschide modalul BrainDump existent peste chat. De asemenea, neclarificat încă: vocea — widget-ul Chatbot nu are mic; Q2 menționează explicit "scris sau vorbit" ca cerință.

### Q6: Când activezi modul Task și trimiți mesajul, cum vrei să apară rezultatul clasificării AI?
- **Recommended:** Mini-card direct în firul de chat
- **User's answer / preference:** Confirmat — mini-card în chat, cu buton rapid de Salvează, fără să iasă din fluxul conversației.
- **Rationale / constraints:** Consistent cu Q3 (review păstrat, dar rapid de confirmat) și cu natura widget-ului (rămâi în context, nu sari la alt ecran).
- **Knock-on effects:** Mini-card-ul din chat trebuie să arate compact: titlu + prioritate + business + deadline + un singur buton "✓ Salvează" (plus poate "Editează" care deschide modalul complet pentru ajustări fine, dacă AI a greșit ceva).

### Q7: Vrei și dictare vocală în widget-ul flotant?
- **Recommended:** Da, adaugă microfon și în widget-ul flotant
- **User's answer / preference:** Da, confirmat.
- **Rationale / constraints:** Consistent cu cerința inițială (Q2) — "scris SAU vorbit", de pe orice pagină.
- **Knock-on effects:** Reutilizăm același Web Speech API deja scris în `BrainDumpModal` (`toggleVoice`, linia 77 din `app/taskuri/page.tsx`) — se portează ca buton mic de mic lângă input-ul din `Chatbot.tsx`, alături de toggle-ul de Task.

### Q8: Scop final — mai vrei altceva inclus acum, sau strict pe capturare rapidă?
- **Recommended:** Strict pe capturare rapidă
- **User's answer / preference:** Vrea adăugată și arhivarea/istoricul task-urilor finalizate.
- **Rationale / constraints:** Am verificat codul — `load()` (linia ~836) interoghează `taskuri` fără niciun filtru de dată, deci coloana "Finalizat" din Kanban crește nelimitat cu tot istoricul de task-uri finalizate vreodată.
- **Knock-on effects:** Scope-ul rundei curente devine: (1) capturare rapidă (modal + widget + voce) ȚI (2) arhivare/istoric task-uri finalizate. Următor: definim comportamentul exact al arhivării.

### Q9: Cum ar trebui să se comporte arhivarea task-urilor finalizate?
- **Recommended:** Auto-ascunse din Kanban după X zile + pagină separată de istoric
- **User's answer / preference:** Varianta cea mai simplă — doar limitează câte se afișează în coloană (ex. ultimele 20), fără pagină nouă.
- **Rationale / constraints:** Vrea interventia minima care rezolva problema vizuala, fara o pagina/sectiune noua de construit si intretinut.
- **Knock-on effects:** Implementare: coloana "Finalizat" din Kanban arată doar primele N (cap implicit 20, sortate desc după dată finalizare/`created_at`) + un indicator discret "+N mai vechi" dacă sunt mai multe, fără link către altă pagină. Decizie de design pe care o fac eu (nu a fost grilată explicit, e detaliu de implementare): statisticile de gamification din `TaskProgress` (XP, nivel, total finalizate ✓) **rămân calculate pe tot istoricul**, nu doar pe cele afișate — altfel userul "pierde" XP acumulat doar pentru că lista vizuală e tăiată.

## Resolved Plan

**Scope:** capturare rapidă de task-uri (scris/vorbit, de pe orice pagină) + curățare vizuală a coloanei "Finalizat". Bug-ul task-urilor recurente (`recurent`/`interval_zile`/`data_urmatoare`) rămâne explicit în afara scope-ului.

### 1. Modal Brain Dump (`app/taskuri/page.tsx`) — review mai rapid de confirmat
- Review-ul AI (prioritate/business/impact/efort/deadline) **rămâne** — nu se sare peste el.
- Se reduce frecarea la confirmare: focus automat pe butonul "Salvează" după ce vine rezultatul AI + tastă rapidă (Enter) pentru salvare instant, fără click suplimentar.
- `classifyAndSave()` (cod mort, linia 114) se elimină sau se redenumește/repurpose — nu mai e nevoie ca funcție separată de "skip review", din moment ce Q3 a stabilit că review-ul rămâne.

### 2. Widget global "AB Homes Assistant" (`components/Chatbot.tsx`) — mod Task nou
- Se adaugă un **toggle explicit "📝 Task"** lângă caseta de input din chat.
- Când e activ:
  - mesajul NU mai merge la `/api/chat` (asistent oaspeți) — merge la `/api/ai` (aceeași clasificare AI ca în BrainDumpModal).
  - rezultatul clasificării apare ca **mini-card în firul de chat** (titlu, prioritate, business, deadline) cu un singur buton **"✓ Salvează"** + un buton secundar "Editează" care deschide modalul complet (pentru ajustări fine dacă AI greșește).
  - se adaugă **microfon** (același Web Speech API din `toggleVoice`, portat din BrainDumpModal) lângă input, vizibil doar/mai ales când modul Task e activ.
- Când toggle-ul Task e inactiv, widget-ul se comportă exact ca azi (asistent pentru oaspeți) — nicio funcționalitate existentă nu se schimbă.
- Rezultat: un task se poate crea prin scris sau prin voce, de pe **orice pagină din ERP**, fără să mai navighezi la /taskuri.

### 3. Coloana "Finalizat" din Kanban — limitare vizuală
- Se afișează doar primele N task-uri finalizate (cap implicit **20**, sortate desc după data finalizării), cu un indicator discret "+N mai vechi" dacă sunt mai multe.
- Fără pagină/secțiune nouă de istoric.
- Statisticile de gamification din `TaskProgress` (XP, nivel, total finalizate ✓) **rămân calculate pe tot istoricul real**, indiferent de cap-ul vizual din Kanban.

### Explicit NOT in scope (pentru altă rundă, dacă va fi cazul)
- Fix la task-urile recurente (coloane DB lipsă)
- Delegare task-uri către staff
- Sub-task-uri/checklist în interiorul unui task
- Legare task-uri de apartamente/rezervări/proprietari
- Pagină de istoric/arhivă dedicată
