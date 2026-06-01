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

// Parseaza data din format "01 May 2026" -> "2026-05-01"
function parseDate(s: string): string {
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s // deja ISO
  const months: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
    ian:'01',mai:'05',iun:'06',iul:'07',aug2:'08',noi:'11',
  }
  const parts = s.trim().split(/\s+/)
  if (parts.length === 3) {
    const [day, mon, year] = parts
    const m = months[mon.toLowerCase().slice(0,3)] || '01'
    return `${year}-${m}-${day.padStart(2,'0')}`
  }
  return s
}

function canalFromSursa(sursa: string): string {
  const s = (sursa || '').toLowerCase()
  if (s.includes('booking')) return 'booking'
  if (s.includes('airbnb')) return 'airbnb'
  if (s.includes('whatsapp')) return 'whatsapp'
  if (s.includes('telefon')) return 'telefon'
  if (s.includes('manual') || s.includes('intern') || s.includes('recepto') || s.includes('front')) return 'direct'
  if (s.includes('direct') || s.includes('site')) return 'direct'
  if (s === '' || s === 'manual' || s === 'intern') return 'direct'
  return 'direct'
}

function statusFromFivestar(status: string): string {
  const s = (status || '').toLowerCase()
  if (s.includes('anulat') || s.includes('cancel') || s.includes('storn')) return 'anulata'
  if (s.includes('check-out') || s.includes('checkout') || s.includes('finali')) return 'finalizata'
  return 'confirmata'
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || req.nextUrl.searchParams.get('secret')
  if (auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const results = { inserted: 0, updated: 0, cancelled: 0, errors: [] as string[], skipped_no_apt: 0 }

  try {
    // Fetch apartamente active
    const { data: apts } = await supabase.from('apartamente').select('id,nota,nume').eq('status','activ')
    if (!apts?.length) return NextResponse.json({ error: 'No active apartments' })

    // Fetch din 5starDesk - ultimele 30 zile + 90 zile viitor
    const dateFrom = new Date(); dateFrom.setDate(dateFrom.getDate() - 30)
    const dateTo   = new Date(); dateTo.setDate(dateTo.getDate() + 90)
    const fmt = (d: Date) => `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`
    const fmtISO = (d: Date) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`

    const raw = await fivestar('rezervari_lista', {
      data_de: fmtISO(dateFrom),
      data_pana: fmtISO(dateTo),
    })

    const rezervari5star: any[] = Array.isArray(raw) ? raw :
      Array.isArray(raw?.rezervari) ? raw.rezervari :
      Array.isArray(raw?.data) ? raw.data : []

    if (!rezervari5star.length) {
      await saveLog({ time: new Date().toISOString(), status: 'ok', total_5star: 0, ...results, msg: 'No data from 5starDesk', raw_sample: JSON.stringify(raw).slice(0,300) })
      return NextResponse.json({ ok: true, total_5star: 0, ...results, raw_sample: JSON.stringify(raw).slice(0,300) })
    }

    // Fetch rezervari existente din Supabase (non-interne)
    const { data: existing } = await supabase.from('rezervari')
      .select('id,observatii,status_rezervare,data_checkin,data_checkout,apartament_id')
      .gte('data_checkout', fmtISO(dateFrom))
      // Incluse toate canalele, inclusiv manual/intern

    // Map by 5SD-id
    const existingMap = new Map<string,any>()
    ;(existing||[]).forEach((r:any) => {
      const m = (r.observatii||'').match(/5SD-(\d+)/)
      if (m) existingMap.set(m[1], r)
    })

    // Proceseaza fiecare rezervare
    for (const r5 of rezervari5star) {
      try {
        const id5 = String(r5.id || '').trim()
        if (!id5) continue

        // Campuri exacte din 5starDesk conform screenshot
        const client   = r5.nume || r5.client || r5.guest || 'Client'
        const telefon  = r5.telefon ? String(r5.telefon) : null
        const email    = typeof r5.email === 'string' ? r5.email : null
        const checkin  = parseDate(r5.prima_zi || r5.data_checkin || r5.data_sosire || r5.checkin || '')
        const checkout = parseDate(r5.ultima_zi || r5.data_checkout || r5.data_plecare || r5.checkout || '')
        if (!checkin || !checkout) continue

        const sursa    = r5.sursa || r5.canal || r5.source || ''
        const canal    = canalFromSursa(sursa)
        const statusRez= statusFromFivestar(r5.status_rezervare || r5.status || '')
        const valoare  = parseFloat(r5.pret_camera || r5.valoare || r5.total || r5.pret || '0') || 0
        const nrPers   = Number(r5.nr_persoane || r5.persoane || r5.pax || 1)
        const nrNopti  = r5.nr_nopti ? Number(r5.nr_nopti) : 0

        // Identifica apartamentul dupa 'unitate' sau 'camera'
        const unitateRaw = (r5.unitate || r5.camera || r5.apartament || r5.room || '').toLowerCase()
        const apt = apts.find((a:any) => {
          const nota = (a.nota||'').toLowerCase()
          const nume = (a.nume||'').toLowerCase()
          return unitateRaw.includes(nota) || unitateRaw.includes(nume.split(' ')[0]) ||
                 nota === unitateRaw || unitateRaw.includes(nota.replace(/\d/g,'').trim())
        })

        if (!apt) {
          results.skipped_no_apt++
          // Totusi insereaza fara apartament_id pentru a nu pierde date
        }

        const existing5 = existingMap.get(id5)

        if (existing5) {
          // Verifica daca trebuie actualizat
          const changed = existing5.status_rezervare !== statusRez ||
            existing5.data_checkin !== checkin ||
            existing5.data_checkout !== checkout

          if (changed) {
            const { error } = await supabase.from('rezervari').update({
              status_rezervare: statusRez,
              data_checkin: checkin,
              data_checkout: checkout,
              ...(apt ? { apartament_id: apt.id } : {}),
            }).eq('id', existing5.id)
            if (!error) {
              if (statusRez === 'anulata') results.cancelled++
              else results.updated++
            } else results.errors.push(`Update 5SD-${id5}: ${error.message}`)
          }
        } else {
          // Insereaza rezervare noua
          const { error } = await supabase.from('rezervari').insert({
            apartament_id: apt?.id || null,
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
            observatii: `5SD-${id5}`,
          })
          if (!error) results.inserted++
          else results.errors.push(`Insert 5SD-${id5}: ${error.message}`)
        }
      } catch (e:any) {
        results.errors.push(`Row: ${e.message}`)
      }
    }

    const log = { time: new Date().toISOString(), status: 'ok', total_5star: rezervari5star.length, duration_ms: Date.now()-startTime, ...results }
    await saveLog(log)
    return NextResponse.json({ ok: true, ...log })

  } catch (e:any) {
    await saveLog({ time: new Date().toISOString(), status: 'error', error: e.message })
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

async function saveLog(data: object) {
  await supabase.from('setari').upsert({ cheie: 'last_sync', valoare: JSON.stringify(data) }, { onConflict: 'cheie' })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(()=>({}))
  const url = new URL(req.url)
  url.searchParams.set('secret', body.secret || CRON_SECRET)
  return GET(new NextRequest(url, { headers: req.headers }))
}
