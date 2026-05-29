import { NextRequest, NextResponse } from 'next/server'

const GEMINI_KEY = 'AQ.Ab8RN6KgNm7MmHqZADCAmCP0bJTgoFFRvJ3RaL8pL4WNZFq9Aw'

export async function POST(req: NextRequest) {
  const { text, system } = await req.json()

  const prompt = system + '\n\nText de clasificat:\n' + text

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  const data = await res.json()
  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  
  // Return in same format as Anthropic API so frontend works unchanged
  return NextResponse.json({
    content: [{ text: generatedText }]
  })
}
