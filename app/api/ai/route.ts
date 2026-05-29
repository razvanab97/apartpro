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

export async function POST(req: NextRequest) {
  const { text, forcedBiz } = await req.json()
  const dateMap = getDateMap()
  const codeMatch = text.match(/^(\d{2})\s+/)
  const detectedBiz = codeMatch ? BIZ_CODES[codeMatch[1]] : null
  const activeBiz = forcedBiz || detectedBiz
  const cleanText = codeMatch ? text.replace(/^\d{2}\s+/, '') : text

  const prompt = [
    'Esti un asistent AI pentru Razvan, antreprenor roman.',
    activeBiz ? ('Business FORTAT (nu schimba): ' + activeBiz) : '',
    '',
    'REFERINTA DATE (foloseste valorile EXACTE):',
    JSON.stringify(dateMap),
    '',
    'Returneaza STRICT JSON valid, fara text inainte sau dupa:',
    '{"titlu":"verb infinitiv + obiect max 60 chars","descriere":"context","prioritate":"urgenta|normala|scazuta","business":"auto","data_limita":"YYYY-MM-DD sau null","impact_score":7,"effort_score":4,"persoana":null,"rationale":"motiv"}',
    '',
    activeBiz ? '' : 'Reguli business: apartament/Booking/Airbnb→Property Management, produs/comanda→Marketplace, spalat/rufa→Spalatorie, factura/TVA→Financiar, altceva→Personal',
    '',
    'Reguli data_limita (alege din referinta):',
    '"azi"/"astazi"/"acum" → ' + dateMap.today,
    '"maine" → ' + dateMap.tomorrow,
    '"poimaine" → ' + dateMap.in2days,
    '"saptamana asta" → ' + dateMap.endOfWeek,
    '"saptamana viitoare" → ' + dateMap.in7days,
    '"in 2 saptamani" → ' + dateMap.in14days,
    '"luna asta" → ' + dateMap.endOfMonth,
    '"luna viitoare" → ' + dateMap.in30days,
    '"luni"/"marti" etc → ziua din referinta nextDays',
    'fara mentiune timp → null',
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
    return NextResponse.json({ content: [{ text: JSON.stringify(parsed) }] })
  } catch {
    return NextResponse.json({ content: [{ text: cleaned }] })
  }
}
