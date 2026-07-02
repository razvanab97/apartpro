import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const T1  = '3cvbat7zgH54347Artesrtyrt466yj57se4lkg4'
const T   = 'Y5paEuVpBBop8pHG1qLVF6ymqCdPkzlncJGK0L50'
const API = 'https://www.5stardesk.ro/apih.php'
const CRON_SECRET = process.env.CRON_SECRET || 'apartpro-cron-2026'

// Pe server folosim direct URL-ul Supabase, nu proxy-ul browser
const sb = createClient(
  'https://lsmraxevzkmupaidianv.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

function normCod(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()
}

const ALIAS_MAP: Record<string,string> = {
  'MV07':'VM07','VMV07':'VM07','VILA07':'VM07','VILA 07':'VM07','VILA PACURARI':'VM07','VM 07':'VM07',
  'COZY STUDIO':'EX59','APARTAMENT 59':'EX59','APT59':'EX59',
  'SKYPORT':'C64','SKYPORT RETREAT':'C64','APARTAMENT 64':'C64','APT64':'C64',
  'PEACEFUL COPOU RETREAT':'CG40','PEACEFUL COPOU':'CG40','APARTAMENT 40':'CG40','COPOU RETREAT':'CG40',
  'GREEN STATION':'GS08','GS 08':'GS08','GS08 GREENSTATION':'GS08',
  'HIDEOUT':'HD02','HD 02':'HD02','HIDEOUT ROZELOR':'HD02',
  'LAZAR COMFY':'L83','LAZAR':'L83','L 83':'L83','LAZĂR COMFY':'L83','LAZĂR':'L83','LAZR':'L83',
  'PALAS SKYNEST':'L88','SKYNEST':'L88','L 88':'L88',
  'PALAS RETREAT':'L94','L 94':'L94',
  'AIRY PALAS':'L99','L 99':'L99',
  'MINT LOFT':'N32','MINT LOFT COPOU':'N32','N 32':'N32',
  'NEWTON URBAN':'NT9','NEWTON':'NT9','NT 9':'NT9',
}

function parse5star(s: string): string {
  if (!s) return ''
  const M: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
    ian:'01',mai:'05',iun:'06',iul:'07',noi:'11',
  }
  const p = s.trim().split(' ')
  if (p.length === 3) {
    const mon = M[p[1].toLowerCase().slice(0,3)] || '01'
    return `${p[2]}-${mon}-${p[0].padStart(2,'0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10)
  return s
}

function parseCanal(s: string): string {
  const l = (s||'').toLowerCase()
  if (l.includes('airbnb')) return 'airbnb'
  if (l.includes('booking')) return 'booking'
  return 'direct'
}

function fmtForApi(isoDate: string): string {
  // Formeaza "1 Jul 2026" din "2026-07-01" fara probleme de timezone
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [y,m,d] = isoDate.split('-')
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`
}

function findAptId(b: any, aptByNotaNorm: Record<string,string>): string|null {
  const aliasNorm: Record<string,string> = {}
  for (const [k,v] of Object.entries(ALIAS_MAP)) aliasNorm[normCod(k)] = v

  const codCandidati = [
    b.id_camera, b.camera, b.unitate, b.room,
    b.numar_camera, b.tip_camera, b.cod_camera,
    b.denumire_camera, b.name, b.room_name,
  ].filter(Boolean).map((s: any) => normCod(String(s)))

  for (const cod of codCandidati) {
    if (aptByNotaNorm[cod]) return aptByNotaNorm[cod]
    const mapped = aliasNorm[cod]
    if (mapped && aptByNotaNorm[normCod(mapped)]) return aptByNotaNorm[normCod(mapped)]
    const m = cod.match(/\b([A-Z]{1,4}\d{2,3})\b/g)
    if (m) for (const mm of m) {
      if (aptByNotaNorm[mm]) return aptByNotaNorm[mm]
      const am = aliasNorm[mm]
      if (am && aptByNotaNorm[normCod(am)]) return aptByNotaNorm[normCod(am)]
    }
    for (const [alias, target] of Object.entries(aliasNorm)) {
      if (cod.includes(alias) && aptByNotaNorm[normCod(target)]) return aptByNotaNorm[normCod(target)]
    }
    for (const nota of Object.keys(aptByNotaNorm)) {
      if (cod.includes(nota)) return aptByNotaNorm[nota]
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret')
  if (auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  let inserted = 0, updated = 0, skipped = 0, errors = 0
  const logs: string[] = []

  try {
    const { data: apts } = await sb.from('apartamente').select('id,nota')
    const aptByNotaNorm: Record<string,string> = {}
    for (const a of apts||[]) if (a.nota) aptByNotaNorm[normCod(a.nota)] = a.id

    // Interval: 30 zile inapoi + 120 zile inainte, fara timezone issues
    const now = new Date()
    const from = new Date(now); from.setDate(from.getDate() - 30)
    const to   = new Date(now); to.setDate(to.getDate() + 120)
    const fromISO = from.toISOString().split('T')[0]
    const toISO   = to.toISOString().split('T')[0]
    const checkinParam  = fmtForApi(fromISO)
    const checkoutParam = fmtForApi(toISO)

    // Apel direct la 5SD (server-side, fara proxy browser)
    const res5sd = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t1: T1, t: T, actiune: 'get_bookings', checkin: checkinParam, checkout: checkoutParam }),
    })
    const rawData = await res5sd.json()
    const rezervariList: any[] = Array.isArray(rawData) ? rawData : []

    logs.push(`5SD: ${rezervariList.length} rezervari (${checkinParam} → ${checkoutParam})`)

    for (const b of rezervariList) {
      try {
        const checkin  = parse5star(b.prima_zi || b.checkin || '')
        const checkout = parse5star(b.ultima_zi || b.checkout || '')
        const idExtern = String(b.id || '')
        const numeClient = b.nume || b.name || '—'
        const canal = parseCanal(b.sursa || '')
        const telefon = b.telefon ? String(b.telefon) : null
        const totalPret = (parseFloat(b.pret_camera||'0')||0) + (parseFloat(b.pret_extra||'0')||0)
        const statusNou = (b.status_rezervare||'').toLowerCase().includes('anulat') ? 'anulata' : 'confirmata'
        const idValid = idExtern && idExtern.length > 2

        if (!checkin || !checkout) { skipped++; continue }

        const aptId = findAptId(b, aptByNotaNorm)
        if (!aptId) { skipped++; logs.push(`⚠ ${numeClient} (${checkin}): apt negasit`); continue }

        // Cauta existent dupa ID in observatii
        const { data: byId } = idValid
          ? await sb.from('rezervari').select('id,nume_client,canal,observatii,status_rezervare,apartament_id,data_checkin,data_checkout,suma_incasata,telefon_client').ilike('observatii', `%${idExtern}%`).limit(1)
          : { data: [] }

        // Cauta dupa apartament + date
        const { data: byApt } = !byId?.length
          ? await sb.from('rezervari').select('id,nume_client,canal,observatii,status_rezervare,apartament_id,data_checkin,data_checkout,suma_incasata,telefon_client').eq('apartament_id', aptId).eq('data_checkin', checkin).eq('data_checkout', checkout).limit(1)
          : { data: [] }

        const { data: byName } = (!byId?.length && !byApt?.length)
          ? await sb.from('rezervari').select('id,nume_client,canal,observatii,status_rezervare,apartament_id,data_checkin,data_checkout,suma_incasata,telefon_client').eq('nume_client', numeClient).eq('data_checkin', checkin).limit(1)
          : { data: [] }

        const existing = byId?.length ? byId : byApt?.length ? byApt : byName

        if (existing?.length) {
          const e = existing[0]
          const foundById = (byId?.length ?? 0) > 0
          const upd: any = {}
          if (!foundById) {
            if (numeClient && e.nume_client !== numeClient) upd.nume_client = numeClient
            if (canal && e.canal !== canal) upd.canal = canal
            if (idValid && !(e.observatii||'').includes(idExtern))
              upd.observatii = [b.tip_camera||b.numar_camera, idExtern, b.status_rezervare].filter(Boolean).join(' | ')
          }
          if (telefon && !e.telefon_client) upd.telefon_client = telefon
          if (aptId && e.apartament_id !== aptId) upd.apartament_id = aptId
          if (e.status_rezervare !== statusNou) upd.status_rezervare = statusNou
          if (checkin && e.data_checkin !== checkin) upd.data_checkin = checkin
          if (checkout && e.data_checkout !== checkout) upd.data_checkout = checkout
          if (totalPret > 0 && Number(e.suma_incasata) !== totalPret) { upd.suma_incasata = totalPret; upd.valoare_bruta = totalPret }

          if (Object.keys(upd).length) {
            const { error } = await sb.from('rezervari').update(upd).eq('id', e.id)
            if (error) { errors++; logs.push(`Err update ${idExtern}: ${error.message}`) }
            else updated++
          } else skipped++
        } else if (statusNou === 'anulata') {
          skipped++
        } else {
          const { error } = await sb.from('rezervari').insert({
            apartament_id: aptId, canal, nume_client: numeClient,
            data_checkin: checkin, data_checkout: checkout,
            suma_incasata: totalPret, valoare_bruta: totalPret, moneda: 'RON',
            telefon_client: telefon, status_rezervare: statusNou,
            status_plata: totalPret > 0 ? 'achitat' : 'neplatit',
            status_decont: 'nedecontat',
            observatii: [b.tip_camera||b.numar_camera, idExtern, b.status_rezervare].filter(Boolean).join(' | ') || null,
          })
          if (error) { errors++; logs.push(`Err insert ${idExtern}: ${error.message}`) }
          else { inserted++; logs.push(`✓ ${numeClient} | ${checkin}→${checkout} | ${b.tip_camera||'?'}`) }
        }
      } catch (e: any) { errors++; logs.push(`Err row: ${e.message}`) }
    }

    const result = { ok: true, total: rezervariList.length, inserted, updated, skipped, errors, duration_ms: Date.now()-startTime, logs: logs.slice(-20) }
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
