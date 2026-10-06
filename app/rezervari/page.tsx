'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Rezervare, Apartament, calculeazaDecont, CANALE_LABEL, STATUS_REZERVARE_LABEL, STATUS_PLATA_LABEL, STATUS_FACTURARE_LABEL, LUNI, normalizeWaPhone, PROPRIETAR_NOTIF_APT_IDS } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Badge, CanalBadge, EmptyState, PageLoading, Toast, useToast, ConfirmDialog, Card, ConnectionError } from '@/components/ui'
import { Plus, CalendarCheck, Edit2, Trash2, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'
import RezervareModal from '@/components/RezervareModal'

// formateaza local (YYYY-MM-DD) - .toISOString() poate muta data cu o zi pentru fuse est de UTC (ex: Romania)
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

type BadgeColor = 'green'|'amber'|'red'|'blue'|'purple'|'gray'|'teal'

const STATUS_COLOR: Record<string, BadgeColor> = { confirmata:'green', cerere:'amber', anulata:'red', finalizata:'blue' }
const PLATA_COLOR: Record<string, BadgeColor> = { achitat:'green', avans:'amber', neplatit:'red' }
const DECONT_COLOR: Record<string, BadgeColor> = { decontat:'green', inclus:'amber', nedecontat:'gray' }
const FACTURARE_COLOR: Record<string, BadgeColor> = { facturata:'green', de_facturat:'amber', nefacturat:'gray' }

const emptyRez = {
  canal:'direct', nume_client:'', email_client:'', telefon_client:'',
  data_checkin: new Date().toISOString().split('T')[0],
  data_checkout: new Date(Date.now()+86400000).toISOString().split('T')[0],
  nr_persoane:2, valoare_bruta:0, taxa_curatenie_incasata:0, suma_incasata:0,
  moneda:'RON', status_plata:'neplatit', status_rezervare:'confirmata',
  comision_platforma_procent:0, comision_platforma_valoare:0, tva_comision_platforma:0,
  cost_curatenie:0, cost_spalatorie:0, cost_consumabile:0, cost_mentenanta:0, alte_costuri:0,
  status_decont:'nedecontat', status_facturare:'nefacturat', cod_rezervare_platforma:'', observatii:'', apartament_id:'', proprietar_id:'',
}

export default function RezervariPage() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [rezervari, setRezervari] = useState<any[]>([])
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(emptyRez)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkMarking, setBulkMarking] = useState(false)
  const [expandedLuni, setExpandedLuni] = useState<Set<string>>(() => {
    const t = new Date()
    return new Set([`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`])
  })
  const [filterCanal, setFilterCanal] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterApt, setFilterApt] = useState('')
  const [searchNume, setSearchNume] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Ordinea listei: implicit cronologic (cele mai vechi primele); click pe „Check-in” o inverseaza
  const [sortCrescator, setSortCrescator] = useState(true)
  function comutaSort() { setSortCrescator(v => !v) }
  const [sabloanePop, setSabloanePop] = useState<any>(null)
  const [sabloane, setSabloane] = useState<any[]>([])
  const { toast, show } = useToast()
  
  async function deschideSabloane(rez: any) {
    setSabloanePop({rez})
    const {data} = await supabase.from('sabloane_mesaje')
      .select('*').eq('apartament_id', rez.apartament_id).order('tip')
    setSabloane(data||[])
  }
  
  function waLinkProprietar(r: any): string {
    const nr = normalizeWaPhone(r.apartament?.proprietar?.telefon || '')
    const msg = `🏠 Rezervare nouă — ${r.apartament?.nume||'—'}\n\nS-a rezervat pentru data de ${r.data_checkin} → ${r.data_checkout} (${r.nr_nopti||'?'} nopți), ${r.nr_persoane||'?'} persoane.\nClient: ${r.nume_client}`
    return `https://wa.me/${nr}?text=${encodeURIComponent(msg)}`
  }

  function trimiteWA(rez: any, s: any) {
    const nr = normalizeWaPhone(rez.telefon_client||'')
    const firstName = (rez.nume_client||'').split(' ')[0]
    let msg = (s.text||'').replace(/{nume}/g, firstName)
    if (s.poze?.length) msg += '\n\n' + s.poze.join('\n')
    window.open(`https://wa.me/${nr}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setLoadError(false)
    const bail=setTimeout(()=>{ setLoading(false); setLoadError(true) },20000)
    try{
      // Supabase intoarce maxim 1000 de randuri pe cerere - bug gasit: cu 2.099 rezervari, cele cu
      // check-in inainte de ~27.03.2026 nu apareau deloc. Se incarca pe pagini pana la capat.
      const toateRez = async () => {
        const PAGINA = 1000, rez: any[] = []
        for (let de = 0; ; de += PAGINA) {
          const { data, error } = await supabase.from('rezervari').select('*, apartament:apartamente(id,nume,comision_tip,comision_procent,comision_fix,proprietar:proprietari(id,nume,telefon)), proprietar:proprietari(id,nume)')
            .order('data_checkin', { ascending: false }).order('id').range(de, de + PAGINA - 1)
          if (error) throw error
          rez.push(...(data || []))
          if (!data || data.length < PAGINA) return rez
        }
      }
      const [rez, { data: apt }] = await Promise.all([
        toateRez(),
        supabase.from('apartamente').select('*, proprietar:proprietari(id,nume)').eq('status','activ').order('nume'),
      ])
      setRezervari(rez)
      setApartamente((apt as Apartament[])||[])
      clearTimeout(bail)
    }catch(err){console.error('[rezervari load]',err);clearTimeout(bail);setLoadError(true)}
    setLoading(false)
  }

  function openNew() { setEditing({...emptyRez}); setOpen(true) }
  function openEdit(r: any) { setEditing({...r}); setOpen(true) }

  function onAptChange(aptId: string) {
    const apt = apartamente.find(a => a.id === aptId)
    setEditing((prev: any) => ({
      ...prev,
      apartament_id: aptId,
      proprietar_id: apt?.proprietar_id || '',
      comision_platforma_procent: aptId.includes('booking') ? 15 : 0,
    }))
  }

  function recalcComisionPlatforma(brut: number|'', pct: number|'') {
    const val = Number(brut||0) * Number(pct||0) / 100
    const tva = val * 0.19
    setEditing((prev: any) => ({
      ...prev,
      valoare_bruta: brut,
      comision_platforma_procent: pct,
      comision_platforma_valoare: Math.round(val*100)/100,
      tva_comision_platforma: Math.round(tva*100)/100,
    }))
  }

  const calcul = useCallback(() => {
    const apt = apartamente.find(a => a.id === editing.apartament_id)
    if (!apt) return null
    return calculeazaDecont(editing, apt)
  }, [editing, apartamente])

  async function save() {
    // apartament_id is optional - can be set later
    if (!editing.nume_client) { show('error','Completează numele clientului'); return }
    if (!editing.data_checkin || !editing.data_checkout) { show('error','Completează datele'); return }
    if (editing.data_checkout <= editing.data_checkin) { show('error','Data checkout trebuie să fie după check-in'); return }

    setSaving(true)
    const apt = apartamente.find(a => a.id === editing.apartament_id)
    const c = calculeazaDecont(editing, apt||{})

    const payload = {
      ...editing,
      baza_calcul_comision: c.baza,
      comision_administrator: c.comision,
      suma_proprietar: c.suma_proprietar,
      // Convert empty strings to null for UUID fields
      apartament_id: editing.apartament_id || null,
      proprietar_id: editing.proprietar_id || null,
      // Campurile numerice pot fi ramase '' daca s-a salvat cu inputul golit fara sa se retasteze
      // (vezi numVal/numInput) - le trecem explicit pe 0 aici, ca sa nu trimitem '' spre coloane numerice
      nr_persoane: Number(editing.nr_persoane)||1,
      valoare_bruta: Number(editing.valoare_bruta)||0,
      taxa_curatenie_incasata: Number(editing.taxa_curatenie_incasata)||0,
      suma_incasata: Number(editing.suma_incasata)||0,
      comision_platforma_procent: Number(editing.comision_platforma_procent)||0,
      comision_platforma_valoare: Number(editing.comision_platforma_valoare)||0,
      tva_comision_platforma: Number(editing.tva_comision_platforma)||0,
      cost_curatenie: Number(editing.cost_curatenie)||0,
      cost_spalatorie: Number(editing.cost_spalatorie)||0,
      cost_consumabile: Number(editing.cost_consumabile)||0,
      cost_mentenanta: Number(editing.cost_mentenanta)||0,
      alte_costuri: Number(editing.alte_costuri)||0,
      cod_rezervare_platforma: String(editing.cod_rezervare_platforma||'').trim() || null,
      platit_proprietar: !!editing.platit_proprietar,
      suma_platita_proprietar: editing.platit_proprietar ? (Number(editing.suma_platita_proprietar)||0) : null,
      data_plata_proprietar: editing.platit_proprietar ? (editing.data_plata_proprietar || new Date().toISOString().slice(0,10)) : null,
    }
    delete payload.id; delete payload.apartament; delete payload.proprietar; delete payload.nr_nopti; delete payload.created_at; delete payload.updated_at; delete payload.rezervare_id

    let { error } = editing.id
      ? await supabase.from('rezervari').update(payload).eq('id', editing.id)
      : await supabase.from('rezervari').insert(payload)
    let codNesalvat = false
    if (error && /cod_rezervare_platforma/.test(error.message)) {
      // cod_rezervare_platforma e coloana noua (supabase/cod_rezervare_platforma.sql) - pana la migrare
      // salvam restul rezervarii si anuntam ca doar codul n-a putut fi salvat
      const { cod_rezervare_platforma, ...faraCod } = payload
      codNesalvat = !!cod_rezervare_platforma
      ;({ error } = editing.id
        ? await supabase.from('rezervari').update(faraCod).eq('id', editing.id)
        : await supabase.from('rezervari').insert(faraCod))
    }
    if (error) {
      // platit_proprietar/suma_platita_proprietar/data_plata_proprietar pot sa nu existe inca
      // (coloane noi) - reincearca fara ele, sa nu piarda restul rezervarii
      const { platit_proprietar, suma_platita_proprietar, data_plata_proprietar, cod_rezervare_platforma, ...fallback } = payload
      if (cod_rezervare_platforma) codNesalvat = true
      ;({ error } = editing.id
        ? await supabase.from('rezervari').update(fallback).eq('id', editing.id)
        : await supabase.from('rezervari').insert(fallback))
    }
    if (error) { show('error', error.message); setSaving(false); return }
    if (codNesalvat) show('error', 'Rezervarea s-a salvat, dar codul de rezervare nu — lipsește coloana cod_rezervare_platforma în baza de date')
    else show('success', editing.id ? 'Rezervare actualizată' : 'Rezervare adăugată')
    setOpen(false); setSaving(false); load()
  }

  async function deleteRez() {
    if (!deleteId) return
    await supabase.from('rezervari').delete().eq('id', deleteId)
    show('success','Rezervare ștearsă'); setDeleteId(null); load()
  }

  const filtered = rezervari.filter(r => {
    if (filterCanal && r.canal !== filterCanal) return false
    if (filterStatus && r.status_rezervare !== filterStatus) return false
    if (filterApt && r.apartament_id !== filterApt) return false
    if (searchNume && !r.nume_client?.toLowerCase().includes(searchNume.toLowerCase()) && !r.telefon_client?.includes(searchNume)) return false
    if (dateFrom && r.data_checkin < dateFrom) return false
    if (dateTo && r.data_checkin > dateTo) return false
    return true
  }).sort((a, b) => {
    // Ordine cronologica (cerut direct: "foarte dezordonate"): dupa check-in, apoi check-out,
    // apartament si nume - rezervarile din aceeasi zi stau mereu in aceeasi ordine.
    const k = (r: any) => [r.data_checkin || '', r.data_checkout || '', r.apartament?.nume || '', r.nume_client || ''].join('|')
    return sortCrescator ? k(a).localeCompare(k(b)) : k(b).localeCompare(k(a))
  })

  const c = calcul()

  const deFacturat = rezervari.filter(r => r.status_facturare === 'de_facturat')
  const facturareGrupat = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const r of deFacturat) {
      const key = r.data_checkin?.slice(0,7) || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort((a,b) => b[0].localeCompare(a[0]))
  }, [rezervari])

  if (loading) return (<><PageHeader title="Rezervări" /><PageLoading /></>)
  if (loadError) return (<><PageHeader title="Rezervări" /><ConnectionError onRetry={()=>load()}/></>)

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(r => r.id)))
    }
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    const ids = Array.from(selected)
    const { error } = await supabase.from('rezervari').delete().in('id', ids)
    if (error) { show('error', error.message) }
    else { show('success', `${ids.length} rezervări șterse`); setSelected(new Set()); load() }
    setBulkDeleting(false); setShowBulkConfirm(false)
  }

  async function bulkMarkFacturat() {
    setBulkMarking(true)
    const ids = Array.from(selected)
    const { error } = await supabase.from('rezervari').update({ status_facturare: 'de_facturat' }).in('id', ids)
    if (error) { show('error', error.message) }
    else { show('success', `${ids.length} rezervări marcate „de facturat"`); setSelected(new Set()); load() }
    setBulkMarking(false)
  }

  async function marcheazaFacturat(ids: string[]) {
    const { error } = await supabase.from('rezervari').update({ status_facturare: 'facturata' }).in('id', ids)
    if (error) { show('error', error.message) }
    else { show('success', ids.length > 1 ? `${ids.length} rezervări marcate facturate` : 'Marcată ca facturată'); load() }
  }

  function toggleLuna(luna: string) {
    setExpandedLuni(prev => {
      const next = new Set(prev)
      next.has(luna) ? next.delete(luna) : next.add(luna)
      return next
    })
  }

  return (
    <>
      <PageHeader title="Rezervări" subtitle={`${rezervari.length} rezervări totale`}
        actions={
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {selected.size > 0 && (
              <>
                <span style={{fontSize:12,color:'rgba(159,215,255,0.6)',background:'rgba(77,163,255,0.12)',border:'1px solid rgba(77,163,255,0.2)',borderRadius:7,padding:'5px 10px',fontWeight:500}}>
                  {selected.size} selectate
                </span>
                <button onClick={()=>setSelected(new Set())} style={{fontSize:11,padding:'5px 10px',borderRadius:7,background:'transparent',border:'1px solid rgba(159,215,255,0.15)',color:'rgba(159,215,255,0.5)',cursor:'pointer'}}>
                  Deselectează
                </button>
                <button onClick={bulkMarkFacturat} disabled={bulkMarking} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,background:'rgba(251,191,36,0.15)',border:'1px solid rgba(251,191,36,0.35)',color:'#FBBF24',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                  📄 De facturat {selected.size}
                </button>
                <button onClick={()=>setShowBulkConfirm(true)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.35)',color:'#F87171',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                  <Trash2 size={13}/> Șterge {selected.size}
                </button>
              </>
            )}
            <Button variant="primary" icon={<Plus size={15}/>} onClick={openNew}>Rezervare nouă</Button>
          </div>
        } />
      <div className="p-6" style={{ overflowY:"auto" }}>
        {/* Filtre */}
        <div className="flex flex-wrap gap-3 mb-5">
          <input
            value={searchNume} onChange={e=>setSearchNume(e.target.value)}
            placeholder="🔍 Caută client sau telefon..."
            style={{ padding:'6px 12px', borderRadius:8, border:'1px solid rgba(100,160,255,0.2)', background:'rgba(20,38,65,0.8)', color:'rgba(214,228,244,0.9)', fontSize:13, outline:'none', minWidth:220 }}
          />
          <select value={filterApt} onChange={e=>setFilterApt(e.target.value)} style={{ width: 200 }}>
            <option value="">Toate apartamentele</option>
            {apartamente.map(a=><option key={a.id} value={a.id}>{a.nume}</option>)}
          </select>
          <select value={filterCanal} onChange={e=>setFilterCanal(e.target.value)} style={{ width: 150 }}>
            <option value="">Toate canalele</option>
            {Object.entries(CANALE_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ width: 150 }}>
            <option value="">Toate statusurile</option>
            {Object.entries(STATUS_REZERVARE_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          {/* Date range */}
          <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(14,27,43,0.5)',border:'1px solid rgba(159,215,255,0.12)',borderRadius:9,padding:'4px 10px'}}>
            <span style={{fontSize:11,color:'rgba(159,215,255,0.45)',whiteSpace:'nowrap'}}>Check-in</span>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
              style={{fontSize:12,padding:'3px 6px',background:'transparent',border:'none',color:'#FFFFFF',width:120,outline:'none'}}/>
            <span style={{fontSize:11,color:'rgba(159,215,255,0.3)'}}>→</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
              style={{fontSize:12,padding:'3px 6px',background:'transparent',border:'none',color:'#FFFFFF',width:120,outline:'none'}}/>
          </div>
          {/* Quick presets */}
          <div style={{display:'flex',gap:4}}>
            {[
              {label:'Azi', fn:()=>{const t=new Date().toISOString().split('T')[0];setDateFrom(t);setDateTo(t)}},
              {label:'7 zile', fn:()=>{const t=new Date();const from=new Date(t);from.setDate(from.getDate()-7);setDateFrom(from.toISOString().split('T')[0]);setDateTo(t.toISOString().split('T')[0])}},
              {label:'Luna', fn:()=>{const t=new Date();const from=new Date(t.getFullYear(),t.getMonth(),1);const to=new Date(t.getFullYear(),t.getMonth()+1,0);setDateFrom(toYMD(from));setDateTo(toYMD(to))}},
              {label:'Luna trecută', fn:()=>{const t=new Date();const from=new Date(t.getFullYear(),t.getMonth()-1,1);const to=new Date(t.getFullYear(),t.getMonth(),0);setDateFrom(toYMD(from));setDateTo(toYMD(to))}},
              {label:'An', fn:()=>{const y=new Date().getFullYear();setDateFrom(`${y}-01-01`);setDateTo(`${y}-12-31`)}},
            ].map(({label,fn})=>(
              <button key={label} onClick={fn} style={{fontSize:11,padding:'4px 9px',borderRadius:6,background:'rgba(77,163,255,0.1)',border:'1px solid rgba(159,215,255,0.12)',color:'rgba(159,215,255,0.6)',cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.12s'}}>
                {label}
              </button>
            ))}
          </div>
          {(filterCanal||filterStatus||filterApt||dateFrom||dateTo||searchNume) && (
            <Button variant="ghost" size="sm" onClick={()=>{setFilterCanal('');setFilterStatus('');setFilterApt('');setDateFrom('');setDateTo('')}}>✕ Reset</Button>
          )}
        </div>

        {/* De facturat, grupate pe lună */}
        {deFacturat.length > 0 && (
          <div className="bg-[#161b27] border border-[#2a3350] rounded-[14px] overflow-hidden mb-5">
            <div style={{padding:'14px 18px',borderBottom:'1px solid #2a3350',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:14,fontWeight:700,color:'#E8F4FF'}}>📄 De facturat</span>
              <span style={{fontSize:11,padding:'2px 8px',borderRadius:6,background:'rgba(251,191,36,0.12)',color:'#FBBF24',border:'1px solid rgba(251,191,36,0.25)',fontWeight:600}}>{deFacturat.length}</span>
            </div>
            <div style={{padding:'12px 18px 16px'}}>
              {facturareGrupat.map(([luna, list]) => {
                const [y,m] = luna.split('-')
                const total = list.reduce((s,r)=>s+Number(r.suma_incasata||0),0)
                const expanded = expandedLuni.has(luna)
                return (
                  <div key={luna} style={{marginBottom:10,border:'1px solid rgba(159,215,255,0.1)',borderRadius:10,overflow:'hidden'}}>
                    <button onClick={()=>toggleLuna(luna)} style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:'rgba(20,38,65,0.5)',border:'none',cursor:'pointer'}}>
                      <span style={{fontSize:13,fontWeight:600,color:'#E8F4FF'}}>
                        {LUNI[parseInt(m)]||luna} {y}
                        <span style={{color:'rgba(159,215,255,0.5)',fontWeight:400,marginLeft:8}}>({list.length} rezervări · {total.toLocaleString('ro-RO')} RON)</span>
                      </span>
                      {expanded ? <ChevronUp size={14} color="#7BC8FF"/> : <ChevronDown size={14} color="#7BC8FF"/>}
                    </button>
                    {expanded && (
                      <div style={{padding:'6px 14px 12px'}}>
                        {list.map((r:any) => (
                          <div key={r.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(159,215,255,0.06)',gap:10,flexWrap:'wrap'}}>
                            <div>
                              <span style={{fontSize:13,color:'var(--text)',fontWeight:500}}>{r.nume_client}</span>
                              <span style={{fontSize:11,color:'var(--text3)',marginLeft:8}}>{r.apartament?.nume||'—'} · {r.data_checkin} → {r.data_checkout}</span>
                            </div>
                            <div style={{display:'flex',alignItems:'center',gap:10}}>
                              <span style={{fontFamily:'monospace',fontSize:13,color:'var(--green)',fontWeight:600}}>{Number(r.suma_incasata).toLocaleString('ro-RO')} {r.moneda}</span>
                              <button onClick={()=>marcheazaFacturat([r.id])} style={{fontSize:11,padding:'5px 10px',borderRadius:7,background:'rgba(34,197,94,0.12)',border:'1px solid rgba(34,197,94,0.3)',color:'#4ADE80',cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>
                                ✓ Facturat
                              </button>
                            </div>
                          </div>
                        ))}
                        <button onClick={()=>marcheazaFacturat(list.map((r:any)=>r.id))} style={{marginTop:10,fontSize:11,padding:'6px 12px',borderRadius:7,background:'rgba(77,163,255,0.1)',border:'1px solid rgba(77,163,255,0.2)',color:'#7BC8FF',cursor:'pointer',fontWeight:600}}>
                          ✓ Marchează toată luna ca facturată
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="bg-[#161b27] border border-[#2a3350] rounded-[14px] overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState icon={<CalendarCheck size={48}/>} title="Nicio rezervare" desc="Adaugă prima rezervare" action={<Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Adaugă rezervare</Button>}/>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>
                  <th style={{width:36,paddingRight:0}} onClick={e=>e.stopPropagation()}>
                    <input type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length }}
                      onChange={toggleAll}
                      style={{cursor:'pointer',width:15,height:15,accentColor:'#4DA3FF'}}
                    />
                  </th>
                  <th>Client</th><th>Apartament</th><th>Canal</th>
                  <th onClick={e=>{e.stopPropagation();comutaSort()}} style={{cursor:'pointer',userSelect:'none',color:'#7BC8FF'}} title="Schimbă ordinea">
                    Check-in {sortCrescator ? '↑' : '↓'}
                  </th><th>Check-out</th><th>Nopți</th>
                  <th>Sumă</th><th>Proprietar</th><th>Status</th><th>Plată</th><th>Decont</th><th>Facturare</th><th></th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} onClick={() => openEdit(r)} style={{background: selected.has(r.id) ? 'rgba(77,163,255,0.08)' : undefined}}>
                      <td style={{paddingRight:0,width:36}} onClick={e=>e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          style={{cursor:'pointer',width:15,height:15,accentColor:'#4DA3FF'}}
                        />
                      </td>
                      <td>
                        <span style={{color:'var(--text)',fontWeight:500}}>{r.nume_client}</span>
                        <br/>
                        <span style={{fontSize:11,color:'var(--text3)'}}>
                          {r.nr_persoane} pers
                          {r.telefon_client && <span style={{color:'rgba(34,197,94,0.7)',marginLeft:6}}>{r.telefon_client}</span>}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text)' }}>{r.apartament?.nume||'—'}</td>
                      <td><CanalBadge canal={r.canal}/></td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.data_checkin}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.data_checkout}</td>
                      <td style={{ textAlign: 'center' }}>{r.nr_nopti}</td>
                      <td><span style={{ fontFamily: 'monospace', color: 'var(--green)', fontWeight: 600 }}>{Number(r.suma_incasata).toLocaleString('ro-RO')}</span><br/><span style={{ fontSize: 11, color: 'var(--text3)' }}>{r.moneda}</span></td>
                      <td style={{ color: 'var(--text3)', fontSize: 12 }}><span style={{ color: 'var(--green)', fontFamily: 'monospace' }}>{Number(r.suma_proprietar).toLocaleString('ro-RO')} RON</span></td>
                      <td><Badge color={STATUS_COLOR[r.status_rezervare]||'gray'}>{STATUS_REZERVARE_LABEL[r.status_rezervare]||r.status_rezervare}</Badge></td>
                      <td><Badge color={PLATA_COLOR[r.status_plata]||'gray'}>{STATUS_PLATA_LABEL[r.status_plata]||r.status_plata}</Badge></td>
                      <td><Badge color={DECONT_COLOR[r.status_decont]||'gray'}>{r.status_decont}</Badge></td>
                      <td><Badge color={FACTURARE_COLOR[r.status_facturare]||'gray'}>{STATUS_FACTURARE_LABEL[r.status_facturare]||'Nefacturat'}</Badge></td>
                      <td onClick={e=>e.stopPropagation()}>
                        <div style={{display:'flex',gap:4,alignItems:'center'}}>
                          {r.telefon_client && (
                            <a
                              href={`https://wa.me/${r.telefon_client.replace(/[^0-9]/g,'')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e=>e.stopPropagation()}
                              title={`WhatsApp ${r.telefon_client}`}
                              style={{
                                display:'inline-flex',alignItems:'center',justifyContent:'center',
                                width:28,height:28,borderRadius:7,
                                background:'rgba(34,197,94,0.12)',
                                border:'1px solid rgba(34,197,94,0.25)',
                                color:'#4ADE80',textDecoration:'none',
                                transition:'all 0.15s',
                              }}
                            >
                              <MessageCircle size={13}/>
                            </a>
                          )}
                          {r.telefon_client && (
                            <button onClick={e=>{e.stopPropagation();deschideSabloane(r)}}
                              title="Trimite șablon WhatsApp"
                              style={{display:'inline-flex',alignItems:'center',justifyContent:'center',
                                width:28,height:28,borderRadius:7,border:'1px solid rgba(77,163,255,0.3)',
                                background:'rgba(77,163,255,0.1)',color:'#7BC8FF',cursor:'pointer'}}>
                              📋
                            </button>
                          )}
                          {r.apartament?.proprietar?.telefon && PROPRIETAR_NOTIF_APT_IDS.includes(r.apartament?.id) && (
                            <a
                              href={waLinkProprietar(r)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e=>{e.stopPropagation();supabase.from('rezervari').update({proprietar_notificat:true}).eq('id',r.id).then(()=>{})}}
                              title={`Notifică proprietarul (${r.apartament.proprietar.telefon})`}
                              style={{
                                display:'inline-flex',alignItems:'center',justifyContent:'center',
                                width:28,height:28,borderRadius:7,
                                background:'rgba(167,139,250,0.12)',
                                border:'1px solid rgba(167,139,250,0.3)',
                                color:'#A78BFA',textDecoration:'none',
                              }}
                            >
                              🏠
                            </a>
                          )}
                          <Button variant="ghost" size="sm" icon={<Edit2 size={13}/>} onClick={()=>openEdit(r)}/>
                          <Button variant="ghost" size="sm" icon={<Trash2 size={13}/>} onClick={()=>setDeleteId(r.id)}/>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <RezervareModal open={open} editing={editing} setEditing={setEditing} apartamente={apartamente}
        onAptChange={onAptChange} recalcComisionPlatforma={recalcComisionPlatforma} calcul={c}
        saving={saving} onSave={save} onClose={()=>setOpen(false)} onReload={load} />

      <ConfirmDialog open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={deleteRez}
        title="Șterge rezervare" message="Sigur vrei să ștergi această rezervare?" />
      {/* Bulk delete confirm */}
      {showBulkConfirm && (
        <div onClick={()=>setShowBulkConfirm(false)} style={{position:'fixed',inset:0,zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(6,14,26,0.8)',backdropFilter:'blur(8px)'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'rgba(14,27,43,0.96)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:16,padding:'28px',width:360,textAlign:'center',boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}}>
            <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
            <div style={{fontSize:16,fontWeight:600,color:'#FFFFFF',marginBottom:8}}>Șterge {selected.size} rezervări?</div>
            <div style={{fontSize:13,color:'rgba(159,215,255,0.5)',marginBottom:24}}>Această acțiune nu poate fi anulată.</div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setShowBulkConfirm(false)} style={{flex:1,padding:'10px',borderRadius:10,background:'transparent',border:'1px solid rgba(159,215,255,0.15)',color:'rgba(159,215,255,0.6)',fontSize:13,cursor:'pointer'}}>Anulează</button>
              <button onClick={bulkDelete} disabled={bulkDeleting} style={{flex:1,padding:'10px',borderRadius:10,background:'rgba(239,68,68,0.2)',border:'1px solid rgba(239,68,68,0.4)',color:'#F87171',fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
                {bulkDeleting ? 'Se șterge...' : <><Trash2 size={14}/> Șterge definitiv</>}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast toast={toast}/>

      {/* Popup sabloane */}
      {sabloanePop && (
        <div onClick={()=>setSabloanePop(null)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()}
            style={{width:'100%',maxWidth:480,background:'rgba(8,18,36,0.99)',border:'1px solid rgba(100,160,255,0.25)',borderRadius:16,padding:20,maxHeight:'80vh',overflowY:'auto' as const}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:'#E8F4FF'}}>📋 Trimite șablon</div>
                <div style={{fontSize:12,color:'rgba(159,215,255,0.5)',marginTop:2}}>{sabloanePop.rez.nume_client} · {sabloanePop.rez.telefon_client}</div>
              </div>
              <button onClick={()=>setSabloanePop(null)} style={{background:'none',border:'none',color:'rgba(159,215,255,0.4)',fontSize:20,cursor:'pointer'}}>✕</button>
            </div>
            {sabloane.length===0 && (
              <div style={{textAlign:'center' as const,padding:'24px 0',color:'rgba(159,215,255,0.3)',fontSize:13}}>
                Niciun șablon pentru acest apartament.<br/>
                <a href="/sabloane" target="_blank" style={{color:'#7BC8FF',fontSize:12}}>→ Adaugă din pagina Șabloane</a>
              </div>
            )}
            {sabloane.map((s:any) => {
              const firstName = (sabloanePop.rez.nume_client||'').split(' ')[0]
              const preview = (s.text||'').replace(/{nume}/g, firstName)
              return (
                <div key={s.id} style={{background:'rgba(11,22,42,0.7)',border:'1px solid rgba(100,160,255,0.1)',borderRadius:12,padding:14,marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:600,color:'#E8F4FF'}}>{s.titlu}</span>
                    <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,background:'rgba(77,163,255,0.12)',color:'#7BC8FF',border:'1px solid rgba(77,163,255,0.2)'}}>{s.tip}</span>
                  </div>
                  <div style={{fontSize:12,color:'rgba(159,215,255,0.6)',whiteSpace:'pre-wrap' as const,lineHeight:1.5,marginBottom:s.poze?.length?8:0,maxHeight:100,overflow:'hidden'}}>
                    {preview}
                  </div>
                  {s.poze?.length>0 && (
                    <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap' as const}}>
                      {s.poze.map((url:string,i:number)=>(
                        <img key={i} src={url} alt="" style={{width:56,height:56,borderRadius:6,objectFit:'cover' as const,border:'1px solid rgba(100,160,255,0.2)'}}/>
                      ))}
                    </div>
                  )}
                  <button onClick={()=>trimiteWA(sabloanePop.rez, s)}
                    style={{width:'100%',padding:'10px',borderRadius:9,border:'none',background:'linear-gradient(135deg,#22C55E,#16A34A)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                    💬 Trimite pe WhatsApp
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
