'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'

export default function PreturiPage() {
  const [apts, setApts] = useState<any[]>([])
  const [preturi, setPreturi] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingApt, setLoadingApt] = useState('')
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
      .order('nota')
      .then(({ data }) => {
        setApts(data || [])
        setDataSelectata(today)
        loadPreturi(today, data || [])
      })
  }, [])

  async function loadPreturi(data: string, aptList?: any[]) {
    const list = aptList || apts
    if (!list.length) return
    // Incarca din cache Supabase
    const { data: cached } = await supabase
      .from('preturi_live')
      .select('*')
      .in('apartament_id', list.map((a:any) => a.id))
      .eq('data_checkin', data)
    
    setPreturi(list.map((apt:any) => {
      const c = (cached||[]).find((x:any) => x.apartament_id === apt.id)
      return {
        id: apt.id,
        nume: apt.nota || apt.nume,
        booking: c?.pret_booking || null,
        bookingOriginal: c?.pret_booking_original || null,
        airbnb: c?.pret_airbnb || null,
        bookingUrl: apt.link_booking || null,
        airbnbUrl: apt.link_airbnb || null,
        updatedAt: c?.updated_at ? new Date(c.updated_at).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}) : null,
        hasLinks: !!(apt.link_booking || apt.link_airbnb),
      }
    }))
  }

  async function syncPreturi(data: string) {
    setLoading(true)
    const pad2 = (n:number) => String(n).padStart(2,'0')
    const coD = new Date(data+'T12:00:00'); coD.setDate(coD.getDate()+1)
    const checkout = `${coD.getFullYear()}-${pad2(coD.getMonth()+1)}-${pad2(coD.getDate())}`

    for (const apt of apts) {
      if (!apt.link_booking && !apt.link_airbnb) continue
      setLoadingApt(apt.nota || apt.nume)

      let bPret = null, bOrig = null, aPret = null

      if (apt.link_booking) {
        try {
          const sep = apt.link_booking.includes('?') ? '&' : '?'
          const url = apt.link_booking.includes('checkin=') 
            ? apt.link_booking 
            : apt.link_booking + sep + `checkin=${data}&checkout=${checkout}&group_adults=2&no_rooms=1`
          const r = await fetch('/api/preturi-live', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({url, platform:'booking', checkin:data, checkout})
          })
          const d = await r.json()
          if (d.pret) { bPret = d.pret; bOrig = d.pretOriginal }
        } catch {}
      }

      if (apt.link_airbnb) {
        try {
          const sep = apt.link_airbnb.includes('?') ? '&' : '?'
          const url = apt.link_airbnb.includes('check_in=')
            ? apt.link_airbnb
            : apt.link_airbnb + sep + `check_in=${data}&check_out=${checkout}&adults=2`
          const r = await fetch('/api/preturi-live', {
            method: 'POST', 
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({url, platform:'airbnb', checkin:data, checkout})
          })
          const d = await r.json()
          if (d.pret) aPret = d.pret
        } catch {}
      }

      // Salveaza in Supabase
      if (bPret || aPret) {
        await supabase.from('preturi_live').upsert({
          apartament_id: apt.id,
          data_checkin: data,
          pret_booking: bPret,
          pret_airbnb: aPret,
          pret_booking_original: bOrig,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'apartament_id,data_checkin' })
      }

      // Update UI progresiv
      setPreturi(prev => prev.map(p => p.id === apt.id 
        ? {...p, booking: bPret, bookingOriginal: bOrig, airbnb: aPret, updatedAt: new Date().toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}
        : p
      ))
    }

    setLoadingApt('')
    setLoading(false)
    show('success', 'Prețuri actualizate!')
  }

  const panel: React.CSSProperties = {
    background: 'rgba(214,228,244,0.05)',
    border: '1px solid rgba(159,215,255,0.1)',
    borderRadius: 14, overflow: 'hidden', marginBottom: 14,
  }

  const hasAnyPrice = preturi.some(p => p.booking || p.airbnb)

  return (
    <>
      <PageHeader title="💰 Prețuri live" subtitle="Booking.com & Airbnb — sincronizare automată"/>
      <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>

        <div style={panel}>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>
              Selectează data check-in
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 12 }}>
              {QUICK.map(({ label, val }) => (
                <button key={val} onClick={() => { setDataSelectata(val); loadPreturi(val) }}
                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${dataSelectata===val?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.15)'}`,
                    background: dataSelectata===val?'rgba(77,163,255,0.15)':'transparent',
                    color: dataSelectata===val?'#7BC8FF':'rgba(159,215,255,0.5)' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <input type="date" value={dataSelectata}
                onChange={e => { setDataSelectata(e.target.value); loadPreturi(e.target.value) }}
                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(100,160,255,0.2)', background: 'rgba(20,38,65,0.8)', color: 'rgba(214,228,244,0.9)', fontSize: 13, outline: 'none' }}/>
              <button onClick={() => syncPreturi(dataSelectata)} disabled={loading || !dataSelectata}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(77,163,255,0.4)', background: 'rgba(77,163,255,0.12)', color: '#7BC8FF', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: loading?0.5:1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {loading ? `⏳ ${loadingApt||'Se sincronizează...'}` : '🔄 Sincronizează prețurile'}
              </button>
              {hasAnyPrice && !loading && (
                <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.5)' }}>
                  ✓ {preturi.filter(p=>p.booking||p.airbnb).length} prețuri din cache
                </span>
              )}
            </div>
          </div>
        </div>

        {preturi.length > 0 && (
          <div style={panel}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(159,215,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>Check-in: {dataSelectata}</span>
              {hasAnyPrice && <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.35)' }}>
                ultima sincronizare: {preturi.find(p=>p.updatedAt)?.updatedAt || '—'}
              </span>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(159,215,255,0.08)' }}>
                  {['Apartament','🏨 Booking','🏠 Airbnb','Diferență','Link'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left' as const, fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preturi.filter(p => p.hasLinks).map((p, i) => {
                  const diff = p.booking && p.airbnb ? p.booking - p.airbnb : null
                  const isThis = loading && loadingApt === p.nume
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(159,215,255,0.04)', background: isThis ? 'rgba(77,163,255,0.03)' : 'transparent' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500, color: '#E8F4FF' }}>
                        {p.nume}
                        {isThis && <span style={{ fontSize: 10, color: 'rgba(77,163,255,0.5)', marginLeft: 6 }}>⏳</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {p.booking ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#60A5FA' }}>{p.booking} RON</span>
                            {p.bookingOriginal && p.bookingOriginal !== p.booking && (
                              <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.3)', textDecoration: 'line-through' }}>{p.bookingOriginal}</span>
                            )}
                          </div>
                        ) : <span style={{ color: 'rgba(159,215,255,0.2)', fontSize: 12 }}>{isThis ? '...' : '—'}</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: p.airbnb ? '#F87171' : 'rgba(159,215,255,0.2)' }}>
                        {p.airbnb ? `${p.airbnb} RON` : (isThis ? '...' : '—')}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'monospace',
                        color: diff===null?'rgba(159,215,255,0.3)':Math.abs(diff)<=5?'rgba(159,215,255,0.5)':diff>0?'#FCD34D':'#4ADE80' }}>
                        {diff===null?'—':diff>0?`Booking +${diff}`:diff<0?`Airbnb +${Math.abs(diff)}`:'Egal'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {p.bookingUrl && <a href={p.bookingUrl} target="_blank" rel="noopener"
                            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(77,163,255,0.25)', color: 'rgba(77,163,255,0.7)', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Bk ↗</a>}
                          {p.airbnbUrl && <a href={p.airbnbUrl} target="_blank" rel="noopener"
                            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(248,113,113,0.25)', color: 'rgba(248,113,113,0.7)', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Ab ↗</a>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && preturi.filter(p=>p.hasLinks).length === 0 && apts.length > 0 && (
          <div style={{ textAlign: 'center' as const, padding: '30px', color: 'rgba(159,215,255,0.3)', fontSize: 13 }}>
            Niciun apartament nu are linkuri Booking/Airbnb salvate.<br/>
            <span style={{ fontSize: 11 }}>Adaugă linkurile în fișa fiecărui apartament.</span>
          </div>
        )}

      </div>
      <Toast toast={toast}/>
    </>
  )
}
