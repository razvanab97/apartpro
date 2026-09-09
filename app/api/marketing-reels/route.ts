import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { supabase } from '@/lib/supabase'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

// Instagram serveste meta og: complete doar catre user-agent-uri de tip "bot de preview
// link" (Facebook/WhatsApp/etc) - cu un user-agent normal de browser adesea redirectioneaza
// spre login si nu mai gasim nimic. Nu descarcam video-ul de pe Instagram (nu e disponibil
// public de cativa ani incoace, tocmai ca sa blocheze descarcarea automata) - doar caption/
// titlu/poza, date publice, echivalente cu ce arata orice preview de link (iMessage, WhatsApp).
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

type LinkMeta = { autor: string | null; caption: string; thumbnail: string | null; platforma: 'instagram' | 'tiktok' }

async function fetchInstagramMeta(url: string): Promise<LinkMeta | null> {
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

  return { autor: autor || username || null, caption, thumbnail: ogImage || null, platforma: 'instagram' }
}

// TikTok are un endpoint oEmbed oficial, public, fara autentificare - mult mai stabil decat
// scraping-ul de meta tag-uri (nu se schimba pe neasteptate ca structura paginii)
async function fetchTikTokMeta(url: string): Promise<LinkMeta | null> {
  const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
  if (!res.ok) return null
  const data = await res.json()
  const caption = String(data.title || '').trim()
  if (!caption) return null
  return {
    autor: data.author_unique_id || data.author_name || null,
    caption, thumbnail: data.thumbnail_url || null, platforma: 'tiktok',
  }
}

function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
  if (/tiktok\.com/i.test(url)) return fetchTikTokMeta(url)
  return fetchInstagramMeta(url)
}

// Transcrie audio-ul real dintr-un video incarcat manual de utilizator (fisierul salvat de el
// din aplicatia sursa, urcat in Vercel Blob din browser). Whisper accepta containere video
// (mp4/mov/webm) direct, extrage singur audio-ul.
async function transcribeVideo(blobUrl: string): Promise<string> {
  const videoRes = await fetch(blobUrl)
  if (!videoRes.ok) throw new Error('Nu am putut descărca video-ul încărcat')
  const videoBuffer = await videoRes.arrayBuffer()

  const form = new FormData()
  form.append('file', new Blob([videoBuffer]), 'reel.mp4')
  form.append('model', 'whisper-1')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: form,
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'Eroare la transcriere audio')
  return String(data.text || '').trim()
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

function buildSystemPrompt(hasRealTranscript: boolean): string {
  return (
    "Ești social media manager pentru AB Homes Iași, administrator de apartamente în regim " +
    "hotelier (cazare turistică pe termen scurt) în Iași. Primești " +
    (hasRealTranscript
      ? "transcrierea audio reală a unui Reel de Instagram sau clip de TikTok (de la alt cont, " +
        "ca sursă de inspirație) - chiar cuvintele rostite în video."
      : "caption-ul public al unui Reel de Instagram sau clip de TikTok (de la alt cont, ca sursă " +
        "de inspirație) - NU ai acces la audio/video-ul propriu-zis, doar la textul postat.") +
    " Trebuie să analizezi sursa ca formulă, NU să o copiezi. Scopul e să înțelegem TEHNICA " +
    "(tipul de hook, unghiul de conținut, structura) și să producem o variantă ORIGINALĂ, " +
    "adaptată pentru AB Homes.\n\n" +
    "Generează:\n" +
    "- formulaHook: 1 propoziție, ce TEHNICĂ de hook folosește sursa (ex. întrebare retorică, " +
    "afirmație contraintuitivă, listă cu cifre, 'greșeala pe care o faci quando...', etc)\n" +
    "- unghiContinut: 1 propoziție, despre ce e practic conținutul și de ce prinde\n" +
    "- hookAdaptat: o primă replică ORIGINALĂ, în aceeași tehnică, dar despre cazare/apartamente " +
    "regim hotelier/administrare Airbnb-Booking - text nou, nu traducere/parafrazare a sursei\n" +
    "- scriptAdaptat: schiță scurtă Hook → Corp → CTA (3-5 rânduri) pentru un reel propriu al " +
    "AB Homes, folosind aceeași formulă\n" +
    "- titluSugestie: titlu/idee scurtă pentru reel-ul propriu\n" +
    "- descriereSugestie: caption gata de postat pentru varianta AB Homes, ton natural, fără " +
    "clișee de marketing, 1-3 hashtag-uri relevante la final\n" +
    "- ideeFilmare: ce anume să filmeze/arate concret (cadre, recuzită) ca să obțină acest tip de reel\n\n" +
    "Nu reproduce sursa cuvânt cu cuvânt în niciun câmp - doar analizează formula ei."
  )
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max).trim() + '…' : s
}

