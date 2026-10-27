'use client'
import { GHID_BAZA } from '@/lib/gazdeGhid'
import { useEffect, useState } from 'react'
import { supabase, Apartament, Proprietar, reorderAptsSubset, persistAptOrdine, numVal, numInput } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog, ConnectionError } from '@/components/ui'
import { Plus, Building2, Edit2, Trash2, ExternalLink, Copy, MapPin, Check, Calculator, ChevronDown, ChevronUp, X, ChevronRight, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const SC: Record<string,string> = { activ:'#22C55E', inactiv:'#EF4444', mentenanta:'#F59E0B' }
const CTL: Record<string,string> = { procent_brut:'% brut', procent_net_platforme:'% net platf.', procent_net_dupa_costuri:'% net costuri', fix_lunar:'Fix lunar', mixt:'Fix+%', fara_comision:'Fără comision' }
const EDIT_TABS = [
  { id:'general' as const, emoji:'🏠', label:'General', desc:'Detalii de bază despre apartament' },
  { id:'comision' as const, emoji:'💰', label:'Plăți', desc:'Proprietar, comision și chiria plătită către el' },
  { id:'linkuri' as const, emoji:'🔗', label:'Linkuri', desc:'Site, hărți și anunțurile de pe platforme' },
  { id:'mesaje' as const, emoji:'💬', label:'Mesaje', desc:'Instrucțiuni, reguli și mesaje automate' },
]
const pad = (n: number) => String(n).padStart(2,'0')
// ultima zi a lunii in local time - .toISOString() taie ultima zi pentru fuse est de UTC (ex: Romania)
function ultimaZiLunaStr(an: number, luna1: number): string {
  const d = new Date(an, luna1, 0)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
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

const empty: Partial<Apartament> & { chirie_suma?: number; chirie_moneda?: string; chirie_ziua?: number; chirie_cu_tva?: boolean; exclus_statistici?: boolean } = { nume:'', adresa:'', zona:'', nr_camere:2, capacitate_max:4, pret_standard:0, proprietar_id:'', comision_tip:'procent_net_dupa_costuri', comision_procent:20, comision_fix:0, cost_curatenie_per_rezervare:0, link_airbnb:'', link_booking:'', link_site:'', instructiuni_checkin:'', reguli:'', status:'activ', nota:'', utilitati_la_proprietar:false, chirie_suma:0, chirie_moneda:'RON', chirie_cu_tva:false, cod_locker:'', exclus_statistici:false }

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
  const [chirie, setChirie] = useState<number|''>(0)
  const [chirieEUR, setChirieEUR] = useState(0)
  const [chirieMoneda, setChirieMoneda] = useState('RON')
  const [cursEUR, setCursEUR] = useState(5.0)
  const [eonCurent, setEonCurent] = useState<number|''>(0)
  const [eonGaz, setEonGaz] = useState<number|''>(0)
  const [asociatie, setAsociatie] = useState<number|''>(0)
  const [internet, setInternet] = useState<number|''>(0)
  const [alteFix, setAlteFix] = useState<number|''>(0)
  const [curatenie, setCuratenie] = useState<number|''>(200)
  const [consumabile, setConsumabile] = useState<number|''>(100)
  const [lenjerii, setLenjerii] = useState<number|''>(80)
  const [altVar, setAltVar] = useState<number|''>(0)
  const [zile, setZile] = useState<number|''>(25)
  const [loadingCh, setLoadingCh] = useState(false)

  async function preiadinCheltuieli() {
    setLoadingCh(true)
    const now = new Date()
    const an = now.getFullYear()
    const luna = now.getMonth() + 1
    const primaZi = an+'-'+pad(luna)+'-01'
    const ultimaZi = ultimaZiLunaStr(an, luna)

    // Preia curs BNR
    let curs = 5.0
    try {
      const res = await fetch('/api/curs-bnr')
      const data = await res.json()
      if(data?.curs) curs = data.curs
    } catch {}
    setCursEUR(curs)

    // Preia chiria fixa din chirii_fixe (select('*') - cu_tva e coloana noua, vezi nota din openEdit)
    const { data: chirieData } = await supabase.from('chirii_fixe')
      .select('*').eq('apartament_id', apt.id).eq('activ', true).maybeSingle()
    if(chirieData) {
      const sumaCuTva = chirieData.cu_tva ? chirieData.suma * 1.21 : chirieData.suma
      setChirieMoneda(chirieData.moneda)
      if(chirieData.moneda === 'EUR') {
        setChirieEUR(sumaCuTva)
        setChirie(Math.round(sumaCuTva * curs))
      } else {
        setChirie(Math.round(sumaCuTva))
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
  const costN = Number(zile)>0?Math.round(totalLuna/Number(zile)):0
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
                <div key={l}><div style={lbl}>{l}</div><input type="number" value={numVal(v,0)} onChange={e=>s(numInput(e.target.value,0))} style={inp}/></div>
              ))}
            </div>
          </div>

          {/* Cheltuieli variabile */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:'rgba(252,211,77,0.7)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Cheltuieli variabile / lună</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
              {([['Curățenie',curatenie,setCuratenie],['Consumabile',consumabile,setConsumabile],['Lenjerii',lenjerii,setLenjerii],['Altele var.',altVar,setAltVar]] as any[]).map(([l,v,s])=>(
                <div key={l}><div style={lbl}>{l}</div><input type="number" onChange={e=>s(numInput(e.target.value,0))} value={numVal(v,0)} style={inp}/></div>
              ))}
            </div>
          </div>

          {/* Zile ocupate + totale */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
            <div><div style={lbl}>Zile ocupate/lună</div><input type="number" value={numVal(zile,25)} onChange={e=>setZile(numInput(e.target.value,25))} style={inp}/></div>
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
              {([['Break-even',costN,'rgba(159,215,255,0.5)',0],['+15%',p15,'#7BC8FF',Math.round((p15-costN)*Number(zile))],['+25%',p25,'#4DA3FF',Math.round((p25-costN)*Number(zile))],['+40%',p40,'#4ADE80',Math.round((p40-costN)*Number(zile))]] as any[]).map(([l,v,col,profit])=>(
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
  const [editing, setEditing] = useState<Partial<Apartament> & { chirie_suma?: number; chirie_moneda?: string; chirie_ziua?: number; chirie_cu_tva?: boolean }>(empty)
  const [editTab, setEditTab] = useState<'general'|'comision'|'linkuri'|'mesaje'>('general')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  // starea de azi pe apartament (cine e cazat, urmatoarea sosire) + filtrul de sus
  const [ocupare, setOcupare] = useState<Record<string, { acum?: any; urm?: any }>>({})
  // firma fiecarui apartament (aceeasi lista ca in Cheltuieli → Fișe; setari „apartamente_firma”)
  const [firme, setFirme] = useState<Record<string,string>>({})
  useEffect(()=>{ Promise.resolve(supabase.from('setari').select('valoare').eq('cheie','apartamente_firma').maybeSingle()).then(({data})=>{ try{ const v=JSON.parse(data?.valoare||'{}'); if(v&&typeof v==='object') setFirme(v) }catch{} }).catch(()=>{}) },[])
  const [filtruStare, setFiltruStare] = useState<'toate'|'ocupat'|'liber'|'inactiv'>('toate')
  const aziStr = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` })()
  const { toast, show } = useToast()

  useEffect(()=>{ load() },[])
  useEffect(()=>{ const k=(e:KeyboardEvent)=>{ if(e.key==='Escape' && !editOpen) setSelectedId(null) }; window.addEventListener('keydown',k); return ()=>window.removeEventListener('keydown',k) },[editOpen])

  async function load() {
    setLoading(true)
    setLoadError(false)
    const bail=setTimeout(()=>{ setLoading(false); setLoadError(true) },20000)
    try{
      const [{ data:apt },{ data:prop }] = await Promise.all([
        supabase.from('apartamente').select('*, proprietar:proprietari(id,nume)').order('ordine', { ascending: true, nullsFirst: false }).order('nota').order('nume'),
        supabase.from('proprietari').select('id,nume').order('nume'),
      ])
      setApartamente((apt as Apartament[])||[])
      setProprietari((prop as Proprietar[])||[])
      clearTimeout(bail)
      const peste30 = (() => { const d = new Date(); d.setDate(d.getDate()+30); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` })()
      const { data: rz } = await supabase.from('rezervari').select('apartament_id,nume_client,data_checkin,data_checkout,camera_semnalata')
        .neq('status_rezervare','anulata').gte('data_checkout', aziStr).lte('data_checkin', peste30).order('data_checkin')
      const oc: Record<string, { acum?: any; urm?: any }> = {}
      for (const r of rz||[]) {
        if (r.camera_semnalata === 'NEALOCAT') continue
        const o = (oc[r.apartament_id] ||= {})
        if (r.data_checkin <= aziStr && r.data_checkout > aziStr) o.acum = o.acum || r
        else if (r.data_checkin >= aziStr && !o.urm && !(r.data_checkin === aziStr && o.acum)) o.urm = r
      }
      setOcupare(oc)
    }catch(err){console.error('[apartamente load]',err);clearTimeout(bail);setLoadError(true)}
    setLoading(false)
  }

  function openNew(){ setEditing(empty); setEditTab('general'); setEditOpen(true) }
  async function openEdit(a:Apartament){
    setEditing({...a, chirie_suma:0, chirie_moneda:'RON', chirie_ziua:undefined, chirie_cu_tva:false})
    setEditTab('general')
    setEditOpen(true)
    // select('*') - cu_tva e coloana noua, un select cu lista explicita ar pica toata interogarea daca migrarea n-a rulat inca
    const { data: chirieData } = await supabase.from('chirii_fixe')
      .select('*').eq('apartament_id', a.id).eq('activ', true).maybeSingle()
    if (chirieData) setEditing((prev:any) => ({ ...prev, chirie_suma: chirieData.suma, chirie_moneda: chirieData.moneda, chirie_ziua: chirieData.ziua_plata ?? undefined, chirie_cu_tva: !!chirieData.cu_tva }))
  }

  async function toggleAptStatus(id:string, newStatus:string){
    await supabase.from('apartamente').update({status:newStatus}).eq('id',id)
    setApartamente((list:any[])=>list.map(a=>a.id===id?{...a,status:newStatus}:a))
  }

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent, group: 'my'|'other'){
    const { active, over } = event
    if(!over || active.id===over.id) return
    const list = group==='my' ? myApts : otherApts
    const oldIndex = list.findIndex((a:any)=>a.id===active.id)
    const newIndex = list.findIndex((a:any)=>a.id===over.id)
    if(oldIndex===-1 || newIndex===-1) return
    const newFull = reorderAptsSubset(apartamente, list.map((a:any)=>a.id), oldIndex, newIndex)
    setApartamente(newFull as any)
    persistAptOrdine(newFull).catch(()=>{})
  }

  async function save(){
    if(!editing.nume||!editing.adresa){ show('error','Completează numele și adresa'); setEditTab('general'); return }
    setSaving(true)
    const p: any={ mesaj_checkin:editing.mesaj_checkin||null, mesaj_checkout:editing.mesaj_checkout||null, booking_links:(editing as any).booking_links||null, airbnb_links:(editing as any).airbnb_links||null, nume:editing.nume, adresa:editing.adresa, zona:editing.zona||null, nr_camere:editing.nr_camere||1, capacitate_max:editing.capacitate_max||1, pret_standard:editing.pret_standard||0, proprietar_id:editing.proprietar_id||null, comision_tip:editing.comision_tip, comision_procent:editing.comision_procent||0, comision_fix:editing.comision_fix||0, cost_curatenie_per_rezervare:editing.cost_curatenie_per_rezervare||0, link_airbnb:editing.link_airbnb||null, link_booking:editing.link_booking||null, link_site:editing.link_site||null, instructiuni_checkin:editing.instructiuni_checkin||null, reguli:editing.reguli||null, status:editing.status, nota:editing.nota||null, utilitati_la_proprietar:!!(editing as any).utilitati_la_proprietar, cod_locker:(editing as any).cod_locker||null, exclus_statistici:!!(editing as any).exclus_statistici }
    const aptId = editing.id
    let { data: savedApt, error } = editing.id
      ? await supabase.from('apartamente').update(p).eq('id',editing.id).select('id').single()
      : await supabase.from('apartamente').insert(p).select('id').single()
    if(error){
      // exclus_statistici poate sa nu existe inca (coloana noua) - daca scrierea esueaza din orice motiv,
      // reincearca o data fara ea, ca sa nu piarda tot restul formularului doar din cauza unui camp nou
      const { exclus_statistici, ...pFallback } = p
      const retry = editing.id
        ? await supabase.from('apartamente').update(pFallback).eq('id',editing.id).select('id').single()
        : await supabase.from('apartamente').insert(pFallback).select('id').single()
      if(retry.error){ show('error',retry.error.message); setSaving(false); return }
      savedApt = retry.data
    }
    const finalAptId = aptId || savedApt?.id
    if (finalAptId) {
      const chirieSuma = Number((editing as any).chirie_suma) || 0
      const chirieMoneda = (editing as any).chirie_moneda || 'RON'
      const chirieZiua = Number((editing as any).chirie_ziua) || null
      const chirieCuTva = !!(editing as any).chirie_cu_tva
      const { data: existingChirie } = await supabase.from('chirii_fixe')
        .select('id').eq('apartament_id', finalAptId).eq('activ', true).maybeSingle()
      if (chirieSuma > 0) {
        const chiriePayload: any = { suma: chirieSuma, moneda: chirieMoneda, ziua_plata: chirieZiua, cu_tva: chirieCuTva }
        // cu_tva poate sa nu existe inca (coloana noua) - daca scrierea esueaza, reincearca fara ea
        const upsert = existingChirie
          ? await supabase.from('chirii_fixe').update(chiriePayload).eq('id', existingChirie.id)
          : await supabase.from('chirii_fixe').insert({ apartament_id: finalAptId, ...chiriePayload, activ: true })
        if (upsert.error) {
          const { cu_tva, ...fallbackPayload } = chiriePayload
          if (existingChirie) await supabase.from('chirii_fixe').update(fallbackPayload).eq('id', existingChirie.id)
          else await supabase.from('chirii_fixe').insert({ apartament_id: finalAptId, ...fallbackPayload, activ: true })
        }
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
  const stareApt = (a:any): 'ocupat'|'liber'|'inactiv' => a.status !== 'activ' ? 'inactiv' : ocupare[a.id]?.acum ? 'ocupat' : 'liber'
  const vizibile = filtered.filter(a => filtruStare === 'toate' || stareApt(a) === filtruStare)
  const myApts = vizibile.filter(a=>a.nota)
  const otherApts = vizibile.filter(a=>!a.nota)
  const active = apartamente.filter(a=>a.status==='activ')
  const firmaApt = (a:any) => firme[a.id] || ''
  const alfa = (x:any, y:any) => (Number(x.status!=='activ') - Number(y.status!=='activ')) || String(x.nume).trim().localeCompare(String(y.nume).trim(), 'ro')
  const grupuriFirma = ([
    { cheie:'Privat', titlu:'Privat', culoare:'#C4B5FD' },
    { cheie:'ABXHOMES', titlu:'AB Homes · ABXHOMES', culoare:'#7BC8FF' },
    { cheie:'AB HOMES INVEST SRL', titlu:'AB Homes Invest SRL', culoare:'#3DDC97' },
    ...[...new Set(Object.values(firme))].filter(f => !['Privat','ABXHOMES','AB HOMES INVEST SRL'].includes(f)).map(f => ({ cheie:f, titlu:f, culoare:'#7BC8FF' })),
    { cheie:'', titlu:'Fără firmă setată', culoare:'#55688A' },
  ]).map(g => ({ ...g, lista: vizibile.filter((a:any) => firmaApt(a) === g.cheie).sort(alfa) })).filter(g => g.lista.length)
  const nOcupate = active.filter(a=>ocupare[a.id]?.acum).length
  const nCheckin = active.filter(a=>ocupare[a.id]?.urm?.data_checkin===aziStr || ocupare[a.id]?.acum?.data_checkin===aziStr).length
  const nCheckout = active.filter(a=>ocupare[a.id]?.acum?.data_checkout===aziStr).length
  const selected = apartamente.find(a=>a.id===selectedId) as any

  if(loading) return (<><PageHeader title="Apartamente"/><PageLoading/></>)
  if(loadError) return (<><PageHeader title="Apartamente"/><ConnectionError onRetry={()=>load()}/></>)

  return (
    <>
      <PageHeader title="Apartamente" subtitle={`${apartamente.length} locații · ocupare azi ${active.length ? Math.round(nOcupate/active.length*100) : 0}%`}
        actions={
          <div style={{ display:'flex', gap:8 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Caută cod, nume, stradă" style={{ width:200, padding:'6px 12px', fontSize:12 }}/>
            <Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Nou</Button>
          </div>
        }
      />

      <div className="apt-split" style={{ display:'grid', gridTemplateColumns:'1fr', flex:1, minHeight:0 }}>

        {/* LEFT — list */}
        <div className="apt-list-col" style={{ overflowY:'auto', padding:'16px 18px 40px', display:'flex', flexDirection:'column', gap:14 }}>
          {/* cifrele zilei */}
          <div className="apt-kpis" style={{ flexShrink:0, display:'grid', gridTemplateColumns:'repeat(5,minmax(0,1fr))', gap:1, background:'rgba(148,190,255,0.09)', border:'1px solid rgba(148,190,255,0.09)', borderRadius:14, overflow:'hidden' }}>
            {([[active.length,'active'],[nOcupate,'ocupate acum'],[active.length-nOcupate,'libere acum'],[nCheckin,'check-in azi'],[nCheckout,'check-out azi']] as [number,string][]).map(([n,l])=>(
              <div key={l} style={{ background:'#0B1422', padding:'12px 16px' }}>
                <div style={{ fontSize:22, fontWeight:700, color:'#E6EEF9', fontVariantNumeric:'tabular-nums' }}>{n}</div>
                <div style={{ fontSize:10.5, color:'#8EA3BF', letterSpacing:'.06em', textTransform:'uppercase' }}>{l}</div>
              </div>
            ))}
          </div>
          {/* filtre */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
            {([['toate','Toate',apartamente.length],['ocupat','Ocupate',nOcupate],['liber','Libere',active.length-nOcupate],['inactiv','Inactive',apartamente.length-active.length]] as [typeof filtruStare,string,number][]).map(([k,l,n])=>(
              <button key={k} onClick={()=>setFiltruStare(k)} style={{ height:30, padding:'0 13px', borderRadius:999, border:`1px solid ${filtruStare===k?'#E6EEF9':'rgba(148,190,255,0.18)'}`, background:filtruStare===k?'#E6EEF9':'transparent', color:filtruStare===k?'#07101D':'#8EA3BF', fontSize:12.5, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}>
                {l}<span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, opacity:.7 }}>{n}</span>
              </button>
            ))}
          </div>
          {apartamente.length===0 ? (
            <EmptyState icon={<Building2 size={40}/>} title="Niciun apartament" action={<Button variant="primary" icon={<Plus size={13}/>} onClick={openNew}>Adaugă</Button>}/>
          ) : (
            <>
              {/* grupate pe firme (cerut direct: „în 3 secțiuni: privat, AB Homes și AB Homes Invest”), alfabetic */}
              {grupuriFirma.map(g => (
                <div key={g.cheie} style={{ flexShrink:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, margin:'10px 0 12px', fontSize:11, fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:g.culoare }}>{g.titlu} · {g.lista.length}<span style={{ flex:1, height:1, background:'rgba(148,190,255,0.09)' }}/></div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))', gap:12 }}>
                    {g.lista.map((a:any)=>(
                      <div key={a.id}><MiniCard a={a} oc={ocupare[a.id]} azi={aziStr} selected={selectedId===a.id} onClick={()=>setSelectedId(a.id)} onToggle={toggleAptStatus}/></div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* RIGHT — detail panel */}
        {selected && (
          <div className="apt-pop" onClick={()=>setSelectedId(null)} style={{ position:'fixed', inset:0, zIndex:45, background:'rgba(3,7,15,0.62)', backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:'min(520px,100%)', maxHeight:'calc(100dvh - 32px)', background:'linear-gradient(180deg,#101C2F,#0B1422)', border:'1px solid rgba(148,190,255,0.18)', borderRadius:20, boxShadow:'0 30px 80px rgba(0,0,0,0.55)', overflowY:'auto', padding:'20px 20px 22px', display:'flex', flexDirection:'column', gap:14 }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                  {selected.nota && <span style={{ background:'rgba(77,163,255,0.18)', border:'1px solid rgba(77,163,255,0.3)', borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:700, color:'#4DA3FF', fontFamily:'monospace' }}>{selected.nota}</span>}
                  <span style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:`${SC[selected.status]||'#94A3B8'}18`, color:SC[selected.status]||'#94A3B8', border:`1px solid ${SC[selected.status]||'#94A3B8'}28` }}>{selected.status}</span>
                  <select value={firme[selected.id]||''} title="Firma pe care e apartamentul" onChange={async e=>{ const nou={...firme}; if(e.target.value) nou[selected.id]=e.target.value; else delete nou[selected.id]; setFirme(nou); await supabase.from('setari').upsert({cheie:'apartamente_firma',valoare:JSON.stringify(nou)},{onConflict:'cheie'}) }}
                    style={{ fontSize:10.5, fontWeight:700, padding:'2px 6px', borderRadius:20, width:'auto', background:'transparent', border:'1px solid rgba(148,190,255,0.25)', color:'#B9C7DA' }}>
                    <option value="">fără firmă</option><option value="Privat">Privat</option><option value="ABXHOMES">ABXHOMES</option><option value="AB HOMES INVEST SRL">AB HOMES INVEST SRL</option>
                  </select>
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
              {/* ghidul de check-in pentru oaspeti (pagina /ghid/<COD>) - editare direct de aici */}
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <a href={`/ghiduri/${selected.id}`} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'5px 10px', borderRadius:6, background:'rgba(255,138,61,0.12)', color:'#FF8A3D', border:'1px solid rgba(255,138,61,0.35)', textDecoration:'none', flex:1, fontWeight:700 }}>
                  ✏️ Ghid check-in (editează)
                </a>
                <CopyBtn text={`${GHID_BAZA}/${(selected as any).nota || selected.id}`}/>
              </div>
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
                <span style={{ color: selected.comision_tip==='fara_comision'?'rgba(159,215,255,0.5)':'#4ADE80', fontFamily:'monospace' }}>
                  {selected.comision_tip==='fara_comision' ? 'Fără comision' : `${selected.comision_procent}% · ${CTL[selected.comision_tip]||selected.comision_tip}`}
                </span>
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
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={()=>setEditOpen(false)} title={editing.id?'Editează apartament':'Apartament nou'} width="660px">
        {/* Tab bar — formularul avea 20+ câmpuri într-o singură listă lungă, fără nicio grupare
            vizuală (raportat direct: "extrem de urât și neintuitiv"). Împărțit acum pe 4 secțiuni
            navigabile, ca să nu mai fie nevoie de scroll nesfârșit ca să găsești un câmp anume. */}
        <div style={{ display:'flex', gap:4, padding:4, borderRadius:12, background:'rgba(7,18,32,0.5)', border:'1px solid rgba(159,215,255,0.1)', marginBottom:6 }}>
          {EDIT_TABS.map(t=>(
            <button key={t.id} type="button" onClick={()=>setEditTab(t.id)} style={{
              flex:'1 1 0', display:'flex', alignItems:'center', justifyContent:'center', gap:5,
              padding:'8px 6px', borderRadius:8, border:'none', cursor:'pointer',
              fontSize:12, fontWeight:600, whiteSpace:'nowrap' as const, transition:'all 0.15s',
              background:editTab===t.id?'rgba(77,163,255,0.18)':'transparent',
              color:editTab===t.id?'#7BC8FF':'rgba(159,215,255,0.45)',
            }}>
              <span>{t.emoji}</span>
              <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{t.label}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize:11, color:'rgba(159,215,255,0.35)', marginBottom:20, paddingLeft:2 }}>
          {EDIT_TABS.find(t=>t.id===editTab)?.desc}
        </div>

        {editTab==='general' && (<>
          <FormRow cols={2}>
            <FormGroup><label>Cod intern</label><input value={editing.nota||''} onChange={e=>setEditing({...editing,nota:e.target.value})} placeholder="L99, HD02..."/></FormGroup>
            <FormGroup><label>Status</label>
              <select value={editing.status||'activ'} onChange={e=>setEditing({...editing,status:e.target.value})}>
                <option value="activ">Activ</option><option value="inactiv">Inactiv</option><option value="mentenanta">Mentenanță</option>
              </select>
            </FormGroup>
          </FormRow>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12, color:'rgba(159,215,255,0.7)', margin:'-4px 0 14px' }}>
            <input type="checkbox" checked={!!(editing as any).exclus_statistici} onChange={e=>setEditing({...editing,exclus_statistici:e.target.checked} as any)}/>
            📊 Exclus din Statistici / Rapoarte (dispare din comparații; rămâne activ pentru rezervări, sincronizare, Cheltuieli)
          </label>
          <FormRow cols={2}>
            <FormGroup><label>Nume *</label><input value={editing.nume||''} onChange={e=>setEditing({...editing,nume:e.target.value})} placeholder="Ex: Airy Palas"/></FormGroup>
            <FormGroup><label>Zonă</label><input value={editing.zona||''} onChange={e=>setEditing({...editing,zona:e.target.value})} placeholder="Palas, Copou..."/></FormGroup>
          </FormRow>
          <FormGroup><label>Adresă *</label><input value={editing.adresa||''} onChange={e=>setEditing({...editing,adresa:e.target.value})} placeholder="Stradă, complex..."/></FormGroup>
          <FormRow cols={3}>
            <FormGroup><label>Camere</label><input type="number" value={numVal(editing.nr_camere,2)} onChange={e=>setEditing({...editing,nr_camere:numInput(e.target.value,1)} as any)} min={1}/></FormGroup>
            <FormGroup><label>Max pers.</label><input type="number" value={numVal(editing.capacitate_max,4)} onChange={e=>setEditing({...editing,capacitate_max:numInput(e.target.value,1)} as any)} min={1}/></FormGroup>
            <FormGroup><label>Preț (RON/n)</label><input type="number" value={numVal(editing.pret_standard,0)} onChange={e=>setEditing({...editing,pret_standard:numInput(e.target.value,0)} as any)} min={0}/></FormGroup>
          </FormRow>
          <FormGroup><label>🔒 Cod locker</label>
            <input value={(editing as any).cod_locker||''} maxLength={10} inputMode="numeric" placeholder="ex: 4821"
              onChange={e=>setEditing({...editing,cod_locker:e.target.value.replace(/\D/g,'').slice(0,10)} as any)}/>
          </FormGroup>
        </>)}

        {editTab==='comision' && (<>
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
                <option value="fara_comision">Fără comision</option>
              </select>
            </FormGroup>
          </FormRow>
          <FormRow cols={3}>
            <FormGroup><label>Procent (%)</label>
              <input type="number" value={numVal(editing.comision_procent,20)} disabled={editing.comision_tip==='fara_comision'}
                onChange={e=>setEditing({...editing,comision_procent:numInput(e.target.value,0)} as any)} min={0} max={100}
                style={editing.comision_tip==='fara_comision'?{opacity:0.4}:undefined}/>
            </FormGroup>
            <FormGroup><label>Fix (RON)</label>
              <input type="number" value={numVal(editing.comision_fix,0)} disabled={editing.comision_tip==='fara_comision'}
                onChange={e=>setEditing({...editing,comision_fix:numInput(e.target.value,0)} as any)} min={0}
                style={editing.comision_tip==='fara_comision'?{opacity:0.4}:undefined}/>
            </FormGroup>
            <FormGroup><label>Cost curățenie / rezervare (RON)</label>
              <input type="number" value={numVal(editing.cost_curatenie_per_rezervare,0)} placeholder="0"
                onChange={e=>setEditing({...editing,cost_curatenie_per_rezervare:numInput(e.target.value,0)} as any)} min={0}/>
            </FormGroup>
          </FormRow>
          {editing.comision_tip==='fara_comision' && (
            <div style={{ fontSize:11, color:'rgba(159,215,255,0.4)', marginTop:-8, marginBottom:14 }}>
              Proprietarul primește tot netul (după costuri operaționale), fără niciun comision reținut de AB Homes.
            </div>
          )}

          <div style={{ marginTop: 4, marginBottom: 4, padding: 14, borderRadius: 10, background: 'rgba(77,163,255,0.05)', border: '1px solid rgba(77,163,255,0.12)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(159,215,255,0.6)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Plată chirie către proprietar</div>
            <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginTop: -4, marginBottom: 10 }}>Chirie fixă lunară — intră automat și în Cheltuieli, la categoria „Chirie", cu suma și ziua de plată de aici</div>
            <FormRow cols={3}>
              <FormGroup><label>Chirie / lună</label><input type="number" value={numVal((editing as any).chirie_suma,0)} onChange={e=>setEditing({...editing,chirie_suma:numInput(e.target.value,0)} as any)} min={0}/></FormGroup>
              <FormGroup><label>Monedă</label>
                <select value={(editing as any).chirie_moneda||'RON'} onChange={e=>setEditing({...editing,chirie_moneda:e.target.value} as any)}>
                  <option value="RON">RON</option>
                  <option value="EUR">EUR (convertit automat la curs BNR)</option>
                </select>
              </FormGroup>
              <FormGroup><label>Ziua plății</label>
                <input type="number" value={(editing as any).chirie_ziua||''} placeholder="ex: 5"
                  onChange={e=>setEditing({...editing,chirie_ziua:e.target.value?parseInt(e.target.value):undefined} as any)} min={1} max={31}/>
              </FormGroup>
            </FormRow>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12, color:'rgba(159,215,255,0.7)', marginBottom:0, marginTop: 4 }}>
              <input type="checkbox" checked={!!(editing as any).chirie_cu_tva} onChange={e=>setEditing({...editing,chirie_cu_tva:e.target.checked} as any)}/>
              Chiria are TVA (21%) — se adaugă la sumă: chirie + TVA
            </label>
            {!!(editing as any).chirie_cu_tva && Number((editing as any).chirie_suma) > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#4ADE80', fontFamily: 'monospace' }}>
                Total cu TVA: {(Number((editing as any).chirie_suma) * 1.21).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} {(editing as any).chirie_moneda||'RON'}
                <span style={{ color: 'rgba(159,215,255,0.35)', fontFamily:'inherit' }}> ({(editing as any).chirie_suma} + TVA {(Number((editing as any).chirie_suma) * 0.21).toLocaleString('ro-RO', { maximumFractionDigits: 2 })})</span>
              </div>
            )}
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12, color:'rgba(159,215,255,0.7)', marginBottom:0, marginTop: 8 }}>
              <input type="checkbox" checked={!!(editing as any).utilitati_la_proprietar} onChange={e=>setEditing({...editing,utilitati_la_proprietar:e.target.checked} as any)}/>
              Facturile (gaz/curent/asociație) se decontează proprietarului
            </label>
          </div>
        </>)}

        {editTab==='linkuri' && (<>
          <FormRow cols={2}>
            <FormGroup><label>Link Site</label><input value={editing.link_site||''} onChange={e=>setEditing({...editing,link_site:e.target.value})} placeholder="https://abhomesiasi.ro/..."/></FormGroup>
            <FormGroup><label>📍 Link Google Maps</label><input value={editing.link_booking||''} onChange={e=>setEditing({...editing,link_booking:e.target.value})} placeholder="https://maps.app.goo.gl/..."/></FormGroup>
          </FormRow>

          <div style={{ marginBottom:16, padding:14, borderRadius:10, background:'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.15)' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#F87171', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>🏠 Airbnb</div>
            <FormGroup><label>Link principal</label><input value={editing.link_airbnb||''} onChange={e=>setEditing({...editing,link_airbnb:e.target.value})} placeholder="https://airbnb.com/..."/></FormGroup>
            <label style={{ fontSize:11, color:'rgba(159,215,255,0.4)', marginBottom:6, display:'block' }}>Linkuri suplimentare</label>
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
              style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#F87171', cursor:'pointer', fontSize:12 }}>+ Adaugă link Airbnb</button>
          </div>

          <div style={{ marginBottom:4, padding:14, borderRadius:10, background:'rgba(96,165,250,0.05)', border:'1px solid rgba(96,165,250,0.15)' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#60A5FA', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>🏨 Booking.com</div>
            {(((editing as any).booking_links as string[]||[]).length===0?['']: ((editing as any).booking_links as string[])).map((lnk:string, idx:number) => (
              <div key={idx} style={{ display:'flex', gap:6, marginBottom:6 }}>
                <input value={lnk} onChange={e=>{
                  const arr=[...((editing as any).booking_links||[''])]; arr[idx]=e.target.value
                  setEditing({...editing,booking_links:arr} as any)
                }} placeholder={`https://booking.com/... (${idx+1})`} style={{ flex:1 }}/>
                {idx===((editing as any).booking_links||['']).length-1
                  ? <button type="button" onClick={()=>setEditing({...editing,booking_links:[...(((editing as any).booking_links as string[])||['']),'']} as any)}
                      style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(96,165,250,0.3)', background:'rgba(96,165,250,0.08)', color:'#60A5FA', cursor:'pointer', fontSize:12 }}>+ Adaugă</button>
                  : <button type="button" onClick={()=>{ const arr=[...((editing as any).booking_links||[''])]; arr.splice(idx,1); setEditing({...editing,booking_links:arr} as any) }}
                      style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#F87171', cursor:'pointer', fontSize:12 }}>✕</button>
                }
              </div>
            ))}
          </div>
        </>)}

        {editTab==='mesaje' && (<>
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
        </>)}

        <div style={{ display:'flex', gap:10, marginTop:8 }}>
          <Button variant="primary" onClick={save} loading={saving} style={{ flex:1 }}>Salvează</Button>
          <Button variant="secondary" onClick={()=>setEditOpen(false)} style={{ flex:1 }}>Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={del} loading={deleting} title="Șterge apartament" message="Sigur vrei să ștergi?"/>
      <Toast toast={toast}/>
      <style>{`
        .apt-card:hover { border-color: rgba(148,190,255,0.22) !important; transform: translateY(-2px); }
        @media (max-width: 760px) {
          .apt-kpis { grid-template-columns: repeat(3,minmax(0,1fr)) !important; }
          .apt-kpis > div:nth-child(n+4) { display: none; }
          .apt-pop { align-items: flex-end !important; padding: 0 !important; }
          .apt-pop > div { width: 100% !important; border-radius: 20px 20px 0 0 !important; max-height: 92dvh !important; }
        }
      `}</style>
    </>
  )
}

function SortableApt({ a, disabled, children }: { a:any; disabled?:boolean; children:(dragHandle?: { attributes:any; listeners:any; setActivatorNodeRef:(el:HTMLElement|null)=>void })=>React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: a.id, disabled })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }
  return (
    <div ref={setNodeRef} style={style}>
      {children(disabled ? undefined : { attributes, listeners, setActivatorNodeRef })}
    </div>
  )
}

const fmtZi = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })

// Cardul apartamentului (cerut direct: „futurist, premium, dar minimalist”): cod + nume, starea de azi, capacitate /
// pret / proprietar, linkuri (click = copiaza), codul de locker ascuns (click = arata + copiaza). Click pe card = detalii.
function MiniCard({ a, oc, azi, selected, onClick, onToggle, dragHandle }: { a:any; oc?: { acum?: any; urm?: any }; azi: string; selected:boolean; onClick:()=>void; onToggle?:(id:string,s:string)=>void; dragHandle?: { attributes:any; listeners:any; setActivatorNodeRef:(el:HTMLElement|null)=>void } }) {
  const [cod, setCod] = useState(false)
  const [copiat, setCopiat] = useState<string|null>(null)
  const isActiv = a.status === 'activ'
  const cp = (e:React.MouseEvent, text:string, k:string) => { e.stopPropagation(); navigator.clipboard.writeText(text).then(()=>{ setCopiat(k); setTimeout(()=>setCopiat(x=>x===k?null:x),1200) }).catch(()=>{}) }
  const booking = ((a.booking_links as string[])||[]).filter(Boolean)[0]
  const links: [string,string,string|undefined][] = [['S','Site',a.link_site],['M','Google Maps',a.link_booking],['A','Airbnb',a.link_airbnb],['B','Booking',booking]]
  const stare = !isActiv ? 'inactiv' : oc?.acum ? 'ocupat' : 'liber'
  const dot = stare === 'ocupat' ? '#3DDC97' : stare === 'liber' ? '#4DA3FF' : '#475569'
  return (
    <div onClick={onClick} className="apt-card" style={{ position:'relative', display:'flex', flexDirection:'column', gap:12, padding:16, borderRadius:16, cursor:'pointer',
      background:'linear-gradient(180deg,#101C2F,#0B1422)', border:`1px solid ${selected?'rgba(77,163,255,0.5)':'rgba(148,190,255,0.09)'}`, opacity:isActiv?1:0.5, transition:'border-color .2s, transform .2s' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        {dragHandle && (
          <button ref={dragHandle.setActivatorNodeRef} {...dragHandle.attributes} {...dragHandle.listeners} onClick={e=>e.stopPropagation()} title="Trage pentru a reordona" style={{ flexShrink:0, display:'flex', alignItems:'center', background:'none', border:'none', padding:'2px 0 0', cursor:'grab', color:'rgba(148,190,255,0.25)', touchAction:'none' }}>
            <GripVertical size={13}/>
          </button>
        )}
        {a.nota && <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontWeight:700, fontSize:13, color:'#4DA3FF', letterSpacing:'.06em', paddingTop:1, minWidth:42 }}>{a.nota}</span>}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#E6EEF9', lineHeight:1.25, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{String(a.nume||'').trim()}</div>
          {a.adresa && <div style={{ marginTop:3, fontSize:12, color:'#55688A', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.adresa}</div>}
        </div>
        <button onClick={e=>{e.stopPropagation();onToggle?.(a.id,isActiv?'inactiv':'activ')}} title={isActiv?'Dezactivează':'Activează'} style={{ flexShrink:0, width:30, height:18, borderRadius:999, background:isActiv?'rgba(61,220,151,0.22)':'rgba(148,163,184,0.18)', border:'none', cursor:'pointer', position:'relative', padding:0, marginTop:2 }}>
          <span style={{ position:'absolute', top:3, left:isActiv?15:3, width:12, height:12, borderRadius:'50%', background:isActiv?'#3DDC97':'#475569', transition:'left .2s' }}/>
        </button>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 11px', borderRadius:10, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(148,190,255,0.09)', fontSize:12.5, minWidth:0 }}>
        <span style={{ width:7, height:7, borderRadius:'50%', background:dot, boxShadow:stare==='ocupat'?'0 0 10px #3DDC97':undefined, flexShrink:0 }}/>
        {stare === 'ocupat' ? <>
          <b style={{ color:'#E6EEF9' }}>Ocupat</b><span style={{ color:'#B9C7DA', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>· {oc!.acum.nume_client}</span>
          <span style={{ marginLeft:'auto', color:'#8EA3BF', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, whiteSpace:'nowrap' }}>{oc!.acum.data_checkout===azi?'pleacă azi':'până '+fmtZi(oc!.acum.data_checkout)}</span>
        </> : stare === 'liber' ? <>
          <b style={{ color:'#E6EEF9' }}>Liber</b>
          {oc?.urm ? <><span style={{ color:'#B9C7DA', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>· {oc.urm.nume_client}</span>
            <span style={{ marginLeft:'auto', color:'#8EA3BF', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, whiteSpace:'nowrap' }}>{oc.urm.data_checkin===azi?'sosește azi':'din '+fmtZi(oc.urm.data_checkin)}</span></>
            : <span style={{ marginLeft:'auto', color:'#8EA3BF', fontSize:11.5 }}>fără rezervări</span>}
        </> : <b style={{ color:'#8EA3BF' }}>Inactiv</b>}
      </div>
      <div style={{ display:'flex', gap:14, fontSize:12, color:'#8EA3BF', fontVariantNumeric:'tabular-nums', flexWrap:'wrap' }}>
        {a.capacitate_max ? <span><b style={{ color:'#E6EEF9' }}>{a.capacitate_max}</b> pers</span> : null}
        {a.nr_camere ? <span><b style={{ color:'#E6EEF9' }}>{a.nr_camere}</b> cam</span> : null}
        {a.pret_standard ? <span><b style={{ color:'#E6EEF9' }}>{a.pret_standard}</b> lei/n</span> : null}
        {a.proprietar?.nume ? <span title="Proprietar">{String(a.proprietar.nume).trim().split(' ')[0]}</span> : null}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6, paddingTop:12, borderTop:'1px solid rgba(148,190,255,0.09)' }}>
        {links.map(([t,titlu,url])=>(
          <button key={t} disabled={!url} onClick={e=>url&&cp(e,url,t)} title={url?`${titlu} — click copiază linkul`:`${titlu} — lipsește`}
            style={{ width:30, height:30, display:'grid', placeItems:'center', borderRadius:8, border:`1px solid ${copiat===t?'#3DDC97':'rgba(148,190,255,0.18)'}`, background:'transparent', color:copiat===t?'#3DDC97':'#8EA3BF', fontFamily:'ui-monospace,Menlo,monospace', fontWeight:700, fontSize:10.5, cursor:url?'pointer':'default', opacity:url?1:0.25 }}>
            {copiat===t?'✓':t}
          </button>
        ))}
        {a.cod_locker && (
          <button onClick={e=>{ e.stopPropagation(); if (cod) cp(e,a.cod_locker,'cod'); else setCod(true) }} title={cod?'Click copiază codul':'Cod locker — click ca să-l vezi'}
            style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:7, height:30, padding:'0 10px', borderRadius:8, border:`1px solid ${copiat==='cod'?'#3DDC97':'rgba(245,184,75,0.28)'}`, background:'rgba(245,184,75,0.06)', color:copiat==='cod'?'#3DDC97':'#F5B84B', fontFamily:'ui-monospace,Menlo,monospace', fontWeight:700, fontSize:12.5, letterSpacing:'.14em', cursor:'pointer' }}>
            <span style={{ fontSize:11 }}>🔒</span>{copiat==='cod' ? 'copiat' : cod ? a.cod_locker : '••••'}
          </button>
        )}
      </div>
    </div>
  )
}
