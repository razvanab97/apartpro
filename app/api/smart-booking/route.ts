import { NextRequest, NextResponse } from 'next/server'

const CLAUDE_KEY = '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'

async function callClaude(prompt: string, imageBase64?: string, imageType?: string): Promise<string> {
  const content: any[] = []
  
  if (imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: imageType || 'image/jpeg', data: imageBase64 }
    })
  }
  content.push({ type: 'text', text: prompt })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content?.[0]?.text || '{}'
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

export async function POST(req: NextRequest) {
  const { text, imageBase64, imageType } = await req.json()

  const dm = buildDateMap()
  const today = dm.today

  // Get apartments
  const apts = await sbFetch('apartamente?select=id,nota,nume,capacitate_max,pret_standard,adresa,dotari&status=eq.activ&order=nota')

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

  // Check availability
  let available: any[] = []
  let unavailable: any[] = []
  const allApts = apts || []

  if (extracted.data_checkin && extracted.data_checkout) {
    const conflicts = await sbFetch(
      'rezervari?select=apartament_id&status_rezervare=in.(confirmata,finalizata)' +
      '&data_checkin=lt.' + extracted.data_checkout +
      '&data_checkout=gt.' + extracted.data_checkin
    )
    const occupiedIds = new Set((conflicts || []).map((r: any) => r.apartament_id))
    for (const apt of allApts) {
      if (occupiedIds.has(apt.id)) unavailable.push(apt)
      else available.push(apt)
    }
  } else {
    available = allApts
  }

  // Filter by capacity
  if (extracted.nr_persoane && extracted.nr_persoane > 0) {
    available = available.filter((a: any) => !a.capacitate_max || Number(a.capacitate_max) >= Number(extracted.nr_persoane))
  }

  const nopti = extracted.data_checkin && extracted.data_checkout
    ? Math.ceil((new Date(extracted.data_checkout).getTime() - new Date(extracted.data_checkin).getTime()) / 86400000)
    : extracted.nights_raw || null

  // Build recommendation prompt
  const availCtx = available.length > 0
    ? available.map((a: any) => {
        const pret = Number(a.pret_standard) || 0
        const total = nopti ? pret * nopti : pret
        return '[' + (a.nota||'?') + '] ' + a.nume +
          ' | ' + (a.capacitate_max||'?') + ' pers max' +
          ' | ' + pret + ' RON/noapte' + (nopti ? ' = ' + total + ' RON total' : '') +
          ' | ' + (a.adresa||'')
      }).join('\n')
    : 'NICIUN APARTAMENT DISPONIBIL in aceasta perioada'

  const recPrompt = [
    'Clientul ' + (extracted.nume_client || 'necunoscut') + ' cauta cazare:',
    '- Check-in: ' + (extracted.data_checkin || 'nespecificat'),
    '- Check-out: ' + (extracted.data_checkout || 'nespecificat'),
    '- Nopti: ' + (nopti || 'necunoscut'),
    '- Persoane: ' + (extracted.nr_persoane || 'nespecificat'),
    '- Buget/noapte: ' + (extracted.buget_per_noapte || 'nespecificat'),
    '- Preferinte: ' + (extracted.preferinte || 'nicio preferinta specifica'),
    '',
    'APARTAMENTE DISPONIBILE (' + available.length + '):',
    availCtx,
    '',
    'Returneaza DOAR JSON:',
    '{"apartamente_recomandate":[{"nota":"cod","nume":"nume apt","motiv":"de ce se potriveste, max 12 cuvinte","pret_noapte":0,"pret_total":0,"scor":9}],"raspuns_sugerat":"mesaj profesional catre client, in limba mesajului, mentioneaza 1-2 optiuni cu pret total, max 4 randuri","rezumat":"1 fraza scurta despre cerere"}',
    '',
    'Reguli:',
    '- Recomanda maxim 3, sortate dupa scor',
    '- Daca niciun apartament nu e disponibil, apartamente_recomandate=[] si explica in raspuns_sugerat',
    '- Potriveste preferintele (zona, dotari, buget)',
    '- Raspunsul sa fie in ' + (extracted.limba === 'en' ? 'engleza' : extracted.limba === 'fr' ? 'franceza' : extracted.limba === 'de' ? 'germana' : 'romana'),
    '- IMPORTANT: Foloseste DOAR emoji Unicode standard in raspuns (ex: 😊 🏠 🔑 ✅ 📅 ⭐). NU folosi simboluri speciale non-emoji precum ◆◇★●►■ care apar ca semne de intrebare pe WhatsApp.',
  ].join('\n')

  const recRaw = await callClaude(recPrompt)
  let recommended: any = {}
  try { recommended = JSON.parse(recRaw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()) } catch {}

  return NextResponse.json({
    ok: true,
    result: {
      ...extracted,
      ...recommended,
      nr_nopti: nopti,
      disponibile: available.length,
      indisponibile: unavailable.length,
      indisponibile_apt: unavailable.map((a: any) => (a.nota||'') + ' ' + a.nume),
    }
  })
}
