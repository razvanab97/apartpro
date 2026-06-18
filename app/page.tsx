'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { CanalBadge, PageLoading } from '@/components/ui'
import { Building2, CalendarCheck, TrendingUp, DollarSign, AlertCircle, CheckSquare, ArrowUpRight, LogIn, LogOut, Activity, Percent, Check, ChevronDown, AlertTriangle, MessageCircle, Key, BedDouble, Phone , RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'

/* ── helpers grafice ─────────────────────────────────────────────────────── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1
  const w = 80, h = 28
  const pts = data.map((v, i) => `${(i/(data.length-1))*w},${h-((v-min)/range)*(h-4)-2}`).join(' ')
  return <svg width={w} height={h} style={{ display:'block' }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.85"/></svg>
}
function RevenueChart({ data }: { data: { luna:string; valoare:number }[] }) {
  const max = Math.max(...data.map(d=>d.valoare)) || 1
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:80, padding:'0 4px' }}>
      {data.map((d,i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
          <div style={{ width:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', height:64, gap:1 }}>
            <div style={{ width:'100%', borderRadius:'3px 3px 0 0', background:i===data.length-1?'rgba(77,163,255,0.85)':'rgba(77,163,255,0.25)', border:i===data.length-1?'1px solid rgba(159,215,255,0.5)':'1px solid rgba(77,163,255,0.2)', height:`${(d.valoare/max)*60}px`, transition:'height 0.3s ease', position:'relative' }}>
              {i===data.length-1&&<div style={{ position:'absolute', top:-18, left:'50%', transform:'translateX(-50%)', fontSize:9, color:'#4DA3FF', whiteSpace:'nowrap', fontFamily:'monospace', fontWeight:600 }}>{(d.valoare/1000).toFixed(1)}k</div>}
            </div>
          </div>
          <div style={{ fontSize:9, color:'rgba(159,215,255,0.35)', fontFamily:'monospace' }}>{d.luna}</div>
        </div>
      ))}
    </div>
  )
}

const DEMO_REVENUE = [
  {luna:'Ian',valoare:6200},{luna:'Feb',valoare:5800},{luna:'Mar',valoare:7400},
  {luna:'Apr',valoare:8100},{luna:'Mai',valoare:9200},{luna:'Iun',valoare:11400},
]
const SPARKLINE_DATA = [42,45,38,52,48,61,55,68,72,65,78,82]

const UTIL_COLS = [
  {key:'chirie',label:'Chirie',due:1},{key:'asociatie',label:'Asociație',due:15},
  {key:'eon_curent',label:'E.ON Curent',due:20},{key:'eon_gaz',label:'E.ON Gaz',due:20},
  {key:'internet',label:'Internet',due:10},{key:'salubris',label:'Salubris',due:5},
]
const FISCAL_ROWS = [
  {key:'tva_intracomunitar',label:'TVA Intracomunitar',due:25},
  {key:'impozit_profit',label:'Impozit pe profit',due:25},
  {key:'taxa_proprietati',label:'Taxă pe proprietăți',due:31},
]

function daysUntil(dueDay:number,luna:number,an:number){
  const now=new Date(); const d=new Date(an,luna-1,dueDay)
  return Math.ceil((d.getTime()-now.getTime())/(1000*60*60*24))
}
function dueColor(days:number,paid:boolean){
  if(paid) return{text:'#4ADE80',bg:'rgba(74,222,128,0.1)',border:'rgba(74,222,128,0.25)'}
  if(days<=0) return{text:'#F87171',bg:'rgba(248,113,113,0.1)',border:'rgba(248,113,113,0.35)'}
  if(days<=3) return{text:'#F87171',bg:'rgba(248,113,113,0.07)',border:'rgba(248,113,113,0.25)'}
  if(days<=7) return{text:'#FCD34D',bg:'rgba(252,211,77,0.07)',border:'rgba(252,211,77,0.25)'}
  return{text:'rgba(159,215,255,0.5)',bg:'rgba(100,160,255,0.05)',border:'rgba(100,160,255,0.15)'}
}

/* ── mesaje WhatsApp ─────────────────────────────────────────────────────── */
function firstName(name:string){ return (name||'').split(' ')[0] }
function waLink(phone:string, msg:string){
  const clean = phone.replace(/\D/g,'')
  const nr = clean.startsWith('0') ? '4'+clean : clean
  // Normalizeaza emoji-urile pentru compatibilitate WhatsApp
  // Adauga variation selector \uFE0F la TOATE emoji-urile pentru compatibilitate WhatsApp iOS/Android
  const cleanMsg = msg
    .replace(/◆/g, '🔹').replace(/◇/g, '▫️')
    .replace(/★/g, '⭐').replace(/●/g, '•')
    .replace(/✦/g, '✨').replace(/►/g, '▶️')
    .replace(/■/g, '▪️').replace(/□/g, '▫️')
    .replace(/❖/g, '🔷').replace(/◈/g, '🔶')
    // Variation selector FE0F garanteaza afisarea ca emoji grafic pe toate platformele
    .replace(/([\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}])/gu, '$1\uFE0F')
    .replace(/\uFE0F\uFE0F/gu, '\uFE0F') // evita duplicate
    .normalize('NFC')
  // Encoding corect pentru emoji-uri - folosim Array.from pentru surrogate pairs
  const encoded = encodeURIComponent(cleanMsg)
  return `https://wa.me/${nr}?text=${encoded}`
}

function msgCheckin(r:any){
  const apt = r.apartament?.nume || 'apartament'
  const ci  = r.data_checkin ? format(new Date(r.data_checkin),'dd MMMM yyyy',{locale:ro}) : ''
  return `Bună ziua, ${firstName(r.nume_client)}! 👋\n\nVă confirmăm rezervarea la *${apt}* pentru data de *${ci}*.\n\nVă așteptăm cu drag! La sosire, vă rugăm să ne anunțați și vă transmitem detaliile de acces.\n\nEchipa AB Homes Iași`
}

function msgAcces(r:any){
  const apt = r.apartament?.nume || 'apartament'
  return `Bună ziua, ${firstName(r.nume_client)}! 🏠\n\nIată detaliile de acces pentru *${apt}*:\n\n🔑 *Cod intrare bloc:* _completați_\n🚪 *Etaj / Apartament:* _completați_\n📱 *Cutia cu cheia:* _completați_ | Cod: _completați_\n\n📍 _adresa completă_\n\nO ședere plăcută! Ne puteți contacta oricând. 😊\nEchipa AB Homes Iași`
}

