'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ConnectionError } from '@/components/ui'

const CODE = '1111'
const P = (n:number) => String(n).padStart(2,'0')
const fmtDate = (d:string) => { try { const dt=new Date(d+'T12:00:00'); return `${P(dt.getDate())}.${P(dt.getMonth()+1)}` } catch { return d } }
const fmtFull = (d:string) => { try { const dt=new Date(d+'T12:00:00'); const z=['Dum','Lun','Mar','Mie','Joi','Vin','Sâm']; return `${z[dt.getDay()]} ${P(dt.getDate())}.${P(dt.getMonth()+1)}` } catch { return d } }
const addDays = (d:string, n:number) => { const dt=new Date(d+'T12:00:00'); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10) }
const todayStr = () => new Date().toISOString().slice(0,10)
function nrLenSmart(r:any){ const p=Number(r.nr_persoane)||0; if(p<=2) return 1; if(p<=4) return 2; if(p<=6) return 3; return 4 }
function waLink(phone:string, msg:string){ const c=phone.replace(/\D/g,''); const nr=c.startsWith('0')?'4'+c:c; return `https://wa.me/${nr}?text=${encodeURIComponent(msg)}` }

type Tab = 'curatenie' | 'disponibile' | 'ocupate' | 'probleme' | 'calendar' | 'casa'
type TipCasa = 'incasare' | 'cheltuiala'

