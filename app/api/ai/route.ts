import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { text, system } = await req.json()

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: system,
      messages: [{ role: 'user', content: text }],
    }),
  })

  const data = await res.json()
  return NextResponse.json(data)
}
