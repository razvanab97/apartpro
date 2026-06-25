import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

const STOPWORDS = new Set(['de','la','cu','si','sa','pe','in','un','o','ca','din','pentru','este','sunt','mai','nu','se','le','lui','care','daca','dar','ce','am','ai','are','fi'])

function normalizeWords(text: string): Set<string> {
  const norm = (text || '').toLowerCase()
    .replace(/[ăâ]/g, 'a').replace(/î/g, 'i').replace(/ș/g, 's').replace(/ț/g, 't')
  const words = norm.match(/[a-z0-9]+/g) || []
  return new Set(words.filter(w => w.length >= 3 && !STOPWORDS.has(w)))
}

async function findSimilarTasks(text: string, limit = 5) {
  const inputWords = normalizeWords(text)
  if (inputWords.size === 0) return []

  const { data: past } = await supabase
    .from('taskuri')
    .select('titlu,descriere,business,prioritate,persoana')
    .neq('business', '__rutina__')
    .not('titlu', 'is', null)
    .order('created_at', { ascending: false })
    .limit(300)

  if (!past || past.length === 0) return []

  const scored = past.map((t: any) => {
    const taskWords = normalizeWords(`${t.titlu || ''} ${t.descriere || ''}`)
    let overlap = 0
    for (const w of inputWords) if (taskWords.has(w)) overlap++
    return { task: t, score: overlap }
  })

  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.task)
}

const BIZ_CODES: Record<string, string> = {
  '01': 'Property Management', '02': 'Marketplace',
  '03': 'Spalatorie', '04': 'Personal', '05': 'Admin', '06': 'Financiar',
}

