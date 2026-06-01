'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'

export default function PreturiPage() {
  const [apts, setApts] = useState<any[]>([])
  const [preturi, setPreturi] = useState<Record<string,{booking:string,airbnb:string}>>({})
  const [dataSelectata, setDataSelectata] = useState('')
  const [saving, setSaving] = useState<string|null>(null)
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
      .select('id,nota,nume,link_booking,link_airbnb,booking_links,airbnb_links')
      .eq('status','activ').order('nota')
      .then(async ({ data }) => {
        const list = (data||[]).map((apt:any) => {
          const bks = (apt.booking_links||[]).filter((l:string)=>l?.includes('booking.com'))
          const abs = (apt.airbnb_links||[]).filter((l:string)=>l?.includes('airbnb.'))
          const bk = bks[0] || (apt.link_booking?.includes('booking.com')?apt.link_booking:null)
          const ab = apt.link_airbnb?.includes('airbnb.')?apt.link_airbnb:abs[0]||null
          return {...apt, _bk: bk, _ab: ab}
        }).filter((a:any) => a._bk || a._ab)
        setApts(list)
        setDataSelectata(today)
        // Carica preturile salvate
        const { data: saved } = await supabase.from('preturi_live')
          .select('*').in('apartament_id', list.map((a:any)=>a.id))
          .eq('data_checkin', today)
        const map: Record<string,any> = {}
        ;(saved||[]).forEach((p:any) => { map[p.apartament_id] = p })
        const pretMap: Record<string,{booking:string,airbnb:string}> = {}
        list.forEach((a:any) => {
          pretMap[a.id] = {
            booking: map[a.id]?.pret_booking?.toString() || '',
            airbnb: map[a.id]?.pret_airbnb?.toString() || '',
          }
        })
        setPreturi(pretMap)
      })
  }, [])

  function buildUrl(baseUrl: string, platform: string, checkin: string) {
    if (!baseUrl) return ''
    const coD = new Date(checkin+'T12:00:00'); coD.setDate(coD.getDate()+1)
    const checkout = fmt(coD)
    const sep = baseUrl.includes('?') ? '&' : '?'
    if (platform==='booking' && !baseUrl.includes('checkin='))
      return baseUrl + sep + `checkin=${checkin}&checkout=${checkout}&group_adults=2&no_rooms=1`
    if (platform==='airbnb' && !baseUrl.includes('check_in='))
      return baseUrl + sep + `check_in=${checkin}&check_out=${checkout}&adults=2`
    return baseUrl
  }

  async function savePret(aptId: string, checkin: string) {
    const p = preturi[aptId]
    if (!p?.booking && !p?.airbnb) { show('error','Introdu cel puțin un preț'); return }
    setSaving(aptId)
    await supabase.from('preturi_live').upsert({
      apartament_id: aptId,
      data_checkin: checkin,
      pret_booking: p.booking ? parseInt(p.booking) : null,
      pret_airbnb: p.airbnb ? parseInt(p.airbnb) : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'apartament_id,data_checkin' })
    setSaving(null)
    show('success', 'Preț salvat!')
  }

  function updatePret(aptId: string, field: 'booking'|'airbnb', val: string) {
    setPreturi(prev => ({...prev, [aptId]: {...prev[aptId], [field]: val}}))
  }

  function changeData(data: string) {
    setDataSelectata(data)
    // Reincarca preturile pentru noua data
    if (!apts.length) return
    supabase.from('preturi_live')
      .select('*').in('apartament_id', apts.map(a=>a.id))
      .eq('data_checkin', data)
      .then(({ data: saved }) => {
        const pretMap: Record<string,{booking:string,airbnb:string}> = {}
        apts.forEach(a => {
          const p = (saved||[]).find((x:any)=>x.apartament_id===a.id)
          pretMap[a.id] = { booking: p?.pret_booking?.toString()||'', airbnb: p?.pret_airbnb?.toString()||'' }
        })
        setPreturi(pretMap)
      })
  }

  const panel: React.CSSProperties = {
    background: 'rgba(214,228,244,0.05)',
    border: '1px solid rgba(159,215,255,0.1)',
    borderRadius: 14, overflow: 'hidden', marginBottom: 14,
  }
  const inp: React.CSSProperties = {
    width: 80, padding: '4px 8px', borderRadius: 6,
    border: '1px solid rgba(100,160,255,0.2)',
    background: 'rgba(20,38,65,0.8)', color: 'rgba(214,228,244,0.9)',
    fontSize: 13, outline: 'none', textAlign: 'center' as const,
    fontFamily: 'monospace', fontWeight: 600,
  }

  return (
    <>
      <PageHeader title="💰 Prețuri live" subtitle="Booking.com & Airbnb"/>
      <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>

        {/* Selector data */}
        <div style={{...panel}}>
          <div style={{ padding: '12px 16px', display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            {QUICK.map(({ label, val }) => (
              <button key={val} onClick={()=>changeData(val)}
                style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${dataSelectata===val?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.15)'}`,
                  background: dataSelectata===val?'rgba(77,163,255,0.15)':'transparent',
                  color: dataSelectata===val?'#7BC8FF':'rgba(159,215,255,0.5)' }}>
                {label}
              </button>
            ))}
            <input type="date" value={dataSelectata} onChange={e=>changeData(e.target.value)}
              style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(100,160,255,0.2)',
                background: 'rgba(20,38,65,0.8)', color: 'rgba(214,228,244,0.9)', fontSize: 12, outline: 'none' }}/>
          </div>
        </div>

        {/* Tabel apartamente */}
        <div style={{...panel}}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(159,215,255,0.08)', fontSize: 11,
            color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>
            Check-in: {dataSelectata} — introduci prețul manual sau deschizi linkul
          </div>
          {apts.map((apt, i) => (
            <div key={apt.id} style={{ padding: '10px 16px',
              borderBottom: i<apts.length-1?'1px solid rgba(159,215,255,0.05)':'none',
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
              {/* Nume */}
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF', minWidth: 50 }}>{apt.nota}</div>

              {/* Booking */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(77,163,255,0.5)', minWidth: 14 }}>🏨</span>
                <input type="number" placeholder="RON" value={preturi[apt.id]?.booking||''}
                  onChange={e=>updatePret(apt.id,'booking',e.target.value)} style={inp}/>
                {apt._bk && (
                  <a href={buildUrl(apt._bk,'booking',dataSelectata)} target="_blank" rel="noopener"
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6,
                      border: '1px solid rgba(77,163,255,0.3)', color: '#7BC8FF',
                      textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                    Deschide Bk ↗
                  </a>
                )}
              </div>

              {/* Airbnb */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(248,113,113,0.5)', minWidth: 14 }}>🏠</span>
                <input type="number" placeholder="RON" value={preturi[apt.id]?.airbnb||''}
                  onChange={e=>updatePret(apt.id,'airbnb',e.target.value)} style={inp}/>
                {apt._ab && (
                  <a href={buildUrl(apt._ab,'airbnb',dataSelectata)} target="_blank" rel="noopener"
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6,
                      border: '1px solid rgba(248,113,113,0.3)', color: '#F87171',
                      textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                    Deschide Ab ↗
                  </a>
                )}
              </div>

              {/* Diferenta */}
              {preturi[apt.id]?.booking && preturi[apt.id]?.airbnb && (
                <div style={{ fontSize: 11, fontFamily: 'monospace',
                  color: parseInt(preturi[apt.id].booking) > parseInt(preturi[apt.id].airbnb) ? '#FCD34D' : '#4ADE80' }}>
                  {parseInt(preturi[apt.id].booking) > parseInt(preturi[apt.id].airbnb)
                    ? `Bk +${parseInt(preturi[apt.id].booking)-parseInt(preturi[apt.id].airbnb)}`
                    : `Ab +${parseInt(preturi[apt.id].airbnb)-parseInt(preturi[apt.id].booking)}`}
                </div>
              )}

              {/* Salvare */}
              <button onClick={()=>savePret(apt.id, dataSelectata)} disabled={saving===apt.id}
                style={{ marginLeft: 'auto', padding: '4px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                  border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.08)',
                  color: '#4ADE80', opacity: saving===apt.id?0.5:1 }}>
                {saving===apt.id ? '...' : '✓ Salvează'}
              </button>
            </div>
          ))}
        </div>

      </div>
      <Toast toast={toast}/>
    </>
  )
}
