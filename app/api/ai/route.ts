import { NextRequest, NextResponse } from 'next/server'

const BIZ_CODES: Record<string, string> = {
  '01': 'Property Management', '02': 'Marketplace',
  '03': 'Spalatorie', '04': 'Personal', '05': 'Admin', '06': 'Financiar',
}

function detectDate(text: string): string | null {
  const t = text.toLowerCase()
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
  const add = (n: number) => { const d = new Date(now); d.setDate(now.getDate()+n); return fmt(d) }

  // Exact date formats: 31.05 / 31/05 / 31.05.2026 / 2026-05-31
  const exactFull = t.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (exactFull) return `${exactFull[1]}-${pad(Number(exactFull[2]))}-${pad(Number(exactFull[3]))}`
  const exactShort = t.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?/)
  if (exactShort) {
    const year = exactShort[3] || String(now.getFullYear())
    return `${year}-${pad(Number(exactShort[2]))}-${pad(Number(exactShort[1]))}`
  }

  if (/\bazi\b|astazi|astăzi|\bacum\b/.test(t)) return fmt(now)
  if (/\bmâine\b|\bmaine\b/.test(t)) return add(1)
  if (/poimâine|poimaine/.test(t)) return add(2)
  if (/săptămâna asta|saptamana asta/.test(t)) return add(7 - now.getDay())
  if (/săptămâna viitoare|saptamana viitoare/.test(t)) return add(7)
  if (/luna asta|această lună|aceasta luna/.test(t)) return fmt(new Date(now.getFullYear(), now.getMonth()+1, 0))
  if (/luna viitoare/.test(t)) return add(30)

  const weekdays: Record<string, number> = { luni:1, marti:2, miercuri:3, joi:4, vineri:5, sambata:6, duminica:0 }
  for (const [day, dow] of Object.entries(weekdays)) {
    if (t.includes(day)) { const diff = (dow - now.getDay() + 7) % 7 || 7; return add(diff) }
  }
  return null
}

export async function POST(req: NextRequest) {
  const { text, forcedBiz, forcedDate } = await req.json()

  const detectedDate = detectDate(text)
  const finalDate = (forcedDate !== undefined && forcedDate !== null && forcedDate !== '') ? forcedDate : detectedDate

  const codeMatch = text.match(/^(\d{2})\s+/)
  const activeBiz = forcedBiz || (codeMatch ? BIZ_CODES[codeMatch[1]] : null)
  const cleanText = codeMatch ? text.replace(/^\d{2}\s+/, '') : text

  const jsonTemplate = '{"titlu":"VERB infinitiv + obiect concis","descriere":"detalii","prioritate":"urgenta|normala|scazuta","business":"auto","data_limita":"PLACEHOLDER","impact_score":7,"effort_score":4,"persoana":null,"rationale":"motiv"}'

  const promptLines = [
    'Esti asistentul AI al lui Razvan, antreprenor roman.',
    activeBiz ? ('Business: ' + activeBiz + ' (nu schimba!)') : '',
    '',
    'Transforma textul intr-un task. Returneaza DOAR JSON:',
    jsonTemplate,
    '',
    'TITLU: NU copia textul. Reformuleaza cu verb actiune: Plateste/Mergi/Verifica/Suna/Trimite/Contacteaza',
    activeBiz ? '' : 'BUSINESS: apartament/Booking/Airbnb→Property Management | produs→Marketplace | spalat→Spalatorie | factura/TVA/taxe→Financiar | altceva→Personal',
    'DATA_LIMITA: pune exact ' + (finalDate ? finalDate : 'null'),
    '',
    'Text: ' + cleanText,
  ]

  const prompt = promptLines.filter(Boolean).join('\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': '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',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  const raw = data.content?.[0]?.text || '{}'
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (activeBiz) parsed.business = activeBiz
    parsed.data_limita = finalDate || null
    if (!parsed.titlu || parsed.titlu.length < 4) parsed.titlu = cleanText.slice(0, 60)
    return NextResponse.json({ content: [{ text: JSON.stringify(parsed) }] })
  } catch {
    return NextResponse.json({ content: [{ text: cleaned }] })
  }
}
