import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType } = await req.json()
    if (!base64Data) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const prompt = `Esti expert in citirea actelor de identitate. Din aceasta imagine extrage:
- Numele complet (Prenume Nume)
- CNP-ul (13 cifre)
Raspunde STRICT doar cu JSON, fara nimic altceva: {"nume":"Ion Popescu","cnp":"1234567890123"}`

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

    // Returnam tot raspunsul pentru debug
    if (!geminiResp.ok) {
      return NextResponse.json({
        success: false,
        error: geminiData?.error?.message || 'Gemini API error',
        status: geminiResp.status,
        geminiData
      }, { status: 200 })
    }

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Curata si parseaza
    const cleaned = rawText.replace(/```json/gi,'').replace(/```/g,'').trim()
    let parsed: any = {}

    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[^}]+\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) } catch {}
      }
    }

    // Normalizeaza numele
    if (parsed.nume) {
      parsed.nume = parsed.nume
        .split(' ')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .trim()
    }

    return NextResponse.json({
      success: true,
      nume: parsed.nume || '',
      cnp: parsed.cnp || '',
      raw: rawText
    })

  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 200 })
  }
}
