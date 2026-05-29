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

export async function POST(req: NextRequest) {
  const { text, forcedBiz } = await req.json()
  const today = new Date().toISOString().split('T')[0]

  // Detect code prefix like "01 ..." from text
  const codeMatch = text.match(/^(\d{2})\s+/)
  const detectedBiz = codeMatch ? BIZ_CODES[codeMatch[1]] : null
  const activeBiz = forcedBiz || detectedBiz
  const cleanText = codeMatch ? text.replace(/^\d{2}\s+/, '') : text

  const bizHint = activeBiz ? 'Business FORTAT: ' + activeBiz + '. Nu schimba business-ul.' : ''

  const prompt = [
    'Esti un asistent AI pentru Razvan, antreprenor roman.',
    bizHint,
    '',
    'Azi este ' + today + '.',
    '',
    'Transforma textul intr-un task clar. Returneaza STRICT JSON valid, fara text inainte sau dupa:',
    '{"titlu":"verb infinitiv + obiect specific max 60 chars","descriere":"context util","prioritate":"urgenta|normala|scazuta","business":"' + (activeBiz || 'auto-detect') + '","data_limita":"YYYY-MM-DD sau null","impact_score":7,"effort_score":4,"persoana":null,"rationale":"motiv"}',
    '',
    activeBiz ? '' : 'Reguli business auto-detect:\n- apartament/Booking/Airbnb/oaspete → Property Management\n- produs/comanda/stoc → Marketplace\n- spalat/rufa → Spalatorie\n- factura/TVA/contabil → Financiar\n- altceva → Personal',
    '',
    'Reguli titlu: verb infinitiv + obiect specific',
    'Reguli data_limita: "saptamana asta"→+5 zile, "maine"→+1 zi, "luna asta"→sfarsit luna, altfel→null',
    '',
    'Text: ' + cleanText
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

  // If business was forced, inject it into result
  try {
    const parsed = JSON.parse(cleaned)
    if (activeBiz) parsed.business = activeBiz
    return NextResponse.json({ content: [{ text: JSON.stringify(parsed) }] })
  } catch {
    return NextResponse.json({ content: [{ text: cleaned }] })
  }
}
