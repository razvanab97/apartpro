import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

// Instagram serveste meta og: complete doar catre user-agent-uri de tip "bot de preview
// link" (Facebook/WhatsApp/etc) - cu un user-agent normal de browser adesea redirectioneaza
// spre login si nu mai gasim nimic. Nu descarcam video-ul (nu e disponibil public in og: de
// cativa ani incoace, tocmai ca sa blocheze descarcarea automata) - doar caption/titlu/poza,
// date publice, echivalente cu ce arata orice preview de link (iMessage, WhatsApp etc).
const BOT_UA = 'Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)'

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
}

function metaContent(html: string, prop: string): string {
  const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`, 'i'))
  return m ? decodeEntities(m[1]) : ''
}

async function fetchReelMeta(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': BOT_UA }, redirect: 'follow' })
  const html = await res.text()

  const ogTitle = metaContent(html, 'og:title')
  const ogDescription = metaContent(html, 'og:description')
  const ogImage = metaContent(html, 'og:image')

  if (!ogTitle && !ogDescription) return null

  // og:title: "AuthorName on Instagram: "caption..."" | og:description: "N likes, N comments - username on DATE: "caption"."
  const autor = (ogTitle.match(/^(.*?)\s+on Instagram:/)?.[1] || '').trim()
  const username = (ogDescription.match(/-\s*([^\s]+)\s+on\s+/)?.[1] || '').trim()
  let caption = (ogDescription.match(/:\s*"([\s\S]*)"\.?\s*$/)?.[1] || ogTitle.match(/on Instagram:\s*"([\s\S]*)"$/)?.[1] || '').trim()
  if (!caption) caption = ogTitle.replace(/^.*?on Instagram:\s*/, '').replace(/^"|"$/g, '').trim()

  return { autor: autor || username || null, username: username || null, caption, thumbnail: ogImage || null }
}

const SCHEMA = {
  type: 'object',
  properties: {
    formulaHook: { type: 'string' },
    unghiContinut: { type: 'string' },
    hookAdaptat: { type: 'string' },
    scriptAdaptat: { type: 'string' },
    titluSugestie: { type: 'string' },
    descriereSugestie: { type: 'string' },
    ideeFilmare: { type: 'string' },
  },
  required: ['formulaHook', 'unghiContinut', 'hookAdaptat', 'scriptAdaptat', 'titluSugestie', 'descriereSugestie', 'ideeFilmare'],
  additionalProperties: false,
}

const SYSTEM_PROMPT =
  "Ești social media manager pentru AB Homes Iași, administrator de apartamente în regim " +
  "hotelier (cazare turistică pe termen scurt) în Iași. Primești caption-ul public al unui " +
  "Reel de Instagram (de la alt cont, ca sursă de inspirație) și trebuie să-l analizezi ca " +
  "formulă, NU să-l copiezi. Scopul e să înțelegem TEHNICA (tipul de hook, unghiul de " +
  "conținut, structura) și să producem o variantă ORIGINALĂ, adaptată pentru AB Homes.\n\n" +
  "Nu ai acces la audio/video-ul propriu-zis, doar la caption-ul text — analiza ta despre " +
  "'hook' se bazează pe ce sugerează caption-ul (prima propoziție/întrebare/afirmație), nu pe " +
  "cuvintele exacte rostite în video.\n\n" +
  "Generează:\n" +
  "- formulaHook: 1 propoziție, ce TEHNICĂ de hook pare să folosească sursa (ex. întrebare " +
  "retorică, afirmație contraintuitivă, listă cu cifre, 'greșeala pe care o faci quando...', etc)\n" +
  "- unghiContinut: 1 propoziție, despre ce e practic conținutul și de ce prinde\n" +
  "- hookAdaptat: o primă replică ORIGINALĂ, în aceeași tehnică, dar despre cazare/apartamente " +
  "regim hotelier/administrare Airbnb-Booking - text nou, nu traducere/parafrazare a sursei\n" +
  "- scriptAdaptat: schiță scurtă Hook → Corp → CTA (3-5 rânduri) pentru un reel propriu al " +
  "AB Homes, folosind aceeași formulă\n" +
  "- titluSugestie: titlu/idee scurtă pentru reel-ul propriu\n" +
  "- descriereSugestie: caption gata de postat pentru varianta AB Homes, ton natural, fără " +
  "clișee de marketing, 1-3 hashtag-uri relevante la final\n" +
  "- ideeFilmare: ce anume să filmeze/arate concret (cadre, recuzită) ca să obțină acest tip de reel\n\n" +
  "Nu reproduce caption-ul sursă cuvânt cu cuvânt în niciun câmp - doar analizează formula lui."

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  const sursaUrl = String(url || '').trim()
  if (!sursaUrl || !/instagram\.com/i.test(sursaUrl)) {
    return NextResponse.json({ error: 'Lipsește sau e invalid link-ul Instagram' }, { status: 400 })
  }

  let meta: Awaited<ReturnType<typeof fetchReelMeta>>
  try {
    meta = await fetchReelMeta(sursaUrl)
  } catch (e) {
    console.error('marketing-reels: eroare fetch', e)
    return NextResponse.json({ error: 'Nu s-a putut accesa link-ul' }, { status: 502 })
  }
  if (!meta || !meta.caption) {
    return NextResponse.json({ error: 'Nu am găsit un caption public pentru acest link — fie e privat, fie Instagram nu l-a expus public.' }, { status: 422 })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Caption sursă:\n"${meta.caption}"` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'reel_analiza', strict: true, schema: SCHEMA } },
    }),
  })

  const data = await res.json()
  if (data.error) {
    console.error('marketing-reels OpenAI error:', res.status, JSON.stringify(data.error))
    return NextResponse.json({ error: data.error.message || 'Eroare la analiză' }, { status: 500 })
  }

  const raw = data.choices?.[0]?.message?.content || '{}'
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Răspuns invalid de la model' }, { status: 500 })
  }

  let savedId: string | null = null
  try {
    const { data: saved } = await supabase.from('marketing_reels')
      .insert({
        sursa_url: sursaUrl, autor: meta.autor, caption_original: meta.caption,
        thumbnail_url: meta.thumbnail, rezultat: parsed,
      })
      .select('id').single()
    savedId = saved?.id || null
  } catch (e) {
    console.error('marketing-reels: eroare salvare istoric', e)
  }

  return NextResponse.json({
    sursa: { autor: meta.autor, caption: meta.caption, thumbnail: meta.thumbnail },
    result: parsed, savedId,
  })
}

export async function GET() {
  const { data, error } = await supabase.from('marketing_reels')
    .select('id,sursa_url,autor,caption_original,thumbnail_url,rezultat,created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ istoric: data })
}
