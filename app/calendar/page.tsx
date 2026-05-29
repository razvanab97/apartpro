'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { ChevronLeft, ChevronRight, Phone, MessageCircle } from 'lucide-react'

type Rez = {
  id: string; nume_client: string; telefon_client?: string
  data_checkin: string; data_checkout: string
  canal: string; status_rezervare: string; nr_nopti?: number
  apartament?: { id: string; nume: string; nota: string | null }
}
type Apt = { id: string; nume: string; nota: string | null }

const CANAL: Record<string,{bg:string;border:string;text:string}> = {
  airbnb:   { bg:'rgba(255,90,95,0.8)',   border:'rgba(255,90,95,1)',   text:'#fff' },
  booking:  { bg:'rgba(0,83,186,0.85)',   border:'rgba(0,113,194,1)',   text:'#fff' },
  direct:   { bg:'rgba(16,185,129,0.8)',  border:'rgba(16,185,129,1)', text:'#fff' },
  whatsapp: { bg:'rgba(37,211,102,0.8)', border:'rgba(37,211,102,1)', text:'#fff' },
  telefon:  { bg:'rgba(16,185,129,0.8)', border:'rgba(16,185,129,1)', text:'#fff' },
  site:     { bg:'rgba(99,102,241,0.8)', border:'rgba(99,102,241,1)', text:'#fff' },
}
const c = (canal: string) => CANAL[canal?.toLowerCase()] || CANAL.direct

const MONTHS = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
const DAYS_SHORT = ['L','M','M','J','V','S','D']

