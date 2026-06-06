'use client'
import { useEffect, useState } from 'react'
import { supabase, Proprietar } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Card, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog } from '@/components/ui'
import { Plus, Users, Edit2, Trash2, Phone, Mail, Building2, ChevronDown, ChevronUp, RefreshCw, Check, Clock } from 'lucide-react'

const empty: Partial<Proprietar> = { nume:'', email:'', telefon:'', iban:'', banca:'', adresa:'', cnp_cui:'', nota:'' }
const LUNI = ['','Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']
const pad = (n:number) => String(n).padStart(2,'0')

async function getCursEUR(): Promise<number> {
  try {
    const res = await fetch('https://www.bnr.ro/nbrfxrates.xml')
    const txt = await res.text()
    const match = txt.match(/<Rate currency="EUR">([\d.]+)<\/Rate>/)
    if (match) return parseFloat(match[1])
  } catch {}
  return 5.0 // fallback
}

export default function ProprietariPage() {
  const now = new Date()
  const [loading, setLoading] = useState(true)
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
  const [savingPlata, setSavingPlata] = useState<string|null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Proprietar>>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])
  useEffect(() => { loadLunar() }, [luna, an])

  async function load() {
    setLoading(true)
    const [{ data: propData }, { data: aptData }, { data: chiriiData }] = await Promise.all([
      supabase.from('proprietari').select('*').order('nume'),
      supabase.from('apartamente').select('id,nume,nota,status,proprietar_id').order('nota'),
      supabase.from('chirii_fixe').select('*').eq('activ', true),
    ])
    setProprietari(propData||[])
    setApts(aptData||[])
    setChirii(chiriiData||[])
    setLoading(false)
    // Curs BNR
    setCursLoading(true)
    const curs = await getCursEUR()
    setCursEUR(curs)
    setCursLoading(false)
  }

  async function loadLunar() {
    const pz = `${an}-${pad(luna)}-01`
    const uz = new Date(an, luna, 0).toISOString().slice(0,10)
    const [{ data: chData }, { data: platiData }] = await Promise.all([
      supabase.from('cheltuieli')
        .select('apartament_id,categorie,valoare,status')
        .gte('data', pz).lte('data', uz)
        .in('categorie', ['asociatie','eon_curent','eon_gaz','eon_duo']),
      supabase.from('plati_proprietari').select('*')
        .eq('luna', luna).eq('an', an),
    ])
    setCheltuieli(chData||[])
    const pm: Record<string,any> = {}
    ;(platiData||[]).forEach((p:any) => { pm[p.proprietar_id] = p })
    setPlatiStatus(pm)
  }

  // Calcul total de plătit pentru un proprietar
  function calcTotal(propId: string) {
    const propApts = apts.filter(a => a.proprietar_id === propId)
    let totalRON = 0
    const detalii: any[] = []

    propApts.forEach(apt => {
      const chirie = chirii.find(c => c.apartament_id === apt.id)
      if (!chirie) return

      const valRON = chirie.moneda === 'EUR'
        ? Math.round(chirie.valoare * cursEUR)
        : chirie.valoare

      // Utilități pentru acest apartament în luna selectată
      const utilApt = cheltuieli.filter(c => c.apartament_id === apt.id)
      const eon = utilApt.filter(c => ['eon_curent','eon_gaz','eon_duo'].includes(c.categorie)).reduce((s:number,c:any) => s+Number(c.valoare||0), 0)
      const asoc = utilApt.filter(c => c.categorie === 'asociatie').reduce((s:number,c:any) => s+Number(c.valoare||0), 0)
      const utilTotal = Math.round(eon + asoc)

      totalRON += valRON + utilTotal

      detalii.push({
        apt,
        chirie: { valoare: chirie.valoare, moneda: chirie.moneda, valRON },
        util: { eon: Math.round(eon), asoc: Math.round(asoc), total: utilTotal },
        subtotal: valRON + utilTotal,
      })
    })

    return { totalRON, detalii }
  }

  async function salveazaPlata(propId: string, status: string, sumaPartial?: number) {
    setSavingPlata(propId)
    const { totalRON } = calcTotal(propId)
    const existing = platiStatus[propId]
    const payload = {
      proprietar_id: propId,
      luna, an,
      suma_totala: totalRON,
      suma_platita: status === 'platit' ? totalRON : (sumaPartial || existing?.suma_platita || 0),
      status,
      data_plata: status !== 'neplatit' ? new Date().toISOString().slice(0,10) : null,
    }
    if (existing) {
      await supabase.from('plati_proprietari').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('plati_proprietari').insert(payload)
    }
    setSavingPlata(null)
    show('success', 'Status actualizat')
    loadLunar()
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

  if (loading) return (<><PageHeader title="Proprietari" /><PageLoading /></>)

  const s = {
    card: { background:'rgba(11,22,42,0.8)', border:'1px solid rgba(159,215,255,0.1)', borderRadius:14, marginBottom:12, overflow:'hidden' as const },
    header: { padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' as const },
    badge: (color:string) => ({ fontSize:10, padding:'2px 8px', borderRadius:20, background:`${color}20`, color, border:`1px solid ${color}30`, fontWeight:600 }),
    nota: { fontSize:10, fontFamily:'monospace', padding:'1px 6px', borderRadius:4, background:'rgba(77,163,255,0.12)', color:'#4DA3FF', fontWeight:700 },
    row: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' },
    label: { fontSize:11, color:'rgba(159,215,255,0.5)' },
    val: { fontSize:12, fontWeight:600, color:'#fff' },
    statusBtn: (active:boolean, color:string) => ({ padding:'6px 14px', borderRadius:8, border:`1px solid ${active?color:'rgba(255,255,255,0.1)'}`, background:active?`${color}20`:'transparent', color:active?color:'rgba(159,215,255,0.4)', fontSize:12, fontWeight:600, cursor:'pointer' as const }),
  }

  return (
    <>
      <PageHeader title="Proprietari" subtitle={`${proprietari.length} proprietari`}
        actions={<Button variant="primary" icon={<Plus size={15}/>} onClick={openNew}>Proprietar nou</Button>} />
      <div style={{ padding:'16px 20px', overflowY:'auto' }}>

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
          const { totalRON, detalii } = calcTotal(p.id)
          const plata = platiStatus[p.id]
          const statusPlata = plata?.status || 'neplatit'
          const isExpanded = expandedId === p.id
          const statusColor = statusPlata === 'platit' ? '#4ADE80' : statusPlata === 'partial' ? '#FCD34D' : '#F87171'

          return (
            <div key={p.id} style={s.card}>
              {/* Header card proprietar */}
              <div style={s.header} onClick={() => setExpandedId(isExpanded ? null : p.id)}>
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

                  {detalii.length === 0 ? (
                    <div style={{ padding:'20px 0', textAlign:'center', fontSize:12, color:'rgba(159,215,255,0.4)' }}>
                      Niciun apartament cu chirie configurată
                    </div>
                  ) : (
                    <>
                      {/* Tabel per apartament */}
                      <div style={{ marginTop:12, marginBottom:14 }}>
                        {detalii.map(d => (
                          <div key={d.apt.id} style={{ padding:'10px 12px', background:'rgba(255,255,255,0.03)', borderRadius:9, marginBottom:6, border:'1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={s.nota}>{d.apt.nota}</span>
                                <span style={{ fontSize:12, color:'rgba(159,215,255,0.6)' }}>{d.apt.nume}</span>
                              </div>
                              <span style={{ fontSize:14, fontWeight:700, color:'#fff', fontFamily:'monospace' }}>{d.subtotal.toLocaleString('ro-RO')} RON</span>
                            </div>
                            <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const }}>
                              <div style={{ fontSize:11, color:'rgba(159,215,255,0.5)' }}>
                                Chirie: <span style={{ color:'#7BC8FF', fontWeight:600 }}>
                                  {d.chirie.moneda === 'EUR' ? `${d.chirie.valoare} EUR (${d.chirie.valRON} RON)` : `${d.chirie.valRON} RON`}
                                </span>
                              </div>
                              {d.util.eon > 0 && <div style={{ fontSize:11, color:'rgba(159,215,255,0.5)' }}>E.ON: <span style={{ color:'#FCD34D', fontWeight:600 }}>{d.util.eon} RON</span></div>}
                              {d.util.asoc > 0 && <div style={{ fontSize:11, color:'rgba(159,215,255,0.5)' }}>Asociație: <span style={{ color:'#A78BFA', fontWeight:600 }}>{d.util.asoc} RON</span></div>}
                              {d.util.total === 0 && <div style={{ fontSize:11, color:'rgba(159,215,255,0.25)' }}>Fără utilități înregistrate luna aceasta</div>}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Total + status plată */}
                      <div style={{ background:'rgba(77,163,255,0.06)', border:'1px solid rgba(77,163,255,0.15)', borderRadius:10, padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                          <span style={{ fontSize:12, color:'rgba(159,215,255,0.6)' }}>Total de plătit {LUNI[luna]} {an}</span>
                          <span style={{ fontSize:20, fontWeight:800, color:'#fff', fontFamily:'monospace' }}>{totalRON.toLocaleString('ro-RO')} RON</span>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
                          {(['neplatit','partial','platit'] as const).map(st => (
                            <button key={st} disabled={savingPlata === p.id}
                              onClick={() => salveazaPlata(p.id, st)}
                              style={s.statusBtn(statusPlata === st, st === 'platit' ? '#4ADE80' : st === 'partial' ? '#FCD34D' : '#F87171')}>
                              {st === 'platit' ? '✓ Platit' : st === 'partial' ? '◑ Partial' : '✗ Neplatit'}
                            </button>
                          ))}
                        </div>
                        {plata?.data_plata && (
                          <div style={{ marginTop:8, fontSize:11, color:'rgba(159,215,255,0.4)', display:'flex', alignItems:'center', gap:4 }}>
                            <Clock size={10}/> Actualizat: {plata.data_plata}
                            {plata.suma_platita && plata.suma_platita < plata.suma_totala && (
                              <span style={{ marginLeft:8, color:'#FCD34D' }}>Plătit parțial: {Number(plata.suma_platita).toLocaleString('ro-RO')} RON</span>
                            )}
                          </div>
                        )}
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
      </div>

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
