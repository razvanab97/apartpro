'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Badge, Modal, FormGroup, FormRow, EmptyState, PageLoading, Toast, useToast } from '@/components/ui'
import { Plus, CheckSquare, Check } from 'lucide-react'
import { format } from 'date-fns'

type BadgeColor = 'green'|'amber'|'red'|'blue'|'gray'
const STATUS_COLOR: Record<string, BadgeColor> = { de_facut:'red', in_lucru:'amber', finalizat:'green' }
const PRIO_COLOR: Record<string, BadgeColor> = { urgenta:'red', normala:'amber', scazuta:'gray' }
const TIP_LABEL: Record<string, string> = {
  curatenie:'Curățenie', schimb_lenjerii:'Schimb lenjerii', mentenanta:'Mentenanță',
  checkin:'Pregătire check-in', checkout:'Check-out', aprovizionare:'Aprovizionare', alte:'Altele',
}
const empty = {
  tip:'curatenie', titlu:'', descriere:'', apartament_id:'',
  data_limita: format(new Date(),'yyyy-MM-dd'), ora_limita:'12:00',
  responsabil:'', status:'de_facut', prioritate:'normala', nota:'',
}

export default function TaskuriPage() {
  const [loading, setLoading] = useState(true)
  const [taskuri, setTaskuri] = useState<any[]>([])
  const [apartamente, setApartamente] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(empty)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from('taskuri').select('*, apartament:apartamente(id,nume)').order('data_limita').order('prioritate'),
      supabase.from('apartamente').select('id,nume').order('nume'),
    ])
    setTaskuri(t||[])
    setApartamente(a||[])
    setLoading(false)
  }

  async function save() {
    if (!editing.titlu) { show('error','Completează titlul'); return }
    setSaving(true)
    const payload = { ...editing }
    delete payload.id; delete payload.apartament; delete payload.created_at; delete payload.updated_at
    const { error } = editing.id
      ? await supabase.from('taskuri').update(payload).eq('id', editing.id)
      : await supabase.from('taskuri').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', editing.id ? 'Task actualizat' : 'Task adăugat')
    setOpen(false); setSaving(false); load()
  }

  async function toggleStatus(id: string, crtStatus: string) {
    const next = crtStatus === 'de_facut' ? 'in_lucru' : crtStatus === 'in_lucru' ? 'finalizat' : 'de_facut'
    await supabase.from('taskuri').update({ status: next }).eq('id', id)
    load()
  }

  const filtered = taskuri.filter(t => !filterStatus || t.status === filterStatus)
  const counts = { de_facut: taskuri.filter(t=>t.status==='de_facut').length, in_lucru: taskuri.filter(t=>t.status==='in_lucru').length, finalizat: taskuri.filter(t=>t.status==='finalizat').length }

  if (loading) return (<><PageHeader title="Task-uri" /><PageLoading /></>)

  return (
    <>
      <PageHeader title="Task-uri operaționale" subtitle={`${counts.de_facut} de făcut · ${counts.in_lucru} în lucru · ${counts.finalizat} finalizate`}
        actions={<Button variant="primary" icon={<Plus size={15}/>} onClick={()=>{setEditing(empty);setOpen(true)}}>Task nou</Button>} />
      <div className="p-6" style={{ overflowY:"auto" }}>
        <div className="flex gap-2 mb-5">
          {[['','Toate'], ['de_facut','De făcut'], ['in_lucru','În lucru'], ['finalizat','Finalizat']].map(([v,l])=>(
            <button key={v} onClick={()=>setFilterStatus(v)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: filterStatus===v?'rgba(79,124,255,0.15)':'var(--bg3)', color: filterStatus===v?'var(--accent)':'var(--text2)', border: `1px solid ${filterStatus===v?'rgba(79,124,255,0.3)':'var(--border)'}` }}>
              {l} {v && `(${counts[v as keyof typeof counts]||0})`}
            </button>
          ))}
        </div>

        <div className="bg-[#161b27] border border-[#2a3350] rounded-[14px] overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState icon={<CheckSquare size={48}/>} title="Niciun task" desc="Adaugă taskuri operaționale"
              action={<Button variant="primary" icon={<Plus size={14}/>} onClick={()=>{setEditing(empty);setOpen(true)}}>Adaugă task</Button>}/>
          ) : (
            <table>
              <thead><tr>
                <th style={{width:32}}></th><th>Titlu</th><th>Apartament</th><th>Tip</th>
                <th>Data / Ora</th><th>Responsabil</th><th>Prioritate</th><th>Status</th>
              </tr></thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} onClick={()=>{setEditing({...t});setOpen(true)}}>
                    <td onClick={e=>{e.stopPropagation();toggleStatus(t.id, t.status)}}>
                      <div className="w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-all"
                        style={{ background: t.status==='finalizat'?'var(--green)':'var(--bg3)', border: `1.5px solid ${t.status==='finalizat'?'var(--green)':'var(--border2)'}` }}>
                        {t.status==='finalizat' && <Check size={11} color="#fff" strokeWidth={3}/>}
                      </div>
                    </td>
                    <td style={{ color:'var(--text)', fontWeight:500, textDecoration: t.status==='finalizat'?'line-through':'none' }}>{t.titlu}</td>
                    <td style={{ color:'var(--text3)', fontSize:12 }}>{t.apartament?.nume||'—'}</td>
                    <td><Badge color="gray">{TIP_LABEL[t.tip]||t.tip}</Badge></td>
                    <td style={{ fontFamily:'monospace', fontSize:12 }}>{t.data_limita}{t.ora_limita?' · '+t.ora_limita:''}</td>
                    <td style={{ color:'var(--text3)', fontSize:12 }}>{t.responsabil||'—'}</td>
                    <td><Badge color={PRIO_COLOR[t.prioritate]||'gray'}>{t.prioritate}</Badge></td>
                    <td><Badge color={STATUS_COLOR[t.status]||'gray'}>{t.status.replace('_',' ')}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={open} onClose={()=>setOpen(false)} title={editing.id?'Editează task':'Task nou'} width="max-w-lg">
        <FormRow cols={2}>
          <FormGroup>
            <label>Tip task</label>
            <select value={editing.tip} onChange={e=>setEditing({...editing,tip:e.target.value})}>
              {Object.entries(TIP_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </FormGroup>
          <FormGroup>
            <label>Apartament</label>
            <select value={editing.apartament_id||''} onChange={e=>setEditing({...editing,apartament_id:e.target.value})}>
              <option value="">— Selectează —</option>
              {apartamente.map((a:any)=><option key={a.id} value={a.id}>{a.nume}</option>)}
            </select>
          </FormGroup>
        </FormRow>
        <FormGroup><label>Titlu *</label><input value={editing.titlu} onChange={e=>setEditing({...editing,titlu:e.target.value})} placeholder="Ce trebuie făcut..."/></FormGroup>
        <FormRow cols={2}>
          <FormGroup><label>Data limită</label><input type="date" value={editing.data_limita} onChange={e=>setEditing({...editing,data_limita:e.target.value})}/></FormGroup>
          <FormGroup><label>Ora limită</label><input type="time" value={editing.ora_limita||''} onChange={e=>setEditing({...editing,ora_limita:e.target.value})}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Responsabil</label><input value={editing.responsabil||''} onChange={e=>setEditing({...editing,responsabil:e.target.value})} placeholder="Nume persoană"/></FormGroup>
          <FormGroup>
            <label>Prioritate</label>
            <select value={editing.prioritate} onChange={e=>setEditing({...editing,prioritate:e.target.value})}>
              <option value="scazuta">Scăzută</option>
              <option value="normala">Normală</option>
              <option value="urgenta">Urgentă</option>
            </select>
          </FormGroup>
        </FormRow>
        <FormGroup>
          <label>Status</label>
          <select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value})}>
            <option value="de_facut">De făcut</option>
            <option value="in_lucru">În lucru</option>
            <option value="finalizat">Finalizat</option>
          </select>
        </FormGroup>
        <FormGroup><label>Note</label><textarea value={editing.nota||''} onChange={e=>setEditing({...editing,nota:e.target.value})} rows={2}/></FormGroup>
        <div className="flex gap-3 mt-2">
          <Button variant="primary" onClick={save} loading={saving} className="flex-1">Salvează</Button>
          <Button variant="secondary" onClick={()=>setOpen(false)} className="flex-1">Anulează</Button>
        </div>
      </Modal>
      <Toast toast={toast}/>
    </>
  )
}
