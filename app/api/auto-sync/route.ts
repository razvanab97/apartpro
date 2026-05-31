import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const T1  = '3cvbat7zgH54347Artesrtyrt466yj57se4lkg4'
const T   = 'Y5paEuVpBBop8pHG1qLVF6ymqCdPkzlncJGK0L50'
const API = 'https://www.5stardesk.ro/apih.php'
const CRON_SECRET = process.env.CRON_SECRET || 'apartpro-cron-2026'

async function fivestar(actiune: string, params = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t1: T1, t: T, actiune, ...params }),
  })
  return res.json()
}

function canalFromSursa(sursa: string): string {
  const s = (sursa || '').toLowerCase()
  if (s.includes('booking')) return 'booking'
  if (s.includes('airbnb')) return 'airbnb'
  if (s.includes('direct') || s.includes('direct')) return 'direct'
  if (s.includes('telefon')) return 'telefon'
  if (s.includes('whatsapp')) return 'whatsapp'
  return 'direct'
}

function statusFromFivestar(status: string): string {
  const s = (status || '').toLowerCase()
  if (s.includes('anulat') || s.includes('cancel')) return 'anulata'
  if (s.includes('confirmat') || s.includes('confirm')) return 'confirmata'
  if (s.includes('check-in') || s.includes('checkin')) return 'confirmata'
  if (s.includes('check-out') || s.includes('checkout')) return 'finalizata'
  return 'confirmata'
}

export async function GET(req: NextRequest) {
  // Verifica secret pentru cron
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret')
  if (auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const results = { inserted: 0, updated: 0, cancelled: 0, errors: [] as string[], apartamente_sync: 0 }

  try {
    // 1. Fetch apartamente din Supabase
    const { data: apts } = await supabase.from('apartamente').select('id,nota,nume').eq('status', 'activ')
    if (!apts?.length) return NextResponse.json({ error: 'No active apartments' })

    // 2. Fetch rezervari din 5starDesk pentru urmatoarele 90 zile + ultimele 30
    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - 30)
    const dateTo = new Date()
    dateTo.setDate(dateTo.getDate() + 90)

    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

    const raw5star = await fivestar('rezervari_lista', {
      data_de: fmt(dateFrom),
      data_pana: fmt(dateTo),
    })

    const rezervari5star = Array.isArray(raw5star) ? raw5star :
                           Array.isArray(raw5star?.rezervari) ? raw5star.rezervari :
                           Array.isArray(raw5star?.data) ? raw5star.data : []

    if (!rezervari5star.length) {
      await supabase.from('setari').upsert({
        cheie: 'last_sync', valoare: JSON.stringify({ time: new Date().toISOString(), status: 'ok', count: 0, msg: 'No reservations from 5starDesk' })
      }, { onConflict: 'cheie' })
      return NextResponse.json({ ...results, msg: 'No reservations from 5starDesk', raw_sample: JSON.stringify(raw5star).slice(0, 200) })
    }

    // 3. Fetch rezervari existente din Supabase (ultimele 30 + urm 90 zile)
    const { data: existingRez } = await supabase.from('rezervari')
      .select('id,observatii,status_rezervare,data_checkin,data_checkout,apartament_id')
      .gte('data_checkout', fmt(dateFrom))
      .neq('canal', 'intern') // nu atingem rezervarile interne

    const existingMap = new Map<string, any>()
    ;(existingRez || []).forEach((r: any) => {
      const obs = r.observatii || ''
      const match = obs.match(/5SD-[\w\d-]+|ID:\s*[\w\d-]+|#[\w\d]+/)
      if (match) existingMap.set(match[0], r)
    })

    // 4. Proceseaza fiecare rezervare din 5starDesk
    for (const r5 of rezervari5star) {
      try {
        const id5star = r5.id || r5.reservation_id || r5.cod || r5.nr
        if (!id5star) continue

        const sursa = r5.sursa || r5.source || r5.canal || r5.channel || ''
        const canal = canalFromSursa(sursa)
        const status5star = r5.status || r5.stare || 'confirmata'
        const statusRez = statusFromFivestar(status5star)

        // Gaseste apartamentul
        const numeApt = r5.camera || r5.apartament || r5.room || r5.unit || ''
        const apt = apts.find((a: any) =>
          numeApt.toLowerCase().includes(a.nota?.toLowerCase()) ||
          numeApt.toLowerCase().includes(a.nume?.toLowerCase()) ||
          a.nota?.toLowerCase() === numeApt.toLowerCase()
        )

        const aptId = apt?.id || null

        const checkin  = r5.data_checkin || r5.checkin || r5.check_in || r5.arrival || ''
        const checkout = r5.data_checkout || r5.checkout || r5.check_out || r5.departure || ''
        if (!checkin || !checkout) continue

        const client   = r5.client || r5.guest || r5.nume_client || r5.name || 'Client 5starDesk'
        const telefon  = r5.telefon || r5.phone || r5.tel || null
        const email    = r5.email || null
        const nrPers   = Number(r5.nr_persoane || r5.persons || r5.pax || 1)
        const valoare  = Number(r5.valoare || r5.total || r5.price || r5.suma || 0)
        const obsKey   = `5SD-${id5star}`

        const existing = existingMap.get(obsKey)

        if (existing) {
          // Actualizeaza daca s-a schimbat statusul sau datele
          const needsUpdate =
            existing.status_rezervare !== statusRez ||
            existing.data_checkin !== checkin ||
            existing.data_checkout !== checkout

          if (needsUpdate) {
            const { error } = await supabase.from('rezervari').update({
              status_rezervare: statusRez,
              data_checkin: checkin,
              data_checkout: checkout,
              updated_at: new Date().toISOString(),
            }).eq('id', existing.id)

            if (!error) {
              if (statusRez === 'anulata') results.cancelled++
              else results.updated++
            } else {
              results.errors.push(`Update ${obsKey}: ${error.message}`)
            }
          }
        } else {
          // Insereaza rezervare noua
          const { error } = await supabase.from('rezervari').insert({
            apartament_id: aptId,
            nume_client: client,
            telefon_client: telefon,
            email_client: email,
            data_checkin: checkin,
            data_checkout: checkout,
            nr_persoane: nrPers,
            valoare_bruta: valoare,
            suma_incasata: valoare,
            moneda: 'RON',
            canal: canal,
            status_rezervare: statusRez,
            status_plata: 'neachitat',
            status_decont: 'nedecontat',
            observatii: obsKey,
          })

          if (!error) results.inserted++
          else results.errors.push(`Insert ${obsKey}: ${error.message}`)
        }
      } catch (e: any) {
        results.errors.push(`Row error: ${e.message}`)
      }
    }

    // 5. Salveaza log sync
    await supabase.from('setari').upsert({
      cheie: 'last_sync',
      valoare: JSON.stringify({
        time: new Date().toISOString(),
        status: 'ok',
        duration_ms: Date.now() - startTime,
        ...results,
        total_5star: rezervari5star.length,
      })
    }, { onConflict: 'cheie' })

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startTime,
      total_from_5star: rezervari5star.length,
      ...results,
    })

  } catch (e: any) {
    await supabase.from('setari').upsert({
      cheie: 'last_sync',
      valoare: JSON.stringify({ time: new Date().toISOString(), status: 'error', error: e.message })
    }, { onConflict: 'cheie' })
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

// Manual trigger
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const url = new URL(req.url)
  url.searchParams.set('secret', body.secret || CRON_SECRET)
  const fakeReq = new NextRequest(url, { headers: req.headers })
  return GET(fakeReq)
}
