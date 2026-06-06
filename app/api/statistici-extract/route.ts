import { NextRequest, NextResponse } from 'next/server'

const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY!

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { base64Data, mimeType, filename, platforma, aptNume } = body

    const isCSV = mimeType === 'text/csv' || filename?.endsWith('.csv')
    const isPDF = mimeType === 'application/pdf'

    const prompt = `Ești un extractor de date din rapoarte ${platforma === 'booking' ? 'Booking.com' : 'Airbnb'} pentru proprietatea "${aptNume}".

Extrage TOATE valorile numerice vizibile și returnează DOAR JSON valid fără text suplimentar:
{
  "vizualizari_cautari": număr sau null,
  "vizualizari_pagina": număr sau null,
  "rata_conversie_cautari": procent ca număr (ex: 1.63) sau null,
  "rata_conversie_pagina": procent ca număr (ex: 2.24) sau null,
  "rezervari_confirmate": număr sau null,
  "scor_pozitie_text": text sau null,
  "rata_anulari": procent ca număr sau null,
  "adr": număr RON sau null,
  "innoptari": număr sau null,
  "venituri_ron": număr sau null,
  "scor_comentarii": număr sau null,
  "completare_pagina": număr procent sau null,
  "rata_ocupare": procent ca număr sau null,
  "nopti_rezervate": număr sau null,
  "nopti_blocate": număr sau null,
  "tarif_mediu_noapte": număr RON sau null,
  "wishlist_total": număr sau null,
  "scor_5stele": procent ca număr sau null,
  "scor_acuratete": procent sau null,
  "scor_checkin": procent sau null,
  "scor_curatenie": procent sau null,
  "scor_comunicare": procent sau null,
  "scor_pozitie": procent sau null,
  "scor_valoare": procent sau null,
  "rata_conversie_globala": procent ca număr sau null,
  "rata_afisari_p1": procent ca număr sau null
}`

    let content: any[]
    if (isCSV) {
      const csvText = Buffer.from(base64Data, 'base64').toString('utf-8')
      content = [{ type: 'text', text: `CSV:\n\n${csvText}\n\n${prompt}` }]
    } else if (isPDF) {
      content = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
        { type: 'text', text: prompt }
      ]
    } else {
      content = [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
        { type: 'text', text: prompt }
      ]
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content }] })
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.error?.message || 'API error' }, { status: 500 })

    const text = data.content?.find((c: any) => c.type === 'text')?.text || '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    return NextResponse.json(JSON.parse(clean))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
