import { NextRequest, NextResponse } from 'next/server'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

const SCHEMA = {
  type: 'object',
  properties: {
    nume_client: { type: 'string' },
    adulti: { type: 'number' },
    copii: { type: 'number' },
    data_checkin: { type: 'string' },
    data_checkout: { type: 'string' },
    nr_nopti: { type: ['number', 'null'] },
    pret_total: { type: ['number', 'null'] },
    moneda: { type: ['string', 'null'] },
    apartament_text: { type: ['string', 'null'] },
    cod: { type: ['string', 'null'] },
    telefon: { type: ['string', 'null'] },
  },
  required: ['nume_client', 'adulti', 'copii', 'data_checkin', 'data_checkout', 'nr_nopti', 'pret_total', 'moneda', 'apartament_text', 'cod', 'telefon'],
  additionalProperties: false,
}

export async function POST(req: NextRequest) {
  // una SAU mai multe capturi ale aceleiasi rezervari (cerut direct: pe Airbnb informatia e in mai multe sectiuni -
  // „Cine vine”, check-in / check-out, „Administrează rezervarea” cu telefonul, „Câștiguri” cu suma) - vezi lib/capturiScan.ts
  const body = await req.json()
  const imagini: { base64Data: string; mimeType?: string }[] = (Array.isArray(body.images) ? body.images : [{ base64Data: body.base64Data, mimeType: body.mimeType }])
    .filter((x: any) => x?.base64Data).slice(0, 6)
  if (!imagini.length) return NextResponse.json({ error: 'Lipsește imaginea' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)
  const prompt =
    "Ești expert în citirea capturilor de ecran cu rezervări din aplicații de cazare (Airbnb, " +
    "Booking.com și altele). Data de azi este " + today + ". " +
    (imagini.length > 1
      ? "Primești " + imagini.length + " capturi de ecran ale ACELEIAȘI rezervări, din secțiuni diferite (ex. check-in/check-out, " +
        "'Cine vine', 'Administrează rezervarea' cu telefonul oaspetelui, 'Câștiguri' cu suma, codul de confirmare). COMBINĂ " +
        "informația din toate capturile într-un singur rezultat - fiecare câmp îl iei din captura în care apare. "
      : "") +
    "Din imagini extrage STRICT ce poți citi clar, fără să inventezi:\n\n" +
    "- nume_client: numele oaspetelui (secțiunea gen 'Cine vine' / 'Guest')\n" +
    "- adulti, copii: numărul de adulți și copii; dacă apare un singur total nedefalcat, pune-l " +
    "la adulti și copii=0\n" +
    "- data_checkin, data_checkout: format YYYY-MM-DD. ATENȚIE: datele din aceste aplicații NU " +
    "includ anul — trebuie să-l deduci din context:\n" +
    "  * 'Sosește azi' = " + today + "; 'Sosește mâine' / 'Arrives tomorrow' = a doua zi după " + today + "\n" +
    "  * dacă apare text de tipul 'Sosește peste N zile' / 'Check-in in N days', calculează " +
    "data_checkin ca " + today + " + N zile exact, apoi calculează data_checkout din numărul de " +
    "nopți dacă e vizibil (ex. 'Total pentru X nopți'), altfel din ziua/luna de check-out citite\n" +
    "  * altfel, alege cea mai apropiată dată VIITOARE (după " + today + ") care se potrivește cu " +
    "ziua și luna citite pentru fiecare dată\n" +
    "- nr_nopti: numărul de nopți dacă apare explicit undeva (ex. 'Total pentru 5 nopți'), altfel null\n" +
    "- pret_total: suma totală, doar cifrele (fără simbol monetar, cu punct zecimal), altfel null. Dacă apare suma " +
    "PLĂTITĂ DE OASPETE (Airbnb: fila 'Oaspetele a plătit' → 'Total (RON)'; 'Guest paid'), folosește-o pe aceasta, NU " +
    "câștigul gazdei ('Câștigi' / 'You earn' / suma din cardul 'Total pentru N nopți' care e după comision)\n" +
    "- moneda: 'RON' dacă vezi 'L' sau 'lei' lângă sumă, 'EUR' dacă vezi '€', 'USD' dacă vezi '$', " +
    "altfel null\n" +
    "- apartament_text: numele/titlul proprietății dacă apare undeva vizibil în imagine (header, " +
    "titlu anunț), altfel null — nu ghici, doar dacă se vede clar\n" +
    "- cod: codul de confirmare/rezervare al platformei (ex. 'Confirmation code', 'Cod rezervare' — " +
    "un cod scurt alfanumeric), altfel null\n" +
    "- telefon: numărul de telefon al oaspetelui, DOAR dacă apare explicit vizibil în imagine, " +
    "altfel null — nu ghici\n\n" +
    "Răspunde STRICT cu JSON, fără alt text."

  const res = await fetch((process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'rezervare_scan', strict: true, schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...imagini.map(im => ({ type: 'image_url', image_url: { url: `data:${im.mimeType || 'image/jpeg'};base64,${im.base64Data}` } })),
        ],
      }],
    }),
  })

  const data = await res.json()
  if (data.error) {
    console.error('scan-rezervare OpenAI error:', res.status, JSON.stringify(data.error))
    return NextResponse.json({ error: data.error.message || 'Eroare la scanare' }, { status: 500 })
  }

  const raw = data.choices?.[0]?.message?.content || '{}'
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Răspuns invalid de la model' }, { status: 500 })
  }

  return NextResponse.json({ result: parsed })
}
