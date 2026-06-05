'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'

interface BookingResult {
  rank: number; name: string; price: number; priceText: string
  isOurs: boolean; matchedCode?: string
}
interface ScanState {
  status: 'idle' | 'waiting' | 'done' | 'error'
  results: BookingResult[]
  total?: number; lowestPrice?: number; weAreLowest?: boolean
  ourLowestRank?: number; scannedAt?: string
  checkin?: string; checkout?: string; errorMsg?: string
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export default function PreturiPage() {
  const [apts, setApts] = useState<any[]>([])
  const [preturi, setPreturi] = useState<Record<string,{booking:string,airbnb:string}>>({})
  const [dataSelectata, setDataSelectata] = useState('')
  const [ocupate, setOcupate] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string|null>(null)
  const { toast, show } = useToast()

  const [checkinMonitor, setCheckinMonitor] = useState('')
  const [checkoutMonitor, setCheckoutMonitor] = useState('')
  const [scan, setScan] = useState<ScanState>({ status: 'idle', results: [] })
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [platformTab, setPlatformTab] = useState<'booking'|'airbnb'>('booking')
  const pollRef = useRef<NodeJS.Timeout|null>(null)
  const jobIdRef = useRef<string|null>(null)

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

  async function loadHistory() {
    setLoadingHistory(true)
    const {data} = await supabase.from('booking_monitor_history')
      .select('*').order('scanned_at',{ascending:false}).limit(100)
    setHistory(data||[])
    setLoadingHistory(false)
  }

  useEffect(() => {
    const ci = add(1)
    const d = new Date(ci+'T12:00:00'); d.setDate(d.getDate()+1)
    setCheckinMonitor(ci); setCheckoutMonitor(fmt(d))
    supabase.from('apartamente')
      .select('id,nota,link_booking,link_airbnb,booking_links,airbnb_links')
      .eq('status','activ').order('nota')
      .then(async ({ data }) => {
        const list = (data||[]).map((apt:any) => {
          const bks = (apt.booking_links||[]).filter((l:string)=>l?.includes('booking.com'))
          const abs = (apt.airbnb_links||[]).filter((l:string)=>l?.includes('airbnb.'))
          const bk = bks[0]||(apt.link_booking?.includes('booking.com')?apt.link_booking:null)
          const ab = apt.link_airbnb?.includes('airbnb.')?apt.link_airbnb:abs[0]||null
          return {...apt,_bk:bk,_ab:ab}
        }).filter((a:any)=>a._bk||a._ab)
        setApts(list); setDataSelectata(today)
        loadOcupate(today, list.map((a:any)=>a.id))
        const {data:saved} = await supabase.from('preturi_live')
          .select('*').in('apartament_id',list.map((a:any)=>a.id)).eq('data_checkin',today)
        const map:Record<string,any> = {}
        ;(saved||[]).forEach((p:any)=>{map[p.apartament_id]=p})
        const pm:Record<string,{booking:string,airbnb:string}> = {}
        list.forEach((a:any)=>{pm[a.id]={booking:map[a.id]?.pret_booking?.toString()||'',airbnb:map[a.id]?.pret_airbnb?.toString()||''}})
        setPreturi(pm)
      })
    loadHistory()
    return () => { if(pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function loadOcupate(data:string, ids:string[]) {
    const {data:rez} = await supabase.from('rezervari').select('apartament_id')
      .lte('data_checkin',data).gt('data_checkout',data).neq('status_rezervare','anulata').in('apartament_id',ids)
    setOcupate(new Set((rez||[]).map((r:any)=>r.apartament_id)))
  }

  function buildUrl(baseUrl:string, platform:string, checkin:string) {
    if(!checkin) checkin=today; if(!baseUrl) return ''
    const coD = new Date(checkin+'T12:00:00'); coD.setDate(coD.getDate()+1); const co = fmt(coD)
    if(platform==='booking'||baseUrl.includes('booking.com'))
      return baseUrl.split('?')[0]+`?checkin=${checkin}&checkout=${co}&group_adults=2&no_rooms=1`
    const rm = baseUrl.match(/airbnb\.com\/rooms\/(\d+)/)
    if(rm) return `https://www.airbnb.com/rooms/${rm[1]}?check_in=${checkin}&check_out=${co}&adults=2`
    return baseUrl.split('?')[0]+`?check_in=${checkin}&check_out=${co}&adults=2`
  }

  async function savePret(aptId:string, checkin:string) {
    const p = preturi[aptId]
    if(!p?.booking&&!p?.airbnb){show('error','Introdu cel puțin un preț');return}
    setSaving(aptId)
    await supabase.from('preturi_live').upsert({
      apartament_id:aptId,data_checkin:checkin,
      pret_booking:p.booking?parseInt(p.booking):null,
      pret_airbnb:p.airbnb?parseInt(p.airbnb):null,
      updated_at:new Date().toISOString()
    },{onConflict:'apartament_id,data_checkin'})
    setSaving(null); show('success','Preț salvat!')
  }

  function updatePret(aptId:string,field:'booking'|'airbnb',val:string){
    setPreturi(prev=>({...prev,[aptId]:{...prev[aptId],[field]:val}}))
  }

  function changeData(data:string){
    setDataSelectata(data); if(!apts.length) return
    supabase.from('preturi_live').select('*').in('apartament_id',apts.map(a=>a.id)).eq('data_checkin',data)
      .then(({data:saved})=>{
        const pm:Record<string,{booking:string,airbnb:string}> = {}
        apts.forEach(a=>{const p=(saved||[]).find((x:any)=>x.apartament_id===a.id)
          pm[a.id]={booking:p?.pret_booking?.toString()||'',airbnb:p?.pret_airbnb?.toString()||''}})
        setPreturi(pm)
      })
  }

  // Polling pe jobId pana vine raspunsul
  function startPolling(jobId: string, checkin: string, checkout: string) {
    let attempts = 0
    const maxAttempts = 40 // 2 minute max
    pollRef.current = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        clearInterval(pollRef.current!)
        setScan({ status: 'error', results: [], errorMsg: 'Timeout — Claude in Chrome nu a răspuns în 2 minute.' })
        return
      }
      const { data } = await supabase.from('booking_monitor_jobs')
        .select('*').eq('id', jobId).single()
      if (data?.status === 'done' && data.results?.length) {
        clearInterval(pollRef.current!)
        setScan({
          status: 'done',
          results: data.results,
          total: data.total_properties,
          lowestPrice: data.lowest_price,
          weAreLowest: data.we_are_lowest,
          ourLowestRank: data.our_lowest_rank,
          checkin, checkout,
          scannedAt: new Date().toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}),
        })
      } else if (data?.status === 'error') {
        clearInterval(pollRef.current!)
        setScan({ status: 'error', results: [], errorMsg: data.error_msg || 'Eroare la scanare.' })
      }
    }, 3000)
  }

