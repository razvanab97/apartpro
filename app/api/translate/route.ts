import { NextRequest, NextResponse } from 'next/server'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'Lipsește textul' }, { status: 400 })

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: 'Tradu următorul mesaj (trimis unui oaspete la o cazare în regim hotelier) din română ' +
          'în engleză. Păstrează formatarea WhatsApp (*bold*, liniile separate, emoji-urile), tonul ' +
          'politicos și natural al unui mesaj către oaspeți. Răspunde STRICT doar cu textul tradus, ' +
          'fără explicații, fără ghilimele.\n\n' + text,
      }],
    }),
  })

  const data = await res.json()
  if (data.error) {
    console.error('translate OpenAI error:', res.status, JSON.stringify(data.error))
    return NextResponse.json({ error: data.error.message || 'Eroare la traducere' }, { status: 500 })
  }

  const translated = data.choices?.[0]?.message?.content?.trim() || ''
  return NextResponse.json({ translated })
}
