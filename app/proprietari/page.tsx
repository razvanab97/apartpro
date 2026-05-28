'use client'
import { useEffect, useState } from 'react'
import { supabase, Proprietar } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Card, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast, ConfirmDialog } from '@/components/ui'
import { Plus, Users, Edit2, Trash2, Phone, Mail, Building2 } from 'lucide-react'

const empty: Partial<Proprietar> = { nume:'', email:'', telefon:'', iban:'', banca:'', adresa:'', cnp_cui:'', nota:'' }

export default function ProprietariPage() {
  const [loading, setLoading] = useState(true)
  const [proprietari, setProprietari] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Proprietar>>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('proprietari').select('*, apartamente(id,nume,status)').order('nume')
    setProprietari(data||[])
    setLoading(false)
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
    const { error } = await supabase.from('proprietari').delete().eq('id', deleteId)
    if (error) { show('error', error.message) } else { show('success', 'Proprietar șters') }
    setDeleteId(null); setDeleting(false); load()
  }

  if (loading) return (<><PageHeader title="Proprietari" /><PageLoading /></>)

  return (
    <>
      <PageHeader title="Proprietari" subtitle={`${proprietari.length} proprietari`}
        actions={<Button variant="primary" icon={<Plus size={15}/>} onClick={openNew}>Proprietar nou</Button>} />
      <div className="p-6" style={{ overflowY:"auto" }}>
        {proprietari.length === 0 ? (
          <EmptyState icon={<Users size={48}/>} title="Niciun proprietar" desc="Adaugă proprietarii apartamentelor în administrare"
            action={<Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Adaugă proprietar</Button>}/>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {proprietari.map(p => (
              <Card key={p.id} className="hover:border-[#3a4a6a] transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ background: 'rgba(79,124,255,0.15)', color: 'var(--accent)', border: '1px solid rgba(79,124,255,0.3)' }}>
                      {p.nume.split(' ').map((n:string)=>n[0]).join('').substring(0,2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{p.nume}</h3>
                      {p.cnp_cui && <p className="text-[11px]" style={{ color: 'var(--text3)' }}>{p.cnp_cui}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" icon={<Edit2 size={13}/>} onClick={() => openEdit(p)} />
                    <Button variant="ghost" size="sm" icon={<Trash2 size={13}/>} onClick={() => setDeleteId(p.id)} className="hover:text-red-400" />
                  </div>
                </div>
                <div className="space-y-2 mb-3">
                  {p.telefon && <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}><Phone size={12} style={{ color: 'var(--text3)' }}/>{p.telefon}</div>}
                  {p.email && <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}><Mail size={12} style={{ color: 'var(--text3)' }}/>{p.email}</div>}
                  {p.iban && <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--text3)' }}>IBAN: {p.iban}</div>}
                </div>
                {p.apartamente?.length > 0 && (
                  <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-[10px] mb-1.5 flex items-center gap-1" style={{ color: 'var(--text3)' }}><Building2 size={10}/> Apartamente</p>
                    <div className="flex flex-wrap gap-1">
                      {p.apartamente.map((a:any) => (
                        <span key={a.id} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg3)', color: 'var(--text2)' }}>{a.nume}</span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing.id ? 'Editează proprietar' : 'Proprietar nou'} width="max-w-lg">
        <FormGroup><label>Nume complet *</label><input value={editing.nume||''} onChange={e=>setEditing({...editing,nume:e.target.value})} placeholder="Prenume Nume"/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Telefon</label><input value={editing.telefon||''} onChange={e=>setEditing({...editing,telefon:e.target.value})} placeholder="+40 7xx xxx xxx"/></FormGroup>
          <FormGroup><label>Email</label><input type="email" value={editing.email||''} onChange={e=>setEditing({...editing,email:e.target.value})} placeholder="email@domeniu.ro"/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>CNP / CUI</label><input value={editing.cnp_cui||''} onChange={e=>setEditing({...editing,cnp_cui:e.target.value})} placeholder="CNP sau CUI firmă"/></FormGroup>
          <FormGroup><label>Bancă</label><input value={editing.banca||''} onChange={e=>setEditing({...editing,banca:e.target.value})} placeholder="Ex: BCR, BRD..."/></FormGroup>
        </FormRow>
        <FormGroup><label>IBAN</label><input value={editing.iban||''} onChange={e=>setEditing({...editing,iban:e.target.value})} placeholder="RO49AAAA..."/></FormGroup>
        <FormGroup><label>Adresă</label><input value={editing.adresa||''} onChange={e=>setEditing({...editing,adresa:e.target.value})} placeholder="Adresa proprietarului"/></FormGroup>
        <FormGroup><label>Note interne</label><textarea value={editing.nota||''} onChange={e=>setEditing({...editing,nota:e.target.value})} rows={2} placeholder="Observații interne..."/></FormGroup>
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