function applyVars(tmpl:string, nume:string, apt:string, co:string){
  return tmpl.replace(/\{nume\}/gi,nume).replace(/\{apartament\}/gi,apt).replace(/\{data_checkout\}/gi,co).replace(/\{data\}/gi,co)
}
function msgCheckoutGen(r:any, sabloane:Record<string,string>){
  const apt = r.apartament?.nume || 'apartament'
  const aptId = r.apartament?.id || ''
  const co  = r.data_checkout ? format(new Date(r.data_checkout),'dd MMMM yyyy',{locale:ro}) : ''
  const nume = firstName(r.nume_client)
  const sablon = sabloane[aptId]
  if(sablon) return applyVars(sablon,nume,apt,co)
  const aptMsg = r.apartament?.mesaj_checkout
  if(aptMsg) return applyVars(aptMsg,nume,apt,co)
  return `Bună ziua, ${nume}! 🌅\n\nVă reamintim că astăzi, *${co}*, este ziua check-out-ului din *${apt}*.\n\n⏰ *Ora de check-out:* 11:00\n🔑 *Cheia:* vă rugăm să o lăsați în cutia de la ușă / recepție\n\nVă mulțumim că ați ales AB Homes Iași și sperăm să vă revedem curând! ⭐\nEchipa AB Homes`
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const [loading,setLoading]=useState(true)
  const [stats,setStats]=useState({apartamenteActive:0,rezervariActive:0,incasariLuna:0,incasariNet:0,incasariNetFiltrat:0,incasariBrutFiltrat:0,comisioaneLuna:0,deconturiNeplata:0,taskuriUrgente:0,gradOcupare:0})
  const [rezervariRecente,setRezervariRecente]=useState<any[]>([])
  const [checkinAzi,setCheckinAzi]=useState<any[]>([])
  const [checkoutAzi,setCheckoutAzi]=useState<any[]>([])
  const [apts,setApts]=useState<any[]>([])
  const [rezervariActive,setRezervariActive]=useState<any[]>([])
  const [rezervariCurente,setRezervariCurente]=useState<any[]>([])
  const [cheltuieli,setCheltuieli]=useState<any[]>([])
  const [lenjerii,setLenjerii]=useState<Record<string,number>>({})
  const [coAziCur,setCoAziCur]=useState<any[]>([])
  const [ciAziCur,setCiAziCur]=useState<any[]>([])
  const [prognoza,setPrognoza]=useState({incasariLV:0,cheltuieliLC:0})
  const [cheltuieliLP,setCheltuieliLP]=useState({total:0,platite:0})
  const [preturiLive,setPreturiLive]=useState<{id:string;nume:string;booking:number|null;airbnb:number|null;updatedAt:string}[]>([])
  const [loadingPreturi,setLoadingPreturi]=useState(false)
  const [perAptIncome,setPerAptIncome]=useState<{apt:any;net:number;brut:number}[]>([])
  const [rezLunaDsp,setRezLunaDsp]=useState<any[]>([])
  const [preturiData,setPreturiData]=useState('')
  const [bookingWidget,setBookingWidget]=useState({net:0,count:0,payDate:'',status:'urmeaza',from:'',to:''})
  const [expanded,setExpanded]=useState<Record<string,boolean>>({})
  const [toggling,setToggling]=useState<string|null>(null)
  const [sabloaneCO,setSabloaneCO]=useState<Record<string,string>>({})
  const [coWizardOpen,setCoWizardOpen]=useState(false)
  const [coWizardIdx,setCoWizardIdx]=useState(0)
  const [coBannerDismissed,setCoBannerDismissed]=useState(()=>{
    try{return localStorage.getItem('co_banner_'+new Date().toISOString().split('T')[0])==='1'}catch{return false}
  })
  const [coMesajeTrimise,setCoMesajeTrimise]=useState(()=>{
    try{return localStorage.getItem('co_trimis_'+new Date().toISOString().split('T')[0])==='1'}catch{return false}
  })

  console.log('[D] component render, loading=', loading)
  useEffect(()=>{loadData()},[])

  const now=new Date()
  const luna=now.getMonth()+1
  const an=now.getFullYear()
  const pad=(n:number)=>String(n).padStart(2,'0')
  const todayStr=format(now,'yyyy-MM-dd')

  async function loadData(){
    console.log('[D] loadData START')
    setLoading(true)
    try{
    // Curatenie - PRIMUL query, independent
    const today0=new Date().toISOString().split('T')[0]
    const [{data:coCur0,error:e1},{data:ciCur0,error:e2}]=await Promise.all([
      supabase.from('rezervari').select('id,nume_client,nr_persoane,apartament:apartamente(id,nume,nota,adresa)').eq('data_checkout',today0).neq('status_rezervare','anulata'),
      supabase.from('rezervari').select('id,nume_client,nr_persoane,apartament:apartamente(id,nume,nota,adresa)').eq('data_checkin',today0).neq('status_rezervare','anulata'),
    ])
    console.log('[D] step1 done — coCur0/ciCur0', e1?.message, e2?.message)
    setCoAziCur(coCur0||[])
    setCiAziCur(ciCur0||[])
    const primaZiLuna=format(new Date(an,luna-1,1),'yyyy-MM-dd')
    const ultimaZiLuna=format(new Date(an,luna,0),'yyyy-MM-dd')
    // VM07 si CG40 - singurele apartamente cu comision AB
    const {data:apComision}=await supabase.from('apartamente').select('id,nota').in('nota',['VM07','CG40'])
    console.log('[D] step2 done — apComision')
    const idsComision=new Set((apComision||[]).map((a:any)=>a.id))

    const [
      {count:apCount},{data:rezAziCount},{data:rezLuna},
      {data:ciAzi},{data:coAzi},{data:recente},{data:deconturi},{count:taskCount},
      {data:aptData},{data:chData},{data:actRez},{count:rezLunaCount},
    ]=await Promise.all([
      // apartamente active
      supabase.from('apartamente').select('*',{count:'exact',head:true}).eq('status','activ'),
      // rezervari active ACUM (checkin<=azi, checkout>azi)
      supabase.from('rezervari').select('apartament_id').neq('status_rezervare','anulata').lte('data_checkin',todayStr).gt('data_checkout',todayStr),
      // rezervari care se suprapun cu luna curenta (checkin <= sfarsit luna SI checkout > inceput luna)
      supabase.from('rezervari').select('suma_incasata,canal,apartament_id,data_checkin,data_checkout,nr_nopti').lte('data_checkin',ultimaZiLuna).gt('data_checkout',primaZiLuna).neq('status_rezervare','anulata'),
      // checkin azi
      supabase.from('rezervari').select('*,apartament:apartamente(id,nume,nota,adresa)').eq('data_checkin',todayStr).neq('status_rezervare','anulata').order('data_checkin'),
      // checkout azi
      supabase.from('rezervari').select('*,apartament:apartamente(id,nume,nota,adresa)').eq('data_checkout',todayStr).neq('status_rezervare','anulata').order('data_checkout'),
      // rezervari recente
      supabase.from('rezervari').select('*,apartament:apartamente(nume,comision_procent)').order('created_at',{ascending:false}).limit(8),
      // deconturi neplatite
      supabase.from('deconturi').select('*').in('status',['draft','aprobat']),
      // taskuri urgente
      supabase.from('taskuri').select('*',{count:'exact',head:true}).eq('prioritate','urgenta').eq('status','de_facut'),
      // apartamente
      supabase.from('apartamente').select('id,nume,nota').eq('status','activ').order('nume'),
      // cheltuieli luna curenta
      supabase.from('cheltuieli').select('id,apartament_id,categorie,descriere,valoare,status,data').gte('data',`${an}-${pad(luna)}-01`).lte('data', new Date(an, luna, 0).toISOString().slice(0,10)),
      // rezervari active acum cu detalii
      supabase.from('rezervari').select('*,apartament:apartamente(id,nume,nota)').in('status_rezervare',['confirmata','finalizata']).lte('data_checkin',todayStr).gt('data_checkout',todayStr).order('data_checkout'),
      // rezervari in luna curenta (count)
      supabase.from('rezervari').select('*',{count:'exact',head:true}).neq('status_rezervare','anulata').gte('data_checkin',primaZiLuna).lte('data_checkin',ultimaZiLuna),
    ])
    console.log('[D] step3 done — big Promise.all')
    // Pro-rata helper: nopti in luna curenta / total nopti * suma bruta (identic cu 5starDesk)
    const primaZiLunaPlusUna = format(new Date(an,luna,1),'yyyy-MM-dd') // prima zi luna viitoare
    function proRataLuna(r: any): number {
      const brut = Number(r.suma_incasata || 0)
      const totalNopti = Number(r.nr_nopti || 0) || Math.max(1, Math.ceil((new Date(r.data_checkout).getTime()-new Date(r.data_checkin).getTime())/86400000))
      // nopti care se suprapun cu luna curenta
      const ciDate = r.data_checkin < primaZiLuna ? primaZiLuna : r.data_checkin
      const coDate = r.data_checkout > primaZiLunaPlusUna ? primaZiLunaPlusUna : r.data_checkout
      const noptiInLuna = Math.max(0, Math.ceil((new Date(coDate).getTime()-new Date(ciDate).getTime())/86400000))
      if (noptiInLuna <= 0) return 0
      if (noptiInLuna >= totalNopti) return brut
      return Math.round(brut / totalNopti * noptiInLuna * 100) / 100
    }
    // incasari brute = suma pro-rata pentru rezervarile active in luna curenta
    const inc = (rezLuna||[]).reduce((s:number,r:any) => s + proRataLuna(r), 0)
    // incasari nete = brut - comision platforma (Airbnb 15%+TVA, Booking 17%+TVA, direct 0%)
    const incNet = (rezLuna||[]).reduce((s:number,r:any) => {
      const brut = proRataLuna(r)
      const canal = (r.canal||'').toLowerCase()
      if(canal==='airbnb') return s + brut * 0.85 * (1 - 0.21 * 0.15) // net dupa Airbnb 15% + TVA
      if(canal==='booking') return s + brut * 0.83 * (1 - 0.21 * 0.17) // net dupa Booking 17% + TVA
      return s + brut
    }, 0)
    // comisioane AB Homes = doar VM07 si CG40 (pro-rata)
    const rezComision=(rezLuna||[]).filter((r:any)=>idsComision.has(r.apartament_id))
    const comAirbnb=rezComision.filter((r:any)=>r.canal==='airbnb').reduce((s:number,r:any)=>s+proRataLuna(r)*0.85*0.20,0)
    const comBooking=rezComision.filter((r:any)=>r.canal==='booking').reduce((s:number,r:any)=>s+proRataLuna(r)*0.83*0.20,0)
    const comDirect=rezComision.filter((r:any)=>r.canal!=='airbnb'&&r.canal!=='booking').reduce((s:number,r:any)=>s+proRataLuna(r)*0.20,0)
    const com=Math.round(comAirbnb+comBooking+comDirect)
    // Filtrat: identic cu Calendar Sume (pro-rata overlap), minus CG40+VM07
    const rezFiltrate=(rezLuna||[]).filter((r:any)=>!idsComision.has(r.apartament_id))
    const filtBrut=Math.round(rezFiltrate.reduce((s:number,r:any)=>s+proRataLuna(r),0))
    const filtNet=Math.round(rezFiltrate.reduce((s:number,r:any)=>{
      const b=proRataLuna(r);const c=(r.canal||'').toLowerCase()
      return c==='airbnb'?s+b*0.85*(1-0.21*0.15):c==='booking'?s+b*0.83*(1-0.21*0.17):s+b
    },0))
    // Grad ocupare lunar: nopti ocupate / (apartamente_cu_rezervari_in_luna * zile_luna)
    // Identic cu 5starDesk: doar apartamentele care au cel putin o rezervare in luna
    const zileLuna = new Date(an, luna, 0).getDate()
    const apteWithRez = new Set((rezLuna||[]).map((r:any)=>r.apartament_id).filter(Boolean))
    const nrApteGrad = apteWithRez.size || (apCount||1)
    const totalZileApartamente = nrApteGrad * zileLuna
    let zileOcupate = 0
    for (const r of (rezLuna||[])) {
      if (!r.data_checkin || !r.data_checkout) continue
      const ci = r.data_checkin < primaZiLuna ? primaZiLuna : r.data_checkin
      const co = r.data_checkout > primaZiLunaPlusUna ? primaZiLunaPlusUna : r.data_checkout
      const nopti = Math.max(0, Math.ceil((new Date(co).getTime()-new Date(ci).getTime())/86400000))
      zileOcupate += nopti
    }
    const gradOcupareReal = totalZileApartamente > 0 ? Math.round((zileOcupate / totalZileApartamente) * 100) : 0
    setStats({apartamenteActive:apCount||0,rezervariActive:rezLunaCount||0,incasariLuna:inc,incasariNet:Math.round(incNet),incasariNetFiltrat:filtNet,incasariBrutFiltrat:filtBrut,comisioaneLuna:com,deconturiNeplata:deconturi?.length||0,taskuriUrgente:taskCount||0,gradOcupare:gradOcupareReal})
    setCheckinAzi(ciAzi||[])
    setCheckoutAzi(coAzi||[])
    setRezervariRecente(recente||[])
    setApts(aptData||[])
    setCheltuieli(chData||[])
    setRezervariActive(actRez||[])
    setRezervariCurente(actRez||[])
    console.log('[D] step4 done — state setters')
    // sabloane checkout — non-blocking, dupa datele principale
    void supabase.from('sabloane_mesaje').select('apartament_id,text').eq('tip','checkout').then(({data:sD})=>{
      const coMap:Record<string,string>={}
      ;(sD||[]).forEach((s:any)=>{ if(s.apartament_id && s.text) coMap[s.apartament_id]=s.text })
      setSabloaneCO(coMap)
    })

    // Prognoza: incasari luna viitoare (rezervari confirmate cu checkin in LV)
    const lunaVitoare = luna===12 ? 1 : luna+1
    const anLV = luna===12 ? an+1 : an
    const primaLV = `${anLV}-${String(lunaVitoare).padStart(2,'0')}-01`
    const ultimaLV = `${anLV}-${String(lunaVitoare).padStart(2,'0')}-${new Date(anLV,lunaVitoare,0).getDate()}`
    const { data: rezLV } = await supabase.from('rezervari')
      .select('suma_incasata')
      .gte('data_checkin', primaLV).lte('data_checkin', ultimaLV)
      .neq('status_rezervare','anulata')
    console.log('[D] step5 done — rezLV')
    const incLV = (rezLV||[]).reduce((s:number,r:any)=>s+Number(r.suma_incasata||0),0)
    // Cheltuieli luna precedenta pentru acoperire
    const prevM = now.getMonth()===0?12:now.getMonth()
    const prevY = now.getMonth()===0?now.getFullYear()-1:now.getFullYear()
    const prevPad = String(prevM).padStart(2,'0')
    const { data: chLP } = await supabase.from('cheltuieli')
      .select('valoare,status')
      .gte('data',`${prevY}-${prevPad}-01`)
      .lte('data', new Date(prevY, Number(prevPad), 0).toISOString().slice(0,10))
    const totalLP = (chLP||[]).reduce((s:number,x:any)=>s+Number(x.valoare||0),0)
    const platiteLP = (chLP||[]).filter((x:any)=>x.status==='validat').reduce((s:number,x:any)=>s+Number(x.valoare||0),0)
    console.log('[D] step6 done — chLP')
    setCheltuieliLP({total:Math.round(totalLP),platite:Math.round(platiteLP)})

    // Cheltuieli luna curenta (din tabelul cheltuieli)
    const { data: chLC } = await supabase.from('cheltuieli')
      .select('valoare').gte('data',`${an}-${pad(luna)}-01`).lte('data', new Date(an, Number(pad(luna)), 0).toISOString().slice(0,10))
    const chelLC = (chLC||[]).reduce((s:number,r:any)=>s+Number(r.valoare||0),0)
    console.log('[D] step7 done — chLC')
    setPrognoza({ incasariLV: Math.round(incLV), cheltuieliLC: Math.round(chelLC) })
    // Booking widget - perioada curenta (Vineri-Joi)
    const nowD=new Date(); const dayD=nowD.getDay()
    const diffFri=(dayD+2)%7
    const friD=new Date(nowD); friD.setDate(nowD.getDate()-diffFri); friD.setHours(0,0,0,0)
    const thuD=new Date(friD); thuD.setDate(friD.getDate()+6)
    const payFriD=new Date(friD); payFriD.setDate(friD.getDate()+7)
    const fmtD=(d:Date)=>d.toISOString().split('T')[0]
    const {data:bkRez}=await supabase.from('rezervari').select('valoare_bruta,suma_incasata,status_plata').eq('canal','booking').neq('status_rezervare','anulata').gte('data_checkout',fmtD(friD)).lte('data_checkout',fmtD(thuD))
    const bkNet=(bkRez||[]).reduce((s:number,r:any)=>s+Number(r.valoare_bruta||r.suma_incasata||0)*0.83,0)
    const bkKey=`booking_period_${fmtD(friD)}`
    const {data:bkSaved}=await supabase.from('setari').select('valoare').eq('cheie',bkKey).maybeSingle()
    console.log('[D] step8 done — bkRez + bkSaved')
    const bkStatus=bkSaved?.valoare||(bkRez||[]).every((r:any)=>r.status_plata==='incasat')?'incasat':'urmeaza'
    setBookingWidget({net:Math.round(bkNet),count:(bkRez||[]).length,payDate:fmtD(payFriD),status:bkStatus,from:fmtD(friD),to:fmtD(thuD)})
    // Incasari nete per apartament - calculat din rezLuna+aptData deja incarcate
    const aptMap=Object.fromEntries((aptData||[]).map((a:any)=>[a.id,a]))
    const byApt:Record<string,{apt:any;net:number;brut:number}>={}
    for(const r of (rezLuna||[])){
      const apt=aptMap[r.apartament_id]; if(!apt) continue
      const brut=proRataLuna(r)
      const canal=(r.canal||'').toLowerCase()
      const net=canal==='airbnb'?brut*0.85*(1-0.21*0.15):canal==='booking'?brut*0.83*(1-0.21*0.17):brut
      if(!byApt[apt.id]) byApt[apt.id]={apt,net:0,brut:0}
      byApt[apt.id].net+=net
      byApt[apt.id].brut+=brut
    }
    const perApt=Object.values(byApt).map(x=>({...x,net:Math.round(x.net),brut:Math.round(x.brut)})).filter(x=>x.net>0).sort((a,b)=>b.net-a.net)
    setPerAptIncome(perApt)
    // Rezervari luna pentru tabelul de verificare (checkin in luna curenta, sortate cronologic)
    setRezLunaDsp((rezLuna||[]).filter((r:any)=>r.data_checkin>=primaZiLuna).sort((a:any,b:any)=>a.data_checkin.localeCompare(b.data_checkin)))
    console.log('[D] loadData COMPLETE')
    }catch(err){console.error('[D] loadData CAUGHT:', err)}
    console.log('[D] setLoading(false) apelat')
    setLoading(false)
  }

  async function fetchPreturiLive(dataParam?: string) {
    setLoadingPreturi(true)
    const { data: aptsData } = await supabase.from('apartamente').select('id,nume,nota,link_booking,link_airbnb').eq('status','activ')
    if (!aptsData) { setLoadingPreturi(false); return }
    const pad2=(n:number)=>String(n).padStart(2,'0')
    const fmt2=(d:Date)=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`
    const checkin = dataParam || (preturiData || fmt2(new Date()))
    const coD = new Date(checkin+'T12:00:00'); coD.setDate(coD.getDate()+1)
    const checkout = fmt2(coD)
    const now = new Date().toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})
    const results: any[] = []
    for (const apt of aptsData) {
      const bUrl = (apt as any).link_booking; const aUrl = (apt as any).link_airbnb
      let bP: number|null = null; let aP: number|null = null
      if (bUrl) { try { const r = await fetch('/api/preturi-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:bUrl,platform:'booking',checkin,checkout})}); const d = await r.json(); if(d.ok) bP=d.pret } catch {} }
      if (aUrl) { try { const r = await fetch('/api/preturi-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:aUrl,platform:'airbnb',checkin,checkout})}); const d = await r.json(); if(d.ok) aP=d.pret } catch {} }
      if (bP||aP) results.push({id:apt.id,nume:(apt as any).nota||apt.nume,booking:bP,airbnb:aP,updatedAt:now})
    }
    setPreturiLive(results); setLoadingPreturi(false)
  }

  async function togglePaid(ch:any){
    const ns=ch.status==='validat'?'nevalidat':'validat'
    setToggling(ch.id)
    await supabase.from('cheltuieli').update({status:ns}).eq('id',ch.id)
    setCheltuieli(list=>list.map(i=>i.id===ch.id?{...i,status:ns}:i))
    setToggling(null)
  }

  // apartamente ocupate azi
  const ocupateIds=new Set(rezervariActive.map((r:any)=>r.apartament_id))
  const libereAzi=apts.filter(a=>!ocupateIds.has(a.id))

  // Curatenie simpla:
  // CO azi = de facut curat (stim locatia)
  // CI azi = numarul de lenjerii necesar
  // Combinam: pentru fiecare CO, cautam daca exista CI in acelasi apartament
  const curatenjeAzi: any[] = checkoutAzi.map((co:any)=>{
    const ciMatch = checkinAzi.find((ci:any)=>ci.apartament?.id===co.apartament?.id)
    return { ...co, ciClient: ciMatch, tip: ciMatch?'co_ci':'checkout' }
  })
  function nrLenjerii(nrPers:number){ return Math.ceil(nrPers/2) }
  function waEchipaCuratenie(){
    const azi = new Date().toLocaleDateString('ro-RO')
    const linii = coAziCur.map((co:any)=>{
      const apt = co.apartament
      const ciMatch = ciAziCur.find((ci:any)=>ci.apartament?.id===apt?.id)
      const pers = Number(ciMatch?.nr_persoane||co.nr_persoane||1)
      const len = lenjerii[co.id] ?? nrLenjerii(pers)
      const aptStr = (apt?.nota?'['+apt.nota+'] ':'') + (apt?.nume||'')
      const clientStr = ciMatch
        ? 'CO: '+co.nume_client+' | CI: '+ciMatch.nume_client
        : 'CO: '+co.nume_client
      return aptStr+'\n   '+clientStr+'\n   Lenjerii: '+len
    }).join('\n\n')
    const msg = 'Curatenie '+azi+'\n\n'+linii+'\n\nMultumesc!'
    const nr = '40756942108'
    window.open('https://wa.me/'+nr+'?text='+encodeURIComponent(msg),'_blank')
  }

  // plati scadente
  function getAptCheltuieli(aptId:string){
    return cheltuieli.filter(c=>{
      if(c.apartament_id!==aptId||c.status==='validat')return false
      return daysUntil(parseInt(c.data?.slice(8,10)||'1'),luna,an)<=14
    }).sort((a,b)=>parseInt(a.data?.slice(8,10))-parseInt(b.data?.slice(8,10)))
  }
  const fiscalScadente=FISCAL_ROWS.filter(ft=>{
    const item=cheltuieli.find(c=>c.categorie===ft.key&&!c.apartament_id)
    return item?.status!=='validat'&&daysUntil(ft.due,luna,an)<=14
  })
  const totalScadente=apts.reduce((s,a)=>s+getAptCheltuieli(a.id).length,0)+fiscalScadente.length
  const gradOcupare=stats.gradOcupare||0
  const lunaLabel=format(now,'MMMM yyyy',{locale:ro})
  const EXCLUSE_NOTA_V=new Set(['CG40','VM07'])
  const EXCLUSE_NUME_V=['cherry','comfy']
  function isAptVerde(apt:any){ return !EXCLUSE_NOTA_V.has(apt?.nota) && !EXCLUSE_NUME_V.some(k=>apt?.nume?.toLowerCase().includes(k)) }
  const lunaVitoareLabel=format(new Date(an,luna,1),'MMMM yyyy',{locale:ro})
  const pctCh=cheltuieli.length>0?Math.round(cheltuieli.filter(c=>c.status==='validat').length/cheltuieli.length*100):0

  /* ── stiluri ─────────────────────────────────────────────────────────── */
  const panel:React.CSSProperties={background:'rgba(214,228,244,0.05)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',border:'1px solid rgba(159,215,255,0.1)',borderRadius:10,overflow:'hidden'}
  const panelHdr:React.CSSProperties={display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px',background:'rgba(14,27,43,0.5)',borderBottom:'1px solid rgba(159,215,255,0.07)'}
  const panelTitle:React.CSSProperties={fontSize:10,fontWeight:600,color:'rgba(159,215,255,0.55)',textTransform:'uppercase',letterSpacing:'0.8px'}
  const waBtn=(color:string,bg:string):React.CSSProperties=>({display:'flex',alignItems:'center',gap:5,padding:'6px 11px',borderRadius:7,border:`1px solid ${color}`,background:bg,color,fontSize:11,fontWeight:600,cursor:'pointer',textDecoration:'none',whiteSpace:'nowrap' as const,flexShrink:0})

  /* ── card oaspete ────────────────────────────────────────────────────── */
  function GuestCard({r,type}:{r:any;type:'checkin'|'checkout'}){
    const apt=r.apartament
    const isCI=type==='checkin'
    const color=isCI?'#FCD34D':'#C084FC'
    const phone=r.telefon_client||''
    return(
      <div style={{background:'rgba(20,35,58,0.6)',border:`1px solid ${isCI?'rgba(252,211,77,0.2)':'rgba(192,132,252,0.2)'}`,borderRadius:10,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap' as const}}>
        {/* avatar */}
        <div style={{width:38,height:38,borderRadius:10,background:`${color}18`,border:`1px solid ${color}33`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:15,fontWeight:700,color}}>
          {(r.nume_client||'?')[0].toUpperCase()}
        </div>
        {/* info */}
        <div style={{flex:1,minWidth:120}}>
          <div style={{fontSize:13,fontWeight:600,color:'#E8F4FF',marginBottom:2}}>{r.nume_client}</div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' as const}}>
            {apt?.nota&&<span style={{fontSize:10,fontWeight:600,color:'var(--accent-blue)',background:'rgba(77,163,255,0.12)',padding:'1px 6px',borderRadius:4}}>{apt.nota}</span>}
            <span style={{fontSize:11,color:'rgba(159,215,255,0.5)'}}>{apt?.nume}</span>
            {phone&&<span style={{fontSize:11,color:'rgba(159,215,255,0.35)',display:'flex',alignItems:'center',gap:3}}><Phone size={9}/>{phone}</span>}
          </div>
        </div>
        {/* butoane WA */}
        <div style={{display:'flex',gap:6,flexWrap:'wrap' as const}}>
          {isCI&&(<>
            <a href={waLink(phone,msgCheckin(r))} target="_blank" rel="noreferrer"
              style={waBtn('rgba(252,211,77,0.9)','rgba(252,211,77,0.08)')}>
              <MessageCircle size={12}/>Confirmare
            </a>
            <a href={waLink(phone,msgAcces(r))} target="_blank" rel="noreferrer"
              style={waBtn('rgba(77,163,255,0.9)','rgba(77,163,255,0.08)')}>
              <Key size={12}/>Date acces
            </a>
          </>)}
          {!isCI&&(
            <a href={waLink(phone,msgCheckoutGen(r,sabloaneCO))} target="_blank" rel="noreferrer"
              style={waBtn('rgba(192,132,252,0.9)','rgba(192,132,252,0.08)')}>
              <LogOut size={12}/>Check-out
            </a>
          )}
        </div>
      </div>
    )
  }

  if(loading)return<><PageHeader title="Dashboard"/><PageLoading/></>

  return(
    <>
      <style>{`
        @media (max-width: 768px) {
          .kpi-grid { grid-template-columns: repeat(2,1fr) !important; }
          .guest-grid { grid-template-columns: 1fr !important; }
          .grafice-grid { display: none !important; }
          .prognoza-card { display: none !important; }
        }
      `}</style>
      {/* TOP BAR */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 20px',background:'rgba(14,27,43,0.65)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',borderBottom:'1px solid rgba(159,215,255,0.08)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <span style={{fontSize:12,fontWeight:600,color:'#FFFFFF',letterSpacing:-0.2}}>Dashboard</span>
          <span style={{fontSize:11,color:'rgba(159,215,255,0.4)',fontFamily:'monospace'}}>{format(now,'EEE dd MMM yyyy · HH:mm',{locale:ro})}</span>
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'#22C55E',boxShadow:'0 0 6px rgba(34,197,94,0.8)'}}/>
            <span style={{fontSize:10,color:'#22C55E',fontFamily:'monospace'}}>LIVE</span>
          </div>
        </div>
        <Link href="/rezervari" style={{display:'inline-flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:7,background:'rgba(77,163,255,0.85)',border:'1px solid rgba(159,215,255,0.35)',color:'#FFFFFF',fontSize:12,fontWeight:500,textDecoration:'none'}}>+ Rezervare nouă</Link>
      </div>

      <div style={{flex:1,overflowY:'auto',overflowX:'hidden',padding:'14px 16px 60px',display:'flex',flexDirection:'column',gap:12}}>

        {/* BANNER CHECK-OUT DIMINEATA */}
        {(()=>{
          const isMorning=now.getHours()>=7&&now.getHours()<11
          const coWithPhone=checkoutAzi.filter(r=>r.telefon_client)
          if(!isMorning||checkoutAzi.length===0||coBannerDismissed||coMesajeTrimise)return null
          return(
            <div style={{background:'rgba(192,132,252,0.08)',border:'1px solid rgba(192,132,252,0.35)',borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap' as const}}>
              <div style={{fontSize:20}}>🌅</div>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:13,fontWeight:700,color:'#C084FC',marginBottom:2}}>
                  {checkoutAzi.length === 1 ? '1 client pleacă azi' : `${checkoutAzi.length} clienți pleacă azi`} — trimite mesajele de checkout
                </div>
                <div style={{fontSize:11,color:'rgba(159,215,255,0.45)'}}>
                  {checkoutAzi.map(r=>r.apartament?.nota||r.apartament?.nume).filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
                {coWithPhone.length>0&&(
                  <button onClick={()=>{setCoWizardIdx(0);setCoWizardOpen(true)}}
                    style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:8,border:'1px solid rgba(74,222,128,0.4)',background:'rgba(74,222,128,0.1)',color:'#4ADE80',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    <MessageCircle size={13}/>Trimite mesaje ({coWithPhone.length})
                  </button>
                )}
                <button onClick={()=>{setCoBannerDismissed(true);try{localStorage.setItem('co_banner_'+todayStr,'1')}catch{}}}
                  style={{padding:'8px 12px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.4)',fontSize:12,cursor:'pointer'}}>
                  Ignoră
                </button>
              </div>
            </div>
          )
        })()}

        {/* KPI STRIP */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}} className="kpi-grid">
          {[
            {label:'APARTAMENTE',value:stats.apartamenteActive,accent:'#4DA3FF',icon:<Building2 size={12}/>,sub:'active'},
            {label:'REZERVĂRI LUNA',value:stats.rezervariActive,accent:'#9FD7FF',icon:<CalendarCheck size={12}/>,sub:lunaLabel.split(' ')[0]},
            {label:`ÎNCASĂRI ${lunaLabel.split(' ')[0].toUpperCase()}`,value:`${(stats.incasariNetFiltrat||0).toLocaleString('ro-RO')}`,accent:'#22C55E',icon:<DollarSign size={12}/>,sub:'RON net',sub2:`brut ${(stats.incasariBrutFiltrat||0).toLocaleString('ro-RO')}`,sub2Color:'#22C55E'},
            {label:'COMISIOANE',value:`${stats.comisioaneLuna.toLocaleString('ro-RO')}`,accent:'#4DA3FF',icon:<Percent size={12}/>,sub:'RON firmă'},
            {label:'GRAD OCUPARE',value:`${gradOcupare}%`,accent:gradOcupare>60?'#22C55E':'#F59E0B',icon:<Activity size={12}/>,sub:`${lunaLabel.split(' ')[0]} · ${stats.apartamenteActive} ap.`},
            {label:'TASKURI URGENTE',value:stats.taskuriUrgente,accent:stats.taskuriUrgente>0?'#EF4444':'#22C55E',icon:<CheckSquare size={12}/>,sub:'nerezolvate'},
          ].map((k,i)=>(
            <div key={i} style={{...panel,borderTop:`2px solid ${k.accent}`}}>
              <div style={{padding:'10px 12px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                  <span style={panelTitle}>{k.label}</span>
                  <span style={{color:k.accent,opacity:0.7}}>{k.icon}</span>
                </div>
                <div style={{fontFamily:'monospace',fontSize:22,fontWeight:700,color:k.accent,letterSpacing:-1,lineHeight:1}}>{k.value}</div>
                {(k as any).sub2&&<div style={{fontFamily:'monospace',fontSize:13,fontWeight:600,color:(k as any).sub2Color||k.accent,marginTop:3}}>{(k as any).sub2}</div>}
                <div style={{fontSize:10,color:'rgba(159,215,255,0.4)',marginTop:4}}>{k.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="prognoza-card">
        {/* ══ PROGNOZA LUNA VIITOARE ══ */}
        {(()=>{
          const pct=prognoza.cheltuieliLC>0?Math.min(100,Math.round((prognoza.incasariLV/prognoza.cheltuieliLC)*100)):0
          const deficit=prognoza.cheltuieliLC-prognoza.incasariLV
          const color=pct>=100?'#4ADE80':pct>=70?'#FCD34D':pct>=40?'#F97316':'#F87171'
          const lvShort=lunaVitoareLabel.split(' ')[0]
          const lcShort=lunaLabel.split(' ')[0]
          return(
            <div style={{background:'rgba(214,228,244,0.05)',backdropFilter:'blur(24px)',border:`1px solid ${color}25`,borderTop:`2px solid ${color}`,borderRadius:10,padding:'10px 14px',display:'grid',gridTemplateColumns:'auto 1fr auto auto',alignItems:'center',gap:14}}>
              <div>
                <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:2}}>Prognoză {lvShort}</div>
                <div style={{fontSize:22,fontWeight:700,color,fontFamily:'monospace',lineHeight:1}}>{pct}%</div>
                <div style={{fontSize:9,color:'rgba(159,215,255,0.35)',marginTop:2}}>{deficit>0?`-${deficit.toLocaleString('ro-RO')} deficit`:`+${Math.abs(deficit).toLocaleString('ro-RO')} surplus`}</div>
              </div>
              <div>
                <div style={{height:6,background:'rgba(159,215,255,0.08)',borderRadius:3,overflow:'hidden',marginBottom:4}}>
                  <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:3,transition:'width 0.8s ease'}}/>
                </div>
                <div style={{fontSize:9,color:'rgba(159,215,255,0.3)'}}>
                  {pct<100?`Mai necesari ${deficit.toLocaleString('ro-RO')} RON în ${lvShort}`:`Cheltuielile din ${lcShort} sunt acoperite ✓`}
                </div>
              </div>
              <div style={{textAlign:'right' as const}}>
                <div style={{fontSize:9,color:'rgba(74,222,128,0.5)',marginBottom:2,textTransform:'uppercase',letterSpacing:'.05em'}}>Rezervări {lvShort}</div>
                <div style={{fontSize:14,fontWeight:700,color:'#4ADE80',fontFamily:'monospace'}}>{prognoza.incasariLV.toLocaleString('ro-RO')}</div>
                <div style={{fontSize:9,color:'rgba(159,215,255,0.3)'}}>RON</div>
              </div>
              <div style={{textAlign:'right' as const}}>
                <div style={{fontSize:9,color:'rgba(248,113,113,0.5)',marginBottom:2,textTransform:'uppercase',letterSpacing:'.05em'}}>Cheltuieli {lcShort}</div>
                <div style={{fontSize:14,fontWeight:700,color:'#F87171',fontFamily:'monospace'}}>{prognoza.cheltuieliLC.toLocaleString('ro-RO')}</div>
                <div style={{fontSize:9,color:'rgba(159,215,255,0.3)'}}>RON</div>
              </div>
            </div>
          )
        })()}

        </div>
        {/* ══ BOOKING WIDGET ══ */}
        <div className="prognoza-card">
        {(()=>{
          const isInc=bookingWidget.status==='incasat'
          const payDateFmt=bookingWidget.payDate?new Date(bookingWidget.payDate+'T12:00:00').toLocaleDateString('ro-RO',{day:'numeric',month:'short'}):''
          return bookingWidget.count>0?(
            <div style={{background:'rgba(214,228,244,0.05)',border:'0.5px solid rgba(0,83,186,0.3)',borderTop:'2px solid #0055A5',borderRadius:10,padding:'10px 14px',display:'grid',gridTemplateColumns:'auto 1fr auto',alignItems:'center',gap:12}}>
              <div style={{width:36,height:36,borderRadius:9,background:'rgba(0,83,186,0.15)',border:'0.5px solid rgba(0,83,186,0.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <span style={{fontSize:18}}>🏨</span>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:600,color:'rgba(159,215,255,0.45)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:2}}>Încasare Booking</div>
                <div style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>{bookingWidget.count} rez · {lunaLabel} · Plată {payDateFmt}</div>
              </div>
              <div style={{textAlign:'right' as const}}>
                <div style={{fontSize:18,fontWeight:700,color:isInc?'#4ADE80':'#60A5FA',fontFamily:'monospace'}}>{bookingWidget.net.toLocaleString('ro-RO')}</div>
                <div style={{fontSize:9,color:'rgba(159,215,255,0.3)'}}>RON net</div>
              </div>
            </div>
          ):null
        })()}
        </div>

        {/* ══ INCASARI NETE PER LOCATIE ══ */}
        <div style={panel}>
            <div style={panelHdr}>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <TrendingUp size={12} color="#4ADE80"/>
                <span style={{...panelTitle,color:'#4ADE80'}}>Încasări nete {lunaLabel.split(' ')[0]} — per locație</span>
              </div>
              <span style={{fontSize:10,fontWeight:600,color:'#4ADE80',background:'rgba(74,222,128,0.1)',padding:'1px 7px',borderRadius:10}}>{perAptIncome.length} locații</span>
            </div>
            <div style={{padding:'8px 10px',display:'flex',flexWrap:'wrap',gap:6}}>
              {perAptIncome.length===0
                ?<div style={{padding:'12px 4px',fontSize:11,color:'rgba(159,215,255,0.25)'}}>Nicio încasare înregistrată pentru luna curentă</div>
                :perAptIncome.map(({apt,net})=>{
                  const verde=isAptVerde(apt)
                  const color=verde?'#4ADE80':'#FB923C'
                  const bg=verde?'rgba(74,222,128,0.07)':'rgba(251,146,60,0.07)'
                  const border=verde?'rgba(74,222,128,0.2)':'rgba(251,146,60,0.2)'
                  return(
                    <div key={apt.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 12px',background:bg,border:`1px solid ${border}`,borderRadius:8}}>
                      {apt.nota&&<span style={{fontSize:10,fontWeight:700,color:'var(--accent-blue)',background:'rgba(77,163,255,0.12)',padding:'1px 6px',borderRadius:4,fontFamily:'monospace',flexShrink:0}}>{apt.nota}</span>}
                      <span style={{fontSize:11,color:'rgba(214,228,244,0.75)',flexShrink:0}}>{apt.nume}</span>
                      <span style={{fontSize:13,fontWeight:700,color,fontFamily:'monospace',flexShrink:0}}>{net.toLocaleString('ro-RO')} <span style={{fontSize:9,fontWeight:400,color:'rgba(159,215,255,0.4)'}}>RON</span></span>
                    </div>
                  )
                })
              }
            </div>
          </div>

        {/* ══ OASPETI AZI ══ */}
        {/* ══ OASPETI AZI ══ */}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <div style={{display:'grid',gridTemplateColumns:coMesajeTrimise?'repeat(2,1fr)':'repeat(3,1fr)',gap:8}} className="guest-grid">

          {/* CHECK-IN AZI */}
          <div style={panel}>
            <div style={panelHdr}>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <LogIn size={12} color="#FCD34D"/>
                <span style={{...panelTitle,color:'#FCD34D'}}>Check-in astăzi</span>
              </div>
              <span style={{fontSize:10,fontWeight:600,color:'#FCD34D',background:'rgba(252,211,77,0.1)',padding:'1px 7px',borderRadius:10}}>{checkinAzi.length}</span>
            </div>
            <div style={{padding:'10px',display:'flex',flexDirection:'column',gap:8}}>
              {checkinAzi.length===0
                ?<div style={{padding:'16px',textAlign:'center',fontSize:11,color:'rgba(159,215,255,0.25)'}}>Niciun check-in astăzi</div>
                :checkinAzi.map(r=><GuestCard key={r.id} r={r} type="checkin"/>)
              }
            </div>
          </div>

          {/* CHECK-OUT AZI */}
          {!coMesajeTrimise&&<div style={panel}>
            <div style={panelHdr}>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <LogOut size={12} color="#C084FC"/>
                <span style={{...panelTitle,color:'#C084FC'}}>Check-out astăzi</span>
                <span style={{fontSize:10,fontWeight:600,color:'#C084FC',background:'rgba(192,132,252,0.1)',padding:'1px 7px',borderRadius:10}}>{checkoutAzi.length}</span>
              </div>
              {checkoutAzi.filter(r=>r.telefon_client).length>0&&(
                <button onClick={()=>{setCoWizardIdx(0);setCoWizardOpen(true)}}
                  style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(192,132,252,0.3)',background:'rgba(192,132,252,0.08)',color:'#C084FC',fontSize:10,fontWeight:600,cursor:'pointer'}}>
                  <MessageCircle size={10}/>Trimite tuturor
                </button>
              )}
            </div>
            <div style={{padding:'10px',display:'flex',flexDirection:'column',gap:8}}>
              {checkoutAzi.length===0
                ?<div style={{padding:'16px',textAlign:'center',fontSize:11,color:'rgba(159,215,255,0.25)'}}>Niciun check-out astăzi</div>
                :checkoutAzi.map(r=><GuestCard key={r.id} r={r} type="checkout"/>)
              }
            </div>
          </div>}

          {/* REZERVARI ACTIVE ACUM */}
          <div style={panel}>
            <div style={panelHdr}>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <BedDouble size={12} color="#7BC8FF"/>
                <span style={{...panelTitle,color:'#7BC8FF'}}>Rezervări în curs</span>
                <span style={{fontSize:10,fontWeight:600,color:'#7BC8FF',background:'rgba(123,200,255,0.1)',padding:'1px 7px',borderRadius:10}}>{rezervariCurente.length}</span>
              </div>
              <Link href="/rezervari" style={{fontSize:9,color:'#4DA3FF',textDecoration:'none',display:'flex',alignItems:'center',gap:2}}>TOATE <ArrowUpRight size={9}/></Link>
            </div>
            <div style={{padding:'10px',display:'flex',flexDirection:'column',gap:7}}>
              {rezervariCurente.length===0
                ?<div style={{padding:'16px',textAlign:'center',fontSize:11,color:'rgba(159,215,255,0.25)'}}>Nicio rezervare activă acum</div>
                :rezervariCurente.map((r:any)=>{
                  const apt=r.apartament
                  const phone=r.telefon_client||''
                  const noptiRamase=Math.ceil((new Date(r.data_checkout).getTime()-new Date().getTime())/(1000*60*60*24))
                  return(
                    <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'rgba(20,35,58,0.6)',border:'1px solid rgba(123,200,255,0.15)',borderRadius:9}}>
                      <div style={{width:32,height:32,borderRadius:8,background:'rgba(123,200,255,0.12)',border:'1px solid rgba(123,200,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:13,fontWeight:700,color:'#7BC8FF'}}>
                        {(r.nume_client||'?')[0].toUpperCase()}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:'#E8F4FF',marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.nume_client}</div>
                        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const}}>
                          {apt?.nota&&<span style={{fontSize:10,fontWeight:600,color:'var(--accent-blue)',background:'rgba(77,163,255,0.12)',padding:'1px 5px',borderRadius:4,flexShrink:0}}>{apt.nota}</span>}
                          <span style={{fontSize:11,color:'rgba(159,215,255,0.45)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{apt?.nume}</span>
                          <span style={{fontSize:10,fontWeight:500,color:noptiRamase<=1?'#F87171':noptiRamase<=2?'#FCD34D':'rgba(74,222,128,0.7)',flexShrink:0}}>
                            {noptiRamase<=0?'CO azi':noptiRamase===1?'1n rămasă':`${noptiRamase}n rămase`}
                          </span>
                        </div>
                        {phone&&<div style={{fontSize:10,color:'rgba(159,215,255,0.35)',marginTop:2,display:'flex',alignItems:'center',gap:3}}><Phone size={9}/>{phone}</div>}
                      </div>
                      {phone&&<div style={{display:'flex',gap:5,flexShrink:0}}>
                        <a href={`tel:${phone}`} style={{display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:7,border:'1px solid rgba(123,200,255,0.25)',background:'rgba(123,200,255,0.08)',color:'#7BC8FF',textDecoration:'none'}}>
                          <Phone size={13}/>
                        </a>
                        <a href={waLink(phone,`Bună ziua, ${firstName(r.nume_client)}! Vă contactăm de la AB Homes Iași. `)} target="_blank" rel="noreferrer"
                          style={{display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:7,border:'1px solid rgba(74,222,128,0.25)',background:'rgba(74,222,128,0.08)',color:'#4ADE80',textDecoration:'none'}}>
                          <MessageCircle size={13}/>
                        </a>
                      </div>}
                    </div>
                  )
                })
              }
            </div>
          </div>

        </div>{/* end 3-col grid */}

          {/* DISPONIBILE AZI - linie completa jos */}
          <div style={panel}>
            <div style={panelHdr}>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <BedDouble size={12} color="#4ADE80"/>
                <span style={{...panelTitle,color:'#4ADE80'}}>Disponibile astăzi</span>
              </div>
              <span style={{fontSize:10,fontWeight:600,color:'#4ADE80',background:'rgba(74,222,128,0.1)',padding:'1px 7px',borderRadius:10}}>{libereAzi.length}</span>
            </div>
            <div style={{padding:'8px 10px',display:'flex',flexWrap:'wrap',gap:6}}>
              {libereAzi.length===0
                ?<div style={{padding:'8px',fontSize:11,color:'rgba(159,215,255,0.25)'}}>Toate apartamentele sunt ocupate 🎉</div>
                :libereAzi.map(a=>(
                  <div key={a.id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',background:'rgba(74,222,128,0.07)',border:'1px solid rgba(74,222,128,0.2)',borderRadius:20}}>
                    {a.nota&&<span style={{fontSize:10,fontWeight:700,color:'var(--accent-blue)',fontFamily:'monospace'}}>{a.nota}</span>}
                    <span style={{fontSize:11,fontWeight:500,color:'rgba(214,228,244,0.85)'}}>{a.nume}</span>
                    <div style={{width:5,height:5,borderRadius:'50%',background:'#4ADE80',boxShadow:'0 0 3px rgba(74,222,128,0.7)',flexShrink:0}}/>
                  </div>
                ))
              }
            </div>
          </div>

        </div>{/* end outer flex */}

        {/* ══ CURĂȚENIE ASTĂZI ══ */}
        <div style={{background:'rgba(214,228,244,0.05)',border:'0.5px solid rgba(159,215,255,0.1)',borderTop:'2px solid #EF9F27',borderRadius:10,overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px',background:'rgba(14,27,43,0.5)',borderBottom:'0.5px solid rgba(159,215,255,0.07)'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:13}}>🧹</span>
              <span style={{fontSize:11,fontWeight:600,color:'rgba(159,215,255,0.55)',textTransform:'uppercase',letterSpacing:'0.7px'}}>Curățenie astăzi</span>
              <span style={{fontSize:11,fontWeight:600,background:'rgba(239,159,39,0.15)',color:'#EF9F27',padding:'1px 8px',borderRadius:20,border:'0.5px solid rgba(239,159,39,0.3)'}}>{coAziCur.length+ciAziCur.filter((ci:any)=>!coAziCur.find((co:any)=>co.apartament?.id===ci.apartament?.id)).length}</span>
            </div>
            <button onClick={waEchipaCuratenie} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:7,border:'0.5px solid rgba(74,222,128,0.3)',background:'rgba(74,222,128,0.08)',color:'#4ADE80',fontSize:12,fontWeight:500,cursor:'pointer'}}>
              <MessageCircle size={13}/>WA echipă
            </button>
          </div>
          <div style={{padding:'8px 12px',display:'flex',flexDirection:'column',gap:6}}>
            {coAziCur.length===0&&ciAziCur.length===0&&(
              <div style={{padding:'10px 4px',fontSize:12,color:'rgba(159,215,255,0.25)',fontStyle:'italic'}}>Nicio curățenie programată astăzi</div>
            )}
            {coAziCur.map((co:any,idx:number)=>{
              const apt=co.apartament
              const ciMatch=ciAziCur.find((ci:any)=>ci.apartament?.id===apt?.id)
              const pers=Number(ciMatch?.nr_persoane||co.nr_persoane||2)
              const lenDef=nrLenjerii(pers)
              const len=lenjerii[co.id]??lenDef
              return(
                <div key={co.id||idx} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:ciMatch?'rgba(248,113,113,0.05)':'rgba(252,211,77,0.04)',border:`0.5px solid ${ciMatch?'rgba(248,113,113,0.2)':'rgba(252,211,77,0.15)'}`,borderRadius:8}}>
                  {apt?.nota&&<span style={{fontSize:10,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.12)',padding:'2px 7px',borderRadius:4,fontFamily:'monospace',flexShrink:0}}>{apt.nota}</span>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,color:'rgba(214,228,244,0.9)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{apt?.nume||'—'}</div>
                    <div style={{fontSize:11,marginTop:1}}>
                      {ciMatch
                        ?<><span style={{color:'#F87171'}}>CO: {co.nume_client}</span><span style={{color:'rgba(159,215,255,0.3)'}}> → </span><span style={{color:'#4ADE80'}}>CI: {ciMatch.nume_client}</span></>
                        :<span style={{color:'#FCD34D'}}>CO: {co.nume_client}</span>
                      }
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                    <BedDouble size={13} color="rgba(159,215,255,0.35)"/>
                    <button onClick={()=>setLenjerii((l:any)=>({...l,[co.id]:Math.max(1,(l[co.id]??lenDef)-1)}))}
                      style={{width:24,height:24,borderRadius:5,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:300}}>−</button>
                    <span style={{fontSize:15,fontWeight:600,color:'#FCD34D',minWidth:20,textAlign:'center' as const}}>{len}</span>
                    <button onClick={()=>setLenjerii((l:any)=>({...l,[co.id]:(l[co.id]??lenDef)+1}))}
                      style={{width:24,height:24,borderRadius:5,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:300}}>+</button>
                  </div>
                  <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,flexShrink:0,
                    color:ciMatch?'#F87171':'#FCD34D',
                    background:ciMatch?'rgba(248,113,113,0.12)':'rgba(252,211,77,0.1)',
                    border:`0.5px solid ${ciMatch?'rgba(248,113,113,0.25)':'rgba(252,211,77,0.2)'}`}}>
                    {ciMatch?'CO→CI':'CO'}
                  </span>
                </div>
              )
            })}
            {ciAziCur.filter((ci:any)=>!coAziCur.find((co:any)=>co.apartament?.id===ci.apartament?.id)).map((ci:any,idx:number)=>{
              const apt=ci.apartament
              const pers=Number(ci.nr_persoane||2)
              const lenDef=nrLenjerii(pers)
              const len=lenjerii[ci.id]??lenDef
              return(
                <div key={ci.id||idx} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'rgba(74,222,128,0.04)',border:'0.5px solid rgba(74,222,128,0.15)',borderRadius:8}}>
                  {apt?.nota&&<span style={{fontSize:10,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.12)',padding:'2px 7px',borderRadius:4,fontFamily:'monospace',flexShrink:0}}>{apt.nota}</span>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,color:'rgba(214,228,244,0.9)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{apt?.nume||'—'}</div>
                    <div style={{fontSize:11,color:'#4ADE80',marginTop:1}}>CI: {ci.nume_client}</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                    <BedDouble size={13} color="rgba(159,215,255,0.35)"/>
                    <button onClick={()=>setLenjerii((l:any)=>({...l,[ci.id]:Math.max(1,(l[ci.id]??lenDef)-1)}))}
                      style={{width:24,height:24,borderRadius:5,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:300}}>−</button>
                    <span style={{fontSize:15,fontWeight:600,color:'#FCD34D',minWidth:20,textAlign:'center' as const}}>{len}</span>
                    <button onClick={()=>setLenjerii((l:any)=>({...l,[ci.id]:(l[ci.id]??lenDef)+1}))}
                      style={{width:24,height:24,borderRadius:5,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:300}}>+</button>
                  </div>
                  <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,color:'#4ADE80',background:'rgba(74,222,128,0.1)',border:'0.5px solid rgba(74,222,128,0.2)',flexShrink:0}}>CI</span>
                </div>
              )
            })}
          </div>
        </div>


        {/* ROW GRAFICE */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 300px',gap:8}} className="grafice-grid">
          {/* REVENUE */}
          <div style={panel}>
            <div style={panelHdr}>
              <span style={panelTitle}>Venituri lunare</span>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <span style={{fontSize:10,color:'rgba(77,163,255,0.6)',fontFamily:'monospace'}}>{DEMO_REVENUE[DEMO_REVENUE.length-1].valoare.toLocaleString('ro-RO')} RON</span>
                <span style={{fontSize:9,color:'#22C55E',fontFamily:'monospace'}}>▲ +23.9%</span>
              </div>
            </div>
            <div style={{padding:'16px 14px 10px'}}>
              <RevenueChart data={DEMO_REVENUE}/>
              <div style={{display:'flex',gap:16,marginTop:10}}>
                <div>
                  <div style={{fontFamily:'monospace',fontSize:18,fontWeight:700,color:'#4DA3FF'}}>{stats.incasariNet>0?stats.incasariNet.toLocaleString('ro-RO'):'11.400'}</div>
                  <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>RON luna curentă</div>
                </div>
                <div style={{marginLeft:'auto'}}>
                  <div style={{fontFamily:'monospace',fontSize:18,fontWeight:700,color:'#22C55E'}}>{stats.comisioaneLuna>0?stats.comisioaneLuna.toLocaleString('ro-RO'):'1.710'}</div>
                  <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>RON comisioane</div>
                </div>
              </div>
            </div>
            {/* Acoperire cheltuieli luna precedenta */}
            {cheltuieliLP.total>0&&(
              <div style={{padding:'0 14px 14px'}}>
                <div style={{background:'rgba(14,27,43,0.5)',borderRadius:8,padding:'10px 12px',border:'1px solid rgba(159,215,255,0.08)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <span style={{fontSize:10,color:'rgba(159,215,255,0.45)',textTransform:'uppercase' as const,letterSpacing:'.06em'}}>
                      Acoperire cheltuieli luna anterioară
                    </span>
                    <span style={{fontSize:14,fontWeight:700,fontFamily:'monospace',
                      color:stats.incasariNet>=cheltuieliLP.total?'#4ADE80':stats.incasariNet>=cheltuieliLP.total*0.7?'#FCD34D':'#F87171'}}>
                      {cheltuieliLP.total>0?Math.round(Math.min(100,stats.incasariNet/cheltuieliLP.total*100)):0}%
                    </span>
                  </div>
                  <div style={{height:5,background:'rgba(159,215,255,0.08)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{
                      height:'100%',borderRadius:3,transition:'width .5s',
                      width:`${cheltuieliLP.total>0?Math.min(100,stats.incasariNet/cheltuieliLP.total*100):0}%`,
                      background:stats.incasariNet>=cheltuieliLP.total?'#4ADE80':stats.incasariNet>=cheltuieliLP.total*0.7?'#FCD34D':'#F87171'
                    }}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}>
                    <span style={{fontSize:9,color:'rgba(159,215,255,0.3)'}}>
                      Cheltuieli: {cheltuieliLP.total.toLocaleString('ro-RO')} RON
                    </span>
                    <span style={{fontSize:9,color:'rgba(159,215,255,0.3)'}}>
                      Încasat: {stats.incasariNet.toLocaleString('ro-RO')} RON
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* REZERVARI RECENTE */}
          <div style={panel}>
            <div style={panelHdr}>
              <span style={panelTitle}>Rezervări recente</span>
              <Link href="/rezervari" style={{fontSize:9,color:'#4DA3FF',textDecoration:'none',display:'flex',alignItems:'center',gap:2}}>TOATE <ArrowUpRight size={9}/></Link>
            </div>
            <div style={{overflow:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  {['CLIENT','APARTAMENT','CI','CO','SUMĂ','CANAL'].map(h=>(
                    <th key={h} style={{padding:'7px 10px',textAlign:'left',fontSize:9,fontWeight:600,color:'rgba(159,215,255,0.35)',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid rgba(159,215,255,0.06)',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rezervariRecente.length===0
                    ?<tr><td colSpan={6} style={{padding:'20px 10px',textAlign:'center',fontSize:12,color:'rgba(159,215,255,0.3)'}}>Nicio rezervare</td></tr>
                    :rezervariRecente.map((r:any)=>(
                      <tr key={r.id}>
                        <td style={{padding:'8px 10px',fontSize:12,fontWeight:500,color:'#FFFFFF',borderBottom:'1px solid rgba(159,215,255,0.04)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:100}}>{r.nume_client}</td>
                        <td style={{padding:'8px 10px',fontSize:11,color:'rgba(159,215,255,0.55)',borderBottom:'1px solid rgba(159,215,255,0.04)',whiteSpace:'nowrap',maxWidth:90,overflow:'hidden',textOverflow:'ellipsis'}}>{r.apartament?.nume||'—'}</td>
                        <td style={{padding:'8px 10px',fontSize:10,color:'rgba(214,228,244,0.5)',borderBottom:'1px solid rgba(159,215,255,0.04)',fontFamily:'monospace',whiteSpace:'nowrap'}}>{r.data_checkin?.slice(5)}</td>
                        <td style={{padding:'8px 10px',fontSize:10,color:'rgba(214,228,244,0.5)',borderBottom:'1px solid rgba(159,215,255,0.04)',fontFamily:'monospace',whiteSpace:'nowrap'}}>{r.data_checkout?.slice(5)}</td>
                        <td style={{padding:'8px 10px',fontSize:11,fontWeight:600,color:'#4ADE80',borderBottom:'1px solid rgba(159,215,255,0.04)',fontFamily:'monospace',whiteSpace:'nowrap'}}>{Number(r.suma_incasata).toLocaleString('ro-RO')}</td>
                        <td style={{padding:'8px 10px',borderBottom:'1px solid rgba(159,215,255,0.04)',whiteSpace:'nowrap'}}><CanalBadge canal={r.canal}/></td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT COL */}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div style={panel}>
              <div style={panelHdr}><span style={panelTitle}>Ocupare</span></div>
              <div style={{padding:'12px 14px'}}>
                <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:8}}>
                  <span style={{fontFamily:'monospace',fontSize:32,fontWeight:700,color:gradOcupare>60?'#22C55E':'#F59E0B',letterSpacing:-1}}>{gradOcupare}%</span>
                  <span style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>grad ocupare</span>
                </div>
                <div style={{height:6,background:'rgba(159,215,255,0.08)',borderRadius:3,overflow:'hidden',marginBottom:8}}>
                  <div style={{height:'100%',width:`${gradOcupare}%`,background:gradOcupare>60?'linear-gradient(90deg,#22C55E,#4ADE80)':'linear-gradient(90deg,#F59E0B,#FCD34D)',borderRadius:3,transition:'width 0.6s ease'}}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  <div style={{background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.15)',borderRadius:6,padding:'6px 8px'}}>
                    <div style={{fontFamily:'monospace',fontSize:16,fontWeight:700,color:'#4ADE80'}}>{stats.rezervariActive}</div>
                    <div style={{fontSize:9,color:'rgba(159,215,255,0.35)'}}>OCUPATE</div>
                  </div>
                  <div style={{background:'rgba(77,163,255,0.08)',border:'1px solid rgba(77,163,255,0.15)',borderRadius:6,padding:'6px 8px'}}>
                    <div style={{fontFamily:'monospace',fontSize:16,fontWeight:700,color:'#7BC8FF'}}>{Math.max(0,stats.apartamenteActive-stats.rezervariActive)}</div>
                    <div style={{fontSize:9,color:'rgba(159,215,255,0.35)'}}>LIBERE</div>
                  </div>
                </div>
              </div>
            </div>
            <div style={panel}>
              <div style={panelHdr}><span style={panelTitle}>Trend rezervări</span><span style={{fontSize:9,color:'#22C55E',fontFamily:'monospace'}}>▲ +18%</span></div>
              <div style={{padding:'10px 12px 8px'}}>
                <Sparkline data={SPARKLINE_DATA} color="#4DA3FF"/>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                  <span style={{fontSize:9,color:'rgba(159,215,255,0.3)',fontFamily:'monospace'}}>Ian</span>
                  <span style={{fontSize:9,color:'rgba(159,215,255,0.3)',fontFamily:'monospace'}}>Iun</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ PLĂȚI SCADENTE ══ */}
        <div style={panel}>
          <div style={panelHdr}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={panelTitle}>Plăți scadente — următoarele 14 zile</span>
              {totalScadente>0&&<span style={{fontSize:10,fontWeight:600,color:'#F87171',background:'rgba(248,113,113,0.12)',border:'1px solid rgba(248,113,113,0.25)',borderRadius:10,padding:'1px 7px'}}>{totalScadente} neachitate</span>}
            </div>
            <Link href="/cheltuieli" style={{fontSize:9,color:'#4DA3FF',textDecoration:'none',display:'flex',alignItems:'center',gap:2}}>TOATE <ArrowUpRight size={9}/></Link>
          </div>
          <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:6}}>
            {apts.map(apt=>{
              const items=getAptCheltuieli(apt.id)
              if(!items.length)return null
              const isOpen=!!expanded[apt.id]
              const totalApt=items.reduce((s,i)=>s+Number(i.valoare),0)
              const urgente=items.filter(i=>daysUntil(parseInt(i.data?.slice(8,10)||'1'),luna,an)<=3).length
              return(
                <div key={apt.id} style={{border:'1px solid rgba(100,160,255,0.12)',borderRadius:10,overflow:'hidden',background:'rgba(20,35,58,0.5)'}}>
                  <button onClick={()=>setExpanded(e=>({...e,[apt.id]:!e[apt.id]}))} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
                    <div style={{display:'flex',alignItems:'center',gap:7,flex:1,minWidth:0}}>
                      {apt.nota&&<span style={{fontSize:10,fontWeight:600,color:'var(--accent-blue)',background:'rgba(77,163,255,0.12)',padding:'1px 7px',borderRadius:4,flexShrink:0}}>{apt.nota}</span>}
                      <span style={{fontSize:13,fontWeight:500,color:'#E8F4FF',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{apt.nume}</span>
                      {urgente>0&&<AlertTriangle size={12} color="#F87171" style={{flexShrink:0}}/>}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                      <span style={{fontSize:11,color:'rgba(159,215,255,0.5)'}}>{items.length} plăți</span>
                      <span style={{fontSize:11,fontWeight:500,color:'#F87171'}}>{totalApt.toLocaleString('ro-RO')} RON</span>
                      <ChevronDown size={13} color="rgba(159,215,255,0.35)" style={{transform:isOpen?'rotate(180deg)':'rotate(0)',transition:'transform .2s'}}/>
                    </div>
                  </button>
                  {isOpen&&(
                    <div style={{padding:'0 12px 12px',display:'flex',gap:8,flexWrap:'wrap',borderTop:'1px solid rgba(100,160,255,0.08)'}}>
                      {items.map(ch=>{
                        const dueDay=parseInt(ch.data?.slice(8,10)||'1')
                        const days=daysUntil(dueDay,luna,an)
                        const dc=dueColor(days,ch.status==='validat')
                        const isPaid=ch.status==='validat'
                        const lbl=UTIL_COLS.find(c=>c.key===ch.categorie)?.label||ch.descriere||ch.categorie
                        return(
                          <div key={ch.id} style={{display:'flex',alignItems:'stretch',background:dc.bg,border:`1px solid ${dc.border}`,borderRadius:10,overflow:'hidden',flexShrink:0,marginTop:8,transition:'all .2s'}}>
                            <div style={{padding:'10px 12px',lineHeight:1.3}}>
                              <div style={{fontSize:10,fontWeight:500,color:dc.text,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:3}}>{lbl}</div>
                              <div style={{fontSize:16,fontWeight:600,color:isPaid?'#4ADE80':'#E8F4FF',letterSpacing:'-.3px'}}>{Number(ch.valoare).toLocaleString('ro-RO')}<span style={{fontSize:10,fontWeight:400,marginLeft:3,color:'rgba(159,215,255,0.4)'}}>RON</span></div>
                              <div style={{fontSize:10,marginTop:3,color:dc.text,fontWeight:days<=3?600:400}}>{days<0?`întârziat ${Math.abs(days)}z`:days===0?'scadent azi':`${days}z rămase`}{days<=3&&!isPaid?' ⚠':''}</div>
                            </div>
                            <button onClick={()=>togglePaid(ch)} disabled={toggling===ch.id} style={{width:38,display:'flex',alignItems:'center',justifyContent:'center',background:isPaid?'rgba(74,222,128,0.15)':'rgba(100,160,255,0.06)',borderTop:'none',borderRight:'none',borderBottom:'none',borderLeft:`1px solid ${dc.border}`,cursor:'pointer',transition:'all .18s',opacity:toggling===ch.id?0.5:1}}>
                              <div style={{width:22,height:22,borderRadius:'50%',border:`2px solid ${isPaid?'#4ADE80':dc.text}`,background:isPaid?'#4ADE80':'transparent',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .18s'}}>
                                {isPaid&&<Check size={12} color="#0E1B2B" strokeWidth={3}/>}
                              </div>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {fiscalScadente.length>0&&(
              <div style={{border:'1px solid rgba(100,160,255,0.12)',borderRadius:10,background:'rgba(20,35,58,0.5)'}}>
                <button onClick={()=>setExpanded(e=>({...e,'fiscal':!e['fiscal']}))} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
                  <span style={{fontSize:13,fontWeight:500,color:'#E8F4FF',flex:1}}>Obligații fiscale</span>
                  <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                    <span style={{fontSize:11,color:'rgba(159,215,255,0.5)'}}>{fiscalScadente.length} obligații</span>
                    <ChevronDown size={13} color="rgba(159,215,255,0.35)" style={{transform:expanded['fiscal']?'rotate(180deg)':'rotate(0)',transition:'transform .2s'}}/>
                  </div>
                </button>
                {expanded['fiscal']&&(
                  <div style={{padding:'0 12px 12px',display:'flex',gap:8,flexWrap:'wrap',borderTop:'1px solid rgba(100,160,255,0.08)'}}>
                    {fiscalScadente.map(ft=>{
                      const item=cheltuieli.find(c=>c.categorie===ft.key&&!c.apartament_id)
                      const days=daysUntil(ft.due,luna,an)
                      const isPaid=item?.status==='validat'
                      const dc=dueColor(days,isPaid||false)
                      return(
                        <div key={ft.key} style={{display:'flex',alignItems:'stretch',background:dc.bg,border:`1px solid ${dc.border}`,borderRadius:10,overflow:'hidden',flexShrink:0,marginTop:8}}>
                          <div style={{padding:'10px 12px',lineHeight:1.3}}>
                            <div style={{fontSize:10,fontWeight:500,color:dc.text,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:3}}>{ft.label}</div>
                            <div style={{fontSize:16,fontWeight:600,color:isPaid?'#4ADE80':'#E8F4FF'}}>{item?Number(item.valoare).toLocaleString('ro-RO'):'—'}<span style={{fontSize:10,fontWeight:400,marginLeft:3,color:'rgba(159,215,255,0.4)'}}>RON</span></div>
                            <div style={{fontSize:10,marginTop:3,color:dc.text,fontWeight:days<=3?600:400}}>{days<0?`întârziat ${Math.abs(days)}z`:days===0?'scadent azi':`${days}z rămase`}</div>
                          </div>
                          {item&&<button onClick={()=>togglePaid(item)} disabled={toggling===item.id} style={{width:38,display:'flex',alignItems:'center',justifyContent:'center',background:isPaid?'rgba(74,222,128,0.15)':'rgba(100,160,255,0.06)',borderTop:'none',borderRight:'none',borderBottom:'none',borderLeft:`1px solid ${dc.border}`,cursor:'pointer',opacity:toggling===item.id?0.5:1}}>
                            <div style={{width:22,height:22,borderRadius:'50%',border:`2px solid ${isPaid?'#4ADE80':dc.text}`,background:isPaid?'#4ADE80':'transparent',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .18s'}}>{isPaid&&<Check size={12} color="#0E1B2B" strokeWidth={3}/>}</div>
                          </button>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {totalScadente===0&&<div style={{padding:'20px',textAlign:'center',fontSize:12,color:'rgba(159,215,255,0.25)'}}>Nicio plată scadentă în următoarele 14 zile 🎉</div>}
          </div>
        </div>


        {/* TABEL VERIFICARE CALCUL INCASARI */}
        {rezLunaDsp.length>0&&(()=>{
          const aptM=Object.fromEntries(apts.map((a:any)=>[a.id,a]))
          const isExcl=(id:string)=>{const a=aptM[id];return a?.nota==='CG40'||a?.nota==='VM07'}
          const totVerde=Math.round(rezLunaDsp.filter(r=>!isExcl(r.apartament_id)).reduce((s:number,r:any)=>s+Number(r.suma_incasata||0),0))
          const totExcl=Math.round(rezLunaDsp.filter(r=>isExcl(r.apartament_id)).reduce((s:number,r:any)=>s+Number(r.suma_incasata||0),0))
          const thS:React.CSSProperties={padding:'6px 10px',textAlign:'left',fontSize:9,fontWeight:600,color:'rgba(159,215,255,0.35)',textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:'1px solid rgba(159,215,255,0.08)',whiteSpace:'nowrap'}
          const tdS:React.CSSProperties={padding:'7px 10px',fontSize:11,borderBottom:'1px solid rgba(159,215,255,0.04)',whiteSpace:'nowrap'}
          return(
            <div style={{...panel,marginTop:8}}>
              <div style={panelHdr}>
                <span style={panelTitle}>Rezervări {lunaLabel} — verificare calcul</span>
                <span style={{fontSize:10,color:'rgba(159,215,255,0.35)',fontFamily:'monospace'}}>{rezLunaDsp.length} rez. cu checkin în lună</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr>
                    {['APT','CI','CO','NOPȚI','SUMĂ BRUTĂ','CANAL','FILTRAT'].map(h=><th key={h} style={thS}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {rezLunaDsp.map((r:any,i:number)=>{
                      const apt=aptM[r.apartament_id]
                      const excl=isExcl(r.apartament_id)
                      const nopti=r.nr_nopti||Math.round((new Date(r.data_checkout).getTime()-new Date(r.data_checkin).getTime())/86400000)
                      return(
                        <tr key={r.id||i} style={{opacity:excl?0.45:1}}>
                          <td style={{...tdS,fontWeight:700,color:excl?'#F87171':'#4ADE80',fontFamily:'monospace'}}>{apt?.nota||'—'}</td>
                          <td style={{...tdS,color:'rgba(214,228,244,0.6)',fontFamily:'monospace'}}>{r.data_checkin?.slice(5)}</td>
                          <td style={{...tdS,color:'rgba(214,228,244,0.6)',fontFamily:'monospace'}}>{r.data_checkout?.slice(5)}</td>
                          <td style={{...tdS,color:'rgba(214,228,244,0.5)',fontFamily:'monospace',textAlign:'center' as const}}>{nopti}</td>
                          <td style={{...tdS,fontWeight:700,fontFamily:'monospace',color:excl?'#F87171':'#4ADE80'}}>{Number(r.suma_incasata||0).toLocaleString('ro-RO')}</td>
                          <td style={tdS}><CanalBadge canal={r.canal}/></td>
                          <td style={{...tdS,fontSize:9,fontWeight:600,color:excl?'#F87171':'#4ADE80'}}>{excl?'EXCLUS':'VERDE'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:'1px solid rgba(74,222,128,0.25)'}}>
                      <td colSpan={4} style={{...tdS,fontWeight:700,color:'#4ADE80'}}>TOTAL VERDE (filtrat)</td>
                      <td style={{...tdS,fontWeight:700,fontFamily:'monospace',color:'#4ADE80',fontSize:13}}>{totVerde.toLocaleString('ro-RO')}</td>
                      <td colSpan={2} style={tdS}/>
                    </tr>
                    <tr>
                      <td colSpan={4} style={{...tdS,fontWeight:600,color:'#F87171'}}>Total CG40+VM07 (exclus)</td>
                      <td style={{...tdS,fontWeight:600,fontFamily:'monospace',color:'#F87171'}}>{totExcl.toLocaleString('ro-RO')}</td>
                      <td colSpan={2} style={tdS}/>
                    </tr>
                    <tr style={{borderTop:'1px solid rgba(159,215,255,0.12)'}}>
                      <td colSpan={4} style={{...tdS,fontWeight:700,color:'rgba(214,228,244,0.8)'}}>TOTAL ALL</td>
                      <td style={{...tdS,fontWeight:700,fontFamily:'monospace',color:'rgba(214,228,244,0.8)',fontSize:13}}>{(totVerde+totExcl).toLocaleString('ro-RO')}</td>
                      <td colSpan={2} style={tdS}/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })()}

      </div>

      {/* WIZARD CHECKOUT */}
      {coWizardOpen&&(()=>{
        const coList=checkoutAzi.filter(r=>r.telefon_client)
        const r=coList[coWizardIdx]
        if(!r)return null
        const isLast=coWizardIdx>=coList.length-1
        const msg=msgCheckoutGen(r,sabloaneCO)
        const link=waLink(r.telefon_client,msg)
        return(
          <div style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>setCoWizardOpen(false)}>
            <div style={{background:'rgba(11,18,32,0.98)',border:'1px solid rgba(192,132,252,0.3)',borderRadius:16,padding:24,maxWidth:420,width:'100%',display:'flex',flexDirection:'column',gap:16}} onClick={e=>e.stopPropagation()}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:11,color:'rgba(159,215,255,0.4)',marginBottom:2}}>Mesaj checkout</div>
                  <div style={{fontSize:10,fontFamily:'monospace',color:'#C084FC'}}>{coWizardIdx+1} / {coList.length}</div>
                </div>
                <button onClick={()=>setCoWizardOpen(false)} style={{background:'transparent',border:'none',color:'rgba(159,215,255,0.4)',cursor:'pointer',fontSize:18,lineHeight:'1'}}>✕</button>
              </div>
              <div style={{height:3,background:'rgba(192,132,252,0.15)',borderRadius:2}}>
                <div style={{height:'100%',width:`${((coWizardIdx+1)/coList.length)*100}%`,background:'#C084FC',borderRadius:2,transition:'width 0.3s ease'}}/>
              </div>
              <div style={{background:'rgba(192,132,252,0.06)',border:'1px solid rgba(192,132,252,0.18)',borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:15,fontWeight:700,color:'#E8F4FF',marginBottom:4}}>{r.nume_client}</div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' as const}}>
                  {r.apartament?.nota&&<span style={{fontSize:10,fontWeight:600,color:'#4DA3FF',background:'rgba(77,163,255,0.12)',padding:'1px 6px',borderRadius:4}}>{r.apartament.nota}</span>}
                  <span style={{fontSize:12,color:'rgba(159,215,255,0.55)'}}>{r.apartament?.nume}</span>
                </div>
                <div style={{fontSize:11,color:'rgba(159,215,255,0.35)',marginTop:6}}>📱 {r.telefon_client}</div>
              </div>
              <div style={{background:'rgba(14,27,43,0.5)',border:'1px solid rgba(159,215,255,0.08)',borderRadius:8,padding:'10px 12px',maxHeight:140,overflowY:'auto' as const}}>
                <div style={{fontSize:10,color:'rgba(159,215,255,0.35)',marginBottom:6,textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>Mesaj</div>
                <pre style={{fontSize:11,color:'rgba(214,228,244,0.75)',whiteSpace:'pre-wrap' as const,wordBreak:'break-word' as const,margin:0,fontFamily:'inherit'}}>{msg}</pre>
              </div>
              <a href={link} target="_blank" rel="noreferrer"
                style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'13px',borderRadius:10,border:'1px solid rgba(74,222,128,0.4)',background:'rgba(74,222,128,0.1)',color:'#4ADE80',fontSize:13,fontWeight:700,textDecoration:'none'}}>
                <MessageCircle size={16}/>Trimite pe WhatsApp
              </a>
              <button onClick={()=>{
                if(isLast){
                  setCoWizardOpen(false)
                  setCoMesajeTrimise(true)
                  try{localStorage.setItem('co_trimis_'+new Date().toISOString().split('T')[0],'1')}catch{}
                }else{setCoWizardIdx(i=>i+1)}
              }}
                style={{padding:'10px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:isLast?'#4ADE80':'rgba(159,215,255,0.6)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                {isLast?'✓ Gata — toate mesajele trimise':'Următor →'}
              </button>
            </div>
          </div>
        )
      })()}
    </>
  )
}
