'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts'
import { supabase, LUNI } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'

// disponibil_booking/disponibil_airbnb nu existau inainte de migrarea recenta — un rand scanat
// atunci are pretul real completat, dar flagul explicit ramane null (coloana nu exista la vremea
// aceea). Fara acest fallback, toate scanarile vechi (majoritatea preturilor deja afisate) ar
// arata gri (nescanat), desi evident au fost gasite disponibile — pretul e chiar acolo.
function inferDisp(disp: boolean|null|undefined, pret: number|null|undefined): boolean|null {
  if(disp===true||disp===false) return disp
  if(pret) return true
  return null
}

// Ziua săptămânii, prescurtat — cerut direct, sub butoanele rapide și Check-in/Check-out (ex.
// "Poimâine" nu spune ce zi e; acum apare "mar." dedesubt, mic, ca la restul aplicației).
function weekdayShort(dateStr: string): string {
  if(!dateStr) return ''
  return new Date(dateStr+'T12:00:00').toLocaleDateString('ro-RO',{weekday:'short'})
}

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
  replacements: { exited: any; entered: any }[]
}

interface MarketTransition {
  platform: 'booking'|'airbnb'
  checkin: string
  hour: number
  hoursElapsed: number
  unavailablePerHour: number
  priceDeltaPerHour: number
}

