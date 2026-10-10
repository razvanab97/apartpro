import { NextRequest, NextResponse } from 'next/server'
import { supabase as sb } from '@/lib/supabase'
import { processOneBooking, citesteListaSetari, adaugaDeVerificat, CHEIE_SARITE, type SyncResult } from '@/lib/syncFivestar'

const T1  = '3cvbat7zgH54347Artesrtyrt466yj57se4lkg4'
const T   = 'Y5paEuVpBBop8pHG1qLVF6ymqCdPkzlncJGK0L50'
const API = 'https://www.5stardesk.ro/apih.php'
const CRON_SECRET = process.env.CRON_SECRET || 'apartpro-cron-2026'

function fmtForApi(isoDate: string): string {
  // Formeaza "1 Jul 2026" din "2026-07-01" fara probleme de timezone
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [y, m, d] = isoDate.split('-').map(Number)
  return `${d} ${months[m - 1]} ${y}`
}

// Sincronizarea de noapte foloseste EXACT aceeasi logica de asociere ca sincronizarea din aplicatie
// (processOneBooking din lib/syncFivestar.ts) - inainte avea o copie proprie care a tot ramas in urma
// (muta apartamentul orbeste, nu stia de "finalizata", nu avea protectia de dubluri etc.)
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret')
  if (auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const res: SyncResult = { total:0, inserted:0, updated:0, skipped:0, errors:0, logs:[] }

  try {
    const { data: apts } = await sb.from('apartamente').select('id,nume,nota')
    const aptByNota: Record<string,string> = {}
    for (const a of apts||[]) if (a.nota) aptByNota[a.nota.toUpperCase()] = a.id

    // Interval: 30 zile inapoi + 120 zile inainte, fara timezone issues
    const now = new Date()
    const from = new Date(now); from.setDate(from.getDate() - 30)
    const to   = new Date(now); to.setDate(to.getDate() + 120)
    const checkinParam  = fmtForApi(from.toISOString().split('T')[0])
    const checkoutParam = fmtForApi(to.toISOString().split('T')[0])

    // Apel direct la 5SD (server-side, fara proxy browser)
    const res5sd = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t1: T1, t: T, actiune: 'get_bookings', checkin: checkinParam, checkout: checkoutParam }),
    })
    const rawData = await res5sd.json()
    const rezervariList: any[] = Array.isArray(rawData) ? rawData : []
    res.total = rezervariList.length
    res.logs.push({ type:'info', msg: `5SD: ${rezervariList.length} rezervari (${checkinParam} → ${checkoutParam})` })

    const sarite = new Set<string>((await citesteListaSetari(CHEIE_SARITE)).map(String))
    for (const b of rezervariList) await processOneBooking(b, aptByNota, apts||[], res, { sarite })
    await adaugaDeVerificat(res.deVerificat || [], res.rezolvate || [])

    const logs = res.logs.filter(l => l.type !== 'skip' || !l.msg.startsWith('↺')).map(l => l.msg)
    const result = { ok: true, total: res.total, inserted: res.inserted, updated: res.updated, skipped: res.skipped, errors: res.errors, duration_ms: Date.now()-startTime, logs: logs.slice(-30) }
    await sb.from('setari').upsert({ cheie: 'last_sync', valoare: JSON.stringify({ ...result, time: new Date().toISOString() }) }, { onConflict: 'cheie' })
    return NextResponse.json(result)

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({}))
  const url = new URL(req.url)
  url.searchParams.set('secret', body.secret || CRON_SECRET)
  return GET(new NextRequest(url, { headers: req.headers }))
}
