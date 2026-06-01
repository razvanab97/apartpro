'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'

type PretApt = {
  id: string
  nume: string
  booking: number | null
  bookingOriginal: number | null
  airbnb: number | null
  updatedAt: string
}

// Extrage pretul din HTML Booking direct in browser
function extractBookingPrice(html: string): { pret: number | null; original: number | null } {
  const patterns = [
    /(\d+)\s*lei[\s\S]{0,100}?Include taxe/i,
    /Preț actual[^\d]*(\d{2,4})\s*lei/i,
    /"displayPrice"[^}]*?(\d{2,4})/,
    /data-price="(\d{2,4})"/,
    /class="[^"]*price[^"]*"[^>]*>(\d{2,4})/i,
    /(\d{2,4})\s*RON/i,
  ]
  let pret: number | null = null
  for (const p of patterns) {
    const m = html.match(p)
    if (m && parseInt(m[1]) > 50 && parseInt(m[1]) < 5000) {
      pret = parseInt(m[1]); break
    }
  }
  const origM = html.match(/Preț inițial[^\d]*(\d{2,4})\s*lei/i)
  const original = origM ? parseInt(origM[1]) : null
  return { pret, original }
}

// Extrage pretul din HTML Airbnb direct in browser
function extractAirbnbPrice(html: string): number | null {
  const patterns = [
    /"price":\s*\{"amount":\s*(\d+)/,
    /(\d{2,4})\s*lei\s*\/\s*noapte/i,
    /"lowestPrice":\s*(\d+)/,
    /"discountedPrice":\s*(\d+)/,
    /data-testid="price-summary"[^>]*>[^<]*(\d{2,4})/i,
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m && parseInt(m[1]) > 50 && parseInt(m[1]) < 5000) return parseInt(m[1])
  }
  return null
}

