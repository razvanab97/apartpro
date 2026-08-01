import { NextRequest, NextResponse } from 'next/server'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType } = await req.json()
    if (!base64Data) return NextResponse.json({ error: 'No image' }, { status: 400 })

    const prompt = `Esti expert in identificarea cartilor dupa coperta. Din aceasta imagine extrage:
- Titlul cartii
- Autorul (daca e vizibil)
Raspunde DOAR cu JSON valid, fara markdown: {"titlu":"Numele cartii","autor":"Numele autorului"}
Daca nu poti citi coperta, raspunde cu {"titlu":"","autor":""}`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 256,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}` } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })

    const openaiData = await openaiRes.json()

    if (openaiData.error) {
      console.error('carte-scan OpenAI error:', openaiData.error)
      return NextResponse.json({ success: false, error: openaiData.error.message }, { status: 200 })
    }

    const rawText = openaiData?.choices?.[0]?.message?.content || '{}'
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    let parsed: any = {}
    try {
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{}')
    } catch {}

    return NextResponse.json({
      success: true,
      titlu: parsed.titlu || '',
      autor: parsed.autor || '',
    })

  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 200 })
  }
}
