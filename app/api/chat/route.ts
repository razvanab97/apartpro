import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

export async function POST(req: NextRequest) {
  const { system, history, message } = await req.json()

  // Build conversation for Gemini
  const parts = []
  parts.push({ text: system + '\n\n' })
  
  // Add history
  for (const msg of (history || [])) {
    parts.push({ text: (msg.role === 'user' ? 'User: ' : 'Assistant: ') + msg.content + '\n' })
  }
  
  parts.push({ text: 'User: ' + message + '\nAssistant:' })

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      }),
    }
  )

  const data = await res.json()
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Îmi pare rău, încearcă din nou.'

  return NextResponse.json({ reply: reply.trim() })
}
