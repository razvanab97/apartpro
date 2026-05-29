import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY
const SUPABASE_URL = 'https://lsmraxevzkmupaidianv.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzbXJheGV2emttdXBhaWRpYW52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkwMDA5NywiZXhwIjoyMDk1NDc2MDk3fQ.CagkIVPFE6r8D1oZPoxvs3jzJDR3HSwtx0GzM0etpss'

async function sbFetch(path: string) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  })
  return res.json()
}

function buildDateMap() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
  const add = (n: number) => { const d = new Date(now); d.setDate(now.getDate()+n); return fmt(d) }
  const days = ['duminica','luni','marti','miercuri','joi','vineri','sambata']
  const nextDays: Record<string,string> = {}
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now); d.setDate(now.getDate()+i)
    nextDays[days[d.getDay()]] = fmt(d)
  }
  // Next month days 1-31
  const monthDays: Record<string,string> = {}
  for (let day = 1; day <= 31; day++) {
    const d = new Date(now)
    if (day <= d.getDate()) d.setMonth(d.getMonth()+1) // next month if day already passed
    d.setDate(day)
    monthDays['pe ' + day] = fmt(d)
    monthDays['pe ' + pad(day)] = fmt(d)
    monthDays['' + day] = fmt(d)
  }
  return {
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
    ...nextDays,
    ...monthDays,
  }
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
    'Zilele saptamanii: luni=' + dm.luni + ', marti=' + dm.marti + ', miercuri=' + dm.miercuri + ', joi=' + dm.joi + ', vineri=' + dm.vineri + ', sambata=' + dm.sambata + ', duminica=' + dm.duminica,
    'Zile ale lunii: "pe 1"=' + dm['pe 1'] + ', "pe 5"=' + dm['pe 5'] + ', "pe 10"=' + dm['pe 10'] + ', "pe 15"=' + dm['pe 15'] + ', "pe 20"=' + dm['pe 20'] + ', "pe 25"=' + dm['pe 25'] + ', "pe 30"=' + dm['pe 30'],
    'Luna curenta=' + dm.month + ', luna viitoare=' + dm.nextMonth + ', anul=' + dm.year,
  ].join('\n')

  const extractPrompt = [
    'Extrage informatiile dintr-un mesaj de cerere cazare. Returneaza DOAR JSON valid:',
    '{"nume_client":null,"telefon":null,"email":null,"data_checkin":"YYYY-MM-DD","data_checkout":"YYYY-MM-DD","nr_persoane":2,"buget_per_noapte":null,"preferinte":null,"canal":"whatsapp","limba":"ro","urgenta":false,"observatii":null}',
    '',
    'REFERINTA DATE (foloseste valorile EXACTE din lista):',
    dateRef,
    '',
    'REGULI CRITICE:',
    '- Daca mesajul zice "azi" pentru checkin, data_checkin = ' + dm.today,
    '- Daca zice "maine" pentru checkin, data_checkin = ' + dm.tomorrow,
    '- Daca zice "pe 15", calculeaza: daca 15 < ziua de azi (' + today.split('-')[2] + '), e luna viitoare; altfel luna curenta',
    '- "2 nopti" sau "2 zile" inseamna checkout = checkin + 2',
    '- "weekend" = checkin vineri, checkout duminica',
    '- Daca e mentionat doar checkin fara checkout si "X nopti", calculeaza checkout',
    '- Daca nu stii checkout dar stii nr nopti: checkout = checkin + nr_nopti',
    '- canal: daca mesajul pare de pe WhatsApp=whatsapp, Airbnb=airbnb, Booking=booking, altfel=direct',
    '- limba: detecteaza limba mesajului',
    '',
    'Mesaj de analizat:',
    text || '(din imagine)',
  ].join('\n')

  const parts: any[] = [{ text: extractPrompt }]
  if (imageBase64) {
    parts[0].text = extractPrompt
    parts.push({ inline_data: { mime_type: imageType || 'image/jpeg', data: imageBase64 } })
  }

  const extractRes = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
    }),
  })
  const extractData = await extractRes.json()
  const extractRaw = extractData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  let extracted: any = {}
  try { extracted = JSON.parse(extractRaw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()) } catch {}

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
    : null

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
  ].join('\n')

  const recRes = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: recPrompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
    }),
  })
  const recData = await recRes.json()
  const recRaw = recData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
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
