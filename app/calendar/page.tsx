'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { ChevronLeft, ChevronRight, MessageCircle, X, Plus, Check, Loader } from 'lucide-react'

type Rez = {
  id: string; nume_client: string; telefon_client?: string
  data_checkin: string; data_checkout: string
  canal: string; status_rezervare: string; nr_nopti?: number
  suma_incasata?: number; observatii?: string
  apartament?: any
}
type Apt = { id: string; nume: string; nota: string | null }

const CANAL_STYLE: Record<string,{bg:string}> = {
  airbnb:   { bg:'#E8484C' },
  booking:  { bg:'#0055A5' },
  direct:   { bg:'#0F9660' },
  whatsapp: { bg:'#25D366' },
  telefon:  { bg:'#0F9660' },
  site:     { bg:'#5855D6' },
  intern:   { bg:'#7C3AED' },
}
const cs = (canal:string) => CANAL_STYLE[canal?.toLowerCase()] || CANAL_STYLE.direct

const MONTHS = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
const DAYS_RO = ['Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă','Duminică']

function daysInMonth(y:number,m:number){ return new Date(y,m+1,0).getDate() }
function isoDate(y:number,m:number,d:number){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
function getDow(y:number,m:number,d:number){ return (new Date(y,m,d).getDay()+6)%7 }
function waLink(phone:string, msg:string){
  const clean=phone.replace(/\D/g,'')
  const nr=clean.startsWith('0')?'4'+clean:clean
  return `https://wa.me/${nr}?text=${encodeURIComponent(msg)}`
}

function nightsBetween(a:string,b:string){ return Math.round((new Date(b).getTime()-new Date(a).getTime())/(1000*60*60*24)) }

export default function CalendarPage() {
  const [rezAll, setRezAll]     = useState<Rez[]>([])
  const [apts, setApts]         = useState<Apt[]>([])
  const [loading, setLoading]   = useState(true)
  const [year, setYear]         = useState(new Date().getFullYear())
  const [month, setMonth]       = useState(new Date().getMonth())
  const [selApt, setSelApt]     = useState('')
  const [tooltip, setTooltip]   = useState<{rez:Rez;x:number;y:number}|null>(null)

  // selectie zile pentru rezervare noua
  const [dragStart, setDragStart] = useState<{aptId:string;day:number}|null>(null)
  const [dragEnd,   setDragEnd]   = useState<number|null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // panel lateral
  const [panel, setPanel] = useState<'info'|'new'|null>(null)
  const [panelDay, setPanelDay] = useState<number|null>(null)
  const [newRez, setNewRez] = useState({ aptId:'', nume:'', telefon:'', pret:'', checkin:'', checkout:'', cnp:'' })
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [lastNrRez, setLastNrRez] = useState<string|null>(null)
  const [lastSaved, setLastSaved] = useState<any>(null)
  const [saveError, setSaveError] = useState<string|null>(null)
  const [editRez, setEditRez] = useState<any>(null)
  const [editForm, setEditForm] = useState({nume:'',telefon:'',checkin:'',checkout:'',pret:'',observatii:''})
  const [editSaving, setEditSaving] = useState(false)
  const [ciPreview, setCiPreview] = useState<string|null>(null)
  const ciRef = useRef<HTMLInputElement>(null)

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
    setRezAll((r as any) || [])
    setLoading(false)
  }

  const days        = daysInMonth(year, month)
  const displayApts = selApt ? apts.filter(a => a.id === selApt) : apts
  const rez         = selApt ? rezAll.filter(r => r.apartament?.id === selApt) : rezAll

  function getRez(aptId:string, day:number): Rez|null {
    const d = isoDate(year, month, day)
    return rez.find(r => r.apartament?.id === aptId && r.data_checkin <= d && r.data_checkout > d) || null
  }

  function prevMonth(){ if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1); clearSel() }
  function nextMonth(){ if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1); clearSel() }
  function clearSel(){ setDragStart(null);setDragEnd(null);setIsDragging(false);setPanel(null);setPanelDay(null);setCiPreview(null);setSaveError(null) }

  const isCurrentMonth  = month===todayMon && year===todayYear
  const occupiedToday   = isCurrentMonth ? apts.filter(a=>getRez(a.id,todayDay)).length : 0

  // drag selection range
  const selRange = dragStart && dragEnd
    ? { aptId: dragStart.aptId, from: Math.min(dragStart.day,dragEnd), to: Math.max(dragStart.day,dragEnd) }
    : dragStart ? { aptId: dragStart.aptId, from: dragStart.day, to: dragStart.day } : null

  function isInSel(aptId:string, day:number){
    return selRange?.aptId===aptId && day>=selRange.from && day<=selRange.to
  }

  function openNewRez(aptId:string, from:number, to:number){
    const ci = isoDate(year,month,from)
    const co = isoDate(year,month,to+1)
    setNewRez({ aptId, nume:'', telefon:'', pret:'', checkin:ci, checkout:co, cnp:'' })
    setCiPreview(null)
    setPanel('new')
  }

  async function saveRez(){
    if(!newRez.aptId || !newRez.nume || !newRez.checkin || !newRez.checkout){return}
    setSaving(true)
    setSaveError(null)
    const nopti = nightsBetween(newRez.checkin, newRez.checkout)

    // Numar rezervare automat
    const { count: totalRez } = await supabase.from('rezervari').select('*',{count:'exact',head:true})
    const nrRez = `ABH-${100 + (totalRez || 0)}`

    const { data: saved, error } = await supabase.from('rezervari').insert({
      apartament_id: newRez.aptId,
      nume_client: newRez.nume,
      telefon_client: newRez.telefon || null,
      data_checkin: newRez.checkin,
      data_checkout: newRez.checkout,
      suma_incasata: parseFloat(newRez.pret) || 0,
      canal: 'intern',
      status_rezervare: 'confirmata',
      status_plata: newRez.pret ? 'achitat' : 'neachitat',
      status_decont: 'nedecontat',
      observatii: `${nrRez}${newRez.cnp?' | CNP: '+newRez.cnp:''}`,
    }).select().single()

    setSaving(false)
    if(error){
      setSaveError(error.message)
    } else if(saved){
      setSaveOk(true)
      setLastNrRez(nrRez)
      setLastSaved(saved)
      await load()
      setTimeout(()=>{ setSaveOk(false); setPanel(null); clearSel(); setLastNrRez(null); setLastSaved(null) }, 4000)
    }
  }

  async function saveEdit(){
    if(!editRez) return
    setEditSaving(true)
    const { error } = await supabase.from('rezervari').update({
      nume_client: editForm.nume,
      telefon_client: editForm.telefon||null,
      data_checkin: editForm.checkin,
      data_checkout: editForm.checkout,
      suma_incasata: parseFloat(editForm.pret)||0,
      observatii: editForm.observatii||null,
    }).eq('id', editRez.id)
    setEditSaving(false)
    if(!error){ setEditRez(null); setTooltip(null); await load() }
    else alert('Eroare: '+error.message)
  }

  // Doar preview foto buletin
  function scanCI(file: File) {
    setCiPreview(URL.createObjectURL(file))
  }

  // panel info zi
  function openDayInfo(day:number){
    setPanelDay(day); setPanel('info')
    setDragStart(null); setDragEnd(null); setIsDragging(false)
  }

  const dayInfoApts = panelDay ? {
    free: displayApts.filter(a => !getRez(a.id, panelDay)),
    busy: displayApts.filter(a =>  !!getRez(a.id, panelDay)).map(a=>({ apt:a, r:getRez(a.id,panelDay)! })),
  } : null

  const LABEL_W = 160
  const COL_W   = 44
  const ROW_H   = 56
  const HDR_H   = 52

  return (
    <>
      {/* ── Nav bar ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 20px', borderBottom:'1px solid rgba(159,215,255,0.08)', background:'rgba(6,14,26,0.9)', position:'sticky', top:0, zIndex:20, flexShrink:0 }}>
        <button onClick={prevMonth} style={{ width:34,height:34,borderRadius:8,background:'rgba(77,163,255,0.12)',border:'1px solid rgba(77,163,255,0.25)',cursor:'pointer',color:'#7BC8FF',display:'flex',alignItems:'center',justifyContent:'center' }}><ChevronLeft size={16}/></button>
        <span style={{ fontSize:16,fontWeight:600,color:'#fff',minWidth:190,textAlign:'center' }}>{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} style={{ width:34,height:34,borderRadius:8,background:'rgba(77,163,255,0.12)',border:'1px solid rgba(77,163,255,0.25)',cursor:'pointer',color:'#7BC8FF',display:'flex',alignItems:'center',justifyContent:'center' }}><ChevronRight size={16}/></button>
        <button onClick={()=>{setYear(todayYear);setMonth(todayMon);clearSel()}} style={{ fontSize:12,padding:'6px 14px',borderRadius:7,background:'rgba(77,163,255,0.15)',border:'1px solid rgba(77,163,255,0.3)',color:'#7BC8FF',cursor:'pointer' }}>Azi</button>

        {/* hint drag */}
        {!selRange && <span style={{ fontSize:11,color:'rgba(159,215,255,0.3)',marginLeft:4 }}>Trage pe un apartament pentru a adăuga rezervare</span>}

        {/* actiune selectie */}
        {selRange && (
          <div style={{ display:'flex',alignItems:'center',gap:8,padding:'5px 12px',borderRadius:7,background:'rgba(124,58,237,0.15)',border:'1px solid rgba(124,58,237,0.4)' }}>
            <span style={{ fontSize:11,color:'#A78BFA' }}>
              <strong>{apts.find(a=>a.id===selRange.aptId)?.nota||''} {apts.find(a=>a.id===selRange.aptId)?.nume}</strong>
              {' · '}{selRange.from}–{selRange.to} {MONTHS[month]} ({selRange.to-selRange.from+1}n)
            </span>
            <button onClick={()=>openNewRez(selRange.aptId,selRange.from,selRange.to)}
              style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:6,border:'none',background:'rgba(124,58,237,0.7)',color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer' }}>
              <Plus size={12}/>Rezervare
            </button>
            <button onClick={clearSel} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',display:'flex',padding:0 }}><X size={13}/></button>
          </div>
        )}

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
          {(['airbnb','booking','direct','intern'] as const).map(k=>(
            <div key={k} style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,color:'rgba(159,215,255,0.45)' }}>
              <div style={{ width:14,height:10,borderRadius:3,background:cs(k).bg }}/>{k==='intern'?'Intern':k.charAt(0).toUpperCase()+k.slice(1)}
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
        <div style={{ flex:1, overflowX:'auto', overflowY:'auto', userSelect:'none' }}
          onClick={e=>{ if(!(e.target as HTMLElement).closest('[data-rez]')) setTooltip(null) }}>
          <div style={{ minWidth: LABEL_W + days*COL_W }}>

            {/* Day headers */}
            <div style={{ display:'flex', position:'sticky', top:0, zIndex:15, background:'rgba(6,14,26,0.98)', borderBottom:'2px solid rgba(159,215,255,0.1)' }}>
              <div style={{ width:LABEL_W, flexShrink:0, height:HDR_H, borderRight:'1px solid rgba(159,215,255,0.1)' }}/>
              {Array.from({length:days},(_,i)=>{
                const d   = i+1
                const ds  = isoDate(year,month,d)
                const dow = getDow(year,month,d)
                const isWk= dow===5||dow===6
                const isT = ds===today

                const numColor = isT?'#4ADE80':isWk?'#6B8EFF':'rgba(214,228,244,0.75)'
                const dayColor = isT?'rgba(74,222,128,0.5)':isWk?'rgba(107,142,255,0.5)':'rgba(159,215,255,0.25)'
                const hdrBg   = isT?'rgba(74,222,128,0.08)':isWk?'rgba(107,142,255,0.06)':'transparent'

                return (
                  <div key={d}
                    onClick={()=>{ if(!isDragging) openDayInfo(d) }}
                    style={{ width:COL_W, flexShrink:0, height:HDR_H, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, background:hdrBg, borderRight:'1px solid rgba(159,215,255,0.06)', cursor:'pointer', transition:'background .12s', userSelect:'none' }}>
                    <span style={{ fontSize:18, fontWeight:700, color:numColor, lineHeight:1 }}>{d}</span>
                    <span style={{ fontSize:10, fontWeight:500, color:dayColor, letterSpacing:'.04em' }}>
                      {['L','M','M','J','V','S','D'][dow]}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Apt rows */}
            {loading ? (
              <div style={{ padding:'80px',textAlign:'center',color:'rgba(159,215,255,0.3)',fontSize:14 }}>Se încarcă...</div>
            ) : displayApts.map((apt, ai) => {
              const isOccToday = isCurrentMonth && !!getRez(apt.id, todayDay)
              return (
                <div key={apt.id} style={{ display:'flex', borderBottom:'1px solid rgba(159,215,255,0.07)', background:ai%2===0?'rgba(255,255,255,0.015)':'transparent', height:ROW_H }}>

                  {/* Label */}
                  <div style={{ width:LABEL_W, flexShrink:0, height:ROW_H, display:'flex', alignItems:'center', gap:10, padding:'0 14px', borderRight:'1px solid rgba(159,215,255,0.1)', borderLeft:`3px solid ${isOccToday?'rgba(74,222,128,0.6)':'rgba(77,163,255,0.2)'}`, position:'sticky', left:0, background:ai%2===0?'rgba(8,18,36,0.98)':'rgba(6,14,26,0.98)', zIndex:5 }}>
                    {apt.nota && <span style={{ fontSize:11, fontWeight:700, color:'#4DA3FF', background:'rgba(77,163,255,0.15)', padding:'3px 8px', borderRadius:6, flexShrink:0, fontFamily:'monospace' }}>{apt.nota}</span>}
                    <span style={{ fontSize:13, fontWeight:500, color:'rgba(214,228,244,0.9)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{apt.nume}</span>
                  </div>

                  {/* Cells */}
                  {Array.from({length:days},(_,i)=>{
                    const d   = i+1
                    const ds  = isoDate(year,month,d)
                    const r   = getRez(apt.id,d)
                    const dow = getDow(year,month,d)
                    const isWk= dow===5||dow===6
                    const isT = ds===today
                    const inSel = isInSel(apt.id,d)

                    const isStart = r && (r.data_checkin===ds || d===1)
                    const nextR   = d<days ? getRez(apt.id,d+1) : null
                    const isEnd   = r && nextR?.id!==r.id
                    const style   = cs(r?.canal||'direct')

                    let cellBg = 'transparent'
                    if(inSel)    cellBg = 'rgba(124,58,237,0.2)'
                    else if(isT) cellBg = 'rgba(74,222,128,0.05)'
                    else if(isWk)cellBg = 'rgba(107,142,255,0.04)'

                    return (
                      <div key={d}
                        onMouseDown={e=>{
                          if(r){return} // nu incep drag pe rezervare existenta
                          e.preventDefault()
                          setDragStart({aptId:apt.id,day:d})
                          setDragEnd(d)
                          setIsDragging(true)
                          setPanel(null)
                        }}
                        onMouseEnter={()=>{
                          if(isDragging && dragStart?.aptId===apt.id) setDragEnd(d)
                        }}
                        onMouseUp={()=>{
                          if(isDragging && dragStart?.aptId===apt.id && dragEnd){
                            const from=Math.min(dragStart.day,dragEnd)
                            const to=Math.max(dragStart.day,dragEnd)
                            openNewRez(apt.id,from,to)
                          }
                          setIsDragging(false)
                        }}
                        style={{ width:COL_W, flexShrink:0, height:ROW_H, position:'relative', background:cellBg, borderRight:`1px solid rgba(159,215,255,${isWk?'0.08':'0.04'})`, cursor:r?'default':'crosshair', transition:'background .05s' }}>

                        {/* Reservation bar */}
                        {r && isStart && (()=>{
                          let span=0
                          for(let dd=d;dd<=days;dd++){
                            if(getRez(apt.id,dd)?.id===r.id) span++
                            else break
                          }
                          return(
                            <div data-rez="1"
                              onClick={e=>{e.stopPropagation();setTooltip(t=>t?.rez.id===r.id?null:{rez:r,x:e.clientX,y:e.clientY})}}
                              style={{ position:'absolute', top:8, bottom:8, left:4, width:span*COL_W-8, background:style.bg, borderRadius:8, display:'flex', alignItems:'center', paddingLeft:12, overflow:'hidden', cursor:'pointer', zIndex:4 }}
                              onMouseEnter={e=>(e.currentTarget.style.filter='brightness(1.12)')}
                              onMouseLeave={e=>(e.currentTarget.style.filter='')}>
                              <span style={{ fontSize:13, fontWeight:700, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.nume_client}</span>
                            </div>
                          )
                        })()}

                        {isT && <div style={{ position:'absolute', top:0, bottom:0, left:'50%', width:2, background:'rgba(74,222,128,0.5)', zIndex:10, pointerEvents:'none' }}/>}
                        {isWk && !isT && <div style={{ position:'absolute', top:0, bottom:0, left:0, width:1, background:'rgba(107,142,255,0.15)', zIndex:3, pointerEvents:'none' }}/>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Panel lateral ── */}
        {panel && (
          <div style={{ width:260, flexShrink:0, borderLeft:'1px solid rgba(159,215,255,0.1)', background:'rgba(8,18,36,0.95)', overflowY:'auto', display:'flex', flexDirection:'column' }}
            onMouseUp={()=>setIsDragging(false)}>

            {/* ── PANEL: Zi info ── */}
            {panel==='info' && panelDay && dayInfoApts && (
              <div style={{ padding:'16px 14px', flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                  <div>
                    <div style={{ fontSize:14,fontWeight:700,color:'#7BC8FF' }}>{panelDay} {MONTHS[month]} {year}</div>
                    <div style={{ fontSize:11,color:'rgba(159,215,255,0.4)',marginTop:2 }}>{DAYS_RO[getDow(year,month,panelDay)]}</div>
                  </div>
                  <button onClick={()=>setPanel(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',display:'flex' }}><X size={15}/></button>
                </div>

                {dayInfoApts.free.length>0&&<>
                  <div style={{ fontSize:10,fontWeight:700,color:'#4ADE80',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8 }}>Disponibile — {dayInfoApts.free.length}</div>
                  {dayInfoApts.free.map(a=>(
                    <div key={a.id} style={{ display:'flex',alignItems:'center',gap:7,padding:'8px 10px',borderRadius:8,background:'rgba(74,222,128,0.07)',border:'1px solid rgba(74,222,128,0.15)',marginBottom:5,cursor:'pointer' }}
                      onClick={()=>openNewRez(a.id,panelDay,panelDay)}>
                      {a.nota&&<span style={{ fontSize:10,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.15)',padding:'2px 6px',borderRadius:4,flexShrink:0,fontFamily:'monospace' }}>{a.nota}</span>}
                      <span style={{ fontSize:12,color:'rgba(214,228,244,0.85)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.nume}</span>
                      <Plus size={12} color="rgba(74,222,128,0.6)"/>
                    </div>
                  ))}
                </>}

                {dayInfoApts.busy.length>0&&<>
                  <div style={{ fontSize:10,fontWeight:700,color:'#F87171',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8,marginTop:dayInfoApts.free.length?14:0 }}>Ocupate — {dayInfoApts.busy.length}</div>
                  {dayInfoApts.busy.map(({apt,r})=>{
                    const phone=r.telefon_client||''
                    return(
                      <div key={apt.id} style={{ padding:'10px',borderRadius:8,background:`${cs(r.canal).bg}22`,border:`1px solid ${cs(r.canal).bg}55`,marginBottom:7 }}>
                        <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:4 }}>
                          {apt.nota&&<span style={{ fontSize:10,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.15)',padding:'2px 6px',borderRadius:4,fontFamily:'monospace' }}>{apt.nota}</span>}
                          <span style={{ fontSize:12,color:'rgba(214,228,244,0.8)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{apt.nume}</span>
                        </div>
                        <div style={{ fontSize:13,fontWeight:600,color:'#fff',marginBottom:3 }}>{r.nume_client}</div>
                        <div style={{ fontSize:10,color:'rgba(159,215,255,0.4)',marginBottom:phone?7:0 }}>CI: {r.data_checkin?.slice(5)} · CO: {r.data_checkout?.slice(5)}</div>
                        {phone&&<a href={`https://wa.me/${phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                          style={{ display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:'#4ADE80',textDecoration:'none',background:'rgba(74,222,128,0.1)',border:'1px solid rgba(74,222,128,0.25)',padding:'4px 9px',borderRadius:6 }}>
                          <MessageCircle size={11}/>{phone}
                        </a>}
                      </div>
                    )
                  })}
                </>}
              </div>
            )}

            {/* ── PANEL: Rezervare nouă ── */}
            {panel==='new' && (
              <div style={{ padding:'16px 14px', flex:1, display:'flex', flexDirection:'column' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                  <div>
                    <div style={{ fontSize:14,fontWeight:700,color:'#A78BFA' }}>Rezervare nouă</div>
                    <div style={{ fontSize:11,color:'rgba(159,215,255,0.4)',marginTop:2 }}>Canal intern — nu se sincronizează</div>
                  </div>
                  <button onClick={()=>{ setPanel(null); clearSel() }} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',display:'flex' }}><X size={15}/></button>
                </div>

                {/* Apartament */}
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>Apartament</div>
                  <select value={newRez.aptId} onChange={e=>setNewRez({...newRez,aptId:e.target.value})}
                    style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}>
                    <option value="">— Alege apartament —</option>
                    {apts.map(a=><option key={a.id} value={a.id}>{a.nota?`${a.nota} · `:''}{a.nume}</option>)}
                  </select>
                </div>

                {/* Perioada */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>Check-in</div>
                    <input type="date" value={newRez.checkin} onChange={e=>setNewRez({...newRez,checkin:e.target.value})}
                      style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>Check-out</div>
                    <input type="date" value={newRez.checkout} onChange={e=>setNewRez({...newRez,checkout:e.target.value})}
                      style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}/>
                  </div>
                </div>

                {/* Nopti preview */}
                {newRez.checkin && newRez.checkout && nightsBetween(newRez.checkin,newRez.checkout)>0 && (
                  <div style={{ marginBottom:10,padding:'6px 10px',background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.25)',borderRadius:7,fontSize:12,color:'#A78BFA',display:'flex',alignItems:'center',gap:6 }}>
                    <span style={{ fontWeight:700 }}>{nightsBetween(newRez.checkin,newRez.checkout)}</span> nopți
                  </div>
                )}

                {/* Foto buletin */}
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.06em' }}>Foto buletin (opțional)</div>
                  <input ref={ciRef} type="file" accept="image/*" onChange={e=>e.target.files?.[0]&&scanCI(e.target.files[0])} style={{ display:'none' }}/>
                  {ciPreview
                    ? <div style={{ position:'relative',borderRadius:8,overflow:'hidden',border:'1px solid rgba(124,58,237,0.3)' }}>
                        <img src={ciPreview} alt="CI" style={{ width:'100%',maxHeight:120,objectFit:'contain',background:'rgba(0,0,0,0.4)',display:'block' }}/>
                        <button onClick={()=>{setCiPreview(null)}} style={{ position:'absolute',top:4,right:4,background:'rgba(0,0,0,0.6)',border:'none',borderRadius:4,color:'#fff',cursor:'pointer',padding:'2px 6px',fontSize:10 }}>✕</button>
                      </div>
                    : <button onClick={()=>ciRef.current?.click()}
                        style={{ width:'100%',padding:'9px',borderRadius:8,border:'1px dashed rgba(124,58,237,0.3)',background:'rgba(124,58,237,0.05)',color:'rgba(167,139,250,0.6)',fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7 }}>
                        📷 Fotografiază buletin
                      </button>
                  }
                </div>

                {/* Nume */}
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>Nume client *</div>
                  <input value={newRez.nume} onChange={e=>setNewRez({...newRez,nume:e.target.value})} placeholder="ex. Ion Popescu"
                    style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}/>
                </div>

                {/* CNP */}
                {newRez.cnp && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>CNP</div>
                    <input value={newRez.cnp} onChange={e=>setNewRez({...newRez,cnp:e.target.value})} placeholder="1234567890123"
                      style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none',fontFamily:'monospace' }}/>
                  </div>
                )}

                {/* Telefon */}
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>Telefon</div>
                  <input value={newRez.telefon} onChange={e=>setNewRez({...newRez,telefon:e.target.value})} placeholder="+40 7xx xxx xxx"
                    style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}/>
                </div>

                {/* Pret */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>Preț total (RON)</div>
                  <input type="number" value={newRez.pret} onChange={e=>setNewRez({...newRez,pret:e.target.value})} placeholder="0" min={0}
                    style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}/>
                </div>

                <button onClick={saveRez} disabled={saving || !newRez.aptId || !newRez.nume || !newRez.checkin || !newRez.checkout}
                  style={{ width:'100%',padding:'11px',borderRadius:10,border:'none',background:saveOk?'rgba(74,222,128,0.8)':'rgba(124,58,237,0.8)',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'all .2s',opacity:(!newRez.aptId||!newRez.nume||!newRez.checkin||!newRez.checkout)&&!saving?0.5:1 }}>
                  {saving ? <Loader size={16} style={{ animation:'spin 1s linear infinite' }}/> : saveOk ? <><Check size={16}/>Salvat!</> : <><Plus size={16}/>Salvează rezervarea</>}
                </button>

                {/* Confirmare dupa salvare */}
                {saveOk && lastNrRez && (
                  <div style={{ marginTop:10, padding:'12px', background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.3)', borderRadius:10 }}>
                    <div style={{ fontSize:11, color:'rgba(74,222,128,0.6)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Rezervare salvată</div>
                    <div style={{ fontSize:18, fontWeight:700, color:'#4ADE80', marginBottom:8, fontFamily:'monospace' }}>{lastNrRez}</div>
                    {newRez.telefon && (
                      <a href={waLink(newRez.telefon, `Bună ziua, ${newRez.nume}! 👋

Vă confirmăm rezervarea la *${apts.find(a=>a.id===newRez.aptId)?.nume||'apartament'}*.

📋 *Nr. rezervare:* ${lastNrRez}
📅 *Check-in:* ${newRez.checkin}
📅 *Check-out:* ${newRez.checkout}
🌙 *Nopți:* ${nightsBetween(newRez.checkin,newRez.checkout)}
💰 *Total:* ${newRez.pret||0} RON

Vă vom trimite detaliile de acces în ziua sosirii.

Echipa AB Homes Iași`)}
                        target="_blank" rel="noreferrer"
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'9px', borderRadius:8, background:'rgba(37,211,102,0.15)', border:'1px solid rgba(37,211,102,0.35)', color:'#4ADE80', textDecoration:'none', fontSize:13, fontWeight:700 }}>
                        <MessageCircle size={15}/>Trimite confirmare WhatsApp
                      </a>
                    )}
                  </div>
                )}

                {saveError && (
                  <div style={{ marginTop:8,padding:'8px 10px',background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.3)',borderRadius:7,fontSize:11,color:'#F87171' }}>
                    ⚠ {saveError}
                  </div>
                )}
                <div style={{ marginTop:10,padding:'8px 10px',background:'rgba(124,58,237,0.06)',border:'1px solid rgba(124,58,237,0.15)',borderRadius:7,fontSize:10,color:'rgba(167,139,250,0.6)',lineHeight:1.5 }}>
                  Canal <strong>intern</strong> — nu se trimite în 5starDesk.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div data-rez="1" onClick={e=>e.stopPropagation()} style={{ position:'fixed', left:Math.min(tooltip.x+14,window.innerWidth-250), top:Math.min(tooltip.y-10,window.innerHeight-210), zIndex:100, background:'rgba(8,18,36,0.98)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid rgba(159,215,255,0.2)', borderTop:`3px solid ${cs(tooltip.rez.canal).bg}`, borderRadius:12, padding:'16px 18px', minWidth:230, boxShadow:'0 16px 48px rgba(0,0,0,0.6)' }}>
          <div style={{ fontSize:15,fontWeight:700,color:'#fff',marginBottom:3 }}>{tooltip.rez.nume_client}</div>
          <div style={{ fontSize:12,color:'rgba(159,215,255,0.5)',marginBottom:10 }}>{tooltip.rez.apartament?.nume||'—'}</div>
          <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12 }}>
            {[['Check-in',tooltip.rez.data_checkin],['Check-out',tooltip.rez.data_checkout]].map(([lbl,val])=>(
              <div key={lbl} style={{ background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'7px 10px' }}>
                <div style={{ fontSize:9,color:'rgba(159,215,255,0.35)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.06em' }}>{lbl}</div>
                <div style={{ fontSize:12,color:'#fff',fontFamily:'monospace',fontWeight:600 }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <div style={{ width:10,height:10,borderRadius:3,background:cs(tooltip.rez.canal).bg }}/>
              <span style={{ fontSize:12,color:'rgba(214,228,244,0.6)',textTransform:'capitalize' }}>{tooltip.rez.canal}</span>
              {tooltip.rez.nr_nopti&&<span style={{ fontSize:11,color:'rgba(159,215,255,0.35)' }}>· {tooltip.rez.nr_nopti}n</span>}
            </div>
            {tooltip.rez.telefon_client&&(
              <a href={`https://wa.me/${tooltip.rez.telefon_client.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener"
                style={{ display:'flex',alignItems:'center',gap:5,padding:'5px 8px',borderRadius:7,background:'rgba(37,211,102,0.15)',border:'1px solid rgba(37,211,102,0.3)',color:'#4ADE80',textDecoration:'none',fontSize:12,fontWeight:600 }}>
                <MessageCircle size={13}/> WA
              </a>
            )}
          </div>
          <button onClick={()=>{
            setEditRez(tooltip.rez)
            setEditForm({nume:tooltip.rez.nume_client||'',telefon:tooltip.rez.telefon_client||'',checkin:tooltip.rez.data_checkin||'',checkout:tooltip.rez.data_checkout||'',pret:String(tooltip.rez.suma_incasata||''),observatii:tooltip.rez.observatii||''})
            setTooltip(null)
          }} style={{ width:'100%',padding:'7px',borderRadius:7,border:'1px solid rgba(77,163,255,0.25)',background:'rgba(77,163,255,0.08)',color:'#7BC8FF',fontSize:12,fontWeight:600,cursor:'pointer' }}>
            ✏️ Editează rezervarea
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editRez&&(
        <div onClick={()=>setEditRez(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:340,background:'rgba(8,18,36,0.99)',border:'1px solid rgba(100,160,255,0.25)',borderRadius:14,padding:'20px' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
              <span style={{ fontSize:14,fontWeight:700,color:'#7BC8FF' }}>Editează rezervare</span>
              <button onClick={()=>setEditRez(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',fontSize:18,lineHeight:1 }}>✕</button>
            </div>
            {([['Nume client','nume','text','Ion Popescu'],['Telefon','telefon','text','+40 7xx'],['Check-in','checkin','date',''],['Check-out','checkout','date',''],['Preț (RON)','pret','number','0']] as [string,string,string,string][]).map(([lbl,key,type,ph])=>(
              <div key={key} style={{ marginBottom:10 }}>
                <div style={{ fontSize:10,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.06em' }}>{lbl}</div>
                <input type={type} value={(editForm as any)[key]} placeholder={ph}
                  onChange={e=>setEditForm(f=>({...f,[key]:e.target.value}))}
                  style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}/>
              </div>
            ))}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.06em' }}>Observații</div>
              <input value={editForm.observatii} onChange={e=>setEditForm(f=>({...f,observatii:e.target.value}))}
                style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}/>
            </div>
            <div style={{ display:'flex',gap:8 }}>
              <button onClick={saveEdit} disabled={editSaving}
                style={{ flex:1,padding:'10px',borderRadius:9,border:'none',background:'rgba(77,163,255,0.8)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6 }}>
                {editSaving?<><Loader size={14} style={{ animation:'spin 1s linear infinite' }}/>Se salvează...</>:<><Check size={14}/>Salvează</>}
              </button>
              <button onClick={()=>setEditRez(null)}
                style={{ padding:'10px 16px',borderRadius:9,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.5)',fontSize:13,cursor:'pointer' }}>
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      `}</style>
    </>
  )
}
