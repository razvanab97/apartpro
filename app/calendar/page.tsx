'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Rezervare = {
  id: string
  nume_client: string
  data_checkin: string
  data_checkout: string
  canal: string
  apartament?: { id: string; nume: string; nota: string | null }
  status_rezervare: string
}

type Apartament = { id: string; nume: string; nota: string | null }

const CANAL_COLOR: Record<string, string> = {
  airbnb:   '#E61E4D',
  booking:  '#003580',
  direct:   '#0D9488',
  whatsapp: '#25D366',
  telefon:  '#0D9488',
  site:     '#0D9488',
}

const CANAL_BG: Record<string, string> = {
  airbnb:   'rgba(230,30,77,0.85)',
  booking:  'rgba(0,53,128,0.85)',
  direct:   'rgba(13,148,136,0.85)',
  whatsapp: 'rgba(37,211,102,0.85)',
  telefon:  'rgba(13,148,136,0.85)',
  site:     'rgba(13,148,136,0.85)',
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1 // Mon=0
}

const MONTHS = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
const DAYS = ['Lun','Mar','Mie','Joi','Vin','Sâm','Dum']

export default function CalendarPage() {
  const [rezervari, setRezervari] = useState<Rezervare[]>([])
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [selectedApt, setSelectedApt] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => { load() }, [year, month])

  async function load() {
    setLoading(true)
    const start = `${year}-${String(month+1).padStart(2,'0')}-01`
    const end = `${year}-${String(month+1).padStart(2,'0')}-${getDaysInMonth(year,month)}`

    const { data: apts } = await supabase.from('apartamente').select('id,nume,nota').order('nota')
    setApartamente(apts || [])

    const { data: rez } = await supabase.from('rezervari')
      .select('id,nume_client,data_checkin,data_checkout,canal,status_rezervare,apartament:apartamente(id,nume,nota)')
      .in('status_rezervare', ['confirmata','finalizata'])
      .lte('data_checkin', end)
      .gte('data_checkout', start)
      .order('data_checkin')

    setRezervari((rez || []) as any)
    setLoading(false)
  }

  const filtered = selectedApt ? rezervari.filter(r => (r.apartament as any)?.id === selectedApt) : rezervari
  const displayApts = selectedApt ? apartamente.filter(a => a.id === selectedApt) : apartamente

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  function getReservationsForAptDay(aptId: string, day: number): Rezervare[] {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return filtered.filter(r => {
      const apt = r.apartament as any
      if (apt?.id !== aptId) return false
      return r.data_checkin <= dateStr && r.data_checkout > dateStr
    })
  }

  function getReservationAtDay(aptId: string, day: number) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return filtered.find(r => {
      const apt = r.apartament as any
      if (apt?.id !== aptId) return false
      return r.data_checkin <= dateStr && r.data_checkout > dateStr
    })
  }

  function isCheckin(rez: Rezervare, day: number) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return rez.data_checkin === dateStr
  }

  function isCheckout(rez: Rezervare, day: number) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const prevDate = new Date(year, month, day - 1).toISOString().split('T')[0]
    return rez.data_checkout === dateStr && rez.data_checkin <= prevDate
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <>
      <PageHeader title="Calendar rezervări" subtitle="Vizualizare grafică pe apartamente"/>
      <div style={{ padding: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 0, overflowX: 'auto', overflowY: 'auto', flex: 1 }}>

        {/* Controls */}
        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(159,215,255,0.08)', background: 'rgba(14,27,43,0.4)', position: 'sticky', top: 0, zIndex: 10 }}>
          <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }}
            style={{ background: 'rgba(77,163,255,0.1)', border: '1px solid rgba(77,163,255,0.2)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#7BC8FF' }}>
            <ChevronLeft size={16}/>
          </button>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', minWidth: 160, textAlign: 'center' }}>
            {MONTHS[month]} {year}
          </div>
          <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y+1) } else setMonth(m => m+1) }}
            style={{ background: 'rgba(77,163,255,0.1)', border: '1px solid rgba(77,163,255,0.2)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#7BC8FF' }}>
            <ChevronRight size={16}/>
          </button>
          <button onClick={() => { setYear(new Date().getFullYear()); setMonth(new Date().getMonth()) }}
            style={{ fontSize: 11, padding: '5px 12px', borderRadius: 7, background: 'rgba(77,163,255,0.15)', border: '1px solid rgba(77,163,255,0.25)', color: '#7BC8FF', cursor: 'pointer' }}>
            Azi
          </button>
          <select value={selectedApt} onChange={e => setSelectedApt(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', marginLeft: 'auto' }}>
            <option value="">Toate apartamentele</option>
            {apartamente.map(a => <option key={a.id} value={a.id}>{a.nota ? `[${a.nota}] ` : ''}{a.nume}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 10 }}>
            {Object.entries({ airbnb: 'Airbnb', booking: 'Booking', direct: 'Direct' }).map(([k,v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: CANAL_COLOR[k] }}/>
                {v}
              </div>
            ))}
          </div>
        </div>

        {/* Calendar grid */}
        <div style={{ minWidth: 900, overflowX: 'auto' }}>
          {/* Header row - days */}
          <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(' + daysInMonth + ', 1fr)', borderBottom: '1px solid rgba(159,215,255,0.1)' }}>
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'rgba(159,215,255,0.4)', fontWeight: 600, borderRight: '1px solid rgba(159,215,255,0.08)' }}>Apartament</div>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1
              const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const dow = new Date(year, month, day).getDay()
              const isToday = dateStr === today
              const isWeekend = dow === 0 || dow === 6
              return (
                <div key={day} style={{
                  padding: '4px 2px', textAlign: 'center',
                  background: isToday ? 'rgba(77,163,255,0.15)' : isWeekend ? 'rgba(255,255,255,0.02)' : 'transparent',
                  borderRight: '1px solid rgba(159,215,255,0.05)',
                  borderBottom: isToday ? '2px solid #4DA3FF' : 'none',
                }}>
                  <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)', marginBottom: 1 }}>{DAYS[(dow+6)%7]}</div>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? '#4DA3FF' : isWeekend ? 'rgba(214,228,244,0.5)' : 'rgba(214,228,244,0.7)' }}>{day}</div>
                </div>
              )
            })}
          </div>

          {/* Apartment rows */}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(159,215,255,0.3)', fontSize: 13 }}>Se încarcă...</div>
          ) : displayApts.map((apt, aptIdx) => (
            <div key={apt.id} style={{
              display: 'grid',
              gridTemplateColumns: '140px repeat(' + daysInMonth + ', 1fr)',
              borderBottom: '1px solid rgba(159,215,255,0.06)',
              background: aptIdx % 2 === 0 ? 'rgba(14,27,43,0.3)' : 'transparent',
            }}>
              {/* Apt name */}
              <div style={{ padding: '8px 10px', borderRight: '1px solid rgba(159,215,255,0.08)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {apt.nota && <span style={{ fontSize: 9, color: '#4DA3FF', fontFamily: 'monospace', marginBottom: 1 }}>{apt.nota}</span>}
                <span style={{ fontSize: 11, fontWeight: 500, color: '#FFFFFF', lineHeight: 1.3 }}>{apt.nume}</span>
              </div>

              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const rez = getReservationAtDay(apt.id, day)
                const isToday = dateStr === today
                const dow = new Date(year, month, day).getDay()
                const isWeekend = dow === 0 || dow === 6

                const checkin = rez ? isCheckin(rez, day) : false
                const checkout = rez ? isCheckout(rez, day) : false

                // Check if previous day had this reservation (for bar continuity)
                const prevRez = day > 1 ? getReservationAtDay(apt.id, day-1) : null
                const isStart = rez && (checkin || !prevRez || prevRez.id !== rez.id)
                const nextRez = day < daysInMonth ? getReservationAtDay(apt.id, day+1) : null
                const isEnd = rez && (rez.data_checkout === dateStr || !nextRez || nextRez.id !== rez.id || day === daysInMonth)

                const color = rez ? (CANAL_BG[rez.canal] || CANAL_BG.direct) : null
                const isHovered = hovered === rez?.id

                return (
                  <div
                    key={day}
                    onMouseEnter={() => rez && setHovered(rez.id)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      height: 36, position: 'relative',
                      background: isToday ? 'rgba(77,163,255,0.06)' : isWeekend ? 'rgba(255,255,255,0.01)' : 'transparent',
                      borderRight: '1px solid rgba(159,215,255,0.04)',
                    }}
                  >
                    {rez && (
                      <div style={{
                        position: 'absolute',
                        top: 6, bottom: 6,
                        left: isStart ? 4 : 0,
                        right: isEnd ? 4 : 0,
                        background: color || 'rgba(77,163,255,0.7)',
                        borderRadius: isStart && isEnd ? 6 : isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : 0,
                        opacity: isHovered ? 1 : 0.85,
                        display: 'flex', alignItems: 'center',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        transition: 'opacity 0.1s',
                        zIndex: 2,
                      }}>
                        {isStart && (
                          <span style={{
                            fontSize: 9, fontWeight: 600, color: '#FFFFFF',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            padding: '0 5px', lineHeight: 1.2,
                          }}>
                            {rez.nume_client.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Today line */}
                    {isToday && <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(77,163,255,0.4)', zIndex: 3 }}/>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Tooltip for hovered */}
        {hovered && (() => {
          const rez = rezervari.find(r => r.id === hovered)
          if (!rez) return null
          const apt = rez.apartament as any
          return (
            <div style={{
              position: 'fixed', bottom: 24, right: 24, zIndex: 100,
              background: 'rgba(14,27,43,0.95)', backdropFilter: 'blur(20px)',
              border: '1px solid rgba(159,215,255,0.2)', borderRadius: 12,
              padding: '12px 16px', minWidth: 220,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              animation: 'fadeIn 0.12s ease',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginBottom: 6 }}>{rez.nume_client}</div>
              <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.6)', marginBottom: 3 }}>{apt?.nume || '—'}</div>
              <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', fontFamily: 'monospace' }}>{rez.data_checkin} → {rez.data_checkout}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: CANAL_COLOR[rez.canal] || '#4DA3FF' }}/>
                <span style={{ fontSize: 11, color: 'rgba(214,228,244,0.6)', textTransform: 'capitalize' }}>{rez.canal}</span>
              </div>
            </div>
          )
        })()}

      </div>
    </>
  )
}