export default function StaffPage() {
  const [auth, setAuth] = useState(false)
  const [cod, setCod] = useState('')
  const [err, setErr] = useState(false)
  const [data, setData] = useState(todayStr())
  const [apts, setApts] = useState<any[]>([])
  const [checkouts, setCheckouts] = useState<any[]>([])
  const [checkins, setCheckins] = useState<any[]>([])
  const [ocupate, setOcupate] = useState<any[]>([])
  const [statusuri, setStatusuri] = useState<Record<string,any>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [flash, setFlash] = useState<{msg:string,ok:boolean}|null>(null)
  const [tab, setTab] = useState<Tab>('curatenie')
  const [expandedApt, setExpandedApt] = useState<string|null>(null)
  const [calData, setCalData] = useState<any[]>([])
  const [problemeStaff, setProblemeStaff] = useState<any[]>([])
  const [newProbStaff, setNewProbStaff] = useState({titlu:'',descriere:'',prioritate:'normal',apartament_id:''})
  const [savingProb, setSavingProb] = useState(false)
  const [distante, setDistante] = useState<Record<string,number>>({})
  const [coRamasite, setCoRamasite] = useState<{rez:any, dataCheckout:string}[]>([])
  const [casaEntries, setCasaEntries] = useState<any[]>([])
  const [casaForm, setCasaForm] = useState<{open:boolean, tip:TipCasa, suma:string, motiv:string}>({open:false, tip:'incasare', suma:'', motiv:''})
  const [casaSaving, setCasaSaving] = useState(false)
  const [setariComb, setSetariComb] = useState({pret: 8.5, consum: 7.5})
  const [waGataInfo, setWaGataInfo] = useState<{apt:any,rez:any,msg:string}|null>(null)
  const [baniPending, setBaniPending] = useState<Record<string,any>>({})
  const [mesajZi, setMesajZi] = useState<{id:string,text:string}|null>(null)
  const [lenjeriiStoc, setLenjeriiStoc] = useState(0)
  const [lenjeriiIstoric, setLenjeriiIstoric] = useState<any[]>([])
  const [lenjeriiPrag, setLenjeriiPrag] = useState(15)
  const [lenjeriiHistOpen, setLenjeriiHistOpen] = useState(false)
  const [addLenjeriiOpen, setAddLenjeriiOpen] = useState(false)
  const [addLenjeriiForm, setAddLenjeriiForm] = useState({ cantitate: '', motiv: '' })
  const [savingLenjerii, setSavingLenjerii] = useState(false)
  const [editPragOpen, setEditPragOpen] = useState(false)
  const [editPragDraft, setEditPragDraft] = useState('')
  const dateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (document.cookie.includes('staff_auth=1111')) setAuth(true)
  }, [])

  useEffect(() => {
    if (!auth) return
    load()
    loadBaniPending()
    loadMesajZi()
    loadLenjerii()
    if(tab==='calendar') loadCalendar()
    if(tab==='probleme') loadProblemeStaff()
    if(tab==='casa') loadCasa()
  }, [auth, data, tab])

  useEffect(() => {
    if (!auth) return
    const i = setInterval(()=>{ loadBaniPending(); loadMesajZi(); loadLenjerii() }, 30000)
    return ()=>clearInterval(i)
  }, [auth, data])

  async function loadBaniPending() {
    const { data: rows } = await supabase.from('staff_casa')
      .select('*').eq('data', data).eq('preluat', false).not('apartament_id','is',null)
    const m:Record<string,any>={}
    ;(rows||[]).forEach((r:any)=>{ m[r.apartament_id]=r })
    setBaniPending(m)
  }

  async function loadMesajZi() {
    const { data: row } = await supabase.from('mesaje_zi').select('id,text').eq('data', data).maybeSingle()
    setMesajZi(row||null)
  }

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
      tip: 'adaugare', cantitate: cant, motiv: addLenjeriiForm.motiv.trim() || 'Adăugate de echipă',
    })
    setSavingLenjerii(false)
    if (!error) {
      setAddLenjeriiForm({ cantitate: '', motiv: '' })
      setAddLenjeriiOpen(false)
      loadLenjerii()
    }
  }

  async function deleteLenjeriiMov(id: string) {
    await supabase.from('lenjerii_miscari').delete().eq('id', id)
    loadLenjerii()
  }

  async function savePragLenjerii() {
    const v = parseInt(editPragDraft)
    if (!v || v <= 0) { setEditPragOpen(false); return }
    setLenjeriiPrag(v)
    const { data: ex } = await supabase.from('setari').select('id').eq('cheie', 'lenjerii_prag').maybeSingle()
    if (ex?.id) await supabase.from('setari').update({ valoare: String(v) }).eq('id', ex.id)
    else await supabase.from('setari').insert({ cheie: 'lenjerii_prag', valoare: String(v) })
    setEditPragOpen(false)
  }


  useEffect(() => {
    if (!auth) return
    supabase.from('distante_apartamente').select('de_la,la,km').then(
      ({data:d})=>{
        if(!d) return
        const m:Record<string,number>={}
        d.forEach((r:any)=>{ m[`${r.de_la}__${r.la}`]=Number(r.km) })
        setDistante(m)
      },
      (err)=>console.error('[staff distante]',err)
    )
    supabase.from('setari').select('cheie,valoare').in('cheie',['pret_combustibil','consum_masina']).then(
      ({data:d})=>{
        if(!d) return
        const s:any={}
        d.forEach((r:any)=>{ s[r.cheie]=Number(r.valoare) })
        setSetariComb({ pret: s.pret_combustibil||8.5, consum: s.consum_masina||7.5 })
      },
      (err)=>console.error('[staff setari]',err)
    )
  }, [auth])

  async function load() {
    setLoading(true)
    setLoadError(false)
    const bail=setTimeout(()=>{ setLoading(false); setLoadError(true) },20000)
    try{
      const past2 = addDays(data, -2)  // doar ieri + alaltaieri
      const [a, co, ci, ocp, st, coTrecut, stTrecut] = await Promise.all([
        supabase.from('apartamente').select('id,nota,nume,cod_locker').eq('status','activ').order('nota'),
        supabase.from('rezervari').select('id,apartament_id,nume_client,telefon_client,data_checkin,data_checkout,nr_nopti').eq('data_checkout',data).neq('status_rezervare','anulata'),
        supabase.from('rezervari').select('id,apartament_id,nume_client,telefon_client,data_checkin,data_checkout').eq('data_checkin',data).neq('status_rezervare','anulata'),
        supabase.from('rezervari').select('id,apartament_id,nume_client,telefon_client,data_checkin,data_checkout').lte('data_checkin',data).gt('data_checkout',data).neq('status_rezervare','anulata'),
        supabase.from('curatenie_status').select('*').eq('data',data),
        supabase.from('rezervari').select('id,apartament_id,nume_client,telefon_client,data_checkin,data_checkout').gte('data_checkout',past2).lt('data_checkout',data).neq('status_rezervare','anulata'),
        supabase.from('curatenie_status').select('apartament_id,data,status').gte('data',past2).lt('data',data),
      ])
      setApts(a.data||[])
      setCheckouts(co.data||[])
      setCheckins(ci.data||[])
      setOcupate(ocp.data||[])
      const m:Record<string,any>={}
      ;(st.data||[]).forEach((s:any)=>{ m[s.apartament_id]=s })
      setStatusuri(m)
      // Checkouturi din zilele trecute fara curatenie finalizata
      const DONE = new Set(['gata','anulat','doar_lenjerie','liber'])
      const stTrecutMap:Record<string,string>={}
      ;(stTrecut.data||[]).forEach((s:any)=>{ stTrecutMap[`${s.apartament_id}_${s.data}`]=s.status })
      const ramasite:(typeof coRamasite) = []
      ;(coTrecut.data||[]).forEach((rez:any)=>{ if(!DONE.has(stTrecutMap[`${rez.apartament_id}_${rez.data_checkout}`]||'')) ramasite.push({rez,dataCheckout:rez.data_checkout}) })
      setCoRamasite(ramasite)
      // setEliberatIds din curatenie_status
      clearTimeout(bail)
    }catch(err){console.error('[staff load]',err);clearTimeout(bail);setLoadError(true)}
    setLoading(false)
  }

  async function loadCalendar() {
    const from = addDays(data, -1)
    const to = addDays(data, 6)
    const { data: rez } = await supabase.from('rezervari')
      .select('apartament_id,data_checkin,data_checkout,nume_client')
      .lte('data_checkin', to).gt('data_checkout', from)
      .neq('status_rezervare','anulata')
    setCalData(rez||[])
  }

  async function loadCasa() {
    const { data: rows } = await supabase.from('staff_casa')
      .select('*,apartament:apartament_id(nota,nume)').eq('data', data).order('created_at', {ascending: false})
    setCasaEntries(rows || [])
  }

  async function confirmaPreluare(id: string) {
    await supabase.from('staff_casa').update({ preluat: true }).eq('id', id)
    loadCasa()
    loadBaniPending()
  }

  async function saveCasa() {
    const suma = parseFloat(casaForm.suma.replace(',', '.'))
    if (!suma || suma <= 0 || !casaForm.motiv.trim()) return
    setCasaSaving(true)
    const { error } = await supabase.from('staff_casa').insert({
      data: data, tip: casaForm.tip, suma, motiv: casaForm.motiv.trim(),
    })
    setCasaSaving(false)
    if (!error) {
      setCasaForm(f => ({...f, open:false, suma:'', motiv:''}))
      loadCasa()
    }
  }

  async function deleteCasaEntry(id: string) {
    await supabase.from('staff_casa').delete().eq('id', id)
    loadCasa()
  }

  async function loadProblemeStaff() {
    const { data } = await supabase.from('probleme_apartamente')
      .select('*,apartament:apartament_id(nota,nume)')
      .neq('status','rezolvat')
      .order('created_at',{ascending:false})
    setProblemeStaff(data||[])
  }

  async function addProblemaStaff() {
    if(!newProbStaff.titlu) return
    setSavingProb(true)
    const { error } = await supabase.from('probleme_apartamente').insert({
      apartament_id: newProbStaff.apartament_id || null,
      titlu: newProbStaff.titlu,
      descriere: newProbStaff.descriere,
      prioritate: newProbStaff.prioritate,
      status: 'deschis',
      created_at: new Date().toISOString(),
    })
    if (!error) {
      setNewProbStaff({titlu:'',descriere:'',prioritate:'normal',apartament_id:''})
      loadProblemeStaff()
      setFlash({msg:'✓ Problemă raportată!', ok:true})
      setTimeout(()=>setFlash(null),2000)
    }
    setSavingProb(false)
  }

  async function inregistreazaDeplasare(deLa: string, la: string) {
    const km = distante[`${deLa}__${la}`]
    if (!km) return
    const cost_lei = Math.round(km / 100 * setariComb.consum * setariComb.pret * 100) / 100
    await supabase.from('deplasari_curatenie').insert({ data, de_la: deLa, la, km, cost_lei })
  }

  async function buildWaGataInfo(aptId:string) {
    const ciRez = checkins.find((c:any) => c.apartament_id === aptId)
    if (!ciRez?.telefon_client) return
    const { data: sab } = await supabase.from('sabloane_mesaje')
      .select('text').eq('tip','gata_curatenie').eq('apartament_id',aptId).maybeSingle()
    const { data: sabGlobal } = !sab ? await supabase.from('sabloane_mesaje')
      .select('text').eq('tip','gata_curatenie').is('apartament_id',null).maybeSingle()
      : { data: null }
    const template = sab?.text || sabGlobal?.text ||
      `Bună ziua, {nume}! 🏠\n\nVă las aici datele de acces pentru locația dumneavoastră de astăzi, *{apartament}*.\n\nO ședere plăcută! Ne puteți contacta oricând. 😊\nEchipa AB Homes Iași`
    const aptObj = apts.find((a:any) => a.id === aptId)
    const waMsg = template
      .replace(/\{nume\}/gi, (ciRez.nume_client||'').split(' ')[0])
      .replace(/\{apartament\}/gi, aptObj?.nume || aptObj?.nota || '')
    setWaGataInfo({ apt: aptObj, rez: ciRez, msg: waMsg })
  }

  async function setStatus(aptId:string, status:'inceput'|'gata') {
    const now = new Date()
    const ora = `${P(now.getHours())}:${P(now.getMinutes())}`
    const prev = statusuri[aptId]||{}
    const update:any = { apartament_id:aptId, data, status }
    if (status==='inceput') update.ora_inceput = ora
    if (status==='gata') { update.ora_gata = ora; update.ora_inceput = prev.ora_inceput||ora }
    await supabase.from('curatenie_status').upsert(update, {onConflict:'apartament_id,data'})
    // Daca e o curatenie ramasita din alta zi, marcheaza si data originala ca finalizata
    // ca sa nu mai apara in lista de neterminate a doua zi
    const ramasitaInfo = ramasiteMap.get(aptId)
    if (ramasitaInfo && status === 'gata') {
      await supabase.from('curatenie_status').upsert(
        { apartament_id: aptId, data: ramasitaInfo.dataCheckout, status: 'gata', ora_gata: ora },
        { onConflict: 'apartament_id,data' }
      )
      setCoRamasite(prev => prev.filter(({rez}) => rez.apartament_id !== aptId))
    }
    const newStatusuri = {...statusuri, [aptId]: {...statusuri[aptId], ...update}}
    setStatusuri(newStatusuri)

    const apt = apts.find(a=>a.id===aptId)
    const aptNota = apt?.nota

    // Consum automat de lenjerii: la "Am terminat" se scade din stoc, la "Reincepe" se readauga.
    // Verificam direct in baza de date daca exista deja o miscare de consum (idempotent), in loc
    // sa ne bazam pe starea locala `prev` care poate fi neactualizata (race cu reincarcarea listei).
    const { data: existingCons } = await supabase.from('lenjerii_miscari').select('id')
      .eq('apartament_id', aptId).eq('data', data).eq('tip', 'consum').maybeSingle()
    if (status === 'gata' && !existingCons) {
      const ciForLen = checkins.find((r:any) => r.apartament_id === aptId)
      const cant = prev.nr_lenjerii || (ciForLen ? nrLenSmart(ciForLen) : null)
      if (cant) {
        await supabase.from('lenjerii_miscari').insert({ tip: 'consum', cantitate: cant, motiv: `Curățenie ${aptNota||''}`.trim(), apartament_id: aptId, data })
        loadLenjerii()
      }
    } else if (status === 'inceput' && existingCons) {
      await supabase.from('lenjerii_miscari').delete().eq('id', existingCons.id)
      loadLenjerii()
    }

    if (status==='inceput' && aptNota) {
      // Sursa = ultima deplasare inregistrata in DB (la); daca nu exista nicio deplasare azi, vine de la CANTA
      const { data: lastTrip } = await supabase.from('deplasari_curatenie')
        .select('la').eq('data', data).order('created_at', {ascending: false}).limit(1).maybeSingle()
      const sursa = lastTrip?.la || 'CANTA'
      await inregistreazaDeplasare(sursa, aptNota)
    }

    if (status==='gata' && aptNota) {
      const toateGata = deCuratat.every(a => a.id===aptId || newStatusuri[a.id]?.status==='gata')
      if (toateGata) await inregistreazaDeplasare(aptNota, 'CANTA')
      // Mesaj WA pentru clientul care face check-in azi
      await buildWaGataInfo(aptId)
    }

    const msg = status==='inceput' ? `🧹 Curățenie începută — ${aptNota}` : `✅ Gata — ${aptNota} (${ora})`
    setFlash({msg, ok: status==='gata'})
    setTimeout(()=>setFlash(null), 2500)
    fetch('/api/push-send', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title: msg, body: fmtFull(data), url:'/curatenie', tag:'staff-'+aptId, tip:'curatenie' })
    }).catch(()=>{})
    supabase.from('notificari').insert({ mesaj: msg, tip: 'curatenie', citit: false, url: '/curatenie' }).then(()=>{})
  }

  const pressKey = useCallback((k: number|string) => {
    if (k==='⌫') { setCod(c=>c.slice(0,-1)); setErr(false); return }
    if (typeof k === 'number' && cod.length < 4) {
      const nc = cod + k
      setCod(nc)
      if (nc.length === 4) {
        setTimeout(() => {
          if (nc === CODE) { document.cookie='staff_auth=1111;path=/;max-age=86400'; setAuth(true); setErr(false) }
          else { setErr(true); setCod('') }
        }, 150)
      }
    }
  }, [cod])

  // ── LOGIN ──
  if (!auth) return (
    <div style={{minHeight:'100dvh',background:'linear-gradient(160deg,#0A1628 0%,#060D1A 100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',padding:'0 0 env(safe-area-inset-bottom)'}}>
      <div style={{width:'100%',maxWidth:360,padding:'0 28px'}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:48}}>
          <div style={{width:72,height:72,borderRadius:20,background:'linear-gradient(135deg,#1E40AF,#3B82F6)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:32}}>🏠</div>
          <div style={{fontSize:26,fontWeight:700,color:'#F0F8FF',letterSpacing:'-.5px'}}>AB Homes</div>
          <div style={{fontSize:14,color:'rgba(159,215,255,0.4)',marginTop:6}}>Echipa curățenie</div>
        </div>

        {/* Dots */}
        <div style={{display:'flex',justifyContent:'center',gap:12,marginBottom:36}}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{width:16,height:16,borderRadius:'50%',
              background: err ? '#F87171' : cod.length>i ? '#4ADE80' : 'rgba(255,255,255,0.1)',
              transition:'background .15s',
              boxShadow: cod.length>i&&!err ? '0 0 8px rgba(74,222,128,0.5)' : 'none'
            }}/>
          ))}
        </div>

        {/* Keyboard */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
          {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k,i)=>(
            <button key={i} onClick={()=>k!=='' && pressKey(k as any)}
              disabled={k===''}
              style={{
                padding:'20px 0',borderRadius:16,border:'none',
                background: k==='' ? 'transparent' : 'rgba(255,255,255,0.07)',
                color: k==='⌫' ? 'rgba(159,215,255,0.6)' : '#F0F8FF',
                fontSize: k==='⌫' ? 20 : 24,fontWeight:500,
                cursor:k===''?'default':'pointer',
                opacity:k===''?0:1,
                WebkitTapHighlightColor:'transparent',
                transition:'background .1s',
                touchAction:'manipulation',
              }}>
              {k}
            </button>
          ))}
        </div>

        {err && (
          <div style={{textAlign:'center',color:'#F87171',marginTop:20,fontSize:14,fontWeight:500}}>
            ✕ Cod greșit, încearcă din nou
          </div>
        )}
      </div>
    </div>
  )

  // ── APP ──
  const coSet = new Set(checkouts.map((r:any)=>r.apartament_id))
  const ciSet = new Set(checkins.map((r:any)=>r.apartament_id))
  const ocpSet = new Set(ocupate.map((r:any)=>r.apartament_id))
  // Apartamente cu curatenie neterminata din zilele trecute (excluse din lista de azi deja)
  const ramasiteMap = new Map(coRamasite.filter(({rez})=>!coSet.has(rez.apartament_id)).map(({rez,dataCheckout})=>[rez.apartament_id,{rez,dataCheckout}]))
  const deCuratat = apts.filter(a=>coSet.has(a.id)||ramasiteMap.has(a.id))
  const disponibile = apts.filter(a=>!ocpSet.has(a.id))
  const ocupateApts = apts.filter(a=>ocpSet.has(a.id))
  const nrGata = deCuratat.filter(a=>statusuri[a.id]?.status==='gata').length

  const casaTotalIn  = casaEntries.filter((e:any)=>e.tip==='incasare'&&e.preluat!==false).reduce((s:number,e:any)=>s+Number(e.suma),0)
  const casaTotalOut = casaEntries.filter((e:any)=>e.tip==='cheltuiala'&&e.preluat!==false).reduce((s:number,e:any)=>s+Number(e.suma),0)
  const casaDePreluat = casaEntries.filter((e:any)=>e.preluat===false)
  const TABS: {k:Tab,l:string,n?:number}[] = [
    {k:'curatenie', l:'🧹', n:deCuratat.length},
    {k:'disponibile', l:'🟢', n:disponibile.length},
    {k:'ocupate', l:'🔴', n:ocupateApts.length},
    {k:'probleme', l:'🔧'},
    {k:'casa', l:'💰'},
    {k:'calendar', l:'📅'},
  ]

  // Calendar 7 zile
  const calDays = Array.from({length:7},(_,i)=>addDays(data,-1+i))

  if (loadError) return (
    <div style={{height:'100dvh',background:'#060D1A',display:'flex',flexDirection:'column',position:'fixed',inset:0}}>
      <ConnectionError onRetry={()=>load()}/>
    </div>
  )

  return (
    <div style={{height:'100dvh',background:'#060D1A',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',display:'flex',flexDirection:'column',overflow:'hidden',position:'fixed',inset:0,touchAction:'pan-y',overscrollBehavior:'none' as const}}>

      {/* Flash */}
      {flash&&(
        <div style={{position:'fixed',top:0,left:0,right:0,zIndex:100,background:flash.ok?'#22C55E':'#FB923C',color:'#fff',padding:'14px 16px 14px',paddingTop:'calc(14px + env(safe-area-inset-top))',fontSize:14,fontWeight:600,textAlign:'center',transition:'all .3s'}}>
          {flash.msg}
        </div>
      )}

      {/* Header */}
      <div style={{background:'rgba(6,13,26,0.98)',borderBottom:'1px solid rgba(255,255,255,0.07)',padding:'12px 16px',paddingTop:'calc(12px + env(safe-area-inset-top)',position:'sticky',top:0,zIndex:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:'#F0F8FF'}}>
              {deCuratat.length>0 ? (nrGata+'/'+deCuratat.length+' curatate') : 'Totul e curat'}
            </div>
            <div style={{fontSize:11,color:'rgba(159,215,255,0.35)',marginTop:1}}>AB Homes</div>
          </div>
          {/* Navigare zile */}
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <button onClick={()=>setData(addDays(data,-1))}
              style={{width:36,height:36,borderRadius:10,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#7BC8FF',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>
              {'<'}
            </button>
            <button onClick={()=>setData(todayStr())}
              style={{padding:'0 10px',height:36,borderRadius:10,border:'1px solid '+(data===todayStr()?'rgba(74,222,128,0.4)':'rgba(255,255,255,0.1)'),background:data===todayStr()?'rgba(74,222,128,0.1)':'rgba(255,255,255,0.05)',color:data===todayStr()?'#4ADE80':'#7BC8FF',fontSize:12,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
              {fmtFull(data)}
            </button>
            <button onClick={()=>dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
              style={{width:36,height:36,borderRadius:10,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#7BC8FF',fontSize:15,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent',position:'relative'}}>
              📅
              <input ref={dateInputRef} type="date" value={data} onChange={e=>setData(e.target.value)}
                style={{position:'absolute',width:1,height:1,opacity:0,pointerEvents:'none'}}/>
            </button>
            <button onClick={()=>setData(addDays(data,1))}
              style={{width:36,height:36,borderRadius:10,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.05)',color:'#7BC8FF',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',WebkitTapHighlightColor:'transparent'}}>
              {'>'}
            </button>
          </div>
        </div>

        {/* Progress */}
        {deCuratat.length>0&&(
          <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',borderRadius:2,background:'linear-gradient(90deg,#22C55E,#4ADE80)',width:((nrGata/deCuratat.length*100)+'%'),transition:'width .5s ease'}}/>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{display:'flex',background:'rgba(6,13,26,0.98)',borderBottom:'1px solid rgba(255,255,255,0.06)',position:'sticky',top:72,zIndex:19}}>
        {TABS.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)}
            style={{flex:1,padding:'11px 4px',border:'none',background:'transparent',color:tab===t.k?'#7BC8FF':'rgba(159,215,255,0.35)',fontSize:11,fontWeight:600,cursor:'pointer',borderBottom:'2px solid '+(tab===t.k?'#7BC8FF':'transparent'),transition:'all .15s',WebkitTapHighlightColor:'transparent'}}>
            {t.l}{t.n!==undefined?' ('+t.n+')':''}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:'auto',overflowX:'hidden',padding:'12px 14px 20px',WebkitOverflowScrolling:'touch' as any}}>

        {/* CURATENIE */}
        {tab==='curatenie'&&(<>
          {(()=>{
            const scazut = lenjeriiStoc <= lenjeriiPrag
            return (
              <div style={{padding:'12px 14px',borderRadius:12,marginBottom:10,background:scazut?'rgba(248,113,113,0.08)':'rgba(167,139,250,0.08)',border:'1px solid '+(scazut?'rgba(248,113,113,0.3)':'rgba(167,139,250,0.25)')}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:20}}>🛏️</span>
                    <div>
                      <div style={{fontSize:20,fontWeight:800,color:scazut?'#FCA5A5':'#C4B5FD'}}>{lenjeriiStoc}<span style={{fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.4)'}}> lenjerii disponibile</span></div>
                      {scazut&&<div style={{fontSize:11,color:'#FCA5A5',fontWeight:600,marginTop:1}}>⚠️ Stoc scăzut — trebuie aduse mai multe</div>}
                    </div>
                  </div>
                  <button onClick={()=>setAddLenjeriiOpen(o=>!o)}
                    style={{padding:'8px 14px',borderRadius:10,border:'none',background:'#A78BFA',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent',flexShrink:0}}>
                    + Adaugă
                  </button>
                </div>
                {addLenjeriiOpen&&(
                  <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(255,255,255,0.08)'}}>
                    <div style={{display:'flex',gap:8,marginBottom:8}}>
                      <input type="text" inputMode="numeric" placeholder="Câte?" value={addLenjeriiForm.cantitate}
                        onChange={e=>setAddLenjeriiForm(f=>({...f,cantitate:e.target.value.replace(/\D/g,'')}))}
                        style={{width:70,padding:'10px 12px',borderRadius:10,border:'1px solid rgba(167,139,250,0.3)',background:'rgba(6,13,26,0.8)',color:'#fff',fontSize:15,outline:'none'}}/>
                      <input type="text" placeholder="De unde (opțional)" value={addLenjeriiForm.motiv}
                        onChange={e=>setAddLenjeriiForm(f=>({...f,motiv:e.target.value}))}
                        style={{flex:1,padding:'10px 12px',borderRadius:10,border:'1px solid rgba(167,139,250,0.3)',background:'rgba(6,13,26,0.8)',color:'#fff',fontSize:14,outline:'none'}}/>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={addLenjerii} disabled={savingLenjerii||!addLenjeriiForm.cantitate}
                        style={{flex:1,padding:'10px',borderRadius:10,border:'none',background:'#22C55E',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:!addLenjeriiForm.cantitate?0.5:1}}>
                        {savingLenjerii?'Se salvează...':'✓ Salvează'}
                      </button>
                      <button onClick={()=>{setAddLenjeriiOpen(false);setAddLenjeriiForm({cantitate:'',motiv:''})}}
                        style={{padding:'10px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,0.15)',background:'transparent',color:'rgba(255,255,255,0.5)',fontSize:13,cursor:'pointer'}}>
                        Anulează
                      </button>
                    </div>
                  </div>
                )}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:8}}>
                  <span onClick={()=>setLenjeriiHistOpen(o=>!o)} style={{fontSize:11,color:'rgba(255,255,255,0.4)',cursor:'pointer'}}>
                    {lenjeriiHistOpen?'▾':'▸'} Istoric
                  </span>
                  {editPragOpen ? (
                    <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}>
                      <span style={{color:'rgba(255,255,255,0.4)'}}>Prag alertă:</span>
                      <input autoFocus type="text" inputMode="numeric" value={editPragDraft}
                        onChange={e=>setEditPragDraft(e.target.value.replace(/\D/g,''))}
                        onKeyDown={e=>{if(e.key==='Enter')savePragLenjerii();if(e.key==='Escape')setEditPragOpen(false)}}
                        onBlur={savePragLenjerii}
                        style={{width:36,fontSize:11,padding:'2px 4px',borderRadius:4,border:'1px solid rgba(167,139,250,0.3)',background:'rgba(6,13,26,0.8)',color:'#fff'}}/>
                    </span>
                  ) : (
                    <span onClick={()=>{setEditPragDraft(String(lenjeriiPrag));setEditPragOpen(true)}} style={{fontSize:11,color:'rgba(255,255,255,0.3)',cursor:'pointer'}}>
                      Prag alertă: {lenjeriiPrag} ✏️
                    </span>
                  )}
                </div>
                {lenjeriiHistOpen&&(
                  <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:4}}>
                    {lenjeriiIstoric.length===0&&<div style={{fontSize:12,color:'rgba(255,255,255,0.3)'}}>Nicio mișcare încă.</div>}
                    {lenjeriiIstoric.map((m:any)=>{
                      const isAd=m.tip==='adaugare'
                      return (
                        <div key={m.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',borderRadius:7,background:isAd?'rgba(74,222,128,0.06)':'rgba(248,113,113,0.06)'}}>
                          <span style={{fontSize:11,fontWeight:700,color:isAd?'#4ADE80':'#FCA5A5',flexShrink:0}}>{isAd?'+':'-'}{m.cantitate}</span>
                          <span style={{fontSize:11,color:'rgba(255,255,255,0.5)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{m.motiv}</span>
                          <span style={{fontSize:10,color:'rgba(255,255,255,0.25)',flexShrink:0}}>{fmtDate(m.data)}</span>
                          <span onClick={()=>deleteLenjeriiMov(m.id)} style={{color:'rgba(255,255,255,0.25)',fontSize:14,padding:'0 2px',flexShrink:0}}>×</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}
          {mesajZi&&(
            <div style={{display:'flex',alignItems:'flex-start',gap:8,padding:'12px 14px',borderRadius:12,background:'rgba(77,163,255,0.1)',border:'1px solid rgba(77,163,255,0.3)',marginBottom:10}}>
              <span style={{fontSize:17,flexShrink:0}}>📣</span>
              <div style={{flex:1,fontSize:13,fontWeight:600,color:'#93C5FD',whiteSpace:'pre-wrap' as const}}>{mesajZi.text}</div>
            </div>
          )}
          {deCuratat.length===0
          ? <div style={{textAlign:'center',padding:'60px 0',color:'rgba(159,215,255,0.25)',fontSize:15}}>Niciun checkout azi</div>
          : deCuratat.map(apt=>{
            const st=statusuri[apt.id]
            const isGata=st?.status==='gata'
            const isInceput=st?.status==='inceput'
            const co=checkouts.find((r:any)=>r.apartament_id===apt.id)
            const ci=checkins.find((r:any)=>r.apartament_id===apt.id)
            const ramasita=ramasiteMap.get(apt.id)
            const isOpen=expandedApt===apt.id
            const borderColor=ramasita&&!isGata?'rgba(248,113,113,0.4)':isGata?'rgba(34,197,94,0.4)':isInceput?'rgba(251,146,60,0.4)':ci?'rgba(252,211,77,0.3)':'rgba(255,255,255,0.08)'
            const bgColor=ramasita&&!isGata?'rgba(248,113,113,0.06)':isGata?'rgba(34,197,94,0.06)':isInceput?'rgba(251,146,60,0.06)':'rgba(255,255,255,0.02)'
            return (
              <div key={apt.id} style={{borderRadius:16,overflow:'hidden',border:'0.5px solid '+borderColor,borderLeft:'3px solid '+borderColor,background:bgColor,marginBottom:8,width:'100%'}}>
                <div onClick={()=>setExpandedApt(isOpen?null:apt.id)}
                  style={{padding:'12px 14px',display:'flex',alignItems:'center',gap:10,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                  <span style={{fontSize:22,flexShrink:0}}>{isGata?'✅':isInceput?'🧹':'⏳'}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:17,fontWeight:800,color:'#F0F8FF'}}>{apt.nota}</span>
                      <span style={{fontSize:12,color:'rgba(159,215,255,0.5)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{apt.nume}</span>
                      {apt.cod_locker&&<span style={{fontSize:11,fontWeight:700,color:'#FCD34D',fontFamily:'monospace',background:'rgba(252,211,77,0.12)',border:'1px solid rgba(252,211,77,0.25)',padding:'2px 7px',borderRadius:6,flexShrink:0,letterSpacing:1}}>🔒{apt.cod_locker}</span>}
                    </div>
                    <div style={{display:'flex',gap:5,marginTop:4,flexWrap:'wrap'}}>
                      {isGata&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:'rgba(34,197,94,0.15)',color:'#4ADE80',fontWeight:700,border:'1px solid rgba(34,197,94,0.25)'}}>{'Gata'+(st?.ora_gata?' '+st.ora_gata:'')}</span>}
                      {isInceput&&!isGata&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:'rgba(251,146,60,0.15)',color:'#FB923C',fontWeight:700,border:'1px solid rgba(251,146,60,0.25)'}}>In lucru</span>}
                      {!isInceput&&!isGata&&st?.status!=='anulat'&&st?.status!=='doar_lenjerie'&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:'rgba(255,255,255,0.05)',color:'rgba(159,215,255,0.4)',border:'1px solid rgba(255,255,255,0.08)'}}>Neinceput</span>}
                      {st?.status==='anulat'&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:'rgba(248,113,113,0.15)',color:'#F87171',fontWeight:700,border:'1px solid rgba(248,113,113,0.3)'}}>Anulat</span>}
                      {st?.status==='doar_lenjerie'&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:'rgba(167,139,250,0.15)',color:'#A78BFA',fontWeight:700,border:'1px solid rgba(167,139,250,0.3)'}}>Doar lenjerie</span>}
                      {ramasita&&!isGata&&(()=>{const z=Math.round((new Date(data).getTime()-new Date(ramasita.dataCheckout).getTime())/86400000);return<span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:'rgba(248,113,113,0.2)',color:'#FCA5A5',fontWeight:700,border:'1px solid rgba(248,113,113,0.4)'}}>{'⚠ '+(z===1?'de ieri':z===2?'de alaltaieri':`de ${z} zile`)}</span>})()}
                      {ci&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:'rgba(252,211,77,0.15)',color:'#FCD34D',fontWeight:700,border:'1px solid rgba(252,211,77,0.25)'}}>URGENT</span>}
                      {st?.eliberat&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:'rgba(74,222,128,0.15)',color:'#4ADE80',fontWeight:700,border:'1px solid rgba(74,222,128,0.25)'}}>{'Eliberat'+(st.eliberat_la?' '+st.eliberat_la:'')}</span>}
                      {baniPending[apt.id]&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:'rgba(77,163,255,0.18)',color:'#FCD34D',fontWeight:700,border:'1px solid rgba(77,163,255,0.4)'}}>{'💰 '+Number(baniPending[apt.id].suma).toFixed(0)+' RON de încasat'}</span>}
                    </div>
                  </div>
                  <span style={{fontSize:18,color:'rgba(159,215,255,0.3)',transform:isOpen?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.2s',flexShrink:0}}>{'>'}</span>
                </div>
                {isOpen&&(
                  <div style={{borderTop:'1px solid '+borderColor,padding:'12px 14px 14px',display:'flex',flexDirection:'column',gap:8}}>
                    {co&&(
                      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'rgba(248,113,113,0.07)',borderRadius:10}}>
                        <span style={{fontSize:15,flexShrink:0}}>↗</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:10,color:'rgba(248,113,113,0.65)',fontWeight:600,textTransform:'uppercase' as const,letterSpacing:'0.4px'}}>Check-out</div>
                          <div style={{fontSize:13,fontWeight:600,color:'#FCA5A5',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{co.nume_client}{co.nr_nopti?` · ${co.nr_nopti} nopți`:''}</div>
                        </div>
                        {co.telefon_client&&<a href={'tel:'+co.telefon_client} style={{flexShrink:0,padding:'6px 10px',borderRadius:20,background:'rgba(248,113,113,0.15)',color:'#FCA5A5',textDecoration:'none',fontSize:12,fontWeight:600}}>Sună</a>}
                      </div>
                    )}
                    {ci&&(
                      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'rgba(252,211,77,0.08)',borderRadius:10}}>
                        <span style={{fontSize:15,flexShrink:0}}>↙</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:10,color:'rgba(252,211,77,0.7)',fontWeight:600,textTransform:'uppercase' as const,letterSpacing:'0.4px'}}>Check-in azi</div>
                          <div style={{fontSize:13,fontWeight:700,color:'#FCD34D',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{ci.nume_client}</div>
                        </div>
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          {ci.telefon_client&&<a href={'tel:'+ci.telefon_client} style={{padding:'6px 10px',borderRadius:20,background:'rgba(252,211,77,0.15)',color:'#FCD34D',textDecoration:'none',fontSize:12,fontWeight:600}}>Sună</a>}
                          {ci.telefon_client&&<button onClick={()=>buildWaGataInfo(apt.id)}
                            style={{padding:'6px 10px',borderRadius:20,border:'none',background:'rgba(74,222,128,0.15)',color:'#4ADE80',fontSize:12,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                            📱
                          </button>}
                        </div>
                      </div>
                    )}
                    {ci&&(()=>{
                      const stLen=statusuri[apt.id]?.nr_lenjerii
                      const l=stLen||nrLenSmart(ci)
                      return (
                        <div style={{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',borderRadius:10,background:'rgba(167,139,250,0.08)'}}>
                          <span style={{fontSize:15}}>🛏</span>
                          <span style={{fontSize:13,fontWeight:700,color:'#C4B5FD'}}>{l+' '+(l===1?'lenjerie':'lenjerii')}</span>
                          <span style={{fontSize:11,color:'rgba(196,181,253,0.6)'}}>{'('+( Number(ci.nr_persoane)||2)+' pers.)'}</span>
                        </div>
                      )
                    })()}
                    {apt?.id&&baniPending[apt.id]&&(
                      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:10,background:'rgba(77,163,255,0.1)',border:'1px solid rgba(77,163,255,0.35)'}}>
                        <span style={{fontSize:15,flexShrink:0}}>💰</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:'#FCD34D'}}>{Number(baniPending[apt.id].suma).toFixed(0)+' RON de încasat'}</div>
                          <div style={{fontSize:11,color:'rgba(147,197,253,0.65)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{baniPending[apt.id].motiv}</div>
                        </div>
                        <button onClick={()=>confirmaPreluare(baniPending[apt.id].id)}
                          style={{flexShrink:0,padding:'8px 12px',borderRadius:9,border:'none',background:'#FCD34D',color:'#3A2A00',fontSize:12,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                          ✓ Am încasat
                        </button>
                      </div>
                    )}
                    {(st?.co_tarziu||st?.ci_devreme)&&(
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        {st?.co_tarziu&&<div style={{fontSize:12,padding:'7px 10px',borderRadius:9,background:'rgba(248,113,113,0.1)',color:'#FCA5A5',fontWeight:600}}>{'🕐 Checkout târziu: '+st.co_tarziu}</div>}
                        {st?.ci_devreme&&<div style={{fontSize:12,padding:'7px 10px',borderRadius:9,background:'rgba(77,163,255,0.1)',color:'#93C5FD',fontWeight:600}}>{'🕐 Check-in devreme: '+st.ci_devreme}</div>}
                      </div>
                    )}
                    {st&&(isInceput||isGata)&&<div style={{fontSize:12,color:isGata?'#4ADE80':'#FB923C'}}>
                      {isInceput&&!isGata&&('Inceput la '+st.ora_inceput)}
                      {isGata&&('Terminat la '+st.ora_gata+(st.ora_inceput?' (inceput '+st.ora_inceput+')':''))}
                    </div>}
                    <div style={{display:'flex',gap:8,marginTop:4}}>
                      {!isInceput&&!isGata&&<button onClick={()=>setStatus(apt.id,'inceput')} style={{flex:1,padding:'15px',borderRadius:14,border:'none',background:'#FB923C',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent',touchAction:'manipulation'}}>Incepe curatenia</button>}
                      {isInceput&&!isGata&&<button onClick={()=>setStatus(apt.id,'gata')} style={{flex:1,padding:'15px',borderRadius:14,border:'none',background:'#22C55E',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent',touchAction:'manipulation'}}>Am terminat!</button>}
                      {isGata&&<button onClick={()=>setStatus(apt.id,'inceput')} style={{flex:1,padding:'13px',borderRadius:14,border:'1px solid rgba(251,146,60,0.3)',background:'transparent',color:'#FB923C',fontSize:13,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>Reincepe</button>}
                    </div>
                    <button onClick={()=>{
                      setNewProbStaff({titlu:'',descriere:'',prioritate:'normal',apartament_id:apt.id})
                      setTab('probleme')
                      setExpandedApt(null)
                    }} style={{width:'100%',padding:'10px',borderRadius:12,border:'1px solid rgba(248,113,113,0.3)',background:'rgba(248,113,113,0.06)',color:'#F87171',fontSize:13,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent',textAlign:'center' as const}}>
                      🔧 Raporteaza problema
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </>)}

        {/* LIBERE */}
        {tab==='disponibile'&&(disponibile.length===0
          ? <div style={{textAlign:'center',padding:'60px 0',color:'rgba(159,215,255,0.25)',fontSize:15}}>Toate ocupate</div>
          : disponibile.map(apt=>(
            <div key={apt.id} style={{borderRadius:14,padding:'14px 16px',border:'1px solid rgba(74,222,128,0.15)',background:'rgba(74,222,128,0.04)',display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:'#4ADE80',flexShrink:0,boxShadow:'0 0 6px rgba(74,222,128,0.5)'}}/>
              <div style={{flex:1}}>
                <span style={{fontSize:16,fontWeight:700,color:'#F0F8FF'}}>{apt.nota}</span>
                <span style={{fontSize:12,color:'rgba(159,215,255,0.4)',marginLeft:8}}>{apt.nume}</span>
                {ciSet.has(apt.id)&&<div style={{fontSize:12,color:'#FCD34D',marginTop:2}}>{'Checkin azi: '+checkins.find((r:any)=>r.apartament_id===apt.id)?.nume_client}</div>}
              </div>
            </div>
          ))
        )}

        {/* OCUPATE */}
        {tab==='ocupate'&&(ocupateApts.length===0
          ? <div style={{textAlign:'center',padding:'60px 0',color:'rgba(159,215,255,0.25)',fontSize:15}}>Nicio rezervare activa</div>
          : ocupateApts.map(apt=>{
            const rez=ocupate.find((r:any)=>r.apartament_id===apt.id)
            return (
              <div key={apt.id} style={{borderRadius:14,padding:'14px 16px',border:'1px solid rgba(248,113,113,0.15)',background:'rgba(248,113,113,0.04)',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:'#F87171',flexShrink:0}}/>
                  <span style={{fontSize:16,fontWeight:700,color:'#F0F8FF'}}>{apt.nota}</span>
                  <span style={{fontSize:12,color:'rgba(159,215,255,0.4)'}}>{apt.nume}</span>
                </div>
                {rez&&<div style={{paddingLeft:22}}>
                  <div style={{fontSize:13,color:'rgba(255,255,255,0.75)',fontWeight:500,marginBottom:4}}>{rez.nume_client}</div>
                  <div style={{fontSize:12,color:'rgba(159,215,255,0.4)',marginBottom:6}}>{fmtDate(rez.data_checkin)+' - '+fmtDate(rez.data_checkout)}</div>
                  {rez.telefon_client&&<a href={'tel:'+rez.telefon_client} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:10,background:'rgba(77,163,255,0.12)',border:'1px solid rgba(77,163,255,0.25)',color:'#7BC8FF',textDecoration:'none',fontSize:13,fontWeight:600}}>{'📞 '+rez.telefon_client}</a>}
                </div>}
              </div>
            )
          })
        )}

        {/* PROBLEME */}
        {tab==='probleme'&&(
          <div>
            <div style={{borderRadius:18,border:'1px solid rgba(251,146,60,0.25)',background:'rgba(251,146,60,0.05)',padding:16,marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:'#FB923C',marginBottom:12}}>Raporteaza o problema</div>
              <select value={newProbStaff.apartament_id} onChange={e=>setNewProbStaff(p=>({...p,apartament_id:e.target.value}))}
                style={{width:'100%',background:'rgba(20,38,65,0.9)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,color:'rgba(214,228,244,0.8)',fontSize:14,padding:'12px 10px',outline:'none',marginBottom:10,boxSizing:'border-box'}}>
                <option value="">Apartament (optional)</option>
                {apts.map(a=><option key={a.id} value={a.id}>{a.nota+' - '+a.nume}</option>)}
              </select>
              <input value={newProbStaff.titlu} onChange={e=>setNewProbStaff(p=>({...p,titlu:e.target.value}))}
                placeholder="Ce problema ai gasit? *"
                style={{width:'100%',background:'rgba(20,38,65,0.9)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,color:'rgba(214,228,244,0.8)',fontSize:14,padding:'12px 10px',outline:'none',marginBottom:10,boxSizing:'border-box'}}/>
              <textarea value={newProbStaff.descriere} onChange={e=>setNewProbStaff(p=>({...p,descriere:e.target.value}))}
                placeholder="Detalii (optional)..." rows={3}
                style={{width:'100%',background:'rgba(20,38,65,0.9)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,color:'rgba(214,228,244,0.8)',fontSize:14,padding:'12px 10px',outline:'none',marginBottom:10,resize:'none',fontFamily:'inherit',boxSizing:'border-box'}}/>
              <div style={{display:'flex',gap:8,marginBottom:10}}>
                {['normal','urgent','critic'].map(p=>(
                  <button key={p} onClick={()=>setNewProbStaff(prev=>({...prev,prioritate:p}))}
                    style={{flex:1,padding:'10px',borderRadius:10,
                    border:'1px solid '+(newProbStaff.prioritate===p?(p==='critic'?'rgba(248,113,113,0.5)':p==='urgent'?'rgba(251,146,60,0.5)':'rgba(77,163,255,0.5)'):'rgba(255,255,255,0.1)'),
                    background:newProbStaff.prioritate===p?(p==='critic'?'rgba(248,113,113,0.15)':p==='urgent'?'rgba(251,146,60,0.15)':'rgba(77,163,255,0.15)'):'transparent',
                    color:newProbStaff.prioritate===p?(p==='critic'?'#F87171':p==='urgent'?'#FB923C':'#7BC8FF'):'rgba(159,215,255,0.4)',
                    fontSize:12,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                    {p==='critic'?'Critic':p==='urgent'?'Urgent':'Normal'}
                  </button>
                ))}
              </div>
              <button onClick={addProblemaStaff} disabled={!newProbStaff.titlu||savingProb}
                style={{width:'100%',padding:'14px',borderRadius:12,border:'none',background:newProbStaff.titlu?'#FB923C':'rgba(159,215,255,0.08)',color:newProbStaff.titlu?'#fff':'rgba(159,215,255,0.3)',fontSize:15,fontWeight:700,cursor:newProbStaff.titlu?'pointer':'not-allowed',WebkitTapHighlightColor:'transparent'}}>
                {savingProb?'Se trimite...':'Trimite raportul'}
              </button>
            </div>
            {problemeStaff.map(p=>{
              const col=p.prioritate==='critic'?'#F87171':p.prioritate==='urgent'?'#FB923C':'#7BC8FF'
              return (
                <div key={p.id} style={{borderRadius:14,border:'1px solid '+col+'22',background:'rgba(11,22,42,0.6)',padding:'12px 14px',marginBottom:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,background:col+'18',color:col,fontWeight:700,textTransform:'uppercase'}}>{p.prioritate}</span>
                    {p.apartament&&<span style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>{p.apartament.nota}</span>}
                    <span style={{fontSize:10,color:'rgba(159,215,255,0.25)',marginLeft:'auto'}}>{p.status==='in_lucru'?'In lucru':'Deschis'}</span>
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:'#E8F4FF'}}>{p.titlu}</div>
                  {p.descriere&&<div style={{fontSize:12,color:'rgba(159,215,255,0.5)',marginTop:3}}>{p.descriere}</div>}
                </div>
              )
            })}
            {problemeStaff.length===0&&<div style={{textAlign:'center',padding:'24px 0',color:'rgba(159,215,255,0.25)',fontSize:13}}>Nicio problema deschisa</div>}
          </div>
        )}

        {/* CASĂ */}
        {tab==='casa'&&(
          <div>
            {/* Summary */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
              {[
                {l:'Încasat',v:casaTotalIn,c:'#4ADE80',bg:'rgba(74,222,128,0.08)',border:'rgba(74,222,128,0.2)'},
                {l:'Cheltuit',v:casaTotalOut,c:'#F87171',bg:'rgba(248,113,113,0.08)',border:'rgba(248,113,113,0.2)'},
                {l:'Sold',v:casaTotalIn-casaTotalOut,c:casaTotalIn-casaTotalOut>=0?'#7BC8FF':'#FCD34D',bg:'rgba(77,163,255,0.08)',border:'rgba(77,163,255,0.2)'},
              ].map(s=>(
                <div key={s.l} style={{borderRadius:10,padding:'10px 8px',background:s.bg,border:'1px solid '+s.border,textAlign:'center'}}>
                  <div style={{fontSize:16,fontWeight:800,fontFamily:'monospace',color:s.c}}>{s.v.toFixed(0)}</div>
                  <div style={{fontSize:10,color:'rgba(159,215,255,0.45)',marginTop:2}}>{s.l} RON</div>
                </div>
              ))}
            </div>

            {/* Butoane add */}
            <div style={{display:'flex',gap:8,marginBottom:14}}>
              <button onClick={()=>setCasaForm({open:true,tip:'incasare',suma:'',motiv:''})}
                style={{flex:1,padding:'13px',borderRadius:12,border:'1px solid rgba(74,222,128,0.4)',background:'rgba(74,222,128,0.1)',color:'#4ADE80',fontSize:14,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                + Încasare
              </button>
              <button onClick={()=>setCasaForm({open:true,tip:'cheltuiala',suma:'',motiv:''})}
                style={{flex:1,padding:'13px',borderRadius:12,border:'1px solid rgba(248,113,113,0.4)',background:'rgba(248,113,113,0.1)',color:'#F87171',fontSize:14,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                − Cheltuială
              </button>
            </div>

            {/* De preluat - trimise din Curatenie, neconfirmate inca */}
            {casaDePreluat.length>0&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#FCD34D',textTransform:'uppercase' as const,letterSpacing:'0.5px',marginBottom:8}}>💰 Bani de preluat</div>
                {casaDePreluat.map((e:any)=>(
                  <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 13px',borderRadius:10,background:'rgba(252,211,77,0.08)',border:'1px solid rgba(252,211,77,0.3)',marginBottom:7}}>
                    <span style={{fontSize:18,flexShrink:0}}>💰</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:'#FCD34D'}}>{Number(e.suma).toFixed(0)} RON{e.apartament?.nota?' · '+e.apartament.nota:''}</div>
                      <div style={{fontSize:11,color:'rgba(159,215,255,0.55)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.motiv}</div>
                    </div>
                    <button onClick={()=>confirmaPreluare(e.id)}
                      style={{flexShrink:0,padding:'8px 12px',borderRadius:9,border:'none',background:'#FCD34D',color:'#3A2A00',fontSize:12,fontWeight:700,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}>
                      ✓ Am preluat
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Lista */}
            {casaEntries.filter((e:any)=>e.preluat!==false).length===0
              ? <div style={{textAlign:'center',padding:'40px 0',color:'rgba(159,215,255,0.25)',fontSize:13}}>Nicio înregistrare azi</div>
              : casaEntries.filter((e:any)=>e.preluat!==false).map((e:any)=>{
                  const isIn = e.tip==='incasare'
                  return (
                    <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 13px',borderRadius:10,background:isIn?'rgba(74,222,128,0.06)':'rgba(248,113,113,0.06)',border:'1px solid '+(isIn?'rgba(74,222,128,0.2)':'rgba(248,113,113,0.2)'),marginBottom:7}}>
                      <span style={{fontSize:18,flexShrink:0}}>{isIn?'📥':'📤'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:isIn?'#4ADE80':'#F87171'}}>{isIn?'+':'-'}{Number(e.suma).toFixed(0)} RON{e.apartament?.nota?' · '+e.apartament.nota:''}</div>
                        <div style={{fontSize:11,color:'rgba(159,215,255,0.55)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.motiv}</div>
                      </div>
                      <div style={{fontSize:10,color:'rgba(159,215,255,0.3)',flexShrink:0,textAlign:'right'}}>
                        {new Date(e.created_at).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'})}
                      </div>
                      <button onClick={()=>deleteCasaEntry(e.id)}
                        style={{background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.2)',fontSize:18,padding:'2px 4px',flexShrink:0,lineHeight:1}}>×</button>
                    </div>
                  )
                })
            }

            {/* Modal adaugare */}
            {casaForm.open&&(
              <div style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'flex-end'}} onClick={()=>setCasaForm(f=>({...f,open:false}))}>
                <div style={{background:'#0B1220',border:'1px solid rgba(159,215,255,0.15)',borderRadius:'20px 20px 0 0',padding:`20px 20px calc(20px + env(safe-area-inset-bottom, 0px))`,width:'100%'}} onClick={e=>e.stopPropagation()}>
                  <div style={{width:36,height:4,background:'rgba(159,215,255,0.15)',borderRadius:2,margin:'0 auto 16px'}}/>
                  <div style={{fontSize:16,fontWeight:700,color:casaForm.tip==='incasare'?'#4ADE80':'#F87171',marginBottom:16}}>
                    {casaForm.tip==='incasare'?'📥 Încasare cash':'📤 Cheltuială cash'}
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,color:'rgba(159,215,255,0.45)',marginBottom:5}}>Sumă (RON)</div>
                    <input type="number" inputMode="decimal" placeholder="0" value={casaForm.suma}
                      onChange={e=>setCasaForm(f=>({...f,suma:e.target.value}))}
                      style={{width:'100%',background:'rgba(14,27,43,0.8)',border:'1px solid rgba(159,215,255,0.2)',borderRadius:10,color:'#F0F8FF',fontSize:24,fontWeight:700,padding:'12px 14px',outline:'none',boxSizing:'border-box' as const,fontFamily:'monospace'}}
                      autoFocus/>
                  </div>
                  <div style={{marginBottom:16}}>
                    <div style={{fontSize:11,color:'rgba(159,215,255,0.45)',marginBottom:5}}>Motiv / Descriere</div>
                    <input type="text" placeholder={casaForm.tip==='incasare'?'ex: plata cash rezervare':'ex: consumabile curăță'} value={casaForm.motiv}
                      onChange={e=>setCasaForm(f=>({...f,motiv:e.target.value}))}
                      onKeyDown={e=>{if(e.key==='Enter') saveCasa()}}
                      style={{width:'100%',background:'rgba(14,27,43,0.8)',border:'1px solid rgba(159,215,255,0.2)',borderRadius:10,color:'#F0F8FF',fontSize:14,padding:'12px 14px',outline:'none',boxSizing:'border-box' as const}}/>
                  </div>
                  <button onClick={saveCasa} disabled={casaSaving||!casaForm.suma||!casaForm.motiv}
                    style={{width:'100%',padding:'15px',borderRadius:13,border:'none',background:casaForm.tip==='incasare'?'#22C55E':'#EF4444',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',opacity:!casaForm.suma||!casaForm.motiv?0.5:1}}>
                    {casaSaving?'Se salvează...':'Salvează'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CALENDAR */}
        {tab==='calendar'&&(
          <div>
            <div style={{fontSize:12,fontWeight:600,color:'rgba(159,215,255,0.4)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:12}}>{'7 zile: '+fmtFull(addDays(data,-1))+' - '+fmtFull(addDays(data,5))}</div>
            {apts.map(apt=>(
              <div key={apt.id} style={{marginBottom:8,borderRadius:12,overflow:'hidden',border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)'}}>
                <div style={{padding:'8px 12px',background:'rgba(11,22,42,0.6)',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#E8F4FF',minWidth:42}}>{apt.nota}</span>
                  <span style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>{apt.nume}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
                  {calDays.map(zi=>{
                    const rez=calData.find((r:any)=>r.apartament_id===apt.id&&r.data_checkin<=zi&&r.data_checkout>zi)
                    const isToday=zi===todayStr()
                    const isSelected=zi===data
                    return (
                      <div key={zi} onClick={()=>setData(zi)}
                        style={{padding:'8px 4px',textAlign:'center',cursor:'pointer',background:rez?'rgba(248,113,113,0.2)':'transparent',borderLeft:'1px solid rgba(255,255,255,0.05)',borderBottom:isSelected?'2px solid #7BC8FF':'2px solid transparent'}}>
                        <div style={{fontSize:9,color:isToday?'#4ADE80':isSelected?'#7BC8FF':'rgba(159,215,255,0.35)',fontWeight:isToday||isSelected?700:400,marginBottom:2}}>{fmtFull(zi).slice(0,3)}</div>
                        <div style={{fontSize:10,color:isToday?'#4ADE80':isSelected?'#7BC8FF':'rgba(159,215,255,0.5)',fontWeight:isToday?700:400}}>{zi.slice(8)}</div>
                        {rez&&<div style={{fontSize:8,color:'rgba(248,113,113,0.8)',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',padding:'0 2px'}}>{rez.nume_client?.split(' ')[0]}</div>}
                        {!rez&&<div style={{fontSize:14,marginTop:1}}>🟢</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* WA GATA CURATENIE */}
      {waGataInfo&&(
        <div style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setWaGataInfo(null)}>
          <div style={{background:'#0B1220',border:'1px solid rgba(74,222,128,0.3)',borderRadius:'20px 20px 0 0',padding:`20px 20px calc(20px + env(safe-area-inset-bottom, 0px))`,width:'100%',maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,background:'rgba(159,215,255,0.2)',borderRadius:2,margin:'0 auto 16px'}}/>
            <div style={{fontSize:16,fontWeight:700,color:'#4ADE80',marginBottom:4}}>✅ Curățenie gata!</div>
            <div style={{fontSize:13,color:'rgba(159,215,255,0.5)',marginBottom:14}}>Check-in azi — trimite WA clientului?</div>
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
      )}
    </div>
  )
}
