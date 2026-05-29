'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Modal, FormGroup, FormRow, Toast, useToast, ConfirmDialog } from '@/components/ui'
import { Plus, Trash2, Edit2, Loader2, Sparkles, X } from 'lucide-react'

type Task = {
  id: string
  titlu: string
  descriere?: string
  status: 'de_facut' | 'in_lucru' | 'finalizat'
  prioritate: 'urgenta' | 'normala' | 'scazuta'
  business?: string
  persoana?: string
  data_limita?: string
  impact_score?: number
  effort_score?: number
  priority_score?: number
  created_at: string
}

const COLS: { key: Task['status']; label: string; color: string }[] = [
  { key: 'de_facut',  label: 'De făcut',  color: '#F59E0B' },
  { key: 'in_lucru',  label: 'În lucru',  color: '#4DA3FF' },
  { key: 'finalizat', label: 'Finalizat', color: '#22C55E' },
]
const PRIO_COLOR: Record<string, string> = { urgenta: '#EF4444', normala: '#4DA3FF', scazuta: '#94A3B8' }
const PRIO_LABEL: Record<string, string> = { urgenta: '🔴 Urgentă', normala: '🔵 Normală', scazuta: '⚫ Scăzută' }
const BIZ = ['Property Management', 'Marketplace', 'Spălătorie', 'Personal', 'Admin', 'Financiar', 'Alt business']
const empty = { titlu: '', descriere: '', status: 'de_facut' as const, prioritate: 'normala' as const, business: '', persoana: '', data_limita: '', impact_score: 5, effort_score: 5 }

