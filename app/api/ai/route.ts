import { NextRequest, NextResponse } from 'next/server'

const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY

const BIZ_CODES: Record<string, string> = {
  '01': 'Property Management', '02': 'Marketplace',
  '03': 'Spalatorie', '04': 'Personal', '05': 'Admin', '06': 'Financiar',
}

function detectDate(text: string): string | null {
  if (!text) return null
  const t = text.toLowerCase()
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
  const add = (n: number) => { const d = new Date(now); d.setDate(now.getDate()+n); return fmt(d) }

  const exactFull = t.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (exactFull) return `${exactFull[1]}-${pad(Number(exactFull[2]))}-${pad(Number(exactFull[3]))}`
  const exactShort = t.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?/)
  if (exactShort) {
    const year = exactShort[3] || String(now.getFullYear())
    return `${year}-${pad(Number(exactShort[2]))}-${pad(Number(exactShort[1]))}`
  }

  if (/\bazi\b|astazi|ast\u0103zi|\bacum\b/.test(t)) return fmt(now)
  if (/\bm\u00e2ine\b|\bmaine\b/.test(t)) return add(1)
  if (/poim\u00e2ine|poimaine/.test(t)) return add(2)
  if (/s\u0103pt\u0103m\u00e2na asta|saptamana asta/.test(t)) return add(7 - now.getDay())
  if (/s\u0103pt\u0103m\u00e2na viitoare|saptamana viitoare/.test(t)) return add(7)
  if (/luna asta|aceast\u0103 lun\u0103|aceasta luna/.test(t)) return fmt(new Date(now.getFullYear(), now.getMonth()+1, 0))
  if (/luna viitoare/.test(t)) return add(30)

  const weekdays: Record<string, number> = { luni:1, marti:2, miercuri:3, joi:4, vineri:5, sambata:6, duminica:0 }
  for (const [day, dow] of Object.entries(weekdays)) {
    if (t.includes(day)) { const diff = (dow - now.getDay() + 7) % 7 || 7; return add(diff) }
  }
  return null
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const text = (body.text || '').trim()
  const forcedBiz = body.forcedBiz || ''
  const forcedDate = body.forcedDate
  const imageBase64 = body.imageBase64 || null
  const imageType = body.imageType || 'image/jpeg'

  const today = new Date().toISOString().slice(0, 10)
  const detectedDate = detectDate(text)
  const finalDate = (forcedDate !== undefined && forcedDate !== null && forcedDate !== '') ? forcedDate : detectedDate

  const codeMatch = text.match(/^(\d{2})\s+/)
  const activeBiz = forcedBiz || (codeMatch ? BIZ_CODES[codeMatch[1]] : null)
  const cleanText = codeMatch ? text.replace(/^\d{2}\s+/, '') : text

  const jsonSchema = '{"titlu":"VERB + obiect concret","descriere":"detalii relevante","prioritate":"urgenta|normala|scazuta","business":"categoria","data_limita":"YYYY-MM-DD sau null","impact_score":7,"effort_score":4,"persoana":null,"rationale":"de ce"}'

  const bizRules = activeBiz
    ? ('Business: ' + activeBiz + ' — NU schimba!')
    : ('BUSINESS - detecteaza din context:\n' +
       '- spalatorie/rufe/lenjerii/curatenie → Spalatorie\n' +
       '- apartament/rezervare/chirias/checkin/checkout/Booking/Airbnb/proprietar → Property Management\n' +
       '- produs/vanzare/client/comanda → Marketplace\n' +
       '- factura/TVA/contabilitate/banca/plata → Financiar\n' +
       '- personal/familie/sanatate → Personal\n' +
       '- altceva → Admin')

  let prompt: string

  if (imageBase64) {
    // Prompt special pentru imagine
    prompt = [
      'Esti asistentul AI al lui Razvan, antreprenor roman.',
      bizRules,
      '',
      'DATA AZI: ' + today,
      '',
      'Citeste TOT textul vizibil din imagine (WhatsApp, email, SMS, notita, orice).',
      'Identifica ce actiune trebuie facuta, cine e implicat, ce data/termen apare.',
      'Returneaza DOAR JSON valid, fara explicatii:',
      jsonSchema,
      '',
      'REGULI:',
      '- TITLU: verb activ (Suna/Plateste/Mergi/Verifica/Trimite) + obiect concret',
      '- DATA_LIMITA: daca apare o zi (sambata, luni) sau data (7 iunie, 15.06) in imagine, calculeaza YYYY-MM-DD fata de azi (' + today + ')',
      '- PRIORITATE: urgenta=azi/maine/URGENT | normala=in cateva zile | scazuta=cand am timp',
      finalDate ? ('- Daca utilizatorul a selectat data: ' + finalDate + ' — foloseste-o!') : '',
    ].filter(Boolean).join('\n')
  } else {
    // Prompt pentru text
    prompt = [
      'Esti asistentul AI al lui Razvan, antreprenor roman.',
      bizRules,
      '',
      'Transforma textul in task. Returneaza DOAR JSON:',
      jsonSchema,
      '',
      'TITLU: verb activ la infinitiv (Suna/Plateste/Trimite/Verifica)',
      'PRIORITATE: urgenta=azi/maine/URGENT | normala=in cateva zile | scazuta=cand am timp',
      'DATA_LIMITA: ' + (finalDate ? finalDate : 'null'),
      '',
      'Text: ' + cleanText,
    ].filter(Boolean).join('\n')
  }

  // Build Claude message
  const msgContent: any[] = []
  if (imageBase64) {
    msgContent.push({ type: 'image', source: { type: 'base64', media_type: imageType, data: imageBase64 } })
  }
  msgContent.push({ type: 'text', text: prompt })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: msgContent }],
    }),
  })

  const data = await res.json()
  if (data.error) {
    console.error('Claude error:', data.error)
    return NextResponse.json({ content: [{ text: '{}' }] })
  }

  const raw = data.content?.[0]?.text || '{}'
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  const cleaned = jsonMatch ? jsonMatch[0] : raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (activeBiz) parsed.business = activeBiz
    if (finalDate) parsed.data_limita = finalDate
    if (!parsed.titlu || parsed.titlu.length < 4) {
      parsed.titlu = (parsed.descriere || cleanText || 'Task din imagine').slice(0, 60)
    }
    return NextResponse.json({ content: [{ text: JSON.stringify(parsed) }] })
  } catch {
    return NextResponse.json({ content: [{ text: cleaned }] })
  }
}
