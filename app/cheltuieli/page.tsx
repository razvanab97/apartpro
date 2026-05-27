'use client'
import { useEffect, useState } from 'react'
import { supabase, Apartament, CATEGORII_LABEL, CATEGORII_CHELTUIELI } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Badge, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog } from '@/components/ui'
import { Plus, Receipt, Edit2, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

type BadgeColor = 'green'|'amber'|'red'|'blue'|'gray'
const SUPORTAT_COLOR: Record<string, BadgeColor> = { administrator:'blue', proprietar:'amber', impartit:'purple' as BadgeColor }
const STATUS_COLOR: Record<string, BadgeColor> = { validat:'green', nevalidat:'amber', inclus_decont:'blue' }

const empty = {
  apartament_id:'', data: format(new Date(),'yyyy-MM-dd'), categorie:'curatenie',
  descriere:'', valoare:0, tva:0, suportat_de:'proprietar', procent_impartit:50,
  status:'validat', nota:'',
}

export default function CheltuieliPage() {
  const [loading, setLoading] = useState(true)
  const [cheltuieli, setCheltuieli] = useState<any[]>([])
  const [apartamente, setApartamente] = useState<Apartament[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [filterApt, setFilterApt] = useState('')
  const [filterCategorie, setFilterCategorie] = useState('')
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: ch }, { data: apt }] = await Promise.all([
      supabase.from('cheltuieli').select('*, apartament:apartamente(id,nume), proprietar:proprietari(id,nume)').order('data', { ascending: false }),
      supabase.from('apartamente').select('id,nume,proprietar_id').eq('status','activ').order('nume'),
    ])
    setCheltuieli(ch||[])
    setApartamente((apt as Apartament[])||[])
    setLoading(false)
  }

  function onAptChange(aptId: string) {
    const apt = apartamente.find(a => a.id === aptId) as any
    setEditing((prev: any) => ({ ...prev, apartament_id: aptId, proprietar_id: apt?.proprietar_id||'' }))
  }

  async function save() {
    if (!editing.apartament_id || !editing.descriere) { show('error','Completează apartamentul și descrierea'); return }
    setSaving(true)
    const payload = { ...editing }
    delete payload.id; delete payload.apartament; delete payload.proprietar; delete payload.created_at; delete payload.updated_at
    const { error } = editing.id
      ? await supabase.from('cheltuieli').update(payload).eq('id', editing.id)
      : await supabase.from('cheltuieli').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', editing.id ? 'Cheltuială actualizată' : 'Cheltuială adăugată')
    setOpen(false); setSaving(false); load()
  }

  async function deleteCh() {
    if (!deleteId) return
    await supabase.from('cheltuieli').delete().eq('id', deleteId)
    show('success','Cheltuială ștearsă'); setDeleteId(null); load()
  }

  const filtered = cheltuieli.filter(c => {
    if (filterApt && c.apartament_id !== filterApt) return false
    if (filterCategorie && c.categorie !== filterCategorie) return false
    return true
  })

  const totalFiltrat = filtered.reduce((s,c) => s + Number(c.valoare), 0)

  if (loading) return (<><PageHeader title="Cheltuieli" /><PageLoading /></>)

  return (
    <>
      <PageHeader title="Cheltuieli" subtitle={`${cheltuieli.length} cheltuieli înregistrate`}
        actions={<Button variant="primary" icon={<Plus size={15}/>} onClick={()=>{setEditing(empty);setOpen(true)}}>Cheltuială nouă</Button>} />
      <div className="p-6">
        <div className="flex gap-3 mb-5 items-center flex-wrap">
          <select value={filterApt} onChange={e=>setFilterApt(e.target.value)} style={{ width: 200 }}>
            <option value="">Toate apartamentele</option>
            {apartamente.map(a=><option key={a.id} value={a.id}>{a.nume}</option>)}
          </select>
          <select value={filterCategorie} onChange={e=>setFilterCategorie(e.target.value)} style={{ width: 180 }}>
            <option value="">Toate categoriile</option>
            {CATEGORII_CHELTUIELI.map(c=><option key={c} value={c}>{CATEGORII_LABEL[c]||c}</option>)}
          </select>
          {filtered.length > 0 && (
            <div className="ml-auto text-sm font-mono font-bold" style={{ color: 'var(--red)' }}>
              Total: {totalFiltrat.toLocaleString('ro-RO')} RON
            </div>
          )}
        </div>

        <div className="bg-[#161b27] border border-[#2a3350] rounded-[14px] overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState icon={<Receipt size={48}/>} title="Nicio cheltuială" desc="Adaugă cheltuielile aferente apartamentelor"
              action={<Button variant="primary" icon={<Plus size={14}/>} onClick={()=>{setEditing(empty);setOpen(true)}}>Adaugă cheltuială</Button>}/>
          ) : (
            <table>
              <thead><tr>
                <th>Data</th><th>Apartament</th><th>Categorie</th><th>Descriere</th>
                <th>Valoare</th><th>TVA</th><th>Suportat de</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} onClick={()=>{setEditing({...c});setOpen(true)}}>
                    <td style={{ fontFamily:'monospace', fontSize:12 }}>{c.data}</td>
                    <td style={{ color:'var(--text)', fontWeight:500 }}>{c.apartament?.nume||'—'}</td>
                    <td><Badge color="gray">{CATEGORII_LABEL[c.categorie]||c.categorie}</Badge></td>
                    <td style={{ color:'var(--text)' }}>{c.descriere}</td>
                    <td style={{ fontFamily:'monospace', color:'var(--red)', fontWeight:600 }}>{Number(c.valoare).toLocaleString('ro-RO')} RON</td>
                    <td style={{ fontFamily:'monospace', fontSize:12 }}>{Number(c.tva) > 0 ? `${Number(c.tva).toLocaleString('ro-RO')} RON` : '—'}</td>
                    <td><Badge color={SUPORTAT_COLOR[c.suportat_de]||'gray'}>{c.suportat_de}</Badge></td>
                    <td><Badge color={STATUS_COLOR[c.status]||'gray'}>{c.status}</Badge></td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" icon={<Edit2 size={13}/>} onClick={()=>{setEditing({...c});setOpen(true)}}/>
                        <Button variant="ghost" size="sm" icon={<Trash2 size={13}/>} onClick={()=>setDeleteId(c.id)} className="hover:text-red-400"/>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={open} onClose={()=>setOpen(false)} title={editing.id?'Editează cheltuială':'Cheltuială nouă'} width="max-w-lg">
        <FormRow cols={2}>
          <FormGroup>
            <label>Apartament *</label>
            <select value={editing.apartament_id} onChange={e=>onAptChange(e.target.value)}>
              <option value="">— Selectează —</option>
              {apartamente.map(a=><option key={a.id} value={a.id}>{a.nume}</option>)}
            </select>
          </FormGroup>
          <FormGroup><label>Data</label><input type="date" value={editing.data} onChange={e=>setEditing({...editing,data:e.target.value})}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup>
            <label>Categorie</label>
            <select value={editing.categorie} onChange={e=>setEditing({...editing,categorie:e.target.value})}>
              {CATEGORII_CHELTUIELI.map(c=><option key={c} value={c}>{CATEGORII_LABEL[c]||c}</option>)}
            </select>
          </FormGroup>
          <FormGroup>
            <label>Suportat de</label>
            <select value={editing.suportat_de} onChange={e=>setEditing({...editing,suportat_de:e.target.value})}>
              <option value="proprietar">Proprietar</option>
              <option value="administrator">Administrator</option>
              <option value="impartit">Împărțit</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormGroup><label>Descriere *</label><input value={editing.descriere} onChange={e=>setEditing({...editing,descriere:e.target.value})} placeholder="Descriere cheltuială"/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Valoare (RON)</label><input type="number" value={editing.valoare} onChange={e=>setEditing({...editing,valoare:parseFloat(e.target.value)||0})} min={0} step={0.01}/></FormGroup>
          <FormGroup><label>TVA (RON)</label><input type="number" value={editing.tva} onChange={e=>setEditing({...editing,tva:parseFloat(e.target.value)||0})} min={0} step={0.01}/></FormGroup>
        </FormRow>
        <FormGroup>
          <label>Status</label>
          <select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value})}>
            <option value="nevalidat">Nevalidat</option>
            <option value="validat">Validat</option>
            <option value="inclus_decont">Inclus în decont</option>
          </select>
        </FormGroup>
        <FormGroup><label>Note</label><textarea value={editing.nota||''} onChange={e=>setEditing({...editing,nota:e.target.value})} rows={2} placeholder="Observații..."/></FormGroup>
        <div className="flex gap-3 mt-2">
          <Button variant="primary" onClick={save} loading={saving} className="flex-1">Salvează</Button>
          <Button variant="secondary" onClick={()=>setOpen(false)} className="flex-1">Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={deleteCh}
        title="Șterge cheltuială" message="Sigur vrei să ștergi această cheltuială?" />
      <Toast toast={toast}/>
    </>
  )
}
