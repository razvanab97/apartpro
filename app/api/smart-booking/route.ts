import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

export async function POST(req: NextRequest) {
  const { message, apartments, reservations } = await req.json()

  const today = new Date().toISOString().split('T')[0]

  const aptInfo = apartments.map((a: any) =>
    `- [${a.nota||'?'}] ${a.nume}: max ${a.capacitate_max||'?'} pers, ${a.pret_standard||'?'} RON/noapte, ${a.adresa||''}`
  ).join('\n')

  const rezInfo = reservations.slice(0, 50).map((r: any) =>
    `${r.apartament_nota||'?'}: ocupat ${r.data_checkin} → ${r.data_checkout}`
  ).join('\n')

  const prompt = [
    'Esti un asistent de rezervari pentru AB Homes Iasi.',
    'Azi: ' + today,
    '',
    'APARTAMENTE DISPONIBILE:',
    aptInfo,
    '',
    'REZERVARI EXISTENTE (pentru a verifica disponibilitatea):',
    rezInfo,
    '',
    'Analizeaza mesajul clientului si returneaza STRICT JSON:',
    '{"client_name":"nume extras sau null","phone":"telefon extras sau null","checkin":"YYYY-MM-DD sau null","checkout":"YYYY-MM-DD sau null","nights":0,"adults":0,"children":0,"budget":null,"preferences":"preferinte extrase","canal":"whatsapp|booking|airbnb|email|direct","recommendations":[{"apt_nota":"cod","apt_name":"nume","reason":"de ce se potriveste","price_total":0,"available":true}],"response_template":"mesaj de raspuns catre client in romana, profesional si prietenos","confidence":0.9}',
    '',
    'Reguli recomandare:',
    '- Verifica disponibilitatea: daca exista rezervare cu overlap de date pentru acel apartament, pune available:false',
    '- Sorteaza recomandarile: cele disponibile primele',
    '- Calculeaza price_total: pret_standard * nr_nopti',
    '- Potrivire: nr persoane <= capacitate_max',
    '- Daca clientul mentioneaza buget, filtreaza corespunzator',
    '- Recomandarile: maxim 3, cele mai potrivite',
    '- response_template: mesaj gata de trimis clientului cu optiunile disponibile si preturile',
    '',
    'Mesaj client:',
    message,
  ].join('\n')

  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
      }),
    }
  )

  const data = await res.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return NextResponse.json({ result: JSON.parse(cleaned) })
  } catch {
    return NextResponse.json({ result: null, raw: cleaned })
  }
}
