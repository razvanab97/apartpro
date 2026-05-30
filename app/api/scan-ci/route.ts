import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType } = await req.json()
    if (!base64Data) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const prompt = `Ești expert în citirea actelor de identitate românești și europene.
Analizează cu atenție această imagine a unui act de identitate (buletin, carte de identitate, pașaport).
Extrage EXACT urmatoarele informatii vizibile:
- Numele complet al persoanei (SURNAME/Prenume + Name/Nume)
- CNP-ul (seria si numarul sau codul numeric personal - 13 cifre)
- Data nasterii
- Cetatenia/nationalitatea
- Adresa (daca e vizibila)

IMPORTANT: 
- Combina corect prenumele si numele in ordinea obisnuita: Prenume Nume
- Daca numele e scris cu majuscule pe act, converteste la forma normala (ex: POPESCU ION -> Ion Popescu)
- Returneaza DOAR un obiect JSON valid, fara text suplimentar, fara markdown, fara backtick-uri
- Formatul exact: {"nume":"Prenume Nume","cnp":"1234567890123","data_nasterii":"DD.MM.YYYY","cetatenie":"Romana","adresa":"strada, nr, oras"}`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
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
          generationConfig: { temperature: 0, maxOutputTokens: 512 }
        })
      }
    )

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message || 'Gemini error', raw: data }, { status: 500 })
    }

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    // clean any markdown artifacts
    const cleaned = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .replace(/^\s*\n/gm, '')
      .trim()

    let parsed: any = {}
    try {
      // try direct parse
      parsed = JSON.parse(cleaned)
    } catch {
      // try to extract JSON object from text
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) } catch { parsed = {} }
      }
    }

    // normalize name
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
      data_nasterii: parsed.data_nasterii || '',
      cetatenie: parsed.cetatenie || '',
      adresa: parsed.adresa || '',
      raw: cleaned
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
