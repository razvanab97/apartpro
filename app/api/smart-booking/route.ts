import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'
const VISION_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY

export async function POST(req: NextRequest) {
  const { text, imageBase64, imageType, apartamente } = await req.json()

  const today = new Date().toISOString().split('T')[0]

  const aptsContext = (apartamente || []).map((a: any) =>
    '- [' + (a.nota || '?') + '] ' + a.nume + ': max ' + (a.capacitate_max || '?') + ' pers, ' + (a.pret_standard || '?') + ' RON/noapte, ' + (a.adresa || '')
  ).join('\n')

  const jsonTemplate = '{"nume_client":null,"telefon":null,"email":null,"data_checkin":"YYYY-MM-DD sau null","data_checkout":"YYYY-MM-DD sau null","nr_persoane":null,"nr_nopti":null,"buget":null,"preferinte":"ce a cerut","canal":"whatsapp|airbnb|booking|email|direct","limba":"ro|en|fr|de","urgenta":false,"apartamente_recomandate":[{"nota":"cod","nume":"nume apt","motiv":"de ce se potriveste","scor":8}],"raspuns_sugerat":"mesaj catre client","observatii":"alte detalii"}'

  const promptLines = [
    'Esti un asistent AI pentru AB Homes Iasi, firma de apartamente in regim hotelier.',
    '',
    'Azi: ' + today,
    '',
    'APARTAMENTE DISPONIBILE:',
    aptsContext,
    '',
    'Analizeaza mesajul si extrage cererea de rezervare.',
    'Returneaza STRICT JSON valid, fara text inainte sau dupa:',
    jsonTemplate,
    '',
    'Reguli recomandare:',
    '- Filtreaza dupa nr persoane si capacitate',
    '- Potriveste zona mentionata (Palas, Copou, centru etc.)',
    '- Considera bugetul mentionat',
    '- Max 3 apartamente recomandate, sortate dupa scor',
    '- Raspunsul sugerat sa fie in limba clientului, warm si profesional, max 3 randuri',
    '- Pentru date: "15-18 iunie" -> checkin 2026-06-15, checkout 2026-06-18',
    '',
    'Mesaj de analizat:',
  ]

  const prompt = promptLines.join('\n') + '\n' + (text || '(mesaj din imagine)')

  const parts: any[] = [{ text: prompt }]

  if (imageBase64) {
    parts[0].text = promptLines.join('\n') + '\n(vezi imaginea atasata)'
    parts.push({
      inline_data: {
        mime_type: imageType || 'image/jpeg',
        data: imageBase64,
      }
    })
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