/* ── BRAIN DUMP MODAL ── */
function BrainDumpModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const { toast, show } = useToast()

  async function classify() {
    if (!input.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input,
          system: `Ești un sistem AI de clasificare pentru un antreprenor român care administrează: apartamente în regim hotelier (AB Homes Iași), marketplace, spălătorie.\n\nAnalizează textul și returnează DOAR un JSON valid:\n{"type":"task","titlu":"titlu scurt","descriere":"detalii","prioritate":"urgenta|normala|scazuta","business":"Property Management|Marketplace|Spalatorie|Personal|Admin|Financiar","data_limita":"YYYY-MM-DD sau null","impact_score":7,"effort_score":4,"persoana":null,"rationale":"motivul clasificarii"}`
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || '{}'
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
      setResult(parsed)
    } catch {
      show('error', 'Eroare AI — încearcă din nou')
    }
    setLoading(false)
  }

  async function saveTask() {
    if (!result) return
    setSaving(true)
    const imp = Number(result.impact_score) || 5
    const eff = Number(result.effort_score) || 5
    const { error } = await supabase.from('taskuri').insert({
      titlu: result.titlu || 'Task nou',
      descriere: result.descriere || null,
      status: 'de_facut',
      prioritate: result.prioritate || 'normala',
      business: result.business || null,
      persoana: result.persoana || null,
      data_limita: result.data_limita || null,
      impact_score: imp,
      effort_score: eff,
      priority_score: Math.round((imp * 2 + (11 - eff)) / 3),
    })
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', 'Task creat!')
    onSaved(); onClose()
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(6,14,26,0.8)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'rgba(14,27,43,0.96)',
        border: '1px solid rgba(159,215,255,0.2)',
        borderRadius: 20, padding: 28,
        width: 520, maxWidth: 'calc(100vw - 40px)',
        maxHeight: 'calc(100vh - 80px)', overflowY: 'auto',
        position: 'relative', animation: 'fadeIn 0.18s ease',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
      }}>
        {/* glow top */}
        <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 1, background: 'linear-gradient(90deg,transparent,rgba(159,215,255,0.4),transparent)' }}/>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={18} color="#4DA3FF"/>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF' }}>Brain Dump AI</div>
              <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.45)' }}>Scrie orice gând — AI clasifică automat</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(159,215,255,0.08)', border: '1px solid rgba(159,215,255,0.15)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(159,215,255,0.6)' }}>
            <X size={14}/>
          </button>
        </div>

        {/* textarea */}
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={'Exemple:\n"Trebuie să sun furnizorul de prosoape săptămâna asta"\n"Idee: pachete weekend romantic la Airy Palas cu șampanie"\n"Reamintește-mi marți să trimit factura la Booking"'}
          autoFocus
          style={{
            width: '100%', minHeight: 110, padding: '12px 14px',
            background: 'rgba(214,228,244,0.07)', border: '1px solid rgba(159,215,255,0.15)',
            borderRadius: 10, color: '#FFFFFF', fontSize: 13,
            fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.6,
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={classify}
            disabled={loading || !input.trim()}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 10,
              background: loading || !input.trim() ? 'rgba(77,163,255,0.3)' : 'rgba(77,163,255,0.85)',
              border: '1px solid rgba(159,215,255,0.35)',
              color: '#FFFFFF', fontSize: 13, fontWeight: 500,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            {loading
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> Clasifică...</>
              : <><Sparkles size={14}/> Clasifică cu AI</>
            }
          </button>
          <button onClick={() => { setInput(''); setResult(null) }} style={{ padding: '10px 16px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(159,215,255,0.12)', color: 'rgba(159,215,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
            Șterge
          </button>
        </div>

        {/* Result */}
        {result && (
          <div style={{ marginTop: 16, background: 'rgba(214,228,244,0.05)', border: '1px solid rgba(159,215,255,0.12)', borderRadius: 12, padding: 16, animation: 'fadeIn 0.18s ease' }}>
            {/* type badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{
                background: 'rgba(77,163,255,0.15)', color: '#7BC8FF',
                border: '1px solid rgba(77,163,255,0.25)',
                borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              }}>{result.type || 'task'}</span>
              {result.rationale && <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)' }}>— {result.rationale}</span>}
            </div>

            <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', marginBottom: 4 }}>{result.titlu}</div>
            {result.descriere && <div style={{ fontSize: 12, color: 'rgba(214,228,244,0.6)', marginBottom: 12, lineHeight: 1.5 }}>{result.descriere}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
              {[
                { l: 'Prioritate', v: result.prioritate || 'normala', c: PRIO_COLOR[result.prioritate] || '#94A3B8' },
                { l: 'Business', v: result.business || '—', c: 'rgba(159,215,255,0.7)' },
                { l: 'Impact', v: `${Number(result.impact_score) || 5}/10`, c: '#4ADE80' },
                { l: 'Efort', v: `${Number(result.effort_score) || 5}/10`, c: '#FCD34D' },
                result.data_limita ? { l: 'Deadline', v: result.data_limita, c: '#F87171' } : null,
                result.persoana ? { l: 'Persoană', v: result.persoana, c: '#C4B5FD' } : null,
              ].filter(Boolean).map((item: any) => (
                <div key={item.l} style={{ background: 'rgba(14,27,43,0.5)', borderRadius: 7, padding: '7px 10px' }}>
                  <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)', marginBottom: 2 }}>{item.l}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: item.c }}>{item.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={saveTask}
                disabled={saving}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10,
                  background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.35)',
                  color: '#4ADE80', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}
              >
                {saving ? 'Salvează...' : '✓ Salvează ca task'}
              </button>
              <button onClick={() => setResult(null)} style={{ padding: '10px 16px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(159,215,255,0.12)', color: 'rgba(159,215,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
                Reclasifică
              </button>
            </div>
          </div>
        )}
        <Toast toast={toast}/>
      </div>
    </div>
  )
}

/* ── TASK CARD ── */
function TaskCard({ task, onEdit, onDelete, onMove }: { task: Task; onEdit: (t: Task) => void; onDelete: (id: string) => void; onMove: (id: string, s: Task['status']) => void }) {
  const sc = PRIO_COLOR[task.prioritate] || '#94A3B8'
  const overdue = task.data_limita && task.data_limita < new Date().toISOString().split('T')[0]
  return (
    <div onClick={() => onEdit(task)} style={{
      background: 'rgba(214,228,244,0.06)', border: `1px solid rgba(159,215,255,0.1)`,
      borderLeft: `3px solid ${sc}`, borderRadius: 10, padding: '12px 12px 10px', cursor: 'pointer', transition: 'border-color 0.12s',
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF', marginBottom: 5, lineHeight: 1.4 }}>{task.titlu}</div>
      {task.descriere && <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.45)', marginBottom: 7, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.descriere}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: `${sc}18`, color: sc, border: `1px solid ${sc}25` }}>{PRIO_LABEL[task.prioritate]}</span>
        {task.business && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(77,163,255,0.1)', color: '#7BC8FF', border: '1px solid rgba(77,163,255,0.15)' }}>{task.business}</span>}
        {task.data_limita && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: overdue ? 'rgba(239,68,68,0.15)' : 'rgba(148,163,184,0.1)', color: overdue ? '#F87171' : '#94A3B8', border: `1px solid ${overdue ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.15)'}` }}>{overdue ? '⚠ ' : ''}{task.data_limita}</span>}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
        {task.status !== 'de_facut' && <button onClick={() => onMove(task.id, 'de_facut')} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)', cursor: 'pointer' }}>← De făcut</button>}
        {task.status !== 'in_lucru' && <button onClick={() => onMove(task.id, 'in_lucru')} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(77,163,255,0.1)', color: '#7BC8FF', border: '1px solid rgba(77,163,255,0.2)', cursor: 'pointer' }}>În lucru</button>}
        {task.status !== 'finalizat' && <button onClick={() => onMove(task.id, 'finalizat')} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(34,197,94,0.1)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.2)', cursor: 'pointer' }}>✓ Done</button>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={() => onEdit(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(159,215,255,0.4)', padding: 2, display: 'flex' }}><Edit2 size={12}/></button>
          <button onClick={() => onDelete(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.5)', padding: 2, display: 'flex' }}><Trash2 size={12}/></button>
        </div>
      </div>
    </div>
  )
}

/* ── MAIN PAGE ── */
export default function TaskuriPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [brainOpen, setBrainOpen] = useState(false)
  const [editing, setEditing] = useState<any>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [filterBusiness, setFilterBusiness] = useState('')
  const [filterPrio, setFilterPrio] = useState('')
  const { toast, show } = useToast()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('taskuri').select('*').order('priority_score', { ascending: false }).order('created_at', { ascending: false })
    setTasks((data || []) as Task[])
    setLoading(false)
  }

  function openNew() { setEditing(empty); setEditOpen(true) }
  function openEdit(t: Task) { setEditing({ ...t }); setEditOpen(true) }

  async function save() {
    if (!editing.titlu) { show('error', 'Adaugă un titlu'); return }
    setSaving(true)
    const imp = Number(editing.impact_score) || 5
    const eff = Number(editing.effort_score) || 5
    const payload = {
      titlu: editing.titlu, descriere: editing.descriere || null,
      status: editing.status, prioritate: editing.prioritate,
      business: editing.business || null, persoana: editing.persoana || null,
      data_limita: editing.data_limita || null,
      impact_score: imp, effort_score: eff,
      priority_score: Math.round((imp * 2 + (11 - eff)) / 3),
    }
    const { error } = editing.id
      ? await supabase.from('taskuri').update(payload).eq('id', editing.id)
      : await supabase.from('taskuri').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', editing.id ? 'Actualizat' : 'Task creat')
    setEditOpen(false); setSaving(false); load()
  }

  async function moveTask(id: string, status: Task['status']) {
    await supabase.from('taskuri').update({ status }).eq('id', id)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  async function delTask() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('taskuri').delete().eq('id', deleteId)
    show('success', 'Task șters')
    setDeleteId(null); setDeleting(false); load()
  }

  const filtered = tasks.filter(t => {
    if (filterBusiness && t.business !== filterBusiness) return false
    if (filterPrio && t.prioritate !== filterPrio) return false
    return true
  })
  const byStatus = (s: Task['status']) => filtered.filter(t => t.status === s)

  return (
    <>
      <PageHeader
        title="Task-uri"
        subtitle={`${tasks.length} total · ${byStatus('de_facut').length} de făcut · ${byStatus('in_lucru').length} în lucru`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={filterBusiness} onChange={e => setFilterBusiness(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', width: 160 }}>
              <option value="">Toate businessurile</option>
              {BIZ.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={filterPrio} onChange={e => setFilterPrio(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', width: 120 }}>
              <option value="">Toate prioritățile</option>
              <option value="urgenta">🔴 Urgentă</option>
              <option value="normala">🔵 Normală</option>
              <option value="scazuta">⚫ Scăzută</option>
            </select>
            <Button variant="secondary" icon={<Sparkles size={14}/>} onClick={() => setBrainOpen(true)}>Brain Dump AI</Button>
            <Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Task nou</Button>
          </div>
        }
      />

      {/* KANBAN */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#4DA3FF' }}/>
        </div>
      ) : (
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, overflowY: 'auto', flex: 1 }}>
          {COLS.map(col => (
            <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: `${col.color}0F`, border: `1px solid ${col.color}25`, borderRadius: 10, borderTop: `2px solid ${col.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: col.color, boxShadow: `0 0 5px ${col.color}` }}/>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>{col.label}</span>
                </div>
                <span style={{ fontSize: 11, color: col.color, fontFamily: 'monospace', fontWeight: 600 }}>{byStatus(col.key).length}</span>
              </div>
              {byStatus(col.key).length === 0 ? (
                <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12, color: 'rgba(159,215,255,0.2)', border: '1px dashed rgba(159,215,255,0.08)', borderRadius: 8 }}>Niciun task</div>
              ) : byStatus(col.key).map(t => (
                <TaskCard key={t.id} task={t} onEdit={openEdit} onDelete={setDeleteId} onMove={moveTask}/>
              ))}
              <button onClick={openNew} style={{ width: '100%', padding: '8px', borderRadius: 8, background: 'transparent', border: '1px dashed rgba(159,215,255,0.08)', color: 'rgba(159,215,255,0.25)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <Plus size={11}/> Adaugă task
              </button>
            </div>
          ))}
        </div>
      )}

      {/* BRAIN DUMP MODAL — portal-style, outside kanban */}
      {brainOpen && <BrainDumpModal onClose={() => setBrainOpen(false)} onSaved={load}/>}

      {/* EDIT MODAL */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing.id ? 'Editează task' : 'Task nou'} width="560px">
        <FormGroup><label>Titlu *</label><input value={editing.titlu || ''} onChange={e => setEditing({ ...editing, titlu: e.target.value })} placeholder="Ce trebuie făcut?"/></FormGroup>
        <FormGroup><label>Descriere</label><textarea value={editing.descriere || ''} onChange={e => setEditing({ ...editing, descriere: e.target.value })} rows={2}/></FormGroup>
        <FormRow cols={3}>
          <FormGroup><label>Status</label>
            <select value={editing.status || 'de_facut'} onChange={e => setEditing({ ...editing, status: e.target.value })}>
              <option value="de_facut">De făcut</option>
              <option value="in_lucru">În lucru</option>
              <option value="finalizat">Finalizat</option>
            </select>
          </FormGroup>
          <FormGroup><label>Prioritate</label>
            <select value={editing.prioritate || 'normala'} onChange={e => setEditing({ ...editing, prioritate: e.target.value })}>
              <option value="urgenta">🔴 Urgentă</option>
              <option value="normala">🔵 Normală</option>
              <option value="scazuta">⚫ Scăzută</option>
            </select>
          </FormGroup>
          <FormGroup><label>Business</label>
            <select value={editing.business || ''} onChange={e => setEditing({ ...editing, business: e.target.value })}>
              <option value="">— Selectează —</option>
              {BIZ.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Persoană</label><input value={editing.persoana || ''} onChange={e => setEditing({ ...editing, persoana: e.target.value })} placeholder="Nume..."/></FormGroup>
          <FormGroup><label>Dată limită</label><input type="date" value={editing.data_limita || ''} onChange={e => setEditing({ ...editing, data_limita: e.target.value })}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Impact (1-10): <span style={{ color: '#4ADE80' }}>{editing.impact_score || 5}</span></label><input type="range" min={1} max={10} value={editing.impact_score || 5} onChange={e => setEditing({ ...editing, impact_score: parseInt(e.target.value) })}/></FormGroup>
          <FormGroup><label>Efort (1-10): <span style={{ color: '#FCD34D' }}>{editing.effort_score || 5}</span></label><input type="range" min={1} max={10} value={editing.effort_score || 5} onChange={e => setEditing({ ...editing, effort_score: parseInt(e.target.value) })}/></FormGroup>
        </FormRow>
        <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.4)', marginBottom: 16 }}>
          Priority Score: <span style={{ color: '#4DA3FF', fontWeight: 600 }}>{Math.round(((editing.impact_score || 5) * 2 + (11 - (editing.effort_score || 5))) / 3)}/10</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="primary" onClick={save} loading={saving} style={{ flex: 1 }}>Salvează</Button>
          <Button variant="secondary" onClick={() => setEditOpen(false)} style={{ flex: 1 }}>Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={delTask} loading={deleting} title="Șterge task" message="Sigur vrei să ștergi acest task?"/>
      <Toast toast={toast}/>
    </>
  )
}