function daysInMonth(y:number,m:number){ return new Date(y,m+1,0).getDate() }
function isoDate(y:number,m:number,d:number){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` }

export default function CalendarPage() {
  const [rezAll, setRezAll] = useState<Rez[]>([])
  const [apts, setApts] = useState<Apt[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [selApt, setSelApt] = useState('')
  const [tooltip, setTooltip] = useState<{rez:Rez,x:number,y:number}|null>(null)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { load() }, [year, month])

  async function load() {
    setLoading(true)
    const start = isoDate(year, month, 1)
    const end = isoDate(year, month, daysInMonth(year, month))
    const [{ data: a }, { data: r }] = await Promise.all([
      supabase.from('apartamente').select('id,nume,nota').order('nota'),
      supabase.from('rezervari')
        .select('id,nume_client,telefon_client,data_checkin,data_checkout,canal,status_rezervare,nr_nopti,apartament:apartamente(id,nume,nota)')
        .in('status_rezervare',['confirmata','finalizata'])
        .lte('data_checkin', end).gte('data_checkout', start)
        .order('data_checkin'),
    ])
    setApts(a || [])
    setRezAll((r || []) as any)
    setLoading(false)
  }

  const days = daysInMonth(year, month)
  const displayApts = selApt ? apts.filter(a => a.id === selApt) : apts
  const rez = selApt ? rezAll.filter(r => (r.apartament as any)?.id === selApt) : rezAll

  // For each apt+day, find the reservation
  function getRez(aptId: string, day: number): Rez | null {
    const d = isoDate(year, month, day)
    return rez.find(r => (r.apartament as any)?.id === aptId && r.data_checkin <= d && r.data_checkout > d) || null
  }

  function prevMonth() { if (month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }
  function nextMonth() { if (month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }

  // Count occupied apts today
  const occupiedToday = apts.filter(a => getRez(a.id, new Date().getDate()) && month === new Date().getMonth() && year === new Date().getFullYear()).length

  const ROW_H = 38
  const COL_W = 28
  const LABEL_W = 130

  return (
    <>
      <PageHeader title="Calendar" subtitle="Vizualizare ocupare apartamente"/>

      {/* Top bar */}
      <div style={{
        display:'flex', alignItems:'center', gap:12, padding:'10px 20px',
        borderBottom:'1px solid rgba(159,215,255,0.08)',
        background:'rgba(11,18,32,0.6)', position:'sticky', top:0, zIndex:20
      }}>
        <button onClick={prevMonth} style={{width:32,height:32,borderRadius:8,background:'rgba(77,163,255,0.1)',border:'1px solid rgba(77,163,255,0.2)',cursor:'pointer',color:'#7BC8FF',display:'flex',alignItems:'center',justifyContent:'center'}}><ChevronLeft size={15}/></button>
        <span style={{fontSize:15,fontWeight:600,color:'#FFF',minWidth:170,textAlign:'center'}}>{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} style={{width:32,height:32,borderRadius:8,background:'rgba(77,163,255,0.1)',border:'1px solid rgba(77,163,255,0.2)',cursor:'pointer',color:'#7BC8FF',display:'flex',alignItems:'center',justifyContent:'center'}}><ChevronRight size={15}/></button>
        <button onClick={()=>{setYear(new Date().getFullYear());setMonth(new Date().getMonth())}} style={{fontSize:11,padding:'5px 12px',borderRadius:7,background:'rgba(77,163,255,0.15)',border:'1px solid rgba(77,163,255,0.25)',color:'#7BC8FF',cursor:'pointer'}}>Azi</button>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:12}}>
          {/* Legend */}
          {[['airbnb','Airbnb'],['booking','Booking'],['direct','Direct']].map(([k,v])=>(
            <div key={k} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'rgba(159,215,255,0.5)'}}>
              <div style={{width:12,height:8,borderRadius:3,background:c(k).bg}}/>
              {v}
            </div>
          ))}
          <div style={{width:1,height:20,background:'rgba(159,215,255,0.1)'}}/>
          {/* Occupancy */}
          {month === new Date().getMonth() && year === new Date().getFullYear() && (
            <div style={{fontSize:12,color:'rgba(159,215,255,0.6)'}}>
              <span style={{color:'#4ADE80',fontWeight:700}}>{occupiedToday}</span>/{apts.length} ocupate azi
            </div>
          )}
          <select value={selApt} onChange={e=>setSelApt(e.target.value)} style={{fontSize:12,padding:'5px 10px'}}>
            <option value="">Toate ({apts.length})</option>
            {apts.map(a=><option key={a.id} value={a.id}>{a.nota?`[${a.nota}] `:''}{a.nume}</option>)}
          </select>
        </div>
      </div>

      {/* Grid */}
      <div style={{overflowX:'auto',overflowY:'auto',flex:1,paddingBottom:20}} onClick={()=>setTooltip(null)}>
        <div style={{minWidth: LABEL_W + days*COL_W + 2}}>

          {/* Day headers */}
          <div style={{display:'flex',position:'sticky',top:0,zIndex:15,background:'rgba(11,18,32,0.95)',borderBottom:'1px solid rgba(159,215,255,0.1)'}}>
            <div style={{width:LABEL_W,flexShrink:0,borderRight:'1px solid rgba(159,215,255,0.1)'}}/>
            {Array.from({length:days},(_,i)=>{
              const d=i+1, ds=isoDate(year,month,d)
              const dow=new Date(year,month,d).getDay()
              const isToday=ds===today
              const isWknd=dow===0||dow===6
              return (
                <div key={d} style={{width:COL_W,flexShrink:0,textAlign:'center',padding:'5px 0',borderRight:'1px solid rgba(159,215,255,0.04)',background:isToday?'rgba(77,163,255,0.12)':isWknd?'rgba(255,255,255,0.02)':'transparent'}}>
                  <div style={{fontSize:9,color:isWknd?'rgba(255,180,50,0.6)':'rgba(159,215,255,0.3)'}}>{DAYS_SHORT[(dow+6)%7]}</div>
                  <div style={{fontSize:12,fontWeight:isToday?700:400,color:isToday?'#4DA3FF':isWknd?'rgba(255,200,100,0.7)':'rgba(214,228,244,0.7)'}}>{d}</div>
                </div>
              )
            })}
          </div>

          {/* Apt rows */}
          {loading ? (
            <div style={{padding:'60px',textAlign:'center',color:'rgba(159,215,255,0.3)',fontSize:13}}>Se încarcă calendarul...</div>
          ) : displayApts.map((apt,ai)=>{
            const isOccupied = getRez(apt.id, new Date().getDate()) && month===new Date().getMonth() && year===new Date().getFullYear()
            return (
              <div key={apt.id} style={{display:'flex',borderBottom:'1px solid rgba(159,215,255,0.05)',background:ai%2===0?'rgba(14,27,43,0.25)':'transparent'}}>
                {/* Apt label */}
                <div style={{
                  width:LABEL_W,flexShrink:0,padding:'0 10px',
                  display:'flex',flexDirection:'column',justifyContent:'center',
                  height:ROW_H,borderRight:'1px solid rgba(159,215,255,0.08)',
                  borderLeft:`3px solid ${isOccupied?'rgba(34,197,94,0.6)':'rgba(159,215,255,0.08)'}`,
                }}>
                  {apt.nota && <span style={{fontSize:9,color:'#4DA3FF',fontFamily:'monospace',lineHeight:1}}>{apt.nota}</span>}
                  <span style={{fontSize:11,fontWeight:500,color:'rgba(214,228,244,0.85)',lineHeight:1.2,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{apt.nume}</span>
                </div>

                {/* Day cells */}
                {Array.from({length:days},(_,i)=>{
                  const d=i+1
                  const ds=isoDate(year,month,d)
                  const r=getRez(apt.id,d)
                  const isToday=ds===today
                  const dow=new Date(year,month,d).getDay()
                  const isWknd=dow===0||dow===6

                  // Is this the first day of this reservation in this month?
                  const isStart = r && (r.data_checkin===ds || d===1)
                  // Is this the last day?
                  const isEnd = r && (r.data_checkout===isoDate(year,month,d+1) || d===days)
                  const nextR = d<days ? getRez(apt.id,d+1) : null
                  const isSameNext = nextR?.id===r?.id

                  const style = c(r?.canal||'direct')

                  return (
                    <div key={d} style={{
                      width:COL_W,flexShrink:0,height:ROW_H,position:'relative',
                      background:isToday?'rgba(77,163,255,0.07)':isWknd?'rgba(255,255,255,0.01)':'transparent',
                      borderRight:`1px solid rgba(159,215,255,${isWknd?'0.06':'0.03'})`,
                    }}>
                      {r && (
                        <div
                          onClick={e=>{e.stopPropagation();setTooltip(t=>t?.rez.id===r.id?null:{rez:r,x:e.clientX,y:e.clientY})}}
                          style={{
                            position:'absolute',
                            top:5, bottom:5,
                            left: isStart ? 3 : 0,
                            right: isEnd && !isSameNext ? 3 : 0,
                            background: style.bg,
                            borderRadius: isStart&&isEnd ? 6 : isStart ? '6px 0 0 6px' : isEnd&&!isSameNext ? '0 6px 6px 0' : 0,
                            display:'flex',alignItems:'center',
                            overflow:'hidden',
                            cursor:'pointer',
                            zIndex:5,
                            boxShadow: isStart ? `2px 0 8px ${style.bg}40` : 'none',
                            transition:'filter 0.1s',
                          }}
                          onMouseEnter={e=>(e.currentTarget.style.filter='brightness(1.15)')}
                          onMouseLeave={e=>(e.currentTarget.style.filter='')}
                        >
                          {isStart && (
                            <span style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.95)',padding:'0 5px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:0.2}}>
                              {r.nume_client.split(' ')[0]}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Today line */}
                      {isToday && <div style={{position:'absolute',top:0,bottom:0,left:'50%',width:1.5,background:'rgba(77,163,255,0.5)',zIndex:10,pointerEvents:'none'}}/>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div onClick={e=>e.stopPropagation()} style={{
          position:'fixed',
          left: Math.min(tooltip.x + 12, window.innerWidth - 240),
          top: Math.min(tooltip.y - 10, window.innerHeight - 180),
          zIndex:100,
          background:'rgba(11,22,40,0.97)',
          backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',
          border:'1px solid rgba(159,215,255,0.2)',
          borderTop:`3px solid ${c(tooltip.rez.canal).border}`,
          borderRadius:12,padding:'14px 16px',minWidth:220,
          boxShadow:'0 12px 40px rgba(0,0,0,0.5)',
          animation:'fadeIn 0.1s ease',
        }}>
          <div style={{fontSize:14,fontWeight:600,color:'#FFF',marginBottom:4}}>{tooltip.rez.nume_client}</div>
          <div style={{fontSize:11,color:'rgba(159,215,255,0.5)',marginBottom:8}}>{(tooltip.rez.apartament as any)?.nome || (tooltip.rez.apartament as any)?.nume || '—'}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10}}>
            <div style={{background:'rgba(14,27,43,0.6)',borderRadius:6,padding:'5px 8px'}}>
              <div style={{fontSize:9,color:'rgba(159,215,255,0.35)',marginBottom:2}}>Check-in</div>
              <div style={{fontSize:11,color:'#FFF',fontFamily:'monospace'}}>{tooltip.rez.data_checkin}</div>
            </div>
            <div style={{background:'rgba(14,27,43,0.6)',borderRadius:6,padding:'5px 8px'}}>
              <div style={{fontSize:9,color:'rgba(159,215,255,0.35)',marginBottom:2}}>Check-out</div>
              <div style={{fontSize:11,color:'#FFF',fontFamily:'monospace'}}>{tooltip.rez.data_checkout}</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:8,height:8,borderRadius:2,background:c(tooltip.rez.canal).bg}}/>
              <span style={{fontSize:11,color:'rgba(214,228,244,0.6)',textTransform:'capitalize'}}>{tooltip.rez.canal}</span>
              {tooltip.rez.nr_nopti && <span style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>· {tooltip.rez.nr_nopti} nopți</span>}
            </div>
            {tooltip.rez.telefon_client && (
              <a href={`https://wa.me/${tooltip.rez.telefon_client.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener"
                style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:6,background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.3)',color:'#4ADE80',textDecoration:'none',fontSize:11,fontWeight:500}}>
                <MessageCircle size={12}/> WA
              </a>
            )}
          </div>
        </div>
      )}
    </>
  )
}
