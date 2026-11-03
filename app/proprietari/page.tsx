'use client'
import { useEffect, useState } from 'react'
import { supabase, Proprietar, calculeazaDecont } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Badge, Card, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog, ConnectionError } from '@/components/ui'
import { Plus, Users, Edit2, Trash2, Phone, Mail, Building2, ChevronDown, ChevronUp, RefreshCw, Check, TrendingUp, FileText, Download, X } from 'lucide-react'
import { decontComision } from '@/lib/decontComision'
import { citesteTaxe, curateniiTaxate } from '@/lib/taxeCuratenie'
import DeconturiContent from '@/components/DeconturiContent'

const empty: Partial<Proprietar> = { nume:'', email:'', telefon:'', iban:'', banca:'', adresa:'', cnp_cui:'', nota:'' }
const LUNI = ['','Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']
type BadgeColor = 'green'|'amber'|'red'|'blue'|'gray'
const STATUS_COLOR: Record<string, BadgeColor> = { draft:'gray', aprobat:'amber', platit:'green' }

const pad = (n:number) => String(n).padStart(2,'0')
// formateaza local (YYYY-MM-DD) - .toISOString() taie ultima zi a lunii pentru fuse est de UTC (ex: Romania)
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

async function getCursEUR(): Promise<number> {
  try {
    const res = await fetch('/api/curs-bnr')
    const data = await res.json()
    if (data?.curs) return data.curs
  } catch {}
  return 5.0 // fallback
}