const avg = (values:number[]) => values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : 0
const median = (values:number[]) => {
  if(!values.length) return 0
  const sorted=[...values].sort((a,b)=>a-b)
  const middle=Math.floor(sorted.length/2)
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2
}
const scanTime = (scan:any) => new Date(scan.scanned_at).getTime()
const scanPlatform = (scan:any):'booking'|'airbnb' => scan.platform==='airbnb'?'airbnb':'booking'
const scanDay = (scan:any) => {
  const date=new Date(scan.scanned_at)
  const pad=(value:number)=>String(value).padStart(2,'0')
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`
}

function buildMarketTransitions(scans:any[]):MarketTransition[] {
  const groups=new Map<string,any[]>()
  scans.forEach(scan=>{
    const key=`${scanPlatform(scan)}|${scan.checkin}|${scan.checkout}`
    groups.set(key,[...(groups.get(key)||[]),scan])
  })
  return Array.from(groups.values()).flatMap(group=>{
    const sorted=group.sort((a,b)=>scanTime(a)-scanTime(b))
    return sorted.slice(1).flatMap((current,index)=>{
      const previous=sorted[index]
      if(current.total_properties==null||previous.total_properties==null) return []
      const hoursElapsed=(scanTime(current)-scanTime(previous))/3600000
      if(hoursElapsed<0.15||hoursElapsed>12) return []
      return [{
        platform:scanPlatform(current),
        checkin:current.checkin,
        hour:new Date(current.scanned_at).getHours(),
        hoursElapsed,
        unavailablePerHour:(previous.total_properties-current.total_properties)/hoursElapsed,
        priceDeltaPerHour:current.lowest_price!=null&&previous.lowest_price!=null
          ? (current.lowest_price-previous.lowest_price)/hoursElapsed : 0,
      }]
    })
  })
}

const exactListingName = (name:string) => (name||'').toLocaleLowerCase('ro-RO').replace(/\s+/g,' ').trim()
const baseListingName = (name:string) => exactListingName(name)
  .replace(/,?\s*\d[\d.]*\s*(?:l\s*)?ron\b/g,'')
  .replace(/\s+/g,' ').trim()
const isGenericListingName = (name:string) => /^(apartament|locuință|cazare)( în|$)/.test(baseListingName(name))

function compareMarketScans(current:any, previous:any|null):MarketComparison {
  if(!previous) return {previous:null,totalDelta:null,lowestDelta:null,entered:[],exited:[],moved:[],replacements:[]}
  const currentTop = (current?.top5||[]) as any[]
  const previousTop = (previous?.top5||[]) as any[]
  const unmatchedPrevious = [...previousTop]
  const matched = currentTop.flatMap(result=>{
    let index=unmatchedPrevious.findIndex(old=>exactListingName(old.name)===exactListingName(result.name))
    if(index===-1&&!isGenericListingName(result.name)){
      index=unmatchedPrevious.findIndex(old=>!isGenericListingName(old.name)&&baseListingName(old.name)===baseListingName(result.name))
    }
    if(index===-1) return []
    const old=unmatchedPrevious.splice(index,1)[0]
    return [{result,old}]
  })
  const matchedCurrent = new Set(matched.map(({result})=>result))
  const entered = currentTop.filter(result=>!matchedCurrent.has(result))
  const exited = unmatchedPrevious
  return {
    previous,
    totalDelta: current.total_properties!=null&&previous.total_properties!=null
      ? current.total_properties-previous.total_properties : null,
    lowestDelta: current.lowest_price!=null&&previous.lowest_price!=null
      ? current.lowest_price-previous.lowest_price : null,
    entered,
    exited,
    moved: matched.filter(({result,old})=>old.rank!==result.rank)
      .map(({result,old})=>({result,from:old.rank,to:result.rank})),
    replacements: Array.from({length:Math.max(entered.length,exited.length)},(_,i)=>({
      exited:exited[i],
      entered:entered[i],
    })).filter(pair=>pair.exited||pair.entered),
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Reține tab-ul și setările din Calendar între vizite (localStorage) — cerut direct, ca pagina
// să rămână unde ai lucrat ultima dată, nu să revină mereu la starea implicită. Citit sincron, cu
// inițializator "lazy" pe fiecare useState (nu într-un efect după montare), ca să nu apară un
// flash vizibil cu starea implicită înainte de a se restaura cea salvată.
const PRETURI_STATE_KEY = 'apartpro_preturi_state'
function loadPersistedPreturiState(): Record<string,string> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(PRETURI_STATE_KEY) || '{}') } catch { return {} }
}

export default function PreturiPage() {
  const [apts, setApts] = useState<any[]>([])
  // dispBooking/dispAirbnb: undefined = niciodata scanat, true = disponibil confirmat, false =
  // indisponibil confirmat — distinctia conteaza (cerut direct: "daca apare disponibil pe booking,
  // sa apara cu verde, daca apare indisponibil pe airbnb, sa arate rosu"), altfel pretul gol arata
  // identic in ambele cazuri (niciodata scanat vs. scanat si confirmat indisponibil).
  const [preturi, setPreturi] = useState<Record<string,{booking:string,airbnb:string,dispBooking?:boolean|null,dispAirbnb?:boolean|null}>>({})
  const [dataSelectata, setDataSelectata] = useState('')
  const [dataCheckout, setDataCheckout] = useState('')
  const [saving, setSaving] = useState<string|null>(null)
  // Scanare automata (2 adulti) declansata din butonul ▶ per rand, tab Preturi — scrie direct
  // in preturi_live prin acelasi script/ApartScan.app ca la Calendar, doar pentru 1 zi/1 apartament.
  // Polling scurt dupa declansare, ca pretul sa apara si sa ramana salvat fara alt pas manual.
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set())
  const quickScanPollRef = useRef<any>(null)
  const quickScanStartRef = useRef<Record<string,number>>({})
  const { toast, show } = useToast()

  const [checkinMonitor, setCheckinMonitor] = useState('')
  const [checkoutMonitor, setCheckoutMonitor] = useState('')
  const [scanDayMonitor, setScanDayMonitor] = useState('')
  const [scan, setScan] = useState<ScanState>({ status: 'idle', results: [] })
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [platformTab, setPlatformTab] = useState<'booking'|'airbnb'>('booking')
  // Implicit 'preturi' la primul randare (identic pe server si client, ca sa nu pice hidratarea —
  // localStorage nu exista pe server). Valoarea salvata se aplica separat, intr-un efect after-mount.
  const [mainTab, setMainTab] = useState<'preturi'|'monitor'|'decizii'|'evolutie'|'strategie'|'calendar'>('preturi')
  const [evolutieData, setEvolutieData] = useState<any[]>([])
  const [loadingEvolutie, setLoadingEvolutie] = useState(false)
  const [compareDate1, setCompareDate1] = useState('')
  const [compareDate2, setCompareDate2] = useState('')
  const [expandedScan, setExpandedScan] = useState<string|null>(null)
  const [commandCopied, setCommandCopied] = useState(false)
  const [extraPairs, setExtraPairs] = useState<{ci: string, co: string}[]>([])
  const pollRef = useRef<NodeJS.Timeout|null>(null)
  const jobIdRef = useRef<string|null>(null)
  // Bug real prins la testare: loadHistory(true) (apelat la montare) alege ASINCRON ultima
  // perioadă scanată și suprascrie checkin/checkout — dacă rezolvă DUPĂ efectul de restaurare a
  // stării salvate, îl anula silentios. Flag-ul asta, setat sincron in efectul de restaurare,
  // spune lui loadHistory sa NU mai suprascrie o data deja restaurata din vizita anterioara.
  const restoredMonitorDatesRef = useRef(false)

  // --- TAB STRATEGIE ---
  const [stratRezervari, setStratRezervari] = useState<any[]>([])
  const [loadingStrat, setLoadingStrat] = useState(false)
  const [stratLoaded, setStratLoaded] = useState(false)
  const [stratSection, setStratSection] = useState<'perfsez'|'evolpiata'|'patternorar'|'sezonpiata'|'reguli'>('perfsez')
  const [sortCol, setSortCol] = useState('luna')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')
  const [stratAptFilter, setStratAptFilter] = useState('')
  const [reguli, setReguli] = useState<any[]>([])
  const [showFormRegula, setShowFormRegula] = useState(false)
  const [editingRegula, setEditingRegula] = useState<any|null>(null)
  const [regulaForm, setRegulaForm] = useState({
    apartament_id:'', denumire:'', tip:'weekend' as 'weekend'|'sezon'|'avans'|'ocupare',
    luna_start:'6', luna_end:'8', zile_inainte_max:'3', ocupare_min:'80',
    ajustare_tip:'procent' as 'procent'|'fix', ajustare_valoare:'', prioritate:'0', activ:true
  })
  const [savingRegula, setSavingRegula] = useState(false)
  const [deletingRegula, setDeletingRegula] = useState<string|null>(null)
  const [stratEvolCheckin, setStratEvolCheckin] = useState('')
  const [stratEvolCheckout, setStratEvolCheckout] = useState('')
  const [stratPatternZi, setStratPatternZi] = useState('')
  const [stratPatternLuna, setStratPatternLuna] = useState('')

  // ── Calendar preturi (tab nou) — un apartament (sau o locatie extra), o luna intreaga,
  // Booking + Airbnb per zi. Scanarea propriu-zisa NU se face din server (Booking/Airbnb
  // blocheaza fetch simplu, la fel ca restul sistemului de preturi) — se face din Terminal, cu
  // script Playwright (~/Desktop/apartment_price_scan.py). Pornit automat prin ApartScan.app
  // (handler local de URL "apartscan://", instalat o singura data) — butonul deschide link-ul,
  // macOS porneste aplicatia, aplicatia deschide Terminal cu comanda deja completata si pornita.
  // Aici doar citim/afisam ce a scris deja scriptul in preturi_live / preturi_extra_live.
  // Toate implicit "goale"/standard la prima randare (identic server+client) — valorile salvate
  // din vizita anterioară se aplică separat, într-un efect after-mount (vezi mai jos), ca să nu
  // pice hidratarea React (localStorage nu există pe server).
  const [calApt, setCalApt] = useState('') // "apt:<id>" sau "extra:<id>"
  const [calMonth, setCalMonth] = useState('')
  const [calGuests, setCalGuests] = useState('2')
  const [calScope, setCalScope] = useState<'zi'|'saptamana'|'luna'>('luna') // domeniul SCANARII, separat de luna afisata in grila
  const [calScopeDate, setCalScopeDate] = useState('') // ziua-ancora pentru scope 'zi'/'saptamana'
  const [calWho, setCalWho] = useState<'un-apartament'|'toate'>('toate') // la scope zi/saptamana: un singur apartament ales, sau toate deodata
  // Nivelul al doilea de chei (oaspeti, ca string) — la fel ca la compareData, mai multe scanari
  // ale aceleiasi luni cu numar diferit de oaspeti raman vizibile in paralel, nu se suprascriu.
  const [calData, setCalData] = useState<Record<string,Record<string,{booking?:number|null,airbnb?:number|null,bookingOrig?:number|null,updatedAt?:string}>>>({})
  const [loadingCal, setLoadingCal] = useState(false)
  const [calCommandCopied, setCalCommandCopied] = useState(false)
  const [extraLocations, setExtraLocations] = useState<{id:string,nume:string,link_booking?:string,link_airbnb?:string}[]>([])
  const [showAddExtra, setShowAddExtra] = useState(false)
  const [extraForm, setExtraForm] = useState({nume:'',linkBooking:'',linkAirbnb:''})
  const [savingExtra, setSavingExtra] = useState(false)
  // Compară toate apartamentele (scope Zi/Săptămână) — un rând per apartament, completat live
  // pe măsură ce scanarea din Terminal avansează, prin polling simplu pe preturi_live (scriptul
  // scrie progresiv, per apartament+zi+platformă, exact ce face live-ul posibil fără alt mecanism).
  // Nivelul al treilea de chei (oaspeti, ca string) — o scanare cu alt numar de oaspeti pentru
  // aceeasi zi nu mai suprascrie ce era deja gasit, raman ambele, afisate in paralel in tabel.
  const [compareData, setCompareData] = useState<Record<string,Record<string,Record<string,{booking?:number|null,airbnb?:number|null}>>>>({})
  const [comparePolling, setComparePolling] = useState(false)
  const comparePollRef = useRef<any>(null)
  // Disponibilitate REALĂ (rezervările noastre, nu ce arată Booking/Airbnb la scanare) — cerut
  // direct, ca să recomande ce apartamente sunt chiar libere pentru perioada aleasă.
  const [occupancyRez, setOccupancyRez] = useState<{apartament_id:string,data_checkin:string,data_checkout:string}[]>([])
  const calSource: 'apt'|'extra' = calApt.startsWith('extra:') ? 'extra' : 'apt'
  const calId = calApt.includes(':') ? calApt.split(':')[1] : calApt

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
    try{
      const { data } = await supabase.from('booking_monitor_history')
        .select('*').order('scanned_at', { ascending: false }).limit(2000)
      setEvolutieData(data || [])
    }catch(err){console.error('[preturi loadEvolutie]',err)}
    setLoadingEvolutie(false)
  }

  async function loadReguli() {
    try{
      const { data } = await supabase.from('reguli_preturi').select('*').order('prioritate',{ascending:true})
      setReguli(data || [])
    }catch(err){console.error('[preturi loadReguli]',err)}
  }

  async function loadStrategie() {
    setLoadingStrat(true)
    try{
      const ago12 = new Date(); ago12.setMonth(ago12.getMonth()-12)
      const dateStart = fmt(ago12)
      const { data: rez } = await supabase.from('rezervari')
        .select('apartament_id,data_checkin,data_checkout,nr_nopti,suma_incasata,status_rezervare')
        .gte('data_checkin', dateStart).neq('status_rezervare','anulata')
        .order('data_checkin',{ascending:true})
      setStratRezervari(rez || [])
      setStratLoaded(true)
    }catch(err){console.error('[preturi loadStrategie]',err)}
    setLoadingStrat(false)
  }

  async function loadHistory(selectLatestPeriod = false) {
    setLoadingHistory(true)
    try{
      const {data} = await supabase.from('booking_monitor_history')
        .select('*').order('scanned_at',{ascending:false}).limit(1000)
      const rows = data||[]
      setHistory(rows)
      if(selectLatestPeriod&&!restoredMonitorDatesRef.current&&rows[0]?.checkin&&rows[0]?.checkout){
        setCheckinMonitor(rows[0].checkin)
        setCheckoutMonitor(rows[0].checkout)
        setScanDayMonitor(scanDay(rows[0]))
      }
    }catch(err){console.error('[preturi loadHistory]',err)}
    setLoadingHistory(false)
  }

  useEffect(() => {
    const ci = add(1)
    const d = new Date(ci+'T12:00:00'); d.setDate(d.getDate()+1)
    setCheckinMonitor(ci); setCheckoutMonitor(fmt(d))
    setScanDayMonitor(today)
    Promise.resolve(supabase.from('apartamente')
      .select('id,nota,pret_standard,link_booking,link_airbnb,booking_links,airbnb_links')
      .eq('status','activ').order('nota'))
      .then(async ({ data }) => {
        const list = (data||[]).map((apt:any) => {
          const bks = (apt.booking_links||[]).filter((l:string)=>l?.includes('booking.com'))
          const abs = (apt.airbnb_links||[]).filter((l:string)=>l?.includes('airbnb.'))
          const bk = bks[0]||(apt.link_booking?.includes('booking.com')?apt.link_booking:null)
          const ab = apt.link_airbnb?.includes('airbnb.')?apt.link_airbnb:abs[0]||null
          return {...apt,_bk:bk,_ab:ab}
        }).filter((a:any)=>a._bk||a._ab)
        setApts(list)
        // functional update — daca s-a restaurat deja o data salvata (efectul de restaurare de
        // mai jos ruleaza sincron, inaintea acestui .then() async), n-o mai suprascrie cu azi
        setDataSelectata(prev=>prev||today)
        const _co=new Date(today+'T12:00:00');_co.setDate(_co.getDate()+1);setDataCheckout(fmt(_co))
        // oaspeti=2 explicit — tab-ul Prețuri e prețul standard (fără selector de oaspeți),
        // ca să nu ridice ambiguu un rând scanat cu alt număr de oaspeți din tab-ul Calendar,
        // care scrie în același tabel.
        const {data:saved} = await supabase.from('preturi_live')
          .select('*').in('apartament_id',list.map((a:any)=>a.id)).eq('data_checkin',today).eq('oaspeti',2)
        const map:Record<string,any> = {}
        ;(saved||[]).forEach((p:any)=>{map[p.apartament_id]=p})
        const pm:Record<string,{booking:string,airbnb:string,dispBooking?:boolean|null,dispAirbnb?:boolean|null}> = {}
        list.forEach((a:any)=>{pm[a.id]={booking:map[a.id]?.pret_booking?.toString()||'',airbnb:map[a.id]?.pret_airbnb?.toString()||'',dispBooking:inferDisp(map[a.id]?.disponibil_booking,map[a.id]?.pret_booking),dispAirbnb:inferDisp(map[a.id]?.disponibil_airbnb,map[a.id]?.pret_airbnb)}})
        setPreturi(pm)
      }).catch((err) => console.error('[preturi apts]', err))
    loadHistory(true)
    loadEvolutie()
    loadReguli()
    return () => { if(pollRef.current) clearInterval(pollRef.current); if(quickScanPollRef.current) clearInterval(quickScanPollRef.current) }
  }, [])

  useEffect(() => {
    if (mainTab === 'strategie' && !stratLoaded) loadStrategie()
  }, [mainTab])


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
      apartament_id:aptId,data_checkin:checkin,oaspeti:2,
      pret_booking:p.booking?parseInt(p.booking):null,
      pret_airbnb:p.airbnb?parseInt(p.airbnb):null,
      updated_at:new Date().toISOString()
    },{onConflict:'apartament_id,data_checkin,oaspeti'})
    setSaving(null); show('success','Preț salvat!')
  }

  function updatePret(aptId:string,field:'booking'|'airbnb',val:string){
    setPreturi(prev=>({...prev,[aptId]:{...prev[aptId],[field]:val}}))
  }

  async function loadPreturiForDate(data:string){
    if(!apts.length) return {}
    const {data:saved} = await supabase.from('preturi_live').select('*').in('apartament_id',apts.map(a=>a.id)).eq('data_checkin',data).eq('oaspeti',2)
    const pm:Record<string,{booking:string,airbnb:string,dispBooking?:boolean|null,dispAirbnb?:boolean|null}> = {}
    const rowByApt:Record<string,any> = {}
    apts.forEach(a=>{
      const p=(saved||[]).find((x:any)=>x.apartament_id===a.id)
      pm[a.id]={booking:p?.pret_booking?.toString()||'',airbnb:p?.pret_airbnb?.toString()||'',dispBooking:inferDisp(p?.disponibil_booking,p?.pret_booking),dispAirbnb:inferDisp(p?.disponibil_airbnb,p?.pret_airbnb)}
      if(p) rowByApt[a.id]=p
    })
    setPreturi(pm)
    return rowByApt
  }

  function changeData(data:string){
    setDataSelectata(data)
    const _d=new Date(data+'T12:00:00');_d.setDate(_d.getDate()+1);setDataCheckout(fmt(_d))
    loadPreturiForDate(data)
  }

  // URL-ul apartscan:// pentru un scan de 1 zi/1 apartament/2 adulti — acelasi mecanism (script +
  // ApartScan.app) ca la Calendar, doar cu domeniul restrans la un singur rand din acest tabel.
  function quickScanUrl(aptId:string){
    const d = dataSelectata||today
    return `apartscan://scan?id=${aptId}&start=${d}&end=${d}&platform=both&guests=2&source=apt`
  }
  // Comuna pentru scan pe un rand (startQuickScan) si scan global pe toata ziua
  // (startBulkAvailabilityScan) — acelasi mecanism de detectat finalul: un id iese din
  // "in curs" doar cand randul lui din DB e chiar mai nou decat momentul de pornire.
  function beginScanTracking(ids:string[]){
    const now = Date.now()
    ids.forEach(id=>{ quickScanStartRef.current[id]=now })
    setScanningIds(prev=>{const n=new Set(prev);ids.forEach(id=>n.add(id));return n})
    if(quickScanPollRef.current) return
    let elapsed=0
    quickScanPollRef.current=setInterval(async ()=>{
      const rowByApt = await loadPreturiForDate(dataSelectata||today)
      elapsed+=4000
      setScanningIds(prev=>{
        const n=new Set(prev)
        prev.forEach(id=>{
          const row = rowByApt[id]
          const startedAt = quickScanStartRef.current[id]||0
          if(row?.updated_at && new Date(row.updated_at).getTime()>startedAt) n.delete(id)
        })
        if(n.size===0||elapsed>90000){
          clearInterval(quickScanPollRef.current); quickScanPollRef.current=null
          return new Set()
        }
        return n
      })
    },4000)
  }
  function startQuickScan(aptId:string){ beginScanTracking([aptId]) }

  // Buton general — verifica disponibilitatea pe toate apartamentele deodata, pentru ziua
  // selectata, ca sa se vada apoi (pastilele Bk/Ab, deja colorate dupa disponibilitate) unde
  // are sens sa mai verifici si pretul efectiv, cerut direct.
  function bulkAvailabilityScanUrl(){
    const d = dataSelectata||today
    return `apartscan://scan?all=1&start=${d}&end=${d}&platform=both&guests=2`
  }
  function startBulkAvailabilityScan(){
    beginScanTracking(apts.filter(a=>a._bk||a._ab).map(a=>a.id))
  }

  async function loadCalendarData(id:string, month:string, source:'apt'|'extra') {
    if(!id||!month) { setCalData({}); return }
    setLoadingCal(true)
    try{
      const [y,m] = month.split('-').map(Number)
      const start = `${month}-01`
      const end = fmt(new Date(y, m, 1)) // prima zi a lunii URMATOARE (exclusiv)
      const table = source==='extra' ? 'preturi_extra_live' : 'preturi_live'
      const keyField = source==='extra' ? 'locatie_extra_id' : 'apartament_id'
      const {data} = await supabase.from(table)
        .select('data_checkin,oaspeti,pret_booking,pret_airbnb,pret_booking_original,updated_at')
        .eq(keyField,id).gte('data_checkin',start).lt('data_checkin',end)
      const map:Record<string,Record<string,any>> = {}
      ;(data||[]).forEach((r:any)=>{
        if(!map[r.data_checkin]) map[r.data_checkin]={}
        map[r.data_checkin][String(r.oaspeti ?? 2)]={booking:r.pret_booking,airbnb:r.pret_airbnb,bookingOrig:r.pret_booking_original,updatedAt:r.updated_at}
      })
      setCalData(map)
    }catch(err){console.error('[preturi loadCalendarData]',err)}
    setLoadingCal(false)
  }

  // ids/source parametrizate — funcționează identic pentru "toate apartamentele" (ids = toate)
  // și pentru "un singur apartament sau o locație extra" (ids = [un id]), cerut direct: la scop
  // Zi/Săptămână, un singur apartament tot trebuie să poată fi scanat/urmărit, nu doar toate deodată.
  async function loadCompareData(start:string, end:string, ids:string[], source:'apt'|'extra') {
    if(!start||!end||!ids.length) return
    try{
      const table = source==='extra' ? 'preturi_extra_live' : 'preturi_live'
      const keyField = source==='extra' ? 'locatie_extra_id' : 'apartament_id'
      const {data} = await supabase.from(table)
        .select(`${keyField},data_checkin,oaspeti,pret_booking,pret_airbnb`)
        .in(keyField,ids).gte('data_checkin',start).lte('data_checkin',end)
      const map:Record<string,Record<string,Record<string,any>>> = {}
      ;(data||[]).forEach((r:any)=>{
        const rid = r[keyField]
        if(!map[rid]) map[rid]={}
        if(!map[rid][r.data_checkin]) map[rid][r.data_checkin]={}
        map[rid][r.data_checkin][String(r.oaspeti ?? 2)]={booking:r.pret_booking,airbnb:r.pret_airbnb}
      })
      setCompareData(map)
    }catch(err){console.error('[preturi loadCompareData]',err)}
  }

  async function loadOccupancyRange(start:string, end:string, ids:string[], source:'apt'|'extra') {
    // locațiile extra nu sunt apartamente de-ale noastre — nu au rezervări în sistem, nu are sens
    // sa verificam disponibilitatea lor din tabela rezervari.
    if(!start||!end||!ids.length||source==='extra'){ setOccupancyRez([]); return }
    try{
      const {data} = await supabase.from('rezervari').select('apartament_id,data_checkin,data_checkout')
        .lte('data_checkin',end).gt('data_checkout',start).neq('status_rezervare','anulata')
        .in('apartament_id',ids)
      setOccupancyRez(data||[])
    }catch(err){console.error('[preturi loadOccupancyRange]',err)}
  }
  function isOccupiedOn(aptId:string, day:string){
    return occupancyRez.some(r=>r.apartament_id===aptId&&r.data_checkin<=day&&r.data_checkout>day)
  }

  function startComparePolling(start:string, end:string, ids:string[], source:'apt'|'extra') {
    stopComparePolling()
    setComparePolling(true)
    let elapsedMs = 0
    comparePollRef.current = setInterval(()=>{
      loadCompareData(start,end,ids,source)
      loadOccupancyRange(start,end,ids,source)
      elapsedMs += 4000
      if(elapsedMs > 15*60*1000) stopComparePolling() // opreste singur dupa 15 min, ca sa nu ramana agatat la nesfarsit
    },4000)
  }
  function stopComparePolling() {
    if(comparePollRef.current) clearInterval(comparePollRef.current)
    comparePollRef.current = null
    setComparePolling(false)
  }

  async function loadExtraLocations() {
    try{
      const {data} = await supabase.from('locatii_extra').select('id,nume,link_booking,link_airbnb').order('nume')
      setExtraLocations(data||[])
    }catch(err){console.error('[preturi loadExtraLocations]',err)}
  }

  async function saveExtraLocation() {
    if(!extraForm.nume.trim()){show('error','Introdu un nume pentru locație');return}
    if(!extraForm.linkBooking.trim()&&!extraForm.linkAirbnb.trim()){show('error','Introdu cel puțin un link (Booking sau Airbnb)');return}
    setSavingExtra(true)
    try{
      const {data,error} = await supabase.from('locatii_extra').insert({
        nume:extraForm.nume.trim(),
        link_booking:extraForm.linkBooking.trim()||null,
        link_airbnb:extraForm.linkAirbnb.trim()||null,
      }).select().single()
      if(error) throw error
      await loadExtraLocations()
      setCalApt(`extra:${data.id}`)
      setExtraForm({nume:'',linkBooking:'',linkAirbnb:''})
      setShowAddExtra(false)
      show('success','Locație extra adăugată')
    }catch(err:any){
      console.error('[preturi saveExtraLocation]',err)
      show('error','Nu s-a putut salva — verifică dacă tabela locatii_extra există în Supabase')
    }
    setSavingExtra(false)
  }

  function shiftCalMonth(delta:number){
    const [y,m] = calMonth.split('-').map(Number)
    const d = new Date(y, m-1+delta, 1)
    setCalMonth(`${d.getFullYear()}-${pad(d.getMonth()+1)}`)
  }

  function buildCalendarGrid(month:string) {
    const [y,m] = month.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const firstDow = (new Date(y, m-1, 1).getDay()+6)%7 // Luni=0 ... Duminica=6
    const cells:(number|null)[] = []
    for(let i=0;i<firstDow;i++) cells.push(null)
    for(let d=1;d<=daysInMonth;d++) cells.push(d)
    while(cells.length%7!==0) cells.push(null)
    return cells
  }

  // Domeniul de scanare (zi/saptamana/luna) e independent de luna AFISATA in grila — poti naviga
  // vizual prin decembrie, dar tot scana doar azi, daca asa ai ales scope-ul.
  const calScopeAnchor = calScopeDate || today
  const [calStart, calEnd] = (() => {
    if(calScope==='zi') return [calScopeAnchor, calScopeAnchor]
    if(calScope==='saptamana'){
      const d = new Date(calScopeAnchor+'T12:00:00'); d.setDate(d.getDate()+6)
      return [calScopeAnchor, fmt(d)]
    }
    const [y,m] = calMonth.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    return [`${calMonth}-01`, `${calMonth}-${pad(lastDay)}`]
  })()
  // Zi/Săptămână -> tabel (nu grila lunară clasică), cu doi subcazuri: "un apartament" (cel ales
  // din selector, poate fi și o locație extra) sau "toate" (scan --all, doar apartamentele
  // noastre). Lună -> ramane comportamentul clasic, per apartament, grila calendaristică.
  const calTableView = calScope !== 'luna'
  const calScanAll = calTableView && calWho === 'toate'
  const calCommand = calScanAll
    ? `python3 ~/Desktop/apartment_price_scan.py --all ${calStart} ${calEnd} both ${calGuests}`
    : `python3 ~/Desktop/apartment_price_scan.py ${calId} ${calStart} ${calEnd} both ${calGuests} ${calSource}`
  const calScanUrl = calScanAll
    ? `apartscan://scan?all=1&start=${calStart}&end=${calEnd}&platform=both&guests=${calGuests}`
    : `apartscan://scan?id=${calId}&start=${calStart}&end=${calEnd}&platform=both&guests=${calGuests}&source=${calSource}`
  const compareSource: 'apt'|'extra' = calWho==='toate' ? 'apt' : calSource
  const compareIds: string[] = calWho==='toate' ? apts.map(a=>a.id) : (calId ? [calId] : [])
  const compareIdsKey = compareIds.join(',')
  const calDisabled = calTableView ? !compareIds.length : !calId

  // Monitor (booking_scan.py) — aceeași idee ca la Calendar: buton "Pornește scanul" (ApartScan.app)
  // lângă "Copiază", ca să nu mai fie nevoie de Terminal deschis manual, cerut direct.
  const monitorPairs = [[checkinMonitor,checkoutMonitor],...extraPairs.map(p=>[p.ci,p.co] as [string,string])]
  const monitorScanCommand = `python3 ~/Desktop/booking_scan.py ${monitorPairs.map(([ci,co])=>`${ci} ${co}`).join(' ')}`
  const monitorScanUrl = `apartscan://scan?action=bookingscan&dates=${monitorPairs.map(([ci,co])=>`${ci}_${co}`).join(',')}`
  const monitorScanDisabled = !checkinMonitor||!checkoutMonitor

  async function copyCalCommand() {
    const command = calCommand
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
    setCalCommandCopied(true)
    show('success','Comanda a fost copiată')
    setTimeout(()=>setCalCommandCopied(false),1600)
  }

  useEffect(()=>{ if(calId&&calMonth) loadCalendarData(calId, calMonth, calSource) }, [calId, calMonth, calSource])
  useEffect(()=>{
    if(!calMonth) setCalMonth(today.slice(0,7))
    if(!calScopeDate) setCalScopeDate(today)
    if(!calApt&&apts.length) setCalApt(`apt:${apts[0].id}`)
  }, [apts])
  // Aplică starea salvată din vizita anterioară — DOAR pe client, după montare (nu în inițializatorul
  // useState de mai sus), ca html-ul din server și primul randare din client să coincidă exact
  // (altfel React aruncă eroare de hidratare, localStorage neexistând pe server). Rulează o singură
  // dată, imediat după efectul de mai sus, ca să suprascrie valorile implicite cu cele salvate.
  useEffect(()=>{
    const saved = loadPersistedPreturiState()
    if(saved.mainTab) setMainTab(saved.mainTab as any)
    if(saved.calApt) setCalApt(saved.calApt)
    if(saved.calMonth) setCalMonth(saved.calMonth)
    if(saved.calGuests) setCalGuests(saved.calGuests)
    if(saved.calScope) setCalScope(saved.calScope as any)
    if(saved.calScopeDate){
      const todayStr = new Date().toISOString().slice(0,10)
      if(saved.calScopeDate >= todayStr) setCalScopeDate(saved.calScopeDate)
    }
    if(saved.calWho) setCalWho(saved.calWho as any)
    if(saved.dataSelectata) setDataSelectata(saved.dataSelectata)
    if(saved.dataCheckout) setDataCheckout(saved.dataCheckout)
    if(saved.checkinMonitor){ setCheckinMonitor(saved.checkinMonitor); restoredMonitorDatesRef.current = true }
    if(saved.checkoutMonitor) setCheckoutMonitor(saved.checkoutMonitor)
    if(saved.extraPairs){
      try{ const parsed=JSON.parse(saved.extraPairs); if(Array.isArray(parsed)) setExtraPairs(parsed) }catch{}
    }
  }, [])
  useEffect(()=>{
    stopComparePolling()
    if(calTableView){ loadCompareData(calStart,calEnd,compareIds,compareSource); loadOccupancyRange(calStart,calEnd,compareIds,compareSource) }
  }, [calTableView, calStart, calEnd, compareIdsKey, compareSource])
  useEffect(()=>()=>stopComparePolling(), []) // curatenie la parasirea paginii
  useEffect(()=>{ loadExtraLocations() }, [])
  useEffect(()=>{
    try{
      localStorage.setItem(PRETURI_STATE_KEY, JSON.stringify({
        mainTab, calApt, calMonth, calGuests, calScope, calScopeDate, calWho,
        dataSelectata, dataCheckout, checkinMonitor, checkoutMonitor,
        extraPairs: JSON.stringify(extraPairs),
      }))
    }catch{}
  }, [mainTab, calApt, calMonth, calGuests, calScope, calScopeDate, calWho,
      dataSelectata, dataCheckout, checkinMonitor, checkoutMonitor, extraPairs])

  // Revine la pagina standard — cerut direct, pentru cazul în care ai lăsat pagina într-o stare
  // specifică (alt apartament, alte date de scanare etc.) și vrei să repornești curat.
  function resetPreturiStandard(){
    try{ localStorage.removeItem(PRETURI_STATE_KEY) }catch{}
    setMainTab('preturi')
    setCalScope('luna')
    setCalWho('toate')
    setCalApt('')
    setCalMonth(today.slice(0,7))
    setCalScopeDate(today)
    setCalGuests('2')
    setDataSelectata(today)
    const _co=new Date(today+'T12:00:00');_co.setDate(_co.getDate()+1);setDataCheckout(fmt(_co))
    const ci=add(1)
    const d=new Date(ci+'T12:00:00');d.setDate(d.getDate()+1)
    setCheckinMonitor(ci); setCheckoutMonitor(fmt(d))
    setExtraPairs([])
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
5. Extrage numărul total de proprietăți găsite — NU sări peste acest pas, e obligatoriu.
   Imediat deasupra listei de proprietăți (sub filtrele din stânga, înainte de butoanele
   Listă/Grilă și de sortare) apare exact textul: "Iaşi: au fost găsite NUMĂR proprietăţi"
   (sau "X properties found" în engleză). Extrage DOAR cifrele din acel text, ca număr întreg.
   Dacă din orice motiv nu găsești acest text exact nicăieri pe pagină, trimite "total": null
   (NU trimite 0 și NU omite câmpul - lipsa reală trebuie sa fie vizibilă).
6. Trimite rezultatele cu un fetch POST la: ${receiveUrl}

Body-ul POST (JSON exact):
{
  "jobId": "${job.id}",
  "checkin": "${checkinMonitor}",
  "checkout": "${checkoutMonitor}",
  "rawJson": "{\"total\": NUMAR_TOTAL_SAU_null, \"results\": [{\"rank\":1,\"name\":\"Nume\",\"priceText\":\"182 lei\",\"price\":182}, ...]}"
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
    const command = monitorScanCommand
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

  // ── Calcule strategie ──
  function calcPerformanta() {
    const by: Record<string,{nopti:number;suma:number;zileLuna:number}> = {}
    for (const r of stratRezervari) {
      const brut = Number(r.suma_incasata||0)
      const totalN = Number(r.nr_nopti)||Math.round((new Date(r.data_checkout).getTime()-new Date(r.data_checkin).getTime())/86400000)
      if (!totalN||!brut) continue
      const bpz = brut/totalN
      const dtIn = new Date(r.data_checkin+'T12:00:00'), dtOut = new Date(r.data_checkout+'T12:00:00')
      const dt = new Date(dtIn)
      while(dt<dtOut){
        const y=dt.getFullYear(),m=dt.getMonth()
        const k=`${r.apartament_id}_${y}-${String(m+1).padStart(2,'0')}`
        const zl=new Date(y,m+1,0).getDate()
        if(!by[k]) by[k]={nopti:0,suma:0,zileLuna:zl}
        by[k].nopti++; by[k].suma+=bpz
        dt.setDate(dt.getDate()+1)
      }
    }
    return Object.entries(by).map(([k,v])=>{
      const sep=k.indexOf('_'), aptId=k.slice(0,sep), luna=k.slice(sep+1)
      const apt=apts.find((a:any)=>a.id===aptId)
      const adr=v.nopti>0?Math.round(v.suma/v.nopti):0
      const ocupare=Math.round(v.nopti/v.zileLuna*100)
      const revpar=Math.round(v.suma/v.zileLuna)
      return {aptId,aptNota:apt?.nota||aptId.slice(0,6),luna,nopti:v.nopti,suma:Math.round(v.suma),adr,ocupare,revpar}
    }).sort((a,b)=>a.luna<b.luna?-1:a.luna>b.luna?1:a.aptNota<b.aptNota?-1:1)
  }

  function calcSezonalitate() {
    const perL:Record<number,{n:number;s:number}> = {}, perZ:Record<number,{n:number;s:number}> = {}
    for (const r of stratRezervari) {
      const brut=Number(r.suma_incasata||0)
      const totalN=Number(r.nr_nopti)||Math.round((new Date(r.data_checkout).getTime()-new Date(r.data_checkin).getTime())/86400000)
      if(!totalN||!brut) continue
      const bpz=brut/totalN
      const dtIn=new Date(r.data_checkin+'T12:00:00'),dtOut=new Date(r.data_checkout+'T12:00:00')
      const dt=new Date(dtIn)
      while(dt<dtOut){
        const l=dt.getMonth()+1, z=dt.getDay()
        if(!perL[l]) perL[l]={n:0,s:0}; perL[l].n++; perL[l].s+=bpz
        if(!perZ[z]) perZ[z]={n:0,s:0}; perZ[z].n++; perZ[z].s+=bpz
        dt.setDate(dt.getDate()+1)
      }
    }
    const LN=['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']
    const luniData=Array.from({length:12},(_,i)=>{const l=perL[i+1]||{n:0,s:0};return{luna:i+1,numeScurt:LN[i],nopti:l.n,adr:l.n>0?Math.round(l.s/l.n):0}})
    const ZN=['Lun','Mar','Mie','Joi','Vin','Sâm','Dum']
    const ziSaptData=[1,2,3,4,5,6,0].map((z,i)=>{const d=perZ[z]||{n:0,s:0};return{zi:z,numeScurt:ZN[i],nopti:d.n,adr:d.n>0?Math.round(d.s/d.n):0,isWeekend:z===5||z===6}})
    return {luniData,ziSaptData}
  }

  function calcSugestie(apt:any,date:string):{pret:number;reguleAplicate:string[]} {
    const base=Number(apt.pret_standard||0)
    if(!base||!reguli.length) return {pret:0,reguleAplicate:[]}
    const d=new Date(date+'T12:00:00'), ziSapt=d.getDay(), luna=d.getMonth()+1
    const zilePana=Math.ceil((d.getTime()-new Date().getTime())/86400000)
    let pret=base; const ra:string[]=[]
    const active=reguli.filter(r=>r.activ&&(!r.apartament_id||r.apartament_id===apt.id)).sort((a,b)=>a.prioritate-b.prioritate)
    for(const r of active){
      let ok=false
      if(r.tip==='weekend') ok=ziSapt===5||ziSapt===6
      else if(r.tip==='sezon') ok=luna>=(r.conditii?.luna_start??1)&&luna<=(r.conditii?.luna_end??12)
      else if(r.tip==='avans') ok=zilePana>=0&&zilePana<=(r.conditii?.zile_inainte_max??3)
      else if(r.tip==='ocupare'){
        const lc=new Date().getMonth()+1,ac=new Date().getFullYear()
        const zl=new Date(ac,lc,0).getDate()
        const primaLuna=new Date(ac,lc-1,1),nextLuna=new Date(ac,lc,1)
        const nocc=stratRezervari.filter(rv=>rv.apartament_id===apt.id).reduce((acc,rv)=>{
          const si=new Date(rv.data_checkin+'T12:00:00'),so=new Date(rv.data_checkout+'T12:00:00')
          const s=si>primaLuna?si:primaLuna,e=so<nextLuna?so:nextLuna
          return acc+Math.max(0,Math.round((e.getTime()-s.getTime())/86400000))
        },0)
        ok=Math.round(nocc/zl*100)>=(r.conditii?.ocupare_min??80)
      }
      if(ok){pret=r.ajustare_tip==='procent'?pret*(1+r.ajustare_valoare/100):pret+r.ajustare_valoare;ra.push(r.denumire)}
    }
    return {pret:Math.round(pret),reguleAplicate:ra}
  }

  async function saveRegula(){
    if(!regulaForm.denumire.trim()||!regulaForm.ajustare_valoare) return
    setSavingRegula(true)
    const cond:Record<string,any>={}
    if(regulaForm.tip==='sezon'){cond.luna_start=parseInt(regulaForm.luna_start);cond.luna_end=parseInt(regulaForm.luna_end)}
    else if(regulaForm.tip==='avans') cond.zile_inainte_max=parseInt(regulaForm.zile_inainte_max)
    else if(regulaForm.tip==='ocupare') cond.ocupare_min=parseInt(regulaForm.ocupare_min)
    const payload={apartament_id:regulaForm.apartament_id||null,denumire:regulaForm.denumire.trim(),tip:regulaForm.tip,conditii:cond,ajustare_tip:regulaForm.ajustare_tip,ajustare_valoare:parseFloat(regulaForm.ajustare_valoare),prioritate:parseInt(regulaForm.prioritate),activ:regulaForm.activ}
    if(editingRegula) await supabase.from('reguli_preturi').update(payload).eq('id',editingRegula.id)
    else await supabase.from('reguli_preturi').insert(payload)
    setSavingRegula(false);setShowFormRegula(false);setEditingRegula(null)
    await loadReguli()
    show('success',editingRegula?'Regulă actualizată!':'Regulă salvată!')
  }

  async function deleteRegula(id:string){
    setDeletingRegula(id)
    await supabase.from('reguli_preturi').delete().eq('id',id)
    setDeletingRegula(null);setReguli(prev=>prev.filter(r=>r.id!==id))
  }

  async function toggleRegula(id:string,activ:boolean){
    await supabase.from('reguli_preturi').update({activ}).eq('id',id)
    setReguli(prev=>prev.map(r=>r.id===id?{...r,activ}:r))
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
  // Culoarea pastilei Bk/Ab e determinata STRICT de disponibilitatea confirmata la ultimul scan
  // (nu de brandul platformei) — cerut direct: verde = disponibil, roșu = indisponibil confirmat,
  // neutru = niciodată scanat. Fără asta, un "niciodată scanat" și un "indisponibil confirmat"
  // ar arăta identic (pastila Ab era deja roșiatică din start, ca simplă culoare de brand).
  function availStyle(disp: boolean|null|undefined): React.CSSProperties {
    if(disp===true) return { border:'1px solid rgba(74,222,128,0.4)', color:'#4ADE80', background:'rgba(74,222,128,0.08)' }
    if(disp===false) return { border:'1px solid rgba(248,113,113,0.4)', color:'#F87171', background:'rgba(248,113,113,0.08)' }
    return { border:'1px solid rgba(159,215,255,0.2)', color:'rgba(159,215,255,0.5)', background:'transparent' }
  }

  return (
    <>
      <PageHeader title="💰 Prețuri live" subtitle="Booking.com & Airbnb"/>
      <div style={{display:'flex',gap:0,borderBottom:'1px solid rgba(159,215,255,0.1)',background:'rgba(10,20,40,0.5)'}}>
        {(['preturi','calendar','monitor','decizii','evolutie','strategie'] as const).map((tab)=>{
          const labels:Record<string,string> = {preturi:'💰 Prețuri',calendar:'📅 Calendar',monitor:'🔍 Monitor',decizii:'🧠 Decizii',evolutie:'📈 Evoluție',strategie:'📊 Strategie'}
          return(
            <button key={tab} onClick={()=>setMainTab(tab)} style={{
              padding:'10px 18px',fontSize:12,fontWeight:600,cursor:'pointer',
              border:'none',borderBottom:`2px solid ${mainTab===tab?'#7BC8FF':'transparent'}`,
              background:'transparent',color:mainTab===tab?'#7BC8FF':'rgba(159,215,255,0.4)',
            }}>{labels[tab]}</button>
          )
        })}
        <button onClick={resetPreturiStandard} title="Revino la pagina standard — tab Prețuri, Calendar cu Toată luna/Toate apartamentele, nimic salvat din vizita asta" style={{
          marginLeft:'auto',padding:'10px 14px',fontSize:11,fontWeight:600,cursor:'pointer',
          border:'none',background:'transparent',color:'rgba(159,215,255,0.4)',alignSelf:'center',
        }}>↺ Resetează</button>
      </div>
      <div style={{padding:'14px 16px',overflowY:'auto',flex:1}}>

        {mainTab==='preturi'&&(<>
        <div style={{...panel}}>
          <div style={{padding:'10px 16px 6px',display:'flex',gap:6,flexWrap:'wrap' as const,alignItems:'center'}}>
            {QUICK.map(({label,val})=>(
              <button key={label} onClick={()=>changeData(val)} style={{
                padding:'5px 12px',borderRadius:7,fontSize:12,cursor:'pointer',
                display:'flex',flexDirection:'column' as const,alignItems:'center',gap:1,lineHeight:1.2,
                border:`1px solid ${dataSelectata===val?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.15)'}`,
                background:dataSelectata===val?'rgba(77,163,255,0.15)':'transparent',
                color:dataSelectata===val?'#7BC8FF':'rgba(159,215,255,0.5)',
              }}>
                <span>{label}</span>
                <span style={{fontSize:9,opacity:.6,textTransform:'capitalize' as const}}>{weekdayShort(val)}</span>
              </button>
            ))}
          </div>
          <div style={{padding:'4px 16px 12px',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap' as const}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'rgba(159,215,255,0.45)'}}>Check-in</span>
              <div style={{display:'flex',flexDirection:'column' as const,gap:2}}>
                <input type="date" value={dataSelectata} onChange={e=>changeData(e.target.value)} style={{
                  padding:'4px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',
                  background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'
                }}/>
                {dataSelectata&&<span style={{fontSize:9,color:'rgba(159,215,255,0.4)',textAlign:'center' as const,textTransform:'capitalize' as const}}>{weekdayShort(dataSelectata)}</span>}
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'rgba(159,215,255,0.45)'}}>Check-out</span>
              <div style={{display:'flex',flexDirection:'column' as const,gap:2}}>
                <input type="date" value={dataCheckout} min={dataSelectata}
                  onChange={e=>setDataCheckout(e.target.value)} style={{
                  padding:'4px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',
                  background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'
                }}/>
                {dataCheckout&&<span style={{fontSize:9,color:'rgba(159,215,255,0.4)',textAlign:'center' as const,textTransform:'capitalize' as const}}>{weekdayShort(dataCheckout)}</span>}
              </div>
            </div>
            {dataCheckout&&dataSelectata&&(()=>{
              const nopti=Math.round((new Date(dataCheckout+'T12:00:00').getTime()-new Date(dataSelectata+'T12:00:00').getTime())/86400000)
              return nopti>0?<span style={{fontSize:11,color:'rgba(147,197,253,0.5)',fontFamily:'monospace',background:'rgba(99,179,237,0.08)',padding:'3px 8px',borderRadius:5}}>{nopti} {nopti===1?'noapte':'nopți'}</span>:null
            })()}
            <a href={bulkAvailabilityScanUrl()} onClick={startBulkAvailabilityScan}
              title="Verifică disponibilitatea Booking+Airbnb pe toate apartamentele, pentru ziua selectată — util ca să vezi apoi unde merită verificat și prețul"
              style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:600,textDecoration:'none',cursor:'pointer',
                border:'1px solid rgba(77,163,255,0.4)',background:'rgba(77,163,255,0.12)',color:'#7BC8FF'}}>
              {apts.some(a=>scanningIds.has(a.id))?'⏳ Verific...':'🔍 Verifică disponibilitate (toate)'}
            </a>
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
              </div>
              {(apt._bk||apt._ab)&&(
                // Buton rotund, albastru (culoarea de accent principală a aplicației) — schimbat
                // din pastilă verde, cerut direct: era prea ușor de confundat cu pastilele Bk/Ab,
                // care acum devin verzi/roșii în funcție de disponibilitate (culoare de status,
                // nu de acțiune) — un buton de declanșat scanarea trebuie să arate clar altfel.
                <a href={quickScanUrl(apt.id)} onClick={()=>startQuickScan(apt.id)} title="Scanează automat Booking+Airbnb pentru 2 adulți — prețul apare și rămâne salvat singur"
                  style={{display:'flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:'50%',fontSize:11,textDecoration:'none',flexShrink:0,
                    border:`1px solid ${scanningIds.has(apt.id)?'rgba(252,211,77,0.5)':'rgba(77,163,255,0.5)'}`,
                    background:scanningIds.has(apt.id)?'rgba(252,211,77,0.15)':'rgba(77,163,255,0.15)',
                    color:scanningIds.has(apt.id)?'#FCD34D':'#4DA3FF'}}>
                  {scanningIds.has(apt.id)?'⏳':'▶'}
                </a>
              )}
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:10,color:'rgba(77,163,255,0.5)'}}>🏨</span>
                <input type="number" placeholder="RON" value={preturi[apt.id]?.booking||''} onChange={e=>updatePret(apt.id,'booking',e.target.value)} style={inp}/>
                {apt._bk&&<a href={buildUrl(apt._bk,'booking',dataSelectata||today,dataCheckout)} target="_blank" rel="noopener"
                  title={preturi[apt.id]?.dispBooking===true?'Disponibil pe Booking (confirmat la ultimul scan)':preturi[apt.id]?.dispBooking===false?'Indisponibil pe Booking (confirmat la ultimul scan) — verifică/intervino':'Nescanat încă pe Booking pentru această zi'}
                  style={{fontSize:11,padding:'4px 10px',borderRadius:6,textDecoration:'none',whiteSpace:'nowrap' as const,...availStyle(preturi[apt.id]?.dispBooking)}}>Bk ↗</a>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:10,color:'rgba(248,113,113,0.5)'}}>🏠</span>
                <input type="number" placeholder="RON" value={preturi[apt.id]?.airbnb||''} onChange={e=>updatePret(apt.id,'airbnb',e.target.value)} style={inp}/>
                {apt._ab&&<a href={buildUrl(apt._ab,'airbnb',dataSelectata||today,dataCheckout)} target="_blank" rel="noopener"
                  title={preturi[apt.id]?.dispAirbnb===true?'Disponibil pe Airbnb (confirmat la ultimul scan)':preturi[apt.id]?.dispAirbnb===false?'Indisponibil pe Airbnb (confirmat la ultimul scan) — verifică/intervino':'Nescanat încă pe Airbnb pentru această zi'}
                  style={{fontSize:11,padding:'4px 10px',borderRadius:6,textDecoration:'none',whiteSpace:'nowrap' as const,...availStyle(preturi[apt.id]?.dispAirbnb)}}>Ab ↗</a>}
              </div>
              {preturi[apt.id]?.booking&&preturi[apt.id]?.airbnb&&(
                <div style={{fontSize:11,fontFamily:'monospace',color:parseInt(preturi[apt.id].booking)>parseInt(preturi[apt.id].airbnb)?'#FCD34D':'#4ADE80'}}>
                  {parseInt(preturi[apt.id].booking)>parseInt(preturi[apt.id].airbnb)
                    ?`Bk +${parseInt(preturi[apt.id].booking)-parseInt(preturi[apt.id].airbnb)}`
                    :`Ab +${parseInt(preturi[apt.id].airbnb)-parseInt(preturi[apt.id].booking)}`}
                </div>
              )}
              {(()=>{
                if(!dataSelectata||!reguli.length) return null
                const sug=calcSugestie(apt,dataSelectata)
                if(!sug.pret) return null
                return(
                  <span title={sug.reguleAplicate.length?`Reguli: ${sug.reguleAplicate.join(', ')}`:'Bazat pe prețul standard'}
                    style={{fontSize:10,color:'#FCD34D',cursor:'help',flexShrink:0,fontFamily:'monospace'}}>
                    💡 {sug.pret} RON
                  </span>
                )
              })()}
              <button onClick={()=>savePret(apt.id,dataSelectata)} disabled={saving===apt.id} style={{
                marginLeft:'auto',padding:'4px 14px',borderRadius:6,fontSize:11,cursor:'pointer',
                border:'1px solid rgba(74,222,128,0.3)',background:'rgba(74,222,128,0.08)',
                color:'#4ADE80',opacity:saving===apt.id?0.5:1
              }}>{saving===apt.id?'...':'✓ Salvează'}</button>
            </div>
          ))}
        </div>

        </>) /* end preturi */}
        {mainTab==='calendar'&&(()=>{
          const [calY,calM] = (calMonth||today.slice(0,7)).split('-').map(Number)
          const cells = calMonth?buildCalendarGrid(calMonth):[]
          const zileSapt = ['lun.','mar.','mie.','joi','vin.','sâm.','dum.']
          const selApt = calSource==='apt' ? apts.find(a=>a.id===calId) : null
          const selExtra = calSource==='extra' ? extraLocations.find(l=>l.id===calId) : null
          const inpSm:React.CSSProperties = {padding:'6px 10px',borderRadius:7,fontSize:13,
            border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',outline:'none'}
          const compareDays:string[] = (() => {
            if(calScope==='zi') return calStart?[calStart]:[]
            if(calScope!=='saptamana'||!calStart||!calEnd) return []
            const out:string[] = []
            const d = new Date(calStart+'T12:00:00')
            const endD = new Date(calEnd+'T12:00:00')
            while(d<=endD){ out.push(fmt(d)); d.setDate(d.getDate()+1) }
            return out
          })()
          return(
          <div style={{...panel}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',
              display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' as const}}>
              <span style={{fontSize:16}}>📅</span>
              <select value={calApt} onChange={e=>setCalApt(e.target.value)} style={{...inpSm,fontWeight:600,color:'#E8F4FF'}}>
                <optgroup label="Apartamentele noastre">
                  {apts.map(a=><option key={a.id} value={`apt:${a.id}`}>{a.nota}</option>)}
                </optgroup>
                {extraLocations.length>0&&(
                  <optgroup label="Locații extra">
                    {extraLocations.map(l=><option key={l.id} value={`extra:${l.id}`}>🏷 {l.nume}</option>)}
                  </optgroup>
                )}
              </select>
              <button onClick={()=>setShowAddExtra(v=>!v)} title="Adaugă o locație de urmărit ocazional, care nu e (încă) apartament de-al nostru" style={{
                padding:'5px 10px',borderRadius:6,fontSize:11,cursor:'pointer',fontWeight:600,
                border:'1px solid rgba(196,181,253,0.25)',background:showAddExtra?'rgba(196,181,253,0.12)':'transparent',color:'#C4B5FD'}}>
                {showAddExtra?'✕ Renunță':'+ Locație extra'}
              </button>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <button onClick={()=>shiftCalMonth(-1)} style={{
                  padding:'5px 10px',borderRadius:6,fontSize:13,cursor:'pointer',fontWeight:700,
                  border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.6)'}}>◀</button>
                <span style={{fontSize:13,fontWeight:700,color:'#E8F4FF',minWidth:130,textAlign:'center' as const}}>
                  {LUNI[calM]} {calY}
                </span>
                <button onClick={()=>shiftCalMonth(1)} style={{
                  padding:'5px 10px',borderRadius:6,fontSize:13,cursor:'pointer',fontWeight:700,
                  border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.6)'}}>▶</button>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>👤 Oaspeți</span>
                <select value={calGuests} onChange={e=>setCalGuests(e.target.value)} style={inpSm}>
                  {[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button onClick={()=>loadCalendarData(calId,calMonth,calSource)} disabled={loadingCal||!calId} style={{
                padding:'5px 12px',borderRadius:6,fontSize:11,cursor:'pointer',fontWeight:600,
                border:'1px solid rgba(99,179,237,0.25)',background:'rgba(99,179,237,0.08)',color:'#93C5FD',
                opacity:loadingCal||!calId?0.5:1,
              }}>{loadingCal?'...':'↺ Reîmprospătează'}</button>
              <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
                {comparePolling&&(
                  <span style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#F87171',fontWeight:700}}>
                    <span style={{width:7,height:7,borderRadius:'50%',background:'#F87171',display:'inline-block'}}/>
                    Live
                    <button onClick={stopComparePolling} style={{marginLeft:2,padding:'2px 8px',borderRadius:5,fontSize:10,
                      cursor:'pointer',border:'1px solid rgba(248,113,113,0.3)',background:'transparent',color:'#F87171'}}>⏹</button>
                  </span>
                )}
                <a href={calScanUrl} title={calCommand}
                  onClick={()=>{ if(calTableView) startComparePolling(calStart,calEnd,compareIds,compareSource) }}
                  style={{
                    padding:'6px 14px',borderRadius:6,fontSize:12,cursor:'pointer',fontWeight:700,textDecoration:'none',
                    border:'1px solid rgba(74,222,128,0.35)',background:'rgba(74,222,128,0.12)',color:'#4ADE80',
                    opacity:calDisabled?0.45:1,pointerEvents:calDisabled?'none':'auto',
                  }}>▶ Pornește scanul</a>
                <button onClick={copyCalCommand} disabled={calDisabled} title={calCommand} style={{
                  padding:'6px 8px',borderRadius:6,fontSize:12,cursor:'pointer',fontWeight:600,
                  border:`1px solid ${calCommandCopied?'rgba(74,222,128,0.35)':'rgba(99,179,237,0.2)'}`,
                  background:calCommandCopied?'rgba(74,222,128,0.1)':'transparent',
                  color:calCommandCopied?'#4ADE80':'rgba(147,197,253,0.5)',
                  opacity:calDisabled?0.45:1,
                }}>{calCommandCopied?'✓':'📋'}</button>
              </div>
            </div>
            <div style={{padding:'8px 16px',borderBottom:'1px solid rgba(159,215,255,0.06)',
              display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' as const}}>
              <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>Scanează</span>
              <div style={{display:'flex',borderRadius:7,overflow:'hidden',border:'1px solid rgba(99,179,237,0.2)'}}>
                {(['zi','saptamana','luna'] as const).map(sc=>(
                  <button key={sc} onClick={()=>setCalScope(sc)} style={{
                    padding:'5px 12px',fontSize:11,fontWeight:600,cursor:'pointer',border:'none',
                    background:calScope===sc?'rgba(99,179,237,0.18)':'transparent',
                    color:calScope===sc?'#93C5FD':'rgba(147,197,253,0.45)',
                  }}>{sc==='zi'?'O zi':sc==='saptamana'?'O săptămână':'Toată luna'}</button>
                ))}
              </div>
              {calScope!=='luna'&&(
                <input type="date" value={calScopeDate} min={today} onChange={e=>setCalScopeDate(e.target.value)} style={inpSm}/>
              )}
              {calTableView&&(
                <div style={{display:'flex',borderRadius:7,overflow:'hidden',border:'1px solid rgba(196,181,253,0.25)'}}>
                  {(['un-apartament','toate'] as const).map(w=>(
                    <button key={w} onClick={()=>setCalWho(w)} style={{
                      padding:'5px 12px',fontSize:11,fontWeight:600,cursor:'pointer',border:'none',
                      background:calWho===w?'rgba(196,181,253,0.18)':'transparent',
                      color:calWho===w?'#C4B5FD':'rgba(147,197,253,0.45)',
                    }}>{w==='un-apartament'?'Un apartament':'Toate'}</button>
                  ))}
                </div>
              )}
              <span style={{fontSize:10,color:'rgba(147,197,253,0.35)',fontFamily:'monospace'}}>
                {calStart===calEnd?calStart:`${calStart} → ${calEnd}`}
              </span>
            </div>
            <div style={{padding:'6px 16px',fontSize:10,color:'rgba(147,197,253,0.35)'}}>
              „▶ Pornește scanul" necesită ApartScan.app instalat o dată pe acest Mac (instalare făcută deja) — pornește Terminalul automat, cu comanda potrivită. Butonul 📋 copiază comanda, pentru rulare manuală.
            </div>

            {showAddExtra&&(
              <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(196,181,253,0.12)',
                background:'rgba(196,181,253,0.04)',display:'flex',gap:8,flexWrap:'wrap' as const,alignItems:'center'}}>
                <input placeholder="Nume locație" value={extraForm.nume} onChange={e=>setExtraForm(f=>({...f,nume:e.target.value}))} style={{...inpSm,flex:'1 1 140px'}}/>
                <input placeholder="Link Booking" value={extraForm.linkBooking} onChange={e=>setExtraForm(f=>({...f,linkBooking:e.target.value}))} style={{...inpSm,flex:'2 1 220px'}}/>
                <input placeholder="Link Airbnb" value={extraForm.linkAirbnb} onChange={e=>setExtraForm(f=>({...f,linkAirbnb:e.target.value}))} style={{...inpSm,flex:'2 1 220px'}}/>
                <button onClick={saveExtraLocation} disabled={savingExtra} style={{
                  padding:'6px 14px',borderRadius:6,fontSize:12,cursor:'pointer',fontWeight:700,
                  border:'1px solid rgba(196,181,253,0.35)',background:'rgba(196,181,253,0.12)',color:'#C4B5FD',
                  opacity:savingExtra?0.5:1,
                }}>{savingExtra?'...':'✓ Salvează'}</button>
              </div>
            )}

            {calTableView ? (()=>{
              // Rânduri normalizate — "toate" (apartamentele noastre) sau "un apartament" (unul
              // singur ales din selector, poate fi și o locație extra) folosesc EXACT același
              // tabel, doar sursa rândurilor diferă. Cerut direct: la Zi/Săptămână, un singur
              // apartament tot trebuie scanabil/vizibil, nu doar toate deodată.
              type Row = {id:string,nota:string,_bk:boolean,_ab:boolean}
              const rows:Row[] = calWho==='toate'
                ? apts.map(a=>({id:a.id,nota:a.nota,_bk:!!a._bk,_ab:!!a._ab}))
                : calSource==='apt'
                  ? (selApt?[{id:selApt.id,nota:selApt.nota,_bk:!!selApt._bk,_ab:!!selApt._ab}]:[])
                  : (selExtra?[{id:selExtra.id,nota:selExtra.nume,_bk:!!selExtra.link_booking,_ab:!!selExtra.link_airbnb}]:[])
              // Disponibilitate REALĂ (rezervările noastre) — cerut direct, ca să recomande ce
              // apartamente sunt chiar libere pentru perioada aleasă, nu doar ce preț au. Sortate
              // libere primele, ca recomandarea să sară în ochi, nu doar ca simplă coloană.
              // Nu se aplică locațiilor extra (nu sunt în rezervările noastre).
              const withOcc = rows.map(r=>({r,occ:compareSource==='extra'?-1:compareDays.filter(d=>isOccupiedOn(r.id,d)).length}))
              const rowsSorted = [...withOcc].sort((x,y)=>x.occ-y.occ)
              const freeCount = withOcc.filter(x=>x.occ===0).length
              return(
              <div style={{padding:'12px 16px',overflowX:'auto' as const}}>
                <div style={{fontSize:10,color:'rgba(147,197,253,0.4)',marginBottom:10,display:'flex',gap:14,flexWrap:'wrap' as const}}>
                  <span><span style={{color:'#7BC8FF'}}>🏨</span> Booking</span>
                  <span><span style={{color:'#F87171'}}>🏠</span> Airbnb</span>
                  <span>· {rows.length} {rows.length===1?'locație':'locații'}</span>
                  {compareSource==='apt'&&rows.length>0&&<span style={{color:'#4ADE80',fontWeight:700}}>· 🟢 {freeCount} libere toată perioada{calWho==='toate'?' — recomandate primele':''}</span>}
                </div>
                {!rows.length ? (
                  <div style={{padding:'24px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>
                    {calWho==='toate'?'Niciun apartament cu link de Booking sau Airbnb.':'Alege un apartament sau o locație extra din selector.'}
                  </div>
                ) : (
                <table style={{borderCollapse:'collapse' as const,width:'100%',minWidth:compareDays.length>1?820:420}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:'left' as const,padding:'6px 10px',fontSize:11,color:'rgba(147,197,253,0.5)',borderBottom:'1px solid rgba(159,215,255,0.1)'}}>Locație</th>
                      <th style={{textAlign:'center' as const,padding:'6px 10px',fontSize:11,color:'rgba(147,197,253,0.5)',borderBottom:'1px solid rgba(159,215,255,0.1)',whiteSpace:'nowrap' as const}}>Disponibil</th>
                      {compareDays.map(d=>(
                        <th key={d} style={{textAlign:'center' as const,padding:'6px 10px',fontSize:11,color:'rgba(147,197,253,0.5)',borderBottom:'1px solid rgba(159,215,255,0.1)',whiteSpace:'nowrap' as const}}>
                          {new Date(d+'T12:00:00').toLocaleDateString('ro-RO',{weekday:'short',day:'2-digit',month:'2-digit'})}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsSorted.map(({r,occ},i)=>(
                      <tr key={r.id} style={{background:i%2?'rgba(255,255,255,0.015)':'transparent'}}>
                        <td style={{padding:'8px 10px',fontSize:13,fontWeight:700,color:'#E8F4FF',borderBottom:'1px solid rgba(159,215,255,0.05)'}}>
                          {r.nota}
                          {!r._bk&&<span style={{marginLeft:6,fontSize:10,color:'rgba(251,191,36,0.7)'}} title="Fără link Booking">🏨✕</span>}
                          {!r._ab&&<span style={{marginLeft:4,fontSize:10,color:'rgba(251,191,36,0.7)'}} title="Fără link Airbnb">🏠✕</span>}
                        </td>
                        <td style={{padding:'8px 10px',textAlign:'center' as const,borderBottom:'1px solid rgba(159,215,255,0.05)',whiteSpace:'nowrap' as const}}>
                          {occ<0
                            ?<span style={{color:'rgba(147,197,253,0.35)',fontSize:12}} title="Locație extra — nu e în rezervările noastre">—</span>
                            :occ===0
                              ?<span style={{color:'#4ADE80',fontWeight:700,fontSize:12}}>🟢 Liber</span>
                              :occ===compareDays.length
                                ?<span style={{color:'#F87171',fontWeight:700,fontSize:12}}>🔴 Ocupat</span>
                                :<span style={{color:'#FCD34D',fontWeight:700,fontSize:12}}>🟡 {compareDays.length-occ}/{compareDays.length} libere</span>}
                        </td>
                        {compareDays.map(d=>{
                          const dayData = compareData[r.id]?.[d] || {}
                          // Mai multe scanari pentru aceeasi zi, cu numar diferit de oaspeti (ex.
                          // 2 si 4), raman AMBELE — nu se mai suprascriu — si se afiseaza in
                          // paralel aici, cate un mini-rand per numar de oaspeti, cerut direct.
                          const guestKeys = Object.keys(dayData).sort((a,b)=>Number(a)-Number(b))
                          const occupiedDay = compareSource==='apt'&&isOccupiedOn(r.id,d)
                          return(
                            <td key={d} title={occupiedDay?'Ocupat (rezervare existentă)':'Liber'} style={{padding:'8px 10px',textAlign:'center' as const,
                              borderBottom:'1px solid rgba(159,215,255,0.05)',background:occupiedDay?'rgba(248,113,113,0.06)':'transparent'}}>
                              {guestKeys.length<=1 ? (() => {
                                const entry = dayData[guestKeys[0]]
                                return (<>
                                  <div style={{fontSize:12,fontFamily:'monospace',color:'#7BC8FF'}}>{entry?.booking?`${entry.booking}`:'—'}</div>
                                  <div style={{fontSize:12,fontFamily:'monospace',color:'#F87171'}}>{entry?.airbnb?`${entry.airbnb}`:'—'}</div>
                                </>)
                              })() : guestKeys.map(g=>(
                                <div key={g} style={{marginBottom:4}}>
                                  <div style={{fontSize:9,color:'rgba(147,197,253,0.4)',fontWeight:700}}>{g}p</div>
                                  <div style={{fontSize:12,fontFamily:'monospace',color:'#7BC8FF'}}>{dayData[g]?.booking?`${dayData[g].booking}`:'—'}</div>
                                  <div style={{fontSize:12,fontFamily:'monospace',color:'#F87171'}}>{dayData[g]?.airbnb?`${dayData[g].airbnb}`:'—'}</div>
                                </div>
                              ))}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
              )})() : !apts.length&&!extraLocations.length ? (
              <div style={{padding:'24px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>
                Niciun apartament cu link de Booking sau Airbnb.
              </div>
            ) : (
            <div style={{padding:'12px 16px'}}>
              <div style={{fontSize:10,color:'rgba(147,197,253,0.4)',marginBottom:8,display:'flex',gap:14}}>
                <span><span style={{color:'#7BC8FF'}}>🏨</span> Booking</span>
                <span><span style={{color:'#F87171'}}>🏠</span> Airbnb</span>
                {selApt&&!selApt._bk&&<span style={{color:'rgba(251,191,36,0.7)'}}>⚠ fără link Booking</span>}
                {selApt&&!selApt._ab&&<span style={{color:'rgba(251,191,36,0.7)'}}>⚠ fără link Airbnb</span>}
                {selExtra&&!selExtra.link_booking&&<span style={{color:'rgba(251,191,36,0.7)'}}>⚠ fără link Booking</span>}
                {selExtra&&!selExtra.link_airbnb&&<span style={{color:'rgba(251,191,36,0.7)'}}>⚠ fără link Airbnb</span>}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6}}>
                {zileSapt.map(z=>(
                  <div key={z} style={{textAlign:'center' as const,fontSize:10,color:'rgba(147,197,253,0.4)',
                    textTransform:'uppercase' as const,letterSpacing:'.04em',padding:'0 0 4px'}}>{z}</div>
                ))}
                {cells.map((d,idx)=>{
                  if(d===null) return <div key={idx}/>
                  const dateStr = `${calMonth}-${pad(d)}`
                  const isPast = dateStr<today
                  const isToday = dateStr===today
                  const dayData = calData[dateStr] || {}
                  const guestKeys = Object.keys(dayData).sort((a,b)=>Number(a)-Number(b))
                  const latestUpdatedAt = guestKeys.map(g=>dayData[g]?.updatedAt).filter(Boolean).sort().pop()
                  return(
                    <div key={idx} title={latestUpdatedAt?`Actualizat ${new Date(latestUpdatedAt).toLocaleString('ro-RO',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}`:''} style={{
                      borderRadius:8,padding:'8px 6px',minHeight:64,
                      border:`1px solid ${isToday?'rgba(248,113,113,0.4)':'rgba(159,215,255,0.08)'}`,
                      background:isToday?'rgba(248,113,113,0.08)':isPast?'rgba(159,215,255,0.02)':'rgba(214,228,244,0.03)',
                      opacity:isPast?0.45:1,
                    }}>
                      <div style={{fontSize:11,fontWeight:700,textDecoration:isPast?'line-through':'none',
                        color:isToday?'#F87171':'#E8F4FF',marginBottom:4}}>{d}</div>
                      {guestKeys.length<=1 ? (() => {
                        const entry = dayData[guestKeys[0]]
                        return (<>
                          <div style={{fontSize:11,fontFamily:'monospace',color:'#7BC8FF'}}>{entry?.booking?`${entry.booking} lei`:'—'}</div>
                          <div style={{fontSize:11,fontFamily:'monospace',color:'#F87171'}}>{entry?.airbnb?`${entry.airbnb} lei`:'—'}</div>
                        </>)
                      })() : guestKeys.map(g=>(
                        <div key={g} style={{marginBottom:3}}>
                          <div style={{fontSize:9,color:'rgba(147,197,253,0.4)',fontWeight:700}}>{g}p</div>
                          <div style={{fontSize:10,fontFamily:'monospace',color:'#7BC8FF'}}>{dayData[g]?.booking?`${dayData[g].booking} lei`:'—'}</div>
                          <div style={{fontSize:10,fontFamily:'monospace',color:'#F87171'}}>{dayData[g]?.airbnb?`${dayData[g].airbnb} lei`:'—'}</div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
            )}
          </div>
          )
        })()}
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
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>Ziua scanării</span>
              <input type="date" value={scanDayMonitor} onChange={e=>setScanDayMonitor(e.target.value)}
                style={{padding:'4px 8px',borderRadius:6,fontSize:12,border:'1px solid rgba(196,181,253,0.25)',background:'rgba(35,28,65,0.75)',color:'#C4B5FD',outline:'none'}}/>
            </div>
            <div style={{marginLeft:'auto',fontSize:11,color:'rgba(147,197,253,0.4)',display:'flex',alignItems:'center',gap:4}}>
              <span>💻</span>
              <code style={{fontFamily:'monospace',background:'rgba(99,179,237,0.08)',padding:'2px 8px',borderRadius:4,color:'#93C5FD',fontSize:10,maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                {monitorScanCommand}
              </code>
              <a href={monitorScanUrl} title={monitorScanCommand} style={{
                padding:'3px 10px',borderRadius:5,fontSize:10,cursor:'pointer',fontWeight:700,textDecoration:'none',
                border:'1px solid rgba(74,222,128,0.35)',background:'rgba(74,222,128,0.12)',color:'#4ADE80',
                opacity:monitorScanDisabled?0.45:1,pointerEvents:monitorScanDisabled?'none':'auto',
              }}>▶ Pornește</a>
              <button onClick={copyScanCommand} disabled={monitorScanDisabled} style={{
                padding:'3px 8px',borderRadius:5,fontSize:10,cursor:'pointer',fontWeight:600,
                border:`1px solid ${commandCopied?'rgba(74,222,128,0.35)':'rgba(99,179,237,0.25)'}`,
                background:commandCopied?'rgba(74,222,128,0.1)':'rgba(99,179,237,0.08)',
                color:commandCopied?'#4ADE80':'#93C5FD',
                opacity:monitorScanDisabled?0.45:1,
              }}>{commandCopied?'✓ Copiat!':'📋 Copiază'}</button>
            </div>
          </div>

          {/* Date extra pentru multi-scan */}
          {extraPairs.map((pair,idx)=>(
            <div key={idx} style={{padding:'8px 16px',borderBottom:'1px solid rgba(99,179,237,0.06)',
              display:'flex',alignItems:'center',gap:10,background:'rgba(99,179,237,0.03)',flexWrap:'wrap' as const}}>
              <span style={{fontSize:10,color:'rgba(147,197,253,0.4)',minWidth:16}}>+{idx+1}</span>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:11,color:'rgba(147,197,253,0.4)'}}>Check-in</span>
                <input type="date" value={pair.ci} onChange={e=>{
                  const d=new Date(e.target.value+'T12:00:00');d.setDate(d.getDate()+1)
                  setExtraPairs(prev=>prev.map((p,i)=>i===idx?{ci:e.target.value,co:fmt(d)}:p))
                }} style={{padding:'4px 8px',borderRadius:6,fontSize:12,border:'1px solid rgba(100,160,255,0.15)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',outline:'none'}}/>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:11,color:'rgba(147,197,253,0.4)'}}>Check-out</span>
                <input type="date" value={pair.co} onChange={e=>setExtraPairs(prev=>prev.map((p,i)=>i===idx?{...p,co:e.target.value}:p))}
                  style={{padding:'4px 8px',borderRadius:6,fontSize:12,border:'1px solid rgba(100,160,255,0.15)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',outline:'none'}}/>
              </div>
              <button onClick={()=>setExtraPairs(prev=>prev.filter((_,i)=>i!==idx))}
                style={{marginLeft:'auto',padding:'3px 8px',borderRadius:5,fontSize:11,cursor:'pointer',
                  border:'1px solid rgba(248,113,113,0.2)',background:'rgba(248,113,113,0.06)',color:'#F87171',fontWeight:600}}>
                ✕
              </button>
            </div>
          ))}
          <div style={{padding:'8px 16px',borderBottom:'1px solid rgba(99,179,237,0.06)',display:'flex',alignItems:'center',gap:8}}>
            <button onClick={()=>{
              // Ziua urmatoare dupa ULTIMA data setata (nu un offset fix fata de azi) — cerut
              // direct: daca ultima e 17.10, urmatoarea adaugata trebuie sa fie 18.10.
              const lastCi = extraPairs.length ? extraPairs[extraPairs.length-1].ci : checkinMonitor
              const d0=new Date((lastCi||today)+'T12:00:00');d0.setDate(d0.getDate()+1)
              const ci=fmt(d0)
              const d=new Date(ci+'T12:00:00');d.setDate(d.getDate()+1)
              setExtraPairs(prev=>[...prev,{ci,co:fmt(d)}])
            }} style={{padding:'4px 14px',borderRadius:6,fontSize:11,cursor:'pointer',fontWeight:600,
              border:'1px solid rgba(99,179,237,0.25)',background:'rgba(99,179,237,0.07)',color:'#93C5FD'}}>
              + Adaugă dată
            </button>
            {extraPairs.length>0&&(
              <span style={{fontSize:10,color:'rgba(147,197,253,0.35)',fontFamily:'monospace'}}>
                {1+extraPairs.length} perioade în comandă
              </span>
            )}
            {extraPairs.length>0&&(
              <button onClick={()=>setExtraPairs([])}
                style={{padding:'3px 8px',borderRadius:5,fontSize:10,cursor:'pointer',
                  border:'1px solid rgba(159,215,255,0.1)',background:'transparent',color:'rgba(159,215,255,0.3)'}}>
                Resetează
              </button>
            )}
          </div>

          {/* Zile salvate pentru perioada selectata */}
          {(()=>{
            const days=Array.from(new Set(history
              .filter((h:any)=>h.checkin===checkinMonitor&&h.checkout===checkoutMonitor)
              .map((h:any)=>scanDay(h))))
            if(!days.length) return null
            return(
              <div style={{padding:'8px 16px',borderBottom:'1px solid rgba(99,179,237,0.08)',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const}}>
                <span style={{fontSize:10,color:'rgba(147,197,253,0.4)',marginRight:3}}>Zile salvate:</span>
                {days.map(day=>(
                  <button key={day} onClick={()=>setScanDayMonitor(day)} style={{
                    padding:'3px 9px',borderRadius:6,fontSize:10,cursor:'pointer',
                    border:`1px solid ${scanDayMonitor===day?'rgba(196,181,253,0.45)':'rgba(99,179,237,0.15)'}`,
                    background:scanDayMonitor===day?'rgba(196,181,253,0.12)':'rgba(99,179,237,0.04)',
                    color:scanDayMonitor===day?'#C4B5FD':'rgba(147,197,253,0.5)',
                  }}>
                    {new Date(day+'T12:00:00').toLocaleDateString('ro-RO',{weekday:'short',day:'2-digit',month:'2-digit'})}
                  </button>
                ))}
              </div>
            )
          })()}

          {/* View paralel Booking + Airbnb */}
          {loadingHistory?(
            <div style={{padding:'24px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>Se încarcă...</div>
          ):history.length===0?(
            <div style={{padding:'24px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>
              Nicio scanare — rulează scriptul din Terminal
            </div>
          ):(()=>{
            // Pentru fiecare zi afiseaza ultima scanare, comparata cu ultima zi scanata anterior.
            const periodScans = history.filter((h:any)=>h.checkin===checkinMonitor&&h.checkout===checkoutMonitor)
            const bkAll = periodScans.filter((h:any)=>!h.platform||h.platform==='booking')
            const abAll = periodScans.filter((h:any)=>h.platform==='airbnb')
            const lastBk = bkAll.find((h:any)=>scanDay(h)===scanDayMonitor)
            const lastAb = abAll.find((h:any)=>scanDay(h)===scanDayMonitor)
            const previousDayFor = (last:any, scans:any[]) => last
              ? scans.find((h:any)=>scanDay(h)<scanDay(last))
              : null
            const bkComparison = compareMarketScans(lastBk,previousDayFor(lastBk,bkAll))
            const abComparison = compareMarketScans(lastAb,previousDayFor(lastAb,abAll))

            const renderSummary = (last:any, platform:string, comparison:MarketComparison) => {
              if(!last) return null
              const icon=platform==='booking'?'🏨':'🏠'
              const color=platform==='booking'?'#7BC8FF':'#F87171'
              const previous=comparison.previous
              const delta=comparison.totalDelta

              // All scans for this platform on this day (for hourly sparkline)
              const allPlatScans=(platform==='booking'?bkAll:abAll)
                .filter((h:any)=>scanDay(h)===scanDayMonitor)
                .sort((a:any,b:any)=>scanTime(a)-scanTime(b))
              const maxTP=allPlatScans.length?Math.max(...allPlatScans.map((s:any)=>s.total_properties||0)):0
              const minTP=allPlatScans.length?Math.min(...allPlatScans.map((s:any)=>s.total_properties||0)):0
              const tpRange=maxTP-minTP||1

              return(
                <div style={{padding:'12px 14px',borderBottom:'1px solid rgba(99,179,237,0.06)'}}>
                  {/* Header */}
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                    <span style={{fontSize:12,fontWeight:700,color}}>{icon} {platform==='booking'?'Booking':'Airbnb'}</span>
                    {previous&&(
                      <span style={{fontSize:10,color:'rgba(147,197,253,0.32)',fontFamily:'monospace'}}>
                        {fmtDT(previous.scanned_at)} → {fmtDT(last.scanned_at)}
                      </span>
                    )}
                    {!previous&&(
                      <span style={{fontSize:10,color:'rgba(147,197,253,0.32)',fontFamily:'monospace'}}>{fmtDT(last.scanned_at)} · prima zi scanată</span>
                    )}
                  </div>
                  {/* Metrics */}
                  <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' as const}}>
                    {/* Properties comparison */}
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      {previous&&(
                        <>
                          <div>
                            <div style={{fontSize:9,color:'rgba(147,197,253,0.3)',marginBottom:1}}>anterior</div>
                            <div style={{fontSize:22,fontWeight:700,color:'rgba(214,228,244,0.35)',fontFamily:'monospace',lineHeight:1}}>{previous.total_properties??'?'}</div>
                          </div>
                          <span style={{fontSize:16,color:'rgba(147,197,253,0.2)'}}>→</span>
                        </>
                      )}
                      <div>
                        <div style={{fontSize:9,color:'rgba(147,197,253,0.3)',marginBottom:1}}>acum</div>
                        <div style={{fontSize:22,fontWeight:700,color:'#E8F4FF',fontFamily:'monospace',lineHeight:1}}>{last.total_properties??'?'}</div>
                        <div style={{fontSize:9,color:'rgba(147,197,253,0.3)',marginTop:1}}>locații</div>
                      </div>
                      {delta!=null&&delta!==0&&(
                        <div style={{padding:'4px 8px',borderRadius:6,fontSize:11,fontWeight:700,
                          background:delta<0?'rgba(74,222,128,0.12)':'rgba(248,113,113,0.1)',
                          color:delta<0?'#4ADE80':'#F87171',border:`1px solid ${delta<0?'rgba(74,222,128,0.2)':'rgba(248,113,113,0.2)'}`}}>
                          {delta<0?`▼ ${Math.abs(delta)}`:`▲ +${delta}`}
                        </div>
                      )}
                      {delta===0&&(
                        <div style={{padding:'4px 8px',borderRadius:6,fontSize:10,color:'rgba(147,197,253,0.35)',background:'rgba(147,197,253,0.05)',border:'1px solid rgba(147,197,253,0.1)'}}>= stabil</div>
                      )}
                      {allPlatScans.length>=1&&(
                        <div style={{display:'flex',gap:3,flexWrap:'wrap' as const}}>
                          {allPlatScans.map((scan:any,i:number)=>{
                            const prevTP=i===0?(previous?.total_properties??null):allPlatScans[i-1].total_properties
                            if(prevTP===null) return null
                            const diff=prevTP-scan.total_properties
                            const st=new Date(scan.scanned_at).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})
                            const isRes=diff>0,isNew=diff<0
                            return(
                              <div key={i} style={{padding:'3px 7px',borderRadius:5,fontSize:9,fontWeight:700,
                                background:isRes?'rgba(74,222,128,0.07)':isNew?'rgba(248,113,113,0.06)':'rgba(147,197,253,0.04)',
                                color:isRes?'#4ADE80':isNew?'#F87171':'rgba(147,197,253,0.3)',
                                border:`1px solid ${isRes?'rgba(74,222,128,0.15)':isNew?'rgba(248,113,113,0.12)':'rgba(147,197,253,0.08)'}`,
                                display:'flex',flexDirection:'column' as const,alignItems:'center',gap:0}}>
                                <div style={{fontSize:7,opacity:0.55,fontWeight:400}}>{st}</div>
                                <div>{isRes?`▼ ${diff}`:isNew?`▲ +${Math.abs(diff)}`:'= 0'}</div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    {/* Price + churn badges */}
                    <div style={{display:'flex',gap:6,marginLeft:'auto',flexWrap:'wrap' as const}}>
                      <div style={{padding:'5px 10px',borderRadius:7,background:'rgba(252,211,77,0.06)',border:'1px solid rgba(252,211,77,0.15)'}}>
                        <div style={{fontSize:9,color:'rgba(252,211,77,0.5)',marginBottom:2}}>minim piață</div>
                        <div style={{fontSize:14,fontWeight:700,color:'#FCD34D',fontFamily:'monospace'}}>{last.lowest_price??'—'} <span style={{fontSize:9,fontWeight:400}}>lei</span></div>
                        {comparison.lowestDelta!=null&&comparison.lowestDelta!==0&&(
                          <div style={{fontSize:9,fontWeight:600,color:comparison.lowestDelta>0?'#F87171':'#4ADE80',marginTop:1}}>
                            {comparison.lowestDelta>0?`▲ +${comparison.lowestDelta}`:`▼ ${comparison.lowestDelta}`} lei
                          </div>
                        )}
                        {comparison.lowestDelta===0&&(
                          <div style={{fontSize:9,color:'rgba(147,197,253,0.28)',marginTop:1}}>neschimbat</div>
                        )}
                      </div>
                      {(comparison.entered.length>0||comparison.exited.length>0)&&(
                        <div style={{padding:'5px 10px',borderRadius:7,background:'rgba(99,179,237,0.05)',border:'1px solid rgba(99,179,237,0.1)'}}>
                          <div style={{fontSize:9,color:'rgba(147,197,253,0.38)',marginBottom:2}}>top rotație</div>
                          <div style={{fontSize:13,fontWeight:700,fontFamily:'monospace',display:'flex',gap:5}}>
                            {comparison.entered.length>0&&<span style={{color:'#4ADE80'}}>+{comparison.entered.length}</span>}
                            {comparison.exited.length>0&&<span style={{color:'#F87171'}}>-{comparison.exited.length}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Hourly sparkline */}
                  {allPlatScans.length>1&&(
                    <div style={{marginTop:10}}>
                      <div style={{fontSize:8,color:'rgba(147,197,253,0.28)',textTransform:'uppercase' as const,letterSpacing:'.05em',marginBottom:4}}>evoluție în zi · {allPlatScans.length} scanări</div>
                      <div style={{display:'flex',alignItems:'flex-end',gap:2,height:26}}>
                        {allPlatScans.map((scan:any,i:number)=>{
                          const pct=((scan.total_properties||0)-minTP)/tpRange
                          const h=Math.round(5+pct*19)
                          const isLast=i===allPlatScans.length-1
                          return(
                            <div key={i} title={`${new Date(scan.scanned_at).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}: ${scan.total_properties} loc`}
                              style={{flex:1,height:h,borderRadius:2,minWidth:0,
                                background:isLast?color:'rgba(147,197,253,0.18)',
                                transition:'height 0.2s'}}/>
                          )
                        })}
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',marginTop:2}}>
                        <span style={{fontSize:8,color:'rgba(147,197,253,0.22)',fontFamily:'monospace'}}>
                          {new Date(allPlatScans[0].scanned_at).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}
                        </span>
                        <span style={{fontSize:8,color:color,fontFamily:'monospace',opacity:0.6}}>
                          {new Date(allPlatScans[allPlatScans.length-1].scanned_at).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}
                        </span>
                      </div>
                    </div>
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
              const enteredResults = new Set(comparison.entered)
              const icon = platform==='booking'?'🏨':'🏠'
              return(
                <div>
                  {/* Platform header */}
                  <div style={{padding:'8px 14px',background:'rgba(99,179,237,0.06)',
                    borderBottom:'1px solid rgba(99,179,237,0.08)',
                    display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontSize:12,fontWeight:700,color:'#93C5FD'}}>{icon} {platform.charAt(0).toUpperCase()+platform.slice(1)}</span>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:9,color:'rgba(196,181,253,0.55)',textTransform:'uppercase' as const}}>ultima scanare din zi</span>
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
                        <div style={{fontSize:12,color:'rgba(147,197,253,0.6)'}}>Nu ești în top 20 — min: <span style={{fontFamily:'monospace',fontWeight:700}}>{last.lowest_price} lei</span></div>
                      )}
                      {last.total_properties&&(
                        <span style={{fontSize:10,color:'rgba(147,197,253,0.4)',fontFamily:'monospace'}}>{last.total_properties} proprietăți disponibile</span>
                      )}
                    </div>
                  </div>
                  {/* Top 20 */}
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
                          {enteredResults.has(r)&&<span style={{fontSize:8,marginLeft:5,color:'#4ADE80'}}>A ÎNLOCUIT O LOCAȚIE</span>}
                        </div>
                      </div>
                      <div style={{fontFamily:'monospace',fontSize:12,fontWeight:700,flexShrink:0,
                        color:r.price===last.lowest_price?'#4ADE80':r.isOurs?'#93C5FD':'rgba(214,228,244,0.7)'}}>
                        {r.priceText||`${r.price} lei`}
                        {r.price===last.lowest_price&&<span style={{fontSize:8,marginLeft:3,color:'#4ADE80',verticalAlign:'super'}}>MIN</span>}
                      </div>
                    </div>
                  ))}
                  {comparison.replacements.length>0&&(
                    <div style={{padding:'8px 14px',borderTop:'1px solid rgba(248,113,113,0.12)',background:'rgba(248,113,113,0.025)'}}>
                      <div style={{fontSize:9,color:'rgba(248,113,113,0.65)',textTransform:'uppercase' as const,letterSpacing:'.05em',marginBottom:6}}>Schimbări față de scanarea precedentă</div>
                      {comparison.replacements.map((pair:any,i:number)=>(
                        <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 18px 1fr',gap:5,alignItems:'center',padding:'4px 0',borderTop:i?'1px solid rgba(99,179,237,0.05)':'none'}}>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:8,color:'rgba(248,113,113,0.6)',marginBottom:1}}>IEȘIT / POSIBIL REZERVAT</div>
                            <div style={{fontSize:9,color:'rgba(214,228,244,0.4)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                              {pair.exited?`fost #${pair.exited.rank} · ${pair.exited.name}`:'—'}
                            </div>
                          </div>
                          <span style={{fontSize:11,color:'rgba(147,197,253,0.35)',textAlign:'center' as const}}>→</span>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:8,color:'rgba(74,222,128,0.65)',marginBottom:1}}>ÎNLOCUIT DE</div>
                            <div style={{fontSize:9,color:'rgba(214,228,244,0.65)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                              {pair.entered?`nou #${pair.entered.rank} · ${pair.entered.name}`:'—'}
                            </div>
                          </div>
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

            const bkDayScans=bkAll.filter((h:any)=>scanDay(h)===scanDayMonitor).sort((a:any,b:any)=>scanTime(a)-scanTime(b))
            const abDayScans=abAll.filter((h:any)=>scanDay(h)===scanDayMonitor).sort((a:any,b:any)=>scanTime(a)-scanTime(b))
            const intradayMap=new Map<string,any>()
            bkDayScans.forEach((h:any)=>{
              const t=new Date(h.scanned_at).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})
              intradayMap.set(t,{...(intradayMap.get(t)||{time:t}),booking:h.total_properties,bkPrice:h.lowest_price})
            })
            abDayScans.forEach((h:any)=>{
              const t=new Date(h.scanned_at).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})
              intradayMap.set(t,{...(intradayMap.get(t)||{time:t}),airbnb:h.total_properties,abPrice:h.lowest_price})
            })
            const intradayData=Array.from(intradayMap.values()).sort((a:any,b:any)=>a.time.localeCompare(b.time))
            const totalDayScans=bkDayScans.length+abDayScans.length

            if(!lastBk&&!lastAb) return(
              <div>
                {intradayData.length>=2&&(
                  <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(99,179,237,0.1)',background:'rgba(10,20,40,0.4)'}}>
                    <div style={{fontSize:10,fontWeight:700,color:'rgba(147,197,253,0.4)',textTransform:'uppercase' as const,letterSpacing:'.06em',marginBottom:10}}>Evoluție în zi · {totalDayScans} scanări · {scanDayMonitor}</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                      <div>
                        <div style={{fontSize:9,color:'rgba(147,197,253,0.35)',marginBottom:4}}>Proprietăți disponibile</div>
                        <ResponsiveContainer width="100%" height={90}>
                          <LineChart data={intradayData} margin={{top:2,right:6,bottom:0,left:0}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.07)"/>
                            <XAxis dataKey="time" tick={{fontSize:8,fill:'rgba(147,197,253,0.35)'}} tickLine={false} axisLine={false}/>
                            <YAxis tick={{fontSize:8,fill:'rgba(147,197,253,0.35)'}} tickLine={false} axisLine={false} width={26}/>
                            <Tooltip contentStyle={{background:'rgba(15,30,55,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:6,fontSize:10}} labelStyle={{color:'rgba(147,197,253,0.7)'}}/>
                            <Line type="monotone" dataKey="booking" stroke="#7BC8FF" strokeWidth={1.5} dot={{r:2,fill:'#7BC8FF'}} activeDot={{r:3}} connectNulls name="Booking"/>
                            <Line type="monotone" dataKey="airbnb" stroke="#F87171" strokeWidth={1.5} dot={{r:2,fill:'#F87171'}} activeDot={{r:3}} connectNulls name="Airbnb"/>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div>
                        <div style={{fontSize:9,color:'rgba(147,197,253,0.35)',marginBottom:4}}>Preț minim piață (lei)</div>
                        <ResponsiveContainer width="100%" height={90}>
                          <LineChart data={intradayData} margin={{top:2,right:6,bottom:0,left:0}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.07)"/>
                            <XAxis dataKey="time" tick={{fontSize:8,fill:'rgba(147,197,253,0.35)'}} tickLine={false} axisLine={false}/>
                            <YAxis tick={{fontSize:8,fill:'rgba(252,211,77,0.35)'}} tickLine={false} axisLine={false} width={30}/>
                            <Tooltip contentStyle={{background:'rgba(15,30,55,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:6,fontSize:10}} labelStyle={{color:'rgba(147,197,253,0.7)'}}/>
                            <Line type="monotone" dataKey="bkPrice" stroke="#7BC8FF" strokeWidth={1.5} dot={{r:2,fill:'#7BC8FF'}} activeDot={{r:3}} connectNulls name="Booking"/>
                            <Line type="monotone" dataKey="abPrice" stroke="#F87171" strokeWidth={1.5} dot={{r:2,fill:'#F87171'}} activeDot={{r:3}} connectNulls name="Airbnb"/>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
                <div style={{padding:'28px 16px',textAlign:'center' as const,color:'rgba(147,197,253,0.35)',fontSize:11}}>
                  Nu există scanări în ziua {scanDayMonitor||'selectată'} pentru perioada {checkinMonitor} → {checkoutMonitor}.
                </div>
              </div>
            )

            return(
              <div>
                {intradayData.length>=2&&(
                  <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(99,179,237,0.1)',background:'rgba(10,20,40,0.4)'}}>
                    <div style={{fontSize:10,fontWeight:700,color:'rgba(147,197,253,0.4)',textTransform:'uppercase' as const,letterSpacing:'.06em',marginBottom:10}}>Evoluție în zi · {totalDayScans} scanări · {scanDayMonitor}</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                      <div>
                        <div style={{fontSize:9,color:'rgba(147,197,253,0.35)',marginBottom:4}}>Proprietăți disponibile</div>
                        <ResponsiveContainer width="100%" height={90}>
                          <LineChart data={intradayData} margin={{top:2,right:6,bottom:0,left:0}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.07)"/>
                            <XAxis dataKey="time" tick={{fontSize:8,fill:'rgba(147,197,253,0.35)'}} tickLine={false} axisLine={false}/>
                            <YAxis tick={{fontSize:8,fill:'rgba(147,197,253,0.35)'}} tickLine={false} axisLine={false} width={26}/>
                            <Tooltip contentStyle={{background:'rgba(15,30,55,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:6,fontSize:10}} labelStyle={{color:'rgba(147,197,253,0.7)'}}/>
                            <Line type="monotone" dataKey="booking" stroke="#7BC8FF" strokeWidth={1.5} dot={{r:2,fill:'#7BC8FF'}} activeDot={{r:3}} connectNulls name="Booking"/>
                            <Line type="monotone" dataKey="airbnb" stroke="#F87171" strokeWidth={1.5} dot={{r:2,fill:'#F87171'}} activeDot={{r:3}} connectNulls name="Airbnb"/>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div>
                        <div style={{fontSize:9,color:'rgba(147,197,253,0.35)',marginBottom:4}}>Preț minim piață (lei)</div>
                        <ResponsiveContainer width="100%" height={90}>
                          <LineChart data={intradayData} margin={{top:2,right:6,bottom:0,left:0}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.07)"/>
                            <XAxis dataKey="time" tick={{fontSize:8,fill:'rgba(147,197,253,0.35)'}} tickLine={false} axisLine={false}/>
                            <YAxis tick={{fontSize:8,fill:'rgba(252,211,77,0.35)'}} tickLine={false} axisLine={false} width={30}/>
                            <Tooltip contentStyle={{background:'rgba(15,30,55,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:6,fontSize:10}} labelStyle={{color:'rgba(147,197,253,0.7)'}}/>
                            <Line type="monotone" dataKey="bkPrice" stroke="#7BC8FF" strokeWidth={1.5} dot={{r:2,fill:'#7BC8FF'}} activeDot={{r:3}} connectNulls name="Booking"/>
                            <Line type="monotone" dataKey="abPrice" stroke="#F87171" strokeWidth={1.5} dot={{r:2,fill:'#F87171'}} activeDot={{r:3}} connectNulls name="Airbnb"/>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
                <div style={{borderBottom:'1px solid rgba(99,179,237,0.1)',background:'rgba(99,179,237,0.025)'}}>
                  <div style={{padding:'8px 14px',fontSize:10,fontWeight:700,color:'rgba(147,197,253,0.5)',textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Ultima scanare din {scanDayMonitor} · comparație cu ultima zi scanată anterior</div>
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

        {mainTab==='decizii'&&(()=>{
          const transitions=buildMarketTransitions(evolutieData)
          const validScans=evolutieData.filter((scan:any)=>scan.total_properties!=null&&scan.lowest_price!=null)
          const platformStats=(['booking','airbnb'] as const).map(platform=>{
            const platformTransitions=transitions.filter(t=>t.platform===platform)
            const disappearing=platformTransitions.map(t=>t.unavailablePerHour).filter(v=>v>0)
            const risingPrices=platformTransitions.map(t=>t.priceDeltaPerHour).filter(v=>v>0)
            return {
              platform,
              transitions:platformTransitions.length,
              avgPace:avg(disappearing),
              medianPace:median(disappearing),
              avgPriceRise:avg(risingPrices),
            }
          })
          const hourly=Array.from({length:24},(_,hour)=>{
            const rows=transitions.filter(t=>t.hour===hour)
            return {hour,scans:rows.length,pace:avg(rows.map(r=>r.unavailablePerHour)),price:avg(rows.map(r=>r.priceDeltaPerHour))}
          }).filter(row=>row.scans>0).sort((a,b)=>b.pace-a.pace)
          const busiestHour=hourly[0]

          const groups=new Map<string,any[]>()
          validScans.forEach((scan:any)=>{
            const key=`${scanPlatform(scan)}|${scan.checkin}|${scan.checkout}`
            groups.set(key,[...(groups.get(key)||[]),scan])
          })
          const recommendations=Array.from(groups.values()).flatMap(group=>{
            const sorted=group.sort((a,b)=>scanTime(b)-scanTime(a))
            const current=sorted[0]
            const previous=sorted.slice(1).find(candidate=>{
              const elapsed=(scanTime(current)-scanTime(candidate))/3600000
              return elapsed>=0.15&&elapsed<=12
            })
            if(!previous) return []
            const comparison=compareMarketScans(current,previous)
            const hours=(scanTime(current)-scanTime(previous))/3600000
            const pace=comparison.totalDelta==null?0:-comparison.totalDelta/hours
            const leadDays=Math.ceil((new Date(current.checkin+'T12:00:00').getTime()-Date.now())/86400000)
            const topPrices=(current.top5||[]).map((r:any)=>r.price).filter((v:any)=>typeof v==='number')
            const marketMedian=Math.round(median(topPrices))
            const ourAvailable=current.ab_disponibile
            let action='Menține prețul'
            let color='#93C5FD'
            let adjustment='0%'
            let reason='Piața nu oferă încă un semnal suficient de puternic.'
            if(ourAvailable!=null&&ourAvailable<=3&&pace>=1.5){
              action='Crește ferm'
              adjustment='+10% până la +15%'
              color='#4ADE80'
              reason=`Mai avem doar ${ourAvailable}/13 locații disponibile, iar piața pierde ${pace.toFixed(1)} locații/oră.`
            }else if(pace>=5){
              action='Crește prețul'
              adjustment='+8% până la +12%'
              color='#4ADE80'
              reason=`Piața pierde ${pace.toFixed(1)} locații/oră; cererea este accelerată.`
            }else if(pace>=1.5){
              action='Crește prudent'
              adjustment='+3% până la +6%'
              color='#A7F3D0'
              reason=`Piața pierde ${pace.toFixed(1)} locații/oră; există presiune de cumpărare.`
            }else if(pace<=0&&leadDays<=3&&(ourAvailable==null||ourAvailable>=5)){
              action='Testează reducere'
              adjustment='-4% până la -7%'
              color='#FCD34D'
              reason='Check-in-ul este apropiat, iar disponibilitatea pieței nu scade.'
            }
            const confidence=sorted.length>=4?'ridicată':sorted.length>=2?'medie':'scăzută'
            return [{current,comparison,pace,leadDays,marketMedian,ourAvailable,action,adjustment,color,reason,confidence,samples:sorted.length}]
          }).filter(item=>item.leadDays>=0).sort((a,b)=>a.leadDays-b.leadDays||b.pace-a.pace).slice(0,16)

          const activeRecs=recommendations.filter((item:any)=>item.action!=='Menține prețul')
          const stableRecs=recommendations.filter((item:any)=>item.action==='Menține prețul')
          const latestScan=[...validScans].sort((a:any,b:any)=>scanTime(b)-scanTime(a))[0]

          return(
            <div>
              {/* Sumar stare */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
                <div style={{padding:'11px 14px',borderRadius:10,background:'rgba(99,179,237,0.06)',border:'1px solid rgba(99,179,237,0.12)'}}>
                  <div style={{fontSize:9,color:'rgba(147,197,253,0.5)',textTransform:'uppercase' as const,letterSpacing:'.07em',marginBottom:4}}>Perioade urmărite</div>
                  <div style={{fontSize:20,fontWeight:700,color:'#E8F4FF',fontFamily:'monospace'}}>{groups.size}</div>
                  <div style={{fontSize:10,color:'rgba(147,197,253,0.4)',marginTop:2}}>{validScans.length} scanări totale</div>
                </div>
                <div style={{padding:'11px 14px',borderRadius:10,background:activeRecs.length?'rgba(74,222,128,0.06)':'rgba(99,179,237,0.04)',border:`1px solid ${activeRecs.length?'rgba(74,222,128,0.2)':'rgba(99,179,237,0.1)'}`}}>
                  <div style={{fontSize:9,color:activeRecs.length?'rgba(74,222,128,0.6)':'rgba(147,197,253,0.45)',textTransform:'uppercase' as const,letterSpacing:'.07em',marginBottom:4}}>Semnal activ</div>
                  <div style={{fontSize:20,fontWeight:700,color:activeRecs.length?'#4ADE80':'rgba(214,228,244,0.35)',fontFamily:'monospace'}}>{activeRecs.length}</div>
                  <div style={{fontSize:10,color:'rgba(147,197,253,0.4)',marginTop:2}}>{stableRecs.length} stabile · {recommendations.length} total</div>
                </div>
                <div style={{padding:'11px 14px',borderRadius:10,background:'rgba(252,211,77,0.05)',border:'1px solid rgba(252,211,77,0.15)'}}>
                  <div style={{fontSize:9,color:'rgba(252,211,77,0.6)',textTransform:'uppercase' as const,letterSpacing:'.07em',marginBottom:4}}>Minim piață (ultima scan.)</div>
                  <div style={{fontSize:20,fontWeight:700,color:'#FCD34D',fontFamily:'monospace'}}>{latestScan?.lowest_price??'—'}{latestScan?.lowest_price?' lei':''}</div>
                  <div style={{fontSize:10,color:'rgba(147,197,253,0.4)',marginTop:2}}>{latestScan?`${latestScan.checkin?.slice(5)} · ${fmtDT(latestScan.scanned_at)}`:'nicio scanare'}</div>
                </div>
              </div>

              {recommendations.length===0?(
                <div style={{...panel,padding:'40px 16px',textAlign:'center' as const,color:'rgba(147,197,253,0.35)',fontSize:12,lineHeight:1.7}}>
                  Necesare minim 2 scanări pentru aceeași perioadă.
                  <div style={{fontSize:11,color:'rgba(147,197,253,0.22)',marginTop:6}}>Rulează scriptul de 2 ori la interval de 1–2 ore pentru aceleași date.</div>
                </div>
              ):(
                <>
                  {/* Acțiuni active */}
                  {activeRecs.length>0&&(
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:10,fontWeight:700,color:'rgba(74,222,128,0.65)',textTransform:'uppercase' as const,letterSpacing:'.07em',marginBottom:10}}>⚡ Acțiuni recomandate</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(255px,1fr))',gap:10}}>
                        {activeRecs.map((item:any)=>{
                          const topP=(item.current.top5||[]).map((r:any)=>r.price).filter((v:any)=>typeof v==='number') as number[]
                          const maxP=topP.length?Math.max(...topP):null
                          const dots=item.pace>=5?4:item.pace>=2?3:item.pace>=0.5?2:1
                          const urgLabel=item.leadDays===0?'AZI':item.leadDays===1?'MÂINE':`în ${item.leadDays} zile`
                          return(
                            <div key={`${item.current.platform}-${item.current.checkin}`}
                              style={{borderRadius:12,border:`1px solid ${item.color}35`,background:`${item.color}07`,padding:'14px'}}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                                <div>
                                  <span style={{fontSize:14,fontWeight:700,color:'#E8F4FF',fontFamily:'monospace'}}>{item.current.checkin.slice(5)}</span>
                                  <span style={{fontSize:9,fontWeight:700,color:item.leadDays<=1?'#FCD34D':'rgba(147,197,253,0.5)',marginLeft:7,background:item.leadDays<=1?'rgba(252,211,77,0.12)':'rgba(147,197,253,0.07)',padding:'2px 6px',borderRadius:4}}>{urgLabel}</span>
                                </div>
                                <span style={{fontSize:11,color:item.current.platform==='airbnb'?'rgba(248,113,113,0.7)':'rgba(99,179,237,0.7)'}}>{item.current.platform==='airbnb'?'🏠':'🏨'}</span>
                              </div>
                              {/* Price range */}
                              <div style={{display:'flex',gap:14,alignItems:'baseline',marginBottom:10}}>
                                <div>
                                  <div style={{fontSize:9,color:'rgba(147,197,253,0.4)',marginBottom:1}}>minim piață</div>
                                  <div style={{fontSize:22,fontWeight:700,color:'#E8F4FF',fontFamily:'monospace',lineHeight:1}}>{item.current.lowest_price??'—'} <span style={{fontSize:11,fontWeight:400}}>lei</span></div>
                                </div>
                                {item.marketMedian>0&&<div>
                                  <div style={{fontSize:9,color:'rgba(147,197,253,0.4)',marginBottom:1}}>median</div>
                                  <div style={{fontSize:15,fontWeight:600,color:'rgba(214,228,244,0.65)',fontFamily:'monospace'}}>{item.marketMedian} <span style={{fontSize:10,fontWeight:400}}>lei</span></div>
                                </div>}
                                {maxP&&<div>
                                  <div style={{fontSize:9,color:'rgba(147,197,253,0.4)',marginBottom:1}}>al 20-lea</div>
                                  <div style={{fontSize:15,fontWeight:600,color:'rgba(214,228,244,0.45)',fontFamily:'monospace'}}>{maxP} <span style={{fontSize:10,fontWeight:400}}>lei</span></div>
                                </div>}
                              </div>
                              {/* Signal dots */}
                              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                                <div style={{display:'flex',gap:3}}>
                                  {[1,2,3,4].map(d=>(
                                    <div key={d} style={{width:9,height:9,borderRadius:2,background:d<=dots?item.pace>0?'#FCD34D':'#F87171':'rgba(255,255,255,0.1)'}}/>
                                  ))}
                                </div>
                                <span style={{fontSize:10,color:'rgba(214,228,244,0.4)'}}>{item.pace>0?`${item.pace.toFixed(1)} loc./h dispar`:'piața nu scade'}</span>
                              </div>
                              {/* Action */}
                              <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:10,display:'flex',flexDirection:'column' as const,gap:4}}>
                                <div style={{display:'flex',alignItems:'center',gap:7}}>
                                  <span style={{fontSize:12,fontWeight:700,color:item.color}}>{item.action}</span>
                                  <span style={{fontSize:10,fontWeight:700,color:item.color,background:`${item.color}20`,padding:'2px 8px',borderRadius:5}}>{item.adjustment}</span>
                                </div>
                                <div style={{fontSize:10,color:'rgba(214,228,244,0.38)',lineHeight:1.4}}>{item.reason}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Perioade stabile */}
                  {stableRecs.length>0&&(
                    <div style={{...panel,marginBottom:14}}>
                      <div style={{padding:'8px 14px',borderBottom:'1px solid rgba(159,215,255,0.06)',fontSize:10,fontWeight:700,color:'rgba(147,197,253,0.4)',textTransform:'uppercase' as const,letterSpacing:'.06em'}}>✓ Perioade stabile — {stableRecs.length}</div>
                      {stableRecs.map((item:any,i:number)=>(
                        <div key={`${item.current.platform}-${item.current.checkin}`}
                          style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderBottom:i<stableRecs.length-1?'1px solid rgba(159,215,255,0.04)':'none'}}>
                          <span style={{fontSize:12,fontFamily:'monospace',color:'rgba(214,228,244,0.7)',minWidth:44}}>{item.current.checkin.slice(5)}</span>
                          <span style={{fontSize:10,color:'rgba(147,197,253,0.35)',minWidth:38}}>{item.leadDays===0?'azi':item.leadDays===1?'mâine':`+${item.leadDays}z`}</span>
                          <span style={{fontSize:10,color:item.current.platform==='airbnb'?'rgba(248,113,113,0.45)':'rgba(99,179,237,0.45)'}}>{item.current.platform==='airbnb'?'🏠':'🏨'}</span>
                          <span style={{fontSize:11,fontFamily:'monospace',color:'rgba(214,228,244,0.55)'}}>{item.current.lowest_price??'—'} lei</span>
                          {item.marketMedian>0&&<span style={{fontSize:10,color:'rgba(147,197,253,0.3)',fontFamily:'monospace'}}>med. {item.marketMedian}</span>}
                          <span style={{fontSize:10,color:'rgba(147,197,253,0.25)',marginLeft:'auto'}}>{item.pace.toFixed(1)}/h</span>
                          <span style={{fontSize:11,color:'rgba(74,222,128,0.45)'}}>✓</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Ore active - compact */}
              {hourly.length>0&&(
                <div style={{...panel}}>
                  <div style={{padding:'8px 14px',borderBottom:'1px solid rgba(159,215,255,0.06)',fontSize:10,fontWeight:700,color:'rgba(147,197,253,0.45)',textTransform:'uppercase' as const,letterSpacing:'.06em'}}>🕐 Ore cu cerere maximă</div>
                  <div style={{display:'flex',gap:8,padding:'10px 12px',flexWrap:'wrap' as const}}>
                    {hourly.slice(0,6).map(row=>(
                      <div key={row.hour} style={{padding:'8px 12px',borderRadius:8,background:'rgba(99,179,237,0.05)',border:'1px solid rgba(99,179,237,0.09)',minWidth:80}}>
                        <div style={{fontSize:14,fontWeight:700,color:'#E8F4FF',fontFamily:'monospace'}}>{String(row.hour).padStart(2,'0')}:00</div>
                        <div style={{fontSize:10,fontWeight:600,color:row.pace>0?'#FCD34D':'rgba(214,228,244,0.4)',marginTop:2}}>{row.pace.toFixed(1)}/h</div>
                        <div style={{fontSize:9,color:'rgba(147,197,253,0.3)',marginTop:1}}>{row.scans} obs.</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

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
                  <span style={{fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>📋 Detaliat — click pe zi pentru top 20</span>
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

        {mainTab==='strategie'&&(()=>{
          // ── Perf & Sezon (date proprii) ──
          const perfData=calcPerformanta()
          const {luniData,ziSaptData}=calcSezonalitate()
          const filteredPerf=stratAptFilter?perfData.filter(r=>r.aptId===stratAptFilter):perfData
          const sortedPerf=[...filteredPerf].sort((a,b)=>{
            const va=(a as any)[sortCol],vb=(b as any)[sortCol]
            if(va<vb) return sortDir==='asc'?-1:1
            if(va>vb) return sortDir==='asc'?1:-1
            return 0
          })
          const bestOcupare=[...perfData].sort((a,b)=>b.ocupare-a.ocupare)[0]
          const lowestADR=[...perfData].filter(r=>r.adr>0).sort((a,b)=>a.adr-b.adr)[0]
          const bestRevpar=[...perfData].sort((a,b)=>b.revpar-a.revpar)[0]
          const trendAptId=stratAptFilter||(apts[0]?.id||'')
          const trendData=perfData.filter(r=>r.aptId===trendAptId).map(r=>({luna:r.luna.slice(5),adr:r.adr}))
          const maxNopti=Math.max(...luniData.map(d=>d.nopti),1)

          // ── Helper preturi scanare ──
          const getTP=(scan:any)=>(scan.top5||[]).map((r:any)=>r.price).filter((v:any)=>typeof v==='number') as number[]

          // ── Evoluție piață ──
          const allPeriods=Array.from(new Set(evolutieData
            .filter((h:any)=>h.checkin&&h.checkout)
            .map((h:any)=>`${h.checkin}|${h.checkout}`)
          )).sort() as string[]
          const evolCI=stratEvolCheckin||(allPeriods[0]?.split('|')[0]||'')
          const evolCO=stratEvolCheckout||(allPeriods[0]?.split('|')[1]||'')
          const evolScans=evolutieData
            .filter((h:any)=>h.checkin===evolCI&&h.checkout===evolCO)
            .sort((a:any,b:any)=>scanTime(a)-scanTime(b))
          const evolPretData=evolScans.map((h:any)=>{
            const prices=getTP(h)
            return{timp:fmtDT(h.scanned_at),min:h.lowest_price,median:prices.length?Math.round(median(prices)):null,max20:prices.length?Math.max(...prices):null}
          })
          const evolPropsData=evolScans.map((h:any)=>({timp:fmtDT(h.scanned_at),proprietati:h.total_properties}))

          // ── Pattern orar ──
          const byOra:Record<number,{props:number[];mins:number[];meds:number[]}>={}
          for(const h of evolutieData){
            if(!h.checkin) continue
            const ci=new Date(h.checkin+'T12:00:00')
            if(stratPatternZi!==''&&ci.getDay()!==parseInt(stratPatternZi)) continue
            if(stratPatternLuna!==''&&ci.getMonth()+1!==parseInt(stratPatternLuna)) continue
            const ora=new Date(h.scanned_at).getHours()
            if(!byOra[ora]) byOra[ora]={props:[],mins:[],meds:[]}
            if(h.total_properties!=null) byOra[ora].props.push(h.total_properties)
            if(h.lowest_price!=null) byOra[ora].mins.push(h.lowest_price)
            const prices=getTP(h)
            if(prices.length) byOra[ora].meds.push(Math.round(median(prices)))
          }
          const orarData=Array.from({length:24},(_,i)=>{
            const b=byOra[i]
            return{ora:`${String(i).padStart(2,'0')}:00`,proprietati:b?.props.length?Math.round(avg(b.props)):null,minPret:b?.mins.length?Math.round(avg(b.mins)):null,medianPret:b?.meds.length?Math.round(avg(b.meds)):null,scanuri:b?.props.length||0}
          }).filter(d=>d.scanuri>0)

          // ── Sezonalitate piață ──
          const LNPIAT=['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']
          const byLuna:Record<number,{props:number[];mins:number[];meds:number[];max20s:number[]}>={}
          for(const h of evolutieData){
            if(!h.checkin) continue
            const luna=new Date(h.checkin+'T12:00:00').getMonth()+1
            if(!byLuna[luna]) byLuna[luna]={props:[],mins:[],meds:[],max20s:[]}
            if(h.total_properties!=null) byLuna[luna].props.push(h.total_properties)
            if(h.lowest_price!=null) byLuna[luna].mins.push(h.lowest_price)
            const prices=getTP(h)
            if(prices.length){byLuna[luna].meds.push(Math.round(median(prices)));byLuna[luna].max20s.push(Math.max(...prices))}
          }
          const sezonPiataData=Array.from({length:12},(_,i)=>{
            const l=i+1,b=byLuna[l]||{props:[],mins:[],meds:[],max20s:[]}
            return{luna:l,numeScurt:LNPIAT[i],proprietati:b.props.length?Math.round(avg(b.props)):0,minPret:b.mins.length?Math.round(avg(b.mins)):0,medianPret:b.meds.length?Math.round(avg(b.meds)):0,max20Pret:b.max20s.length?Math.round(avg(b.max20s)):0,scanuri:b.props.length}
          }).filter(d=>d.scanuri>0)

          return(
            <div>
              {/* Sub-section tabs */}
              <div style={{display:'flex',gap:0,marginBottom:14,borderBottom:'1px solid rgba(159,215,255,0.08)',overflowX:'auto' as const}}>
                {(['perfsez','evolpiata','patternorar','sezonpiata','reguli'] as const).map(s=>{
                  const lbl:{[k:string]:string}={perfsez:'📊 Perf & Sezon',evolpiata:'📉 Evoluție piață',patternorar:'📅 Pattern orar',sezonpiata:'📆 Sezon piață',reguli:'⚙️ Reguli'}
                  return(
                    <button key={s} onClick={()=>setStratSection(s)} style={{
                      padding:'8px 14px',fontSize:11,fontWeight:600,cursor:'pointer',flexShrink:0,
                      border:'none',borderBottom:`2px solid ${stratSection===s?'#4ADE80':'transparent'}`,
                      background:'transparent',color:stratSection===s?'#4ADE80':'rgba(159,215,255,0.35)',
                    }}>{lbl[s]}</button>
                  )
                })}
              </div>

              {loadingStrat&&stratSection==='perfsez'&&<div style={{padding:'60px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:13}}>Se calculează...</div>}

              {/* ── PERF & SEZON ── */}
              {!loadingStrat&&stratSection==='perfsez'&&(
                <div>
                  {perfData.length>0&&(
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
                      {bestOcupare&&<div style={{padding:'11px 14px',borderRadius:10,background:'rgba(74,222,128,0.06)',border:'1px solid rgba(74,222,128,0.15)'}}>
                        <div style={{fontSize:9,color:'rgba(74,222,128,0.5)',textTransform:'uppercase' as const,letterSpacing:'.08em',marginBottom:4}}>Cea mai bună ocupare</div>
                        <div style={{fontSize:16,fontWeight:700,color:'#4ADE80',fontFamily:'monospace'}}>{bestOcupare.ocupare}%</div>
                        <div style={{fontSize:10,color:'rgba(214,228,244,0.45)',marginTop:3}}>[{bestOcupare.aptNota}] · {bestOcupare.luna}</div>
                      </div>}
                      {lowestADR&&<div style={{padding:'11px 14px',borderRadius:10,background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.15)'}}>
                        <div style={{fontSize:9,color:'rgba(248,113,113,0.5)',textTransform:'uppercase' as const,letterSpacing:'.08em',marginBottom:4}}>Cel mai mic ADR</div>
                        <div style={{fontSize:16,fontWeight:700,color:'#F87171',fontFamily:'monospace'}}>{lowestADR.adr} RON</div>
                        <div style={{fontSize:10,color:'rgba(214,228,244,0.45)',marginTop:3}}>[{lowestADR.aptNota}] · {lowestADR.luna}</div>
                      </div>}
                      {bestRevpar&&<div style={{padding:'11px 14px',borderRadius:10,background:'rgba(77,163,255,0.06)',border:'1px solid rgba(77,163,255,0.15)'}}>
                        <div style={{fontSize:9,color:'rgba(77,163,255,0.5)',textTransform:'uppercase' as const,letterSpacing:'.08em',marginBottom:4}}>Cel mai bun RevPAR</div>
                        <div style={{fontSize:16,fontWeight:700,color:'#7BC8FF',fontFamily:'monospace'}}>{bestRevpar.revpar} RON</div>
                        <div style={{fontSize:10,color:'rgba(214,228,244,0.45)',marginTop:3}}>[{bestRevpar.aptNota}] · {bestRevpar.luna}</div>
                      </div>}
                    </div>
                  )}
                  <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'center',flexWrap:'wrap' as const}}>
                    <select value={stratAptFilter} onChange={e=>setStratAptFilter(e.target.value)} style={{padding:'5px 8px',borderRadius:7,fontSize:12,background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',color:'rgba(214,228,244,0.9)',outline:'none'}}>
                      <option value="">Toate apartamentele</option>
                      {apts.map((a:any)=><option key={a.id} value={a.id}>{a.nota}</option>)}
                    </select>
                    <span style={{fontSize:10,color:'rgba(159,215,255,0.3)'}}>{filteredPerf.length} înregistrări · ultimele 12 luni</span>
                  </div>
                  {perfData.length===0?(
                    <div style={{padding:'40px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>Nu există rezervări în ultimele 12 luni</div>
                  ):(
                    <div style={{...panel,overflow:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:12}}>
                        <thead>
                          <tr style={{borderBottom:'1px solid rgba(159,215,255,0.1)'}}>
                            {([['aptNota','Apt'],['luna','Lună'],['nopti','Nopți'],['adr','ADR (RON/n)'],['ocupare','Ocupare %'],['revpar','RevPAR'],['suma','Revenue']] as [string,string][]).map(([col,label])=>(
                              <th key={col} onClick={()=>{if(sortCol===col)setSortDir(d=>d==='asc'?'desc':'asc');else{setSortCol(col);setSortDir('desc')}}}
                                style={{padding:'8px 12px',textAlign:'left' as const,color:'rgba(147,197,253,0.55)',fontWeight:600,letterSpacing:'.05em',textTransform:'uppercase' as const,fontSize:9,cursor:'pointer',userSelect:'none' as const,whiteSpace:'nowrap' as const}}>
                                {label}{sortCol===col?sortDir==='asc'?' ↑':' ↓':''}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedPerf.map((r,i)=>(
                            <tr key={r.aptId+r.luna} style={{borderBottom:i<sortedPerf.length-1?'1px solid rgba(159,215,255,0.04)':'none',background:i%2===0?'rgba(255,255,255,0.01)':'transparent'}}>
                              <td style={{padding:'7px 12px',color:'#7BC8FF',fontWeight:700,fontFamily:'monospace'}}>{r.aptNota}</td>
                              <td style={{padding:'7px 12px',color:'rgba(214,228,244,0.7)',fontFamily:'monospace'}}>{r.luna}</td>
                              <td style={{padding:'7px 12px',color:'rgba(214,228,244,0.7)',textAlign:'right' as const,fontFamily:'monospace'}}>{r.nopti}</td>
                              <td style={{padding:'7px 12px',color:'rgba(214,228,244,0.9)',textAlign:'right' as const,fontFamily:'monospace',fontWeight:600}}>{r.adr}</td>
                              <td style={{padding:'7px 12px',textAlign:'right' as const}}><span style={{fontFamily:'monospace',fontWeight:600,color:r.ocupare>=70?'#4ADE80':r.ocupare>=40?'#FCD34D':'#F87171'}}>{r.ocupare}%</span></td>
                              <td style={{padding:'7px 12px',color:'rgba(147,197,253,0.7)',textAlign:'right' as const,fontFamily:'monospace'}}>{r.revpar}</td>
                              <td style={{padding:'7px 12px',color:'rgba(214,228,244,0.5)',textAlign:'right' as const,fontFamily:'monospace'}}>{r.suma.toLocaleString('ro-RO')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {trendData.length>1&&(
                    <div style={{...panel,marginTop:14}}>
                      <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>📈 Trend ADR</span>
                        <select value={trendAptId} onChange={e=>setStratAptFilter(e.target.value)} style={{padding:'3px 7px',borderRadius:6,fontSize:11,background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',color:'rgba(214,228,244,0.8)',outline:'none'}}>
                          {apts.map((a:any)=><option key={a.id} value={a.id}>{a.nota}</option>)}
                        </select>
                      </div>
                      <div style={{padding:'12px 4px',height:180}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trendData} margin={{top:4,right:16,left:0,bottom:4}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.1)"/>
                            <XAxis dataKey="luna" tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={36}/>
                            <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}} formatter={(v:any)=>[`${v} RON/noapte`,'ADR'] as [string,string]}/>
                            <Line type="monotone" dataKey="adr" stroke="#4ADE80" strokeWidth={2} dot={{fill:'#4ADE80',r:3}}/>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {stratRezervari.length>0&&(()=>{
                    const top3=[...luniData].sort((a,b)=>b.nopti-a.nopti).slice(0,3).filter(l=>l.nopti>0)
                    const wdAvg=avg(ziSaptData.filter(d=>!d.isWeekend&&d.nopti>0).map(d=>d.adr))
                    const weAvg=avg(ziSaptData.filter(d=>d.isWeekend&&d.nopti>0).map(d=>d.adr))
                    const diff=Math.round(weAvg-wdAvg)
                    return(
                      <div style={{marginTop:14}}>
                        {top3.length>0&&(
                          <div style={{padding:'10px 14px',borderRadius:9,background:'rgba(77,163,255,0.06)',border:'1px solid rgba(77,163,255,0.15)',marginBottom:14,fontSize:12,color:'rgba(214,228,244,0.7)',lineHeight:1.8}}>
                            <strong style={{color:'#7BC8FF'}}>Luni de vârf:</strong>{' '}{top3.map(l=>l.numeScurt).join(' › ')}
                            {diff>0&&<>{' · '}<strong style={{color:'#FCD34D'}}>Weekend premium:</strong>{' '}+{diff} RON/noapte față de zile de lucru</>}
                            {diff<0&&<>{' · '}<strong style={{color:'#F87171'}}>Weekdays mai buni:</strong>{' '}{Math.abs(diff)} RON/noapte peste weekend</>}
                          </div>
                        )}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                          <div style={{...panel}}>
                            <div style={{padding:'8px 14px',borderBottom:'1px solid rgba(159,215,255,0.08)',fontSize:11,fontWeight:600,color:'rgba(147,197,253,0.6)'}}>Nopți ocupate per lună (propriu)</div>
                            <div style={{padding:'12px 4px',height:200}}>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={luniData} margin={{top:4,right:8,left:0,bottom:4}}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.08)" vertical={false}/>
                                  <XAxis dataKey="numeScurt" tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
                                  <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={30}/>
                                  <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}} formatter={(v:any)=>[`${v} nopți`,'Nopți'] as [string,string]}/>
                                  <Bar dataKey="nopti" radius={[4,4,0,0]}>
                                    {luniData.map((e,i)=><Cell key={i} fill={e.nopti>=maxNopti*0.75?'#4ADE80':e.nopti>=maxNopti*0.4?'#FCD34D':'rgba(99,179,237,0.45)'}/>)}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          <div style={{...panel}}>
                            <div style={{padding:'8px 14px',borderBottom:'1px solid rgba(159,215,255,0.08)',fontSize:11,fontWeight:600,color:'rgba(147,197,253,0.6)'}}>ADR mediu per zi (propriu)</div>
                            <div style={{padding:'12px 4px',height:200}}>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={ziSaptData} margin={{top:4,right:8,left:0,bottom:4}}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.08)" vertical={false}/>
                                  <XAxis dataKey="numeScurt" tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
                                  <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={36}/>
                                  <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}} formatter={(v:any)=>[`${v} RON/n`,'ADR'] as [string,string]}/>
                                  <Bar dataKey="adr" radius={[4,4,0,0]}>
                                    {ziSaptData.map((e,i)=><Cell key={i} fill={e.isWeekend?'#FCD34D':'rgba(99,179,237,0.55)'}/>)}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* ── EVOLUȚIE PIAȚĂ ── */}
              {stratSection==='evolpiata'&&(
                evolutieData.length===0?(
                  <div style={{padding:'40px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>Nicio scanare disponibilă</div>
                ):(
                  <div>
                    <div style={{...panel,padding:'12px 16px',marginBottom:14}}>
                      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap' as const}}>
                        <span style={{fontSize:11,color:'rgba(147,197,253,0.5)',flexShrink:0}}>Perioadă:</span>
                        <select value={`${evolCI}|${evolCO}`} onChange={e=>{const[ci,co]=e.target.value.split('|');setStratEvolCheckin(ci);setStratEvolCheckout(co)}}
                          style={{padding:'5px 10px',borderRadius:7,fontSize:12,background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',color:'rgba(214,228,244,0.9)',outline:'none'}}>
                          {allPeriods.map(p=>{const[ci,co]=p.split('|');return<option key={p} value={p}>{ci?.slice(5)} → {co?.slice(5)}</option>})}
                        </select>
                        <span style={{fontSize:10,color:'rgba(147,197,253,0.3)'}}>sau manual:</span>
                        <input type="date" value={stratEvolCheckin} onChange={e=>setStratEvolCheckin(e.target.value)}
                          style={{padding:'4px 8px',borderRadius:6,fontSize:12,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',outline:'none'}}/>
                        <span style={{fontSize:11,color:'rgba(147,197,253,0.3)'}}>→</span>
                        <input type="date" value={stratEvolCheckout} onChange={e=>setStratEvolCheckout(e.target.value)}
                          style={{padding:'4px 8px',borderRadius:6,fontSize:12,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',outline:'none'}}/>
                        <span style={{fontSize:10,color:'rgba(147,197,253,0.35)',marginLeft:'auto',fontFamily:'monospace'}}>{evolScans.length} scanări</span>
                      </div>
                    </div>
                    {evolScans.length<2?(
                      <div style={{padding:'30px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>
                        {evolScans.length===0?'Nicio scanare pentru această perioadă.':'O singură scanare — necesari minim 2 pentru grafic de evoluție.'}
                      </div>
                    ):(
                      <>
                        <div style={{...panel,marginBottom:14}}>
                          <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>
                            💰 Evoluție prețuri · {evolCI?.slice(5)} → {evolCO?.slice(5)}
                          </div>
                          <div style={{padding:'12px 4px',height:220}}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={evolPretData} margin={{top:4,right:16,left:0,bottom:4}}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.1)"/>
                                <XAxis dataKey="timp" tick={{fill:'rgba(147,197,253,0.5)',fontSize:9}} axisLine={false} tickLine={false}/>
                                <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                                <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}}
                                  labelStyle={{color:'#93C5FD',fontWeight:600}}
                                  formatter={(v:any,n:any)=>[`${v} lei`,n==='min'?'Min piață':n==='median'?'Median top20':'Al 20-lea'] as [string,string]}/>
                                <Legend formatter={(v:any)=>v==='min'?'Min piață':v==='median'?'Median top20':'Al 20-lea'} wrapperStyle={{fontSize:10}}/>
                                <Line type="monotone" dataKey="min" stroke="#4ADE80" strokeWidth={2} dot={{fill:'#4ADE80',r:2}} connectNulls/>
                                <Line type="monotone" dataKey="median" stroke="#FCD34D" strokeWidth={2} dot={{fill:'#FCD34D',r:2}} connectNulls/>
                                <Line type="monotone" dataKey="max20" stroke="#F87171" strokeWidth={2} dot={{fill:'#F87171',r:2}} strokeDasharray="4 2" connectNulls/>
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div style={{...panel}}>
                          <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>
                            🏙️ Evoluție disponibilitate piață
                          </div>
                          <div style={{padding:'12px 4px',height:160}}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={evolPropsData} margin={{top:4,right:16,left:0,bottom:4}}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.1)"/>
                                <XAxis dataKey="timp" tick={{fill:'rgba(147,197,253,0.5)',fontSize:9}} axisLine={false} tickLine={false}/>
                                <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                                <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}}
                                  formatter={(v:any)=>[`${v} proprietăți`,'Disponibile'] as [string,string]}/>
                                <Line type="monotone" dataKey="proprietati" stroke="#93C5FD" strokeWidth={2} dot={{fill:'#93C5FD',r:2}} connectNulls/>
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              )}

              {/* ── PATTERN ORAR ── */}
              {stratSection==='patternorar'&&(
                <div>
                  <div style={{...panel,padding:'12px 16px',marginBottom:14}}>
                    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap' as const}}>
                      <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>Zi check-in:</span>
                      <select value={stratPatternZi} onChange={e=>setStratPatternZi(e.target.value)}
                        style={{padding:'5px 10px',borderRadius:7,fontSize:12,background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',color:'rgba(214,228,244,0.9)',outline:'none'}}>
                        <option value="">Toate zilele</option>
                        {([['Luni','1'],['Marți','2'],['Miercuri','3'],['Joi','4'],['Vineri','5'],['Sâmbătă','6'],['Duminică','0']] as [string,string][]).map(([z,v])=>(
                          <option key={v} value={v}>{z}</option>
                        ))}
                      </select>
                      <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>Luna check-in:</span>
                      <select value={stratPatternLuna} onChange={e=>setStratPatternLuna(e.target.value)}
                        style={{padding:'5px 10px',borderRadius:7,fontSize:12,background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',color:'rgba(214,228,244,0.9)',outline:'none'}}>
                        <option value="">Toate lunile</option>
                        {['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'].map((l,i)=>(
                          <option key={i+1} value={String(i+1)}>{l}</option>
                        ))}
                      </select>
                      <span style={{fontSize:10,color:'rgba(147,197,253,0.35)',marginLeft:'auto',fontFamily:'monospace'}}>{orarData.length} ore cu date</span>
                    </div>
                  </div>
                  {orarData.length===0?(
                    <div style={{padding:'30px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>Nicio scanare pentru filtrele selectate</div>
                  ):(
                    <>
                      <div style={{...panel,marginBottom:14}}>
                        <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>💰 Prețuri medii per oră</div>
                        <div style={{padding:'12px 4px',height:220}}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={orarData} margin={{top:4,right:16,left:0,bottom:4}}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.1)"/>
                              <XAxis dataKey="ora" tick={{fill:'rgba(147,197,253,0.5)',fontSize:9}} axisLine={false} tickLine={false}/>
                              <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                              <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}}
                                labelStyle={{color:'#93C5FD',fontWeight:600}}
                                formatter={(v:any,n:any)=>[`${v} lei`,n==='minPret'?'Min piață':'Median top20'] as [string,string]}/>
                              <Legend formatter={(v:any)=>v==='minPret'?'Min piață':'Median top20'} wrapperStyle={{fontSize:10}}/>
                              <Line type="monotone" dataKey="minPret" stroke="#4ADE80" strokeWidth={2} dot={{fill:'#4ADE80',r:3}} connectNulls/>
                              <Line type="monotone" dataKey="medianPret" stroke="#FCD34D" strokeWidth={2} dot={{fill:'#FCD34D',r:3}} connectNulls/>
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div style={{...panel}}>
                        <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>🏙️ Proprietăți disponibile per oră</div>
                        <div style={{padding:'12px 4px',height:180}}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={orarData} margin={{top:4,right:16,left:0,bottom:4}}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.08)" vertical={false}/>
                              <XAxis dataKey="ora" tick={{fill:'rgba(147,197,253,0.5)',fontSize:9}} axisLine={false} tickLine={false}/>
                              <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                              <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}}
                                formatter={(v:any)=>[`${v} (medie)`,'Proprietăți'] as [string,string]}/>
                              <Bar dataKey="proprietati" radius={[3,3,0,0]}>
                                {orarData.map((_,i)=><Cell key={i} fill="rgba(99,179,237,0.55)"/>)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── SEZONALITATE PIAȚĂ ── */}
              {stratSection==='sezonpiata'&&(
                sezonPiataData.length===0?(
                  <div style={{padding:'40px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>Nicio scanare disponibilă</div>
                ):(
                  <div>
                    <div style={{...panel,marginBottom:14}}>
                      <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>
                        💰 Prețuri medii piață per lună de check-in
                      </div>
                      <div style={{padding:'12px 4px',height:240}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={sezonPiataData} margin={{top:4,right:8,left:0,bottom:4}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.08)" vertical={false}/>
                            <XAxis dataKey="numeScurt" tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                            <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}}
                              labelStyle={{color:'#93C5FD',fontWeight:600}}
                              formatter={(v:any,n:any)=>[`${v} lei/n`,n==='minPret'?'Min':n==='medianPret'?'Median top20':'Al 20-lea'] as [string,string]}/>
                            <Legend formatter={(v:any)=>v==='minPret'?'Min':v==='medianPret'?'Median top20':'Al 20-lea'} wrapperStyle={{fontSize:10}}/>
                            <Bar dataKey="minPret" fill="#4ADE80" radius={[3,3,0,0]}/>
                            <Bar dataKey="medianPret" fill="#FCD34D" radius={[3,3,0,0]}/>
                            <Bar dataKey="max20Pret" fill="#F87171" radius={[3,3,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div style={{...panel}}>
                      <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(159,215,255,0.08)',fontSize:12,fontWeight:600,color:'rgba(147,197,253,0.7)'}}>
                        🏙️ Proprietăți disponibile per lună (medie scanări)
                      </div>
                      <div style={{padding:'12px 4px',height:180}}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={sezonPiataData} margin={{top:4,right:8,left:0,bottom:4}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,179,237,0.08)" vertical={false}/>
                            <XAxis dataKey="numeScurt" tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false}/>
                            <YAxis tick={{fill:'rgba(147,197,253,0.5)',fontSize:10}} axisLine={false} tickLine={false} width={40}/>
                            <Tooltip contentStyle={{background:'rgba(10,20,40,0.95)',border:'1px solid rgba(99,179,237,0.2)',borderRadius:8,fontSize:11}}
                              formatter={(v:any)=>[`${v} (medie)`,'Proprietăți'] as [string,string]}/>
                            <Bar dataKey="proprietati" radius={[4,4,0,0]}>
                              {sezonPiataData.map((_,i)=><Cell key={i} fill="rgba(147,197,253,0.45)"/>)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* ── REGULI PREȚ ── */}
              {stratSection==='reguli'&&(
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                    <div>
                      <span style={{fontSize:13,fontWeight:600,color:'rgba(214,228,244,0.8)'}}>Reguli de preț</span>
                      <span style={{fontSize:10,color:'rgba(159,215,255,0.3)',marginLeft:8}}>{reguli.length} reguli definite</span>
                    </div>
                    <button onClick={()=>{
                      setEditingRegula(null)
                      setRegulaForm({apartament_id:'',denumire:'',tip:'weekend',luna_start:'6',luna_end:'8',zile_inainte_max:'3',ocupare_min:'80',ajustare_tip:'procent',ajustare_valoare:'',prioritate:'0',activ:true})
                      setShowFormRegula(v=>!v)
                    }} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:7,border:'1px solid rgba(74,222,128,0.3)',background:'rgba(74,222,128,0.08)',color:'#4ADE80',fontSize:12,fontWeight:600,cursor:'pointer'}}>+ Adaugă Regulă</button>
                  </div>

                  {showFormRegula&&(
                    <div style={{...panel,padding:'14px 16px',marginBottom:14,border:'1px solid rgba(74,222,128,0.2)',background:'rgba(74,222,128,0.02)'}}>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                        <div>
                          <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Denumire *</div>
                          <input value={regulaForm.denumire} onChange={e=>setRegulaForm(f=>({...f,denumire:e.target.value}))} placeholder="ex. Weekend +15%"
                            style={{width:'100%',padding:'6px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'}}/>
                        </div>
                        <div>
                          <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Apartament</div>
                          <select value={regulaForm.apartament_id} onChange={e=>setRegulaForm(f=>({...f,apartament_id:e.target.value}))}
                            style={{width:'100%',padding:'6px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'}}>
                            <option value="">Toate apartamentele</option>
                            {apts.map((a:any)=><option key={a.id} value={a.id}>{a.nota}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                        <div>
                          <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Tip regulă</div>
                          <select value={regulaForm.tip} onChange={e=>setRegulaForm(f=>({...f,tip:e.target.value as any}))}
                            style={{width:'100%',padding:'6px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'}}>
                            <option value="weekend">Weekend (Vin + Sâm)</option>
                            <option value="sezon">Sezon (interval luni)</option>
                            <option value="avans">Avans mic (last-minute)</option>
                            <option value="ocupare">Ocupare ridicată</option>
                          </select>
                        </div>
                        <div>
                          {regulaForm.tip==='sezon'&&(
                            <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
                              <div style={{flex:1}}>
                                <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Lună start</div>
                                <input type="number" min={1} max={12} value={regulaForm.luna_start} onChange={e=>setRegulaForm(f=>({...f,luna_start:e.target.value}))}
                                  style={{width:'100%',padding:'6px 8px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'}}/>
                              </div>
                              <span style={{fontSize:11,color:'rgba(159,215,255,0.3)',paddingBottom:8}}>→</span>
                              <div style={{flex:1}}>
                                <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Lună end</div>
                                <input type="number" min={1} max={12} value={regulaForm.luna_end} onChange={e=>setRegulaForm(f=>({...f,luna_end:e.target.value}))}
                                  style={{width:'100%',padding:'6px 8px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'}}/>
                              </div>
                            </div>
                          )}
                          {regulaForm.tip==='avans'&&(
                            <div>
                              <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Max zile înainte check-in</div>
                              <input type="number" min={0} max={30} value={regulaForm.zile_inainte_max} onChange={e=>setRegulaForm(f=>({...f,zile_inainte_max:e.target.value}))}
                                style={{width:'100%',padding:'6px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'}}/>
                            </div>
                          )}
                          {regulaForm.tip==='ocupare'&&(
                            <div>
                              <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Ocupare min (%)</div>
                              <input type="number" min={0} max={100} value={regulaForm.ocupare_min} onChange={e=>setRegulaForm(f=>({...f,ocupare_min:e.target.value}))}
                                style={{width:'100%',padding:'6px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none'}}/>
                            </div>
                          )}
                          {regulaForm.tip==='weekend'&&(
                            <div style={{padding:'6px 10px',borderRadius:7,background:'rgba(77,163,255,0.06)',border:'1px solid rgba(77,163,255,0.12)',fontSize:11,color:'rgba(147,197,253,0.5)',marginTop:16}}>Se aplică automat vineri și sâmbătă</div>
                          )}
                        </div>
                      </div>
                      <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap' as const,marginBottom:10}}>
                        <div>
                          <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Tip ajustare</div>
                          <div style={{display:'flex',borderRadius:7,overflow:'hidden',border:'1px solid rgba(77,163,255,0.25)'}}>
                            {(['procent','fix'] as const).map(t=>(
                              <button key={t} onClick={()=>setRegulaForm(f=>({...f,ajustare_tip:t}))} style={{padding:'5px 12px',fontSize:11,fontWeight:600,cursor:'pointer',border:'none',background:regulaForm.ajustare_tip===t?'rgba(77,163,255,0.35)':'transparent',color:regulaForm.ajustare_tip===t?'#7BC8FF':'rgba(159,215,255,0.4)'}}>{t==='procent'?'%':'RON'}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Valoare ({regulaForm.ajustare_tip==='procent'?'%':'RON'})</div>
                          <input type="number" value={regulaForm.ajustare_valoare} onChange={e=>setRegulaForm(f=>({...f,ajustare_valoare:e.target.value}))} placeholder="+15 sau -10"
                            style={{width:100,padding:'6px 10px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none',fontFamily:'monospace'}}/>
                        </div>
                        <div>
                          <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Prioritate</div>
                          <input type="number" min={0} value={regulaForm.prioritate} onChange={e=>setRegulaForm(f=>({...f,prioritate:e.target.value}))}
                            style={{width:60,padding:'6px 8px',borderRadius:7,border:'1px solid rgba(100,160,255,0.2)',background:'rgba(20,38,65,0.8)',color:'rgba(214,228,244,0.9)',fontSize:12,outline:'none',fontFamily:'monospace'}}/>
                        </div>
                        <div style={{display:'flex',gap:6,marginLeft:'auto'}}>
                          <button onClick={saveRegula} disabled={savingRegula||!regulaForm.denumire.trim()||!regulaForm.ajustare_valoare}
                            style={{padding:'6px 18px',borderRadius:7,border:'none',background:'rgba(74,222,128,0.8)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',opacity:savingRegula||!regulaForm.denumire.trim()||!regulaForm.ajustare_valoare?0.5:1}}>
                            {savingRegula?'...':'Salvează'}
                          </button>
                          <button onClick={()=>{setShowFormRegula(false);setEditingRegula(null)}}
                            style={{padding:'6px 12px',borderRadius:7,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.5)',fontSize:12,cursor:'pointer'}}>Anulează</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {reguli.length===0&&!showFormRegula&&(
                    <div style={{padding:'40px',textAlign:'center' as const,color:'rgba(147,197,253,0.3)',fontSize:12}}>
                      Nicio regulă definită. Adaugă o regulă pentru a genera sugestii de preț automate.
                    </div>
                  )}

                  {reguli.length>0&&(
                    <div style={{...panel}}>
                      <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:12}}>
                        <thead>
                          <tr style={{borderBottom:'1px solid rgba(159,215,255,0.08)'}}>
                            {['','Denumire','Tip','Condiție','Ajustare','Apt',''].map((h,i)=>(
                              <th key={i} style={{padding:'7px 10px',textAlign:'left' as const,fontSize:9,color:'rgba(147,197,253,0.4)',fontWeight:600,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {reguli.map((r,i)=>{
                            const condText=r.tip==='weekend'?'Vin + Sâm':r.tip==='sezon'?`L${r.conditii?.luna_start||1}–L${r.conditii?.luna_end||12}`:r.tip==='avans'?`≤${r.conditii?.zile_inainte_max||3} zile`:`ocupare ≥${r.conditii?.ocupare_min||80}%`
                            const adjText=`${r.ajustare_valoare>0?'+':''}${r.ajustare_valoare}${r.ajustare_tip==='procent'?'%':' RON'}`
                            const aptLbl=r.apartament_id?apts.find((a:any)=>a.id===r.apartament_id)?.nota||'—':'Toate'
                            return(
                              <tr key={r.id} style={{borderBottom:i<reguli.length-1?'1px solid rgba(159,215,255,0.04)':'none',background:i%2===0?'rgba(255,255,255,0.01)':'transparent',opacity:r.activ?1:0.45}}>
                                <td style={{padding:'7px 10px'}}>
                                  <button onClick={()=>toggleRegula(r.id,!r.activ)} title={r.activ?'Dezactivează':'Activează'} style={{width:28,height:16,borderRadius:8,border:'none',cursor:'pointer',background:r.activ?'rgba(74,222,128,0.5)':'rgba(159,215,255,0.15)',position:'relative' as const,transition:'background .15s'}}>
                                    <span style={{position:'absolute' as const,top:2,left:r.activ?14:2,width:12,height:12,borderRadius:6,background:'#fff',transition:'left .15s'}}/>
                                  </button>
                                </td>
                                <td style={{padding:'7px 10px',color:'rgba(214,228,244,0.8)',fontWeight:600}}>{r.denumire}</td>
                                <td style={{padding:'7px 10px'}}><span style={{fontSize:10,padding:'2px 7px',borderRadius:5,background:'rgba(77,163,255,0.12)',color:'#7BC8FF'}}>{r.tip}</span></td>
                                <td style={{padding:'7px 10px',color:'rgba(214,228,244,0.55)',fontFamily:'monospace',fontSize:11}}>{condText}</td>
                                <td style={{padding:'7px 10px'}}><span style={{fontFamily:'monospace',fontWeight:700,color:r.ajustare_valoare>0?'#4ADE80':'#F87171'}}>{adjText}</span></td>
                                <td style={{padding:'7px 10px',fontSize:11,color:'rgba(147,197,253,0.5)',fontFamily:'monospace'}}>{aptLbl}</td>
                                <td style={{padding:'7px 10px'}}>
                                  <div style={{display:'flex',gap:5}}>
                                    <button onClick={()=>{
                                      setEditingRegula(r)
                                      setRegulaForm({apartament_id:r.apartament_id||'',denumire:r.denumire,tip:r.tip,luna_start:String(r.conditii?.luna_start||6),luna_end:String(r.conditii?.luna_end||8),zile_inainte_max:String(r.conditii?.zile_inainte_max||3),ocupare_min:String(r.conditii?.ocupare_min||80),ajustare_tip:r.ajustare_tip,ajustare_valoare:String(r.ajustare_valoare),prioritate:String(r.prioritate),activ:r.activ})
                                      setShowFormRegula(true)
                                    }} style={{padding:'3px 8px',borderRadius:5,border:'1px solid rgba(77,163,255,0.2)',background:'transparent',color:'rgba(147,197,253,0.5)',fontSize:11,cursor:'pointer'}}>✏</button>
                                    <button onClick={()=>deleteRegula(r.id)} disabled={deletingRegula===r.id}
                                      style={{padding:'3px 8px',borderRadius:5,border:'1px solid rgba(248,113,113,0.2)',background:'transparent',color:'rgba(248,113,113,0.5)',fontSize:11,cursor:'pointer',opacity:deletingRegula===r.id?0.5:1}}>
                                      {deletingRegula===r.id?'...':'✕'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

      </div>
      <Toast toast={toast}/>
    </>
  )
}

function DecisionMetric({label,value,detail,color,compact=false}:{label:string;value:string;detail:string;color:string;compact?:boolean}) {
  return(
    <div style={{padding:compact?'7px 8px':'11px 12px',borderRadius:9,background:`${color}0D`,border:`1px solid ${color}20`,minWidth:0}}>
      <div style={{fontSize:compact?8:9,color:'rgba(147,197,253,0.42)',textTransform:'uppercase' as const,letterSpacing:'.04em',marginBottom:4}}>{label}</div>
      <div style={{fontSize:compact?14:18,fontWeight:700,color,fontFamily:'monospace'}}>{value}</div>
      <div style={{fontSize:compact?8:9,color:'rgba(214,228,244,0.4)',marginTop:3,lineHeight:1.35}}>{detail}</div>
    </div>
  )
}
