import { NextRequest, NextResponse } from 'next/server'

// Chatbotul simplu (folosit acum doar pe pagina de staff). Cheia Gemini era scrisa direct in cod - am trecut pe
// OpenAI cu cheia din variabilele de mediu (OPENAI_API_KEY), ca la restul aplicatiei.
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

export async function POST(req: NextRequest) {
  const { system, history, message } = await req.json()
  if (!OPENAI_KEY) return NextResponse.json({ reply: 'Asistentul nu e configurat (lipsește OPENAI_API_KEY).' })
  const messages = [
    { role: 'system', content: String(system || '') },
    ...(Array.isArray(history) ? history : []).slice(-12).map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content || '') })),
    { role: 'user', content: String(message || '') },
  ]
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.7, max_tokens: 500 }),
    })
    const data = await res.json()
    const reply = data.choices?.[0]?.message?.content || 'Îmi pare rău, încearcă din nou.'
    return NextResponse.json({ reply: String(reply).trim() })
  } catch {
    return NextResponse.json({ reply: 'Îmi pare rău, încearcă din nou.' })
  }
}
