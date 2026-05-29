import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  
  const today = new Date().toISOString().split('T')[0]

  const prompt = `Ești un asistent AI pentru Razvan, antreprenor român cu: apartamente regim hotelier (AB Homes Iași), marketplace online, spălătorie.

Azi este ${today}.

Transformă textul de mai jos într-un task clar și returnează STRICT un JSON valid (fără text înainte sau după, fără \`\`\`):

Reguli business:
- apartament/Booking/Airbnb/oaspete/check-in → "Property Management"  
- produs/comandă/stoc/livrare → "Marketplace"
- spălat/rufă/mașină → "Spalatorie"
- factură/TVA/contabil/ANAF → "Financiar"
- altceva → "Personal"

Reguli titlu: verb la infinitiv + obiect specific (ex: "Suna furnizorul de prosoape", "Verifica check-out Vila Pacurari", "Trimite factura la Booking")

Reguli data_limita: dacă textul menționează "săptămâna asta" → peste 5 zile, "mâine" → mâine, "marți" → calculează, "luna asta" → ultimul zi al lunii, altfel → null

Text de clasificat: ${text}

Răspunde DOAR cu JSON, nimic altceva:
{"titlu":"...","descriere":"...","prioritate":"urgenta|normala|scazuta","business":"...","data_limita":"YYYY-MM-DD sau null","impact_score":7,"effort_score":4,"persoana":null,"rationale":"..."}` 

  const res = await fetch(
    \`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}\`,
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
  
  // Clean response - remove markdown fences if present
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  
  return NextResponse.json({ content: [{ text: cleaned }] })
}
