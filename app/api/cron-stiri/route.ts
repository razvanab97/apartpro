import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const CRON_SECRET = process.env.CRON_SECRET || 'apartpro-cron-2026'

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? m[1] : ''
}
function cleanText(s: string): string {
  let t = s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')
  // Google Stiri (si altele) scriu tagurile HTML din descriere ca &lt;...&gt; escapate,
  // nu ca <...> direct - trebuie decodate INAINTE de a strip-ui tagurile, altfel raman vizibile
  t = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  t = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  t = t.replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/&#8217;/g, "'")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#124;/g, '|').replace(/&#8230;/g, '…').replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
  return t
}
function parseRSS(xml: string) {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/g) || []
  return itemBlocks.map(block => {
    const titlu = cleanText(extractTag(block, 'title'))
    const link = cleanText(extractTag(block, 'link'))
    const descriere = cleanText(extractTag(block, 'description')).slice(0, 600)
    const pubDateRaw = extractTag(block, 'pubDate')
    const data_publicare = pubDateRaw ? new Date(pubDateRaw).toISOString() : null
    return { titlu, link, descriere, data_publicare }
  }).filter(i => i.titlu && i.link)
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret')
  if (auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: surse } = await supabase.from('marketing_stiri_surse').select('id,nume,url_feed').eq('activ', true)
  const rezultate: any[] = []
  let totalNoi = 0

  for (const sursa of surse || []) {
    try {
      const res = await fetch(sursa.url_feed, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AB-Homes-Bot/1.0)' } })
      if (!res.ok) { rezultate.push({ sursa: sursa.nume, error: `HTTP ${res.status}` }); continue }
      const xml = await res.text()
      const items = parseRSS(xml).slice(0, 30)

      let noi = 0
      for (const item of items) {
        const { error, data } = await supabase.from('marketing_stiri_feed')
          .insert({ sursa_id: sursa.id, titlu: item.titlu, link: item.link, descriere: item.descriere, data_publicare: item.data_publicare })
          .select('id')
        if (!error && data?.length) noi++
        // eroare de unicitate (link deja existent) e asteptata si ignorata - nu e stire noua
      }
      totalNoi += noi
      rezultate.push({ sursa: sursa.nume, gasite: items.length, noi })
    } catch (e: any) {
      rezultate.push({ sursa: sursa.nume, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, totalNoi, rezultate })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const url = new URL(req.url)
  url.searchParams.set('secret', body.secret || CRON_SECRET)
  return GET(new NextRequest(url, { headers: req.headers }))
}