export async function POST(req: NextRequest) {
  const { url, videoBlobUrl } = await req.json()
  const sursaUrl = String(url || '').trim() || null
  const blobUrl = String(videoBlobUrl || '').trim() || null

  if (!sursaUrl && !blobUrl) {
    return NextResponse.json({ error: 'Lipsește linkul sau fișierul video' }, { status: 400 })
  }
  if (sursaUrl && !/instagram\.com|tiktok\.com/i.test(sursaUrl)) {
    return NextResponse.json({ error: 'Link invalid (Instagram sau TikTok)' }, { status: 400 })
  }

  // sursa de context (autor/thumbnail/caption) - din link, daca a fost dat
  let linkMeta: LinkMeta | null = null
  if (sursaUrl) {
    try { linkMeta = await fetchLinkMeta(sursaUrl) }
    catch (e) { console.error('marketing-reels: eroare fetch link', e) }
  }

  // sursa de continut pentru analiza AI - preferam transcrierea reala (mai precisa) daca exista
  let sursaTip: 'video' | 'caption' = 'caption'
  let textAnaliza = ''
  let fullTranscript = ''
  if (blobUrl) {
    try {
      fullTranscript = await transcribeVideo(blobUrl)
      sursaTip = 'video'
      textAnaliza = fullTranscript
    } catch (e) {
      console.error('marketing-reels: eroare transcriere', e)
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Eroare la transcrierea video-ului' }, { status: 502 })
    } finally {
      // nu pastram video-ul in storage - l-am transcris deja, nu mai e nevoie de el
      del(blobUrl).catch(() => {})
    }
  } else if (linkMeta?.caption) {
    textAnaliza = linkMeta.caption
  }

  if (!textAnaliza) {
    return NextResponse.json({ error: 'Nu am găsit conținut de analizat — linkul nu are un caption public, sau transcrierea video a ieșit goală.' }, { status: 422 })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      messages: [
        { role: 'system', content: buildSystemPrompt(sursaTip === 'video') },
        { role: 'user', content: `${sursaTip === 'video' ? 'Transcriere audio' : 'Caption'} sursă:\n"${textAnaliza}"` },
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

  // pastram doar un fragment scurt din sursa (referinta), nu transcrierea completa
  const captionAfisat = sursaTip === 'video' ? truncate(fullTranscript, 280) : truncate(linkMeta?.caption || '', 280)

  let savedId: string | null = null
  try {
    const { data: saved } = await supabase.from('marketing_reels')
      .insert({
        sursa_url: sursaUrl, sursa_tip: sursaTip, platforma: linkMeta?.platforma || null,
        autor: linkMeta?.autor || null, caption_original: captionAfisat,
        thumbnail_url: linkMeta?.thumbnail || null, rezultat: parsed,
      })
      .select('id').single()
    savedId = saved?.id || null
  } catch (e) {
    console.error('marketing-reels: eroare salvare istoric', e)
  }

  return NextResponse.json({
    sursa: {
      tip: sursaTip, platforma: linkMeta?.platforma || null, autor: linkMeta?.autor || null,
      caption: captionAfisat, thumbnail: linkMeta?.thumbnail || null,
    },
    result: parsed, savedId,
  })
}

export async function GET() {
  const { data, error } = await supabase.from('marketing_reels')
    .select('id,sursa_url,sursa_tip,platforma,autor,caption_original,thumbnail_url,rezultat,created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ istoric: data })
}
