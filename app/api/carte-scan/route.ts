import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType } = await req.json()
    if (!base64Data) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const prompt = `Esti expert in identificarea cartilor dupa coperta. Din aceasta imagine extrage:
- Titlul cartii
- Autorul (daca e vizibil)
Raspunde STRICT doar cu JSON, fara nimic altceva: {"titlu":"Numele cartii","autor":"Numele autorului"}
Daca nu poti citi coperta, raspunde cu {"titlu":"","autor":""}`

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Data } }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 256 }
        })
      }
    )

    const geminiData = await geminiResp.json()

    if (!geminiResp.ok) {
      return NextResponse.json({
        success: false,
        error: geminiData?.error?.message || 'Gemini API error',
      }, { status: 200 })
    }

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()
    let parsed: any = {}

    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[^}]+\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      titlu: parsed.titlu || '',
      autor: parsed.autor || '',
    })

  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 200 })
  }
}
