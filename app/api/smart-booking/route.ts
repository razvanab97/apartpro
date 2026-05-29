import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY =  + GEMINI_KEY + 
const VISION_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY

export async function POST(req: NextRequest) {
  const { text, imageBase64, imageType, apartamente, rezervari } = await req.json()

  const today = new Date().toISOString().split('T')[0]

  // Build context
  const aptsContext = (apartamente || []).map((a: any) =>
    `- [${a.nota || '?'}] ${a.nume}: max ${a.capacitate_max || '?'} pers, ${a.pret_standard || '?'} RON/noapte, ${a.adresa || ''}`
  ).join('\n')

  const prompt = `Ești un asistent AI pentru AB Homes Iași, o firmă de apartamente în regim hotelier.

Azi: ${today}

APARTAMENTE DISPONIBILE:
${aptsContext}

Analizează mesajul de mai jos (poate fi de pe WhatsApp, Airbnb, Booking sau email) și extrage cererea de rezervare.

Returnează STRICT JSON valid, fără text înainte sau după:
{
  "nume_client": "numele extras sau null",
  "telefon": "telefonul extras sau null",
  "email": "emailul extras sau null",
  "data_checkin": "YYYY-MM-DD sau null",
  "data_checkout": "YYYY-MM-DD sau null",
  "nr_persoane": număr sau null,
  "nr_nopti": număr sau null,
  "buget": "bugetul menționat sau null",
  "preferinte": "ce a cerut clientul: zonă, dotări, tip etc.",
  "canal": "whatsapp|airbnb|booking|email|direct",
  "limba": "ro|en|fr|de|other",
  "urgenta": true sau false,
  "apartamente_recomandate": [
    {
      "nota": "codul apartamentului",
      "nume": "numele apartamentului",
      "motiv": "de ce se potrivește în max 15 cuvinte",
      "scor": număr 1-10
    }
  ],
  "raspuns_sugerat": "un mesaj scurt de răspuns către client în limba lui, profesional și warm, max 3 rânduri",
  "observatii": "alte detalii relevante extrase din mesaj"
}

Reguli recomandare apartamente:
- Dacă menționează număr de persoane, filtrează după capacitate
- Dacă menționează zonă (Palas, Copou, centru), recomandă apartamentele din acea zonă
- Dacă menționează buget, prioritizează apartamentele în buget
- Recomandă maxim 3 apartamente, sortate după potrivire
- Dacă nu sunt suficiente detalii, recomandă top 3 după popularitate

Mesaj de analizat:
`

  const parts: any[] = [{ text: prompt + (text || '(mesaj din imagine)') }]

  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: imageType || 'image/jpeg',
        data: imageBase64,
      }
    })
    parts[0].text = prompt + '(vezi imaginea atașată)'
  }

  const res = await fetch(VISION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
    }),
  })

  const data = await res.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return NextResponse.json({ ok: true, result: JSON.parse(cleaned) })
  } catch {
    return NextResponse.json({ ok: false, raw: cleaned })
  }
}
