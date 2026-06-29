'use client'
import { useEffect, useState } from 'react'
import { supabase, Apartament, Proprietar } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog, ConnectionError } from '@/components/ui'
import { Plus, Building2, Edit2, Trash2, ExternalLink, Copy, MapPin, Check, Calculator, ChevronDown, ChevronUp, X, ChevronRight } from 'lucide-react'

const SC: Record<string,string> = { activ:'#22C55E', inactiv:'#EF4444', mentenanta:'#F59E0B' }
const CTL: Record<string,string> = { procent_brut:'% brut', procent_net_platforme:'% net platf.', procent_net_dupa_costuri:'% net costuri', fix_lunar:'Fix lunar', mixt:'Fix+%' }
const pad = (n: number) => String(n).padStart(2,'0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const tomorrow = (d: Date) => { const t = new Date(d); t.setDate(t.getDate()+1); return fmtDate(t) }

function withToday(url: string, platform: 'booking'|'airbnb'): string {
  if (!url) return url
  const today = fmtDate(new Date())
  const tom = tomorrow(new Date())
  
  if (platform === 'airbnb') {
    // Extrage doar /rooms/ID din URL, ignora parametrii existenti
    const roomMatch = url.match(/\/rooms\/(\d+)/)
    if (roomMatch) {
      return `https://www.airbnb.com.ro/rooms/${roomMatch[1]}?check_in=${today}&check_out=${tom}&adults=2`
    }
    // Fallback: curata parametrii si adauga date
    const baseUrl = url.split('?')[0]
    return `${baseUrl}?check_in=${today}&check_out=${tom}&adults=2`
  }
  
  if (platform === 'booking') {
    const sep = url.includes('?') ? '&' : '?'
    if (!url.includes('checkin='))
      return url + sep + `checkin=${today}&checkout=${tom}&group_adults=2&no_rooms=1`
  }
  
  return url
}

const empty: Partial<Apartament> & { chirie_suma?: number; chirie_moneda?: string } = { nume:'', adresa:'', zona:'', nr_camere:2, capacitate_max:4, pret_standard:0, proprietar_id:'', comision_tip:'procent_net_dupa_costuri', comision_procent:20, comision_fix:0, link_airbnb:'', link_booking:'', link_site:'', instructiuni_checkin:'', reguli:'', status:'activ', nota:'', utilitati_la_proprietar:false, chirie_suma:0, chirie_moneda:'RON', cod_locker:'' }

function CopyBtn({ text }: { text: string }) {
  const [c, setC] = useState(false)
  return (
    <button onClick={e=>{ e.stopPropagation(); navigator.clipboard.writeText(text).catch(()=>{}); setC(true); setTimeout(()=>setC(false),1400) }}
      style={{ background:'none', border:'none', cursor:'pointer', padding:'1px 4px', color:c?'#4ADE80':'rgba(159,215,255,0.35)', display:'inline-flex', alignItems:'center', borderRadius:3, flexShrink:0 }}>
      {c?<Check size={10}/>:<Copy size={10}/>}
    </button>
  )
}

function Calc({ apt }: { apt: any }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [chirie, setChirie] = useState(0)
  const [chirieEUR, setChirieEUR] = useState(0)
  const [chirieMoneda, setChirieMoneda] = useState('RON')
  const [cursEUR, setCursEUR] = useState(5.0)
  const [eonCurent, setEonCurent] = useState(0)
  const [eonGaz, setEonGaz] = useState(0)
  const [asociatie, setAsociatie] = useState(0)
  const [internet, setInternet] = useState(0)
  const [alteFix, setAlteFix] = useState(0)
  const [curatenie, setCuratenie] = useState(200)
  const [consumabile, setConsumabile] = useState(100)
  const [lenjerii, setLenjerii] = useState(80)
  const [altVar, setAltVar] = useState(0)
  const [zile, setZile] = useState(25)
  const [loadingCh, setLoadingCh] = useState(false)

  async function preiadinCheltuieli() {
    setLoadingCh(true)
    const now = new Date()
    const an = now.getFullYear()
    const luna = now.getMonth() + 1
    const primaZi = an+'-'+pad(luna)+'-01'
    const ultimaZi = new Date(an, luna, 0).toISOString().slice(0,10)

    // Preia curs BNR
    let curs = 5.0
    try {
      const res = await fetch('/api/curs-bnr')
      const data = await res.json()
      if(data?.curs) curs = data.curs
    } catch {}
    setCursEUR(curs)

    // Preia chiria fixa din chirii_fixe
    const { data: chirieData } = await supabase.from('chirii_fixe')
      .select('suma,moneda').eq('apartament_id', apt.id).eq('activ', true).maybeSingle()
    if(chirieData) {
      setChirieMoneda(chirieData.moneda)
      if(chirieData.moneda === 'EUR') {
        setChirieEUR(chirieData.suma)
        setChirie(Math.round(chirieData.suma * curs))
      } else {
        setChirie(chirieData.suma)
        setChirieEUR(0)
      }
    }

    // Preia cheltuielile reale din luna curenta
    const { data } = await supabase.from('cheltuieli')
      .select('categorie,valoare')
      .eq('apartament_id', apt.id)
      .gte('data', primaZi)
      .lte('data', ultimaZi)
    if (data && data.length > 0) {
      const sum = (cat: string) => data
        .filter((x:any) => x.categorie === cat)
        .reduce((s:number,x:any) => s + Number(x.valoare||0), 0)
      const eon = sum('eon_curent') + sum('eon_duo')
      const gaz = sum('eon_gaz')
      const asoc = sum('asociatie')
      const inet = sum('internet')
      if(eon > 0) setEonCurent(Math.round(eon))
      if(gaz > 0) setEonGaz(Math.round(gaz))
      if(asoc > 0) setAsociatie(Math.round(asoc))
      if(inet > 0) setInternet(Math.round(inet))
    }
    setLoaded(true)
    setLoadingCh(false)
  }

  // Auto-load on open
  const handleOpen = () => {
    const newOpen = !open
    setOpen(newOpen)
    if(newOpen && !loaded) preiadinCheltuieli()
  }

  const totalFix = Number(chirie)+Number(eonCurent)+Number(eonGaz)+Number(asociatie)+Number(internet)+Number(alteFix)
  const totalVar = Number(curatenie)+Number(consumabile)+Number(lenjerii)+Number(altVar)
  const totalLuna = totalFix+totalVar
  const costN = zile>0?Math.round(totalLuna/zile):0
  const p15=Math.round(costN*1.15), p25=Math.round(costN*1.25), p40=Math.round(costN*1.40)
  const pBooking=Math.round(p25/0.83), pAirbnb=Math.round(p25/0.85), pDirect=p25

  const inp: React.CSSProperties={width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(159,215,255,0.1)',borderRadius:6,color:'#fff',fontSize:12,padding:'5px 8px',outline:'none',boxSizing:'border-box' as const}
  const lbl: React.CSSProperties={fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:3,textTransform:'uppercase' as const,letterSpacing:'.05em'}

  return (
    <div style={{ borderTop:'1px solid rgba(159,215,255,0.07)', marginTop:8, paddingTop:12 }}>
      <button onClick={handleOpen} style={{ display:'flex', alignItems:'center', gap:7, background:'rgba(77,163,255,0.06)', border:'1px solid rgba(77,163,255,0.15)', borderRadius:8, padding:'8px 12px', cursor:'pointer', color:'rgba(159,215,255,0.7)', fontSize:11, width:'100%', fontWeight:600 }}>
        <Calculator size={12}/>
        <span>Calculator preț & rentabilitate</span>
        {costN > 0 && !open && <span style={{ marginLeft:'auto', fontSize:12, fontWeight:700, color:'#4ADE80', fontFamily:'monospace' }}>{costN} RON/n minim</span>}
        <span style={{ marginLeft:costN>0&&!open?4:'auto' }}>{open?<ChevronUp size={11}/>:<ChevronDown size={11}/>}</span>
      </button>

      {open && (
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:10 }}>

          {/* Preț minim hero */}
          {costN > 0 && (
            <div style={{ background:'linear-gradient(135deg,rgba(74,222,128,0.1),rgba(77,163,255,0.08))', border:'1px solid rgba(74,222,128,0.25)', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:10, color:'rgba(74,222,128,0.7)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>Preț minim/noapte</div>
                <div style={{ fontSize:28, fontWeight:800, color:'#4ADE80', fontFamily:'monospace', lineHeight:1 }}>{costN} <span style={{ fontSize:13, fontWeight:500, color:'rgba(74,222,128,0.6)' }}>RON</span></div>
                <div style={{ fontSize:10, color:'rgba(159,215,255,0.4)', marginTop:3 }}>Total lună: {totalLuna.toLocaleString('ro-RO')} RON / {zile} zile</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:9, color:'rgba(159,215,255,0.35)', marginBottom:6 }}>Prețuri de listat</div>
                <div style={{ display:'flex', gap:6 }}>
                  {([['Booking',pBooking,'#60A5FA'],['Airbnb',pAirbnb,'#F87171'],['Direct',pDirect,'#4ADE80']] as any[]).map(([l,v,col])=>(
                    <div key={l} style={{ background:'rgba(255,255,255,0.04)', borderRadius:6, padding:'4px 8px', textAlign:'center' }}>
                      <div style={{ fontSize:8, color:'rgba(159,215,255,0.35)' }}>{l}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:col, fontFamily:'monospace' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Reîncarcă cheltuieli */}
          <button onClick={preiadinCheltuieli} disabled={loadingCh}
            style={{ fontSize:11, padding:'6px 12px', borderRadius:7, border:'1px solid rgba(77,163,255,0.25)', background:'rgba(77,163,255,0.08)', color:'#7BC8FF', cursor:'pointer', opacity:loadingCh?0.6:1, display:'flex', alignItems:'center', gap:6 }}>
            {loadingCh ? '⏳ Se încarcă...' : '↓ Reîncarcă din Cheltuieli luna curentă'}
          </button>

          {/* Cheltuieli fixe */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:'rgba(77,163,255,0.7)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Cheltuieli fixe / lună</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {([[chirieMoneda==='EUR'?'Chirie ('+chirieEUR+' EUR × '+cursEUR.toFixed(2)+')':'Chirie/Rată',chirie,setChirie],['E.ON Energie',eonCurent,setEonCurent],['E.ON Gaz',eonGaz,setEonGaz],['Asociație',asociatie,setAsociatie],['Internet',internet,setInternet],['Altele fixe',alteFix,setAlteFix]] as any[]).map(([l,v,s])=>(
                <div key={l}><div style={lbl}>{l}</div><input type="number" value={v} onChange={e=>s(Number(e.target.value))} style={inp}/></div>
              ))}
            </div>
          </div>

          {/* Cheltuieli variabile */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:'rgba(252,211,77,0.7)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Cheltuieli variabile / lună</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {([['Curățenie',curatenie,setCuratenie],['Consumabile',consumabile,setConsumabile],['Lenjerii',lenjerii,setLenjerii],['Altele var.',altVar,setAltVar]] as any[]).map(([l,v,s])=>(
                <div key={l}><div style={lbl}>{l}</div><input type="number" onChange={e=>s(Number(e.target.value))} value={v} style={inp}/></div>
              ))}
            </div>
          </div>

          {/* Zile ocupate + totale */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
            <div><div style={lbl}>Zile ocupate/lună</div><input type="number" value={zile} onChange={e=>setZile(Number(e.target.value))} style={inp}/></div>
            <div style={{ background:'rgba(77,163,255,0.06)',border:'1px solid rgba(77,163,255,0.12)',borderRadius:6,padding:'5px 8px' }}>
              <div style={{ fontSize:9, color:'rgba(159,215,255,0.35)' }}>FIXE/LUNĂ</div>
              <div style={{ fontSize:12, fontWeight:700, color:'#7BC8FF', fontFamily:'monospace' }}>{totalFix.toLocaleString('ro-RO')}</div>
            </div>
            <div style={{ background:'rgba(252,211,77,0.06)',border:'1px solid rgba(252,211,77,0.12)',borderRadius:6,padding:'5px 8px' }}>
              <div style={{ fontSize:9, color:'rgba(159,215,255,0.35)' }}>VAR/LUNĂ</div>
              <div style={{ fontSize:12, fontWeight:700, color:'#FCD34D', fontFamily:'monospace' }}>{totalVar.toLocaleString('ro-RO')}</div>
            </div>
          </div>

          {/* Scenarii profitabilitate */}
          <div style={{ background:'rgba(14,27,43,0.7)',border:'1px solid rgba(159,215,255,0.1)',borderRadius:8,padding:'10px 12px' }}>
            <div style={{ fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:8 }}>Scenarii profitabilitate (net după comisioane platforme)</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5 }}>
              {([['Break-even',costN,'rgba(159,215,255,0.5)',0],['+15%',p15,'#7BC8FF',Math.round((p15-costN)*zile)],['+25%',p25,'#4DA3FF',Math.round((p25-costN)*zile)],['+40%',p40,'#4ADE80',Math.round((p40-costN)*zile)]] as any[]).map(([l,v,col,profit])=>(
                <div key={l} style={{ background:'rgba(255,255,255,0.03)',borderRadius:6,padding:'7px 8px',textAlign:'center' as const }}>
                  <div style={{ fontSize:9, color:'rgba(159,215,255,0.35)', marginBottom:2 }}>{l}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:col, fontFamily:'monospace' }}>{v}</div>
                  {profit > 0 && <div style={{ fontSize:8, color:col, marginTop:2, opacity:0.7 }}>+{profit.toLocaleString('ro-RO')}/lună</div>}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

export default function ApartamentePage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [proprietari, setProprietari] = useState<Proprietar[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string|null>(null)
  const [editing, setEditing] = useState<Partial<Apartament> & { chirie_suma?: number; chirie_moneda?: string }>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const { toast, show } = useToast()

  useEffect(()=>{ load() },[])

  async function load() {
    setLoading(true)
    setLoadError(false)
    const bail=setTimeout(()=>{ setLoading(false); setLoadError(true) },20000)
    try{
      const [{ data:apt },{ data:prop }] = await Promise.all([
        supabase.from('apartamente').select('*, proprietar:proprietari(id,nume)').order('nota').order('nume'),
        supabase.from('proprietari').select('id,nume').order('nume'),
      ])
      setApartamente((apt as Apartament[])||[])
      setProprietari((prop as Proprietar[])||[])
      clearTimeout(bail)
    }catch(err){console.error('[apartamente load]',err);clearTimeout(bail);setLoadError(true)}
    setLoading(false)
  }

  function openNew(){ setEditing(empty); setEditOpen(true) }
  async function openEdit(a:Apartament){
    setEditing({...a, chirie_suma:0, chirie_moneda:'RON'})
    setEditOpen(true)
    const { data: chirieData } = await supabase.from('chirii_fixe')
      .select('suma,moneda').eq('apartament_id', a.id).eq('activ', true).maybeSingle()
    if (chirieData) setEditing((prev:any) => ({ ...prev, chirie_suma: chirieData.suma, chirie_moneda: chirieData.moneda }))
  }

  async function toggleAptStatus(id:string, newStatus:string){
    await supabase.from('apartamente').update({status:newStatus}).eq('id',id)
    setApartamente((list:any[])=>list.map(a=>a.id===id?{...a,status:newStatus}:a))
  }

  async function save(){
    if(!editing.nume||!editing.adresa){ show('error','Completează numele și adresa'); return }
    setSaving(true)
    const p: any={ mesaj_checkin:editing.mesaj_checkin||null, mesaj_checkout:editing.mesaj_checkout||null, booking_links:(editing as any).booking_links||null, airbnb_links:(editing as any).airbnb_links||null, nume:editing.nume, adresa:editing.adresa, zona:editing.zona||null, nr_camere:editing.nr_camere, capacitate_max:editing.capacitate_max, pret_standard:editing.pret_standard, proprietar_id:editing.proprietar_id||null, comision_tip:editing.comision_tip, comision_procent:editing.comision_procent, comision_fix:editing.comision_fix, link_airbnb:editing.link_airbnb||null, link_booking:editing.link_booking||null, link_site:editing.link_site||null, instructiuni_checkin:editing.instructiuni_checkin||null, reguli:editing.reguli||null, status:editing.status, nota:editing.nota||null, utilitati_la_proprietar:!!(editing as any).utilitati_la_proprietar, cod_locker:(editing as any).cod_locker||null }
    const aptId = editing.id
    const { data: savedApt, error } = editing.id
      ? await supabase.from('apartamente').update(p).eq('id',editing.id).select('id').single()
      : await supabase.from('apartamente').insert(p).select('id').single()
    if(error){ show('error',error.message); setSaving(false); return }
    const finalAptId = aptId || savedApt?.id
    if (finalAptId) {
      const chirieSuma = Number((editing as any).chirie_suma) || 0
      const chirieMoneda = (editing as any).chirie_moneda || 'RON'
      const { data: existingChirie } = await supabase.from('chirii_fixe')
        .select('id').eq('apartament_id', finalAptId).eq('activ', true).maybeSingle()
      if (chirieSuma > 0) {
        if (existingChirie) await supabase.from('chirii_fixe').update({ suma: chirieSuma, moneda: chirieMoneda }).eq('id', existingChirie.id)
        else await supabase.from('chirii_fixe').insert({ apartament_id: finalAptId, suma: chirieSuma, moneda: chirieMoneda, activ: true })
      } else if (existingChirie) {
        await supabase.from('chirii_fixe').update({ activ: false }).eq('id', existingChirie.id)
      }
    }
    show('success',editing.id?'Actualizat':'Adăugat')
    setEditOpen(false); setSaving(false); load()
  }

  async function del(){
    if(!deleteId) return
    setDeleting(true)
    await supabase.from('apartamente').delete().eq('id',deleteId)
    show('success','Șters')
    if(selectedId===deleteId) setSelectedId(null)
    setDeleteId(null); setDeleting(false); load()
  }

  const filtered = apartamente.filter(a=> !search || a.nume.toLowerCase().includes(search.toLowerCase()) || (a.nota||'').toLowerCase().includes(search.toLowerCase()) || a.adresa.toLowerCase().includes(search.toLowerCase()))
  const myApts = filtered.filter(a=>a.nota)
  const otherApts = filtered.filter(a=>!a.nota)
  const selected = apartamente.find(a=>a.id===selectedId) as any

  if(loading) return (<><PageHeader title="Apartamente"/><PageLoading/></>)
  if(loadError) return (<><PageHeader title="Apartamente"/><ConnectionError onRetry={()=>load()}/></>)

  return (
    <>
      <PageHeader title="Apartamente" subtitle={`${apartamente.length} locații`}
        actions={
          <div style={{ display:'flex', gap:8 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Caută..." style={{ width:180, padding:'6px 12px', fontSize:12 }}/>
            <Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Nou</Button>
          </div>
        }
      />

      <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', flex:1, minHeight:0 }}>

        {/* LEFT — list */}
        <div style={{ overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
          {apartamente.length===0 ? (
            <EmptyState icon={<Building2 size={40}/>} title="Niciun apartament" action={<Button variant="primary" icon={<Plus size={13}/>} onClick={openNew}>Adaugă</Button>}/>
          ) : (
            <>
              {myApts.length>0 && (
                <div>
                  <div style={{ fontSize:9, fontWeight:600, color:'rgba(159,215,255,0.25)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6, paddingLeft:2 }}>AB Homes · {myApts.length}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                    {myApts.map(a=><MiniCard key={a.id} a={a} selected={selectedId===a.id} onClick={()=>setSelectedId(selectedId===a.id?null:a.id)} onToggle={toggleAptStatus}/>)}
                  </div>
                </div>
              )}
              {otherApts.length>0 && (
                <div>
                  <div style={{ fontSize:9, fontWeight:600, color:'rgba(159,215,255,0.25)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:6, paddingLeft:2 }}>Alte locații · {otherApts.length}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6 }}>
                    {otherApts.map(a=><MiniCard key={a.id} a={a} selected={selectedId===a.id} onClick={()=>setSelectedId(selectedId===a.id?null:a.id)} onToggle={toggleAptStatus}/>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT — detail panel */}
        {selected && (
          <div style={{ borderLeft:'1px solid rgba(159,215,255,0.1)', background:'rgba(14,27,43,0.5)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', overflowY:'auto', padding:'18px 18px 24px', display:'flex', flexDirection:'column', gap:14 }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                  {selected.nota && <span style={{ background:'rgba(77,163,255,0.18)', border:'1px solid rgba(77,163,255,0.3)', borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:700, color:'#4DA3FF', fontFamily:'monospace' }}>{selected.nota}</span>}
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:`${SC[selected.status]||'#94A3B8'}18`, color:SC[selected.status]||'#94A3B8', border:`1px solid ${SC[selected.status]||'#94A3B8'}28` }}>{selected.status}</span>
                </div>
                <div style={{ fontSize:15, fontWeight:700, color:'#FFFFFF', letterSpacing:-0.2, marginBottom:4 }}>{selected.nume}</div>
                <div style={{ display:'flex', alignItems:'center', gap:3, fontSize:11, color:'rgba(159,215,255,0.45)' }}>
                  <MapPin size={10}/><span>{selected.adresa}</span><CopyBtn text={selected.adresa}/>
                </div>
              </div>
              <button onClick={()=>setSelectedId(null)} style={{ background:'rgba(159,215,255,0.07)', border:'1px solid rgba(159,215,255,0.12)', borderRadius:6, width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'rgba(159,215,255,0.5)', flexShrink:0 }}>
                <X size={12}/>
              </button>
            </div>

            {/* Stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 }}>
              {[{l:'Camere',v:selected.nr_camere,c:'#FFFFFF'},{l:'Pers.',v:selected.capacitate_max,c:'#FFFFFF'},{l:'RON/n',v:selected.pret_standard,c:'#4DA3FF'}].map(s=>(
                <div key={s.l} style={{ background:'rgba(14,27,43,0.6)', borderRadius:8, padding:'8px', textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:700, fontFamily:'monospace', color:s.c, lineHeight:1 }}>{s.v}</div>
                  <div style={{ fontSize:9, color:'rgba(159,215,255,0.35)', marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Links */}
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {((selected as any).airbnb_links as string[]||[]).filter(Boolean).map((lnk:string,i:number)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <a href={withToday(lnk, lnk.includes('airbnb') ? 'airbnb' : 'booking')} target="_blank" rel="noopener" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:'#F87171', textDecoration:'none' }}>
                    <ExternalLink size={10}/> Airbnb ({i+2})
                  </a>
                  <CopyBtn text={lnk}/>
                </div>
              ))}
              {selected.link_site && (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <a href={selected.link_site} target="_blank" rel="noopener" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'5px 10px', borderRadius:6, background:'rgba(77,163,255,0.1)', color:'#7BC8FF', border:'1px solid rgba(77,163,255,0.18)', textDecoration:'none', flex:1 }}>
                    <ExternalLink size={10}/> Site AB Homes
                  </a>
                  <CopyBtn text={selected.link_site}/>
                </div>
              )}
              {selected.link_booking && (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ fontSize:10, color:'rgba(252,211,77,0.5)', marginRight:4 }}>🏨</div>
                  <a href={withToday(selected.link_booking,'booking')} target="_blank" rel="noopener" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:'#FCD34D', textDecoration:'none' }}>
                    <MapPin size={10}/> Google Maps
                  </a>
                  <CopyBtn text={selected.link_booking}/>
                </div>
              )}
              {((selected as any).booking_links as string[]||[]).filter(Boolean).map((lnk:string,i:number)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <a href={withToday(lnk, lnk.includes('airbnb') ? 'airbnb' : 'booking')} target="_blank" rel="noopener" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:'#60A5FA', textDecoration:'none' }}>
                    <ExternalLink size={10}/> Booking.com {i>0?`(${i+1})`:''}
                  </a>
                  <CopyBtn text={lnk}/>
                </div>
              ))}
              {selected.link_airbnb && (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <a href={withToday(selected.link_airbnb,'airbnb')} target="_blank" rel="noopener" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'5px 10px', borderRadius:6, background:'rgba(239,68,68,0.1)', color:'#F87171', border:'1px solid rgba(239,68,68,0.18)', textDecoration:'none', flex:1 }}>
                    <ExternalLink size={10}/> Airbnb
                  </a>
                  <CopyBtn text={selected.link_airbnb}/>
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ display:'flex', flexDirection:'column', gap:6, fontSize:12 }}>
              {(selected as any).cod_locker && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderRadius:8, background:'rgba(252,211,77,0.08)', border:'1px solid rgba(252,211,77,0.2)' }}>
                  <span style={{ color:'#FCD34D', fontWeight:600 }}>🔒 Cod locker</span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ color:'#FCD34D', fontFamily:'monospace', fontSize:16, fontWeight:700, letterSpacing:2 }}>{(selected as any).cod_locker}</span>
                    <CopyBtn text={(selected as any).cod_locker}/>
                  </div>
                </div>
              )}
              {selected.proprietar?.nume && (
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'rgba(159,215,255,0.4)' }}>Proprietar</span>
                  <span style={{ color:'#FFFFFF', fontWeight:500 }}>{selected.proprietar.nume}</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'rgba(159,215,255,0.4)' }}>Comision</span>
                <span style={{ color:'#4ADE80', fontFamily:'monospace' }}>{selected.comision_procent}% · {CTL[selected.comision_tip]||selected.comision_tip}</span>
              </div>
              {selected.dotari?.length>0 && (
                <div>
                  <div style={{ color:'rgba(159,215,255,0.4)', marginBottom:3 }}>Dotări</div>
                  <div style={{ fontSize:11, color:'rgba(214,228,244,0.6)', lineHeight:1.6 }}>{Array.isArray(selected.dotari)?selected.dotari.join(', '):selected.dotari}</div>
                </div>
              )}
              {selected.mesaj_checkin && (
                <div style={{ margin:'8px 0', padding:'10px 12px', background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.15)', borderRadius:8 }}>
                  <div style={{ fontSize:10, color:'#4ADE80', fontWeight:600, marginBottom:4 }}>💬 Mesaj CI personalizat</div>
                  <div style={{ fontSize:11, color:'rgba(214,228,244,0.65)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{selected.mesaj_checkin}</div>
                </div>
              )}
              {selected.mesaj_checkout && (
                <div style={{ margin:'8px 0', padding:'10px 12px', background:'rgba(192,132,252,0.06)', border:'1px solid rgba(192,132,252,0.15)', borderRadius:8 }}>
                  <div style={{ fontSize:10, color:'#C084FC', fontWeight:600, marginBottom:4 }}>💬 Mesaj CO personalizat</div>
                  <div style={{ fontSize:11, color:'rgba(214,228,244,0.65)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{selected.mesaj_checkout}</div>
                </div>
              )}
              {selected.instructiuni_checkin && (
                <div>
                  <div style={{ color:'rgba(159,215,255,0.4)', marginBottom:3 }}>Check-in</div>
                  <div style={{ fontSize:11, color:'rgba(214,228,244,0.6)', lineHeight:1.6 }}>{selected.instructiuni_checkin}</div>
                </div>
              )}
              {selected.reguli && (
                <div>
                  <div style={{ color:'rgba(159,215,255,0.4)', marginBottom:3 }}>Reguli</div>
                  <div style={{ fontSize:11, color:'rgba(214,228,244,0.6)', lineHeight:1.6 }}>{selected.reguli}</div>
                </div>
              )}
            </div>

            <Calc apt={selected}/>

            {/* Actions */}
            <div style={{ display:'flex', gap:7, marginTop:'auto', paddingTop:8 }}>
              <Button variant="primary" size="sm" icon={<Edit2 size={12}/>} onClick={()=>openEdit(selected as Apartament)} style={{ flex:1 }}>Editează</Button>
              <Button variant="danger" size="sm" icon={<Trash2 size={12}/>} onClick={()=>setDeleteId(selected.id)}>Șterge</Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={()=>setEditOpen(false)} title={editing.id?'Editează apartament':'Apartament nou'} width="620px">
        <FormRow cols={2}>
          <FormGroup><label>Cod intern</label><input value={editing.nota||''} onChange={e=>setEditing({...editing,nota:e.target.value})} placeholder="L99, HD02..."/></FormGroup>
          <FormGroup><label>Status</label>
            <select value={editing.status||'activ'} onChange={e=>setEditing({...editing,status:e.target.value})}>
              <option value="activ">Activ</option><option value="inactiv">Inactiv</option><option value="mentenanta">Mentenanță</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Nume *</label><input value={editing.nume||''} onChange={e=>setEditing({...editing,nume:e.target.value})} placeholder="Ex: Airy Palas"/></FormGroup>
          <FormGroup><label>Zonă</label><input value={editing.zona||''} onChange={e=>setEditing({...editing,zona:e.target.value})} placeholder="Palas, Copou..."/></FormGroup>
        </FormRow>
        <FormGroup><label>Adresă *</label><input value={editing.adresa||''} onChange={e=>setEditing({...editing,adresa:e.target.value})} placeholder="Stradă, complex..."/></FormGroup>
        <FormRow cols={3}>
          <FormGroup><label>Camere</label><input type="number" value={editing.nr_camere||2} onChange={e=>setEditing({...editing,nr_camere:parseInt(e.target.value)||1})} min={1}/></FormGroup>
          <FormGroup><label>Max pers.</label><input type="number" value={editing.capacitate_max||4} onChange={e=>setEditing({...editing,capacitate_max:parseInt(e.target.value)||1})} min={1}/></FormGroup>
          <FormGroup><label>Preț (RON/n)</label><input type="number" value={editing.pret_standard||0} onChange={e=>setEditing({...editing,pret_standard:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
        </FormRow>
        <FormGroup><label>🔒 Cod locker</label>
          <input value={(editing as any).cod_locker||''} maxLength={10} inputMode="numeric" placeholder="ex: 4821"
            onChange={e=>setEditing({...editing,cod_locker:e.target.value.replace(/\D/g,'').slice(0,10)} as any)}/>
        </FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Proprietar</label>
            <select value={editing.proprietar_id||''} onChange={e=>setEditing({...editing,proprietar_id:e.target.value||undefined})}>
              <option value="">— Fără —</option>
              {proprietari.map(p=><option key={p.id} value={p.id}>{p.nume}</option>)}
            </select>
          </FormGroup>
          <FormGroup><label>Tip comision</label>
            <select value={editing.comision_tip||'procent_net_dupa_costuri'} onChange={e=>setEditing({...editing,comision_tip:e.target.value})}>
              <option value="procent_brut">% din brut</option>
              <option value="procent_net_platforme">% net platforme</option>
              <option value="procent_net_dupa_costuri">% net după costuri</option>
              <option value="fix_lunar">Fix lunar</option>
              <option value="mixt">Mixt</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Procent (%)</label><input type="number" value={editing.comision_procent||20} onChange={e=>setEditing({...editing,comision_procent:parseFloat(e.target.value)||0})} min={0} max={100}/></FormGroup>
          <FormGroup><label>Fix (RON)</label><input type="number" value={editing.comision_fix||0} onChange={e=>setEditing({...editing,comision_fix:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
        </FormRow>

        <div style={{ marginTop: 4, marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(77,163,255,0.05)', border: '1px solid rgba(77,163,255,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(159,215,255,0.6)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Plată chirie către proprietar</div>
          <FormRow cols={2}>
            <FormGroup><label>Chirie / lună</label><input type="number" value={(editing as any).chirie_suma||0} onChange={e=>setEditing({...editing,chirie_suma:parseFloat(e.target.value)||0} as any)} min={0}/></FormGroup>
            <FormGroup><label>Monedă</label>
              <select value={(editing as any).chirie_moneda||'RON'} onChange={e=>setEditing({...editing,chirie_moneda:e.target.value} as any)}>
                <option value="RON">RON</option>
                <option value="EUR">EUR (convertit automat la curs BNR)</option>
              </select>
            </FormGroup>
          </FormRow>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12, color:'rgba(159,215,255,0.7)', marginBottom:0, marginTop: 4 }}>
            <input type="checkbox" checked={!!(editing as any).utilitati_la_proprietar} onChange={e=>setEditing({...editing,utilitati_la_proprietar:e.target.checked} as any)}/>
            Facturile (gaz/curent/asociație) se decontează proprietarului
          </label>
        </div>
        <FormRow cols={2}>
          <FormGroup><label>Link Site</label><input value={editing.link_site||''} onChange={e=>setEditing({...editing,link_site:e.target.value})} placeholder="https://abhomesiasi.ro/..."/></FormGroup>
          <FormGroup><label>📍 Link Google Maps</label><input value={editing.link_booking||''} onChange={e=>setEditing({...editing,link_booking:e.target.value})} placeholder="https://maps.app.goo.gl/..."/></FormGroup>
        </FormRow>
        <FormGroup><label>🏠 Link Airbnb (primul)</label><input value={editing.link_airbnb||''} onChange={e=>setEditing({...editing,link_airbnb:e.target.value})} placeholder="https://airbnb.com/..."/></FormGroup>

        <FormGroup>
          <label>🏨 Linkuri Booking.com</label>
          {(((editing as any).booking_links as string[]||[]).length===0?['']: ((editing as any).booking_links as string[])).map((lnk:string, idx:number) => (
            <div key={idx} style={{ display:'flex', gap:6, marginBottom:6 }}>
              <input value={lnk} onChange={e=>{
                const arr=[...((editing as any).booking_links||[''])]; arr[idx]=e.target.value
                setEditing({...editing,booking_links:arr} as any)
              }} placeholder={`https://booking.com/... (${idx+1})`} style={{ flex:1 }}/>
              {idx===((editing as any).booking_links||['']).length-1
                ? <button type="button" onClick={()=>setEditing({...editing,booking_links:[...(((editing as any).booking_links as string[])||['']),'']} as any)}
                    style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.08)', color:'#7BC8FF', cursor:'pointer', fontSize:12 }}>+ Adaugă</button>
                : <button type="button" onClick={()=>{ const arr=[...((editing as any).booking_links||[''])]; arr.splice(idx,1); setEditing({...editing,booking_links:arr} as any) }}
                    style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#F87171', cursor:'pointer', fontSize:12 }}>✕</button>
              }
            </div>
          ))}
        </FormGroup>

        <FormGroup>
          <label>🏠 Linkuri Airbnb suplimentare</label>
          {(((editing as any).airbnb_links as string[])||[]).map((lnk:string, idx:number) => (
            <div key={idx} style={{ display:'flex', gap:6, marginBottom:6 }}>
              <input value={lnk} onChange={e=>{
                const arr=[...((editing as any).airbnb_links||[])]; arr[idx]=e.target.value
                setEditing({...editing,airbnb_links:arr} as any)
              }} placeholder={`https://airbnb.com/... (${idx+2})`} style={{ flex:1 }}/>
              <button type="button" onClick={()=>{ const arr=[...((editing as any).airbnb_links||[])]; arr.splice(idx,1); setEditing({...editing,airbnb_links:arr} as any) }}
                style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#F87171', cursor:'pointer', fontSize:12 }}>✕</button>
            </div>
          ))}
          <button type="button" onClick={()=>setEditing({...editing,airbnb_links:[...((editing as any).airbnb_links||[]),'']} as any)}
            style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.08)', color:'#7BC8FF', cursor:'pointer', fontSize:12 }}>+ Adaugă link Airbnb</button>
        </FormGroup>
        <FormGroup><label>Instrucțiuni check-in</label><textarea value={editing.instructiuni_checkin||''} onChange={e=>setEditing({...editing,instructiuni_checkin:e.target.value})} rows={2}/></FormGroup>
        <FormGroup><label>Reguli</label><textarea value={editing.reguli||''} onChange={e=>setEditing({...editing,reguli:e.target.value})} rows={2}/></FormGroup>
        <FormGroup>
          <label>💬 Mesaj Check-in (WhatsApp)</label>
          <textarea value={editing.mesaj_checkin||''} onChange={e=>setEditing({...editing,mesaj_checkin:e.target.value})}
            rows={3} placeholder="Mesaj personalizat pentru această locație la check-in (lasă gol pentru mesajul global din Setări)"/>
        </FormGroup>
        <FormGroup>
          <label>💬 Mesaj Check-out (WhatsApp)</label>
          <textarea value={editing.mesaj_checkout||''} onChange={e=>setEditing({...editing,mesaj_checkout:e.target.value})}
            rows={3} placeholder="Mesaj personalizat pentru check-out (lasă gol pentru mesajul global)"/>
        </FormGroup>
        <div style={{ display:'flex', gap:10, marginTop:4 }}>
          <Button variant="primary" onClick={save} loading={saving} style={{ flex:1 }}>Salvează</Button>
          <Button variant="secondary" onClick={()=>setEditOpen(false)} style={{ flex:1 }}>Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={del} loading={deleting} title="Șterge apartament" message="Sigur vrei să ștergi?"/>
      <Toast toast={toast}/>
    </>
  )
}

function MiniCard({ a, selected, onClick, onToggle }: { a:any; selected:boolean; onClick:()=>void; onToggle?:(id:string,s:string)=>void }) {
  const sc = SC[a.status]||'#94A3B8'
  const isActiv = a.status === 'activ'
  const cp = (e:React.MouseEvent, text:string) => { e.stopPropagation(); navigator.clipboard.writeText(text).catch(()=>{}) }
  const hasLinks = a.link_site||a.link_booking||a.link_airbnb
  return (
    <div style={{ padding:'10px 12px', background: selected?'rgba(77,163,255,0.12)':'rgba(214,228,244,0.04)', border: selected?'1px solid rgba(77,163,255,0.35)':'1px solid rgba(159,215,255,0.08)', borderRadius:9, transition:'all 0.12s', borderLeft:'3px solid '+(selected?'#4DA3FF':sc+'50'), opacity:isActiv?1:0.5 }}>
      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
        <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:6, flex:1, cursor:'pointer', minWidth:0 }}>
          {a.nota && <span style={{ fontSize:10, fontWeight:700, color:'#4DA3FF', fontFamily:'monospace', background:'rgba(77,163,255,0.12)', padding:'1px 6px', borderRadius:4, flexShrink:0 }}>{a.nota}</span>}
          <span style={{ fontSize:11, fontWeight:600, color:'#FFFFFF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.nume}</span>
        </div>
        <button onClick={e=>{e.stopPropagation();onToggle?.(a.id,isActiv?'inactiv':'activ')}} title={isActiv?'Dezactivează':'Activează'} style={{ flexShrink:0, width:28, height:16, borderRadius:8, background:isActiv?'rgba(74,222,128,0.2)':'rgba(159,215,255,0.07)', border:'1px solid '+(isActiv?'rgba(74,222,128,0.4)':'rgba(159,215,255,0.15)'), cursor:'pointer', position:'relative', padding:0 }}>
          <div style={{ position:'absolute', top:2, left:isActiv?12:2, width:10, height:10, borderRadius:'50%', background:isActiv?'#4ADE80':'rgba(159,215,255,0.3)', transition:'all .2s' }}/>
        </button>
      </div>
      {/* Adresa + copy */}
      {a.adresa && (
        <div style={{ display:'flex', alignItems:'center', gap:3, marginBottom:5 }}>
          <span style={{ fontSize:10, color:'rgba(159,215,255,0.4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{a.adresa}</span>
          <button onClick={e=>cp(e,a.adresa)} style={{ background:'none', border:'none', cursor:'pointer', padding:'1px 3px', color:'rgba(159,215,255,0.3)', flexShrink:0, display:'flex', alignItems:'center' }}>
            <Copy size={9}/>
          </button>
        </div>
      )}
      {/* Cod locker */}
      {a.cod_locker && (
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5, padding:'3px 8px', borderRadius:6, background:'rgba(252,211,77,0.1)', border:'1px solid rgba(252,211,77,0.25)', width:'fit-content' }}>
          <span style={{ fontSize:10 }}>🔒</span>
          <span style={{ fontSize:12, fontWeight:700, color:'#FCD34D', fontFamily:'monospace', letterSpacing:1 }}>{a.cod_locker}</span>
          <button onClick={e=>cp(e,a.cod_locker)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:'rgba(252,211,77,0.5)', display:'flex', alignItems:'center' }}>
            <Copy size={9}/>
          </button>
        </div>
      )}
      {/* Links copy row */}
      {hasLinks && (
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {a.link_site && (
            <button onClick={e=>cp(e,a.link_site)} style={{ display:'flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:5, border:'1px solid rgba(77,163,255,0.2)', background:'rgba(77,163,255,0.08)', color:'#7BC8FF', fontSize:9, cursor:'pointer', fontWeight:600 }}>
              <Copy size={8}/> Site
            </button>
          )}
          {a.link_booking && (
            <button onClick={e=>cp(e,a.link_booking)} style={{ display:'flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:5, border:'1px solid rgba(252,211,77,0.2)', background:'rgba(252,211,77,0.08)', color:'#FCD34D', fontSize:9, cursor:'pointer', fontWeight:600 }}>
              <Copy size={8}/> Maps
            </button>
          )}
          {a.link_airbnb && (
            <button onClick={e=>cp(e,a.link_airbnb)} style={{ display:'flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:5, border:'1px solid rgba(239,68,68,0.2)', background:'rgba(239,68,68,0.08)', color:'#F87171', fontSize:9, cursor:'pointer', fontWeight:600 }}>
              <Copy size={8}/> Airbnb
            </button>
          )}
          {((a.booking_links as string[])||[]).filter(Boolean)[0] && (
            <button onClick={e=>cp(e,((a.booking_links as string[])||[]).filter(Boolean)[0])} style={{ display:'flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:5, border:'1px solid rgba(96,165,250,0.2)', background:'rgba(96,165,250,0.08)', color:'#60A5FA', fontSize:9, cursor:'pointer', fontWeight:600 }}>
              <Copy size={8}/> Booking
            </button>
          )}
        </div>
      )}
      {/* Click to expand */}
      <div onClick={onClick} style={{ cursor:'pointer', marginTop:5, textAlign:'center', fontSize:9, color:'rgba(159,215,255,0.25)' }}>
        {selected ? '▲ inchide' : '▼ detalii'}
      </div>
    </div>
  )
}