  const handleScan = useCallback(async () => {
    if(!checkinMonitor||!checkoutMonitor){show('error','Selectează perioada');return}
    if(pollRef.current) clearInterval(pollRef.current)

    setScan({status:'waiting',results:[],checkin:checkinMonitor,checkout:checkoutMonitor})

    // Creaza job in Supabase
    const { data: job, error } = await supabase.from('booking_monitor_jobs').insert({
      checkin: checkinMonitor,
      checkout: checkoutMonitor,
      status: 'pending',
    }).select().single()

    if (error || !job) {
      setScan({ status: 'error', results: [], errorMsg: 'Nu s-a putut crea job-ul. Verifică Supabase.' })
      return
    }

    jobIdRef.current = job.id

    // Construieste URL-ul Booking
    const bookingUrl = `https://www.booking.com/searchresults.ro.html?ss=Ia%C8%99i%2C+Rom%C3%A2nia&checkin=${checkinMonitor}&checkout=${checkoutMonitor}&group_adults=2&no_rooms=1&order=price`

    // Construieste promptul pentru Claude in Chrome
    // Includem jobId si endpoint-ul pentru ca Claude sa trimita rezultatele direct
    const appUrl = window.location.origin
    const receiveUrl = `${appUrl}/api/booking-scan`

    const prompt = `Navighează la acest URL Booking.com și extrage primele 5 proprietăți listate (sortate după preț):

URL: ${bookingUrl}

Pași:
1. Navighează la URL
2. Așteaptă 3 secunde
3. Închide orice popup/banner
4. Extrage primele 5 proprietăți: numele exact și prețul per noapte în lei
5. Extrage numărul total de proprietăți găsite
6. Trimite rezultatele cu un fetch POST la: ${receiveUrl}

Body-ul POST (JSON exact):
{
  "jobId": "${job.id}",
  "checkin": "${checkinMonitor}",
  "checkout": "${checkoutMonitor}",
  "rawJson": "{\"total\": NUMAR_TOTAL, \"results\": [{\"rank\":1,\"name\":\"Nume\",\"priceText\":\"182 lei\",\"price\":182}, ...]}"
}

IMPORTANT: Trimite fetch-ul POST după ce ai extras datele. Folosește JavaScript în consolă sau direct fetch() din pagină.`

    // Deschide Claude.ai cu promptul pre-completat
    const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
    window.open(claudeUrl, '_blank')

    // Porneste polling
    startPolling(job.id, checkinMonitor, checkoutMonitor)
  }, [checkinMonitor, checkoutMonitor])


