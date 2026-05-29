import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

const BIZ_CODES: Record<string, string> = {
  '01': 'Property Management',
  '02': 'Marketplace',
  '03': 'Spalatorie',
  '04': 'Personal',
  '05': 'Admin',
  '06': 'Financiar',
}

function getDateMap() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
  const add = (days: number) => { const d = new Date(now); d.setDate(now.getDate()+days); return fmt(d) }
  const days = ['duminica','luni','marti','miercuri','joi','vineri','sambata']
  const nextDays: Record<string, string> = {}
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now); d.setDate(now.getDate()+i)
    nextDays[days[d.getDay()]] = fmt(d)
  }
  const endOfMonth = new Date(now.getFullYear(), now.getMonth()+1, 0)
  return {
    today: fmt(now), tomorrow: add(1), in2days: add(2),
    endOfWeek: add(7 - now.getDay()), in7days: add(7),
    in14days: add(14), in30days: add(30), endOfMonth: fmt(endOfMonth),
    ...nextDays,
  }
}

// Client-side date detection as fallback
function detectDate(text: string, dateMap: Record<string, string>): string | null {
  const t = text.toLowerCase()
  if (/azi|astazi|astăzi|acum|azi/.test(t)) return dateMap.today
  if (/mâine|maine/.test(t)) return dateMap.tomorrow
  if (/poimâine|poimaine/.test(t)) return dateMap.in2days
  if (/săptămâna asta|saptamana asta|această săptămână/.test(t)) return dateMap.endOfWeek
  if (/săptămâna viitoare|saptamana viitoare/.test(t)) return dateMap.in7days
  if (/2 săptămâni|2 saptamani/.test(t)) return dateMap.in14days
  if (/luna asta|această lună|aceasta luna/.test(t)) return dateMap.endOfMonth
  if (/luna viitoare|luna urmatoare/.test(t)) return dateMap.in30days
  for (const [day, date] of Object.entries(dateMap)) {
    if (['luni','marti','miercuri','joi','vineri','sambata','duminica'].includes(day) && t.includes(day)) return date
  }
  return null
}

export async function POST(req: NextRequest) {
  const { text, forcedBiz, forcedDate } = await req.json()
  const dateMap = getDateMap()

  // Client-side date detection first
  const clientDate = forcedDate !== undefined ? forcedDate : detectDate(text, dateMap)

  const codeMatch = text.match(/^(\d{2})\s+/)
  const detectedBiz = codeMatch ? BIZ_CODES[codeMatch[1]] : null
  const activeBiz = forcedBiz || detectedBiz
  const cleanText = codeMatch ? text.replace(/^\d{2}\s+/, '') : text

  const prompt = [
    'Esti asistentul AI al lui Razvan, antreprenor roman.',
    activeBiz ? ('Business FORTAT: ' + activeBiz + ' — NU schimba!') : '',
    '',
    'Transforma textul intr-un task profesional. JSON STRICT, fara alt text:',
    '{"titlu":"VERB INFINITIV + obiect concret (ex: Plateste taxele ABXHOMES si AB Homes Invest)","descriere":"context relevant","prioritate":"urgenta|normala|scazuta","business":"categorie","data_limita":"' + (clientDate || 'null') + '","impact_score":7,"effort_score":4,"persoana":null,"rationale":"motiv scurt"}',
    '',
    'IMPORTANT titlu: NU copia textul original. Reformuleaza ca actiune clara cu verb (Plateste/Verifica/Suna/Trimite/Contacteaza etc)',
    '',
    activeBiz ? '' : 'Business (alege unul): apartament/Booking/Airbnb/cazare→Property Management | produs/comanda/stoc→Marketplace | spalat/rufa→Spalatorie | factura/TVA/contabil/taxe→Financiar | altceva→Personal',
    '',
    clientDate ? ('Data limita SETATA: ' + clientDate + ' — pune aceasta valoare in data_limita!') : 'Data: detecteaza din text (azi=' + dateMap.today + ', maine=' + dateMap.tomorrow + ') sau null',
    '',
    'Text: ' + cleanText,
  ].filter(Boolean).join('\n')

  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
      }),
    }
  )

  const data = await res.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (activeBiz) parsed.business = activeBiz
    // Always override date if client detected one
    if (clientDate !== null && clientDate !== undefined) parsed.data_limita = clientDate || null
    return NextResponse.json({ content: [{ text: JSON.stringify(parsed) }] })
  } catch {
    return NextResponse.json({ content: [{ text: cleaned }] })
  }
}