function addDaysISO(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
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
  const inZile = t.match(/(?:\u00een|in|peste)\s+(\d+)\s*zil/)
  if (inZile) return add(Number(inZile[1]))
  const inSaptamani = t.match(/(?:\u00een|in|peste)\s+(\d+)\s*s\u0103pt\u0103m/) || t.match(/(?:\u00een|in|peste)\s+(\d+)\s*saptam/)
  if (inSaptamani) return add(Number(inSaptamani[1]) * 7)
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

  const jsonSchema = '{"titlu":"reformulare minimala, fidela cuvintelor utilizatorului, cu verb activ la inceput","descriere":"detalii suplimentare din text, daca exista, altfel null","prioritate":"urgenta|normala|scazuta","business":"categoria","data_limita":"YYYY-MM-DD sau null","impact_score":7,"effort_score":4,"persoana":null,"rationale":"de ce"}'

  const bizRules = activeBiz
    ? ('Business: ' + activeBiz + ' — NU schimba!')
    : ('BUSINESS - detecteaza din context:\n' +
       '- spalatorie/rufe/lenjerii/curatenie → Spalatorie\n' +
       '- apartament/rezervare/chirias/checkin/checkout/Booking/Airbnb/proprietar → Property Management\n' +
       '- produs/vanzare/client/comanda → Marketplace\n' +
       '- factura/TVA/contabilitate/banca/plata → Financiar\n' +
       '- personal/familie/sanatate → Personal\n' +
       '- altceva → Admin')

  const similarTasks = await findSimilarTasks(cleanText)
  const examplesBlock = similarTasks.length
    ? ('ISTORIC — asa ai clasificat task-uri asemanatoare inainte (foloseste-le ca ghid de stil, business, prioritate, persoana):\n' +
       similarTasks.map((t: any, i: number) =>
         `${i + 1}. "${t.titlu}"${t.descriere ? ' (' + t.descriere + ')' : ''} → business=${t.business || 'necunoscut'}, prioritate=${t.prioritate || 'necunoscut'}${t.persoana ? ', persoana=' + t.persoana : ''}`
       ).join('\n'))
    : ''

  const ziueSaptamana = ['duminică','luni','marți','miercuri','joi','vineri','sâmbătă'][new Date().getDay()]
  const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10) })()

  const titluRules = [
    'TITLU — reformuleaza MINIMAL, nu rezuma si nu generaliza:',
    '- Pastreaza EXACT numele, locurile, sumele, platformele, obiectele mentionate de utilizator.',
    '- Elimina DOAR cuvintele de umplutura (trebuie sa, vreau sa, mi-a zis, reamineste-mi, am de) si pune un verb activ la inceput.',
    '- NU inventa detalii care nu apar in text. Daca textul e vag, titlul ramane vag (nu completezi tu lipsurile).',
    'Exemple (input → titlu corect):',
    '"trebuie sa sun furnizorul de prosoape saptamana asta" → "Sună furnizorul de prosoape"',
    '"reamineste-mi marti sa trimit factura la Booking" → "Trimite factura la Booking"',
    '"idee: pachete weekend romantic la Airy Palas cu sampanie" → "Creează pachet weekend romantic la Airy Palas cu șampanie"',
    '"vodafone mi-a zis ca trebuie sa platesc 150 lei pentru roaming" → "Plătește 150 lei la Vodafone pentru roaming"',
  ].join('\n')

  const dateRules = [
    'DATA AZI: ' + today + ' (' + ziueSaptamana + ')',
    'Calculeaza data_limita relativ la DATA AZI, doar daca textul mentioneaza vreun moment de timp:',
    '- azi/acum → ' + today,
    '- mâine → ' + tomorrowStr,
    '- poimâine → ' + addDaysISO(today, 2),
    '- "în N zile" / "peste N zile" → DATA AZI + N zile',
    '- "în N săptămâni" / "peste N săptămâni" → DATA AZI + N×7 zile',
    '- luni/marți/.../duminică (nume de zi, fara "viitoare") → prima zi cu acel nume care vine după azi',
    '- "săptămâna asta" → ultima zi a săptămânii curente',
    '- "săptămâna viitoare" → DATA AZI + 7 zile',
    '- "luna asta" → ultima zi a lunii curente',
    '- "luna viitoare" → DATA AZI + 30 zile',
    '- data exacta (15 iunie, 15.06, 2026-06-15) → conversie directa la YYYY-MM-DD',
    '- daca textul NU mentioneaza niciun moment de timp → data_limita = null (nu inventa o data)',
  ].join('\n')

  let prompt: string

  const prioritateRules = 'PRIORITATE: urgenta=azi/maine/cuvinte ca URGENT,ASAP,imediat | normala=in cateva zile, fara presiune | scazuta=cand am timp, fara termen clar'
  const contextRules = 'CONTEXT: esti asistentul lui Razvan, antreprenor roman care administreaza apartamente in regim hotelier (Booking/Airbnb), o mica spalatorie si vanzari pe Marketplace/Emag. Cand textul e ambiguu, aleg interpretarea cea mai probabila in acest context, nu cea mai literala. Intelege referinte indirecte (nume de platforme, furnizori, apartamente) fara sa le explici inapoi in titlu.'

  if (imageBase64) {
    // Prompt special pentru imagine
    prompt = [
      'Esti asistentul AI al lui Razvan, antreprenor roman.',
      contextRules,
      bizRules,
      '',
      examplesBlock,
      dateRules,
      '',
      'Citeste TOT textul vizibil din imagine (WhatsApp, email, SMS, notita, orice).',
      'Identifica ce actiune trebuie facuta, cine e implicat, ce data/termen apare.',
      'Returneaza DOAR JSON valid, fara explicatii:',
      jsonSchema,
      '',
      titluRules,
      prioritateRules,
      finalDate ? ('Utilizatorul a selectat deja data: ' + finalDate + ' — foloseste-o exact pe asta, nu recalcula.') : '',
    ].filter(Boolean).join('\n')
  } else {
    // Prompt pentru text
    prompt = [
      'Esti asistentul AI al lui Razvan, antreprenor roman.',
      contextRules,
      bizRules,
      '',
      examplesBlock,
      dateRules,
      '',
      'Transforma textul de mai jos intr-un task. Returneaza DOAR JSON valid, fara explicatii:',
      jsonSchema,
      '',
      titluRules,
      prioritateRules,
      finalDate ? ('Utilizatorul a selectat deja data: ' + finalDate + ' — foloseste-o exact pe asta, nu recalcula.') : '',
      '',
      'Text de clasificat: ' + cleanText,
    ].filter(Boolean).join('\n')
  }

  // Build mesaj OpenAI (suporta text + imagine in acelasi format de continut)
  const msgContent: any[] = [{ type: 'text', text: prompt }]
  if (imageBase64) {
    msgContent.push({ type: 'image_url', image_url: { url: `data:${imageType};base64,${imageBase64}` } })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: msgContent }],
    }),
  })

  const data = await res.json()
  if (data.error) {
    console.error('OpenAI error:', res.status, JSON.stringify(data.error))
    return NextResponse.json({ content: [{ text: '{}' }] })
  }

  const raw = data.choices?.[0]?.message?.content || '{}'
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