  function fmtDT(iso:string) {
    const d = new Date(iso)
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const panel:React.CSSProperties = {
    background:'rgba(214,228,244,0.05)',border:'1px solid rgba(159,215,255,0.1)',
    borderRadius:14,overflow:'hidden',marginBottom:14,
  }
  const inp:React.CSSProperties = {
    width:80,padding:'4px 8px',borderRadius:6,border:'1px solid rgba(100,160,255,0.2)',
    background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',
    fontSize:13,outline:'none',textAlign:'center' as const,fontFamily:'monospace',fontWeight:600,
  }
  const dateInp:React.CSSProperties = {
    padding:'5px 10px',borderRadius:7,fontSize:12,border:'1px solid rgba(100,160,255,0.2)',
    background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',outline:'none',
  }

  return (
    <>
      <PageHeader title="💰 Prețuri live" subtitle="Booking.com & Airbnb"/>
      <div style={{padding:'14px 16px',overflowY:'auto',flex:1}}>

        {/* Selector dată */}
        <div style={{...panel}}>
          <div style={{padding:'12px 16px',display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}}>
            {QUICK.map(({label,val})=>(
              <button key={val} onClick={()=>changeData(val)} style={{
                padding:'5px 12px',borderRadius:7,fontSize:12,cursor:'pointer',
                border:`1px solid ${dataSelectata===val?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.15)'}`,
                background:dataSelectata===val?'rgba(77,163,255,0.15)':'transparent',
                color:dataSelectata===val?'#7BC8FF':'rgba(159,215,255,0.5)',
              }}>{label}</button>
            ))}
            <input type="date" value={dataSelectata} onChange={e=>changeData(e.target.value)} style={{
              padding:'4px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',
              background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'
            }}/>
          </div>
        </div>

        {/* Tabel apartamente */}
        <div style={{...panel}}>
          <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',fontSize:11,
            color:'rgba(159,215,255,0.4)',textTransform:'uppercase' as const,letterSpacing:'.06em'}}>
            Check-in: {dataSelectata} — prețuri manuale
          </div>
          {apts.map((apt,i)=>(
            <div key={apt.id} style={{padding:'10px 16px',
              borderBottom:i<apts.length-1?'1px solid rgba(159,215,255,0.05)':'none',
              display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' as const}}>
              <div style={{display:'flex',alignItems:'center',gap:6,minWidth:60}}>
                <span style={{fontSize:13,fontWeight:600,color:'#E8F4FF'}}>{apt.nota}</span>
                <span style={{fontSize:10}}>{ocupate.has(apt.id)?'🔴':'🟢'}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:10,color:'rgba(77,163,255,0.5)'}}>🏨</span>
                <input type="number" placeholder="RON" value={preturi[apt.id]?.booking||''} onChange={e=>updatePret(apt.id,'booking',e.target.value)} style={inp}/>
                {apt._bk&&<a href={buildUrl(apt._bk,'booking',dataSelectata||today)} target="_blank" rel="noopener" style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(77,163,255,0.3)',color:'#7BC8FF',textDecoration:'none',whiteSpace:'nowrap' as const}}>Bk ↗</a>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:10,color:'rgba(248,113,113,0.5)'}}>🏠</span>
                <input type="number" placeholder="RON" value={preturi[apt.id]?.airbnb||''} onChange={e=>updatePret(apt.id,'airbnb',e.target.value)} style={inp}/>
                {apt._ab&&<a href={buildUrl(apt._ab,'airbnb',dataSelectata||today)} target="_blank" rel="noopener" style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(248,113,113,0.3)',color:'#F87171',textDecoration:'none',whiteSpace:'nowrap' as const}}>Ab ↗</a>}
              </div>
              {preturi[apt.id]?.booking&&preturi[apt.id]?.airbnb&&(
                <div style={{fontSize:11,fontFamily:'monospace',color:parseInt(preturi[apt.id].booking)>parseInt(preturi[apt.id].airbnb)?'#FCD34D':'#4ADE80'}}>
                  {parseInt(preturi[apt.id].booking)>parseInt(preturi[apt.id].airbnb)
                    ?`Bk +${parseInt(preturi[apt.id].booking)-parseInt(preturi[apt.id].airbnb)}`
                    :`Ab +${parseInt(preturi[apt.id].airbnb)-parseInt(preturi[apt.id].booking)}`}
                </div>
              )}
              <button onClick={()=>savePret(apt.id,dataSelectata)} disabled={saving===apt.id} style={{
                marginLeft:'auto',padding:'4px 14px',borderRadius:6,fontSize:11,cursor:'pointer',
                border:'1px solid rgba(74,222,128,0.3)',background:'rgba(74,222,128,0.08)',
                color:'#4ADE80',opacity:saving===apt.id?0.5:1
              }}>{saving===apt.id?'...':'✓ Salvează'}</button>
            </div>
          ))}
        </div>

        {/* BOOKING MONITOR */}
        <div style={{...panel,border:'1px solid rgba(99,179,237,0.2)',background:'rgba(15,30,55,0.6)'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(99,179,237,0.12)',
            display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap' as const,gap:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:16}}>🔍</span>
              <span style={{fontSize:13,fontWeight:700,color:'#93C5FD'}}>Monitorizare Booking</span>
              <span style={{fontSize:10,color:'rgba(147,197,253,0.4)',fontFamily:'monospace'}}>BOOKING + AIRBNB · IAȘI</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {scan.scannedAt&&(
                <span style={{fontSize:10,color:'rgba(147,197,253,0.4)',fontFamily:'monospace'}}>
                  {scan.scannedAt} · {scan.checkin} → {scan.checkout}
                </span>
              )}
              <button onClick={()=>{setShowHistory(h=>{const n=!h;if(n)loadHistory();return n})}} style={{
                padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',
                border:'1px solid rgba(99,179,237,0.2)',
                background:showHistory?'rgba(99,179,237,0.12)':'transparent',
                color:'rgba(147,197,253,0.6)',
              }}>📊 Istoric</button>
            </div>
          </div>

          {/* Info + Reload */}
          <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(99,179,237,0.08)',
            display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap' as const}}>
            <div style={{fontSize:11,color:'rgba(147,197,253,0.45)',display:'flex',alignItems:'center',gap:6}}>
              <span>💻</span>
              <span>Terminal: <code style={{fontFamily:'monospace',background:'rgba(99,179,237,0.08)',padding:'1px 6px',borderRadius:4,color:'#93C5FD'}}>python3 ~/Desktop/booking_scan.py</code></span>
            </div>
            <button onClick={()=>loadHistory()} disabled={loadingHistory} style={{
              padding:'5px 14px',borderRadius:6,fontSize:11,cursor:'pointer',fontWeight:600,
              border:'1px solid rgba(99,179,237,0.3)',background:'rgba(99,179,237,0.1)',color:'#93C5FD',
              opacity:loadingHistory?0.5:1,
            }}>{loadingHistory?'...' :'↺ Reîncarcă'}</button>
          </div>

          {/* Tabs platform */}
          {!loadingHistory&&history.length>0&&(()=>{
            const bookingHistory = history.filter((h:any)=>!h.platform||h.platform==='booking')
            const airbnbHistory  = history.filter((h:any)=>h.platform==='airbnb')
            const lastBooking = bookingHistory[0]
            const lastAirbnb  = airbnbHistory[0]
            return(
              <div>
                {/* Platform tabs */}
                <div style={{display:'flex',borderBottom:'1px solid rgba(99,179,237,0.1)'}}>
                  {[['booking','🏨 Booking'],['airbnb','🏠 Airbnb']].map(([pl,label])=>{
                    const last = pl==='booking' ? lastBooking : lastAirbnb
                    return(
                      <button key={pl} onClick={()=>setPlatformTab(pl as any)} style={{
                        flex:1,padding:'8px 12px',fontSize:12,cursor:'pointer',fontWeight:600,
                        border:'none',borderBottom:`2px solid ${platformTab===pl?'#93C5FD':'transparent'}`,
                        background:'transparent',
                        color:platformTab===pl?'#93C5FD':'rgba(147,197,253,0.4)',
                        display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                      }}>
                        {label}
                        {last&&<span style={{fontSize:10,fontFamily:'monospace',
                          color:last.we_are_lowest?'#4ADE80':'rgba(147,197,253,0.4)',
                          background:'rgba(99,179,237,0.08)',padding:'1px 6px',borderRadius:4}}>
                          {last.lowest_price} {pl==='airbnb'?'RON':'lei'}
                        </span>}
                      </button>
                    )
                  })}
                </div>
                {/* Continut tab */}
                {(()=>{
                  const last = platformTab==='booking' ? lastBooking : lastAirbnb
                  if(!last) return(
                    <div style={{padding:'20px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>
                      Nicio scanare {platformTab} — rulează: <code style={{fontFamily:'monospace',color:'#93C5FD'}}>python3 ~/Desktop/booking_scan.py {checkinMonitor} {checkoutMonitor} {platformTab}</code>
                    </div>
                  )
                  const top = (last.top5||[]) as any[]
                  return(
                    <div>
                      <div style={{
                        padding:'12px 16px',
                        background:last.we_are_lowest?'rgba(74,222,128,0.08)':last.our_lowest_rank?'rgba(252,211,77,0.06)':'rgba(99,179,237,0.04)',
                        borderBottom:'1px solid rgba(99,179,237,0.08)',
                        display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' as const,
                      }}>
                        <span style={{fontSize:20}}>{last.we_are_lowest?'🏆':last.our_lowest_rank?'📍':'👀'}</span>
                        <div style={{flex:1}}>
                          {last.we_are_lowest?(
                            <div style={{fontSize:13,fontWeight:700,color:'#4ADE80'}}>Tu ești cel mai ieftin! 🎉</div>
                          ):last.our_lowest_rank?(
                            <div style={{fontSize:13,fontWeight:700,color:'#FCD34D'}}>
                              Locul #{last.our_lowest_rank} — minim: <span style={{fontFamily:'monospace'}}>{last.lowest_price} lei</span>
                            </div>
                          ):(
                            <div style={{fontSize:13,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>
                              AB Homes nu e în top 10 — minim: <span style={{fontFamily:'monospace'}}>{last.lowest_price} lei</span>
                            </div>
                          )}
                          <div style={{display:'flex',alignItems:'center',gap:10,marginTop:3,flexWrap:'wrap' as const}}>
                            <span style={{fontSize:10,color:'rgba(147,197,253,0.4)'}}>{last.checkin} → {last.checkout}</span>
                            {last.total_properties&&(
                              <span style={{fontSize:11,fontFamily:'monospace',fontWeight:600,
                                color:'rgba(147,197,253,0.7)',background:'rgba(99,179,237,0.1)',
                                padding:'1px 8px',borderRadius:4,border:'1px solid rgba(99,179,237,0.2)'}}>
                                {last.total_properties} proprietăți
                              </span>
                            )}
                            <span style={{fontSize:10,color:'rgba(147,197,253,0.3)',fontFamily:'monospace'}}>
                              {new Date(last.scanned_at).toLocaleString('ro-RO',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                            </span>
                          </div>
                        </div>
                      </div>
                      {top.map((r:any,i:number)=>(
                        <div key={i} style={{
                          padding:'9px 16px',
                          borderBottom:i<top.length-1?'1px solid rgba(99,179,237,0.06)':'none',
                          display:'flex',alignItems:'center',gap:12,
                          background:r.isOurs?'rgba(74,222,128,0.04)':'transparent',
                        }}>
                          <div style={{width:24,height:24,borderRadius:'50%',flexShrink:0,
                            display:'flex',alignItems:'center',justifyContent:'center',
                            fontSize:11,fontWeight:700,fontFamily:'monospace',
                            background:r.rank===1?'rgba(252,211,77,0.15)':'rgba(99,179,237,0.08)',
                            color:r.rank===1?'#FCD34D':'rgba(147,197,253,0.5)',
                            border:`1px solid ${r.rank===1?'rgba(252,211,77,0.3)':'rgba(99,179,237,0.15)'}`}}>
                            {r.rank}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:r.isOurs?700:500,
                              color:r.isOurs?'#4ADE80':'#E8F4FF',
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                              {r.isOurs&&<span style={{marginRight:4}}>⭐</span>}{r.name}
                            </div>
                            {r.isOurs&&r.matchedCode&&(
                              <div style={{fontSize:10,color:'rgba(74,222,128,0.5)',marginTop:1}}>AB Homes · {r.matchedCode}</div>
                            )}
                          </div>
                          <div style={{fontFamily:'monospace',fontSize:13,fontWeight:700,flexShrink:0,
                            color:r.price===last.lowest_price?'#4ADE80':r.isOurs?'#93C5FD':'rgba(214,228,244,0.8)'}}>
                            {r.priceText||`${r.price} lei`}
                            {r.price===last.lowest_price&&<span style={{fontSize:9,marginLeft:4,color:'#4ADE80',verticalAlign:'super'}}>MIN</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {!loadingHistory&&history.length===0&&(
            <div style={{padding:'24px 16px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>
              Nicio scanare — rulează: <code style={{fontFamily:'monospace',color:'rgba(147,197,253,0.5)'}}>python3 ~/Desktop/booking_scan.py</code>
            </div>
          )}
          {loadingHistory&&(
            <div style={{padding:'24px 16px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>Se încarcă...</div>
          )}

          {/* ISTORIC */}
          {false&&(()=>{          {/* ISTORIC */}
          {showHistory&&(
            <div style={{borderTop:'1px solid rgba(99,179,237,0.12)'}}>
              <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(99,179,237,0.08)',
                display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>📊 Istoric scanări</span>
                <button onClick={loadHistory} style={{
                  padding:'3px 10px',borderRadius:5,fontSize:11,cursor:'pointer',
                  border:'1px solid rgba(99,179,237,0.2)',background:'transparent',color:'rgba(147,197,253,0.5)',
                }}>↺</button>
              </div>
              {loadingHistory?(
                <div style={{padding:'16px',textAlign:'center' as const,color:'rgba(147,197,253,0.4)',fontSize:12}}>Se încarcă...</div>
              ):history.length===0?(
                <div style={{padding:'16px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>Nicio scanare încă.</div>
              ):(
                <div>
                  <div style={{display:'grid',gridTemplateColumns:'90px 100px 50px 70px 45px 1fr',
                    padding:'6px 16px',gap:8,fontSize:10,color:'rgba(147,197,253,0.35)',
                    textTransform:'uppercase' as const,letterSpacing:'.05em',
                    borderBottom:'1px solid rgba(99,179,237,0.08)'}}>
                    <span>Data/Oră</span><span>Perioadă</span><span>Total</span><span>Minim</span><span>Loc</span><span>Top 1</span>
                  </div>
                  {history.map((h,i)=>{
                    const top1=h.top5?.[0]
                    return(
                      <div key={h.id} style={{display:'grid',gridTemplateColumns:'90px 100px 50px 70px 45px 1fr',
                        padding:'7px 16px',gap:8,alignItems:'center',
                        borderBottom:i<history.length-1?'1px solid rgba(99,179,237,0.05)':'none',
                        background:h.we_are_lowest?'rgba(74,222,128,0.03)':'transparent'}}>
                        <span style={{fontSize:11,fontFamily:'monospace',color:'rgba(214,228,244,0.6)'}}>{fmtDT(h.scanned_at)}</span>
                        <span style={{fontSize:11,color:'rgba(147,197,253,0.6)'}}>{h.checkin?.slice(5)} → {h.checkout?.slice(5)}</span>
                        <span style={{fontSize:11,fontFamily:'monospace',color:h.total_properties?'rgba(214,228,244,0.8)':'rgba(147,197,253,0.3)'}}>{h.total_properties??'—'}</span>
                        <span style={{fontSize:12,fontFamily:'monospace',fontWeight:600,color:h.we_are_lowest?'#4ADE80':'rgba(214,228,244,0.8)'}}>
                          {h.lowest_price?`${h.lowest_price} lei`:'—'}{h.we_are_lowest&&<span style={{fontSize:9,marginLeft:3,color:'#4ADE80'}}>★</span>}
                        </span>
                        <span style={{fontSize:11,color:h.our_lowest_rank?'#FCD34D':'rgba(147,197,253,0.3)'}}>
                          {h.our_lowest_rank?`#${h.our_lowest_rank}`:'—'}
                        </span>
                        <span style={{fontSize:11,color:'rgba(214,228,244,0.55)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                          {top1?`${top1.name} · ${top1.price} lei`:'—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <Toast toast={toast}/>
    </>
  )
}
