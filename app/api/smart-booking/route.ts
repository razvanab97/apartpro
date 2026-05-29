import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY
const SUPABASE_URL = 'https://lsmraxevzkmupaidianv.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzbXJheGV2emttdXBhaWRpYW52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkwMDA5NywiZXhwIjoyMDk1NDc2MDk3fQ.CagkIVPFE6r8D1oZPoxvs3jzJDR3HSwtx0GzM0etpss'

async function sbFetch(path: string) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    }
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  const { text, imageBase64, imageType } = await req.json()
  const today = new Date().toISOString().split('T')[0]

  // Step 1: Get all apartments from Supabase
  const apts = await sbFetch('apartamente?select=id,nota,nume,capacitate_max,pret_standard,adresa,dotari,reguli&status=eq.activ&order=nota')

  // Step 2: First AI call - extract info from message
  const extractPrompt = [
    'Extrage informatiile din mesajul de mai jos. Returneaza DOAR JSON valid:',
    '{"nume_client":null,"telefon":null,"data_checkin":"YYYY-MM-DD sau null","data_checkout":"YYYY-MM-DD sau null","nr_persoane":null,"buget_per_noapte":null,"preferinte":"zona/dotari mentionate sau null","canal":"whatsapp|airbnb|booking|email|direct","limba":"ro|en|fr|de|other","urgenta":false}',
    '',
    'Pentru date: calculeaza fata de azi ' + today,
    'Exemplu: "15-18 iunie" -> checkin 2026-06-15, checkout 2026-06-18',
    '',
    'Mesaj:',
    text || '(imagine)'
  ].join('\n')

  const parts: any[] = [{ text: extractPrompt }]
  if (imageBase64) {
    parts[0].text = extractPrompt.replace('Mesaj:', 'Mesaj (din imagine):')
    parts.push({ inline_data: { mime_type: imageType || 'image/jpeg', data: imageBase64 } })
  }

  const extractRes = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
    }),
  })
  const extractData = await extractRes.json()
  const extractRaw = extractData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  let extracted: any = {}
  try { extracted = JSON.parse(extractRaw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()) } catch {}

  // Step 3: Check availability for each apartment
  let available: any[] = []
  let unavailable: any[] = []

  if (extracted.data_checkin && extracted.data_checkout) {
    // Get conflicting reservations
    const conflicts = await sbFetch(
      'rezervari?select=apartament_id&status_rezervare=in.(confirmata,finalizata)' +
      '&data_checkin=lt.' + extracted.data_checkout +
      '&data_checkout=gt.' + extracted.data_checkin
    )
    const occupiedIds = new Set((conflicts || []).map((r: any) => r.apartament_id))

    for (const apt of apts || []) {
      if (occupiedIds.has(apt.id)) {
        unavailable.push(apt)
      } else {
        available.push(apt)
      }
    }
  } else {
    available = apts || []
  }

  // Step 4: Filter by nr_persoane
  if (extracted.nr_persoane) {
    available = available.filter((a: any) => !a.capacitate_max || a.capacitate_max >= extracted.nr_persoane)
  }

  // Step 5: Second AI call - recommend from available apartments
  const availCtx = available.map((a: any) =>
    '[' + (a.nota||'?') + '] ' + a.nume + ' — ' + (a.capacitate_max||'?') + ' pers max, ' +
    (a.pret_standard||'?') + ' RON/noapte, ' + (a.adresa||'')
  ).join('\n')

  const nopti = extracted.data_checkin && extracted.data_checkout
    ? Math.ceil((new Date(extracted.data_checkout).getTime() - new Date(extracted.data_checkin).getTime()) / 86400000)
    : null

  const recommendPrompt = [
    'Esti asistentul AB Homes Iasi. Clientul a cerut:',
    '- Perioada: ' + (extracted.data_checkin || '?') + ' → ' + (extracted.data_checkout || '?') + (nopti ? ' (' + nopti + ' nopti)' : ''),
    '- Persoane: ' + (extracted.nr_persoane || 'nespecificat'),
    '- Buget/noapte: ' + (extracted.buget_per_noapte || 'nespecificat'),
    '- Preferinte: ' + (extracted.preferinte || 'nicio preferinta'),
    '',
    'APARTAMENTE DISPONIBILE (' + available.length + '):',
    availCtx || 'Niciun apartament disponibil',
    '',
    'Returneaza DOAR JSON:',
    '{"apartamente_recomandate":[{"nota":"cod","nume":"nume","motiv":"de ce se potriveste in 10 cuvinte","pret_total":0,"scor":9}],"raspuns_sugerat":"mesaj catre client in limba ' + (extracted.limba||'ro') + ', warm, max 3 randuri, mentioneaza apartamentele recomandate si pretul total","rezumat":"1 fraza despre cerere"}',
    '',
    'Reguli:',
    '- Max 3 recomandari, sortate dupa potrivire',
    '- pret_total = pret_standard * nr_nopti (sau per noapte daca nr_nopti necunoscut)',
    '- Mentioneaza daca bugetul e depasit',
    '- Raspunsul sa fie in ' + (extracted.limba === 'en' ? 'engleza' : extracted.limba === 'fr' ? 'franceza' : 'romana'),
  ].join('\n')

  const recRes = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: recommendPrompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
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
      indisponibile_apt: unavailable.map((a: any) => a.nota + ' ' + a.nume),
    }
  })
}
