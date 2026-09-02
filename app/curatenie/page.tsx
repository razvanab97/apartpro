'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast, ConnectionError } from '@/components/ui'
import { MessageCircle, BedDouble, RefreshCw, Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'

function nrLen(p:number){ if(p<=2) return 1; if(p<=4) return 2; if(p<=6) return 3; return 4 }
// nr_persoane vine aproape mereu 1 din sincronizarea automata (Airbnb/Booking nu trimit
// numarul real de oaspeti prin calendarul ICS) - cand pare nesigur (<=1), folosim capacitatea
// maxima a apartamentului ca estimare, ca sa nu se aduca mereu o singura lenjerie
function estimeazaPersoane(r:any){
  let p = Number(r?.nr_persoane)||0
  const capacitateMax = r?.apartament?.capacitate_max
  if(p<=1 && capacitateMax) p = Number(capacitateMax)
  return p||2
}
function nrLenSmart(r:any){
  return nrLen(estimeazaPersoane(r))
}

function fmtDate(iso:string){
  const d=new Date(iso+'T12:00:00')
  return d.toLocaleDateString('ro-RO',{weekday:'short',day:'numeric',month:'short'})
}

function waLink(phone:string, msg:string){ const c=phone.replace(/\D/g,''); const nr=c.startsWith('00')?c.slice(2):c.length===10&&c.startsWith('0')?'4'+c:c; return `https://wa.me/${nr}?text=${encodeURIComponent(msg)}` }
function ultimele3(phone:string){ const c=phone.replace(/\D/g,''); return c.slice(-3) }
function firstName(name:string){ return (name||'').split(' ')[0] }
function applyVars(tmpl:string, nume:string, apt:string, co:string){
  return tmpl.replace(/\{nume\}/gi,nume).replace(/\{apartament\}/gi,apt).replace(/\{data_checkout\}/gi,co).replace(/\{data\}/gi,co)
}
function msgCheckoutGen(r:any, sabloane:Record<string,string>){
  const apt = r.apartament?.nume || 'apartament'
  const aptId = r.apartament?.id || ''
  const co = r.data_checkout ? format(new Date(r.data_checkout),'dd MMMM yyyy',{locale:ro}) : ''
  const nume = firstName(r.nume_client)
  const sablon = sabloane[aptId]
  if(sablon) return applyVars(sablon,nume,apt,co)
  return `Bună ziua, ${nume}! 🌅\n\nVă reamintim că astăzi, *${co}*, este ziua check-out-ului din *${apt}*.\n\n⏰ *Ora de check-out:* 11:00\n🔑 *Cheia:* vă rugăm să o lăsați în cutia de la ușă / recepție\n\nVă mulțumim că ați ales AB Homes Iași și sperăm să vă revedem curând! ⭐\nEchipa AB Homes`
}

export default function CuratenePage() {
  const todayIso = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [co, setCo] = useState<any[]>([])
  const [ci, setCi] = useState<any[]>([])
  const [len, setLen] = useState<Record<string,number>>({})
  const { toast, show } = useToast()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [staffStatus, setStaffStatus] = useState<Record<string,any>>({})
  const [eliberat, setEliberat] = useState<Set<string>>(new Set())
  const [oraSpeciala, setOraSpeciala] = useState<Record<string,{co_tarziu:string,ci_devreme:string}>>({})
  const [activeTab, setActiveTab] = useState<'curatenie'|'probleme'|'rapoarte'>('curatenie')
  const [probleme, setProbleme] = useState<any[]>([])
  const [newProblema, setNewProblema] = useState({apartament_id:'',titlu:'',descriere:'',prioritate:'normal'})
  const [showAddProblema, setShowAddProblema] = useState(false)
  const [rapoarteData, setRapoarteData] = useState<any[]>([])
  const [rapoarteLuna, setRapoarteLuna] = useState(() => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}` })
  const [casaLuna, setCasaLuna] = useState<any[]>([])
  const [costPerCuratenie, setCostPerCuratenie] = useState(150)
  const [raportTab, setRaportTab] = useState<'sumar'|'detaliat'|'checkout'>('sumar')
  const [filtruAptRaport, setFiltruAptRaport] = useState<Set<string>>(new Set())
  const [aptListRaport, setAptListRaport] = useState<string[]>([])
  const [deplasari, setDeplasari] = useState<any[]>([])
  const [pretComb, setPretComb] = useState('8.50')
  const [consumMasina, setConsumMasina] = useState('7.5')
  const [savingComb, setSavingComb] = useState(false)
  const [expandedZiComb, setExpandedZiComb] = useState<string|null>(null)
  const [mesajGata, setMesajGata] = useState('Bună ziua, {nume}! 🏠\n\nVă las aici datele de acces pentru locația dumneavoastră de astăzi, *{apartament}*.\n\nO ședere plăcută! Ne puteți contacta oricând. 😊\nEchipa AB Homes Iași')
  const [savingMesajGata, setSavingMesajGata] = useState(false)
  const [mesajGataLoaded, setMesajGataLoaded] = useState(false)
  const [waGataInfo, setWaGataInfo] = useState<{apt:any,rez:any,msg:string,tip:'checkin'|'checkout'}|null>(null)
  const [sabloaneCO, setSabloaneCO] = useState<Record<string,string>>({})
  const [expandedOre, setExpandedOre] = useState<string|null>(null)
  const [baniPending, setBaniPending] = useState<Record<string,any>>({})
  const [baniOpen, setBaniOpen] = useState<string|null>(null)
  const [baniForm, setBaniForm] = useState<{suma:string,motiv:string}>({suma:'',motiv:''})
  const [savingBani, setSavingBani] = useState(false)
  const [casaGenOpen, setCasaGenOpen] = useState<'incasare'|'cheltuiala'|null>(null)
  const [casaGenForm, setCasaGenForm] = useState<{suma:string,motiv:string,data:string}>({suma:'',motiv:'',data:new Date().toISOString().split('T')[0]})
  const [savingCasaGen, setSavingCasaGen] = useState(false)
  const [mesajZi, setMesajZi] = useState<{id:string,text:string}|null>(null)
  const [editingMesajZi, setEditingMesajZi] = useState(false)
  const [mesajZiDraft, setMesajZiDraft] = useState('')
  const [savingMesajZi, setSavingMesajZi] = useState(false)
  const [lenjeriiStoc, setLenjeriiStoc] = useState(0)
  const [lenjeriiIstoric, setLenjeriiIstoric] = useState<any[]>([])
  const [lenjeriiPrag, setLenjeriiPrag] = useState(15)
  const [lenjeriiHistOpen, setLenjeriiHistOpen] = useState(false)
  const [addLenjeriiOpen, setAddLenjeriiOpen] = useState(false)
  const [addLenjeriiForm, setAddLenjeriiForm] = useState({ cantitate: '', motiv: '' })
  const [subLenjeriiOpen, setSubLenjeriiOpen] = useState(false)
  const [subLenjeriiForm, setSubLenjeriiForm] = useState({ cantitate: '', motiv: '' })
  const [savingLenjerii, setSavingLenjerii] = useState(false)

  useEffect(()=>{ load(selectedDate) }, [selectedDate])

  useEffect(()=>{
    loadLenjerii()
    const i = setInterval(loadLenjerii, 30000)
    return ()=>clearInterval(i)
  }, [])

  async function loadLenjerii() {
    const { data: rows } = await supabase.from('lenjerii_miscari').select('*').order('created_at', { ascending: false }).limit(200)
    const list = rows || []
    const stoc = list.reduce((s: number, m: any) => s + (m.tip === 'adaugare' ? m.cantitate : -m.cantitate), 0)
    setLenjeriiStoc(stoc)
    setLenjeriiIstoric(list.slice(0, 15))
    const { data: pragRow } = await supabase.from('setari').select('valoare').eq('cheie', 'lenjerii_prag').maybeSingle()
    if (pragRow?.valoare) setLenjeriiPrag(Number(pragRow.valoare) || 15)
  }

  async function addLenjerii() {
    const cant = parseInt(addLenjeriiForm.cantitate)
    if (!cant || cant <= 0) return
    setSavingLenjerii(true)
    const { error } = await supabase.from('lenjerii_miscari').insert({
      tip: 'adaugare', cantitate: cant, motiv: addLenjeriiForm.motiv.trim() || 'Adăugate de admin',
    })
    setSavingLenjerii(false)
    if (!error) {
      setAddLenjeriiForm({ cantitate: '', motiv: '' })
      setAddLenjeriiOpen(false)
      loadLenjerii()
    }
  }

  async function subLenjerii() {
    const cant = parseInt(subLenjeriiForm.cantitate)
    if (!cant || cant <= 0) return
    setSavingLenjerii(true)
    const { error } = await supabase.from('lenjerii_miscari').insert({
      tip: 'consum', cantitate: cant, motiv: subLenjeriiForm.motiv.trim() || 'Scăzute manual de admin',
    })
    setSavingLenjerii(false)
    if (!error) {
      setSubLenjeriiForm({ cantitate: '', motiv: '' })
      setSubLenjeriiOpen(false)
      loadLenjerii()
    }
  }

  async function deleteLenjeriiMov(id: string) {
    await supabase.from('lenjerii_miscari').delete().eq('id', id)
    loadLenjerii()
  }

  // Refresh staff status every 30 seconds
  useEffect(()=>{
    loadStaffStatus()
    loadProbleme()
    loadBaniPending()
    loadMesajZi()
    const i = setInterval(()=>{ loadStaffStatus(); loadBaniPending() }, 30000)
    return ()=>clearInterval(i)
  }, [selectedDate])

  async function loadMesajZi() {
    const { data } = await supabase.from('mesaje_zi').select('id,text').eq('data', selectedDate).maybeSingle()
    setMesajZi(data||null)
    setEditingMesajZi(false)
  }

  async function saveMesajZi() {
    const text = mesajZiDraft.trim()
    if(!text) return
    setSavingMesajZi(true)
    const { error } = await supabase.from('mesaje_zi').upsert({ data: selectedDate, text }, { onConflict: 'data' })
    setSavingMesajZi(false)
    if(!error){
      setEditingMesajZi(false)
      loadMesajZi()
      show('success','✓ Mesaj salvat, apare și în staff')
    } else {
      show('error','Nu s-a putut salva')
    }
  }

  async function deleteMesajZi() {
    if(!confirm('Ștergi mesajul zilei?')) return
    await supabase.from('mesaje_zi').delete().eq('data', selectedDate)
    loadMesajZi()
  }

  async function resetZi() {
    if(!confirm(`Sigur? Se resetează tot pentru ${fmtDate(selectedDate)} — status curățenie, eliberat, lenjerii, ore speciale ȘI toate înregistrările de bani (încasări/cheltuieli) din acea zi. Nu se poate anula.`)) return
    await supabase.from('curatenie_status').delete().eq('data', selectedDate)
    await supabase.from('staff_casa').delete().eq('data', selectedDate)
    await loadStaffStatus()
    await loadBaniPending()
    show('success','✓ Ziua a fost resetată complet')
  }

  useEffect(()=>{
    supabase.from('sabloane_mesaje').select('apartament_id,text').eq('tip','checkout').then(({data:sD})=>{
      const coMap:Record<string,string>={}
      ;(sD||[]).forEach((s:any)=>{ if(s.apartament_id && s.text) coMap[s.apartament_id]=s.text })
      setSabloaneCO(coMap)
    })
  }, [])

  useEffect(()=>{
    supabase.from('setari').select('cheie,valoare').in('cheie',['pret_combustibil','consum_masina','cost_curatenie']).then(({data:d})=>{
      if(!d) return
      d.forEach((r:any)=>{
        if(r.cheie==='pret_combustibil') setPretComb(r.valoare)
        if(r.cheie==='consum_masina') setConsumMasina(r.valoare)
        if(r.cheie==='cost_curatenie') setCostPerCuratenie(Number(r.valoare))
      })
    })
  }, [])

  useEffect(()=>{
    if(activeTab!=='rapoarte') return
    const [an,luna] = rapoarteLuna.split('-')
    const primaZi = `${an}-${luna}-01`
    const ultimaZi = format(new Date(Number(an), Number(luna), 0), 'yyyy-MM-dd')
    supabase.from('deplasari_curatenie').select('*').gte('data',primaZi).lte('data',ultimaZi).order('data').then(({data:d})=>setDeplasari(d||[]))
    loadCasaLuna(rapoarteLuna)
    loadRapoarte(rapoarteLuna)
    if(!mesajGataLoaded){
      supabase.from('sabloane_mesaje').select('text').eq('tip','gata_curatenie').is('apartament_id',null).maybeSingle().then(({data:d})=>{
        if(d?.text) setMesajGata(d.text)
        setMesajGataLoaded(true)
      })
    }
  }, [activeTab, rapoarteLuna])

  async function saveCombustibil() {
    setSavingComb(true)
    await supabase.from('setari').update({valoare:pretComb}).eq('cheie','pret_combustibil')
    await supabase.from('setari').update({valoare:consumMasina}).eq('cheie','consum_masina')
    setSavingComb(false)
  }

  async function saveCostCuratenie() {
    const existing = await supabase.from('setari').select('id').eq('cheie','cost_curatenie').maybeSingle()
    if(existing.data?.id) {
      await supabase.from('setari').update({valoare:String(costPerCuratenie)}).eq('cheie','cost_curatenie')
    } else {
      await supabase.from('setari').insert({cheie:'cost_curatenie',valoare:String(costPerCuratenie)})
    }
  }

  async function saveMesajGata() {
    setSavingMesajGata(true)
    const { data: ex } = await supabase.from('sabloane_mesaje').select('id').eq('tip','gata_curatenie').is('apartament_id',null).maybeSingle()
    const { error } = ex?.id
      ? await supabase.from('sabloane_mesaje').update({text:mesajGata}).eq('id',ex.id)
      : await supabase.from('sabloane_mesaje').insert({tip:'gata_curatenie',apartament_id:null,text:mesajGata,titlu:'Mesaj gata curățenie'})
    setSavingMesajGata(false)
    if(error){ console.error('[saveMesajGata]',error); show('error','Nu s-a putut salva mesajul') }
    else show('success','✓ Mesaj salvat')
  }

  async function loadStaffStatus() {
    const { data } = await supabase.from('curatenie_status').select('*').eq('data', selectedDate)
    const m:Record<string,any>={}
    const elib = new Set<string>()
    const lenFromDb:Record<string,number> = {}
    const oraInit:Record<string,{co_tarziu:string,ci_devreme:string}> = {}
    ;(data||[]).forEach((s:any)=>{ 
      m[s.apartament_id]=s
      if(s.eliberat) elib.add(s.apartament_id)
      if(s.nr_lenjerii) lenFromDb[s.apartament_id]=s.nr_lenjerii
      oraInit[s.apartament_id]={co_tarziu:s.co_tarziu||'',ci_devreme:s.ci_devreme||''}
    })
    setStaffStatus(m)
    setEliberat(elib)
    setOraSpeciala(prev=>({...prev,...oraInit}))
    if(Object.keys(lenFromDb).length>0) setLen(prev=>({...prev,...lenFromDb}))
  }

  async function loadBaniPending() {
    const { data } = await supabase.from('staff_casa')
      .select('*').eq('data', selectedDate).not('apartament_id','is',null)
    const m:Record<string,any>={}
    ;(data||[]).forEach((r:any)=>{ m[r.apartament_id]=r })
    setBaniPending(m)
  }

  async function addBani(aptId: string, aptNota: string) {
    const suma = parseFloat(baniForm.suma.replace(',','.'))
    if(!suma || suma<=0) return
    setSavingBani(true)
    const baseMotiv = 'Numerar' + (aptNota ? ' ' + aptNota : '')
    const motiv = baniForm.motiv.trim() ? `${baseMotiv} · ${baniForm.motiv.trim()}` : baseMotiv
    const { error } = await supabase.from('staff_casa').insert({
      data: selectedDate, apartament_id: aptId, tip: 'incasare',
      suma, motiv, preluat: false,
    })
    setSavingBani(false)
    if(!error){
      setBaniForm({suma:'',motiv:''})
      setBaniOpen(null)
      loadBaniPending()
      show('success','✓ Înregistrat, apare în Casă la staff')
    } else {
      show('error','Nu s-a putut salva')
    }
  }

  async function deleteBani(id: string) {
    await supabase.from('staff_casa').delete().eq('id', id)
    loadBaniPending()
  }

  async function loadCasaLuna(lunaParam?: string) {
    const luna = lunaParam || rapoarteLuna
    const [an, lun] = luna.split('-')
    const primaZi = `${an}-${lun}-01`
    const ultimaZi = format(new Date(Number(an), Number(lun), 0), 'yyyy-MM-dd')
    const { data } = await supabase.from('staff_casa').select('*').gte('data', primaZi).lte('data', ultimaZi).order('created_at', { ascending: false })
    setCasaLuna(data || [])
  }

  async function addCasaGen(tip: 'incasare' | 'cheltuiala') {
    const suma = parseFloat(casaGenForm.suma.replace(',', '.'))
    if (!suma || suma <= 0) return
    setSavingCasaGen(true)
    const { error } = await supabase.from('staff_casa').insert({
      data: casaGenForm.data || new Date().toISOString().split('T')[0], tip, suma,
      motiv: casaGenForm.motiv.trim() || (tip === 'incasare' ? 'Încasare' : 'Cheltuială'),
    })
    setSavingCasaGen(false)
    if (!error) {
      setCasaGenForm({ suma: '', motiv: '', data: new Date().toISOString().split('T')[0] })
      setCasaGenOpen(null)
      loadCasaLuna()
      show('success', '✓ Înregistrat în Casă staff')
    } else {
      show('error', 'Nu s-a putut salva')
    }
  }

  async function deleteCasaGen(id: string) {
    await supabase.from('staff_casa').delete().eq('id', id)
    loadCasaLuna()
  }

  async function loadProbleme() {
    const { data } = await supabase.from('probleme_apartamente')
      .select('*,apartament:apartament_id(nota,nume)')
      .neq('status','rezolvat')
      .order('created_at',{ascending:false})
    setProbleme(data||[])
  }

  async function toggleEliberat(aptId: string, aptNota: string) {
    const isEl = eliberat.has(aptId)
    const ora = new Date().toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})
    
    // Check if row exists
    const { data: existing } = await supabase.from('curatenie_status')
      .select('id').eq('apartament_id', aptId).eq('data', selectedDate).maybeSingle()
    
    if (existing?.id) {
      await supabase.from('curatenie_status')
        .update({ eliberat: !isEl, eliberat_la: isEl ? null : ora })
        .eq('id', existing.id)
    } else {
      await supabase.from('curatenie_status').insert({
        apartament_id: aptId, data: selectedDate,
        status: 'liber', eliberat: !isEl, eliberat_la: isEl ? null : ora
      })
    }
    
    setEliberat(prev => {
      const n = new Set(prev)
      isEl ? n.delete(aptId) : n.add(aptId)
      return n
    })
    
    // Push notification catre staff
    fetch('/api/push-send', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        title: isEl ? `⏳ ${aptNota} — Oaspeții nu au plecat` : `🚪 ${aptNota} — Eliberat! Poți merge`,
        body: isEl ? 'Marcat ca neeliberat' : `Eliberat la ${ora}`,
        url: '/staff', tag: 'eliberat-' + aptId, tip: 'eliberat'
      })
    }).catch(()=>{})
    supabase.from('notificari').insert({
      mesaj: isEl ? `⏳ ${aptNota} — Oaspeții nu au plecat` : `🚪 ${aptNota} — Eliberat! Poți merge`,
      tip: 'eliberat', citit: false, url: '/staff',
    }).then(()=>{})
  }

  async function buildWaGataInfo(apt: any, ciRez: any) {
    if (!ciRez?.telefon_client) return
    const { data: sab } = await supabase.from('sabloane_mesaje')
      .select('text').eq('tip','gata_curatenie').eq('apartament_id',apt?.id).maybeSingle()
    const { data: sabGlobal } = !sab ? await supabase.from('sabloane_mesaje')
      .select('text').eq('tip','gata_curatenie').is('apartament_id',null).maybeSingle()
      : { data: null }
    const template = sab?.text || sabGlobal?.text || mesajGata
    const waMsg = template
      .replace(/\{nume\}/gi, (ciRez.nume_client||'').split(' ')[0])
      .replace(/\{apartament\}/gi, apt?.nume || apt?.nota || '')
    setWaGataInfo({ apt, rez: ciRez, msg: waMsg, tip: 'checkin' })
  }

  function buildWaCheckout(apt: any, coRez: any) {
    if (!coRez?.telefon_client) return
    const msg = msgCheckoutGen({ ...coRez, apartament: apt }, sabloaneCO)
    setWaGataInfo({ apt, rez: coRez, msg, tip: 'checkout' })
  }

  async function setSpecialStatus(aptId: string, _aptNota: string, tip: 'anulat'|'doar_lenjerie'|null) {
    const newStatus = tip || 'liber'
    // Try update first
    // Check if row exists first
    const { data: existing } = await supabase.from('curatenie_status')
      .select('id').eq('apartament_id', aptId).eq('data', selectedDate).maybeSingle()
    
    if (existing) {
      await supabase.from('curatenie_status').update({ status: newStatus }).eq('id', existing.id)
    } else {
      await supabase.from('curatenie_status').insert({ apartament_id: aptId, data: selectedDate, status: newStatus })
    }
    loadStaffStatus()
  }

  async function loadRapoarte(lunaParam?: string) {
    const [an, luna] = (lunaParam||rapoarteLuna).split('-').map(Number)
    const primaZi = `${an}-${String(luna).padStart(2,'0')}-01`
    const ultimaZi = format(new Date(an, luna, 0), 'yyyy-MM-dd')
    // Toate checkout-urile din luna = curatenii efectuate
    const { data: rezData } = await supabase.from('rezervari')
      .select('data_checkout,apartament_id,apartament:apartament_id(nota,nume,capacitate_max)')
      .gte('data_checkout', primaZi)
      .lte('data_checkout', ultimaZi)
      .neq('status_rezervare','anulata')
    // Curatenie status confirmate de staff
    const { data: stData } = await supabase.from('curatenie_status')
      .select('apartament_id,data,status,ora_inceput,ora_gata,nr_lenjerii,eliberat_la')
      .gte('data', primaZi)
      .lte('data', ultimaZi)
    // Rezervari cu nr persoane pentru calcul lenjerii
    const { data: rezFull } = await supabase.from('rezervari')
      .select('apartament_id,data_checkout,nr_persoane,nr_nopti,valoare_bruta,apartament:apartamente!inner(nota,capacitate_max)')
      .gte('data_checkout', primaZi)
      .lte('data_checkout', ultimaZi)
      .neq('status_rezervare','anulata')
    // Map rezFull by apartament_id+data pt lookup rapid
    const rezByAptDay:Record<string,any> = {}
    ;(rezFull||[]).forEach((r:any)=>{ rezByAptDay[`${r.apartament_id}_${r.data_checkout}`]=r })
    // Group by day - only days with actual checkouts
    const byDay: Record<string,{rez:any[],st:any[]}> = {}
    ;(rezData||[]).forEach((r:any) => {
      const d = r.data_checkout
      if(!byDay[d]) byDay[d]={rez:[],st:[]}
      byDay[d].rez.push(r)
    })
    ;(stData||[]).forEach((s:any) => {
      const d = s.data
      if(byDay[d]) byDay[d].st.push(s)  // only add if day has checkouts
    })
    function calcTimp(s:any): number|null {
      if(!s.ora_inceput||!s.ora_gata) return null
      const [hi,mi]=s.ora_inceput.split(':').map(Number)
      const [hg,mg]=s.ora_gata.split(':').map(Number)
      const diff=(hg*60+mg)-(hi*60+mi)
      return diff>0&&diff<480?diff:null
    }
    const result = Object.entries(byDay)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([data,{rez,st}])=>{
        const gata = st.filter((s:any)=>s.status==='gata')
        const timpuri = gata.map((s:any)=>calcTimp(s)).filter((t:any)=>t!==null) as number[]
        const timpMediu = timpuri.length ? Math.round(timpuri.reduce((a,b)=>a+b,0)/timpuri.length) : null
        const detalii = rez.map((r:any)=>{
          const aptId = r.apartament_id
          const st = (stData||[]).find((s:any)=>s.apartament_id===aptId&&s.data===data)
          const durata = st ? calcTimp(st) : null
          const full = rezByAptDay[`${aptId}_${data}`]
          const lenjerii = st?.nr_lenjerii || nrLenSmart(full||r)
          const eliberatLa = st?.eliberat_la || null
          return { nota:r.apartament?.nota||'', nume:r.apartament?.nume||'', oraInceput:st?.ora_inceput||null, oraGata:st?.ora_gata||null, eliberatLa, eliberatReal:!!st?.eliberat_la, durata, status:st?.status||'neînceput', lenjerii }
        })
        const totalLenjerii = detalii.reduce((sum:number,d:any)=>sum+(d.lenjerii||0),0)
        // Ora checkout: eliberat_la (real) sau ora_inceput ca fallback (guest plecat inainte sa inceapa curatenia)
        const oreEliberat = detalii.map((d:any)=>d.eliberatLa||d.oraInceput).filter(Boolean).map((o:string)=>{ const [h,m]=o.split(':').map(Number); return h*60+m })
        const oraMedieMin = oreEliberat.length ? Math.round(oreEliberat.reduce((a:number,b:number)=>a+b,0)/oreEliberat.length) : null
        const ziSapt = new Date(data+'T12:00:00').getDay()
        return { data, nrCuratenii:rez.length, nrGata:gata.length, apartamente:rez.map((r:any)=>r.apartament?.nota||'').filter(Boolean).join(', '), timpMediu, timpuri, totalLenjerii, detalii, oraMedieMin, ziSapt }
      })
    // Aplica filtru locatii daca e setat
    setRapoarteData(result)
    // Salvam si lista de apartamente unice pentru selector
    const aptUniq = Array.from(new Set(result.flatMap((r:any)=>
      (r.apartamente||'').split(', ').filter(Boolean)
    ))).sort()
    setAptListRaport(aptUniq)
  }

  async function addProblema() {
    if(!newProblema.apartament_id||!newProblema.titlu) return
    await supabase.from('probleme_apartamente').insert({
      ...newProblema, status:'deschis', created_at: new Date().toISOString()
    })
    setNewProblema({apartament_id:'',titlu:'',descriere:'',prioritate:'normal'})
    setShowAddProblema(false)
    loadProbleme()
  }

  async function updateProblemaStatus(id:string, status:string) {
    await supabase.from('probleme_apartamente').update({status, updated_at:new Date().toISOString()}).eq('id',id)
    loadProbleme()
  }

  async function load(date:string){
    setLoading(true)
    setLoadError(false)
    setLen({})
    const bail=setTimeout(()=>{ setLoading(false); setLoadError(true) },20000)
    try{
      const [{data:coData},{data:ciData},{data:statusData}] = await Promise.all([
        supabase.from('rezervari')
          .select('id,nume_client,telefon_client,nr_persoane,nr_nopti,valoare_bruta,data_checkout,apartament:apartamente!inner(id,nume,nota,adresa,status,capacitate_max)')
          .eq('data_checkout', date)
          .eq('apartament.status', 'activ')
          .neq('status_rezervare', 'anulata'),
        supabase.from('rezervari')
          .select('id,nume_client,telefon_client,nr_persoane,nr_nopti,valoare_bruta,apartament:apartamente!inner(id,nume,nota,adresa,status,capacitate_max)')
          .eq('data_checkin', date)
          .eq('apartament.status', 'activ')
          .neq('status_rezervare', 'anulata'),
        supabase.from('curatenie_status').select('apartament_id,nr_lenjerii').eq('data', date)
      ])
      setCo(coData||[])
      setCi(ciData||[])

      // 1. Valori manuale din DB (prioritate maximă)
      const lenInit:Record<string,number>={}
      ;(statusData||[]).forEach((s:any)=>{ if(s.nr_lenjerii) lenInit[s.apartament_id]=s.nr_lenjerii })

      // 2. Pentru apartamentele fără valoare manuală, calculează din CI și salvează în DB
      const toInsert: {apartament_id:string, data:string, nr_lenjerii:number}[] = []
      ;(ciData||[]).forEach((r:any)=>{
        const aptId = r.apartament?.id
        if(!aptId) return
        if(!lenInit[aptId]) {
          const calc = nrLenSmart(r)
          lenInit[aptId] = calc
          toInsert.push({ apartament_id: aptId, data: date, nr_lenjerii: calc })
        }
      })

      setLen(lenInit)
      clearTimeout(bail)

      // Salvează doar valorile calculate (cele manuale există deja în DB)
      for (const u of toInsert) {
        await supabase.from('curatenie_status')
          .upsert(u, { onConflict: 'apartament_id,data', ignoreDuplicates: true })
      }
    }catch(err){console.error('[curatenie load]',err);clearTimeout(bail);setLoadError(true)}
    setLoading(false)
  }

  function changeDate(days:number){
    const d=new Date(selectedDate+'T12:00:00')
    d.setDate(d.getDate()+days)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  // Locatii unificate
  const aptMap:Record<string,{apt:any,coRez?:any,ciRez?:any}>={}
  co.forEach((r:any)=>{ const id=r.apartament?.id||r.id; if(!aptMap[id]) aptMap[id]={apt:r.apartament}; aptMap[id].coRez=r })
  ci.forEach((r:any)=>{ const id=r.apartament?.id||r.id; if(!aptMap[id]) aptMap[id]={apt:r.apartament}; aptMap[id].ciRez=r })
  const locatii=Object.values(aptMap).filter(({apt})=>staffStatus[apt?.id]?.status!=='anulat')

  async function saveLenjerii(aptId: string, nrLen: number) {
    await supabase.from('curatenie_status').upsert(
      { apartament_id: aptId, data: selectedDate, nr_lenjerii: nrLen },
      { onConflict: 'apartament_id,data', ignoreDuplicates: false }
    )
  }

  async function saveOraSpeciala(aptId: string, field: 'co_tarziu'|'ci_devreme', val: string) {
    await supabase.from('curatenie_status').upsert(
      { apartament_id: aptId, data: selectedDate, [field]: val || null },
      { onConflict: 'apartament_id,data', ignoreDuplicates: false }
    )
  }

  function waEchipa(){
    const linii=locatii.map(({apt,ciRez})=>{
      const l=len[apt?.id]??(ciRez?nrLenSmart(ciRez):1)
      const aptStr=(apt?.nota?apt.nota+' - ':'')+apt?.nume
      const ciStr=ciRez?` | CI: ${ciRez.nume_client} (${estimeazaPersoane(ciRez)} pers)`:''
      return `${aptStr}${ciStr} → ${l} lenjerii`
    }).join('\n')
    const msg=`Curatenie ${fmtDate(selectedDate)}\n\n${linii}\n\nMultumesc!`
    window.open('https://wa.me/40756942108?text='+encodeURIComponent(msg),'_blank')
  }

  const isToday=selectedDate===todayIso
  const isTomorrow=selectedDate===new Date(Date.now()+86400000).toISOString().split('T')[0]

  // Rapoarte filtrate dupa locatiile selectate
  const filteredRapoarte = rapoarteData.map(zi=>({
    ...zi,
    detalii: (zi.detalii||[]).filter((d:any)=>filtruAptRaport.size===0||filtruAptRaport.has(d.nota)),
    nrCuratenii: filtruAptRaport.size===0 ? zi.nrCuratenii :
      (zi.detalii||[]).filter((d:any)=>filtruAptRaport.has(d.nota)).length,
    nrGata: filtruAptRaport.size===0 ? zi.nrGata :
      (zi.detalii||[]).filter((d:any)=>filtruAptRaport.has(d.nota)&&d.status==='gata').length,
    totalLenjerii: filtruAptRaport.size===0 ? zi.totalLenjerii :
      (zi.detalii||[]).filter((d:any)=>filtruAptRaport.has(d.nota)).reduce((s:number,d:any)=>s+(d.lenjerii||0),0),
    timpuri: filtruAptRaport.size===0 ? zi.timpuri :
      (zi.detalii||[]).filter((d:any)=>filtruAptRaport.has(d.nota)&&d.durata).map((d:any)=>d.durata),
    timpMediu: (()=>{
      const t = filtruAptRaport.size===0 ? zi.timpuri :
        (zi.detalii||[]).filter((d:any)=>filtruAptRaport.has(d.nota)&&d.durata).map((d:any)=>d.durata)
      return t?.length ? Math.round(t.reduce((a:number,b:number)=>a+b,0)/t.length) : null
    })(),
    apartamente: filtruAptRaport.size===0 ? zi.apartamente :
      (zi.detalii||[]).filter((d:any)=>filtruAptRaport.has(d.nota)).map((d:any)=>d.nota).join(', '),
  })).filter(zi=>zi.nrCuratenii>0)

  const s={
    card:{display:'flex',alignItems:'center',gap:12,padding:'13px 14px',background:'rgba(20,35,58,0.6)',borderRadius:10,marginBottom:8,flexWrap:'wrap' as const} as React.CSSProperties,
    lenBtn:{width:34,height:34,borderRadius:8,border:'0.5px solid rgba(159,215,255,0.2)',background:'rgba(159,215,255,0.06)',color:'rgba(214,228,244,0.8)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0} as React.CSSProperties,
  }

  if (loadError) return (<><PageHeader title="🧹 Curățenie"/><ConnectionError onRetry={()=>load(selectedDate)}/></>)

  return (
    <>
      <PageHeader title="🧹 Curățenie"/>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid rgba(100,160,255,0.1)',background:'rgba(8,15,30,0.8)'}}>
        {[{k:'curatenie',l:'🧹 Curățenie'},{k:'probleme',l:'🔧 Probleme'},{k:'rapoarte',l:'📊 Rapoarte'}].map(t=>(
          <button key={t.k} onClick={()=>{ setActiveTab(t.k as any); if(t.k==='probleme') loadProbleme(); if(t.k==='rapoarte') loadRapoarte() }}
            style={{flex:1,padding:'11px 8px',border:'none',background:'transparent',color:activeTab===t.k?'#7BC8FF':'rgba(159,215,255,0.4)',fontSize:13,fontWeight:600,cursor:'pointer',borderBottom:`2px solid ${activeTab===t.k?'#7BC8FF':'transparent'}`,transition:'all .15s'}}>
            {t.l}
          </button>
        ))}
      </div>

      {activeTab==='curatenie'&&<div style={{flex:1,overflowY:'auto',padding:'12px 14px 90px'}}>

        {/* Stoc lenjerii */}
        {(()=>{
          const scazut = lenjeriiStoc <= lenjeriiPrag
          return (
            <div style={{padding:'7px 10px',borderRadius:10,marginBottom:10,background:scazut?'rgba(248,113,113,0.07)':'rgba(167,139,250,0.06)',border:'1px solid '+(scazut?'rgba(248,113,113,0.25)':'rgba(167,139,250,0.18)')}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:6}}>
                <div style={{display:'flex',alignItems:'baseline',gap:5,minWidth:0}}>
                  <span style={{fontSize:13}}>🛏️</span>
                  <span style={{fontSize:15,fontWeight:800,color:scazut?'#FCA5A5':'#C4B5FD'}}>{lenjeriiStoc}</span>
                  <span style={{fontSize:10,fontWeight:600,color:'rgba(159,215,255,0.35)'}}>lenjerii{scazut?' · ⚠️ aduceți':''}</span>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button onClick={()=>{setSubLenjeriiOpen(false);setAddLenjeriiOpen(o=>!o)}}
                    style={{padding:'4px 10px',borderRadius:8,border:'none',background:'#A78BFA',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    + Adaugă
                  </button>
                  <button onClick={()=>{setAddLenjeriiOpen(false);setSubLenjeriiOpen(o=>!o)}}
                    style={{padding:'4px 10px',borderRadius:8,border:'none',background:'#F87171',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    − Scade
                  </button>
                </div>
              </div>
              {addLenjeriiOpen&&(
                <div style={{marginTop:7,paddingTop:7,borderTop:'1px solid rgba(159,215,255,0.08)'}}>
                  <div style={{display:'flex',gap:6,marginBottom:6}}>
                    <input type="text" inputMode="numeric" placeholder="Câte?" value={addLenjeriiForm.cantitate}
                      onChange={e=>setAddLenjeriiForm(f=>({...f,cantitate:e.target.value.replace(/\D/g,'')}))}
                      style={{width:56,padding:'7px 9px',borderRadius:8,border:'1px solid rgba(167,139,250,0.3)',background:'rgba(14,27,43,0.8)',color:'#fff',fontSize:13,outline:'none'}}/>
                    <input type="text" placeholder="De unde (opțional)" value={addLenjeriiForm.motiv}
                      onChange={e=>setAddLenjeriiForm(f=>({...f,motiv:e.target.value}))}
                      style={{flex:1,padding:'7px 9px',borderRadius:8,border:'1px solid rgba(167,139,250,0.3)',background:'rgba(14,27,43,0.8)',color:'#fff',fontSize:13,outline:'none'}}/>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={addLenjerii} disabled={savingLenjerii||!addLenjeriiForm.cantitate}
                      style={{flex:1,padding:'7px',borderRadius:8,border:'none',background:'#22C55E',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',opacity:!addLenjeriiForm.cantitate?0.5:1}}>
                      {savingLenjerii?'Se salvează...':'✓ Salvează'}
                    </button>
                    <button onClick={()=>{setAddLenjeriiOpen(false);setAddLenjeriiForm({cantitate:'',motiv:''})}}
                      style={{padding:'7px 12px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.5)',fontSize:12,cursor:'pointer'}}>
                      Anulează
                    </button>
                  </div>
                </div>
              )}
              {subLenjeriiOpen&&(
                <div style={{marginTop:7,paddingTop:7,borderTop:'1px solid rgba(159,215,255,0.08)'}}>
                  <div style={{display:'flex',gap:6,marginBottom:6}}>
                    <input type="text" inputMode="numeric" placeholder="Câte?" value={subLenjeriiForm.cantitate}
                      onChange={e=>setSubLenjeriiForm(f=>({...f,cantitate:e.target.value.replace(/\D/g,'')}))}
                      style={{width:56,padding:'7px 9px',borderRadius:8,border:'1px solid rgba(248,113,113,0.3)',background:'rgba(14,27,43,0.8)',color:'#fff',fontSize:13,outline:'none'}}/>
                    <input type="text" placeholder="Motiv (opțional)" value={subLenjeriiForm.motiv}
                      onChange={e=>setSubLenjeriiForm(f=>({...f,motiv:e.target.value}))}
                      style={{flex:1,padding:'7px 9px',borderRadius:8,border:'1px solid rgba(248,113,113,0.3)',background:'rgba(14,27,43,0.8)',color:'#fff',fontSize:13,outline:'none'}}/>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={subLenjerii} disabled={savingLenjerii||!subLenjeriiForm.cantitate}
                      style={{flex:1,padding:'7px',borderRadius:8,border:'none',background:'#F87171',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',opacity:!subLenjeriiForm.cantitate?0.5:1}}>
                      {savingLenjerii?'Se salvează...':'✓ Scade'}
                    </button>
                    <button onClick={()=>{setSubLenjeriiOpen(false);setSubLenjeriiForm({cantitate:'',motiv:''})}}
                      style={{padding:'7px 12px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.5)',fontSize:12,cursor:'pointer'}}>
                      Anulează
                    </button>
                  </div>
                </div>
              )}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:4}}>
                <span onClick={()=>setLenjeriiHistOpen(o=>!o)} style={{fontSize:10,color:'rgba(159,215,255,0.4)',cursor:'pointer'}}>
                  {lenjeriiHistOpen?'▾':'▸'} Istoric
                </span>
                <span style={{fontSize:10,color:'rgba(159,215,255,0.3)'}}>Prag: {lenjeriiPrag}</span>
              </div>
              {lenjeriiHistOpen&&(
                <div style={{marginTop:5,display:'flex',flexDirection:'column',gap:3}}>
                  {lenjeriiIstoric.length===0&&<div style={{fontSize:11,color:'rgba(159,215,255,0.3)'}}>Nicio mișcare încă.</div>}
                  {lenjeriiIstoric.map((m:any)=>{
                    const isAd=m.tip==='adaugare'
                    return (
                      <div key={m.id} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 7px',borderRadius:6,background:isAd?'rgba(74,222,128,0.06)':'rgba(248,113,113,0.06)'}}>
                        <span style={{fontSize:10,fontWeight:700,color:isAd?'#4ADE80':'#FCA5A5',flexShrink:0}}>{isAd?'+':'-'}{m.cantitate}</span>
                        <span style={{fontSize:10,color:'rgba(159,215,255,0.5)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{m.motiv}</span>
                        <span style={{fontSize:9,color:'rgba(159,215,255,0.3)',flexShrink:0}}>{fmtDate(m.data)}</span>
                        <span onClick={()=>deleteLenjeriiMov(m.id)} style={{color:'rgba(159,215,255,0.3)',fontSize:13,padding:'0 2px',flexShrink:0,cursor:'pointer'}}>×</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* Selector data */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,background:'rgba(20,35,58,0.6)',border:'0.5px solid rgba(159,215,255,0.1)',borderRadius:10,padding:'10px 14px'}}>
          <button onClick={()=>changeDate(-1)} style={{...s.lenBtn,width:36,height:36}}>
            <ChevronLeft size={16}/>
          </button>
          <div style={{flex:1,textAlign:'center' as const}}>
            <div style={{fontSize:15,fontWeight:600,color:'#E8F4FF'}}>{fmtDate(selectedDate)}</div>
            <div style={{fontSize:11,color:isToday?'#4ADE80':isTomorrow?'#FCD34D':'rgba(159,215,255,0.4)',marginTop:1}}>
              {isToday?'Astăzi':isTomorrow?'Mâine':selectedDate}
            </div>
          </div>
          <button onClick={()=>changeDate(1)} style={{...s.lenBtn,width:36,height:36}}>
            <ChevronRight size={16}/>
          </button>
          <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
            style={{background:'rgba(77,163,255,0.08)',border:'0.5px solid rgba(77,163,255,0.2)',borderRadius:7,color:'#7BC8FF',fontSize:13,padding:'6px 8px',cursor:'pointer'}}/>
        </div>

        {/* Butoane actiuni */}
        <div style={{display:'flex',gap:8,marginBottom:14}}>
          <button onClick={()=>setSelectedDate(todayIso)} style={{flex:1,padding:'10px',borderRadius:9,border:`0.5px solid ${isToday?'rgba(74,222,128,0.4)':'rgba(159,215,255,0.15)'}`,background:isToday?'rgba(74,222,128,0.1)':'transparent',color:isToday?'#4ADE80':'rgba(159,215,255,0.5)',fontSize:13,cursor:'pointer',fontWeight:isToday?600:400}}>
            Azi
          </button>
          <button onClick={()=>changeDate(1)} style={{flex:1,padding:'10px',borderRadius:9,border:`0.5px solid ${isTomorrow?'rgba(252,211,77,0.4)':'rgba(159,215,255,0.15)'}`,background:isTomorrow?'rgba(252,211,77,0.08)':'transparent',color:isTomorrow?'#FCD34D':'rgba(159,215,255,0.5)',fontSize:13,cursor:'pointer',fontWeight:isTomorrow?600:400}}>
            Mâine
          </button>
          <button onClick={waEchipa} disabled={locatii.length===0} style={{flex:2,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'10px',borderRadius:9,border:'0.5px solid rgba(74,222,128,0.35)',background:'rgba(74,222,128,0.1)',color:'#4ADE80',fontSize:13,fontWeight:600,cursor:'pointer',opacity:locatii.length===0?0.4:1}}>
            <MessageCircle size={15}/>WA echipă
          </button>
          <button onClick={resetZi} title="Resetează progresul zilei" style={{flexShrink:0,width:40,padding:'10px',borderRadius:9,border:'0.5px solid rgba(248,113,113,0.3)',background:'rgba(248,113,113,0.06)',color:'#F87171',fontSize:15,cursor:'pointer'}}>
            🔄
          </button>
        </div>

        {/* Mesaj general pentru ziua selectata */}
        <div style={{marginBottom:14}}>
          {mesajZi&&!editingMesajZi&&(
            <div style={{display:'flex',alignItems:'flex-start',gap:8,padding:'11px 12px',borderRadius:10,background:'rgba(77,163,255,0.08)',border:'1px solid rgba(77,163,255,0.25)'}}>
              <span style={{fontSize:15,flexShrink:0}}>📣</span>
              <div style={{flex:1,fontSize:13,color:'#93C5FD',whiteSpace:'pre-wrap' as const}}>{mesajZi.text}</div>
              <div style={{display:'flex',gap:4,flexShrink:0}}>
                <button onClick={()=>{setMesajZiDraft(mesajZi.text);setEditingMesajZi(true)}}
                  style={{background:'none',border:'none',cursor:'pointer',color:'rgba(147,197,253,0.6)',fontSize:13,padding:'2px 4px'}}>✎</button>
                <button onClick={deleteMesajZi}
                  style={{background:'none',border:'none',cursor:'pointer',color:'rgba(147,197,253,0.4)',fontSize:16,padding:'2px 4px',lineHeight:1}}>×</button>
              </div>
            </div>
          )}
          {!mesajZi&&!editingMesajZi&&(
            <button onClick={()=>{setMesajZiDraft('');setEditingMesajZi(true)}}
              style={{width:'100%',padding:'9px',borderRadius:9,border:'1px dashed rgba(77,163,255,0.3)',background:'transparent',color:'rgba(147,197,253,0.7)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
              📣 Adaugă mesaj general pentru {fmtDate(selectedDate)}
            </button>
          )}
          {editingMesajZi&&(
            <div style={{padding:10,borderRadius:10,background:'rgba(77,163,255,0.06)',border:'1px solid rgba(77,163,255,0.2)'}}>
              <textarea value={mesajZiDraft} onChange={e=>setMesajZiDraft(e.target.value)} rows={2} autoFocus
                placeholder="ex: Astăzi nu vine Ana, are liber. Verificați cu Maria."
                style={{width:'100%',boxSizing:'border-box' as const,background:'rgba(14,27,43,0.8)',border:'1px solid rgba(77,163,255,0.25)',borderRadius:8,padding:'8px 10px',color:'#E8F4FF',fontSize:13,outline:'none',resize:'vertical' as const,fontFamily:'inherit',marginBottom:8}}/>
              <div style={{display:'flex',gap:8}}>
                <button onClick={saveMesajZi} disabled={savingMesajZi||!mesajZiDraft.trim()}
                  style={{flex:1,padding:'8px',borderRadius:8,border:'none',background:'#4DA3FF',color:'#0E1B2B',fontSize:12,fontWeight:700,cursor:'pointer',opacity:!mesajZiDraft.trim()?0.5:1}}>
                  {savingMesajZi?'Se salvează...':'Salvează'}
                </button>
                <button onClick={()=>setEditingMesajZi(false)}
                  style={{padding:'8px 12px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.4)',fontSize:12,cursor:'pointer'}}>
                  Anulează
                </button>
              </div>
            </div>
          )}
        </div>

        {loading&&<div style={{color:'rgba(159,215,255,0.4)',fontSize:14,padding:'30px',textAlign:'center'}}>Se încarcă...</div>}

        {!loading&&locatii.length===0&&(
          <div style={{...s.card,justifyContent:'center',border:'0.5px solid rgba(159,215,255,0.08)'}}>
            <span style={{color:'rgba(159,215,255,0.3)',fontSize:13,fontStyle:'italic'}}>Nicio activitate pentru {fmtDate(selectedDate)}</span>
          </div>
        )}

        {!loading&&locatii.map(({apt,coRez,ciRez},idx)=>{
          const aptId=apt?.id||String(idx)
          const lenDef=ciRez?nrLenSmart(ciRez):1
          const l=len[aptId]??lenDef
          const isCOCI=!!(coRez&&ciRez), isCIonly=!!(!coRez&&ciRez)
          const col=isCOCI?'#F87171':isCIonly?'#4ADE80':'#FCD34D'
          const badge=isCOCI?'CO→CI':isCIonly?'CI':'CO'
          const st = staffStatus[apt?.id]
          const special = (st?.status === 'anulat' || st?.status === 'doar_lenjerie') ? st?.status : null
          const oreSetate = !!(oraSpeciala[aptId]?.co_tarziu || oraSpeciala[aptId]?.ci_devreme)
          const oreOpen = expandedOre===aptId
          return(
            <div key={aptId} style={{background:'rgba(20,35,58,0.6)',borderRadius:14,marginBottom:10,overflow:'hidden',border:'0.5px solid rgba(159,215,255,0.1)',borderLeft:`3px solid ${col}`}}>

              {/* Header: cod + nume + badge */}
              <div style={{padding:'12px 14px 6px',display:'flex',alignItems:'center',gap:8}}>
                {apt?.nota&&<span style={{fontSize:11,fontWeight:700,color:'#4DA3FF',background:'rgba(77,163,255,0.12)',padding:'3px 8px',borderRadius:6,fontFamily:'monospace',flexShrink:0}}>{apt.nota}</span>}
                <span style={{fontSize:15,fontWeight:600,color:'#E8F4FF',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{apt?.nume||'—'}</span>
                <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:20,color:col,background:`${col}18`,border:`0.5px solid ${col}40`,flexShrink:0}}>{badge}</span>
              </div>

              {/* Status curatenie (gata / inceput / anulat / doar lenjerie) */}
              {(st?.status==='gata'||st?.status==='inceput'||special)&&(
                <div style={{padding:'0 14px 8px',display:'flex',gap:6,flexWrap:'wrap' as const}}>
                  {st?.status==='gata'&&<span style={{fontSize:11,padding:'3px 9px',borderRadius:20,fontWeight:600,background:'rgba(74,222,128,0.15)',border:'1px solid rgba(74,222,128,0.3)',color:'#4ADE80'}}>✅ Gata {st.ora_gata||''}</span>}
                  {st?.status==='inceput'&&<span style={{fontSize:11,padding:'3px 9px',borderRadius:20,fontWeight:600,background:'rgba(251,146,60,0.15)',border:'1px solid rgba(251,146,60,0.3)',color:'#FB923C'}}>🧹 Început {st.ora_inceput||''}</span>}
                  {special==='anulat'&&<span style={{fontSize:11,padding:'3px 9px',borderRadius:20,fontWeight:600,background:'rgba(248,113,113,0.15)',border:'1px solid rgba(248,113,113,0.3)',color:'#F87171'}}>✕ Anulat</span>}
                  {special==='doar_lenjerie'&&<span style={{fontSize:11,padding:'3px 9px',borderRadius:20,fontWeight:600,background:'rgba(167,139,250,0.15)',border:'1px solid rgba(167,139,250,0.3)',color:'#A78BFA'}}>🛏 Doar lenjerie</span>}
                </div>
              )}

              {/* Oaspeti: check-out / check-in */}
              <div style={{padding:'0 14px 10px',display:'flex',flexDirection:'column',gap:8}}>
                {coRez&&(
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'rgba(248,113,113,0.07)',borderRadius:10}}>
                    <span style={{fontSize:15,flexShrink:0}}>↗</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,color:'rgba(248,113,113,0.65)',fontWeight:600,textTransform:'uppercase' as const,letterSpacing:'0.4px'}}>Check-out</div>
                      <div style={{fontSize:13,fontWeight:600,color:'#FCA5A5',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{coRez.nume_client}</div>
                    </div>
                    {coRez.telefon_client&&(
                      <div style={{display:'flex',gap:6,flexShrink:0}}>
                        <a href={'tel:'+coRez.telefon_client} style={{padding:'6px 10px',borderRadius:20,background:'rgba(248,113,113,0.15)',color:'#FCA5A5',textDecoration:'none',fontSize:12,fontWeight:600}}>📞 ···{ultimele3(coRez.telefon_client)}</a>
                        <button onClick={()=>buildWaCheckout(apt,coRez)}
                          style={{padding:'6px 10px',borderRadius:20,border:'none',background:'rgba(248,113,113,0.15)',color:'#FCA5A5',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                          📱
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {ciRez&&(
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'rgba(74,222,128,0.07)',borderRadius:10}}>
                    <span style={{fontSize:15,flexShrink:0}}>↙</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,color:'rgba(74,222,128,0.65)',fontWeight:600,textTransform:'uppercase' as const,letterSpacing:'0.4px'}}>Check-in</div>
                      <div style={{fontSize:13,fontWeight:600,color:'#86EFAC',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{ciRez.nume_client}</div>
                    </div>
                    {ciRez.telefon_client&&(
                      <div style={{display:'flex',gap:6,flexShrink:0}}>
                        <a href={'tel:'+ciRez.telefon_client} style={{padding:'6px 10px',borderRadius:20,background:'rgba(74,222,128,0.15)',color:'#86EFAC',textDecoration:'none',fontSize:12,fontWeight:600}}>📞 ···{ultimele3(ciRez.telefon_client)}</a>
                        <button onClick={()=>buildWaGataInfo(apt,ciRez)}
                          style={{padding:'6px 10px',borderRadius:20,border:'none',background:'rgba(74,222,128,0.15)',color:'#86EFAC',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                          📱
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {!ciRez&&coRez&&<div style={{fontSize:12,color:'rgba(159,215,255,0.4)',paddingLeft:2}}>Fără check-in azi · Liber după checkout</div>}
              </div>

              {/* Lenjerii */}
              {ciRez&&(
                <div style={{margin:'0 14px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'rgba(252,211,77,0.07)',borderRadius:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <BedDouble size={14} color="#FCD34D"/>
                    <span style={{fontSize:12,color:'rgba(252,211,77,0.8)'}}>lenjerii · {estimeazaPersoane(ciRez)} pers.</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <button onClick={()=>setLen(v=>{const n=Math.max(1,(v[aptId]??lenDef)-1);saveLenjerii(aptId,n);return{...v,[aptId]:n}})} style={s.lenBtn}><Minus size={14}/></button>
                    <span style={{fontSize:20,fontWeight:700,color:'#FCD34D',minWidth:26,textAlign:'center' as const}}>{l}</span>
                    <button onClick={()=>setLen(v=>{const n=(v[aptId]??lenDef)+1;saveLenjerii(aptId,n);return{...v,[aptId]:n}})} style={s.lenBtn}><Plus size={14}/></button>
                  </div>
                </div>
              )}

              {/* Actiuni rapide */}
              {apt?.id&&(
                <div style={{display:'flex',gap:6,padding:'0 14px 12px'}}>
                  <button onClick={()=>toggleEliberat(apt.id, apt?.nota||'')}
                    style={{flex:1,padding:'8px 6px',borderRadius:9,border:`1px solid ${eliberat.has(apt.id)?'rgba(74,222,128,0.4)':'rgba(252,211,77,0.3)'}`,
                      background:eliberat.has(apt.id)?'rgba(74,222,128,0.12)':'rgba(252,211,77,0.08)',
                      color:eliberat.has(apt.id)?'#4ADE80':'#FCD34D',
                      fontSize:11,fontWeight:700,cursor:'pointer'}}>
                    {eliberat.has(apt.id)?'✓ Eliberat':'🚪 Eliberat?'}
                  </button>
                  <button onClick={()=>setSpecialStatus(apt.id, '', special==='anulat'?null:'anulat')}
                    style={{flex:1,padding:'8px 6px',borderRadius:9,fontSize:11,fontWeight:700,cursor:'pointer',
                      border:`1px solid ${special==='anulat'?'rgba(248,113,113,0.5)':'rgba(248,113,113,0.2)'}`,
                      background:special==='anulat'?'rgba(248,113,113,0.15)':'rgba(248,113,113,0.06)',
                      color:special==='anulat'?'#F87171':'rgba(248,113,113,0.6)'}}>
                    {special==='anulat'?'✕ Anulat':'✕ Anulează'}
                  </button>
                  <button onClick={()=>setSpecialStatus(apt.id, '', special==='doar_lenjerie'?null:'doar_lenjerie')}
                    style={{flex:1,padding:'8px 6px',borderRadius:9,fontSize:11,fontWeight:700,cursor:'pointer',
                      border:`1px solid ${special==='doar_lenjerie'?'rgba(167,139,250,0.5)':'rgba(167,139,250,0.2)'}`,
                      background:special==='doar_lenjerie'?'rgba(167,139,250,0.15)':'rgba(167,139,250,0.06)',
                      color:special==='doar_lenjerie'?'#A78BFA':'rgba(167,139,250,0.6)'}}>
                    {special==='doar_lenjerie'?'🛏 Doar lenjerie':'🛏 Lenjerie'}
                  </button>
                </div>
              )}

              {/* Bani de preluat */}
              {apt?.id&&(()=>{
                const pending = baniPending[apt.id]
                if(pending){
                  return (
                    <div style={{margin:'0 14px 12px',display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:10,
                      background:pending.preluat?'rgba(74,222,128,0.08)':'rgba(252,211,77,0.08)'}}>
                      <span style={{fontSize:15}}>💰</span>
                      <span style={{flex:1,fontSize:12,fontWeight:600,color:pending.preluat?'#4ADE80':'#FCD34D'}}>
                        {Number(pending.suma).toFixed(0)} RON {pending.preluat?'· preluat':'· de preluat'}
                      </span>
                      {!pending.preluat&&<button onClick={()=>deleteBani(pending.id)}
                        style={{background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.3)',fontSize:16,padding:'0 4px',lineHeight:1}}>×</button>}
                    </div>
                  )
                }
                if(baniOpen===aptId){
                  return (
                    <div style={{margin:'0 14px 12px',padding:'10px',borderRadius:10,background:'rgba(252,211,77,0.06)',border:'1px solid rgba(252,211,77,0.2)'}}>
                      <div style={{display:'flex',gap:8,marginBottom:8}}>
                        <input type="text" inputMode="decimal" placeholder="Sumă RON" value={baniForm.suma}
                          onChange={e=>setBaniForm(f=>({...f,suma:e.target.value}))}
                          style={{width:90,boxSizing:'border-box' as const,background:'rgba(14,27,43,0.8)',border:'1px solid rgba(252,211,77,0.25)',borderRadius:8,padding:'7px 9px',color:'#FCD34D',fontSize:13,outline:'none'}}/>
                        <input type="text" placeholder={'Detaliu (opțional, ex: după Numerar '+(apt?.nota||'')+')'} value={baniForm.motiv}
                          onChange={e=>setBaniForm(f=>({...f,motiv:e.target.value}))}
                          style={{flex:1,boxSizing:'border-box' as const,background:'rgba(14,27,43,0.8)',border:'1px solid rgba(252,211,77,0.25)',borderRadius:8,padding:'7px 9px',color:'#E8F4FF',fontSize:13,outline:'none'}}/>
                      </div>
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>addBani(apt.id, apt?.nota||'')} disabled={savingBani||!baniForm.suma}
                          style={{flex:1,padding:'8px',borderRadius:8,border:'none',background:'#FCD34D',color:'#3A2A00',fontSize:12,fontWeight:700,cursor:'pointer',opacity:!baniForm.suma?0.5:1}}>
                          {savingBani?'Se salvează...':'Salvează'}
                        </button>
                        <button onClick={()=>{setBaniOpen(null);setBaniForm({suma:'',motiv:''})}}
                          style={{padding:'8px 12px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.4)',fontSize:12,cursor:'pointer'}}>
                          Anulează
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div style={{margin:'0 14px 12px'}}>
                    <button onClick={()=>{setBaniOpen(aptId);setBaniForm({suma:'',motiv:''})}}
                      style={{width:'100%',padding:'8px',borderRadius:9,border:'1px dashed rgba(252,211,77,0.3)',background:'transparent',color:'rgba(252,211,77,0.7)',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                      💰 Bani de preluat
                    </button>
                  </div>
                )
              })()}

              {/* Ore speciale - colapsabil */}
              <button onClick={()=>setExpandedOre(oreOpen?null:aptId)}
                style={{width:'100%',padding:'9px 14px',border:'none',borderTop:'1px solid rgba(255,255,255,0.05)',background:'transparent',color:'rgba(159,215,255,0.45)',fontSize:11,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                🕐 Ore speciale {oreOpen?'▲':'▼'}
                {oreSetate&&!oreOpen&&<span style={{width:6,height:6,borderRadius:3,background:'#FCD34D'}}/>}
              </button>
              {oreOpen&&(
                <div style={{padding:'4px 14px 14px',display:'flex',gap:10,flexWrap:'wrap' as const}}>
                  <div style={{flex:1,minWidth:160}}>
                    <div style={{fontSize:10,color:'rgba(248,113,113,0.7)',fontWeight:600,marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'0.5px'}}>🕐 Checkout târziu</div>
                    <input
                      type="text"
                      placeholder="ex: ora 13:00"
                      value={oraSpeciala[aptId]?.co_tarziu||''}
                      onChange={e=>setOraSpeciala(v=>({...v,[aptId]:{...v[aptId],co_tarziu:e.target.value,ci_devreme:v[aptId]?.ci_devreme||''}}))}
                      onBlur={e=>saveOraSpeciala(aptId,'co_tarziu',e.target.value)}
                      style={{width:'100%',boxSizing:'border-box' as const,background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:8,padding:'6px 10px',color:'#FCA5A5',fontSize:12,outline:'none'}}
                    />
                  </div>
                  <div style={{flex:1,minWidth:160}}>
                    <div style={{fontSize:10,color:'rgba(77,163,255,0.7)',fontWeight:600,marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'0.5px'}}>🕐 Check-in devreme</div>
                    <input
                      type="text"
                      placeholder="ex: ora 10:00"
                      value={oraSpeciala[aptId]?.ci_devreme||''}
                      onChange={e=>setOraSpeciala(v=>({...v,[aptId]:{...v[aptId],ci_devreme:e.target.value,co_tarziu:v[aptId]?.co_tarziu||''}}))}
                      onBlur={e=>saveOraSpeciala(aptId,'ci_devreme',e.target.value)}
                      style={{width:'100%',boxSizing:'border-box' as const,background:'rgba(77,163,255,0.06)',border:'1px solid rgba(77,163,255,0.2)',borderRadius:8,padding:'6px 10px',color:'#93C5FD',fontSize:12,outline:'none'}}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>}

      {/* ── TAB PROBLEME ── */}
      {activeTab==='probleme'&&<div style={{flex:1,overflowY:'auto',padding:'14px 16px 90px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div style={{fontSize:13,color:'rgba(159,215,255,0.5)'}}>{probleme.length} probleme deschise</div>
          <button onClick={()=>setShowAddProblema(true)}
            style={{padding:'7px 14px',borderRadius:9,border:'none',background:'rgba(77,163,255,0.2)',color:'#7BC8FF',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            + Adaugă problemă
          </button>
        </div>

        {showAddProblema&&(
          <div style={{background:'rgba(11,22,42,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:14,padding:16,marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:600,color:'#E8F4FF',marginBottom:12}}>🔧 Problemă nouă</div>
            <select value={newProblema.apartament_id} onChange={e=>setNewProblema(p=>({...p,apartament_id:e.target.value}))}
              style={{width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'8px 10px',outline:'none',marginBottom:8}}>
              <option value="">— Selectează apartament —</option>
              {locatii.map(({apt}:any)=>apt&&<option key={apt?.id} value={apt?.id}>[{apt?.nota}] {apt?.nume}</option>)}
            </select>
            <input value={newProblema.titlu} onChange={e=>setNewProblema(p=>({...p,titlu:e.target.value}))}
              placeholder="Titlu problemă (ex: Robinet defect)"
              style={{width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'8px 10px',outline:'none',marginBottom:8,boxSizing:'border-box' as const}}/>
            <textarea value={newProblema.descriere} onChange={e=>setNewProblema(p=>({...p,descriere:e.target.value}))}
              placeholder="Descriere detaliată..." rows={2}
              style={{width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'8px 10px',outline:'none',marginBottom:8,resize:'vertical' as const,fontFamily:'inherit',boxSizing:'border-box' as const}}/>
            <select value={newProblema.prioritate} onChange={e=>setNewProblema(p=>({...p,prioritate:e.target.value}))}
              style={{width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'8px 10px',outline:'none',marginBottom:10}}>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="critic">Critic</option>
            </select>
            <div style={{display:'flex',gap:8}}>
              <button onClick={addProblema} style={{flex:1,padding:'9px',borderRadius:9,border:'none',background:'rgba(77,163,255,0.8)',color:'#0E1B2B',fontWeight:700,cursor:'pointer',fontSize:13}}>Salvează</button>
              <button onClick={()=>setShowAddProblema(false)} style={{padding:'9px 14px',borderRadius:9,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.5)',cursor:'pointer',fontSize:13}}>Anulează</button>
            </div>
          </div>
        )}

        {probleme.length===0&&<div style={{textAlign:'center',padding:40,color:'rgba(159,215,255,0.3)',fontSize:13}}>✓ Nicio problemă deschisă</div>}

        {probleme.map(p=>{
          const prioColor = p.prioritate==='critic'?'#F87171':p.prioritate==='urgent'?'#FB923C':'#7BC8FF'
          return(
            <div key={p.id} style={{background:'rgba(11,22,42,0.6)',border:`1px solid ${prioColor}22`,borderRadius:14,padding:14,marginBottom:10}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:8}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap' as const}}>
                    <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,background:`${prioColor}18`,color:prioColor,fontWeight:700,textTransform:'uppercase' as const}}>{p.prioritate}</span>
                    <span style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>[{p.apartament?.nota}] {p.apartament?.nume}</span>
                  </div>
                  <div style={{fontSize:14,fontWeight:600,color:'#E8F4FF'}}>{p.titlu}</div>
                  {p.descriere&&<div style={{fontSize:12,color:'rgba(159,215,255,0.5)',marginTop:3}}>{p.descriere}</div>}
                </div>
              </div>
              <div style={{display:'flex',gap:6}}>
                {['deschis','in_lucru','rezolvat'].map(st=>(
                  <button key={st} onClick={()=>updateProblemaStatus(p.id,st)}
                    style={{flex:1,padding:'7px',borderRadius:8,border:`1px solid ${p.status===st?prioColor+'60':'rgba(159,215,255,0.1)'}`,background:p.status===st?`${prioColor}15`:'transparent',color:p.status===st?prioColor:'rgba(159,215,255,0.4)',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                    {st==='deschis'?'🔴 Deschis':st==='in_lucru'?'🟡 Lucru':'✅ Gata'}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>}

      {/* ── TAB RAPOARTE ── */}
      {activeTab==='rapoarte'&&<div style={{flex:1,overflowY:'auto',padding:'14px 16px 90px'}}>

        {/* Selector luna + cost */}
        <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap' as const}}>
          <div>
            <div style={{fontSize:10,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Lună</div>
            <input type="month" value={rapoarteLuna} onChange={e=>{const v=e.target.value;setRapoarteLuna(v);setRapoarteData([]);loadRapoarte(v)}}
              style={{background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:13,padding:'7px 10px',outline:'none'}}/>
          </div>
          <div>
            <div style={{fontSize:10,color:'rgba(159,215,255,0.4)',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>Cost / curățenie (RON)</div>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <input type="number" value={costPerCuratenie} onChange={e=>setCostPerCuratenie(Number(e.target.value))} min={0}
                style={{background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.8)',fontSize:13,padding:'7px 10px',outline:'none',width:100}}/>
              <button onClick={saveCostCuratenie}
                style={{padding:'7px 12px',borderRadius:8,border:'1px solid rgba(77,163,255,0.3)',background:'rgba(77,163,255,0.1)',color:'#7BC8FF',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                Salvează
              </button>
            </div>
          </div>
          <div style={{alignSelf:'flex-end'}}>
            <button onClick={()=>loadRapoarte()}
              style={{padding:'8px 18px',borderRadius:9,border:'none',background:'rgba(77,163,255,0.2)',color:'#7BC8FF',fontSize:13,fontWeight:600,cursor:'pointer'}}>
              📊 Generează
            </button>
          </div>
        </div>

        {/* CASĂ STAFF */}
        {(()=>{
          const totalIn=casaLuna.filter(e=>e.tip==='incasare'&&e.preluat!==false).reduce((s:number,e:any)=>s+Number(e.suma),0)
          const totalOut=casaLuna.filter(e=>e.tip==='cheltuiala'&&e.preluat!==false).reduce((s:number,e:any)=>s+Number(e.suma),0)
          const sold=totalIn-totalOut
          const [an,lun]=rapoarteLuna.split('-')
          const lunaLabel=['','Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'][Number(lun)]
          return(
            <div style={{background:'rgba(252,211,77,0.04)',border:'1px solid rgba(252,211,77,0.2)',borderRadius:10,padding:'14px 16px',marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:'#FCD34D',marginBottom:12,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>💰 Casă staff — {lunaLabel} {an}</div>

              <div style={{display:'flex',gap:8,marginBottom:12}}>
                <button onClick={()=>setCasaGenOpen(casaGenOpen==='incasare'?null:'incasare')}
                  style={{flex:1,padding:'9px',borderRadius:9,border:'1px solid rgba(74,222,128,0.4)',background:casaGenOpen==='incasare'?'rgba(74,222,128,0.18)':'rgba(74,222,128,0.08)',color:'#4ADE80',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                  + Sumă încasată
                </button>
                <button onClick={()=>setCasaGenOpen(casaGenOpen==='cheltuiala'?null:'cheltuiala')}
                  style={{flex:1,padding:'9px',borderRadius:9,border:'1px solid rgba(248,113,113,0.4)',background:casaGenOpen==='cheltuiala'?'rgba(248,113,113,0.18)':'rgba(248,113,113,0.08)',color:'#F87171',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                  − Sumă cheltuită
                </button>
              </div>

              {casaGenOpen&&(
                <div style={{padding:'10px',borderRadius:10,marginBottom:12,
                  background:casaGenOpen==='incasare'?'rgba(74,222,128,0.06)':'rgba(248,113,113,0.06)',
                  border:'1px solid '+(casaGenOpen==='incasare'?'rgba(74,222,128,0.2)':'rgba(248,113,113,0.2)')}}>
                  <div style={{display:'flex',gap:8,marginBottom:8}}>
                    <input type="text" inputMode="decimal" placeholder="Sumă RON" value={casaGenForm.suma}
                      onChange={e=>setCasaGenForm(f=>({...f,suma:e.target.value}))}
                      style={{width:90,boxSizing:'border-box' as const,background:'rgba(14,27,43,0.8)',border:'1px solid rgba(159,215,255,0.2)',borderRadius:8,padding:'7px 9px',color:'#E8F4FF',fontSize:13,outline:'none'}}/>
                    <input type="text" placeholder="Motiv (ex: consumabile, plată cash)" value={casaGenForm.motiv}
                      onChange={e=>setCasaGenForm(f=>({...f,motiv:e.target.value}))}
                      style={{flex:1,boxSizing:'border-box' as const,background:'rgba(14,27,43,0.8)',border:'1px solid rgba(159,215,255,0.2)',borderRadius:8,padding:'7px 9px',color:'#E8F4FF',fontSize:13,outline:'none'}}/>
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:10,color:'rgba(159,215,255,0.4)',marginBottom:4}}>Data (implicit azi — schimbă pentru o înregistrare din trecut)</div>
                    <input type="date" value={casaGenForm.data}
                      onChange={e=>setCasaGenForm(f=>({...f,data:e.target.value}))}
                      style={{width:'100%',boxSizing:'border-box' as const,background:'rgba(14,27,43,0.8)',border:'1px solid rgba(159,215,255,0.2)',borderRadius:8,padding:'7px 9px',color:'#E8F4FF',fontSize:13,outline:'none'}}/>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>addCasaGen(casaGenOpen)} disabled={savingCasaGen||!casaGenForm.suma}
                      style={{flex:1,padding:'8px',borderRadius:8,border:'none',
                        background:casaGenOpen==='incasare'?'#4ADE80':'#F87171',color:'#0E1B2B',fontSize:12,fontWeight:700,cursor:'pointer',opacity:!casaGenForm.suma?0.5:1}}>
                      {savingCasaGen?'Se salvează...':'Salvează'}
                    </button>
                    <button onClick={()=>{setCasaGenOpen(null);setCasaGenForm({suma:'',motiv:'',data:new Date().toISOString().split('T')[0]})}}
                      style={{padding:'8px 12px',borderRadius:8,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.4)',fontSize:12,cursor:'pointer'}}>
                      Anulează
                    </button>
                  </div>
                </div>
              )}

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:casaLuna.filter((e:any)=>e.preluat!==false).length?12:0}}>
                {[
                  {l:'Total încasat',v:totalIn,c:'#4ADE80'},
                  {l:'Total cheltuit',v:totalOut,c:'#F87171'},
                  {l:'Sold',v:sold,c:sold>=0?'#7BC8FF':'#FCD34D'},
                ].map(s=>(
                  <div key={s.l} style={{textAlign:'center',padding:'10px 6px',borderRadius:8,background:'rgba(14,27,43,0.5)'}}>
                    <div style={{fontSize:18,fontWeight:800,fontFamily:'monospace',color:s.c}}>{s.v.toFixed(0)}</div>
                    <div style={{fontSize:10,color:'rgba(159,215,255,0.4)',marginTop:2}}>{s.l} RON</div>
                  </div>
                ))}
              </div>
              {casaLuna.filter((e:any)=>e.preluat!==false).length>0&&(
                <div style={{display:'flex',flexDirection:'column' as const,gap:5}}>
                  {casaLuna.filter((e:any)=>e.preluat!==false).map((e:any)=>{
                    const isIn=e.tip==='incasare'
                    return(
                      <div key={e.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:7,background:isIn?'rgba(74,222,128,0.06)':'rgba(248,113,113,0.06)',border:'1px solid '+(isIn?'rgba(74,222,128,0.12)':'rgba(248,113,113,0.12)')}}>
                        <span style={{fontSize:11,flexShrink:0}}>{isIn?'📥':'📤'}</span>
                        <span style={{fontSize:11,fontWeight:700,color:isIn?'#4ADE80':'#F87171',fontFamily:'monospace',flexShrink:0}}>{isIn?'+':'-'}{Number(e.suma).toFixed(0)} RON</span>
                        <span style={{fontSize:11,color:'rgba(159,215,255,0.6)',flex:1}}>{e.motiv}</span>
                        <span style={{fontSize:10,color:'rgba(159,215,255,0.3)',flexShrink:0}}>{e.data} {new Date(e.created_at).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}</span>
                        <button onClick={()=>deleteCasaGen(e.id)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.3)',fontSize:14,padding:'0 2px',lineHeight:1,flexShrink:0}}>×</button>
                      </div>
                    )
                  })}
                </div>
              )}
              {casaLuna.filter((e:any)=>e.preluat!==false).length===0&&<div style={{textAlign:'center',fontSize:12,color:'rgba(159,215,255,0.3)',padding:'8px 0'}}>Nicio înregistrare în această lună</div>}
            </div>
          )
        })()}

        {/* Mesaj WA gata curatenie */}
        <div style={{background:'rgba(74,222,128,0.05)',border:'1px solid rgba(74,222,128,0.15)',borderRadius:10,padding:'14px 16px',marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:600,color:'#4ADE80',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'.06em'}}>📱 Mesaj WA — Curățenie gata</div>
          <div style={{fontSize:11,color:'rgba(159,215,255,0.4)',marginBottom:10}}>
            Trimis automat staff-ului când marchează curățenia ca gata și există check-in azi. Variabile: <code style={{background:'rgba(77,163,255,0.1)',padding:'1px 5px',borderRadius:4}}>{'{nume}'}</code> <code style={{background:'rgba(77,163,255,0.1)',padding:'1px 5px',borderRadius:4}}>{'{apartament}'}</code>
          </div>
          <textarea value={mesajGata} onChange={e=>setMesajGata(e.target.value)} rows={5}
            style={{width:'100%',background:'rgba(14,27,43,0.7)',border:'1px solid rgba(159,215,255,0.12)',borderRadius:8,color:'rgba(214,228,244,0.85)',fontSize:12,padding:'10px 12px',outline:'none',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box' as const}}/>
          <button onClick={saveMesajGata} disabled={savingMesajGata}
            style={{marginTop:8,padding:'7px 18px',borderRadius:8,border:'1px solid rgba(74,222,128,0.35)',background:'rgba(74,222,128,0.1)',color:'#4ADE80',fontSize:12,fontWeight:700,cursor:'pointer'}}>
            {savingMesajGata?'Se salvează...':'✓ Salvează mesajul'}
          </button>
        </div>

        {/* Selector locatii */}
        {aptListRaport.length>0&&(
          <div style={{marginBottom:16,background:'rgba(11,22,42,0.5)',border:'1px solid rgba(100,160,255,0.1)',borderRadius:12,padding:'10px 14px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontSize:11,color:'rgba(159,215,255,0.5)',textTransform:'uppercase' as const,letterSpacing:'.06em',fontWeight:600}}>Filtrează locații</span>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setFiltruAptRaport(new Set())}
                  style={{fontSize:11,color:'rgba(77,163,255,0.7)',background:'transparent',border:'none',cursor:'pointer',padding:'2px 6px'}}>
                  Toate
                </button>
                <button onClick={()=>setFiltruAptRaport(new Set(aptListRaport))}
                  style={{fontSize:11,color:'rgba(159,215,255,0.4)',background:'transparent',border:'none',cursor:'pointer',padding:'2px 6px'}}>
                  Niciuna
                </button>
              </div>
            </div>
            <div style={{display:'flex',flexWrap:'wrap' as const,gap:6}}>
              {aptListRaport.map(nota=>{
                const activ = filtruAptRaport.size===0||filtruAptRaport.has(nota)
                return(
                  <button key={nota} onClick={()=>setFiltruAptRaport(prev=>{
                    const n=new Set(prev.size===0?aptListRaport:[...prev])
                    n.has(nota)?n.delete(nota):n.add(nota)
                    if(n.size===aptListRaport.length) return new Set()
                    return n
                  })} style={{
                    padding:'4px 12px',borderRadius:7,fontSize:12,cursor:'pointer',fontWeight:600,
                    fontFamily:'monospace',transition:'all .15s',
                    border:`1px solid ${activ?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.1)'}`,
                    background:activ?'rgba(77,163,255,0.15)':'rgba(159,215,255,0.04)',
                    color:activ?'#7BC8FF':'rgba(159,215,255,0.3)',
                  }}>{nota}</button>
                )
              })}
            </div>
          </div>
        )}

        {filteredRapoarte.length>0&&(
          <div style={{display:'flex',gap:6,marginBottom:14}}>
            {([['sumar','📊 Sumar'],['detaliat','🧹 Per curățenie'],['checkout','🕐 Ore checkout']] as [string,string][]).map(([k,l])=>(
              <button key={k} onClick={()=>setRaportTab(k as any)} style={{padding:'6px 14px',borderRadius:8,fontSize:12,cursor:'pointer',fontWeight:600,border:`1px solid ${raportTab===k?'rgba(77,163,255,0.5)':'rgba(159,215,255,0.15)'}`,background:raportTab===k?'rgba(77,163,255,0.15)':'transparent',color:raportTab===k?'#7BC8FF':'rgba(159,215,255,0.5)'}}>{l}</button>
            ))}
          </div>
        )}
        {filteredRapoarte.length>0&&(()=>{
          const totalCuratenii = filteredRapoarte.reduce((s:number,r:any)=>s+r.nrCuratenii,0)
          const totalGata = filteredRapoarte.reduce((s:number,r:any)=>s+r.nrGata,0)
          const totalCost = totalCuratenii * costPerCuratenie
          const zileActive = filteredRapoarte.length
          return (
            <>
              {/* KPI-uri principale */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
                {[
                  {l:'Zile active',v:zileActive,c:'#7BC8FF'},
                  {l:'Total curățenii',v:totalCuratenii,c:'#4ADE80'},
                  {l:'Confirmate',v:totalGata,c:'#22C55E'},
                  {l:'Cost estimat',v:`${totalCost.toLocaleString('ro-RO')} RON`,c:'#FCD34D'},
                ].map(({l,v,c})=>(
                  <div key={l} style={{background:'rgba(11,22,42,0.7)',border:`1px solid ${c}22`,borderRadius:12,padding:'12px 14px',textAlign:'center' as const}}>
                    <div style={{fontSize:20,fontWeight:700,color:c,marginBottom:4}}>{v}</div>
                    <div style={{fontSize:10,color:'rgba(159,215,255,0.45)',textTransform:'uppercase' as const,letterSpacing:'.05em'}}>{l}</div>
                  </div>
                ))}
              </div>

              {/* TAB SUMAR */}
              {raportTab==='sumar'&&(()=>{
                const timpuriAll=filteredRapoarte.flatMap((r:any)=>r.timpuri||[])
                const timpGlobal=timpuriAll.length?Math.round(timpuriAll.reduce((a:number,b:number)=>a+b,0)/timpuriAll.length):null
                const totalLen=filteredRapoarte.reduce((s:number,r:any)=>s+(r.totalLenjerii||0),0)
                return(
                  <>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
                      {[
                        {l:'Timp mediu curățenie',v:timpGlobal?`${Math.floor(timpGlobal/60)}h${timpGlobal%60>0?` ${timpGlobal%60}min`:''}`:'-',c:'#93C5FD'},
                        {l:'Total lenjerii lună',v:totalLen||'-',c:'#FCD34D'},
                        {l:'Zile cu timp înreg.',v:filteredRapoarte.filter((r:any)=>r.timpMediu).length,c:'#4ADE80'},
                      ].map(({l,v,c})=>(
                        <div key={l} style={{background:'rgba(11,22,42,0.7)',border:`1px solid ${c}30`,borderRadius:12,padding:'12px 14px',textAlign:'center' as const}}>
                          <div style={{fontSize:20,fontWeight:700,color:c,marginBottom:4}}>{v}</div>
                          <div style={{fontSize:10,color:`${c}80`,textTransform:'uppercase' as const,letterSpacing:'.05em'}}>{l}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{background:'rgba(11,22,42,0.6)',border:'1px solid rgba(100,160,255,0.1)',borderRadius:14,overflow:'hidden'}}>
                      <div style={{display:'grid',gridTemplateColumns:'90px 1fr 65px 65px 75px 70px 90px',padding:'8px 14px',borderBottom:'1px solid rgba(100,160,255,0.1)',background:'rgba(11,22,32,0.5)'}}>
                        {['Data','Apartamente','Cur.','Conf.','Timp med.','Lenjerii','Cost RON'].map(h=>(
                          <div key={h} style={{fontSize:10,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase' as const,letterSpacing:'.05em'}}>{h}</div>
                        ))}
                      </div>
                      {filteredRapoarte.map((r:any)=>(
                        <div key={r.data} style={{display:'grid',gridTemplateColumns:'90px 1fr 65px 65px 75px 70px 90px',padding:'9px 14px',borderBottom:'1px solid rgba(100,160,255,0.05)',alignItems:'center'}}>
                          <div style={{fontSize:12,color:'#E8F4FF',fontWeight:500}}>{r.data.slice(5).replace('-','/')}</div>
                          <div style={{fontSize:11,color:'rgba(159,215,255,0.6)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{r.apartamente}</div>
                          <div style={{fontSize:13,fontWeight:700,color:'#4ADE80',textAlign:'center' as const}}>{r.nrCuratenii}</div>
                          <div style={{fontSize:13,fontWeight:700,color:r.nrGata===r.nrCuratenii?'#22C55E':'#FCD34D',textAlign:'center' as const}}>{r.nrGata}</div>
                          <div style={{fontSize:11,color:'#93C5FD',textAlign:'center' as const,fontFamily:'monospace'}}>
                            {r.timpMediu?`${Math.floor(r.timpMediu/60)?Math.floor(r.timpMediu/60)+'h ':''}${r.timpMediu%60}m`:'-'}
                          </div>
                          <div style={{fontSize:12,color:'#FCD34D',textAlign:'center' as const,fontFamily:'monospace',fontWeight:600}}>{r.totalLenjerii||'-'}</div>
                          <div style={{fontSize:12,color:'#FCD34D',fontFamily:'monospace'}}>{(r.nrCuratenii*costPerCuratenie).toLocaleString('ro-RO')}</div>
                        </div>
                      ))}
                      <div style={{display:'grid',gridTemplateColumns:'90px 1fr 65px 65px 75px 70px 90px',padding:'10px 14px',background:'rgba(74,222,128,0.06)',borderTop:'1px solid rgba(74,222,128,0.15)',alignItems:'center'}}>
                        <div style={{fontSize:12,fontWeight:700,color:'#4ADE80'}}>TOTAL</div><div/>
                        <div style={{fontSize:14,fontWeight:700,color:'#4ADE80',textAlign:'center' as const}}>{totalCuratenii}</div>
                        <div style={{fontSize:14,fontWeight:700,color:'#22C55E',textAlign:'center' as const}}>{totalGata}</div>
                        <div style={{fontSize:11,color:'#93C5FD',textAlign:'center' as const,fontFamily:'monospace'}}>
                          {(()=>{const t=filteredRapoarte.flatMap((r:any)=>r.timpuri||[]);const m=t.length?Math.round(t.reduce((a:number,b:number)=>a+b,0)/t.length):null;return m?`${Math.floor(m/60)?Math.floor(m/60)+'h ':''}${m%60}m`:''})()}
                        </div>
                        <div style={{fontSize:13,fontWeight:700,color:'#FCD34D',textAlign:'center' as const,fontFamily:'monospace'}}>{filteredRapoarte.reduce((s:number,r:any)=>s+(r.totalLenjerii||0),0)}</div>
                        <div style={{fontSize:13,fontWeight:700,color:'#FCD34D',fontFamily:'monospace'}}>{totalCost.toLocaleString('ro-RO')}</div>
                      </div>
                    </div>
                  </>
                )
              })()}

              {/* TAB DETALIAT */}
              {raportTab==='detaliat'&&(
                <div style={{background:'rgba(11,22,42,0.6)',border:'1px solid rgba(100,160,255,0.1)',borderRadius:14,overflow:'hidden'}}>
                  <div style={{display:'grid',gridTemplateColumns:'80px 50px 1fr 55px 55px 55px 60px 50px 70px',padding:'8px 14px',borderBottom:'1px solid rgba(100,160,255,0.1)',background:'rgba(11,22,32,0.5)'}}>
                    {['Data','Apt','Nume','Plecat','Început','Terminat','Durată','🛏','Status'].map(h=>(
                      <div key={h} style={{fontSize:10,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase' as const,letterSpacing:'.05em'}}>{h}</div>
                    ))}
                  </div>
                  {filteredRapoarte.flatMap((zi:any)=>zi.detalii.map((d:any,i:number)=>(
                    <div key={`${zi.data}-${i}`} style={{display:'grid',gridTemplateColumns:'80px 50px 1fr 55px 55px 55px 60px 50px 70px',padding:'9px 14px',borderBottom:'1px solid rgba(100,160,255,0.05)',alignItems:'center',background:d.status==='gata'?'rgba(74,222,128,0.02)':'transparent'}}>
                      <div style={{fontSize:11,color:'rgba(214,228,244,0.7)',fontFamily:'monospace'}}>{zi.data.slice(5).replace('-','/')}</div>
                      <div style={{fontSize:12,fontWeight:700,color:'#4DA3FF',fontFamily:'monospace'}}>{d.nota}</div>
                      <div style={{fontSize:11,color:'rgba(159,215,255,0.6)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{d.nume}</div>
                      <div style={{fontSize:12,fontFamily:'monospace',color:d.eliberatLa?(d.eliberatReal?'#7BC8FF':'rgba(252,211,77,0.6)'):'rgba(159,215,255,0.2)'}} title={d.eliberatLa&&!d.eliberatReal?'Estimat din ora inceput curatenie':undefined}>{d.eliberatLa||'—'}{d.eliberatLa&&!d.eliberatReal&&<span style={{fontSize:9,marginLeft:2,opacity:.7}}>~</span>}</div>
                      <div style={{fontSize:12,fontFamily:'monospace',color:d.oraInceput?'#FCD34D':'rgba(159,215,255,0.3)'}}>{d.oraInceput||'—'}</div>
                      <div style={{fontSize:12,fontFamily:'monospace',color:d.oraGata?'#4ADE80':'rgba(159,215,255,0.3)'}}>{d.oraGata||'—'}</div>
                      <div style={{fontSize:12,fontFamily:'monospace',fontWeight:700,color:d.durata?(d.durata<45?'#4ADE80':d.durata<90?'#FCD34D':'#F87171'):'rgba(159,215,255,0.3)'}}>
                        {d.durata?`${Math.floor(d.durata/60)?Math.floor(d.durata/60)+'h ':''}${d.durata%60}min`:'-'}
                      </div>
                      <div style={{fontSize:13,fontFamily:'monospace',fontWeight:700,color:'#FCD34D',textAlign:'center' as const}}>{d.lenjerii??'—'}</div>
                      <div style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:4,background:d.status==='gata'?'rgba(74,222,128,0.15)':d.status==='inceput'?'rgba(251,146,60,0.15)':'rgba(159,215,255,0.08)',color:d.status==='gata'?'#4ADE80':d.status==='inceput'?'#FB923C':'rgba(159,215,255,0.4)'}}>
                        {d.status==='gata'?'✅ Gata':d.status==='inceput'?'🧹 Început':'—'}
                      </div>
                    </div>
                  )))}
                  <div style={{padding:'10px 14px',background:'rgba(74,222,128,0.05)',borderTop:'1px solid rgba(74,222,128,0.1)',display:'flex',gap:20}}>
                    <span style={{fontSize:12,fontWeight:700,color:'#4ADE80'}}>{filteredRapoarte.flatMap((z:any)=>z.detalii).length} curățenii</span>
                    <span style={{fontSize:12,color:'#4ADE80'}}>{filteredRapoarte.flatMap((z:any)=>z.detalii).filter((d:any)=>d.status==='gata').length} confirmate</span>
                    <span style={{fontSize:12,fontWeight:700,color:'#FCD34D'}}>🛏 {filteredRapoarte.flatMap((z:any)=>z.detalii).reduce((s:number,d:any)=>s+(d.lenjerii||0),0)} lenjerii</span>
                    <span style={{fontSize:12,color:'#93C5FD'}}>{(()=>{const t=filteredRapoarte.flatMap((z:any)=>z.detalii).map((d:any)=>d.durata).filter(Boolean);const m=t.length?Math.round(t.reduce((a:number,b:number)=>a+b,0)/t.length):null;return m?`⌀ ${Math.floor(m/60)?Math.floor(m/60)+'h ':''}${m%60}min`:''})()}</span>
                  </div>
                </div>
              )}

              {/* TAB CHECKOUT */}
              {raportTab==='checkout'&&(()=>{
                const ZILE=['Dum','Lun','Mar','Mie','Joi','Vin','Sâm']
                const byZiSapt:Record<number,number[]>={0:[],1:[],2:[],3:[],4:[],5:[],6:[]}
                filteredRapoarte.forEach((zi:any)=>{ if(zi.oraMedieMin!==null) byZiSapt[zi.ziSapt]?.push(zi.oraMedieMin) })
                const fmtMin=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
                return(
                  <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
                    <div style={{background:'rgba(11,22,42,0.6)',border:'1px solid rgba(100,160,255,0.1)',borderRadius:14,overflow:'hidden'}}>
                      <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(100,160,255,0.08)',fontSize:12,fontWeight:700,color:'rgba(147,197,253,0.7)'}}>🚪 Ora medie eliberare apartament per zi din săptămână</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
                        {[1,2,3,4,5,6,0].map(zi=>{
                          const ore=byZiSapt[zi]||[]
                          const med=ore.length?Math.round(ore.reduce((a,b)=>a+b,0)/ore.length):null
                          return(
                            <div key={zi} style={{padding:'14px 8px',textAlign:'center' as const,borderRight:zi!==0?'1px solid rgba(100,160,255,0.06)':'none'}}>
                              <div style={{fontSize:10,color:'rgba(147,197,253,0.4)',marginBottom:6,fontWeight:600}}>{ZILE[zi]}</div>
                              <div style={{fontSize:16,fontWeight:700,color:med?'#93C5FD':'rgba(147,197,253,0.2)',marginBottom:4}}>{med?fmtMin(med):'—'}</div>
                              <div style={{fontSize:10,color:'rgba(147,197,253,0.3)'}}>{ore.length>0?`${ore.length} zile`:''}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div style={{background:'rgba(11,22,42,0.6)',border:'1px solid rgba(100,160,255,0.1)',borderRadius:14,overflow:'hidden'}}>
                      <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(100,160,255,0.08)',fontSize:12,fontWeight:700,color:'rgba(147,197,253,0.7)'}}>📅 Detaliu zilnic</div>
                      <div style={{display:'grid',gridTemplateColumns:'100px 60px 1fr 110px',padding:'6px 16px',borderBottom:'1px solid rgba(100,160,255,0.06)',fontSize:10,color:'rgba(147,197,253,0.35)',textTransform:'uppercase' as const,letterSpacing:'.05em'}}>
                        <span>Data</span><span>Zi</span><span>Apartamente</span><span>Ora medie start</span>
                      </div>
                      {filteredRapoarte.filter((z:any)=>z.oraMedieMin!==null).sort((a:any,b:any)=>a.data.localeCompare(b.data)).map((zi:any)=>(
                        <div key={zi.data} style={{display:'grid',gridTemplateColumns:'100px 60px 1fr 110px',padding:'8px 16px',borderBottom:'1px solid rgba(100,160,255,0.05)',alignItems:'center'}}>
                          <span style={{fontSize:12,color:'#E8F4FF',fontFamily:'monospace'}}>{zi.data.slice(5).replace('-','/')}</span>
                          <span style={{fontSize:11,color:'rgba(147,197,253,0.5)'}}>{ZILE[zi.ziSapt]}</span>
                          <span style={{fontSize:11,color:'rgba(159,215,255,0.6)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{zi.apartamente}</span>
                          <span style={{fontSize:13,fontWeight:700,color:'#93C5FD',fontFamily:'monospace'}}>{fmtMin(zi.oraMedieMin)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </>
          )
        })()}

        {rapoarteData.length===0&&filteredRapoarte.length===0&&<div style={{textAlign:'center',padding:40,color:'rgba(159,215,255,0.3)',fontSize:13}}>Selectează luna și apasă Generează</div>}

        {/* ── COMBUSTIBIL ── */}
        {(()=>{
          const pretLive = Number(pretComb)||8.5
          const consumLive = Number(consumMasina)||7.5
          const costKm = (km:number) => Math.round(km/100*consumLive*pretLive*100)/100
          const totalKm = deplasari.reduce((s,d)=>s+Number(d.km),0)
          const totalCost = deplasari.reduce((s,d)=>s+costKm(Number(d.km)),0)
          const ziMap: Record<string,any[]> = {}
          deplasari.forEach(d=>{ if(!ziMap[d.data]) ziMap[d.data]=[]; ziMap[d.data].push(d) })
          const zile = Object.keys(ziMap).sort()
          return (
            <div style={{marginTop:24,background:'rgba(11,22,42,0.6)',border:'1px solid rgba(251,146,60,0.2)',borderRadius:14,overflow:'hidden'}}>
              <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(251,146,60,0.12)',display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:16}}>⛽</span>
                <span style={{fontSize:13,fontWeight:700,color:'rgba(251,146,60,0.9)'}}>Combustibil</span>
                <span style={{marginLeft:'auto',fontSize:12,color:'rgba(251,146,60,0.6)',fontFamily:'monospace'}}>{totalKm.toFixed(1)} km</span>
                <span style={{fontSize:14,fontWeight:700,color:'#FB923C',fontFamily:'monospace'}}>{totalCost.toFixed(2)} lei</span>
              </div>
              {/* Setări */}
              <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(251,146,60,0.08)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap' as const}}>
                <span style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>Preț:</span>
                <input value={pretComb} onChange={e=>setPretComb(e.target.value)} style={{width:60,background:'rgba(20,38,65,0.9)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'4px 8px',outline:'none',textAlign:'right' as const}} />
                <span style={{fontSize:11,color:'rgba(159,215,255,0.3)'}}>lei/L</span>
                <span style={{fontSize:11,color:'rgba(159,215,255,0.4)',marginLeft:8}}>Consum:</span>
                <input value={consumMasina} onChange={e=>setConsumMasina(e.target.value)} style={{width:50,background:'rgba(20,38,65,0.9)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,color:'rgba(214,228,244,0.8)',fontSize:12,padding:'4px 8px',outline:'none',textAlign:'right' as const}} />
                <span style={{fontSize:11,color:'rgba(159,215,255,0.3)'}}>L/100km</span>
                <button onClick={saveCombustibil} disabled={savingComb} style={{marginLeft:8,padding:'4px 12px',borderRadius:6,border:'1px solid rgba(251,146,60,0.4)',background:'rgba(251,146,60,0.12)',color:'#FB923C',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  {savingComb?'...':'Salvează'}
                </button>
              </div>
              {/* Lista zile */}
              {zile.length===0&&<div style={{padding:'16px',textAlign:'center' as const,fontSize:12,color:'rgba(159,215,255,0.25)'}}>Nicio deplasare înregistrată</div>}
              {zile.map(zi=>{
                const dep=ziMap[zi]
                const kmZi=dep.reduce((s:number,d:any)=>s+Number(d.km),0)
                const costZi=dep.reduce((s:number,d:any)=>s+costKm(Number(d.km)),0)
                const isOpen=expandedZiComb===zi
                return(
                  <div key={zi}>
                    <div onClick={()=>setExpandedZiComb(isOpen?null:zi)}
                      style={{padding:'9px 16px',display:'flex',alignItems:'center',gap:8,cursor:'pointer',borderBottom:'1px solid rgba(251,146,60,0.06)'}}>
                      <span style={{fontSize:11,color:'rgba(159,215,255,0.5)',fontFamily:'monospace',minWidth:50}}>{zi.slice(5).replace('-','/')}</span>
                      <span style={{fontSize:11,color:'rgba(159,215,255,0.35)',flex:1}}>{dep.length} deplasări</span>
                      <span style={{fontSize:11,color:'rgba(251,146,60,0.6)',fontFamily:'monospace'}}>{kmZi.toFixed(1)} km</span>
                      <span style={{fontSize:12,fontWeight:700,color:'#FB923C',fontFamily:'monospace',minWidth:60,textAlign:'right' as const}}>{costZi.toFixed(2)} lei</span>
                      <span style={{fontSize:10,color:'rgba(159,215,255,0.2)',transform:isOpen?'rotate(90deg)':'none',display:'inline-block'}}>▶</span>
                    </div>
                    {isOpen&&dep.map((d:any,i:number)=>(
                      <div key={i} style={{padding:'6px 16px 6px 32px',borderBottom:'1px solid rgba(251,146,60,0.04)',display:'flex',alignItems:'center',gap:8,background:'rgba(251,146,60,0.02)'}}>
                        <span style={{fontSize:11,color:'rgba(159,215,255,0.5)',fontFamily:'monospace'}}>{d.de_la}</span>
                        <span style={{fontSize:10,color:'rgba(159,215,255,0.2)'}}>→</span>
                        <span style={{fontSize:11,color:'rgba(159,215,255,0.5)',fontFamily:'monospace'}}>{d.la}</span>
                        <span style={{marginLeft:'auto',fontSize:11,color:'rgba(251,146,60,0.5)',fontFamily:'monospace'}}>{Number(d.km).toFixed(1)} km</span>
                        <span style={{fontSize:11,fontWeight:600,color:'#FB923C',fontFamily:'monospace',minWidth:52,textAlign:'right' as const}}>{costKm(Number(d.km)).toFixed(2)} lei</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>}

      {waGataInfo&&(()=>{
        const isCO = waGataInfo.tip==='checkout'
        const accent = isCO?'#F87171':'#4ADE80'
        return (
        <div style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setWaGataInfo(null)}>
          <div style={{background:'#0B1220',border:`1px solid ${accent}4D`,borderRadius:'20px 20px 0 0',padding:'20px 20px calc(20px + env(safe-area-inset-bottom, 0px))',width:'100%',maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,background:'rgba(159,215,255,0.2)',borderRadius:2,margin:'0 auto 16px'}}/>
            <div style={{fontSize:16,fontWeight:700,color:accent,marginBottom:4}}>{isCO?'🌅 Mesaj checkout':'📱 Mesaj presetat'}</div>
            <div style={{fontSize:13,color:'rgba(159,215,255,0.5)',marginBottom:14}}>{isCO?'Trimite mesajul de checkout clientului?':'Trimite mesajul de bun venit clientului?'}</div>
            <div style={{background:'rgba(14,27,43,0.7)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:600,color:'#E8F4FF',marginBottom:2}}>{waGataInfo.rez.nume_client}</div>
              <div style={{fontSize:11,color:'rgba(159,215,255,0.4)',marginBottom:8}}>{waGataInfo.apt?.nota}{waGataInfo.apt?.nota&&' · '}{waGataInfo.rez.telefon_client}</div>
              <pre style={{fontSize:11,color:'rgba(214,228,244,0.65)',whiteSpace:'pre-wrap' as const,wordBreak:'break-word' as const,margin:0,fontFamily:'inherit'}}>{waGataInfo.msg}</pre>
            </div>
            <a href={waLink(waGataInfo.rez.telefon_client,waGataInfo.msg)} target="_blank" rel="noreferrer"
              onClick={()=>setWaGataInfo(null)}
              style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'14px',borderRadius:14,background:'#22C55E',color:'#fff',fontSize:15,fontWeight:700,textDecoration:'none',marginBottom:10}}>
              📱 Trimite pe WhatsApp
            </a>
            <button onClick={()=>setWaGataInfo(null)}
              style={{width:'100%',padding:'12px',borderRadius:14,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.4)',fontSize:13,cursor:'pointer'}}>
              Nu acum
            </button>
          </div>
        </div>
        )
      })()}

      <Toast toast={toast}/>
    </>
  )
}
