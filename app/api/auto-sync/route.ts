import { NextRequest, NextResponse } from 'next/server'
import { supabase as sb } from '@/lib/supabase'
import { idsDinObs, citesteListaSetari, adaugaDeVerificat, CHEIE_SARITE, type DeVerificat } from '@/lib/syncFivestar'

const T1  = '3cvbat7zgH54347Artesrtyrt466yj57se4lkg4'
const T   = 'Y5paEuVpBBop8pHG1qLVF6ymqCdPkzlncJGK0L50'
const API = 'https://www.5stardesk.ro/apih.php'
const CRON_SECRET = process.env.CRON_SECRET || 'apartpro-cron-2026'

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

    const sarite = new Set<string>((await citesteListaSetari(CHEIE_SARITE)).map(String))
    const deVerificat: DeVerificat[] = []
    for (const b of rezervariList) {
      try {
        const checkin  = parse5star(b.prima_zi || b.checkin || '')
        const checkout = parse5star(b.ultima_zi || b.checkout || '')
        const idExtern = String(b.id || '')
        const numeClient = b.nume || b.name || '—'
        const canal = parseCanal(b.sursa || '')
        const telefon = b.telefon ? String(b.telefon) : null
        const nrPersoane = (Number(b.adulti) || 0) + (Number(b.copii) || 0) || null
        const totalPret = (parseFloat(b.pret_camera||'0')||0) + (parseFloat(b.pret_extra||'0')||0)
        // "Oaspete cazat/decazat" -> 'finalizata', ca in lib/syncFivestar.ts (altfel cron-ul de noapte le
        // readucea pe 'confirmata' si sincronizarea manuala le punea inapoi - ping-pong zilnic)
        const statusRaw = (b.status_rezervare||'').toLowerCase()
        const statusNou = statusRaw.includes('anulat') ? 'anulata' : (statusRaw.includes('cazat') ? 'finalizata' : 'confirmata')
        const idValid = idExtern && idExtern.length > 2

        if (!checkin || !checkout) { skipped++; continue }
        if (idExtern && sarite.has(idExtern)) { skipped++; continue }  // marcata "sari" in Sync -> De verificat

        const aptId = findAptId(b, aptByNotaNorm)
        if (!aptId) { skipped++; logs.push(`⚠ ${numeClient} (${checkin}): apt negasit`); continue }

        // Cauta existent dupa ID in observatii (token exact, nu substring)
        const { data: candId } = idValid
          ? await sb.from('rezervari').select('id,nume_client,canal,observatii,status_rezervare,apartament_id,data_checkin,data_checkout,suma_incasata,telefon_client,nr_persoane').ilike('observatii', `%${idExtern}%`).limit(10)
          : { data: [] }
        const byId = (candId||[]).filter((r:any) => idsDinObs(r.observatii).includes(idExtern)).slice(0,1)

        // Un rand legat deja de ALT ID 5starDesk nu e aceeasi rezervare (acelasi client pe mai multe
        // camere in aceleasi date, sau rezervare noua pe slotul uneia anulate) - vezi lib/syncFivestar.ts
        const liber = (r:any) => { const ids = idsDinObs(r.observatii); return !idValid || !ids.length || ids.includes(idExtern) }

        // Cauta dupa apartament + date
        const { data: candApt } = !byId.length
          ? await sb.from('rezervari').select('id,nume_client,canal,observatii,status_rezervare,apartament_id,data_checkin,data_checkout,suma_incasata,telefon_client,nr_persoane').eq('apartament_id', aptId).eq('data_checkin', checkin).eq('data_checkout', checkout).limit(10)
          : { data: [] }
        const byApt = (candApt||[]).filter(liber).slice(0,1)
        const blocate: any[] = (candApt||[]).filter((r:any) => !liber(r))

        const { data: candName } = (!byId.length && !byApt.length)
          ? await sb.from('rezervari').select('id,nume_client,canal,observatii,status_rezervare,apartament_id,data_checkin,data_checkout,suma_incasata,telefon_client,nr_persoane').eq('nume_client', numeClient).eq('data_checkin', checkin).limit(10)
          : { data: [] }
        const libereName = (candName||[]).filter(liber)
        for (const r of (candName||[])) if (!liber(r) && !blocate.some(x => x.id === r.id)) blocate.push(r)
        const peAptIndicat = libereName.find((r:any) => r.apartament_id === aptId)
        const byName = peAptIndicat ? [peAptIndicat] : libereName.slice(0,1)

        const existing = byId.length ? byId : byApt.length ? byApt : byName

        if (existing?.length) {
          const e = existing[0]
          const foundById = byId.length > 0
          const upd: any = {}
          if (!foundById) {
            if (numeClient && e.nume_client !== numeClient) upd.nume_client = numeClient
            if (canal && e.canal !== canal) upd.canal = canal
            if (idValid && !(e.observatii||'').includes(idExtern))
              upd.observatii = [b.tip_camera||b.numar_camera, idExtern, b.status_rezervare].filter(Boolean).join(' | ')
          }
          if (telefon && !e.telefon_client) { upd.telefon_client = telefon; logs.push(`📞 ${numeClient} (${checkin}) — telefon completat`) }  // rezervari fara numar: il cautam la fiecare sync
          if (nrPersoane && Number(e.nr_persoane) !== nrPersoane) upd.nr_persoane = nrPersoane
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
        } else if (blocate.length) {
          // Ambigua -> decizie manuala in Sync -> "De verificat", nu import automat
          const nota = (id: string) => (apts||[]).find((a:any)=>a.id===id)?.nota || '?'
          const motiv = blocate.map((r:any) => `${r.nume_client} · ${nota(r.apartament_id)} · ${r.data_checkin}→${r.data_checkout} · ID ${idsDinObs(r.observatii).join(',')}${r.status_rezervare==='anulata'?' (anulată)':''}`).join(' | ')
          deVerificat.push({ id5sd: idExtern, nume: numeClient, checkin, checkout, aptId, cod: nota(aptId), canal, telefon, nrPersoane,
            pret: totalPret, statusNou, obs: [b.tip_camera||b.numar_camera, idExtern, b.status_rezervare].filter(Boolean).join(' | '), motiv, la: new Date().toISOString() })
          skipped++; logs.push(`⏸ ${numeClient} (${checkin}) — de verificat manual`)
        } else {
          const { error } = await sb.from('rezervari').insert({
            apartament_id: aptId, canal, nume_client: numeClient,
            data_checkin: checkin, data_checkout: checkout,
            suma_incasata: totalPret, valoare_bruta: totalPret, moneda: 'RON',
            telefon_client: telefon, nr_persoane: nrPersoane, status_rezervare: statusNou,
            status_plata: totalPret > 0 ? 'achitat' : 'neplatit',
            status_decont: 'nedecontat',
            observatii: [b.tip_camera||b.numar_camera, idExtern, b.status_rezervare].filter(Boolean).join(' | ') || null,
          })
          if (error) { errors++; logs.push(`Err insert ${idExtern}: ${error.message}`) }
          else { inserted++; logs.push(`✓ ${numeClient} | ${checkin}→${checkout} | ${b.tip_camera||'?'}`) }
        }
      } catch (e: any) { errors++; logs.push(`Err row: ${e.message}`) }
    }

    await adaugaDeVerificat(deVerificat)
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
