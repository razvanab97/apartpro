import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  const today = new Date().toISOString().split('T')[0]

  const prompt = [
    'Esti un asistent AI pentru Razvan, antreprenor roman cu: apartamente regim hotelier (AB Homes Iasi), marketplace online, spalatorie.',
    '',
    'Azi este ' + today + '.',
    '',
    'Transforma textul intr-un task clar. Returneaza STRICT JSON valid, fara text inainte sau dupa, fara backticks:',
    '{"titlu":"verb infinitiv + obiect specific max 60 chars","descriere":"context util","prioritate":"urgenta|normala|scazuta","business":"Property Management|Marketplace|Spalatorie|Personal|Admin|Financiar","data_limita":"YYYY-MM-DD sau null","impact_score":7,"effort_score":4,"persoana":null,"rationale":"motiv scurt"}',
    '',
    'Reguli business:',
    '- apartament/Booking/Airbnb/oaspete/check-in/apartament → Property Management',
    '- produs/comanda/stoc/livrare → Marketplace',
    '- spalat/rufa/masina → Spalatorie',
    '- factura/TVA/contabil/ANAF → Financiar',
    '- altceva → Personal',
    '',
    'Reguli titlu: verb la infinitiv + obiect (ex: "Suna furnizorul", "Verifica check-out Vila Pacurari")',
    'Reguli data_limita: "saptamana asta" → +5 zile, "maine" → +1 zi, "luna asta" → sfarsit luna, altfel → null',
    '',
    'Text: ' + text
  ].join('\n')

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

  return NextResponse.json({ content: [{ text: cleaned }] })
}
