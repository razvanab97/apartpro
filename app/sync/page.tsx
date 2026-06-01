'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'
import { RefreshCw, Check, AlertCircle, Clock } from 'lucide-react'

function parseDate(s: string): string {
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const months: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
    ian:'01',mai:'05',iun:'06',iul:'07',aug:'08',noi:'11',
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
  return 'direct'
}

function statusFrom5star(status: string): string {
  const s = (status || '').toLowerCase()
  if (s.includes('anulat') || s.includes('cancel') || s.includes('storn')) return 'anulata'
  if (s.includes('check-out') || s.includes('checkout') || s.includes('finali')) return 'finalizata'
  return 'confirmata'
}

export default function SyncPage() {
  const [apts, setApts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [results, setResults] = useState<any>(null)
  const { toast, show } = useToast()

  const addLog = (msg: string) => setLog(prev => [...prev, `[${new Date().toLocaleTimeString('ro-RO')}] ${msg}`])

  useEffect(() => {
    supabase.from('apartamente').select('id,nota,nume').eq('status','activ')
      .then(({ data }) => setApts(data || []))
  }, [])

  async function fivestar5(actiune: string, params = {}) {
    const res = await fetch('/api/fivestar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actiune, ...params }),
    })
    return res.json()
  }

  async function syncRezervari() {
    if (!apts.length) { show('error', 'Nu s-au incarcat apartamentele'); return }
    setLoading(true)
    setLog([])
    setResults(null)

    const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0, no_apt: 0 }

    try {
      addLog('Conexiune la 5starDesk...')

      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const fmtDD = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}`

      const dateFrom = new Date(now); dateFrom.setDate(now.getDate() - 60)
      const dateTo   = new Date(now); dateTo.setDate(now.getDate() + 120)

      // Incearca mai multe actiuni - 5starDesk poate folosi nume diferite
      let rezervari5star: any[] = []
      let raw: any = null

      const actiuniDeTercetat = [
        { actiune: 'getrezervari', params: { data_de_la: fmtDD(dateFrom), data_pana_la: fmtDD(dateTo) } },
        { actiune: 'rezervari_lista', params: { data_de: fmtDD(dateFrom), data_pana: fmtDD(dateTo) } },
        { actiune: 'get_rezervari', params: { de_la: fmtDD(dateFrom), pana_la: fmtDD(dateTo) } },
      ]

      for (const { actiune, params } of actiuniDeTercetat) {
        addLog(`Incerc actiunea: ${actiune}...`)
        try {
          raw = await fivestar5(actiune, params)
          addLog(`Raspuns: ${JSON.stringify(raw).slice(0, 120)}`)

          if (raw?.ok === 'true' || raw?.ok === true) {
            rezervari5star = Array.isArray(raw?.rezervari) ? raw.rezervari :
              Array.isArray(raw?.data) ? raw.data : []
            addLog(`✓ ${actiune} functioneaza! ${rezervari5star.length} rezervari`)
            break
          } else if (Array.isArray(raw)) {
            rezervari5star = raw
            addLog(`✓ ${actiune} functioneaza! ${rezervari5star.length} rezervari`)
            break
          } else {
            addLog(`✗ ${actiune}: ${raw?.mesaj || raw?.error || 'Eroare necunoscuta'}`)
          }
        } catch (e: any) {
          addLog(`✗ ${actiune}: ${e.message}`)
        }
      }

      if (!rezervari5star.length) {
        addLog('⚠ Nicio actiune nu a returnat rezervari.')
        addLog('Verifica: 1) Conexiunea la internet, 2) Credentialele API, 3) Suportul 5starDesk')
        setResults({ ...stats, status: 'no_data', raw: JSON.stringify(raw).slice(0, 300) })
        setLoading(false)
        return
      }

      addLog(`Procesez ${rezervari5star.length} rezervari...`)

      // Fetch existing din Supabase
      const { data: existing } = await supabase.from('rezervari')
        .select('id,observatii,status_rezervare,data_checkin,data_checkout,apartament_id')
        .gte('data_checkout', new Date(now.getFullYear(), now.getMonth()-2, 1).toISOString().split('T')[0])

      const existingMap = new Map<string, any>()
      ;(existing || []).forEach((r: any) => {
        const m = (r.observatii || '').match(/5SD-(\d+)/)
        if (m) existingMap.set(m[1], r)
      })

      for (const r5 of rezervari5star) {
        const id5 = String(r5.id || '').trim()
        if (!id5) continue

        const client  = r5.nume || r5.client || r5.guest || 'Client'
        const telefon = r5.telefon ? String(r5.telefon) : null
        const checkin = parseDate(r5.prima_zi || r5.data_checkin || r5.data_sosire || r5.checkin || '')
        const checkout = parseDate(r5.ultima_zi || r5.data_checkout || r5.data_plecare || r5.checkout || '')
        if (!checkin || !checkout) { stats.skipped++; continue }

        const canal    = canalFromSursa(r5.sursa || r5.canal || r5.source || '')
        const statusRez = statusFrom5star(r5.status_rezervare || r5.status || '')
        const valoare  = parseFloat(r5.pret_camera || r5.valoare || r5.total || r5.pret || '0') || 0
        const nrPers   = Number(r5.nr_persoane || r5.persoane || r5.pax || 1)

        const unitateRaw = (r5.unitate || r5.camera || r5.apartament || r5.room || '').toLowerCase()
        const apt = apts.find((a: any) => {
          const nota = (a.nota || '').toLowerCase()
          const nume = (a.nume || '').toLowerCase()
          return unitateRaw.includes(nota) || unitateRaw.includes(nume.split(' ')[0]) || nota === unitateRaw
        })
        if (!apt) { stats.no_apt++; continue }

        const existing5 = existingMap.get(id5)

        if (existing5) {
          const changed = existing5.status_rezervare !== statusRez ||
            existing5.data_checkin !== checkin || existing5.data_checkout !== checkout
          if (changed) {
            await supabase.from('rezervari').update({
              status_rezervare: statusRez, data_checkin: checkin, data_checkout: checkout
            }).eq('id', existing5.id)
            stats.updated++
          } else {
            stats.skipped++
          }
        } else {
          const { error } = await supabase.from('rezervari').insert({
            apartament_id: apt.id,
            nume_client: client,
            telefon_client: telefon,
            data_checkin: checkin,
            data_checkout: checkout,
            canal,
            status_rezervare: statusRez,
            suma_incasata: valoare,
            nr_persoane: nrPers,
            observatii: `5SD-${id5}`,
          })
          if (error) { stats.errors++; addLog(`Eroare insert: ${error.message}`) }
          else stats.inserted++
        }
      }

      addLog(`✓ Gata! Inserate: ${stats.inserted}, Actualizate: ${stats.updated}, Sarite: ${stats.skipped}, Fara apt: ${stats.no_apt}`)
      setResults({ ...stats, total_5star: rezervari5star.length, status: 'ok' })
      show('success', `Sync complet: +${stats.inserted} inserate, ${stats.updated} actualizate`)

    } catch (e: any) {
      addLog(`❌ Eroare generala: ${e.message}`)
      stats.errors++
      setResults({ ...stats, status: 'error', message: e.message })
      show('error', 'Eroare sync: ' + e.message)
    }

    setLoading(false)
  }

  const glass: React.CSSProperties = {
    background: 'rgba(20,38,65,0.6)',
    border: '1px solid rgba(100,160,255,0.15)',
    borderRadius: 14,
  }

  return (
    <>
      <PageHeader title="Sync 5starDesk" subtitle="Sincronizare rezervari din PMS"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Buton sync */}
        <div style={{ ...glass, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#E8F4FF', marginBottom: 4 }}>Sincronizare manuala</div>
              <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.45)' }}>
                Preia rezervarile din ultimele 60 de zile + urmatoarele 120 zile din 5starDesk
              </div>
            </div>
            <button
              onClick={syncRezervari}
              disabled={loading || !apts.length}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 22px', borderRadius: 10,
                border: '1px solid rgba(77,163,255,0.4)',
                background: loading ? 'rgba(77,163,255,0.1)' : 'rgba(77,163,255,0.2)',
                color: '#7BC8FF', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1,
                transition: 'all .2s',
              }}
            >
              <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/>
              {loading ? 'Se sincronizeaza...' : 'Sincronizeaza acum'}
            </button>
          </div>

          {apts.length > 0 && (
            <div style={{ fontSize: 11, color: 'rgba(74,222,128,0.5)' }}>
              ✓ {apts.length} apartamente active incarcate
            </div>
          )}
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div style={{ ...glass, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
              Log sincronizare
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8, maxHeight: 300, overflowY: 'auto' }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.includes('✓') ? '#4ADE80' : l.includes('✗') || l.includes('❌') ? '#F87171' : l.includes('⚠') ? '#FCD34D' : 'rgba(214,228,244,0.6)' }}>
                  {l}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rezultate */}
        {results && (
          <div style={{ ...glass, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
              Rezultate
            </div>
            {results.status === 'ok' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {[
                  { label: 'Inserate', value: results.inserted, color: '#4ADE80' },
                  { label: 'Actualizate', value: results.updated, color: '#7BC8FF' },
                  { label: 'Total 5SD', value: results.total_5star, color: 'rgba(159,215,255,0.6)' },
                  { label: 'Erori', value: results.errors, color: results.errors > 0 ? '#F87171' : '#4ADE80' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'rgba(20,38,65,0.4)', border: '1px solid rgba(100,160,255,0.1)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' as const }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            ) : results.status === 'no_data' ? (
              <div style={{ padding: 14, background: 'rgba(252,211,77,0.08)', border: '1px solid rgba(252,211,77,0.2)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: '#FCD34D', fontWeight: 600, marginBottom: 8 }}>⚠ API-ul 5starDesk nu a returnat date</div>
                <div style={{ fontSize: 11, color: 'rgba(214,228,244,0.5)', marginBottom: 8 }}>
                  Posibile cauze: 1) Actiunea getrezervari nu este activata pe contul tau, 2) IP/domeniu blocat
                </div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(159,215,255,0.3)', wordBreak: 'break-all' as const }}>
                  Raspuns raw: {results.raw}
                </div>
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(252,211,77,0.06)', borderRadius: 8, fontSize: 11, color: 'rgba(252,211,77,0.6)' }}>
                  <b>Solutie:</b> Contacteaza suportul 5starDesk si cere activarea API-ului de rezervari (getrezervari) pe contul tau.
                </div>
              </div>
            ) : (
              <div style={{ padding: 14, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, fontSize: 12, color: '#F87171' }}>
                Eroare: {results.message}
              </div>
            )}
          </div>
        )}

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <Toast toast={toast}/>
    </>
  )
}
