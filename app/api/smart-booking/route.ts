import { NextRequest, NextResponse } from 'next/server'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

async function callClaude(prompt: string, imageBase64?: string, imageType?: string): Promise<string> {
  const content: any[] = [{ type: 'text', text: prompt }]

  if (imageBase64) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${imageType || 'image/jpeg'};base64,${imageBase64}` }
    })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.choices?.[0]?.message?.content || '{}'
}
const SUPABASE_URL = 'https://lsmraxevzkmupaidianv.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzbXJheGV2emttdXBhaWRpYW52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkwMDA5NywiZXhwIjoyMDk1NDc2MDk3fQ.CagkIVPFE6r8D1oZPoxvs3jzJDR3HSwtx0GzM0etpss'

async function sbFetch(path: string) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  })
  return res.json()
}

function buildDateMap(): Record<string,string> {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
  const add = (n: number) => { const d = new Date(now); d.setDate(now.getDate()+n); return fmt(d) }
  const dayNames = ['duminica','luni','marti','miercuri','joi','vineri','sambata']
  const result: Record<string,string> = {
    today: fmt(now),
    tomorrow: add(1),
    dayAfterTomorrow: add(2),
    in3days: add(3),
    in7days: add(7),
    in14days: add(14),
    in30days: add(30),
    endOfMonth: fmt(new Date(now.getFullYear(), now.getMonth()+1, 0)),
    endOfWeek: add(7 - ((now.getDay()+6)%7)),
    year: String(now.getFullYear()),
    month: pad(now.getMonth()+1),
    nextMonth: pad(now.getMonth()+2 > 12 ? 1 : now.getMonth()+2),
  }
  // Next weekdays
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now); d.setDate(now.getDate()+i)
    result[dayNames[d.getDay()]] = fmt(d)
  }
  // Days of month
  for (let day = 1; day <= 31; day++) {
    const d = new Date(now)
    if (day <= now.getDate()) d.setMonth(d.getMonth()+1)
    d.setDate(day)
    result['pe ' + day] = fmt(d)
    result['pe ' + pad(day)] = fmt(d)
  }
  return result
}

// ── Pasul 2: raspunsul catre client, DOAR pentru locatiile alese de tine (cerut direct: "eu aleg ce
// locatie sa-i propunem si se va genera un text la care se adauga si link-ul de pe site-ul nostru").
// Preturile si link-urile sunt puse de cod, exact (AI-ul scrie doar salutul si incheierea, in limba
// clientului) - ca un link sau un pret sa nu poata fi niciodata inventat/gresit de AI.
const ETICHETE: Record<string, { noapte: string; nopti: string; total: string; detalii: string; pers: string }> = {
  ro: { noapte: 'noapte', nopti: 'nopți', total: 'total', detalii: 'Detalii și poze', pers: 'persoane' },
  en: { noapte: 'night', nopti: 'nights', total: 'total', detalii: 'Details & photos', pers: 'guests' },
  fr: { noapte: 'nuit', nopti: 'nuits', total: 'total', detalii: 'Détails et photos', pers: 'personnes' },
  de: { noapte: 'Nacht', nopti: 'Nächte', total: 'gesamt', detalii: 'Details & Fotos', pers: 'Personen' },
  it: { noapte: 'notte', nopti: 'notti', total: 'totale', detalii: 'Dettagli e foto', pers: 'persone' },
}
async function genereazaRaspuns(body: any) {
  const d = body.date || {}
  const limba = ETICHETE[d.limba] ? d.limba : (d.limba && d.limba !== 'ro' ? 'en' : 'ro')
  const L = ETICHETE[limba]
  const oferte: { apt_id: string; pret_noapte: number }[] = (body.oferte || []).filter((o: any) => o?.apt_id)
  if (!oferte.length) return { ok: false, error: 'Alege cel puțin o locație' }
  const ids = oferte.map(o => o.apt_id)
  const apts = await sbFetch('apartamente?select=id,nota,nume,adresa,zona,capacitate_max,link_site&id=in.(' + ids.join(',') + ')')
  // Numele vazut de client = cel de pe site ("AB HOMES - Cuib Urban"), nu cel intern ("Mircea M08")
  const numeSite: Record<string, string> = {}
  await Promise.all((apts || []).filter((a: any) => a.link_site).map(async (a: any) => {
    try {
      const r = await fetch(a.link_site, { signal: AbortSignal.timeout(4000) })
      const m = (await r.text()).match(/<title>\s*AB HOMES\s*[-–]\s*([^<]+?)\s*<\/title>/i)
      if (m) numeSite[a.id] = m[1].trim()
    } catch {}
  }))
  const nopti = d.data_checkin && d.data_checkout ? Math.max(1, Math.round((new Date(d.data_checkout).getTime() - new Date(d.data_checkin).getTime()) / 86400000)) : null
  const fmtRON = (n: number) => Math.round(n).toLocaleString('ro-RO') + ' lei'
  const blocuri = oferte.map((o, i) => {
    const a = (apts || []).find((x: any) => x.id === o.apt_id) || {}
    const pret = Number(o.pret_noapte) || 0
    const linii = [
      `${oferte.length > 1 ? (i + 1) + '. ' : ''}🏠 *${numeSite[a.id] || String(a.nume || '?').trim()}*${a.zona ? ' – ' + a.zona : ''}`,
      pret ? `💰 ${fmtRON(pret)} / ${L.noapte}${nopti ? ` × ${nopti} ${nopti === 1 ? L.noapte : L.nopti} = *${fmtRON(pret * nopti)} ${L.total}*` : ''}` : '',
      a.link_site ? `🔗 ${L.detalii}: ${a.link_site}` : '',
    ].filter(Boolean)
    return linii.join('\n')
  })
  const rezumatOferte = oferte.map(o => { const a = (apts || []).find((x: any) => x.id === o.apt_id) || {}; return `${numeSite[a.id] || a.nume} (${o.pret_noapte} lei/noapte)` }).join('; ')
  const prompt = [
    'Esti asistentul AB Homes Iasi (apartamente in regim hotelier). Scrie DOAR salutul si incheierea unui mesaj de raspuns catre un client, in limba: ' + limba + '.',
    'Intre ele (nu le scrie tu!) vor fi inserate ofertele: ' + rezumatOferte + '.',
    'Clientul: ' + (d.nume_client || 'necunoscut') + '; perioada ' + (d.data_checkin || '?') + ' → ' + (d.data_checkout || '?') + (nopti ? ` (${nopti} nopti)` : '') + '; ' + (d.nr_persoane || '?') + ' persoane.',
    'Mesajul original al clientului:  + String(body.mesaj_original || ).slice(0, 1500) + ',
    'Reguli: ton cald, profesionist, scurt; in romana te adresezi cu "dumneavoastra" si folosesti doar prenumele clientului (salut max 2 propozitii: multumesti pentru mesaj si mentionezi perioada si nr. de persoane - NU spune ca rezervarea/perioada e confirmata, e doar o oferta; incheiere max 2 propozitii: intrebi daca vrea sa confirme rezervarea si te oferi pentru intrebari). Fara preturi, fara link-uri, fara a inventa dotari. Doar emoji Unicode standard (😊 🏠 📅 ✅), nu simboluri ◆★●►■.',
    'Raspunde DOAR JSON: {"salut":"...","incheiere":"..."}',
  ].join('\n')
  let salut = '', incheiere = ''
  try {
    const raw = await callClaude(prompt)
    const j = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
    salut = String(j.salut || '').trim(); incheiere = String(j.incheiere || '').trim()
  } catch {}
  if (!salut) salut = limba === 'ro' ? `Bună ziua${d.nume_client ? ', ' + String(d.nume_client).split(' ')[0] : ''}! 😊 Vă mulțumim pentru mesaj. Pentru perioada solicitată vă putem propune:` : `Hello${d.nume_client ? ' ' + String(d.nume_client).split(' ')[0] : ''}! 😊 Thank you for your message. For your dates we can offer:`
  if (!incheiere) incheiere = limba === 'ro' ? 'Vă rugăm să ne spuneți dacă doriți să confirmăm rezervarea. Suntem la dispoziție pentru orice întrebare! 😊' : 'Please let us know if you would like us to confirm the booking. Happy to answer any questions! 😊'
  return { ok: true, raspuns: [salut, blocuri.join('\n\n'), incheiere].join('\n\n') }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (body.mod === 'raspuns') {
    try { return NextResponse.json(await genereazaRaspuns(body)) }
    catch (e: any) { return NextResponse.json({ ok: false, error: e.message }) }
  }
  const { text, imageBase64, imageType } = body

  const dm = buildDateMap()
  const today = dm.today

  // Get apartments
  const apts = await sbFetch('apartamente?select=id,nota,nume,capacitate_max,pret_standard,adresa,zona,dotari,link_site,comision_tip&status=eq.activ&order=nota')

  // Build date reference for AI
  const dateRef = [
    'DATA DE AZI: ' + today,
    '"azi"/"astazi" = ' + dm.today,
    '"maine"/"mâine" = ' + dm.tomorrow,
    '"poimaine" = ' + dm.dayAfterTomorrow,
    '"sapt viitoare"/"saptamana viitoare" = incepe ' + dm.in7days,
    '"luna asta" = pana la ' + dm.endOfMonth,
    'Zilele saptamanii: luni=' + dm['luni'] + ', marti=' + dm['marti'] + ', miercuri=' + dm['miercuri'] + ', joi=' + dm['joi'] + ', vineri=' + dm['vineri'] + ', sambata=' + dm['sambata'] + ', duminica=' + dm['duminica'],
    'Zile ale lunii: "pe 1"=' + dm['pe 1'] + ', "pe 5"=' + dm['pe 5'] + ', "pe 10"=' + dm['pe 10'] + ', "pe 15"=' + dm['pe 15'] + ', "pe 20"=' + dm['pe 20'] + ', "pe 25"=' + dm['pe 25'] + ', "pe 30"=' + dm['pe 30'],
    'Luna curenta=' + dm.month + ', luna viitoare=' + dm.nextMonth + ', anul=' + dm.year,
  ].join('\n')

  const extractPrompt = [
    'Esti un modul AI avansat de analiza (Data Extractor) integrat intr-un sistem ERP pentru regim hotelier.',
    'Rolul tau este sa citesti mesajele primite de la potentiali clienti, sa extragi informatiile cheie de rezervare si sa le structurezi intr-un obiect JSON standard.',
    '',
    'DATA CURENTA: ' + today,
    '',
    'REFERINTA DATE (foloseste valorile EXACTE):',
    dateRef,
    '',
    'Analizeaza textul si extrage:',
    '1. phone_number: numarul de telefon al clientului (sau null)',
    '2. check_in: data intrare YYYY-MM-DD (daca lipseste anul, foloseste 2026)',
    '3. check_out: data iesire YYYY-MM-DD (daca se specifica nr nopti, calculeaza)',
    '4. nights: nr total nopti (calculeaza daca ai ambele date)',
    '5. guests_adults: nr adulti (implicit 1)',
    '6. guests_children: nr copii (implicit 0)',
    '7. total_guests: adulti + copii',
    '8. preferences: preferinte speciale (parcare, etaj, animale, zona, ora checkin) - tablou gol daca nu exista',
    '9. raw_summary: o fraza scurta care rezuma cererea',
    '10. nume_client: numele clientului daca e mentionat (sau null)',
    '11. email: emailul daca e mentionat (sau null)',
    '12. buget_per_noapte: bugetul mentionat (sau null)',
    '13. canal: whatsapp|airbnb|booking|email|direct (detecteaza din context)',
    '14. limba: ro|en|fr|de|other',
    '',
    'REGULI STRICTE:',
    '- Raspunde EXCLUSIV cu obiectul JSON valid. Nu adauga text inainte sau dupa.',
    '- "weekend-ul viitor" = vineri ' + dm['vineri'] + ' pana duminica ' + dm['duminica'],
    '- "azi" = ' + today + ', "maine" = ' + dm.tomorrow + ', "poimaine" = ' + dm.dayAfterTomorrow,
    '- "pe 15" = ' + dm['pe 15'] + ', "pe 20" = ' + dm['pe 20'] + ', "pe 1" = ' + dm['pe 1'],
    '- Daca lipsesc informatii critice, seteaza null',
    '',
    'REGULI OASPETI (CRITIC - citeste cu atentie):',
    '- "2 adulti + 2 copii" -> guests_adults=2, guests_children=2, total_guests=4',
    '- "4 persoane" sau "4 oaspeti" -> guests_adults=4, guests_children=0, total_guests=4',
    '- "eu si sotia" sau "2 persoane" -> guests_adults=2, total_guests=2',
    '- "familie cu 2 copii" -> guests_adults=2, guests_children=2, total_guests=4',
    '- "3 adulti" -> guests_adults=3, total_guests=3',
    '- NICIODATA nu pune 1 oaspete daca mesajul mentioneaza clar mai multi',
    '- Cauta cuvinte: adulti, copii, persoane, oaspeti, noi, familie, grup',
    '',
    'REGULI TELEFON (CRITIC):',
    '- Cauta orice numar de telefon in text: +40xxx, 07xx, 06xx, numar international',
    '- Daca e o poza/screenshot de pe WhatsApp, cauta numarul expeditorului din header',
    '- Formateaza ca "+40XXXXXXXXX" daca e roman, altfel pastreaza formatul original',
    '- Daca gasesti telefon in imagine (header WhatsApp, profil), extrage-l',
    '',
    'Format JSON cerut:',
    '{"booking_data":{"phone_number":null,"check_in":"YYYY-MM-DD","check_out":"YYYY-MM-DD","nights":1,"guests_adults":1,"guests_children":0,"total_guests":1,"preferences":[],"raw_summary":"rezumat","nume_client":null,"email":null,"buget_per_noapte":null,"canal":"whatsapp","limba":"ro"}}',
    '',
    'Mesaj de analizat:',
    text || '(din imagine)',
  ].join('\n')

  const extractRaw = await callClaude(extractPrompt, imageBase64, imageType)
  let extracted: any = {}
  try {
    const parsed = JSON.parse(extractRaw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim())
    // Handle both {booking_data:{...}} and flat {...}
    const bd = parsed.booking_data || parsed
    extracted = {
      nome_client: bd.nume_client || null,
      telefon: bd.phone_number || null,
      email: bd.email || null,
      data_checkin: bd.check_in || null,
      data_checkout: bd.check_out || null,
      nr_persoane: bd.total_guests || ((bd.guests_adults||1) + (bd.guests_children||0)),
      buget_per_noapte: bd.buget_per_noapte || null,
      preferinte: Array.isArray(bd.preferences) ? bd.preferences.join(', ') : (bd.preferences || null),
      canal: bd.canal || 'whatsapp',
      limba: bd.limba || 'ro',
      urgenta: false,
      observatii: bd.raw_summary || null,
      guests_adults: bd.guests_adults || 1,
      guests_children: bd.guests_children || 0,
      nights_raw: bd.nights || null,
    }
  } catch {}

  // ── Disponibilitate: TOATE apartamentele, cu motivul cand nu se pot propune ──
  // Rezervarile ramase fara camera in 5starDesk (NEALOCAT) nu blocheaza apartamentul pe care stateau.
  const allApts = apts || []
  const nopti = extracted.data_checkin && extracted.data_checkout
    ? Math.max(1, Math.round((new Date(extracted.data_checkout).getTime() - new Date(extracted.data_checkin).getTime()) / 86400000))
    : extracted.nights_raw || null
  const ocupatDe: Record<string, string[]> = {}
  if (extracted.data_checkin && extracted.data_checkout) {
    const conflicts = await sbFetch(
      'rezervari?select=apartament_id,nume_client,data_checkin,data_checkout,camera_semnalata&status_rezervare=neq.anulata' +
      '&data_checkin=lt.' + extracted.data_checkout + '&data_checkout=gt.' + extracted.data_checkin
    )
    for (const r of (Array.isArray(conflicts) ? conflicts : [])) {
      if (r.camera_semnalata === 'NEALOCAT') continue
      ;(ocupatDe[r.apartament_id] ||= []).push(`${r.nume_client} (${r.data_checkin}→${r.data_checkout})`)
    }
  }
  // Repere de pret: Booking pe acea data (Preturi live, ultimele 30 zile) si ultimul pret vandut direct
  const pretBooking: Record<string, number> = {}
  if (extracted.data_checkin) {
    const pl = await sbFetch('preturi_live?select=apartament_id,pret_booking,oaspeti,updated_at&data_checkin=eq.' + extracted.data_checkin + '&order=updated_at.desc')
    const prag = Date.now() - 30 * 86400000
    for (const r of (Array.isArray(pl) ? pl : [])) if (r.pret_booking && new Date(r.updated_at).getTime() > prag && !pretBooking[r.apartament_id]) pretBooking[r.apartament_id] = Number(r.pret_booking)
  }
  const pretDirect: Record<string, number> = {}
  const directe = await sbFetch('rezervari?select=apartament_id,suma_incasata,data_checkin,data_checkout&canal=in.(direct,intern)&status_rezervare=neq.anulata&suma_incasata=gt.0&order=data_checkin.desc&limit=300')
  for (const r of (Array.isArray(directe) ? directe : [])) {
    if (pretDirect[r.apartament_id]) continue
    const n = Math.max(1, Math.round((new Date(r.data_checkout).getTime() - new Date(r.data_checkin).getTime()) / 86400000))
    pretDirect[r.apartament_id] = Math.round(Number(r.suma_incasata) / n)
  }
  const nrPers = Number(extracted.nr_persoane) || 0
  type AptSB = { id: string; nota: string|null; nume: string; zona: string|null; adresa: string|null; capacitate_max: number|null; link_site: string|null; administrare: boolean
    disponibil: boolean; ocupat_de: string[]; capacitate_ok: boolean; pret_noapte: number; pret_booking: number|null; pret_direct_recent: number|null; scor: number|null; motiv: string|null }
  const lista: AptSB[] = (allApts as any[]).map((a: any) => {
    const ocupat = ocupatDe[a.id] || []
    const capOk = !nrPers || !a.capacitate_max || Number(a.capacitate_max) >= nrPers
    return {
      id: a.id, nota: a.nota, nume: a.nume, zona: a.zona, adresa: a.adresa, capacitate_max: a.capacitate_max,
      link_site: a.link_site || null, administrare: !!a.comision_tip && a.comision_tip !== 'fara_comision',
      // Disponibil = doar neocupat (cerut direct: "nu seta tu prea mic - e posibil sa nu stii, doar ocupat");
      // capacitatea ramane informativa (si conteaza la scorul AI), nu mai exclude apartamentul
      disponibil: !ocupat.length, ocupat_de: ocupat, capacitate_ok: capOk,
      pret_noapte: Number(a.pret_standard) || 0, pret_booking: pretBooking[a.id] || null, pret_direct_recent: pretDirect[a.id] || null,
      scor: null, motiv: null,
    }
  })
  const available = lista.filter(x => x.disponibil)

  // AI: scor + motiv pentru FIECARE apartament disponibil (tu alegi apoi ce propui)
  if (available.length) {
    const recPrompt = [
      'Clientul cauta cazare in Iasi: ' + (extracted.data_checkin || '?') + ' → ' + (extracted.data_checkout || '?') + (nopti ? ` (${nopti} nopti)` : '') + ', ' + (extracted.nr_persoane || '?') + ' persoane' +
        (extracted.guests_children ? ` (din care ${extracted.guests_children} copii)` : '') + ', buget/noapte: ' + (extracted.buget_per_noapte || 'nespecificat') + ', preferinte: ' + (extracted.preferinte || 'niciuna') + '.',
      'Mesajul clientului: """' + String(text || '(din imagine)').slice(0, 1500) + '"""',
      '',
      'APARTAMENTE DISPONIBILE:',
      // coduri simple A1, A2... (numele interne pot avea spatii/diacritice si nu se potriveau inapoi - Cherry 3 ramanea fara scor)
      available.map((a, i) => `[A${i + 1}] ${String(a.nume).trim()} | max ${a.capacitate_max || '?'} pers | ${a.pret_noapte || '?'} lei/noapte | zona ${a.zona || '-'} | ${a.adresa || ''}`).join('\n'),
      '',
      'Da un scor 1-10 de potrivire pentru FIECARE apartament de mai sus (zona, buget, preferinte, capacitate) si un motiv de max 10 cuvinte, in romana.',
      'Nr. de persoane poate fi estimat gresit din mesaj (ex. "2 familii") - nu penaliza puternic capacitatea; mentioneaza-o in motiv doar daca e clar insuficienta.',
      'Raspunde DOAR JSON: {"scoruri":[{"cod":"A1","scor":8,"motiv":"..."}]}  (cod = exact codul din paranteze, ex. A1)',
    ].join('\n')
    try {
      const recRaw = await callClaude(recPrompt)
      const j = JSON.parse(recRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
      for (const sc of (j.scoruri || [])) {
        const k = String(sc.cod || '').replace(/[\[\]\s]/g, '').toUpperCase()
        const t = /^A\d+$/.test(k) ? available[Number(k.slice(1)) - 1] : undefined
        if (t) { t.scor = Number(sc.scor) || null; t.motiv = sc.motiv || null }
      }
    } catch {}
  }
  lista.sort((a, b) => (Number(b.disponibil) - Number(a.disponibil)) || ((b.scor || 0) - (a.scor || 0)) || String(a.nota || a.nume).localeCompare(String(b.nota || b.nume)))

  return NextResponse.json({
    ok: true,
    result: {
      ...extracted,
      nume_client: extracted.nome_client,
      nr_nopti: nopti,
      apartamente: lista,
      disponibile: available.length,
      indisponibile: lista.length - available.length,
      // compatibilitate cu pagina veche /smart-booking
      apartamente_recomandate: available.filter(a => a.scor).slice(0, 3).map(a => ({ nota: a.nota, nume: a.nume, motiv: a.motiv, pret_noapte: a.pret_noapte, pret_total: nopti ? a.pret_noapte * nopti : null, scor: a.scor })),
    }
  })
}

