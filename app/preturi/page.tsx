'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
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

interface MarketComparison {
  previous: any | null
  totalDelta: number | null
  lowestDelta: number | null
  entered: any[]
  exited: any[]
  moved: { result: any; from: number; to: number }[]
}

const normalizedListingName = (name:string) => (name||'').toLocaleLowerCase('ro-RO')
  .replace(/,?\s*\d[\d.]*\s*(?:l\s*)?ron\b/g,'')
  .replace(/\s+/g,' ').trim()

function compareMarketScans(current:any, previous:any|null):MarketComparison {
  if(!previous) return {previous:null,totalDelta:null,lowestDelta:null,entered:[],exited:[],moved:[]}
  const currentTop = (current?.top5||[]) as any[]
  const previousTop = (previous?.top5||[]) as any[]
  const currentMap = new Map(currentTop.map(r=>[normalizedListingName(r.name),r]))
  const previousMap = new Map(previousTop.map(r=>[normalizedListingName(r.name),r]))
  return {
    previous,
    totalDelta: current.total_properties!=null&&previous.total_properties!=null
      ? current.total_properties-previous.total_properties : null,
    lowestDelta: current.lowest_price!=null&&previous.lowest_price!=null
      ? current.lowest_price-previous.lowest_price : null,
    entered: currentTop.filter(r=>!previousMap.has(normalizedListingName(r.name))),
    exited: previousTop.filter(r=>!currentMap.has(normalizedListingName(r.name))),
    moved: currentTop.flatMap(r=>{
      const old=previousMap.get(normalizedListingName(r.name))
      return old&&old.rank!==r.rank?[{result:r,from:old.rank,to:r.rank}]:[]
    }),
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export default function PreturiPage() {
  const [apts, setApts] = useState<any[]>([])
  const [preturi, setPreturi] = useState<Record<string,{booking:string,airbnb:string}>>({})
  const [dataSelectata, setDataSelectata] = useState('')
  const [dataCheckout, setDataCheckout] = useState('')
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
  const [mainTab, setMainTab] = useState<'preturi'|'monitor'|'evolutie'>('preturi')
  const [evolutieData, setEvolutieData] = useState<any[]>([])
  const [loadingEvolutie, setLoadingEvolutie] = useState(false)
  const [compareDate1, setCompareDate1] = useState('')
  const [compareDate2, setCompareDate2] = useState('')
  const [expandedScan, setExpandedScan] = useState<string|null>(null)
  const [commandCopied, setCommandCopied] = useState(false)
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

  async function loadEvolutie() {
    setLoadingEvolutie(true)
    const { data } = await supabase.from('booking_monitor_history')
      .select('*').order('checkin', { ascending: true }).limit(2000)
    setEvolutieData(data || [])
    setLoadingEvolutie(false)
  }

  async function loadHistory(selectLatestPeriod = false) {
    setLoadingHistory(true)
    const {data} = await supabase.from('booking_monitor_history')
      .select('*').order('scanned_at',{ascending:false}).limit(1000)
    const rows = data||[]
    setHistory(rows)
    if(selectLatestPeriod&&rows[0]?.checkin&&rows[0]?.checkout){
      setCheckinMonitor(rows[0].checkin)
      setCheckoutMonitor(rows[0].checkout)
    }
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
        const _co=new Date(today+'T12:00:00');_co.setDate(_co.getDate()+1);setDataCheckout(fmt(_co))
        loadOcupate(today, list.map((a:any)=>a.id))
        const {data:saved} = await supabase.from('preturi_live')
          .select('*').in('apartament_id',list.map((a:any)=>a.id)).eq('data_checkin',today)
        const map:Record<string,any> = {}
        ;(saved||[]).forEach((p:any)=>{map[p.apartament_id]=p})
        const pm:Record<string,{booking:string,airbnb:string}> = {}
        list.forEach((a:any)=>{pm[a.id]={booking:map[a.id]?.pret_booking?.toString()||'',airbnb:map[a.id]?.pret_airbnb?.toString()||''}})
        setPreturi(pm)
      })
    loadHistory(true)
    loadEvolutie()
    return () => { if(pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function loadOcupate(data:string, ids:string[]) {
    const {data:rez} = await supabase.from('rezervari').select('apartament_id')
      .lte('data_checkin',data).gt('data_checkout',data).neq('status_rezervare','anulata').in('apartament_id',ids)
    setOcupate(new Set((rez||[]).map((r:any)=>r.apartament_id)))
  }

  function buildUrl(baseUrl:string, platform:string, checkin:string, checkout?:string) {
    if(!checkin) checkin=today; if(!baseUrl) return ''
    const co = checkout||(() => { const d=new Date(checkin+'T12:00:00');d.setDate(d.getDate()+1);return fmt(d) })()
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
    setDataSelectata(data)
    const _d=new Date(data+'T12:00:00');_d.setDate(_d.getDate()+1);setDataCheckout(fmt(_d))
    if(!apts.length) return
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

  async function copyScanCommand() {
    const command = `python3 ~/Desktop/booking_scan.py ${checkinMonitor} ${checkoutMonitor}`
    try {
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(command)
      }else{
        throw new Error('Clipboard API indisponibil')
      }
    } catch {
      const textarea=document.createElement('textarea')
      textarea.value=command
      textarea.style.position='fixed'
      textarea.style.opacity='0'
      document.body.appendChild(textarea)
      textarea.select()
      const copied=document.execCommand('copy')
      textarea.remove()
      if(!copied){show('error','Nu s-a putut copia comanda');return}
    }
    try {
      setCommandCopied(true)
      show('success','Comanda Python a fost copiată')
      setTimeout(()=>setCommandCopied(false),1600)
    } catch {}
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
      <div style={{display:'flex',gap:0,borderBottom:'1px solid rgba(159,215,255,0.1)',background:'rgba(10,20,40,0.5)'}}>
        {(['preturi','monitor','evolutie'] as const).map((tab)=>{
          const labels:Record<string,string> = {preturi:'💰 Prețuri',monitor:'🔍 Monitor',evolutie:'📈 Evoluție'}
          return(
            <button key={tab} onClick={()=>setMainTab(tab)} style={{
              padding:'10px 18px',fontSize:12,fontWeight:600,cursor:'pointer',
              border:'none',borderBottom:`2px solid ${mainTab===tab?'#7BC8FF':'transparent'}`,
              background:'transparent',color:mainTab===tab?'#7BC8FF':'rgba(159,215,255,0.4)',
            }}>{labels[tab]}</button>
          )
        })}
      </div>
      <div style={{padding:'14px 16px',overflowY:'auto',flex:1}}>

        {mainTab==='preturi'&&(<>
        <div style={{...panel}}>
          <div style={{padding:'10px 16px 6px',display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}}>
            {QUICK.map(({label,val})=>(
              <button key={val} onClick={()=>changeData(val)} style={{
                padding:'5px 12px',borderRadius:7,fontSize:12,cursor:'pointer',
                border:`1px solid ${dataSelectata===val?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.15)'}`,
                background:dataSelectata===val?'rgba(77,163,255,0.15)':'transparent',
                color:dataSelectata===val?'#7BC8FF':'rgba(159,215,255,0.5)',
              }}>{label}</button>
            ))}
          </div>
          <div style={{padding:'4px 16px 12px',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap' as const}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'rgba(159,215,255,0.45)'}}>Check-in</span>
              <input type="date" value={dataSelectata} onChange={e=>changeData(e.target.value)} style={{
                padding:'4px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',
                background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'
              }}/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'rgba(159,215,255,0.45)'}}>Check-out</span>
              <input type="date" value={dataCheckout} min={dataSelectata}
                onChange={e=>setDataCheckout(e.target.value)} style={{
                padding:'4px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',
                background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'
              }}/>
            </div>
            {dataCheckout&&dataSelectata&&(()=>{
              const nopti=Math.round((new Date(dataCheckout+'T12:00:00').getTime()-new Date(dataSelectata+'T12:00:00').getTime())/86400000)
              return nopti>0?<span style={{fontSize:11,color:'rgba(147,197,253,0.5)',fontFamily:'monospace',background:'rgba(99,179,237,0.08)',padding:'3px 8px',borderRadius:5}}>{nopti} {nopti===1?'noapte':'nopți'}</span>:null
            })()}
          </div>
        </div>

        {/* Tabel apartamente */}
        <div style={{...panel}}>
          <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',fontSize:11,
            color:'rgba(159,215,255,0.4)',textTransform:'uppercase' as const,letterSpacing:'.06em'}}>
            {dataSelectata} → {dataCheckout||'?'} — prețuri manuale
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
                {apt._bk&&<a href={buildUrl(apt._bk,'booking',dataSelectata||today,dataCheckout)} target="_blank" rel="noopener" style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(77,163,255,0.3)',color:'#7BC8FF',textDecoration:'none',whiteSpace:'nowrap' as const}}>Bk ↗</a>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:10,color:'rgba(248,113,113,0.5)'}}>🏠</span>
                <input type="number" placeholder="RON" value={preturi[apt.id]?.airbnb||''} onChange={e=>updatePret(apt.id,'airbnb',e.target.value)} style={inp}/>
                {apt._ab&&<a href={buildUrl(apt._ab,'airbnb',dataSelectata||today,dataCheckout)} target="_blank" rel="noopener" style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(248,113,113,0.3)',color:'#F87171',textDecoration:'none',whiteSpace:'nowrap' as const}}>Ab ↗</a>}
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

        </>) /* end preturi */}
        {mainTab==='monitor'&&<div style={{...panel,border:'1px solid rgba(99,179,237,0.2)',background:'rgba(15,30,55,0.6)'}}>

          {/* Header */}
          <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(99,179,237,0.12)',
            display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap' as const,gap:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:16}}>🔍</span>
              <span style={{fontSize:13,fontWeight:700,color:'#93C5FD'}}>Monitorizare piață</span>
              <span style={{fontSize:10,color:'rgba(147,197,253,0.4)',fontFamily:'monospace'}}>BOOKING + AIRBNB · IAȘI</span>
            </div>
            <button onClick={()=>loadHistory(true)} disabled={loadingHistory} style={{
              padding:'5px 14px',borderRadius:6,fontSize:11,cursor:'pointer',fontWeight:600,
              border:'1px solid rgba(99,179,237,0.3)',background:'rgba(99,179,237,0.1)',color:'#93C5FD',
              opacity:loadingHistory?0.5:1,
            }}>{loadingHistory?'...':'↺ Ultima rulare'}</button>
          </div>

          {/* Selector date + comanda terminal */}
          <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(99,179,237,0.08)',
            display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' as const}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>Check-in</span>
              <input type="date" value={checkinMonitor} onChange={e=>{
                setCheckinMonitor(e.target.value)
                const d=new Date(e.target.value+'T12:00:00');d.setDate(d.getDate()+1);setCheckoutMonitor(fmt(d))
              }} style={{padding:'4px 8px',borderRadius:6,fontSize:12,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',outline:'none'}}/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>Check-out</span>
              <input type="date" value={checkoutMonitor} onChange={e=>setCheckoutMonitor(e.target.value)}
                style={{padding:'4px 8px',borderRadius:6,fontSize:12,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',outline:'none'}}/>
            </div>
            <div style={{marginLeft:'auto',fontSize:11,color:'rgba(147,197,253,0.4)',display:'flex',alignItems:'center',gap:4}}>
              <span>💻</span>
              <code style={{fontFamily:'monospace',background:'rgba(99,179,237,0.08)',padding:'2px 8px',borderRadius:4,color:'#93C5FD',fontSize:10}}>
                python3 ~/Desktop/booking_scan.py {checkinMonitor} {checkoutMonitor}
              </code>
              <button onClick={copyScanCommand} disabled={!checkinMonitor||!checkoutMonitor} style={{
                padding:'3px 8px',borderRadius:5,fontSize:10,cursor:'pointer',fontWeight:600,
                border:`1px solid ${commandCopied?'rgba(74,222,128,0.35)':'rgba(99,179,237,0.25)'}`,
                background:commandCopied?'rgba(74,222,128,0.1)':'rgba(99,179,237,0.08)',
                color:commandCopied?'#4ADE80':'#93C5FD',
                opacity:!checkinMonitor||!checkoutMonitor?0.45:1,
              }}>{commandCopied?'✓ Copiat!':'📋 Copiază'}</button>
            </div>
          </div>

          {/* View paralel Booking + Airbnb */}
          {loadingHistory?(
            <div style={{padding:'24px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>Se încarcă...</div>
          ):history.length===0?(
            <div style={{padding:'24px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>
              Nicio scanare — rulează scriptul din Terminal
            </div>
          ):(()=>{
            // Filtreaza dupa datele selectate (sau ia ultimele daca nu exista pt datele selectate)
            const bkAll = history.filter((h:any)=>!h.platform||h.platform==='booking')
            const abAll = history.filter((h:any)=>h.platform==='airbnb')
            const bkMatch = bkAll.find((h:any)=>h.checkin===checkinMonitor&&h.checkout===checkoutMonitor)
            const abMatch = abAll.find((h:any)=>h.checkin===checkinMonitor&&h.checkout===checkoutMonitor)
            const lastBk = bkMatch || bkAll[0]
            const lastAb = abMatch || abAll[0]
            const previousFor = (last:any, scans:any[]) => last
              ? scans.find((h:any)=>h.id!==last.id&&h.checkin===last.checkin&&h.checkout===last.checkout)
              : null
            const bkComparison = compareMarketScans(lastBk,previousFor(lastBk,bkAll))
            const abComparison = compareMarketScans(lastAb,previousFor(lastAb,abAll))

            const renderSummary = (last:any, platform:string, comparison:MarketComparison) => {
              if(!last) return null
              const icon=platform==='booking'?'🏨':'🏠'
              const now=fmtDT(last.scanned_at)
              const previous=comparison.previous
              if(!previous) return(
                <div style={{padding:'10px 14px',borderBottom:'1px solid rgba(99,179,237,0.06)',fontSize:11,color:'rgba(214,228,244,0.65)'}}>
                  {icon} La {now} au fost scanate <strong style={{color:'#E8F4FF'}}>{last.total_properties??'?'}</strong> locații. Aceasta este prima scanare comparabilă pentru perioada {last.checkin} → {last.checkout}.
                </div>
              )
              const previousTime=fmtDT(previous.scanned_at)
              const delta=comparison.totalDelta
              const marketText=delta==null
                ? 'Numărul total nu poate fi comparat.'
                : delta<0
                  ? `${Math.abs(delta)} locații au devenit indisponibile între timp (posibil rezervate sau retrase).`
                  : delta>0
                    ? `${delta} locații au devenit disponibile între timp.`
                    : 'Numărul locațiilor disponibile a rămas neschimbat.'
              const priceText=comparison.lowestDelta==null
                ? ''
                : comparison.lowestDelta===0
                  ? ' Prețul minim a rămas neschimbat.'
                  : ` Prețul minim a ${comparison.lowestDelta>0?'crescut':'scăzut'} cu ${Math.abs(comparison.lowestDelta)} lei.`
              return(
                <div style={{padding:'10px 14px',borderBottom:'1px solid rgba(99,179,237,0.06)',fontSize:11,color:'rgba(214,228,244,0.68)',lineHeight:1.55}}>
                  <strong style={{color:platform==='booking'?'#7BC8FF':'#F87171'}}>{icon} {platform==='booking'?'Booking':'Airbnb'}:</strong>{' '}
                  la {previousTime} erau <strong>{previous.total_properties??'?'}</strong> locații, iar la {now} sunt <strong>{last.total_properties??'?'}</strong>. {marketText}{priceText}
                  {(comparison.entered.length>0||comparison.exited.length>0)&&(
                    <span style={{color:'rgba(147,197,253,0.5)'}}> Top 10: {comparison.entered.length} intrate, {comparison.exited.length} ieșite.</span>
                  )}
                </div>
              )
            }

            const renderPlatform = (last:any, platform:string, comparison:MarketComparison) => {
              if(!last) return(
                <div style={{padding:'16px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:11}}>
                  Nicio scanare {platform}
                </div>
              )
              const top = (last.top5||[]) as any[]
              const enteredNames = new Set(comparison.entered.map(r=>normalizedListingName(r.name)))
              const icon = platform==='booking'?'🏨':'🏠'
              const dateMatch = last.checkin===checkinMonitor&&last.checkout===checkoutMonitor
              return(
                <div>
                  {/* Platform header */}
                  <div style={{padding:'8px 14px',background:'rgba(99,179,237,0.06)',
                    borderBottom:'1px solid rgba(99,179,237,0.08)',
                    display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontSize:12,fontWeight:700,color:'#93C5FD'}}>{icon} {platform.charAt(0).toUpperCase()+platform.slice(1)}</span>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      {!dateMatch&&(
                        <span style={{fontSize:10,color:'rgba(252,211,77,0.5)',fontStyle:'italic'}}>
                          ultima: {last.checkin}
                        </span>
                      )}
                      <span style={{fontSize:10,fontFamily:'monospace',color:'rgba(147,197,253,0.35)'}}>
                        {new Date(last.scanned_at).toLocaleString('ro-RO',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                      </span>
                    </div>
                  </div>
                  {/* Status banner */}
                  <div style={{padding:'10px 14px',
                    background:last.we_are_lowest?'rgba(74,222,128,0.07)':last.our_lowest_rank?'rgba(252,211,77,0.05)':'transparent',
                    borderBottom:'1px solid rgba(99,179,237,0.06)',
                    display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:16}}>{last.we_are_lowest?'🏆':last.our_lowest_rank?'📍':'👀'}</span>
                    <div style={{flex:1}}>
                      {last.we_are_lowest?(
                        <div style={{fontSize:12,fontWeight:700,color:'#4ADE80'}}>Cel mai ieftin! 🎉</div>
                      ):last.our_lowest_rank?(
                        <div style={{fontSize:12,fontWeight:600,color:'#FCD34D'}}>Locul #{last.our_lowest_rank} — min: {last.lowest_price} lei</div>
                      ):(
                        <div style={{fontSize:12,color:'rgba(147,197,253,0.6)'}}>Nu ești în top 10 — min: <span style={{fontFamily:'monospace',fontWeight:700}}>{last.lowest_price} lei</span></div>
                      )}
                      {last.total_properties&&(
                        <span style={{fontSize:10,color:'rgba(147,197,253,0.4)',fontFamily:'monospace'}}>{last.total_properties} proprietăți disponibile</span>
                      )}
                    </div>
                  </div>
                  {/* Top 10 */}
                  {top.map((r:any,i:number)=>(
                    <div key={i} style={{
                      padding:'7px 14px',display:'flex',alignItems:'center',gap:10,
                      borderBottom:i<top.length-1?'1px solid rgba(99,179,237,0.05)':'none',
                      background:r.isOurs?'rgba(74,222,128,0.03)':'transparent',
                    }}>
                      <div style={{width:22,height:22,borderRadius:'50%',flexShrink:0,
                        display:'flex',alignItems:'center',justifyContent:'center',
                        fontSize:10,fontWeight:700,fontFamily:'monospace',
                        background:r.rank===1?'rgba(252,211,77,0.15)':'rgba(99,179,237,0.07)',
                        color:r.rank===1?'#FCD34D':'rgba(147,197,253,0.45)',
                        border:`1px solid ${r.rank===1?'rgba(252,211,77,0.3)':'rgba(99,179,237,0.12)'}`}}>
                        {r.rank}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:r.isOurs?700:400,
                          color:r.isOurs?'#4ADE80':'rgba(214,228,244,0.8)',
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                          {r.isOurs&&<span style={{marginRight:4}}>⭐</span>}{r.name}
                          {enteredNames.has(normalizedListingName(r.name))&&<span style={{fontSize:8,marginLeft:5,color:'#4ADE80'}}>NOU ÎN TOP</span>}
                        </div>
                      </div>
                      <div style={{fontFamily:'monospace',fontSize:12,fontWeight:700,flexShrink:0,
                        color:r.price===last.lowest_price?'#4ADE80':r.isOurs?'#93C5FD':'rgba(214,228,244,0.7)'}}>
                        {r.priceText||`${r.price} lei`}
                        {r.price===last.lowest_price&&<span style={{fontSize:8,marginLeft:3,color:'#4ADE80',verticalAlign:'super'}}>MIN</span>}
                      </div>
                    </div>
                  ))}
                  {comparison.exited.length>0&&(
                    <div style={{padding:'8px 14px',borderTop:'1px solid rgba(248,113,113,0.12)',background:'rgba(248,113,113,0.025)'}}>
                      <div style={{fontSize:9,color:'rgba(248,113,113,0.55)',textTransform:'uppercase' as const,letterSpacing:'.05em',marginBottom:4}}>Au ieșit din top 10 de la scanarea precedentă</div>
                      {comparison.exited.map((r:any)=>(
                        <div key={`${r.rank}-${r.name}`} style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:9,color:'rgba(214,228,244,0.38)',padding:'1px 0'}}>
                          <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>fost #{r.rank} · {r.name}</span>
                          <span style={{fontFamily:'monospace',flexShrink:0}}>{r.price} lei</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {comparison.moved.length>0&&(
                    <div style={{padding:'6px 14px',borderTop:'1px solid rgba(99,179,237,0.06)',fontSize:9,color:'rgba(147,197,253,0.38)'}}>
                      Mișcări în top: {comparison.moved.slice(0,5).map(m=>`${m.result.name}: #${m.from}→#${m.to}`).join(' · ')}
                    </div>
                  )}
                </div>
              )
            }

            return(
              <div>
                <div style={{borderBottom:'1px solid rgba(99,179,237,0.1)',background:'rgba(99,179,237,0.025)'}}>
                  <div style={{padding:'8px 14px',fontSize:10,fontWeight:700,color:'rgba(147,197,253,0.5)',textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Confirmare scrisă față de scanarea precedentă</div>
                  {renderSummary(lastBk,'booking',bkComparison)}
                  {renderSummary(lastAb,'airbnb',abComparison)}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
                  <div style={{borderRight:'1px solid rgba(99,179,237,0.1)'}}>
                    {renderPlatform(lastBk,'booking',bkComparison)}
                  </div>
                  <div>
                    {renderPlatform(lastAb,'airbnb',abComparison)}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Istoric */}
          {history.length>0&&(
            <div style={{borderTop:'1px solid rgba(99,179,237,0.1)'}}>
              <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(99,179,237,0.08)',
                display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:11,fontWeight:600,color:'rgba(147,197,253,0.6)'}}>📊 Istoric scanări</span>
                <span style={{fontSize:10,color:'rgba(147,197,253,0.3)'}}>{history.length} înregistrări</span>
              </div>
              <div style={{overflowX:'auto' as const}}>
                <div style={{display:'grid',gridTemplateColumns:'70px 80px 110px 75px 45px 70px 1fr',
                  padding:'5px 14px',fontSize:10,color:'rgba(147,197,253,0.3)',
                  textTransform:'uppercase' as const,letterSpacing:'.04em',
                  borderBottom:'1px solid rgba(99,179,237,0.06)'}}>
                  <span>Oră</span><span>Platform</span><span>Perioadă</span><span>Total</span><span>Loc</span><span>Minim</span><span>Top 1</span>
                </div>
                {history.slice(0,30).map((h:any,i:number)=>{
                  const top1=(h.top5||[])[0]
                  const pad=(n:number)=>String(n).padStart(2,'0')
                  const d=new Date(h.scanned_at)
                  const dt=`${pad(d.getDate())}.${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
                  return(
                    <div key={h.id} style={{display:'grid',gridTemplateColumns:'70px 80px 110px 75px 45px 70px 1fr',
                      padding:'6px 14px',borderBottom:'1px solid rgba(99,179,237,0.04)',alignItems:'center',
                      background:h.we_are_lowest?'rgba(74,222,128,0.02)':'transparent'}}>
                      <span style={{fontSize:10,fontFamily:'monospace',color:'rgba(214,228,244,0.5)'}}>{dt}</span>
                      <span style={{fontSize:10,color:h.platform==='airbnb'?'#F87171':'#7BC8FF',fontWeight:600}}>
                        {h.platform==='airbnb'?'🏠 Airbnb':'🏨 Booking'}
                      </span>
                      <span style={{fontSize:10,color:'rgba(147,197,253,0.5)'}}>{h.checkin?.slice(5)} → {h.checkout?.slice(5)}</span>
                      <span style={{fontSize:10,fontFamily:'monospace',color:'rgba(214,228,244,0.6)'}}>{h.total_properties??'—'}</span>
                      <span style={{fontSize:10,color:h.our_lowest_rank?'#FCD34D':'rgba(147,197,253,0.3)'}}>
                        {h.our_lowest_rank?`#${h.our_lowest_rank}`:'—'}
                      </span>
                      <span style={{fontSize:11,fontFamily:'monospace',fontWeight:600,
                        color:h.we_are_lowest?'#4ADE80':'rgba(214,228,244,0.7)'}}>
                        {h.lowest_price??'—'}{h.lowest_price?' lei':''}
                        {h.we_are_lowest&&<span style={{fontSize:9,marginLeft:2,color:'#4ADE80'}}>★</span>}
                      </span>
                      <span style={{fontSize:10,color:'rgba(214,228,244,0.45)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                        {top1?`${top1.name} · ${top1.price} lei`:'—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>}{/* end monitor */}

        {mainTab==='evolutie'&&(()=>{
          const bkData = evolutieData.filter((h:any)=>!h.platform||h.platform==='booking')
          const abData = evolutieData.filter((h:any)=>h.platform==='airbnb')
          const allDates = Array.from(new Set(evolutieData.map((h:any)=>h.checkin))).sort() as string[]
          const chartData = allDates.map(d=>{
            const bk = bkData.filter((h:any)=>h.checkin===d).sort((a:any,b:any)=>new Date(b.scanned_at).getTime()-new Date(a.scanned_at).getTime())[0]
            const ab = abData.filter((h:any)=>h.checkin===d).sort((a:any,b:any)=>new Date(b.scanned_at).getTime()-new Date(a.scanned_at).getTime())[0]
            return { date:d.slice(5), checkin:d, booking:bk?.lowest_price||null, airbnb:ab?.lowest_price||null, bkTotal:bk?.total_properties||null, abTotal:ab?.total_properties||null }
          })
          const scan1bk = bkData.find((h:any)=>h.checkin===compareDate1)
          const scan1ab = abData.find((h:any)=>h.checkin===compareDate1)
          const scan2bk = bkData.find((h:any)=>h.checkin===compareDate2)
          const scan2ab = abData.find((h:any)=>h.checkin===compareDate2)

          return loadingEvolutie?(
            <div style={{padding:'40px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)'}}>Se încarcă...</div>
          ):evolutieData.length===0?(
            <div style={{padding:'40px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>
              Nicio scanare — rulează: <code style={{color:'#93C5FD'}}>python3 ~/Desktop/booking_scan.py --zile 7</code>
            </div>
          ):(
            <div>
              {/* Grafic */}
              <div style={{...panel,marginBottom:14}}>
                <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>📈 Evoluție preț minim (lei/noapte)</span>
                  <button onClick={()=>loadEvolutie()} style={{padding:'3px 10px',borderRadius:5,fontSize:11,cursor:'pointer',border:'1px solid rgba(99,179,237,0.2)',background:'transparent',color:'rgba(147,197,253,0.5)'}}>↺</button>
                </div>
                <div style={{padding:'16px',height:240}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{top:4,right:16,left:0,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.1)"/>
                      <XAxis dataKey="date" tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={36}/>
                      <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}}
                        labelStyle={{color:'#93C5FD',fontWeight:600}}
                        formatter={(v:any,n:any)=>[`${v} lei`,n==='booking'?'🏨 Booking':'🏠 Airbnb'] as [string,string]}/>
                      <Legend formatter={(v:any)=>v==='booking'?'🏨 Booking':'🏠 Airbnb'} wrapperStyle={{fontSize:11}}/>
                      <Line type="monotone" dataKey="booking" stroke="#7BC8FF" strokeWidth={2} dot={{fill:'#7BC8FF',r:3}} connectNulls/>
                      <Line type="monotone" dataKey="airbnb" stroke="#F87171" strokeWidth={2} dot={{fill:'#F87171',r:3}} connectNulls/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grafic nr proprietati disponibile */}
              <div style={{...panel,marginBottom:14}}>
                <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)'}}>
                  <span style={{fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>🏙️ Proprietăți disponibile în Iași pe zi</span>
                </div>
                <div style={{padding:'16px',height:200}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{top:4,right:16,left:0,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.1)"/>
                      <XAxis dataKey="date" tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                      <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}}
                        labelStyle={{color:'#93C5FD',fontWeight:600}}
                        formatter={(v:any,n:any)=>[`${v} proprietăți`,n==='bkTotal'?'🏨 Booking':'🏠 Airbnb'] as [string,string]}/>
                      <Legend formatter={(v:any)=>v==='bkTotal'?'🏨 Booking':'🏠 Airbnb'} wrapperStyle={{fontSize:11}}/>
                      <Line type="monotone" dataKey="bkTotal" stroke="#7BC8FF" strokeWidth={2} dot={{fill:'#7BC8FF',r:3}} connectNulls strokeDasharray="4 2"/>
                      <Line type="monotone" dataKey="abTotal" stroke="#F87171" strokeWidth={2} dot={{fill:'#F87171',r:3}} connectNulls strokeDasharray="4 2"/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Comparatie */}
              <div style={{...panel,marginBottom:14}}>
                <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)'}}>
                  <span style={{fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>⚖️ Comparație între 2 date</span>
                </div>
                <div style={{padding:'12px 16px',display:'flex',gap:10,alignItems:'center',borderBottom:'1px solid rgba(159,215,255,0.06)',flexWrap:'wrap' as const}}>
                  {(['1','2'] as const).map(n=>(
                    <div key={n} style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>Data {n}</span>
                      <select value={n==='1'?compareDate1:compareDate2} onChange={e=>n==='1'?setCompareDate1(e.target.value):setCompareDate2(e.target.value)}
                        style={{padding:'4px 8px',borderRadius:6,fontSize:12,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',outline:'none'}}>
                        <option value="">— alege —</option>
                        {allDates.map(d=><option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {compareDate1&&compareDate2&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>
                    {([{date:compareDate1,bk:scan1bk,ab:scan1ab},{date:compareDate2,bk:scan2bk,ab:scan2ab}] as any[]).map(({date,bk,ab},ci:number)=>(
                      <div key={ci} style={{padding:'12px 16px',borderRight:ci===0?'1px solid rgba(159,215,255,0.08)':'none'}}>
                        <div style={{fontSize:12,fontWeight:700,color:'#93C5FD',marginBottom:10,fontFamily:'monospace'}}>{date}</div>
                        {([['🏨 Booking',bk],['🏠 Airbnb',ab]] as any[]).map(([lbl,scan]:any,pi:number)=>(
                          <div key={pi} style={{marginBottom:10}}>
                            <div style={{fontSize:11,color:'rgba(147,197,253,0.5)',marginBottom:4}}>{lbl}</div>
                            {scan?(
                              <>
                                <div style={{fontSize:13,fontWeight:700,color:'#4ADE80',fontFamily:'monospace'}}>{scan.lowest_price} lei min</div>
                                <div style={{fontSize:10,color:'rgba(147,197,253,0.4)',marginBottom:4}}>{scan.total_properties} proprietăți</div>
                                {(scan.top5||[]).slice(0,5).map((r:any,i:number)=>(
                                  <div key={i} style={{fontSize:10,color:r.isOurs?'#4ADE80':'rgba(214,228,244,0.6)',display:'flex',justifyContent:'space-between',marginTop:2}}>
                                    <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,maxWidth:'72%'}}>{r.isOurs?'⭐':''}{r.rank}. {r.name}</span>
                                    <span style={{fontFamily:'monospace',flexShrink:0,marginLeft:4}}>{r.price} lei</span>
                                  </div>
                                ))}
                              </>
                            ):(
                              <div style={{fontSize:11,color:'rgba(147,197,253,0.3)'}}>Fără date</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tabel detaliat */}
              <div style={{...panel}}>
                <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)'}}>
                  <span style={{fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>📋 Detaliat — click pe zi pentru top 10</span>
                </div>
                {allDates.map((d:string)=>{
                  const bk=bkData.filter((h:any)=>h.checkin===d).sort((a:any,b:any)=>new Date(b.scanned_at).getTime()-new Date(a.scanned_at).getTime())[0]
                  const ab=abData.filter((h:any)=>h.checkin===d).sort((a:any,b:any)=>new Date(b.scanned_at).getTime()-new Date(a.scanned_at).getTime())[0]
                  const exp=expandedScan===d
                  return(
                    <div key={d} style={{borderBottom:'1px solid rgba(159,215,255,0.06)'}}>
                      <div onClick={()=>setExpandedScan(exp?null:d)} style={{padding:'9px 16px',cursor:'pointer',
                        display:'flex',alignItems:'center',gap:12,flexWrap:'wrap' as const,
                        background:exp?'rgba(99,179,237,0.05)':'transparent'}}>
                        <span style={{fontSize:12,fontWeight:600,color:'#E8F4FF',fontFamily:'monospace',minWidth:52}}>{d.slice(5)}</span>
                        {bk&&<div style={{display:'flex',alignItems:'center',gap:4}}>
                          <span style={{fontSize:10,color:'rgba(77,163,255,0.5)'}}>🏨</span>
                          <span style={{fontSize:12,fontFamily:'monospace',fontWeight:600,color:bk.we_are_lowest?'#4ADE80':'rgba(214,228,244,0.8)'}}>{bk.lowest_price}</span>
                          {bk.total_properties&&<span style={{fontSize:10,color:'rgba(147,197,253,0.35)'}}>/{bk.total_properties}</span>}
                          {bk.we_are_lowest&&<span style={{fontSize:9,color:'#4ADE80'}}>★</span>}
                        </div>}
                        {ab&&<div style={{display:'flex',alignItems:'center',gap:4}}>
                          <span style={{fontSize:10,color:'rgba(248,113,113,0.5)'}}>🏠</span>
                          <span style={{fontSize:12,fontFamily:'monospace',fontWeight:600,color:ab.we_are_lowest?'#4ADE80':'rgba(214,228,244,0.8)'}}>{ab.lowest_price}</span>
                          {ab.total_properties&&<span style={{fontSize:10,color:'rgba(147,197,253,0.35)'}}>/{ab.total_properties}</span>}
                          {ab.we_are_lowest&&<span style={{fontSize:9,color:'#4ADE80'}}>★</span>}
                        </div>}
                        {bk?.ab_disponibile!=null&&<span style={{fontSize:10,color:'rgba(147,197,253,0.35)',marginLeft:'auto'}}>🏠{bk.ab_disponibile}/13</span>}
                        <span style={{fontSize:11,color:'rgba(147,197,253,0.25)',marginLeft:bk?.ab_disponibile!=null?0:'auto'}}>{exp?'▲':'▼'}</span>
                      </div>
                      {exp&&(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',background:'rgba(10,20,40,0.3)',
                          borderTop:'1px solid rgba(99,179,237,0.08)'}}>
                          {([['🏨 Booking',bk],['🏠 Airbnb',ab]] as any[]).map(([lbl,scan]:any,ci:number)=>(
                            <div key={ci} style={{padding:'10px 14px',borderRight:ci===0?'1px solid rgba(99,179,237,0.08)':'none'}}>
                              <div style={{fontSize:11,fontWeight:600,color:'rgba(147,197,253,0.5)',marginBottom:6}}>{lbl}</div>
                              {scan?(scan.top5||[]).map((r:any,i:number)=>(
                                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',
                                  borderBottom:'1px solid rgba(99,179,237,0.04)'}}>
                                  <span style={{fontSize:10,color:r.isOurs?'#4ADE80':'rgba(214,228,244,0.65)',
                                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,maxWidth:'76%'}}>
                                    <span style={{color:'rgba(147,197,253,0.3)',fontSize:9,marginRight:3}}>{r.rank}.</span>
                                    {r.isOurs&&'⭐'}{r.name}
                                  </span>
                                  <span style={{fontSize:10,fontFamily:'monospace',flexShrink:0,marginLeft:4,
                                    color:r.price===scan.lowest_price?'#4ADE80':'rgba(214,228,244,0.6)'}}>{r.price}</span>
                                </div>
                              )):<div style={{fontSize:10,color:'rgba(147,197,253,0.3)'}}>Fără date</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

      </div>
      <Toast toast={toast}/>
    </>
  )
}
