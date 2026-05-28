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
  const [filterCanal, setFilterCanal] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterApt, setFilterApt] = useState('')
  const [showCalc, setShowCalc] = useState(false)
  const { toast, show } = useToast()

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
    if (!editing.apartament_id) { show('error','Selectează apartamentul'); return }
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
    }
    delete payload.id; delete payload.apartament; delete payload.proprietar; delete payload.nr_nopti; delete payload.created_at; delete payload.updated_at

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
    return true
  })

  const c = calcul()

  if (loading) return (<><PageHeader title="Rezervări" /><PageLoading /></>)

  return (
    <>
      <PageHeader title="Rezervări" subtitle={`${rezervari.length} rezervări totale`}
        actions={<Button variant="primary" icon={<Plus size={15}/>} onClick={openNew}>Rezervare nouă</Button>} />
      <div className="p-6" style={{ overflowY:"auto" }}>
        {/* Filtre */}
        <div className="flex gap-3 mb-5">
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
          {(filterCanal||filterStatus||filterApt) && (
            <Button variant="ghost" size="sm" onClick={()=>{setFilterCanal('');setFilterStatus('');setFilterApt('')}}>Resetează filtre</Button>
          )}
        </div>

        <div className="bg-[#161b27] border border-[#2a3350] rounded-[14px] overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState icon={<CalendarCheck size={48}/>} title="Nicio rezervare" desc="Adaugă prima rezervare" action={<Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Adaugă rezervare</Button>}/>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>
                  <th>Client</th><th>Apartament</th><th>Canal</th>
                  <th>Check-in</th><th>Check-out</th><th>Nopți</th>
                  <th>Sumă</th><th>Proprietar</th><th>Status</th><th>Plată</th><th>Decont</th><th></th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} onClick={() => openEdit(r)}>
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
      <Toast toast={toast}/>
    </>
  )
}
