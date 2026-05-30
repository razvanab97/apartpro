'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { ChevronLeft, ChevronRight, MessageCircle, X } from 'lucide-react'

type Rez = {
  id: string; nume_client: string; telefon_client?: string
  data_checkin: string; data_checkout: string
  canal: string; status_rezervare: string; nr_nopti?: number
  apartament?: { id: string; nume: string; nota: string | null }
}
type Apt = { id: string; nume: string; nota: string | null }

const CANAL: Record<string,{bg:string;text:string}> = {
  airbnb:   { bg:'rgba(255,90,95,0.85)',  text:'#fff' },
  booking:  { bg:'rgba(0,83,186,0.9)',    text:'#fff' },
  direct:   { bg:'rgba(16,185,129,0.85)', text:'#fff' },
  whatsapp: { bg:'rgba(37,211,102,0.85)', text:'#fff' },
  telefon:  { bg:'rgba(16,185,129,0.85)', text:'#fff' },
  site:     { bg:'rgba(99,102,241,0.85)', text:'#fff' },
}
const cs = (canal:string) => CANAL[canal?.toLowerCase()] || CANAL.direct
const MONTHS = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
const DAYS_SHORT = ['L','M','M','J','V','S','D']

function daysInMonth(y:number,m:number){ return new Date(y,m+1,0).getDate() }
function isoDate(y:number,m:number,d:number){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
function getDow(y:number,m:number,d:number){ return (new Date(y,m,d).getDay()+6)%7 } // 0=L..6=D

export default function CalendarPage() {
  const [rezAll, setRezAll] = useState<Rez[]>([])
  const [apts, setApts]     = useState<Apt[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear]     = useState(new Date().getFullYear())
  const [month, setMonth]   = useState(new Date().getMonth())
  const [selApt, setSelApt] = useState('')
  const [selDay, setSelDay] = useState<number|null>(null)
  const [tooltip, setTooltip] = useState<{rez:Rez;x:number;y:number}|null>(null)
  const today = new Date().toISOString().split('T')[0]
  const todayDay = new Date().getDate()
  const todayMonth = new Date().getMonth()
  const todayYear = new Date().getFullYear()

  useEffect(() => { load() }, [year, month])

  async function load() {
    setLoading(true)
    const start = isoDate(year, month, 1)
    const end   = isoDate(year, month, daysInMonth(year, month))
    const [{ data: a }, { data: r }] = await Promise.all([
      supabase.from('apartamente').select('id,nume,nota').eq('status','activ').order('nota'),
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

  function getRez(aptId:string, day:number): Rez|null {
    const d = isoDate(year, month, day)
    return rez.find(r => (r.apartament as any)?.id === aptId && r.data_checkin <= d && r.data_checkout > d) || null
  }

  function prevMonth() { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1); setSelDay(null) }
  function nextMonth() { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1); setSelDay(null) }

  const isCurrentMonth = month===todayMonth && year===todayYear
  const occupiedToday  = isCurrentMonth ? apts.filter(a=>getRez(a.id,todayDay)).length : 0

  // panel de zi selectata
  const selDayApts = selDay ? {
    free: displayApts.filter(a=>!getRez(a.id,selDay)),
    busy: displayApts.filter(a=>!!getRez(a.id,selDay)).map(a=>({apt:a,rez:getRez(a.id,selDay)!})),
  } : null

  const ROW_H   = 40
  const COL_W   = 28
  const LABEL_W = 140

  // coloring helpers
  function colBg(day:number) {
    const ds = isoDate(year,month,day)
    const dow = getDow(year,month,day)
    const isWknd = dow===5||dow===6
    if(selDay===day)    return 'rgba(77,163,255,0.18)'
    if(ds===today)      return 'rgba(16,185,129,0.08)'
    if(isWknd)         return 'rgba(99,102,241,0.05)'
    return 'transparent'
  }
  function hdrBg(day:number) {
    const ds = isoDate(year,month,day)
    const dow = getDow(year,month,day)
    const isWknd = dow===5||dow===6
    if(selDay===day)    return 'rgba(77,163,255,0.25)'
    if(ds===today)      return 'rgba(16,185,129,0.15)'
    if(isWknd)         return 'rgba(99,102,241,0.07)'
    return 'transparent'
  }
  function hdrColor(day:number) {
    const ds = isoDate(year,month,day)
    const dow = getDow(year,month,day)
    const isWknd = dow===5||dow===6
    if(selDay===day)    return '#7BC8FF'
    if(ds===today)      return '#4ADE80'
    if(isWknd)         return 'rgba(255,200,100,0.8)'
    return 'rgba(214,228,244,0.65)'
  }
  function leftBorder(day:number) {
    const ds = isoDate(year,month,day)
    const dow = getDow(year,month,day)
    const isWknd = dow===5||dow===6
    if(selDay===day)    return '2px solid rgba(77,163,255,0.7)'
    if(ds===today)      return '2px solid rgba(16,185,129,0.55)'
    if(isWknd)         return '1px solid rgba(99,102,241,0.2)'
    return '1px solid rgba(159,215,255,0.03)'
  }

  return (
    <>
      <PageHeader title="Calendar" subtitle="Vizualizare ocupare apartamente"/>

      {/* ── Nav bar ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 20px', borderBottom:'1px solid rgba(159,215,255,0.08)', background:'rgba(11,18,32,0.7)', position:'sticky', top:0, zIndex:20, flexShrink:0 }}>
        <button onClick={prevMonth} style={{ width:32,height:32,borderRadius:8,background:'rgba(77,163,255,0.1)',border:'1px solid rgba(77,163,255,0.2)',cursor:'pointer',color:'#7BC8FF',display:'flex',alignItems:'center',justifyContent:'center' }}><ChevronLeft size={15}/></button>
        <span style={{ fontSize:15,fontWeight:600,color:'#FFF',minWidth:170,textAlign:'center' }}>{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} style={{ width:32,height:32,borderRadius:8,background:'rgba(77,163,255,0.1)',border:'1px solid rgba(77,163,255,0.2)',cursor:'pointer',color:'#7BC8FF',display:'flex',alignItems:'center',justifyContent:'center' }}><ChevronRight size={15}/></button>
        <button onClick={()=>{setYear(todayYear);setMonth(todayMonth);setSelDay(null)}} style={{ fontSize:11,padding:'5px 12px',borderRadius:7,background:'rgba(77,163,255,0.15)',border:'1px solid rgba(77,163,255,0.25)',color:'#7BC8FF',cursor:'pointer' }}>Azi</button>
        {selDay && (
          <div style={{ display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:7,background:'rgba(77,163,255,0.12)',border:'1px solid rgba(77,163,255,0.3)' }}>
            <span style={{ fontSize:11,color:'#7BC8FF' }}>Zi selectată: <strong>{selDay} {MONTHS[month]}</strong></span>
            <button onClick={()=>setSelDay(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(77,163,255,0.6)',display:'flex',padding:0 }}><X size={12}/></button>
          </div>
        )}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:12 }}>
          {[['airbnb','Airbnb'],['booking','Booking'],['direct','Direct']].map(([k,v])=>(
            <div key={k} style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,color:'rgba(159,215,255,0.45)' }}>
              <div style={{ width:12,height:8,borderRadius:3,background:cs(k).bg }}/>{v}
            </div>
          ))}
          <div style={{ width:1,height:20,background:'rgba(159,215,255,0.1)' }}/>
          {isCurrentMonth && (
            <div style={{ fontSize:11,color:'rgba(159,215,255,0.5)' }}>
              <span style={{ color:'#4ADE80',fontWeight:700 }}>{occupiedToday}</span>/{apts.length} ocupate azi
            </div>
          )}
          <select value={selApt} onChange={e=>setSelApt(e.target.value)} style={{ fontSize:12,padding:'5px 10px' }}>
            <option value="">Toate ({apts.length})</option>
            {apts.map(a=><option key={a.id} value={a.id}>{a.nota?`[${a.nota}] `:''}{a.nume}</option>)}
          </select>
        </div>
      </div>

      {/* ── Layout principal ── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>

        {/* ── Grid calendar ── */}
        <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }} onClick={e=>{(e.target as HTMLElement).closest('[data-rez]')||setTooltip(null)}}>
          <div style={{ minWidth: LABEL_W + days*COL_W + 2 }}>

            {/* Day headers */}
            <div style={{ display:'flex', position:'sticky', top:0, zIndex:15, background:'rgba(11,18,32,0.97)', borderBottom:'1px solid rgba(159,215,255,0.1)' }}>
              <div style={{ width:LABEL_W, flexShrink:0, borderRight:'1px solid rgba(159,215,255,0.1)' }}/>
              {Array.from({length:days},(_,i)=>{
                const d=i+1, ds=isoDate(year,month,d)
                const dow=getDow(year,month,d)
                const isWknd=dow===5||dow===6
                const isT=ds===today
                const isSel=selDay===d
                return (
                  <div key={d}
                    onClick={()=>setSelDay(selDay===d?null:d)}
                    style={{ width:COL_W, flexShrink:0, textAlign:'center', padding:'5px 0', borderRight:leftBorder(d), background:hdrBg(d), cursor:'pointer', transition:'background .12s', userSelect:'none' }}>
                    <div style={{ fontSize:9, color:isWknd&&!isT&&!isSel?'rgba(255,180,50,0.55)':'rgba(159,215,255,0.3)' }}>{DAYS_SHORT[dow]}</div>
                    <div style={{ fontSize:13, fontWeight:isT||isSel?700:400, color:hdrColor(d) }}>{d}</div>
                  </div>
                )
              })}
            </div>

            {/* Apt rows */}
            {loading
              ? <div style={{ padding:'60px',textAlign:'center',color:'rgba(159,215,255,0.3)',fontSize:13 }}>Se încarcă...</div>
              : displayApts.map((apt,ai)=>{
                const isOccupiedToday = isCurrentMonth && !!getRez(apt.id,todayDay)
                return (
                  <div key={apt.id} style={{ display:'flex', borderBottom:'1px solid rgba(159,215,255,0.05)', background:ai%2===0?'rgba(14,27,43,0.2)':'transparent' }}>

                    {/* Label */}
                    <div style={{ width:LABEL_W, flexShrink:0, padding:'0 10px', display:'flex', flexDirection:'column', justifyContent:'center', height:ROW_H, borderRight:'1px solid rgba(159,215,255,0.08)', borderLeft:`3px solid ${isOccupiedToday?'rgba(34,197,94,0.5)':'rgba(159,215,255,0.08)'}` }}>
                      {apt.nota && <span style={{ fontSize:9,color:'#4DA3FF',fontFamily:'monospace',lineHeight:1 }}>{apt.nota}</span>}
                      <span style={{ fontSize:11,fontWeight:500,color:'rgba(214,228,244,0.85)',lineHeight:1.2,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{apt.nume}</span>
                    </div>

                    {/* Cells */}
                    {Array.from({length:days},(_,i)=>{
                      const d=i+1, ds=isoDate(year,month,d)
                      const r=getRez(apt.id,d)
                      const isT=ds===today
                      const dow=getDow(year,month,d)
                      const isWknd=dow===5||dow===6
                      const isStart=r&&(r.data_checkin===ds||d===1)
                      const nextR=d<days?getRez(apt.id,d+1):null
                      const isSameNext=nextR?.id===r?.id
                      const isEnd=r&&!isSameNext
                      const style=cs(r?.canal||'direct')
                      const isSel=selDay===d

                      return (
                        <div key={d} style={{ width:COL_W, flexShrink:0, height:ROW_H, position:'relative', background:colBg(d), borderRight:leftBorder(d), transition:'background .1s' }}>
                          {/* reservation bar */}
                          {r && (
                            <div data-rez="1"
                              onClick={e=>{e.stopPropagation();setTooltip(t=>t?.rez.id===r.id?null:{rez:r,x:e.clientX,y:e.clientY})}}
                              style={{ position:'absolute', top:5, bottom:5, left:isStart?2:0, right:isEnd?2:0, background:style.bg, borderRadius:isStart&&isEnd?6:isStart?'6px 0 0 6px':isEnd?'0 6px 6px 0':0, display:'flex', alignItems:'center', overflow:'hidden', cursor:'pointer', zIndex:5, transition:'filter .1s' }}
                              onMouseEnter={e=>(e.currentTarget.style.filter='brightness(1.15)')}
                              onMouseLeave={e=>(e.currentTarget.style.filter='')}>
                              {isStart && <span style={{ fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.95)',padding:'0 5px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{r.nume_client.split(' ')[0]}</span>}
                            </div>
                          )}
                          {/* selected day highlight on free cells */}
                          {!r && isSel && (
                            <div style={{ position:'absolute',inset:'4px 2px',borderRadius:5,background:'rgba(77,163,255,0.15)',border:'1px dashed rgba(77,163,255,0.35)' }}/>
                          )}
                          {/* today line */}
                          {isT && <div style={{ position:'absolute',top:0,bottom:0,left:'50%',width:1.5,background:'rgba(16,185,129,0.5)',zIndex:10,pointerEvents:'none' }}/>}
                          {/* selected day line */}
                          {isSel && !isT && <div style={{ position:'absolute',top:0,bottom:0,left:'50%',width:1.5,background:'rgba(77,163,255,0.5)',zIndex:10,pointerEvents:'none' }}/>}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            }
          </div>
        </div>

        {/* ── Panel zi selectată ── */}
        {selDay && selDayApts && (
          <div style={{ width:220, flexShrink:0, borderLeft:'1px solid rgba(159,215,255,0.1)', background:'rgba(11,18,32,0.7)', overflowY:'auto', padding:'14px 12px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13,fontWeight:600,color:'#7BC8FF' }}>{selDay} {MONTHS[month]}</div>
                <div style={{ fontSize:10,color:'rgba(159,215,255,0.4)' }}>{DAYS_SHORT[getDow(year,month,selDay)]} · {year}</div>
              </div>
              <button onClick={()=>setSelDay(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',display:'flex' }}><X size={14}/></button>
            </div>

            {/* Libere */}
            {selDayApts.free.length>0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10,fontWeight:600,color:'#4ADE80',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6 }}>
                  Disponibile ({selDayApts.free.length})
                </div>
                {selDayApts.free.map(a=>(
                  <div key={a.id} style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 8px',borderRadius:7,background:'rgba(74,222,128,0.07)',border:'1px solid rgba(74,222,128,0.15)',marginBottom:5 }}>
                    {a.nota && <span style={{ fontSize:9,fontWeight:700,color:'var(--accent-blue)',background:'rgba(77,163,255,0.12)',padding:'1px 5px',borderRadius:4,flexShrink:0 }}>{a.nota}</span>}
                    <span style={{ fontSize:11,color:'rgba(214,228,244,0.8)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.nume}</span>
                    <div style={{ width:6,height:6,borderRadius:'50%',background:'#4ADE80',flexShrink:0,boxShadow:'0 0 4px rgba(74,222,128,0.6)' }}/>
                  </div>
                ))}
              </div>
            )}

            {/* Ocupate */}
            {selDayApts.busy.length>0 && (
              <div>
                <div style={{ fontSize:10,fontWeight:600,color:'#F87171',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6 }}>
                  Ocupate ({selDayApts.busy.length})
                </div>
                {selDayApts.busy.map(({apt,rez:r})=>{
                  const st=cs(r.canal)
                  const phone=r.telefon_client||''
                  return(
                    <div key={apt.id} style={{ padding:'8px',borderRadius:7,background:`${st.bg}18`,border:`1px solid ${st.bg}`,marginBottom:6 }}>
                      <div style={{ display:'flex',alignItems:'center',gap:5,marginBottom:4 }}>
                        {apt.nota && <span style={{ fontSize:9,fontWeight:700,color:'var(--accent-blue)',background:'rgba(77,163,255,0.12)',padding:'1px 5px',borderRadius:4 }}>{apt.nota}</span>}
                        <span style={{ fontSize:11,fontWeight:500,color:'rgba(214,228,244,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{apt.nume}</span>
                      </div>
                      <div style={{ fontSize:11,fontWeight:500,color:'#fff',marginBottom:2 }}>{r.nume_client}</div>
                      <div style={{ fontSize:10,color:'rgba(159,215,255,0.4)',marginBottom:6 }}>CO: {r.data_checkout?.slice(5)}</div>
                      {phone && (
                        <a href={`https://wa.me/${phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                          style={{ display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#4ADE80',textDecoration:'none' }}>
                          <MessageCircle size={10}/>WA · {phone}
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {selDayApts.free.length===0 && selDayApts.busy.length===0 && (
              <div style={{ fontSize:12,color:'rgba(159,215,255,0.25)',fontStyle:'italic' }}>Nu există apartamente</div>
            )}
          </div>
        )}
      </div>

      {/* Tooltip rezervare */}
      {tooltip && (
        <div data-rez="1" onClick={e=>e.stopPropagation()} style={{ position:'fixed', left:Math.min(tooltip.x+12,window.innerWidth-240), top:Math.min(tooltip.y-10,window.innerHeight-200), zIndex:100, background:'rgba(11,22,40,0.97)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid rgba(159,215,255,0.2)', borderTop:`3px solid ${cs(tooltip.rez.canal).bg}`, borderRadius:12, padding:'14px 16px', minWidth:220, boxShadow:'0 12px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize:14,fontWeight:600,color:'#FFF',marginBottom:3 }}>{tooltip.rez.nume_client}</div>
          <div style={{ fontSize:11,color:'rgba(159,215,255,0.5)',marginBottom:8 }}>{(tooltip.rez.apartament as any)?.nume||'—'}</div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:10 }}>
            <div style={{ background:'rgba(14,27,43,0.6)',borderRadius:6,padding:'5px 8px' }}>
              <div style={{ fontSize:9,color:'rgba(159,215,255,0.35)',marginBottom:2 }}>Check-in</div>
              <div style={{ fontSize:11,color:'#FFF',fontFamily:'monospace' }}>{tooltip.rez.data_checkin}</div>
            </div>
            <div style={{ background:'rgba(14,27,43,0.6)',borderRadius:6,padding:'5px 8px' }}>
              <div style={{ fontSize:9,color:'rgba(159,215,255,0.35)',marginBottom:2 }}>Check-out</div>
              <div style={{ fontSize:11,color:'#FFF',fontFamily:'monospace' }}>{tooltip.rez.data_checkout}</div>
            </div>
          </div>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
            <div style={{ display:'flex',alignItems:'center',gap:6 }}>
              <div style={{ width:8,height:8,borderRadius:2,background:cs(tooltip.rez.canal).bg }}/>
              <span style={{ fontSize:11,color:'rgba(214,228,244,0.6)',textTransform:'capitalize' }}>{tooltip.rez.canal}</span>
              {tooltip.rez.nr_nopti && <span style={{ fontSize:10,color:'rgba(159,215,255,0.4)' }}>· {tooltip.rez.nr_nopti} nopți</span>}
            </div>
            {tooltip.rez.telefon_client && (
              <a href={`https://wa.me/${tooltip.rez.telefon_client.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener"
                style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:6,background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.3)',color:'#4ADE80',textDecoration:'none',fontSize:11,fontWeight:500 }}>
                <MessageCircle size={12}/> WA
              </a>
            )}
          </div>
        </div>
      )}
    </>
  )
}
