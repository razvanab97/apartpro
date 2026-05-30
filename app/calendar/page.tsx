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

const CANAL_STYLE: Record<string,{bg:string;text:string}> = {
  airbnb:   { bg:'#E8484C', text:'#fff' },
  booking:  { bg:'#0055A5', text:'#fff' },
  direct:   { bg:'#0F9660', text:'#fff' },
  whatsapp: { bg:'#25D366', text:'#fff' },
  telefon:  { bg:'#0F9660', text:'#fff' },
  site:     { bg:'#5855D6', text:'#fff' },
}
const cs = (canal:string) => CANAL_STYLE[canal?.toLowerCase()] || CANAL_STYLE.direct

const MONTHS = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
const DAYS_SHORT = ['V','L','M','M','J','V','S','D'].slice(1) // L M M J V S D — index 0=Luni

function daysInMonth(y:number,m:number){ return new Date(y,m+1,0).getDate() }
function isoDate(y:number,m:number,d:number){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
// 0=Luni...6=Duminică
function getDow(y:number,m:number,d:number){ return (new Date(y,m,d).getDay()+6)%7 }

export default function CalendarPage() {
  const [rezAll, setRezAll]     = useState<Rez[]>([])
  const [apts, setApts]         = useState<Apt[]>([])
  const [loading, setLoading]   = useState(true)
  const [year, setYear]         = useState(new Date().getFullYear())
  const [month, setMonth]       = useState(new Date().getMonth())
  const [selApt, setSelApt]     = useState('')
  const [selDay, setSelDay]     = useState<number|null>(null)
  const [tooltip, setTooltip]   = useState<{rez:Rez;x:number;y:number}|null>(null)

  const today     = new Date().toISOString().split('T')[0]
  const todayDay  = new Date().getDate()
  const todayMon  = new Date().getMonth()
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
    setRezAll((r || []) as unknown as Rez[])
    setLoading(false)
  }

  const days        = daysInMonth(year, month)
  const displayApts = selApt ? apts.filter(a => a.id === selApt) : apts
  const rez         = selApt ? rezAll.filter(r => (r.apartament as any)?.id === selApt) : rezAll

  function getRez(aptId:string, day:number): Rez|null {
    const d = isoDate(year, month, day)
    return rez.find(r => (r.apartament as any)?.id === aptId && r.data_checkin <= d && r.data_checkout > d) || null
  }

  function prevMonth(){ if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1); setSelDay(null) }
  function nextMonth(){ if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1); setSelDay(null) }

  const isCurrentMonth  = month===todayMon && year===todayYear
  const occupiedToday   = isCurrentMonth ? apts.filter(a=>getRez(a.id,todayDay)).length : 0

  // Panel ziua selectată
  const selDayInfo = selDay ? {
    free: displayApts.filter(a => !getRez(a.id, selDay)),
    busy: displayApts.filter(a =>  !!getRez(a.id, selDay)).map(a=>({ apt:a, r:getRez(a.id,selDay)! })),
  } : null

  // dimensiuni — mai late ca in screenshot
  const LABEL_W = 160
  const COL_W   = 44   // lat ca in screenshot
  const ROW_H   = 56   // inalt ca in screenshot
  const HDR_H   = 52

  return (
    <>
      {/* ── Nav bar ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 20px', borderBottom:'1px solid rgba(159,215,255,0.08)', background:'rgba(6,14,26,0.9)', position:'sticky', top:0, zIndex:20, flexShrink:0 }}>
        <button onClick={prevMonth} style={{ width:34,height:34,borderRadius:8,background:'rgba(77,163,255,0.12)',border:'1px solid rgba(77,163,255,0.25)',cursor:'pointer',color:'#7BC8FF',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <ChevronLeft size={16}/>
        </button>
        <span style={{ fontSize:16,fontWeight:600,color:'#fff',minWidth:190,textAlign:'center' }}>{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} style={{ width:34,height:34,borderRadius:8,background:'rgba(77,163,255,0.12)',border:'1px solid rgba(77,163,255,0.25)',cursor:'pointer',color:'#7BC8FF',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <ChevronRight size={16}/>
        </button>
        <button onClick={()=>{setYear(todayYear);setMonth(todayMon);setSelDay(null)}} style={{ fontSize:12,padding:'6px 14px',borderRadius:7,background:'rgba(77,163,255,0.15)',border:'1px solid rgba(77,163,255,0.3)',color:'#7BC8FF',cursor:'pointer' }}>
          Azi
        </button>
        {selDay && (
          <div style={{ display:'flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:7,background:'rgba(77,163,255,0.12)',border:'1px solid rgba(77,163,255,0.3)' }}>
            <span style={{ fontSize:12,color:'#7BC8FF' }}><strong>{selDay} {MONTHS[month]}</strong> — {selDayInfo?.free.length} libere · {selDayInfo?.busy.length} ocupate</span>
            <button onClick={()=>setSelDay(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(77,163,255,0.6)',display:'flex',padding:0 }}><X size={13}/></button>
          </div>
        )}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
          {(['airbnb','booking','direct'] as const).map(k=>(
            <div key={k} style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,color:'rgba(159,215,255,0.45)' }}>
              <div style={{ width:14,height:10,borderRadius:3,background:cs(k).bg }}/>{k.charAt(0).toUpperCase()+k.slice(1)}
            </div>
          ))}
          <div style={{ width:1,height:20,background:'rgba(159,215,255,0.1)' }}/>
          {isCurrentMonth && (
            <span style={{ fontSize:12,color:'rgba(159,215,255,0.5)' }}>
              <span style={{ color:'#4ADE80',fontWeight:700 }}>{occupiedToday}</span>/{apts.length} ocupate azi
            </span>
          )}
          <select value={selApt} onChange={e=>setSelApt(e.target.value)} style={{ fontSize:12,padding:'5px 10px',borderRadius:7 }}>
            <option value="">Toate ({apts.length})</option>
            {apts.map(a=><option key={a.id} value={a.id}>{a.nota?`[${a.nota}] `:''}{a.nume}</option>)}
          </select>
        </div>
      </div>

      {/* ── Layout ── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', minHeight:0 }}>

        {/* ── Grid ── */}
        <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }}
          onClick={e=>{ if(!(e.target as HTMLElement).closest('[data-rez]')) setTooltip(null) }}>
          <div style={{ minWidth: LABEL_W + days*COL_W }}>

            {/* ── Day headers ── */}
            <div style={{ display:'flex', position:'sticky', top:0, zIndex:15, background:'rgba(6,14,26,0.98)', borderBottom:'2px solid rgba(159,215,255,0.1)' }}>
              {/* corner */}
              <div style={{ width:LABEL_W, flexShrink:0, height:HDR_H, borderRight:'1px solid rgba(159,215,255,0.1)' }}/>
              {Array.from({length:days},(_,i)=>{
                const d    = i+1
                const ds   = isoDate(year,month,d)
                const dow  = getDow(year,month,d)
                const isWk = dow===5||dow===6  // Sâmbătă=5 Duminică=6
                const isT  = ds===today
                const isSel= selDay===d

                // culori exacte din screenshot
                const numColor = isSel ? '#7BC8FF' : isT ? '#4ADE80' : isWk ? '#6B8EFF' : 'rgba(214,228,244,0.75)'
                const dayColor = isSel ? 'rgba(77,163,255,0.5)' : isT ? 'rgba(74,222,128,0.5)' : isWk ? 'rgba(107,142,255,0.5)' : 'rgba(159,215,255,0.25)'
                const hdrBg   = isSel ? 'rgba(77,163,255,0.15)' : isT ? 'rgba(74,222,128,0.08)' : isWk ? 'rgba(107,142,255,0.06)' : 'transparent'

                return (
                  <div key={d} onClick={()=>setSelDay(selDay===d?null:d)}
                    style={{ width:COL_W, flexShrink:0, height:HDR_H, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, background:hdrBg, borderRight:'1px solid rgba(159,215,255,0.06)', cursor:'pointer', transition:'background .12s', userSelect:'none' }}>
                    <span style={{ fontSize:18, fontWeight:700, color:numColor, lineHeight:1 }}>{d}</span>
                    <span style={{ fontSize:10, fontWeight:500, color:dayColor, letterSpacing:'.04em' }}>
                      {['L','M','M','J','V','S','D'][dow]}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* ── Apt rows ── */}
            {loading ? (
              <div style={{ padding:'80px',textAlign:'center',color:'rgba(159,215,255,0.3)',fontSize:14 }}>Se încarcă calendarul...</div>
            ) : displayApts.map((apt, ai) => {
              const isOccToday = isCurrentMonth && !!getRez(apt.id, todayDay)
              return (
                <div key={apt.id} style={{ display:'flex', borderBottom:'1px solid rgba(159,215,255,0.07)', background: ai%2===0 ? 'rgba(255,255,255,0.015)' : 'transparent', height:ROW_H }}>

                  {/* Label */}
                  <div style={{ width:LABEL_W, flexShrink:0, height:ROW_H, display:'flex', alignItems:'center', gap:10, padding:'0 14px', borderRight:'1px solid rgba(159,215,255,0.1)', borderLeft:`3px solid ${isOccToday?'rgba(74,222,128,0.6)':'rgba(77,163,255,0.2)'}`, position:'sticky', left:0, background: ai%2===0?'rgba(8,18,36,0.98)':'rgba(6,14,26,0.98)', zIndex:5 }}>
                    {apt.nota && (
                      <span style={{ fontSize:11, fontWeight:700, color:'#4DA3FF', background:'rgba(77,163,255,0.15)', padding:'3px 8px', borderRadius:6, flexShrink:0, fontFamily:'monospace' }}>
                        {apt.nota}
                      </span>
                    )}
                    <span style={{ fontSize:13, fontWeight:500, color:'rgba(214,228,244,0.9)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.3 }}>
                      {apt.nume}
                    </span>
                  </div>

                  {/* Cells */}
                  {Array.from({length:days},(_,i)=>{
                    const d   = i+1
                    const ds  = isoDate(year,month,d)
                    const r   = getRez(apt.id,d)
                    const dow = getDow(year,month,d)
                    const isWk= dow===5||dow===6
                    const isT = ds===today
                    const isSel=selDay===d

                    // is this start of rez in this month?
                    const isStart = r && (r.data_checkin===ds || d===1)
                    const nextR   = d<days ? getRez(apt.id,d+1) : null
                    const isEnd   = r && nextR?.id!==r.id

                    const style = cs(r?.canal||'direct')

                    // cell background
                    let cellBg = 'transparent'
                    if(isSel && !r)  cellBg = 'rgba(77,163,255,0.1)'
                    else if(isT)     cellBg = 'rgba(74,222,128,0.05)'
                    else if(isWk)    cellBg = 'rgba(107,142,255,0.04)'

                    return (
                      <div key={d} style={{ width:COL_W, flexShrink:0, height:ROW_H, position:'relative', background:cellBg, borderRight:`1px solid rgba(159,215,255,${isWk?'0.08':'0.04'})`, transition:'background .1s' }}>

                        {/* Reservation bar */}
                        {r && isStart && (
                          <div data-rez="1"
                            onClick={e=>{e.stopPropagation();setTooltip(t=>t?.rez.id===r.id?null:{rez:r,x:e.clientX,y:e.clientY})}}
                            style={{
                              position:'absolute',
                              top:8, bottom:8,
                              left:4,
                              // width = span of days * COL_W minus margins
                              width:(()=>{
                                let span=0
                                for(let dd=d;dd<=days;dd++){
                                  if(getRez(apt.id,dd)?.id===r.id) span++
                                  else break
                                }
                                return span*COL_W - 8
                              })(),
                              background: style.bg,
                              borderRadius:8,
                              display:'flex', alignItems:'center',
                              paddingLeft:12,
                              overflow:'hidden',
                              cursor:'pointer',
                              zIndex:4,
                              transition:'filter .1s',
                            }}
                            onMouseEnter={e=>(e.currentTarget.style.filter='brightness(1.12)')}
                            onMouseLeave={e=>(e.currentTarget.style.filter='')}
                          >
                            <span style={{ fontSize:13, fontWeight:700, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', letterSpacing:'.01em' }}>
                              {r.nume_client}
                            </span>
                          </div>
                        )}

                        {/* Today line */}
                        {isT && <div style={{ position:'absolute', top:0, bottom:0, left:'50%', width:2, background:'rgba(74,222,128,0.5)', zIndex:10, pointerEvents:'none' }}/>}
                        {/* Selected day line */}
                        {isSel && !isT && <div style={{ position:'absolute', top:0, bottom:0, left:'50%', width:2, background:'rgba(77,163,255,0.6)', zIndex:10, pointerEvents:'none' }}/>}
                        {/* Weekend line */}
                        {isWk && !isSel && !isT && <div style={{ position:'absolute', top:0, bottom:0, left:0, width:1, background:'rgba(107,142,255,0.15)', zIndex:3, pointerEvents:'none' }}/>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Panel zi selectată ── */}
        {selDay && selDayInfo && (
          <div style={{ width:230, flexShrink:0, borderLeft:'1px solid rgba(159,215,255,0.1)', background:'rgba(8,18,36,0.9)', overflowY:'auto', padding:'16px 14px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:14,fontWeight:700,color:'#7BC8FF' }}>{selDay} {MONTHS[month]} {year}</div>
                <div style={{ fontSize:11,color:'rgba(159,215,255,0.4)',marginTop:2 }}>
                  {['Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă','Duminică'][getDow(year,month,selDay)]}
                </div>
              </div>
              <button onClick={()=>setSelDay(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',display:'flex' }}><X size={15}/></button>
            </div>

            {/* Libere */}
            {selDayInfo.free.length>0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10,fontWeight:700,color:'#4ADE80',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8 }}>
                  Disponibile — {selDayInfo.free.length}
                </div>
                {selDayInfo.free.map(a=>(
                  <div key={a.id} style={{ display:'flex',alignItems:'center',gap:7,padding:'8px 10px',borderRadius:8,background:'rgba(74,222,128,0.07)',border:'1px solid rgba(74,222,128,0.15)',marginBottom:5 }}>
                    {a.nota && <span style={{ fontSize:10,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.15)',padding:'2px 6px',borderRadius:4,flexShrink:0,fontFamily:'monospace' }}>{a.nota}</span>}
                    <span style={{ fontSize:12,color:'rgba(214,228,244,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.nume}</span>
                    <div style={{ width:6,height:6,borderRadius:'50%',background:'#4ADE80',flexShrink:0,marginLeft:'auto',boxShadow:'0 0 4px rgba(74,222,128,0.7)' }}/>
                  </div>
                ))}
              </div>
            )}

            {/* Ocupate */}
            {selDayInfo.busy.length>0 && (
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:'#F87171',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8 }}>
                  Ocupate — {selDayInfo.busy.length}
                </div>
                {selDayInfo.busy.map(({apt,r})=>{
                  const st = cs(r.canal)
                  const phone = r.telefon_client||''
                  return (
                    <div key={apt.id} style={{ padding:'10px',borderRadius:8,background:`${st.bg}22`,border:`1px solid ${st.bg}55`,marginBottom:7 }}>
                      <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:5 }}>
                        {apt.nota && <span style={{ fontSize:10,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.15)',padding:'2px 6px',borderRadius:4,fontFamily:'monospace' }}>{apt.nota}</span>}
                        <span style={{ fontSize:12,fontWeight:500,color:'rgba(214,228,244,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{apt.nume}</span>
                      </div>
                      <div style={{ fontSize:13,fontWeight:600,color:'#fff',marginBottom:3 }}>{r.nume_client}</div>
                      <div style={{ fontSize:10,color:'rgba(159,215,255,0.4)',marginBottom:phone?8:0 }}>
                        CI: {r.data_checkin?.slice(5)} · CO: {r.data_checkout?.slice(5)}
                        {r.nr_nopti ? ` · ${r.nr_nopti}n` : ''}
                      </div>
                      {phone && (
                        <a href={`https://wa.me/${phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                          style={{ display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:'#4ADE80',textDecoration:'none',background:'rgba(74,222,128,0.1)',border:'1px solid rgba(74,222,128,0.25)',padding:'4px 9px',borderRadius:6 }}>
                          <MessageCircle size={11}/>{phone}
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {selDayInfo.free.length===0 && selDayInfo.busy.length===0 && (
              <div style={{ fontSize:12,color:'rgba(159,215,255,0.2)',fontStyle:'italic',textAlign:'center',marginTop:20 }}>Nicio dată disponibilă</div>
            )}
          </div>
        )}
      </div>

      {/* ── Tooltip rezervare ── */}
      {tooltip && (
        <div data-rez="1" onClick={e=>e.stopPropagation()} style={{ position:'fixed', left:Math.min(tooltip.x+14,window.innerWidth-250), top:Math.min(tooltip.y-10,window.innerHeight-210), zIndex:100, background:'rgba(8,18,36,0.98)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid rgba(159,215,255,0.2)', borderTop:`3px solid ${cs(tooltip.rez.canal).bg}`, borderRadius:12, padding:'16px 18px', minWidth:230, boxShadow:'0 16px 48px rgba(0,0,0,0.6)' }}>
          <div style={{ fontSize:15,fontWeight:700,color:'#fff',marginBottom:3 }}>{tooltip.rez.nume_client}</div>
          <div style={{ fontSize:12,color:'rgba(159,215,255,0.5)',marginBottom:10 }}>{(tooltip.rez.apartament as any)?.nume||'—'}</div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12 }}>
            {[['Check-in',tooltip.rez.data_checkin],['Check-out',tooltip.rez.data_checkout]].map(([lbl,val])=>(
              <div key={lbl} style={{ background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'7px 10px' }}>
                <div style={{ fontSize:9,color:'rgba(159,215,255,0.35)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.06em' }}>{lbl}</div>
                <div style={{ fontSize:12,color:'#fff',fontFamily:'monospace',fontWeight:600 }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <div style={{ width:10,height:10,borderRadius:3,background:cs(tooltip.rez.canal).bg }}/>
              <span style={{ fontSize:12,color:'rgba(214,228,244,0.6)',textTransform:'capitalize' }}>{tooltip.rez.canal}</span>
              {tooltip.rez.nr_nopti && <span style={{ fontSize:11,color:'rgba(159,215,255,0.35)' }}>· {tooltip.rez.nr_nopti} nopți</span>}
            </div>
            {tooltip.rez.telefon_client && (
              <a href={`https://wa.me/${tooltip.rez.telefon_client.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener"
                style={{ display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:7,background:'rgba(37,211,102,0.15)',border:'1px solid rgba(37,211,102,0.3)',color:'#4ADE80',textDecoration:'none',fontSize:12,fontWeight:600 }}>
                <MessageCircle size={13}/> WA
              </a>
            )}
          </div>
        </div>
      )}
    </>
  )
}