export default function PreturiPage() {
  const [apts, setApts] = useState<any[]>([])
  const [preturi, setPreturi] = useState<PretApt[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingApt, setLoadingApt] = useState<string | null>(null)
  const [dataSelectata, setDataSelectata] = useState('')
  const { toast, show } = useToast()

  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  const add = (n: number) => { const d = new Date(); d.setDate(d.getDate()+n); return fmt(d) }
  const today = fmt(new Date())
  const dow = new Date().getDay()

  const QUICK = [
    { label: 'Azi', val: today },
    { label: 'Mâine', val: add(1) },
    { label: 'Poimâine', val: add(2) },
    { label: 'Sâmbătă', val: add(dow===6?7:6-dow) },
    { label: 'Duminică', val: add(dow===0?7:7-dow) },
    { label: '+7 zile', val: add(7) },
  ]

  useEffect(() => {
    supabase.from('apartamente')
      .select('id,nume,nota,link_booking,link_airbnb')
      .eq('status', 'activ')
      .then(({ data }) => {
        setApts(data || [])
        setDataSelectata(today)
      })
  }, [])

  // Fetch un singur URL direct din browser (evita CORS folosind proxy minimal)
  async function fetchUrl(url: string): Promise<string> {
    // Folosim un proxy CORS pentru a citi HTML-ul
    const corsProxy = 'https://api.allorigins.win/raw?url='
    const res = await fetch(corsProxy + encodeURIComponent(url), {
      headers: { 'Accept': 'text/html' }
    })
    return res.text()
  }

  async function fetchPreturi(data: string) {
    if (!apts.length) { show('error', 'Nu sunt apartamente cu linkuri'); return }
    setLoading(true)
    setPreturi([])

    const coD = new Date(data + 'T12:00:00'); coD.setDate(coD.getDate()+1)
    const checkout = fmt(coD)
    const now = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })

    const results: PretApt[] = []

    for (const apt of apts) {
      setLoadingApt(apt.nota || apt.nume)
      const bUrl = apt.link_booking
      const aUrl = apt.link_airbnb
      let bPret: number | null = null
      let bOriginal: number | null = null
      let aPret: number | null = null

      if (bUrl) {
        try {
          const sep = bUrl.includes('?') ? '&' : '?'
          const fullUrl = bUrl.includes('checkin=') ? bUrl :
            bUrl + sep + `checkin=${data}&checkout=${checkout}&group_adults=2&no_rooms=1`
          const html = await fetchUrl(fullUrl)
          const { pret, original } = extractBookingPrice(html)
          bPret = pret; bOriginal = original
        } catch {}
      }

      if (aUrl) {
        try {
          const sep = aUrl.includes('?') ? '&' : '?'
          const fullUrl = aUrl.includes('check_in=') ? aUrl :
            aUrl + sep + `check_in=${data}&check_out=${checkout}&adults=2`
          const html = await fetchUrl(fullUrl)
          aPret = extractAirbnbPrice(html)
        } catch {}
      }

      results.push({
        id: apt.id,
        nume: apt.nota || apt.nume,
        booking: bPret,
        bookingOriginal: bOriginal,
        airbnb: aPret,
        updatedAt: now
      })

      // Afiseaza progresiv
      setPreturi([...results])
    }

    setLoadingApt(null)
    setLoading(false)
    const found = results.filter(r => r.booking || r.airbnb).length
    show(found > 0 ? 'success' : 'error',
      found > 0 ? `${found} prețuri găsite` : 'Nu s-au găsit prețuri — verifică linkurile')
  }

  const panel: React.CSSProperties = {
    background: 'rgba(214,228,244,0.05)',
    border: '1px solid rgba(159,215,255,0.1)',
    borderRadius: 14, overflow: 'hidden', marginBottom: 14,
  }

  return (
    <>
      <PageHeader title="💰 Prețuri live" subtitle="Booking.com & Airbnb — prețuri în timp real"/>
      <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>

        {/* Selector dată */}
        <div style={panel}>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>
              Selectează data check-in
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 12 }}>
              {QUICK.map(({ label, val }) => (
                <button key={val} onClick={() => setDataSelectata(val)}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${dataSelectata===val?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.15)'}`,
                    background: dataSelectata===val?'rgba(77,163,255,0.15)':'transparent',
                    color: dataSelectata===val?'#7BC8FF':'rgba(159,215,255,0.5)', transition: 'all .15s' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <input type="date" value={dataSelectata} onChange={e => setDataSelectata(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(100,160,255,0.2)', background: 'rgba(20,38,65,0.8)', color: 'rgba(214,228,244,0.9)', fontSize: 13, outline: 'none' }}/>
              <button onClick={() => fetchPreturi(dataSelectata)} disabled={loading || !dataSelectata || !apts.length}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(77,163,255,0.4)', background: 'rgba(77,163,255,0.12)', color: '#7BC8FF', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: loading ? 0.5 : 1 }}>
                {loading ? `⏳ ${loadingApt || 'Se citesc...'}` : '🔄 Actualizează prețurile'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabel prețuri */}
        {preturi.length > 0 && (
          <div style={panel}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(159,215,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>Check-in: {dataSelectata}</span>
              <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.35)' }}>actualizat {preturi[0]?.updatedAt}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(159,215,255,0.08)' }}>
                  {['Apartament', '🏨 Booking', '🏠 Airbnb', 'Diferență'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left' as const, fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preturi.map((p, i) => {
                  const diff = p.booking && p.airbnb ? p.booking - p.airbnb : null
                  const isLoading = loading && loadingApt === p.nume
                  return (
                    <tr key={p.id} style={{ borderBottom: i < preturi.length-1 ? '1px solid rgba(159,215,255,0.04)' : 'none', opacity: isLoading ? 0.5 : 1 }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500, color: '#E8F4FF' }}>{p.nume}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {p.booking ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#60A5FA' }}>{p.booking} RON</span>
                            {p.bookingOriginal && p.bookingOriginal !== p.booking && (
                              <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.3)', textDecoration: 'line-through' }}>{p.bookingOriginal}</span>
                            )}
                          </div>
                        ) : <span style={{ color: 'rgba(159,215,255,0.2)', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: p.airbnb ? '#F87171' : 'rgba(159,215,255,0.2)' }}>
                        {p.airbnb ? `${p.airbnb} RON` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace',
                        color: diff===null?'rgba(159,215,255,0.3)':Math.abs(diff)<=5?'rgba(159,215,255,0.5)':diff>0?'#FCD34D':'#4ADE80' }}>
                        {diff===null?'—':diff>0?`Booking +${diff}`:diff<0?`Airbnb +${Math.abs(diff)}`:'Egal'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && preturi.length === 0 && (
          <div style={{ textAlign: 'center' as const, padding: '40px 20px', color: 'rgba(159,215,255,0.3)', fontSize: 13 }}>
            Selectează o dată și apasă <b style={{ color: 'rgba(77,163,255,0.6)' }}>Actualizează prețurile</b><br/>
            <span style={{ fontSize: 11, marginTop: 8, display: 'block' }}>Asigură-te că linkurile Booking/Airbnb sunt salvate în fișa apartamentelor</span>
          </div>
        )}

      </div>
      <Toast toast={toast}/>
    </>
  )
}
