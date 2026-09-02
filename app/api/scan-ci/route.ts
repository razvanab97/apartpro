import { NextRequest, NextResponse } from 'next/server'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

// Folosea Gemini cu o cheie hardcodata care a expirat/a devenit invalida (401
// "invalid authentication credentials") - trecut pe OpenAI, aceeasi cheie deja
// folosita si functionala pentru restul rutelor AI din aplicatie (/api/ai etc.)
export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType } = await req.json()
    if (!base64Data) return NextResponse.json({ success: false, error: 'No image' }, { status: 400 })

    const prompt = 'Ești expert în citirea actelor de identitate românești. Din această imagine extrage:\n' +
      '- Numele complet (Prenume Nume)\n' +
      '- CNP-ul (13 cifre)\n' +
      'Răspunde STRICT doar cu JSON, fără nimic altceva: {"nume":"Ion Popescu","cnp":"1234567890123"}. ' +
      'Dacă nu poți citi clar un câmp, pune string gol pentru el. Nu inventa date.'

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}` } },
          ],
        }],
      }),
    })

    const data = await res.json()
    if (data.error) {
      console.error('scan-ci OpenAI error:', res.status, JSON.stringify(data.error))
      return NextResponse.json({ success: false, error: data.error.message || 'Eroare la scanare' }, { status: 200 })
    }

    const rawText = data.choices?.[0]?.message?.content || '{}'
    let parsed: any = {}
    try { parsed = JSON.parse(rawText) } catch {}

    if (parsed.nume) {
      parsed.nume = String(parsed.nume)
        .split(' ')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .trim()
    }

    return NextResponse.json({
      success: true,
      nume: parsed.nume || '',
      cnp: parsed.cnp || '',
      raw: rawText,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 200 })
  }
}
