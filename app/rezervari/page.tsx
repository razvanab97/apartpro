'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, Rezervare, Apartament, calculeazaDecont, CANALE_LABEL, STATUS_REZERVARE_LABEL, STATUS_PLATA_LABEL } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Badge, CanalBadge, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog, Card } from '@/components/ui'
import { Plus, CalendarCheck, Edit2, Trash2, Calculator, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'

type BadgeColor = 'green'|'amber'|'red'|'blue'|'purple'|'gray'|'teal'

const STATUS_COLOR: Record<string, BadgeColor> = { confirmata:'green', cerere:'amber', anulata:'red', finalizata:'blue' }
const PLATA_COLOR: Record<string, BadgeColor> = { achitat:'green', avans:'amber', neplatit:'red' }
const DECONT_COLOR: Record<string, BadgeColor> = { decontat:'green', inclus:'amber', nedecontat:'gray' }

const emptyRez = {
  canal:'direct', nume_client:'', email_client:'', telefon_client:'',
  data_checkin: new Date().toISOString().split('T')[0],
  data_checkout: new Date(Date.now()+86400000).toISOString().split('T')[0],
  nr_persoane:2, valoare_bruta:0, taxa_curatenie_incasata:0, suma_incasata:0,
  moneda:'RON', status_plata:'neplatit', status_rezervare:'confirmata',
  comision_platforma_procent:0, comision_platforma_valoare:0, tva_comision_platforma:0,
  cost_curatenie:0, cost_spalatorie:0, cost_consumabile:0, cost_mentenanta:0, alte_costuri:0,
  status_decont:'nedecontat', observatii:'', apartament_id:'', proprietar_id:'',
}

export default function RezervariPage() {
  const [loading, setLoading] = useState(true)
  const [rezervari, setRezervari] = useState<any[]>([])
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(emptyRez)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [filterCanal, setFilterCanal] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterApt, setFilterApt] = useState('')
  const [searchNume, setSearchNume] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showCalc, setShowCalc] = useState(false)
  const { toast, show } = useToast()
  
  async function deschideSabloane(rez: any) {
    setSabloanePop({rez})
    const {data} = await supabase.from('sabloane_mesaje')
      .select('*').eq('apartament_id', rez.apartament_id).order('tip')
    setSabloane(data||[])
  }
  
  function trimiteWA(rez: any, s: any) {
    const phone = (rez.telefon_client||'').replace(/\D/g,'')
    const nr = phone.startsWith('40') ? phone : '4' + phone.replace(/^0/,'')
    const firstName = (rez.nume_client||'').split(' ')[0]
    let msg = (s.text||'').replace(/{nume}/g, firstName)
    if (s.poze?.length) msg += '\n\n' + s.poze.join('\n')
    window.open(`https://wa.me/${nr}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: rez }, { data: apt }] = await Promise.all([
      supabase.from('rezervari').select('*, apartament:apartamente(id,nume,comision_tip,comision_procent,comision_fix), proprietar:proprietari(id,nume)')
        .order('data_checkin', { ascending: false }),
      supabase.from('apartamente').select('*, proprietar:proprietari(id,nume)').eq('status','activ').order('nume'),
    ])
    setRezervari(rez||[])
    setApartamente((apt as Apartament[])||[])
    setLoading(false)
  }

  function openNew() { setEditing({...emptyRez}); setShowCalc(false); setOpen(true) }
  function openEdit(r: any) { setEditing({...r}); setShowCalc(false); setOpen(true) }

  function onAptChange(aptId: string) {
    const apt = apartamente.find(a => a.id === aptId)
    setEditing((prev: any) => ({
      ...prev,
      apartament_id: aptId,
      proprietar_id: apt?.proprietar_id || '',
      comision_platforma_procent: aptId.includes('booking') ? 15 : 0,
    }))
  }

  function recalcComisionPlatforma(brut: number, pct: number) {
    const val = brut * pct / 100
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
    }
    delete payload.id; delete payload.apartament; delete payload.proprietar; delete payload.nr_nopti; delete payload.created_at; delete payload.updated_at; delete payload.rezervare_id

    const { error } = editing.id
      ? await supabase.from('rezervari').update(payload).eq('id', editing.id)
      : await supabase.from('rezervari').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', editing.id ? 'Rezervare actualizată' : 'Rezervare adăugată')
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
  })

  const c = calcul()

  if (loading) return (<><PageHeader title="Rezervări" /><PageLoading /></>)

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
        <div className="flex gap-3 mb-5">
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
              {label:'Luna', fn:()=>{const t=new Date();const from=new Date(t.getFullYear(),t.getMonth(),1);const to=new Date(t.getFullYear(),t.getMonth()+1,0);setDateFrom(from.toISOString().split('T')[0]);setDateTo(to.toISOString().split('T')[0])}},
              {label:'Luna trecută', fn:()=>{const t=new Date();const from=new Date(t.getFullYear(),t.getMonth()-1,1);const to=new Date(t.getFullYear(),t.getMonth(),0);setDateFrom(from.toISOString().split('T')[0]);setDateTo(to.toISOString().split('T')[0])}},
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
                  <th>Check-in</th><th>Check-out</th><th>Nopți</th>
                  <th>Sumă</th><th>Proprietar</th><th>Status</th><th>Plată</th><th>Decont</th><th></th>
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

      <Modal open={open} onClose={()=>setOpen(false)} title={editing.id?'Editează rezervare':'Rezervare nouă'} width="max-w-3xl">
        <FormRow cols={2}>
          <FormGroup>
            <label>Apartament *</label>
            <select value={editing.apartament_id||''} onChange={e=>onAptChange(e.target.value)}>
              <option value="">— Selectează apartament —</option>
              {apartamente.map(a=><option key={a.id} value={a.id}>{a.nume}</option>)}
            </select>
          </FormGroup>
          <FormGroup>
            <label>Canal rezervare</label>
            <select value={editing.canal} onChange={e=>setEditing({...editing,canal:e.target.value})}>
              {Object.entries(CANALE_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </FormGroup>
        </FormRow>
        <FormRow cols={3}>
          <FormGroup><label>Nume client *</label><input value={editing.nume_client} onChange={e=>setEditing({...editing,nume_client:e.target.value})} placeholder="Prenume Nume"/></FormGroup>
          <FormGroup><label>Telefon</label><input value={editing.telefon_client||''} onChange={e=>setEditing({...editing,telefon_client:e.target.value})} placeholder="+40 7xx..."/></FormGroup>
          <FormGroup><label>Email</label><input value={editing.email_client||''} onChange={e=>setEditing({...editing,email_client:e.target.value})} placeholder="email@..."/></FormGroup>
        </FormRow>
        <FormRow cols={4}>
          <FormGroup><label>Check-in *</label><input type="date" value={editing.data_checkin} onChange={e=>setEditing({...editing,data_checkin:e.target.value})}/></FormGroup>
          <FormGroup><label>Check-out *</label><input type="date" value={editing.data_checkout} onChange={e=>setEditing({...editing,data_checkout:e.target.value})}/></FormGroup>
          <FormGroup><label>Persoane</label><input type="number" value={editing.nr_persoane} onChange={e=>setEditing({...editing,nr_persoane:parseInt(e.target.value)||1})} min={1}/></FormGroup>
          <FormGroup>
            <label>Monedă</label>
            <select value={editing.moneda} onChange={e=>setEditing({...editing,moneda:e.target.value})}>
              <option>RON</option><option>EUR</option><option>USD</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormRow cols={3}>
          <FormGroup>
            <label>Valoare brută rezervare</label>
            <input type="number" value={editing.valoare_bruta} onChange={e=>recalcComisionPlatforma(parseFloat(e.target.value)||0, editing.comision_platforma_procent)} min={0} step={0.01}/>
          </FormGroup>
          <FormGroup><label>Taxă curățenie încasată</label><input type="number" value={editing.taxa_curatenie_incasata} onChange={e=>setEditing({...editing,taxa_curatenie_incasata:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
          <FormGroup><label>Sumă efectiv încasată</label><input type="number" value={editing.suma_incasata} onChange={e=>setEditing({...editing,suma_incasata:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
        </FormRow>

        <div className="my-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Comision platformă</p>
          <FormRow cols={3}>
            <FormGroup>
              <label>% Comision platformă</label>
              <input type="number" value={editing.comision_platforma_procent} onChange={e=>recalcComisionPlatforma(editing.valoare_bruta, parseFloat(e.target.value)||0)} min={0} max={100} step={0.5}/>
            </FormGroup>
            <FormGroup><label>Valoare comision (RON)</label><input type="number" value={editing.comision_platforma_valoare} onChange={e=>setEditing({...editing,comision_platforma_valoare:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
            <FormGroup><label>TVA / taxă aferentă</label><input type="number" value={editing.tva_comision_platforma} onChange={e=>setEditing({...editing,tva_comision_platforma:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
          </FormRow>
        </div>

        <div className="my-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Costuri operaționale</p>
          <FormRow cols={3}>
            <FormGroup><label>Cost curățenie</label><input type="number" value={editing.cost_curatenie} onChange={e=>setEditing({...editing,cost_curatenie:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
            <FormGroup><label>Cost spălătorie</label><input type="number" value={editing.cost_spalatorie} onChange={e=>setEditing({...editing,cost_spalatorie:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
            <FormGroup><label>Cost consumabile</label><input type="number" value={editing.cost_consumabile} onChange={e=>setEditing({...editing,cost_consumabile:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
          </FormRow>
          <FormRow cols={2}>
            <FormGroup><label>Cost mentenanță</label><input type="number" value={editing.cost_mentenanta} onChange={e=>setEditing({...editing,cost_mentenanta:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
            <FormGroup><label>Alte costuri</label><input type="number" value={editing.alte_costuri} onChange={e=>setEditing({...editing,alte_costuri:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
          </FormRow>
        </div>

        {/* Calculator preview */}
        {editing.apartament_id && c && (
          <div className="my-3 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <button className="w-full flex items-center justify-between p-3 text-xs font-semibold" style={{ background: 'var(--bg3)', color: 'var(--text2)' }} onClick={()=>setShowCalc(!showCalc)}>
              <span className="flex items-center gap-2"><Calculator size={13}/>Calcul decont proprietar</span>
              {showCalc ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
            </button>
            {showCalc && (
              <div className="p-4" style={{ background: 'var(--bg3)' }}>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span style={{ color: 'var(--text3)' }}>Valoare brută</span><span style={{ fontFamily:'monospace', color:'var(--text)' }}>{editing.valoare_bruta.toLocaleString('ro-RO')} RON</span></div>
                  {editing.comision_platforma_valoare > 0 && <div className="flex justify-between"><span style={{ color: 'var(--text3)' }}>- Comision platformă</span><span style={{ fontFamily:'monospace', color:'var(--red)' }}>-{editing.comision_platforma_valoare.toLocaleString('ro-RO')} RON</span></div>}
                  {editing.tva_comision_platforma > 0 && <div className="flex justify-between"><span style={{ color: 'var(--text3)' }}>- TVA platformă</span><span style={{ fontFamily:'monospace', color:'var(--red)' }}>-{editing.tva_comision_platforma.toLocaleString('ro-RO')} RON</span></div>}
                  {(editing.cost_curatenie+editing.cost_spalatorie+editing.cost_consumabile+editing.cost_mentenanta+editing.alte_costuri) > 0 && (
                    <div className="flex justify-between"><span style={{ color: 'var(--text3)' }}>- Costuri operaționale</span>
                    <span style={{ fontFamily:'monospace', color:'var(--red)' }}>-{(editing.cost_curatenie+editing.cost_spalatorie+editing.cost_consumabile+editing.cost_mentenanta+editing.alte_costuri).toLocaleString('ro-RO')} RON</span></div>
                  )}
                  <div className="flex justify-between pt-1.5 border-t" style={{ borderColor:'var(--border)' }}>
                    <span style={{ color:'var(--text2)', fontWeight:500 }}>= Bază calcul comision</span>
                    <span style={{ fontFamily:'monospace', fontWeight:600, color:'var(--text)' }}>{c.baza.toLocaleString('ro-RO')} RON</span>
                  </div>
                  <div className="flex justify-between"><span style={{ color: 'var(--text3)' }}>- Comision administrator 20%</span><span style={{ fontFamily:'monospace', color:'var(--red)' }}>-{c.comision.toLocaleString('ro-RO')} RON</span></div>
                  <div className="flex justify-between pt-2 border-t mt-2" style={{ borderColor:'var(--border)' }}>
                    <span className="font-bold text-sm" style={{ color:'var(--text)' }}>Suma de virat proprietar</span>
                    <span className="font-bold text-base font-mono" style={{ color:'var(--green)' }}>{c.suma_proprietar.toLocaleString('ro-RO')} RON</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <FormRow cols={3}>
          <FormGroup>
            <label>Status rezervare</label>
            <select value={editing.status_rezervare} onChange={e=>setEditing({...editing,status_rezervare:e.target.value})}>
              {Object.entries(STATUS_REZERVARE_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </FormGroup>
          <FormGroup>
            <label>Status plată</label>
            <select value={editing.status_plata} onChange={e=>setEditing({...editing,status_plata:e.target.value})}>
              {Object.entries(STATUS_PLATA_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </FormGroup>
          <FormGroup>
            <label>Status decont</label>
            <select value={editing.status_decont} onChange={e=>setEditing({...editing,status_decont:e.target.value})}>
              <option value="nedecontat">Nedecontat</option>
              <option value="inclus">Inclus în decont</option>
              <option value="decontat">Decontat</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormGroup><label>Observații</label><textarea value={editing.observatii||''} onChange={e=>setEditing({...editing,observatii:e.target.value})} rows={2} placeholder="Notițe interne..."/></FormGroup>
        <div className="flex gap-3 mt-2">
          <Button variant="primary" onClick={save} loading={saving} className="flex-1">Salvează rezervarea</Button>
          <Button variant="secondary" onClick={()=>setOpen(false)} className="flex-1">Anulează</Button>
        </div>
      </Modal>

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
