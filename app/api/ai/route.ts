import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY =  + GEMINI_KEY + 

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
  
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const in2days = new Date(now); in2days.setDate(now.getDate() + 2)
  const in3days = new Date(now); in3days.setDate(now.getDate() + 3)
  const in5days = new Date(now); in5days.setDate(now.getDate() + 5)
  const in7days = new Date(now); in7days.setDate(now.getDate() + 7)
  const in14days = new Date(now); in14days.setDate(now.getDate() + 14)
  const in30days = new Date(now); in30days.setDate(now.getDate() + 30)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth()+1, 0)
  const endOfWeek = new Date(now); endOfWeek.setDate(now.getDate() + (7 - now.getDay()))
  
  // Next weekdays
  const days = ['duminica','luni','marti','miercuri','joi','vineri','sambata']
  const nextDays: Record<string, string> = {}
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i)
    nextDays[days[d.getDay()]] = fmt(d)
  }

  return {
    today: fmt(now),
    tomorrow: fmt(tomorrow),
    in2days: fmt(in2days),
    in3days: fmt(in3days),
    in5days: fmt(in5days),
    in7days: fmt(in7days),
    in14days: fmt(in14days),
    in30days: fmt(in30days),
    endOfWeek: fmt(endOfWeek),
    endOfMonth: fmt(endOfMonth),
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

  const dateRef = JSON.stringify(dateMap, null, 2)
  const bizHint = activeBiz ? 'Business FORTAT (nu schimba): ' + activeBiz : ''

  const lines = [
    'Esti un asistent AI pentru Razvan, antreprenor roman.',
    bizHint,
    '',
    'REFERINTA DATE (foloseste aceste valori exacte pentru data_limita):',
    dateRef,
    '',
    'Transforma textul intr-un task. Returneaza STRICT JSON valid, fara text inainte sau dupa:',
    '{"titlu":"verb infinitiv + obiect max 60 chars","descriere":"context util","prioritate":"urgenta|normala|scazuta","business":"' + (activeBiz || 'auto') + '","data_limita":"YYYY-MM-DD din referinta sau null","impact_score":7,"effort_score":4,"persoana":null,"rationale":"motiv"}',
    '',
    activeBiz ? '' : 'Reguli business: apartament/Booking/Airbnb→Property Management, produs/comanda→Marketplace, spalat/rufa→Spalatorie, factura/TVA→Financiar, altceva→Personal',
    '',
    'Reguli data_limita (foloseste valorile EXACTE din referinta):',
    '"astazi"/"azi"/"acum" → ' + dateMap.today,
    '"maine" → ' + dateMap.tomorrow,
    '"poimaine" → ' + dateMap.in2days,
    '"saptamana asta"/"in curand" → ' + dateMap.endOfWeek,
    '"saptamana viitoare" → ' + dateMap.in7days,
    '"in 2 saptamani" → ' + dateMap.in14days,
    '"luna asta" → ' + dateMap.endOfMonth,
    '"luna viitoare" → ' + dateMap.in30days,
    '"luni"/"marti"/"miercuri"/"joi"/"vineri" → ziua urmatoare din referinta',
    'fara mentiune de timp → null',
    '',
    'Text: ' + cleanText
  ].filter(l => l !== undefined)

  const prompt = lines.join('\n')

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