export default function ProprietariPage() {
  const now = new Date()
  const [mainTab, setMainTab] = useState<'proprietari'|'deconturi'>('proprietari')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [proprietari, setProprietari] = useState<any[]>([])
  const [apts, setApts] = useState<any[]>([])
  const [chirii, setChirii] = useState<any[]>([])
  const [cheltuieli, setCheltuieli] = useState<any[]>([])
  const [cursEUR, setCursEUR] = useState(5.0)
  const [cursLoading, setCursLoading] = useState(false)
  const [luna, setLuna] = useState(now.getMonth()+1)
  const [an, setAn] = useState(now.getFullYear())
  const [expandedId, setExpandedId] = useState<string|null>(null)
  const [platiStatus, setPlatiStatus] = useState<Record<string,any>>({})
  // plati partiale din Cheltuieli → Fișe (setari plata_partiala_<idCheltuiala>), ca sumele sa fie aceleasi in ambele pagini
  const [partiale, setPartiale] = useState<Record<string, number>>({})
  // apartamentele pe comision: rezervarile lunii, curateniile din evidenta si starea decontului (setari decont_proprietar_<apt>_<an>_<luna>)
  const [rezLuna, setRezLuna] = useState<any[]>([])
  const [curEvid, setCurEvid] = useState<Record<string, { total: number; nr: number }>>({})
  const [decontPlatit, setDecontPlatit] = useState<Record<string, { platit: boolean; suma: number; data: string; platitSuma?: number; editat?: boolean }>>({})
  const [savingPlata, setSavingPlata] = useState<string|null>(null)
  // Apartamente asociate — select-ul de "+ Adaugă apartament" e comun, un singur card e expandat oricand
  const [addSel, setAddSel] = useState('')
  const [savingApt, setSavingApt] = useState<string|null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Proprietar>>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])
  useEffect(() => { loadLunar() }, [luna, an, apts])

  async function load() {
    setLoading(true)
    setLoadError(false)
    const bail=setTimeout(()=>{ setLoading(false); setLoadError(true) },20000)
    try{
      const [{ data: propData }, { data: aptData }, { data: chiriiData }] = await Promise.all([
        supabase.from('proprietari').select('*').order('nume'),
        supabase.from('apartamente').select('id,nume,nota,status,proprietar_id,utilitati_la_proprietar,comision_tip,comision_procent,comision_fix,cost_curatenie_per_rezervare').order('nota'),
        supabase.from('chirii_fixe').select('*').eq('activ', true),
      ])
      setProprietari(propData||[])
      setApts(aptData||[])
      setChirii(chiriiData||[])
      clearTimeout(bail)
    }catch(err){console.error('[proprietari load]',err);clearTimeout(bail);setLoadError(true)}
    setLoading(false)
    // Curs BNR
    setCursLoading(true)
    const curs = await getCursEUR()
    setCursEUR(curs)
    setCursLoading(false)
  }

  async function loadLunar() {
    const pz = `${an}-${pad(luna)}-01`
    const uz = toYMD(new Date(an, luna, 0))
    const [{ data: chData }, { data: liniiData }] = await Promise.all([
      // si chiria: sursa sumelor si a starii de plata e Cheltuieli (cerut direct: „conform cu cheltuielile să se actualizeze
      // sumele și în proprietari”) - chirii_fixe ramane doar rezerva, cand luna n-are rand de chirie in Cheltuieli
      supabase.from('cheltuieli')
        .select('id,apartament_id,categorie,valoare,status,data_plata')
        .gte('data', pz).lte('data', uz)
        .in('categorie', ['chirie','asociatie','eon_curent','eon_gaz','eon_duo']),
      supabase.from('plati_proprietari_linii').select('*')
        .eq('luna', luna).eq('an', an),
    ])
    setCheltuieli(chData||[])
    const ids = (chData || []).map((c: any) => c.id)
    const { data: pp } = ids.length ? await supabase.from('setari').select('cheie,valoare').in('cheie', ids.map((id: string) => 'plata_partiala_' + id)) : { data: [] as any[] }
    const pm: Record<string, number> = {}
    for (const x of pp || []) { try { const v = JSON.parse(x.valoare); if (Array.isArray(v)) pm[x.cheie.replace('plata_partiala_', '')] = v.reduce((t: number, q: any) => t + (Number(q.suma) || 0), 0) } catch {} }
    setPartiale(pm)
    // decontul apartamentelor pe comision (cu proprietar) - aceleasi reguli ca in Rapoarte, vezi lib/decontComision.ts
    const aptsCom = apts.filter(a => a.proprietar_id && a.comision_tip && a.comision_tip !== 'fara_comision')
    if (aptsCom.length) {
      const idsCom = aptsCom.map(a => a.id)
      const cfgTaxe = await citesteTaxe()
      const [{ data: rz }, cur, { data: dp }, { data: ex }] = await Promise.all([
        supabase.from('rezervari').select('id,apartament_id,data_checkin,data_checkout,nr_nopti,suma_incasata,canal,status_rezervare,camera_semnalata,comision_platforma_valoare,tva_comision_platforma')
          .in('apartament_id', idsCom).gt('data_checkout', pz).lte('data_checkin', uz).in('status_rezervare', ['confirmata', 'finalizata']),
        curateniiTaxate(pz, uz, cfgTaxe, idsCom.filter(id => cfgTaxe.apt[id])),
        supabase.from('setari').select('cheie,valoare').in('cheie', idsCom.map(id => `decont_proprietar_${id}_${an}_${luna}`)),
        // rezervarile debifate in Rapoarte (exclus din raport) nu intra nici in decont
        supabase.from('setari').select('valoare').eq('cheie', 'raport_rezervari_excluse').maybeSingle(),
      ])
      let excluse: string[] = []; try { excluse = JSON.parse(ex?.valoare || '[]') } catch {}
      setRezLuna((rz || []).filter((r: any) => r.camera_semnalata !== 'NEALOCAT' && !excluse.includes(r.id)))
      const ce: Record<string, { total: number; nr: number }> = {}
      for (const id of idsCom.filter(id => cfgTaxe.apt[id])) { const x = cur.filter(c => c.apartament_id === id); ce[id] = { total: x.reduce((t, c) => t + c.suma, 0), nr: x.length } }
      setCurEvid(ce)
      const dm: Record<string, any> = {}
      for (const x of dp || []) { try { dm[x.cheie.split('_')[2]] = JSON.parse(x.valoare) } catch {} }
      setDecontPlatit(dm)
    } else { setRezLuna([]); setCurEvid({}); setDecontPlatit({}) }
    const lm: Record<string, any> = {}
    ;(liniiData || []).forEach((l: any) => { lm[`${l.apartament_id}_${l.tip}`] = l })
    setPlatiStatus(lm)
  }

  // Calcul detaliat per apartament: chirie (live, la cursul curent) + utilitati (doar daca apt.utilitati_la_proprietar)
  // + starea liniei de plata salvata (platit/nu, si suma inghetata in momentul platii)
  function calcTotal(propId: string) {
    const propApts = apts.filter(a => a.proprietar_id === propId)
    let totalRON = 0, totalPlatit = 0
    const detalii: any[] = []

    // cat s-a platit dintr-un set de randuri din Cheltuieli: integral (validat) sau partial (plati partiale)
    const platitDin = (rows: any[]) => rows.reduce((t: number, c: any) => t + (['validat','platit'].includes(c.status) ? Number(c.valoare||0) : Math.min(Number(c.valoare||0), partiale[c.id] || 0)), 0)
    propApts.forEach(apt => {
      const chirie = chirii.find(c => c.apartament_id === apt.id)
      const utilApt = cheltuieli.filter(c => c.apartament_id === apt.id && c.categorie !== 'chirie')
      const chirieCh = cheltuieli.filter(c => c.apartament_id === apt.id && c.categorie === 'chirie')
      const eon = utilApt.filter(c => ['eon_curent','eon_gaz','eon_duo'].includes(c.categorie)).reduce((s:number,c:any) => s+Number(c.valoare||0), 0)
      const asoc = utilApt.filter(c => c.categorie === 'asociatie').reduce((s:number,c:any) => s+Number(c.valoare||0), 0)
      const utilTotal = Math.round(eon + asoc)
      const utilPermis = !!apt.utilitati_la_proprietar

      const pz = `${an}-${pad(luna)}-01`, uz = toYMD(new Date(an, luna, 0))
      const decont = apt.comision_tip && apt.comision_tip !== 'fara_comision' ? decontComision(apt, rezLuna.filter(r => r.apartament_id === apt.id), pz, uz, curEvid[apt.id] || null) : null
      if (!chirie && !chirieCh.length && (!utilPermis || utilTotal === 0) && !(decont && decont.nrRezervari)) return

      const liniiApt: any[] = []

      if (chirieCh.length) {
        // suma si plata vin din Cheltuieli (randul „Chirie” al lunii) - bifa de aici marcheaza acelasi rand acolo
        const suma = Math.round(chirieCh.reduce((t: number, c: any) => t + Number(c.valoare||0), 0))
        const pl = Math.round(platitDin(chirieCh))
        const platit = pl >= suma
        // suma din Apartamente → Plăți o aratam doar daca se potriveste cu cea din Cheltuieli (altfel ar fi contradictoriu)
        const fixRON = chirie ? (chirie.moneda === 'EUR' ? chirie.suma * cursEUR : chirie.suma) * (chirie.cu_tva ? 1.21 : 1) : 0
        const label = (chirie && Math.abs(fixRON - suma) <= suma * 0.01 ? `${chirie.moneda === 'EUR' ? chirie.suma + ' EUR' : chirie.suma + ' RON'} · ` : '') + 'din Cheltuieli'
        liniiApt.push({ tip: 'chirie', label, suma, platit, platitSuma: platit ? suma : pl, linie: platiStatus[`${apt.id}_chirie`], randuri: chirieCh })
        totalRON += suma
        totalPlatit += platit ? suma : pl
      } else if (chirie) {
        // chirie.suma e baza FARA TVA - daca e bifat cu_tva (Apartamente → Plăți), platim si TVA-ul catre proprietar
        const sumaBaza = chirie.moneda === 'EUR' ? chirie.suma * cursEUR : chirie.suma
        const liveRON = Math.round(chirie.cu_tva ? sumaBaza * 1.21 : sumaBaza)
        const linie = platiStatus[`${apt.id}_chirie`]
        const platit = !!linie?.platit
        const sumaAfisata = platit ? Number(linie.suma_ron) : liveRON
        const labelMoneda = chirie.moneda === 'EUR' ? `${chirie.suma} EUR (${platit ? Number(linie.curs_eur).toFixed(4) : cursEUR.toFixed(4)})` : 'RON'
        liniiApt.push({ tip: 'chirie', label: chirie.cu_tva ? `${labelMoneda} + TVA 21%` : labelMoneda, suma: sumaAfisata, platit, linie })
        totalRON += sumaAfisata
        if (platit) totalPlatit += sumaAfisata
      }

      if (utilPermis && utilTotal > 0) {
        // starea de plata vine din Cheltuieli (facturile E.ON / Asociatie ale lunii), inclusiv platile partiale
        const linie = platiStatus[`${apt.id}_utilitati`]
        const randuri = utilApt.filter(c => ['eon_curent','eon_gaz','eon_duo','asociatie'].includes(c.categorie))
        const pl = Math.round(platitDin(randuri))
        const platit = pl >= utilTotal
        liniiApt.push({ tip: 'utilitati', label: `E.ON ${Math.round(eon)} + Asociație ${Math.round(asoc)}`, suma: utilTotal, platit, platitSuma: platit ? utilTotal : pl, linie, randuri })
        totalRON += utilTotal
        totalPlatit += platit ? utilTotal : pl
      }

      // decontul pe comision (incasari − platforme − TVA intracomunitar − curatenie − comision AB) - separat de chirie
      if (decont && decont.nrRezervari) {
        const st = decontPlatit[apt.id]
        const platit = !!st?.platit
        // suma editata de mana in Deconturi (st.editat) are prioritate fata de calcul; plata poate fi si partiala (st.platitSuma)
        const suma = Math.round(platit || st?.editat ? Number(st.suma) : decont.deVirat)
        const platitSuma = platit ? suma : Math.min(suma, Math.round(Number(st?.platitSuma) || 0))
        liniiApt.push({ tip: 'decont', label: `${decont.nrRezervari} rez. · comision ${decont.comisionText}`, suma, platit, platitSuma, decont })
        totalRON += suma
        totalPlatit += platitSuma
      }

      if (liniiApt.length === 0) return
      detalii.push({ apt, linii: liniiApt, subtotal: liniiApt.reduce((s,l) => s+l.suma, 0) })
    })

    return { totalRON, totalPlatit, totalRamas: totalRON - totalPlatit, detalii }
  }

  async function toggleLinie(propId: string, apt: any, tip: 'chirie'|'utilitati'|'decont', linieExistenta: any, l?: any) {
    const key = `${apt.id}_${tip}`
    setSavingPlata(key)
    // decontul pe comision: starea de plata (si suma inghetata la plata) in setari
    if (tip === 'decont') {
      const nou = !l?.platit
      const { error } = await supabase.from('setari').upsert({ cheie: `decont_proprietar_${apt.id}_${an}_${luna}`, valoare: JSON.stringify({ ...(decontPlatit[apt.id] || {}), platit: nou, suma: l?.suma || 0, platitSuma: nou ? l?.suma || 0 : 0, data: new Date().toISOString().slice(0,10) }) }, { onConflict: 'cheie' })
      setSavingPlata(null)
      show(error ? 'error' : 'success', error ? error.message : nou ? 'Decont marcat ca plătit' : 'Decont marcat ca neplătit')
      loadLunar()
      return
    }
    // linie legata de Cheltuieli: bifa marcheaza (sau demarcheaza) aceleasi randuri acolo, ca cele doua pagini sa arate la fel
    if (l?.randuri?.length) {
      const nou = !l.platit, ids = l.randuri.map((c: any) => c.id)
      const { error } = await supabase.from('cheltuieli').update(nou ? { status: 'validat', data_plata: new Date().toISOString().slice(0,10) } : { status: 'nevalidat', data_plata: null }).in('id', ids)
      const rec = { proprietar_id: propId, apartament_id: apt.id, luna, an, tip, suma_ron: l.suma, curs_eur: null, suma_eur: null, platit: nou, data_platii: nou ? new Date().toISOString().slice(0,10) : null }
      if (linieExistenta?.id) await supabase.from('plati_proprietari_linii').update(rec).eq('id', linieExistenta.id)
      else await supabase.from('plati_proprietari_linii').insert(rec)
      setSavingPlata(null)
      show(error ? 'error' : 'success', error ? error.message : nou ? 'Marcat ca plătit (și în Cheltuieli)' : 'Marcat ca neplătit (și în Cheltuieli)')
      loadLunar()
      return
    }
    const nouPlatit = !linieExistenta?.platit
    let payload: any
    if (nouPlatit) {
      // La marcarea ca platit, inghetam suma RON + cursul EUR folosit ACUM (aprox data platii)
      if (tip === 'chirie') {
        const chirie = chirii.find(c => c.apartament_id === apt.id)
        const sumaBaza = chirie.moneda === 'EUR' ? chirie.suma * cursEUR : chirie.suma
        const sumaRon = Math.round(chirie.cu_tva ? sumaBaza * 1.21 : sumaBaza)
        payload = { proprietar_id: propId, apartament_id: apt.id, luna, an, tip, suma_ron: sumaRon, curs_eur: chirie.moneda === 'EUR' ? cursEUR : null, suma_eur: chirie.moneda === 'EUR' ? chirie.suma : null, platit: true, data_platii: new Date().toISOString().slice(0,10) }
      } else {
        const utilApt = cheltuieli.filter(c => c.apartament_id === apt.id)
        const total = Math.round(utilApt.filter(c => ['eon_curent','eon_gaz','eon_duo','asociatie'].includes(c.categorie)).reduce((s:number,c:any) => s+Number(c.valoare||0), 0))
        payload = { proprietar_id: propId, apartament_id: apt.id, luna, an, tip, suma_ron: total, curs_eur: null, suma_eur: null, platit: true, data_platii: new Date().toISOString().slice(0,10) }
      }
    } else {
      payload = { platit: false, data_platii: null }
    }
    if (linieExistenta?.id) {
      await supabase.from('plati_proprietari_linii').update(payload).eq('id', linieExistenta.id)
    } else {
      await supabase.from('plati_proprietari_linii').insert(payload)
    }
    setSavingPlata(null)
    show('success', nouPlatit ? 'Marcat ca plătit' : 'Marcat ca neplătit')
    loadLunar()
  }

  // Asociaza/dezasociaza un apartament unui proprietar direct din pagina Proprietari (fara sa mergi in Apartamente → Plăți)
  async function adaugaApartLaProprietar(propId: string, aptId: string) {
    if (!aptId) return
    setSavingApt(aptId)
    const { error } = await supabase.from('apartamente').update({ proprietar_id: propId }).eq('id', aptId)
    setSavingApt(null)
    if (error) { show('error', error.message); return }
    show('success', 'Apartament asociat')
    setAddSel('')
    load()
  }
  async function scoateApartDinProprietar(aptId: string) {
    setSavingApt(aptId)
    const { error } = await supabase.from('apartamente').update({ proprietar_id: null }).eq('id', aptId)
    setSavingApt(null)
    if (error) { show('error', error.message); return }
    show('success', 'Apartament scos de la acest proprietar')
    load()
  }

  function openNew() { setEditing(empty); setOpen(true) }
  function openEdit(p: Proprietar) { setEditing({ ...p }); setOpen(true) }

  async function save() {
    if (!editing.nume) { show('error', 'Completează numele proprietarului'); return }
    setSaving(true)
    const payload = {
      nume: editing.nume, email: editing.email||null, telefon: editing.telefon||null,
      iban: editing.iban||null, banca: editing.banca||null, adresa: editing.adresa||null,
      cnp_cui: editing.cnp_cui||null, nota: editing.nota||null,
    }
    const { error } = editing.id
      ? await supabase.from('proprietari').update(payload).eq('id', editing.id)
      : await supabase.from('proprietari').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', editing.id ? 'Proprietar actualizat' : 'Proprietar adăugat')
    setOpen(false); setSaving(false); load()
  }

  async function deleteProp() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('proprietari').delete().eq('id', deleteId)
    setDeleteId(null); setDeleting(false); load()
    show('success', 'Proprietar șters')
  }

  if (loading && mainTab === 'proprietari') return (<><PageHeader title="Proprietari" /><PageLoading /></>)
  if (loadError && mainTab === 'proprietari') return (<><PageHeader title="Proprietari" /><ConnectionError onRetry={()=>load()}/></>)

  const s = {
    card: { background:'rgba(11,22,42,0.8)', border:'1px solid rgba(159,215,255,0.1)', borderRadius:14, marginBottom:12, overflow:'hidden' as const },
    header: { padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' as const },
    badge: (color:string) => ({ fontSize:10, padding:'2px 8px', borderRadius:20, background:`${color}20`, color, border:`1px solid ${color}30`, fontWeight:600 }),
    nota: { fontSize:10, fontFamily:'monospace', padding:'1px 6px', borderRadius:4, background:'rgba(77,163,255,0.12)', color:'#4DA3FF', fontWeight:700 },
    row: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' },
    label: { fontSize:11, color:'rgba(159,215,255,0.5)' },
    val: { fontSize:12, fontWeight:600, color:'#fff' },
  }

  const tabStyle = (a: boolean): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 13, fontWeight: 600, border: 'none',
    background: a ? 'rgba(77,163,255,0.15)' : 'transparent',
    color: a ? '#4DA3FF' : 'rgba(159,215,255,0.5)',
    borderBottom: a ? '2px solid #4DA3FF' : '2px solid transparent',
  })

  return (
    <>
      <PageHeader title="Proprietari"
        subtitle={mainTab === 'proprietari' ? `${proprietari.length} proprietari` : 'Deconturi lunare proprietari'}
        actions={mainTab === 'proprietari' ? <Button variant="primary" icon={<Plus size={15}/>} onClick={openNew}>Proprietar nou</Button> : undefined} />
      <div style={{display:'flex', gap:4, padding:'0 20px', borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        <button style={tabStyle(mainTab==='proprietari')} onClick={()=>setMainTab('proprietari')}>👤 Proprietari</button>
        <button style={tabStyle(mainTab==='deconturi')} onClick={()=>setMainTab('deconturi')}>📄 Deconturi</button>
      </div>
      {mainTab === 'deconturi' && <DeconturiContent/>}
      {mainTab === 'proprietari' && <div style={{ padding:'16px 20px', overflowY:'auto' }}>

        {/* Selector lună + curs */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
          <select value={luna} onChange={e=>setLuna(Number(e.target.value))}
            style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'7px 12px', color:'#fff', fontSize:13 }}>
            {LUNI.slice(1).map((l,i) => <option key={i+1} value={i+1}>{l}</option>)}
          </select>
          <select value={an} onChange={e=>setAn(Number(e.target.value))}
            style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'7px 12px', color:'#fff', fontSize:13 }}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.2)' }}>
            <span style={{ fontSize:11, color:'rgba(74,222,128,0.7)' }}>EUR/RON BNR:</span>
            <span style={{ fontSize:13, fontWeight:700, color:'#4ADE80', fontFamily:'monospace' }}>
              {cursLoading ? '...' : cursEUR.toFixed(4)}
            </span>
            <button onClick={async()=>{ setCursLoading(true); setCursEUR(await getCursEUR()); setCursLoading(false) }}
              style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(74,222,128,0.6)', display:'flex' }}>
              <RefreshCw size={12}/>
            </button>
          </div>
        </div>

        {proprietari.length === 0 ? (
          <EmptyState icon={<Users size={48}/>} title="Niciun proprietar" desc="Adaugă proprietarii apartamentelor"
            action={<Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Adaugă proprietar</Button>}/>
        ) : proprietari.map(p => {
          const propApts = apts.filter(a => a.proprietar_id === p.id)
          const { totalRON, totalRamas, detalii } = calcTotal(p.id)
          const isExpanded = expandedId === p.id
          const statusPlata = totalRON === 0 ? 'neplatit' : totalRamas === 0 ? 'platit' : totalRamas === totalRON ? 'neplatit' : 'partial'
          const statusColor = statusPlata === 'platit' ? '#4ADE80' : statusPlata === 'partial' ? '#FCD34D' : '#F87171'

          return (
            <div key={p.id} style={s.card}>
              {/* Header card proprietar */}
              <div style={s.header} onClick={() => { setExpandedId(isExpanded ? null : p.id); setAddSel('') }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(77,163,255,0.12)', border:'1px solid rgba(77,163,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#4DA3FF', flexShrink:0 }}>
                  {p.nume.split(' ').map((n:string)=>n[0]).join('').substring(0,2).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{p.nume}</div>
                  <div style={{ display:'flex', gap:5, marginTop:3, flexWrap:'wrap' as const }}>
                    {propApts.map(a => <span key={a.id} style={s.nota}>{a.nota||a.nume}</span>)}
                    {propApts.length === 0 && <span style={{ fontSize:11, color:'rgba(159,215,255,0.3)' }}>Niciun apartament asociat</span>}
                  </div>
                </div>
                {totalRON > 0 && (
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:18, fontWeight:800, color:'#fff', fontFamily:'monospace' }}>{totalRON.toLocaleString('ro-RO')} <span style={{ fontSize:11, color:'rgba(159,215,255,0.5)' }}>RON</span></div>
                    <span style={s.badge(statusColor)}>{statusPlata}</span>
                  </div>
                )}
                <span style={{ color:'rgba(159,215,255,0.3)', flexShrink:0 }}>{isExpanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</span>
              </div>

              {/* Detalii expandate */}
              {isExpanded && (
                <div style={{ padding:'0 16px 16px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>

                  {/* Apartamente asociate — adaugi/scoți direct de aici, fara sa mergi in Apartamente → Plăți */}
                  <div style={{ marginTop:12, marginBottom:14 }}>
                    <div style={{ fontSize:10, fontWeight:600, color:'rgba(159,215,255,0.4)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Apartamente asociate</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:8 }}>
                      {propApts.length === 0 && <div style={{ fontSize:11, color:'rgba(159,215,255,0.35)' }}>Niciun apartament asociat încă</div>}
                      {propApts.map(a => (
                        <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:7, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)' }}>
                          <span style={s.nota}>{a.nota||'—'}</span>
                          <span style={{ fontSize:12, color:'rgba(214,228,244,0.7)', flex:1 }}>{a.nume}</span>
                          <button onClick={()=>scoateApartDinProprietar(a.id)} disabled={savingApt===a.id} title="Scoate de la acest proprietar"
                            style={{ background:'none', border:'none', cursor: savingApt===a.id?'wait':'pointer', color:'rgba(248,113,113,0.6)', display:'flex', alignItems:'center', padding:2, opacity: savingApt===a.id?0.5:1 }}>
                            <X size={12}/>
                          </button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <select value={addSel} onChange={e=>setAddSel(e.target.value)}
                        style={{ flex:1, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(159,215,255,0.15)', borderRadius:7, color:'#fff', fontSize:12, padding:'6px 8px' }}>
                        <option value="">— Alege apartament —</option>
                        {apts.filter(a=>a.proprietar_id!==p.id).map(a=>(
                          <option key={a.id} value={a.id}>{a.nota?`${a.nota} — `:''}{a.nume}{a.proprietar_id?' (mutat de la alt proprietar)':''}</option>
                        ))}
                      </select>
                      <button onClick={()=>adaugaApartLaProprietar(p.id, addSel)} disabled={!addSel||savingApt===addSel}
                        style={{ padding:'6px 12px', borderRadius:7, border:'1px solid rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.1)', color:'#7BC8FF', fontSize:12, cursor: addSel?'pointer':'not-allowed', opacity: addSel?1:0.5, whiteSpace:'nowrap' as const }}>
                        + Adaugă
                      </button>
                    </div>
                  </div>

                  {detalii.length === 0 ? (
                    <div style={{ padding:'20px 0', textAlign:'center', fontSize:12, color:'rgba(159,215,255,0.4)' }}>
                      Niciun apartament cu chirie configurată
                    </div>
                  ) : (
                    <>
                      {/* Tabel per apartament, cu bifa Platit pe fiecare linie */}
                      <div style={{ marginTop:12, marginBottom:14 }}>
                        {detalii.map(d => (
                          <div key={d.apt.id} style={{ padding:'10px 12px', background:'rgba(255,255,255,0.03)', borderRadius:9, marginBottom:6, border:'1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={s.nota}>{d.apt.nota}</span>
                                <span style={{ fontSize:12, color:'rgba(159,215,255,0.6)' }}>{d.apt.nume}</span>
                              </div>
                              <span style={{ fontSize:14, fontWeight:700, color:'#fff', fontFamily:'monospace' }}>{d.subtotal.toLocaleString('ro-RO')} RON</span>
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                              {d.linii.map((l:any) => (
                                <label key={l.tip} style={{ display:'flex', alignItems:'center', gap:8, cursor: savingPlata===`${d.apt.id}_${l.tip}` ? 'wait' : 'pointer', padding:'5px 8px', borderRadius:6, background: l.platit ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)' }}>
                                  <input type="checkbox" checked={l.platit} disabled={savingPlata===`${d.apt.id}_${l.tip}`}
                                    onChange={() => toggleLinie(p.id, d.apt, l.tip, l.linie, l)}/>
                                  <span style={{ fontSize:11, color: l.platit ? '#4ADE80' : 'rgba(159,215,255,0.6)', fontWeight:600, minWidth:62 }}>
                                    {l.tip === 'chirie' ? 'Chirie' : l.tip === 'decont' ? 'Decont' : 'Utilități'}
                                  </span>
                                  <span style={{ fontSize:10, color:'rgba(159,215,255,0.4)', flex:1 }}>{l.label}
                                    {l.tip === 'decont' && l.decont && <span data-decont style={{ display:'block', fontSize:10.5, color:'rgba(214,228,244,0.7)', lineHeight:1.5, marginTop:2 }}>
                                      Încasări {l.decont.brut.toLocaleString('ro-RO')} − comision platforme {l.decont.comPlatforme.toLocaleString('ro-RO')} − TVA intracomunitar {l.decont.tvaIntracom.toLocaleString('ro-RO')} = <b>{l.decont.netPlatforme.toLocaleString('ro-RO')}</b>
                                      {' '}− curățenie {l.decont.curatenie.toLocaleString('ro-RO')} ({l.decont.curatenieText}) − comision AB {l.decont.comision.toLocaleString('ro-RO')} = <b style={{ color:'#4ADE80' }}>{l.decont.deVirat.toLocaleString('ro-RO')} RON</b>
                                    </span>}
                                    {!l.platit && l.platitSuma > 0 && <span data-partial-prop style={{ display:'block', fontSize:10.5, fontWeight:700, color:'#FCD34D' }}>plătit parțial {l.platitSuma.toLocaleString('ro-RO')} · rest {(l.suma - l.platitSuma).toLocaleString('ro-RO')} RON</span>}
                                  </span>
                                  <span style={{ fontSize:12, fontWeight:700, fontFamily:'monospace', color: l.platit ? '#4ADE80' : '#fff', textDecoration: l.platit ? 'line-through' : 'none' }}>{l.suma.toLocaleString('ro-RO')} RON</span>
                                  {l.platit && <Check size={12} color="#4ADE80"/>}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Total ramas de plata */}
                      <div style={{ background:'rgba(77,163,255,0.06)', border:'1px solid rgba(77,163,255,0.15)', borderRadius:10, padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <span style={{ fontSize:12, color:'rgba(159,215,255,0.6)' }}>Total {LUNI[luna]} {an}</span>
                          <span style={{ fontSize:16, fontWeight:700, color:'rgba(159,215,255,0.5)', fontFamily:'monospace' }}>{totalRON.toLocaleString('ro-RO')} RON</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
                          <span style={{ fontSize:12, color: totalRamas>0 ? '#F87171' : '#4ADE80', fontWeight:600 }}>{totalRamas>0 ? 'Rămas de plătit' : '✓ Totul plătit'}</span>
                          <span style={{ fontSize:20, fontWeight:800, color: totalRamas>0 ? '#F87171' : '#4ADE80', fontFamily:'monospace' }}>{totalRamas.toLocaleString('ro-RO')} RON</span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Info contact */}
                  <div style={{ marginTop:12, display:'flex', gap:16, flexWrap:'wrap' as const }}>
                    {p.telefon && <span style={{ fontSize:11, color:'rgba(159,215,255,0.5)', display:'flex', alignItems:'center', gap:4 }}><Phone size={10}/>{p.telefon}</span>}
                    {p.iban && <span style={{ fontSize:11, color:'rgba(159,215,255,0.4)', fontFamily:'monospace' }}>IBAN: {p.iban}</span>}
                    {p.banca && <span style={{ fontSize:11, color:'rgba(159,215,255,0.4)' }}>{p.banca}</span>}
                  </div>

                  {/* Edit/Delete buttons */}
                  <div style={{ display:'flex', gap:8, marginTop:10 }}>
                    <button onClick={()=>openEdit(p)} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid rgba(77,163,255,0.3)', background:'rgba(77,163,255,0.08)', color:'#7BC8FF', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                      <Edit2 size={11}/> Editează
                    </button>
                    <button onClick={()=>setDeleteId(p.id)} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#F87171', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                      <Trash2 size={11}/> Șterge
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>}

      {/* Modal editare proprietar */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? 'Editează proprietar' : 'Proprietar nou'} width="max-w-lg">
        <FormGroup><label>Nume complet *</label><input value={editing.nume||''} onChange={e=>setEditing({...editing,nume:e.target.value})} placeholder="Prenume Nume"/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Telefon</label><input value={editing.telefon||''} onChange={e=>setEditing({...editing,telefon:e.target.value})} placeholder="+40 7xx xxx xxx"/></FormGroup>
          <FormGroup><label>Email</label><input type="email" value={editing.email||''} onChange={e=>setEditing({...editing,email:e.target.value})} placeholder="email@domeniu.ro"/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>CNP / CUI</label><input value={editing.cnp_cui||''} onChange={e=>setEditing({...editing,cnp_cui:e.target.value})} placeholder="CNP sau CUI"/></FormGroup>
          <FormGroup><label>Bancă</label><input value={editing.banca||''} onChange={e=>setEditing({...editing,banca:e.target.value})} placeholder="BCR, BRD..."/></FormGroup>
        </FormRow>
        <FormGroup><label>IBAN</label><input value={editing.iban||''} onChange={e=>setEditing({...editing,iban:e.target.value})} placeholder="RO49AAAA..."/></FormGroup>
        <FormGroup><label>Adresă</label><input value={editing.adresa||''} onChange={e=>setEditing({...editing,adresa:e.target.value})} /></FormGroup>
        <FormGroup><label>Note interne</label><textarea value={editing.nota||''} onChange={e=>setEditing({...editing,nota:e.target.value})} rows={2}/></FormGroup>
        <div className="flex gap-3 mt-2">
          <Button variant="primary" onClick={save} loading={saving} className="flex-1">Salvează</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1">Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={deleteProp} loading={deleting}
        title="Șterge proprietar" message="Sigur vrei să ștergi acest proprietar?" />
      <Toast toast={toast}/>
    </>
  )
}
