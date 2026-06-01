'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'

type PretApt = {
  id: string
  nume: string
  booking: number | null
  bookingOriginal: number | null
  airbnb: number | null
  bookingUrl: string | null
  airbnbUrl: string | null
  updatedAt: string
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
        // Initializeaza tabelul cu date goale
        setPreturi((data||[]).map((apt:any) => ({
          id: apt.id,
          nume: apt.nota || apt.nume,
          booking: null,
          bookingOriginal: null,
          airbnb: null,
          bookingUrl: apt.link_booking || null,
          airbnbUrl: apt.link_airbnb || null,
          updatedAt: ''
        })))
      })
  }, [])

  function buildUrl(baseUrl: string, platform: string, checkin: string, checkout: string): string {
    if (!baseUrl) return ''
    const sep = baseUrl.includes('?') ? '&' : '?'
    if (platform === 'booking') {
      if (baseUrl.includes('checkin=')) return baseUrl
      return baseUrl + sep + `checkin=${checkin}&checkout=${checkout}&group_adults=2&no_rooms=1`
    }
    if (platform === 'airbnb') {
      if (baseUrl.includes('check_in=')) return baseUrl
      return baseUrl + sep + `check_in=${checkin}&check_out=${checkout}&adults=2`
    }
    return baseUrl
  }

  async function fetchPreturi(data: string) {
    if (!apts.length) return
    setLoading(true)
    const coD = new Date(data + 'T12:00:00'); coD.setDate(coD.getDate()+1)
    const checkout = fmt(coD)
    const now = new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })

    // Reset preturi
    setPreturi(apts.map((apt:any) => ({
      id: apt.id, nume: apt.nota||apt.nume,
      booking: null, bookingOriginal: null, airbnb: null,
      bookingUrl: apt.link_booking||null, airbnbUrl: apt.link_airbnb||null, updatedAt: now
    })))

    for (const apt of apts) {
      setLoadingApt(apt.nota || apt.nume)

      // Citeste Booking
      if (apt.link_booking) {
        const url = buildUrl(apt.link_booking, 'booking', data, checkout)
        try {
          const res = await fetch('/api/preturi-live', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, platform: 'booking', checkin: data, checkout })
          })
          const d = await res.json()
          if (d.ok && d.pret) {
            setPreturi(prev => prev.map(p => p.id===apt.id ? {...p, booking: d.pret, bookingOriginal: d.pretOriginal} : p))
          }
        } catch {}
      }

      // Citeste Airbnb
      if (apt.link_airbnb) {
        const url = buildUrl(apt.link_airbnb, 'airbnb', data, checkout)
        try {
          const res = await fetch('/api/preturi-live', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, platform: 'airbnb', checkin: data, checkout })
          })
          const d = await res.json()
          if (d.ok && d.pret) {
            setPreturi(prev => prev.map(p => p.id===apt.id ? {...p, airbnb: d.pret} : p))
          }
        } catch {}
      }
    }

    setLoadingApt(null)
    setLoading(false)
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
            <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>Selectează data check-in</div>
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
              <button onClick={() => fetchPreturi(dataSelectata)} disabled={loading || !dataSelectata}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(77,163,255,0.4)', background: 'rgba(77,163,255,0.12)', color: '#7BC8FF', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: loading?0.5:1 }}>
                {loading ? `⏳ ${loadingApt||'Se citesc...'}` : '🔄 Actualizează prețurile'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabel */}
        {preturi.length > 0 && (
          <div style={panel}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(159,215,255,0.08)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>Check-in: {dataSelectata||'—'}</span>
              {preturi[0]?.updatedAt && <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.35)' }}>actualizat {preturi[0].updatedAt}</span>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(159,215,255,0.08)' }}>
                  {['Apartament','🏨 Booking','🏠 Airbnb','Diferență',''].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left' as const, fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preturi.map((p, i) => {
                  const diff = p.booking && p.airbnb ? p.booking - p.airbnb : null
                  const isLoadingThis = loading && loadingApt === p.nume
                  return (
                    <tr key={p.id} style={{ borderBottom: i<preturi.length-1?'1px solid rgba(159,215,255,0.04)':'none' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500, color: '#E8F4FF' }}>{p.nume}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {isLoadingThis ? <span style={{fontSize:11,color:'rgba(159,215,255,0.3)'}}>⏳</span> :
                         p.booking ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#60A5FA' }}>{p.booking} RON</span>
                            {p.bookingOriginal && p.bookingOriginal !== p.booking &&
                              <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.3)', textDecoration: 'line-through' }}>{p.bookingOriginal}</span>}
                          </div>
                        ) : p.bookingUrl ?
                          <span style={{ color: 'rgba(159,215,255,0.2)', fontSize: 11 }}>—</span> :
                          <span style={{ color: 'rgba(248,113,113,0.4)', fontSize: 10 }}>fără link</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: p.airbnb?'#F87171':'rgba(159,215,255,0.2)' }}>
                        {isLoadingThis ? <span style={{fontSize:11,color:'rgba(159,215,255,0.3)'}}>⏳</span> :
                         p.airbnb ? `${p.airbnb} RON` :
                         p.airbnbUrl ? '—' : <span style={{ color: 'rgba(248,113,113,0.4)', fontSize: 10 }}>fără link</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace',
                        color: diff===null?'rgba(159,215,255,0.3)':Math.abs(diff)<=5?'rgba(159,215,255,0.5)':diff>0?'#FCD34D':'#4ADE80' }}>
                        {diff===null?'—':diff>0?`Booking +${diff}`:diff<0?`Airbnb +${Math.abs(diff)}`:'Egal'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {p.bookingUrl && <a href={p.bookingUrl} target="_blank" rel="noopener"
                            style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(77,163,255,0.2)', color: 'rgba(77,163,255,0.6)', textDecoration: 'none' }}>Bk</a>}
                          {p.airbnbUrl && <a href={p.airbnbUrl} target="_blank" rel="noopener"
                            style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(248,113,113,0.2)', color: 'rgba(248,113,113,0.6)', textDecoration: 'none' }}>Ab</a>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
      <Toast toast={toast}/>
    </>
  )
}
