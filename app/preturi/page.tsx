'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'

interface BookingResult {
  rank: number; name: string; price: number; priceText: string
  isOurs: boolean; matchedCode?: string
}
interface ScanState {
  status: 'idle' | 'scanning' | 'done' | 'error'
  results: BookingResult[]
  total?: number; lowestPrice?: number; weAreLowest?: boolean
  ourLowestRank?: number; scannedAt?: string
  checkin?: string; checkout?: string; errorMsg?: string
}

const OUR = ['ab homes','abhomes','ab-homes','ex59','gs08','hd02','l83','l88','l94','l99','n32','n33','nt9','vm07','c64','cg40']

function parsePrice(text: string): number {
  return parseInt(text.replace(/\./g, '').replace(/[^\d]/g, '')) || 0
}

function extractFromHtml(html: string): { total: number; results: any[] } {
  // Total proprietati
  let total = 0
  const tm = html.match(/au fost găsite?\s*(\d+)\s*proprietăț/i) ||
             html.match(/(\d+)\s*proprietăț.*găsite?/i) ||
             html.match(/found\s+(\d+)\s+propert/i) ||
             html.match(/"nbresults":(\d+)/) ||
             html.match(/data-results-count="(\d+)"/)
  if (tm) total = parseInt(tm[1])

  const results: any[] = []

  // Metoda 1: data-testid="property-card"
  const cardRx = /data-testid="property-card"([\s\S]*?)(?=data-testid="property-card"|id="sr_pagination|<\/main)/g
  let m
  while ((m = cardRx.exec(html)) !== null && results.length < 5) {
    const b = m[1]
    const nm = b.match(/data-testid="title"[^>]*>([^<]+)</) ||
               b.match(/class="[^"]*f6431b446c[^"]*"[^>]*>([^<]+)</) ||
               b.match(/class="[^"]*fcab3ed991[^"]*"[^>]*>([^<]+)</)
    // Pret: cauta pretul curent (nu cel barat/original)
    const pm = b.match(/data-testid="price-and-discounted-price"[^>]*>[\s\S]{0,200}?([\d]+\.?[\d]*)\s*lei/) ||
               b.match(/class="[^"]*f894d5f9dc[^"]*"[^>]*>[\s\S]{0,100}?([\d]+)\s*<\//) ||
               b.match(/"displayedPrice":"([\d]+)"/) ||
               b.match(/priceBreakdown[\s\S]{0,300}?"amount":([\d.]+)/)
    if (nm && pm) {
      const name = nm[1].replace(/&amp;/g,'&').replace(/&#\d+;/g,'').trim()
      const price = parsePrice(pm[1])
      if (name && price > 50 && price < 10000 && !results.find(r => r.name === name)) {
        results.push({ rank: results.length + 1, name, price, priceText: `${price} lei` })
      }
    }
  }

  // Metoda 2: fallback text
  if (results.length < 3) {
    const lines = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#\d+;/g,'')
      .split('\n').map(l => l.trim()).filter(Boolean)

    const seen = new Set(results.map(r => r.name))
    const fallback: any[] = []

    for (let i = 0; i < lines.length && fallback.length < 5; i++) {
      const priceM = lines[i].match(/^(\d[\d.]*)\s*lei$/) ||
                     lines[i].match(/Preț actual\s+([\d.]+)\s*lei/)
      if (!priceM) continue
      const price = parsePrice(priceM[1])
      if (price < 50 || price > 10000) continue

      let name = ''
      for (let j = i - 1; j >= Math.max(0, i - 25); j--) {
        const c = lines[j]
        if (c.length < 6 || c.length > 120 || /^\d/.test(c)) continue
        if (/^(Iaşi|Iași|Arată|Include|Anulare|Rezerv|Camere|Preț|Nou pe|Vizib|Aceast|Studio întreg|Apart întreg|Cameră|Dormitor|noapte|Se deschide|Locaţie|Superb|Fabulos|Bine|Excep|Plăcut|Scor|Suită|Hostel|Pensiune|Proprietate admin)/i.test(c)) continue
        if (c.includes('km de centru') || c.includes('m de centru') || c.includes('evaluări') || c.includes('paturi') || c.includes('baie') || c.includes('bucătărie')) continue
        name = c; break
      }
      if (name && !seen.has(name)) {
        seen.add(name)
        fallback.push({ rank: 0, name, price, priceText: `${price} lei` })
      }
    }

    const combined = [...results, ...fallback]
      .sort((a, b) => a.price - b.price)
      .slice(0, 5)
      .map((r, i) => ({ ...r, rank: i + 1 }))
    return { total, results: combined }
  }

  return { total, results: results.slice(0, 5) }
}

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
  }, [])

  async function loadOcupate(data:string, ids:string[]) {
    const {data:rez} = await supabase.from('rezervari').select('apartament_id')
      .lte('data_checkin',data).gt('data_checkout',data).neq('status_rezervare','anulata').in('apartament_id',ids)
    setOcupate(new Set((rez||[]).map((r:any)=>r.apartament_id)))
  }

  function buildUrl(baseUrl:string, platform:string, checkin:string) {
    if(!checkin) checkin=today; if(!baseUrl) return ''
    const coD = new Date(checkin+'T12:00:00'); coD.setDate(coD.getDate()+1)
    const co = fmt(coD)
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
      apartament_id:aptId, data_checkin:checkin,
      pret_booking:p.booking?parseInt(p.booking):null,
      pret_airbnb:p.airbnb?parseInt(p.airbnb):null,
      updated_at:new Date().toISOString()
    },{onConflict:'apartament_id,data_checkin'})
    setSaving(null); show('success','Preț salvat!')
  }

  function updatePret(aptId:string, field:'booking'|'airbnb', val:string) {
    setPreturi(prev=>({...prev,[aptId]:{...prev[aptId],[field]:val}}))
  }

  function changeData(data:string) {
    setDataSelectata(data); if(!apts.length) return
    supabase.from('preturi_live').select('*').in('apartament_id',apts.map(a=>a.id)).eq('data_checkin',data)
      .then(({data:saved})=>{
        const pm:Record<string,{booking:string,airbnb:string}> = {}
        apts.forEach(a=>{const p=(saved||[]).find((x:any)=>x.apartament_id===a.id)
          pm[a.id]={booking:p?.pret_booking?.toString()||'',airbnb:p?.pret_airbnb?.toString()||''}})
        setPreturi(pm)
      })
  }

  // ── SCAN CLIENT-SIDE din browser ─────────────────────────────────────────
  const handleScan = useCallback(async () => {
    if(!checkinMonitor||!checkoutMonitor){show('error','Selectează perioada');return}
    setScan({status:'scanning',results:[],checkin:checkinMonitor,checkout:checkoutMonitor})

    try {
      const bookingUrl = `https://www.booking.com/searchresults.ro.html?ss=Ia%C8%99i%2C+Rom%C3%A2nia&checkin=${checkinMonitor}&checkout=${checkoutMonitor}&group_adults=2&no_rooms=1&order=price`

      // Fetch direct din browser — evita blocarea server-side
      const proxyUrl = `/api/fivestar?url=${encodeURIComponent(bookingUrl)}`
      let html = ''

      try {
        // Incearca prin proxy-ul existent /api/fivestar
        const r1 = await fetch(proxyUrl)
        if (r1.ok) {
          const text = await r1.text()
          // Daca proxy returneaza JSON cu html, extrage
          try { const j = JSON.parse(text); html = j.html || j.data || text } catch { html = text }
        }
      } catch {}

      // Daca proxy-ul nu merge, fetch direct (CORS poate bloca, dar incercam)
      if (!html || html.length < 1000) {
        try {
          const r2 = await fetch(bookingUrl, { headers: { 'Accept-Language': 'ro-RO' } })
          if (r2.ok) html = await r2.text()
        } catch {}
      }

      if (!html || html.length < 500) {
        throw new Error('Nu s-a putut accesa Booking.com. Verifică conexiunea sau încearcă din nou.')
      }

      const { total, results } = extractFromHtml(html)

      if (results.length === 0) {
        throw new Error('Nu s-au găsit proprietăți. Booking.com poate fi temporar indisponibil.')
      }

      const enriched: BookingResult[] = results.map(r => {
        const lower = r.name.toLowerCase()
        const match = OUR.find(id => lower.includes(id))
        return { ...r, isOurs: !!match, matchedCode: match?.toUpperCase() }
      })

      const lowestPrice = Math.min(...enriched.map(r => r.price))
      const ourResults = enriched.filter(r => r.isOurs)
      const weAreLowest = ourResults.some(r => r.price === lowestPrice)
      const ourLowestRank = ourResults.length ? Math.min(...ourResults.map(r => r.rank)) : undefined

      setScan({
        status:'done', results:enriched, total, lowestPrice, weAreLowest, ourLowestRank,
        checkin:checkinMonitor, checkout:checkoutMonitor,
        scannedAt:new Date().toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'}),
      })

      // Salveaza in Supabase prin API route
      fetch('/api/booking-scan', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ checkin:checkinMonitor, checkout:checkoutMonitor, results:enriched, total, lowestPrice, weAreLowest, ourLowestRank: ourLowestRank||null })
      }).catch(()=>{}) // fire and forget

    } catch(err:any) {
      setScan({status:'error',results:[],errorMsg:err.message||'Eroare necunoscută',checkin:checkinMonitor,checkout:checkoutMonitor})
    }
  },[checkinMonitor,checkoutMonitor])

  async function loadHistory() {
    setLoadingHistory(true)
    const {data} = await supabase.from('booking_monitor_history')
      .select('*').order('scanned_at',{ascending:false}).limit(50)
    setHistory(data||[])
    setLoadingHistory(false)
  }

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

          {/* Header */}
          <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(99,179,237,0.12)',
            display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap' as const,gap:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:16}}>🔍</span>
              <span style={{fontSize:13,fontWeight:700,color:'#93C5FD'}}>Monitorizare Booking</span>
              <span style={{fontSize:10,color:'rgba(147,197,253,0.4)',fontFamily:'monospace'}}>TOP 5 · IAȘI</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {scan.scannedAt&&(
                <span style={{fontSize:10,color:'rgba(147,197,253,0.4)',fontFamily:'monospace'}}>
                  {scan.scannedAt} · {scan.checkin} → {scan.checkout}
                </span>
              )}
              <button onClick={()=>{setShowHistory(h=>{const next=!h;if(next)loadHistory();return next})}} style={{
                padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',
                border:'1px solid rgba(99,179,237,0.2)',
                background:showHistory?'rgba(99,179,237,0.12)':'transparent',
                color:'rgba(147,197,253,0.6)',
              }}>📊 Istoric</button>
            </div>
          </div>

          {/* Controls */}
          <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:10,
            flexWrap:'wrap' as const,borderBottom:'1px solid rgba(99,179,237,0.08)'}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>Check-in</span>
              <input type="date" value={checkinMonitor} onChange={e=>{
                setCheckinMonitor(e.target.value)
                const d=new Date(e.target.value+'T12:00:00');d.setDate(d.getDate()+1);setCheckoutMonitor(fmt(d))
              }} style={dateInp}/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>Check-out</span>
              <input type="date" value={checkoutMonitor} onChange={e=>setCheckoutMonitor(e.target.value)} style={dateInp}/>
            </div>
            <button onClick={handleScan} disabled={scan.status==='scanning'} style={{
              marginLeft:'auto',padding:'7px 18px',borderRadius:8,fontSize:12,
              cursor:scan.status==='scanning'?'wait':'pointer',
              border:'1px solid rgba(99,179,237,0.4)',
              background:scan.status==='scanning'?'rgba(99,179,237,0.05)':'rgba(99,179,237,0.15)',
              color:'#93C5FD',fontWeight:700,opacity:scan.status==='scanning'?0.7:1,
              display:'flex',alignItems:'center',gap:6,
            }}>
              {scan.status==='scanning'?<>⏳ Se scanează...</>:'🔍 Caută pe Booking'}
            </button>
          </div>

          {/* Scanning */}
          {scan.status==='scanning'&&(
            <div style={{padding:'20px 16px',textAlign:'center' as const}}>
              <div style={{fontSize:22,marginBottom:8}}>🔍</div>
              <div style={{fontSize:13,color:'#93C5FD',fontWeight:600,marginBottom:4}}>Se caută pe Booking.com...</div>
              <div style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>{checkinMonitor} → {checkoutMonitor} · 2 adulți · sortat după preț</div>
            </div>
          )}

          {/* Error */}
          {scan.status==='error'&&(
            <div style={{padding:'14px 16px',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:16}}>⚠️</span>
              <div style={{flex:1}}>
                <div style={{fontSize:12,color:'#F87171',fontWeight:600}}>{scan.errorMsg}</div>
                <div style={{fontSize:11,color:'rgba(248,113,113,0.5)',marginTop:2}}>
                  Booking.com poate bloca accesul automat. Încearcă din nou peste câteva secunde.
                </div>
              </div>
              <button onClick={()=>setScan({status:'idle',results:[]})} style={{
                padding:'4px 12px',borderRadius:6,fontSize:11,cursor:'pointer',
                border:'1px solid rgba(248,113,113,0.2)',background:'transparent',color:'rgba(248,113,113,0.5)',
              }}>✕</button>
            </div>
          )}

          {/* Results */}
          {scan.status==='done'&&scan.results.length>0&&(
            <div>
              <div style={{
                padding:'12px 16px',
                background:scan.weAreLowest?'rgba(74,222,128,0.08)':scan.ourLowestRank?'rgba(252,211,77,0.06)':'rgba(99,179,237,0.04)',
                borderBottom:'1px solid rgba(99,179,237,0.08)',
                display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' as const,
              }}>
                <span style={{fontSize:20}}>{scan.weAreLowest?'🏆':scan.ourLowestRank?'📍':'👀'}</span>
                <div style={{flex:1}}>
                  {scan.weAreLowest?(
                    <div style={{fontSize:13,fontWeight:700,color:'#4ADE80'}}>Tu ești cel mai ieftin din piață! 🎉</div>
                  ):scan.ourLowestRank?(
                    <div style={{fontSize:13,fontWeight:700,color:'#FCD34D'}}>
                      Ești pe locul #{scan.ourLowestRank} — minim piață: <span style={{fontFamily:'monospace'}}>{scan.lowestPrice} lei</span>
                    </div>
                  ):(
                    <div style={{fontSize:13,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>
                      AB Homes nu e în top 5 — minim piață: <span style={{fontFamily:'monospace'}}>{scan.lowestPrice} lei</span>
                    </div>
                  )}
                  <div style={{display:'flex',alignItems:'center',gap:12,marginTop:3}}>
                    <span style={{fontSize:10,color:'rgba(147,197,253,0.4)'}}>
                      {scan.checkin} → {scan.checkout} · sortat după preț
                    </span>
                    {!!scan.total&&(
                      <span style={{fontSize:11,fontFamily:'monospace',fontWeight:600,
                        color:'rgba(147,197,253,0.7)',background:'rgba(99,179,237,0.1)',
                        padding:'1px 8px',borderRadius:4,border:'1px solid rgba(99,179,237,0.2)'}}>
                        {scan.total} proprietăți disponibile
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={handleScan} style={{
                  padding:'5px 14px',borderRadius:6,fontSize:11,cursor:'pointer',
                  border:'1px solid rgba(99,179,237,0.25)',background:'rgba(99,179,237,0.08)',color:'rgba(147,197,253,0.7)',
                }}>↺ Rescanează</button>
              </div>

              {scan.results.map((r,i)=>(
                <div key={i} style={{
                  padding:'10px 16px',
                  borderBottom:i<scan.results.length-1?'1px solid rgba(99,179,237,0.06)':'none',
                  display:'flex',alignItems:'center',gap:12,
                  background:r.isOurs?'rgba(74,222,128,0.04)':'transparent',
                }}>
                  <div style={{
                    width:26,height:26,borderRadius:'50%',flexShrink:0,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:11,fontWeight:700,fontFamily:'monospace',
                    background:r.rank===1?'rgba(252,211,77,0.15)':'rgba(99,179,237,0.08)',
                    color:r.rank===1?'#FCD34D':'rgba(147,197,253,0.5)',
                    border:`1px solid ${r.rank===1?'rgba(252,211,77,0.3)':'rgba(99,179,237,0.15)'}`,
                  }}>{r.rank}</div>
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
                  <div style={{fontFamily:'monospace',fontSize:14,fontWeight:700,flexShrink:0,
                    color:r.price===scan.lowestPrice?'#4ADE80':r.isOurs?'#93C5FD':'rgba(214,228,244,0.8)'}}>
                    {r.priceText}
                    {r.price===scan.lowestPrice&&<span style={{fontSize:9,marginLeft:4,color:'#4ADE80',verticalAlign:'super'}}>MIN</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {scan.status==='idle'&&(
            <div style={{padding:'20px 16px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>
              Apasă "Caută pe Booking" — extrage automat top 5 din Iași sortate după preț
            </div>
          )}

          {/* ISTORIC */}
          {showHistory&&(
            <div style={{borderTop:'1px solid rgba(99,179,237,0.12)'}}>
              <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(99,179,237,0.08)',
                display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>📊 Istoric scanări</span>
                <button onClick={loadHistory} style={{
                  padding:'3px 10px',borderRadius:5,fontSize:11,cursor:'pointer',
                  border:'1px solid rgba(99,179,237,0.2)',background:'transparent',color:'rgba(147,197,253,0.5)',
                }}>↺ Reîncarcă</button>
              </div>
              {loadingHistory?(
                <div style={{padding:'16px',textAlign:'center' as const,color:'rgba(147,197,253,0.4)',fontSize:12}}>Se încarcă...</div>
              ):history.length===0?(
                <div style={{padding:'16px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>Nicio scanare salvată încă.</div>
              ):(
                <div style={{overflowX:'auto' as const}}>
                  <div style={{
                    display:'grid',gridTemplateColumns:'90px 110px 55px 70px 45px 1fr',
                    padding:'6px 16px',gap:8,
                    fontSize:10,color:'rgba(147,197,253,0.35)',textTransform:'uppercase' as const,letterSpacing:'.05em',
                    borderBottom:'1px solid rgba(99,179,237,0.08)',
                  }}>
                    <span>Data/Oră</span><span>Perioadă</span><span>Total</span><span>Minim</span><span>Loc</span><span>Top 1</span>
                  </div>
                  {history.map((h,i)=>{
                    const top1 = h.top5?.[0]
                    return (
                      <div key={h.id} style={{
                        display:'grid',gridTemplateColumns:'90px 110px 55px 70px 45px 1fr',
                        padding:'7px 16px',gap:8,alignItems:'center',
                        borderBottom:i<history.length-1?'1px solid rgba(99,179,237,0.05)':'none',
                        background:h.we_are_lowest?'rgba(74,222,128,0.03)':'transparent',
                      }}>
                        <span style={{fontSize:11,fontFamily:'monospace',color:'rgba(214,228,244,0.6)'}}>{fmtDT(h.scanned_at)}</span>
                        <span style={{fontSize:11,color:'rgba(147,197,253,0.6)'}}>{h.checkin?.slice(5)} → {h.checkout?.slice(5)}</span>
                        <span style={{fontSize:11,fontFamily:'monospace',color:h.total_properties?'rgba(214,228,244,0.8)':'rgba(147,197,253,0.3)'}}>{h.total_properties??'—'}</span>
                        <span style={{fontSize:12,fontFamily:'monospace',fontWeight:600,color:h.we_are_lowest?'#4ADE80':'rgba(214,228,244,0.8)'}}>
                          {h.lowest_price?`${h.lowest_price} lei`:'—'}
                          {h.we_are_lowest&&<span style={{fontSize:9,marginLeft:3,color:'#4ADE80'}}>★</span>}
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
