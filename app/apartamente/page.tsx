'use client'
import { useEffect, useState } from 'react'
import { supabase, Apartament, Proprietar } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Card, Badge, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog } from '@/components/ui'
import { Plus, Building2, Edit2, Trash2, ExternalLink } from 'lucide-react'

const STATUS_COLOR: Record<string, 'green'|'red'|'amber'> = { activ:'green', inactiv:'red', mentenanta:'amber' }
const STATUS_LABEL: Record<string, string> = { activ:'Activ', inactiv:'Inactiv', mentenanta:'Mentenanță' }
const COMISION_TIP_LABEL: Record<string, string> = {
  procent_brut: '% din brut',
  procent_net_platforme: '% net după platforme',
  procent_net_dupa_costuri: '% net după costuri',
  fix_lunar: 'Fix lunar',
  mixt: 'Fix + %',
}

const empty: Partial<Apartament> = {
  nume:'', adresa:'', zona:'', nr_camere:2, capacitate_max:4, pret_standard:0,
  proprietar_id:'', comision_tip:'procent_net_dupa_costuri', comision_procent:20, comision_fix:0,
  link_airbnb:'', link_booking:'', link_site:'', instructiuni_checkin:'', reguli:'', status:'activ', nota:'',
}

export default function ApartamentePage() {
  const [loading, setLoading] = useState(true)
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [proprietari, setProprietari] = useState<Proprietar[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Apartament>>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: apt }, { data: prop }] = await Promise.all([
      supabase.from('apartamente').select('*, proprietar:proprietari(id,nume)').order('nume'),
      supabase.from('proprietari').select('id,nume').order('nume'),
    ])
    setApartamente((apt as Apartament[]) || [])
    setProprietari((prop as Proprietar[]) || [])
    setLoading(false)
  }

  function openNew() { setEditing(empty); setOpen(true) }
  function openEdit(a: Apartament) { setEditing({ ...a }); setOpen(true) }

  async function save() {
    if (!editing.nume || !editing.adresa) { show('error', 'Completează numele și adresa'); return }
    setSaving(true)
    const payload = {
      nume: editing.nume, adresa: editing.adresa, zona: editing.zona||null,
      nr_camere: editing.nr_camere, capacitate_max: editing.capacitate_max,
      pret_standard: editing.pret_standard, proprietar_id: editing.proprietar_id||null,
      comision_tip: editing.comision_tip, comision_procent: editing.comision_procent,
      comision_fix: editing.comision_fix, link_airbnb: editing.link_airbnb||null,
      link_booking: editing.link_booking||null, link_site: editing.link_site||null,
      instructiuni_checkin: editing.instructiuni_checkin||null,
      reguli: editing.reguli||null, status: editing.status, nota: editing.nota||null,
    }
    const { error } = editing.id
      ? await supabase.from('apartamente').update(payload).eq('id', editing.id)
      : await supabase.from('apartamente').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', editing.id ? 'Apartament actualizat' : 'Apartament adăugat')
    setOpen(false); setSaving(false); load()
  }

  async function deleteApt() {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from('apartamente').delete().eq('id', deleteId)
    if (error) { show('error', error.message) } else { show('success', 'Apartament șters') }
    setDeleteId(null); setDeleting(false); load()
  }

  if (loading) return (<><PageHeader title="Apartamente" /><PageLoading /></>)

  return (
    <>
      <PageHeader title="Apartamente" subtitle={`${apartamente.length} locații în administrare`}
        actions={<Button variant="primary" icon={<Plus size={15}/>} onClick={openNew}>Apartament nou</Button>} />
      <div className="p-6">
        {apartamente.length === 0 ? (
          <EmptyState icon={<Building2 size={48}/>} title="Niciun apartament" desc="Adaugă primul apartament în administrare" action={<Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Adaugă apartament</Button>}/>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {apartamente.map(a => (
              <Card key={a.id} className="hover:border-[#3a4a6a] transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate mb-1" style={{ color: 'var(--text)' }}>{a.nume}</h3>
                    <p className="text-xs truncate" style={{ color: 'var(--text3)' }}>📍 {a.adresa}</p>
                  </div>
                  <Badge color={STATUS_COLOR[a.status]||'gray'}>{STATUS_LABEL[a.status]||a.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg3)' }}>
                    <p className="text-base font-bold font-mono" style={{ color: 'var(--text)' }}>{a.nr_camere}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text3)' }}>camere</p>
                  </div>
                  <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg3)' }}>
                    <p className="text-base font-bold font-mono" style={{ color: 'var(--text)' }}>{a.capacitate_max}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text3)' }}>pers. max</p>
                  </div>
                  <div className="text-center p-2 rounded-lg" style={{ background: 'var(--bg3)' }}>
                    <p className="text-base font-bold font-mono" style={{ color: 'var(--accent)' }}>{a.pret_standard}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text3)' }}>RON/n</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs mb-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--text3)' }}>Proprietar: <span style={{ color: 'var(--text)' }}>{(a as any).proprietar?.nume || '—'}</span></span>
                  <span style={{ color: 'var(--green)' }}>{a.comision_procent}% · {COMISION_TIP_LABEL[a.comision_tip]||a.comision_tip}</span>
                </div>
                <div className="flex gap-2">
                  {a.link_airbnb && <a href={a.link_airbnb} target="_blank" rel="noopener" className="text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(255,88,85,0.1)', color: '#ff9a98' }}>Airbnb <ExternalLink size={9} className="inline"/></a>}
                  {a.link_booking && <a href={a.link_booking} target="_blank" rel="noopener" className="text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(79,160,255,0.1)', color: '#4fa0ff' }}>Booking <ExternalLink size={9} className="inline"/></a>}
                  <div className="ml-auto flex gap-1.5">
                    <Button variant="ghost" size="sm" icon={<Edit2 size={13}/>} onClick={() => openEdit(a)} />
                    <Button variant="ghost" size="sm" icon={<Trash2 size={13}/>} onClick={() => setDeleteId(a.id)} className="hover:text-red-400" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? 'Editează apartament' : 'Apartament nou'} width="max-w-2xl">
        <FormRow cols={2}>
          <FormGroup><label>Nume apartament *</label><input value={editing.nume||''} onChange={e=>setEditing({...editing,nume:e.target.value})} placeholder="Ex: Ap. Palas View"/></FormGroup>
          <FormGroup><label>Zonă</label><input value={editing.zona||''} onChange={e=>setEditing({...editing,zona:e.target.value})} placeholder="Ex: Palas, Copou, Centru"/></FormGroup>
        </FormRow>
        <FormGroup><label>Adresă completă *</label><input value={editing.adresa||''} onChange={e=>setEditing({...editing,adresa:e.target.value})} placeholder="Stradă, număr, bloc, etaj"/></FormGroup>
        <FormRow cols={3}>
          <FormGroup><label>Nr. camere</label><input type="number" value={editing.nr_camere||2} onChange={e=>setEditing({...editing,nr_camere:parseInt(e.target.value)||1})} min={1}/></FormGroup>
          <FormGroup><label>Capacitate max</label><input type="number" value={editing.capacitate_max||4} onChange={e=>setEditing({...editing,capacitate_max:parseInt(e.target.value)||1})} min={1}/></FormGroup>
          <FormGroup><label>Preț standard (RON/n)</label><input type="number" value={editing.pret_standard||0} onChange={e=>setEditing({...editing,pret_standard:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup>
            <label>Proprietar</label>
            <select value={editing.proprietar_id||''} onChange={e=>setEditing({...editing,proprietar_id:e.target.value||undefined})}>
              <option value="">— Fără proprietar —</option>
              {proprietari.map(p=><option key={p.id} value={p.id}>{p.nume}</option>)}
            </select>
          </FormGroup>
          <FormGroup>
            <label>Status</label>
            <select value={editing.status||'activ'} onChange={e=>setEditing({...editing,status:e.target.value})}>
              <option value="activ">Activ</option>
              <option value="inactiv">Inactiv</option>
              <option value="mentenanta">Mentenanță</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormRow cols={3}>
          <FormGroup>
            <label>Tip comision</label>
            <select value={editing.comision_tip||'procent_net_dupa_costuri'} onChange={e=>setEditing({...editing,comision_tip:e.target.value})}>
              <option value="procent_brut">% din brut</option>
              <option value="procent_net_platforme">% net după platforme</option>
              <option value="procent_net_dupa_costuri">% net după costuri</option>
              <option value="fix_lunar">Fix lunar (RON)</option>
              <option value="mixt">Mixt (fix + %)</option>
            </select>
          </FormGroup>
          <FormGroup><label>Procent comision (%)</label><input type="number" value={editing.comision_procent||20} onChange={e=>setEditing({...editing,comision_procent:parseFloat(e.target.value)||0})} min={0} max={100} step={0.5}/></FormGroup>
          <FormGroup><label>Comision fix (RON/lună)</label><input type="number" value={editing.comision_fix||0} onChange={e=>setEditing({...editing,comision_fix:parseFloat(e.target.value)||0})} min={0}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Link Airbnb</label><input value={editing.link_airbnb||''} onChange={e=>setEditing({...editing,link_airbnb:e.target.value})} placeholder="airbnb.com/rooms/..."/></FormGroup>
          <FormGroup><label>Link Booking</label><input value={editing.link_booking||''} onChange={e=>setEditing({...editing,link_booking:e.target.value})} placeholder="booking.com/hotel/..."/></FormGroup>
        </FormRow>
        <FormGroup><label>Instrucțiuni check-in / cod acces</label><textarea value={editing.instructiuni_checkin||''} onChange={e=>setEditing({...editing,instructiuni_checkin:e.target.value})} rows={3} placeholder="Ex: Cutia cu chei la intrare, cod 1234..."/></FormGroup>
        <FormGroup><label>Reguli apartament</label><textarea value={editing.reguli||''} onChange={e=>setEditing({...editing,reguli:e.target.value})} rows={2} placeholder="Ex: Nefumători, nu se acceptă animale..."/></FormGroup>
        <div className="flex gap-3 mt-2">
          <Button variant="primary" onClick={save} loading={saving} className="flex-1">Salvează</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1">Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={deleteApt} loading={deleting}
        title="Șterge apartament" message="Sigur vrei să ștergi acest apartament? Toate rezervările asociate vor fi șterse." />
      <Toast toast={toast}/>
    </>
  )
}
