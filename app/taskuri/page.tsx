'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast, Modal, FormGroup, FormRow, ConfirmDialog } from '@/components/ui'
import { Plus, Trash2, Edit2, Loader2, Sparkles, Mic, Send, X, ChevronDown, ChevronUp } from 'lucide-react'

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
  apartament_id?: string
  created_at: string
}

const COLS: { key: Task['status']; label: string; color: string; bg: string }[] = [
  { key: 'de_facut',  label: 'De făcut',  color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  { key: 'in_lucru',  label: 'În lucru',  color: '#4DA3FF', bg: 'rgba(77,163,255,0.08)' },
  { key: 'finalizat', label: 'Finalizat', color: '#22C55E', bg: 'rgba(34,197,94,0.08)' },
]

const PRIO_COLOR = { urgenta: '#EF4444', normala: '#4DA3FF', scazuta: '#94A3B8' }
const PRIO_LABEL = { urgenta: '🔴 Urgentă', normala: '🔵 Normală', scazuta: '⚫ Scăzută' }
const BUSIENESS_OPTIONS = ['Property Management', 'Marketplace', 'Spălătorie', 'Personal', 'Admin', 'Financiar', 'Alt business']

const empty = { titlu: '', descriere: '', status: 'de_facut' as const, prioritate: 'normala' as const, business: '', persoana: '', data_limita: '', impact_score: 5, effort_score: 5 }

// Brain Dump AI classifier
function BrainDump({ onTaskCreated }: { onTaskCreated: () => void }) {
  const [open, setOpen] = useState(false)
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
          system: `Ești un sistem AI de clasificare pentru un antreprenor român care administrează: apartamente în regim hotelier (AB Homes Iași), marketplace, spălătorie.\n\nAnalizează textul și returnează DOAR un JSON valid (fără markdown, fără explicații):\n{\n  "type": "task|proiect|idee|nota|reminder|oportunitate",\n  "titlu": "titlu scurt max 60 chars",\n  "descriere": "detalii relevante extrase",\n  "prioritate": "urgenta|normala|scazuta",\n  "business": "Property Management|Marketplace|Spalatorie|Personal|Admin|Financiar",\n  "data_limita": "YYYY-MM-DD sau null",\n  "impact_score": 5,\n  "effort_score": 5,\n  "persoana": null,\n  "rationale": "de ce aceasta clasificare"\n}`
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || '{}'
      const parsed = JSON.parse(text.replace(/\`\`\`json|\`\`\`/g, '').trim())
      setResult(parsed)
    } catch (e) {
      show('error', 'Eroare la clasificare AI')
    }
    setLoading(false)
  }

  async function saveAsTask() {
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
    if (error) { show('error', error.message) }
    else { show('success', 'Task creat din Brain Dump!'); setOpen(false); setInput(''); setResult(null); onTaskCreated() }
    setSaving(false)
  }

  const typeColors: Record<string, string> = {
    task: 'rgba(77,163,255,0.15)', proiect: 'rgba(167,139,250,0.15)',
    idee: 'rgba(34,197,94,0.15)', nota: 'rgba(148,163,184,0.1)',
    reminder: 'rgba(245,158,11,0.15)', oportunitate: 'rgba(34,197,94,0.2)'
  }
  const typeTextColors: Record<string, string> = {
    task: '#7BC8FF', proiect: '#C4B5FD', idee: '#4ADE80',
    nota: '#94A3B8', reminder: '#FCD34D', oportunitate: '#4ADE80'
  }

  return (
    <>
      <Button variant="secondary" icon={<Sparkles size={14}/>} onClick={()=>setOpen(true)}>
        Brain Dump AI
      </Button>

      {open && (
        <div onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}} style={{
          position:'fixed',inset:0,zIndex:60,
          display:'flex',alignItems:'center',justifyContent:'center',
          background:'rgba(7,18,32,0.75)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'
        }}>
          <div style={{
            background:'rgba(14,27,43,0.92)',backdropFilter:'blur(40px)',WebkitBackdropFilter:'blur(40px)',
            border:'1px solid rgba(159,215,255,0.18)',borderRadius:20,padding:'28px',
            width:560,maxWidth:'95vw',position:'relative',animation:'fadeIn 0.18s ease'
          }}>
            <div style={{position:'absolute',top:0,left:'25%',right:'25%',height:'1px',background:'linear-gradient(90deg,transparent,rgba(159,215,255,0.35),transparent)'}}/>
            <button onClick={()=>setOpen(false)} style={{position:'absolute',top:16,right:16,background:'rgba(159,215,255,0.08)',border:'1px solid rgba(159,215,255,0.14)',borderRadius:7,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'rgba(159,215,255,0.6)'}}>
              <X size={13}/>
            </button>

            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              <Sparkles size={18} color="#4DA3FF"/>
              <h2 style={{fontSize:17,fontWeight:600,color:'#FFFFFF'}}>Brain Dump AI</h2>
            </div>
            <p style={{fontSize:12,color:'rgba(159,215,255,0.45)',marginBottom:20}}>
              Scrie orice gând, idee sau task. AI clasifică automat și creează acțiunea potrivită.
            </p>

            <textarea
              value={input}
              onChange={e=>setInput(e.target.value)}
              placeholder={`Exemple:\n"Trebuie să sun furnizorul de prosoane săptămâna asta"\n"Idee: pachete weekend romantic la Airy Palas cu șampanie"\n"Reamintește-mi marți să trimit factura la Booking"`}
              style={{
                width:'100%',minHeight:100,padding:'12px 14px',
                background:'rgba(214,228,244,0.08)',border:'1px solid rgba(159,215,255,0.15)',
                borderRadius:10,color:'#FFFFFF',fontSize:13,fontFamily:'inherit',
                resize:'vertical',outline:'none',lineHeight:1.6,
              }}
            />

            <div style={{display:'flex',gap:8,marginTop:10,marginBottom:result?16:0}}>
              <Button variant="primary" icon={loading?<Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/>:<Sparkles size={13}/>} onClick={classify} loading={loading} style={{flex:1}}>
                Clasifică cu AI
              </Button>
              <Button variant="ghost" onClick={()=>{setInput('');setResult(null)}}>Șterge</Button>
            </div>

            {result && (
              <div style={{background:'rgba(214,228,244,0.06)',border:'1px solid rgba(159,215,255,0.12)',borderRadius:12,padding:16,animation:'fadeIn 0.18s ease'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                  <span style={{background:typeColors[result.type]||'rgba(77,163,255,0.15)',color:typeTextColors[result.type]||'#7BC8FF',border:`1px solid ${typeTextColors[result.type]||'#7BC8FF'}30`,borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:600,textTransform:'uppercase'}}>
                    {result.type}
                  </span>
                  <span style={{fontSize:11,color:'rgba(159,215,255,0.4)'}}>— {result.rationale}</span>
                </div>

                <div style={{fontSize:14,fontWeight:600,color:'#FFFFFF',marginBottom:6}}>{result.titlu}</div>
                {result.descriere && <div style={{fontSize:12,color:'rgba(214,228,244,0.6)',marginBottom:10,lineHeight:1.5}}>{result.descriere}</div>}

                <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6,marginBottom:14}}>
                  {[
                    {l:'Prioritate', v:result.prioritate||'normala', c:PRIO_COLOR[(result.prioritate||'normala') as keyof typeof PRIO_COLOR]||'#94A3B8'},
                    {l:'Business', v:result.business||'—', c:'rgba(159,215,255,0.7)'},
                    {l:'Impact', v:`${Number(result.impact_score)||5}/10`, c:'#4ADE80'},
                    {l:'Efort', v:`${Number(result.effort_score)||5}/10`, c:'#FCD34D'},
                    result.data_limita ? {l:'Deadline', v:result.data_limita, c:'#F87171'} : null,
                    result.persoana ? {l:'Persoană', v:result.persoana, c:'rgba(159,215,255,0.7)'} : null,
                  ].filter(Boolean).map((item:any)=>(
                    <div key={item.l} style={{background:'rgba(14,27,43,0.4)',borderRadius:7,padding:'6px 10px'}}>
                      <div style={{fontSize:9,color:'rgba(159,215,255,0.4)',marginBottom:2}}>{item.l}</div>
                      <div style={{fontSize:12,fontWeight:500,color:item.c}}>{item.v}</div>
                    </div>
                  ))}
                </div>

                <div style={{display:'flex',gap:8}}>
                  <Button variant="primary" onClick={saveAsTask} loading={saving} style={{flex:1}}>
                    Salvează ca task
                  </Button>
                  <Button variant="ghost" onClick={()=>setResult(null)}>Reclasifică</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <Toast toast={show as any}/>
    </>
  )
}

// Task card
function TaskCard({ task, onEdit, onDelete, onMove }: { task: Task; onEdit: (t:Task)=>void; onDelete: (id:string)=>void; onMove: (id:string, status: Task['status'])=>void }) {
  const sc = PRIO_COLOR[task.prioritate] || '#94A3B8'
  const isOverdue = task.data_limita && task.data_limita < new Date().toISOString().split('T')[0]

  return (
    <div style={{
      background:'rgba(214,228,244,0.06)',
      border:`1px solid rgba(159,215,255,0.1)`,
      borderLeft:`3px solid ${sc}`,
      borderRadius:10,padding:'12px 12px 10px',
      transition:'all 0.12s',cursor:'pointer',
    }}
    onClick={()=>onEdit(task)}>
      {/* Title */}
      <div style={{fontSize:13,fontWeight:500,color:'#FFFFFF',marginBottom:5,lineHeight:1.4}}>{task.titlu}</div>

      {/* Descriere */}
      {task.descriere && <div style={{fontSize:11,color:'rgba(159,215,255,0.45)',marginBottom:7,lineHeight:1.4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{task.descriere}</div>}

      {/* Badges */}
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
        <span style={{fontSize:10,padding:'1px 7px',borderRadius:4,background:`${sc}18`,color:sc,border:`1px solid ${sc}25`}}>{PRIO_LABEL[task.prioritate]}</span>
        {task.business && <span style={{fontSize:10,padding:'1px 7px',borderRadius:4,background:'rgba(77,163,255,0.1)',color:'#7BC8FF',border:'1px solid rgba(77,163,255,0.15)'}}>{task.business}</span>}
        {task.data_limita && <span style={{fontSize:10,padding:'1px 7px',borderRadius:4,background:isOverdue?'rgba(239,68,68,0.15)':'rgba(148,163,184,0.1)',color:isOverdue?'#F87171':'#94A3B8',border:`1px solid ${isOverdue?'rgba(239,68,68,0.25)':'rgba(148,163,184,0.15)'}`}}>
          {isOverdue?'⚠ ':''}{task.data_limita}
        </span>}
        {task.persoana && <span style={{fontSize:10,padding:'1px 7px',borderRadius:4,background:'rgba(167,139,250,0.1)',color:'#C4B5FD',border:'1px solid rgba(167,139,250,0.18)'}}>{task.persoana}</span>}
      </div>

      {/* Scores */}
      {(task.impact_score || task.effort_score) && (
        <div style={{display:'flex',gap:8,marginBottom:8}}>
          {task.impact_score && <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>Impact: <span style={{color:'#4ADE80',fontWeight:600}}>{task.impact_score}/10</span></div>}
          {task.effort_score && <div style={{fontSize:10,color:'rgba(159,215,255,0.4)'}}>Efort: <span style={{color:'#FCD34D',fontWeight:600}}>{task.effort_score}/10</span></div>}
        </div>
      )}

      {/* Actions */}
      <div style={{display:'flex',gap:4,alignItems:'center'}} onClick={e=>e.stopPropagation()}>
        {/* Move buttons */}
        {task.status !== 'de_facut' && <button onClick={()=>onMove(task.id,'de_facut')} style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(245,158,11,0.1)',color:'#FCD34D',border:'1px solid rgba(245,158,11,0.2)',cursor:'pointer'}}>← De făcut</button>}
        {task.status !== 'in_lucru' && <button onClick={()=>onMove(task.id,'in_lucru')} style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(77,163,255,0.1)',color:'#7BC8FF',border:'1px solid rgba(77,163,255,0.2)',cursor:'pointer'}}>În lucru</button>}
        {task.status !== 'finalizat' && <button onClick={()=>onMove(task.id,'finalizat')} style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'rgba(34,197,94,0.1)',color:'#4ADE80',border:'1px solid rgba(34,197,94,0.2)',cursor:'pointer'}}>✓ Done</button>}
        <div style={{marginLeft:'auto',display:'flex',gap:4}}>
          <button onClick={()=>onEdit(task)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',padding:'2px',display:'flex'}}><Edit2 size={12}/></button>
          <button onClick={()=>onDelete(task.id)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(239,68,68,0.5)',padding:'2px',display:'flex'}}><Trash2 size={12}/></button>
        </div>
      </div>
    </div>
  )
}

export default function TaskuriPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<any>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string|null>(null)
  const [deleting, setDeleting] = useState(false)
  const [filterBusiness, setFilterBusiness] = useState('')
  const [filterPrio, setFilterPrio] = useState('')
  const { toast, show } = useToast()

  useEffect(()=>{load()},[])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('taskuri').select('*').order('priority_score', {ascending:false}).order('created_at', {ascending:false})
    setTasks((data||[]) as Task[])
    setLoading(false)
  }

  function openNew() { setEditing(empty); setEditOpen(true) }
  function openEdit(t: Task) { setEditing({...t}); setEditOpen(true) }

  async function save() {
    if (!editing.titlu) { show('error','Adaugă un titlu'); return }
    setSaving(true)
    const pScore = Math.round(((editing.impact_score||5)*2 + (11-(editing.effort_score||5)))/3)
    const payload = { titlu:editing.titlu, descriere:editing.descriere||null, status:editing.status, prioritate:editing.prioritate, business:editing.business||null, persoana:editing.persoana||null, data_limita:editing.data_limita||null, impact_score:editing.impact_score||5, effort_score:editing.effort_score||5, priority_score:pScore, apartament_id:editing.apartament_id||null }
    const { error } = editing.id ? await supabase.from('taskuri').update(payload).eq('id',editing.id) : await supabase.from('taskuri').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', editing.id?'Task actualizat':'Task creat')
    setEditOpen(false); setSaving(false); load()
  }

  async function moveTask(id: string, status: Task['status']) {
    await supabase.from('taskuri').update({status}).eq('id',id)
    setTasks(prev => prev.map(t => t.id===id ? {...t,status} : t))
  }

  async function delTask() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('taskuri').delete().eq('id',deleteId)
    show('success','Task șters')
    setDeleteId(null); setDeleting(false); load()
  }

  const filtered = tasks.filter(t => {
    if (filterBusiness && t.business !== filterBusiness) return false
    if (filterPrio && t.prioritate !== filterPrio) return false
    return true
  })

  const byStatus = (status: Task['status']) => filtered.filter(t => t.status === status)

  return (
    <>
      <PageHeader
        title="Task-uri"
        subtitle={`${tasks.length} total · ${byStatus('de_facut').length} de făcut · ${byStatus('in_lucru').length} în lucru`}
        actions={
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <select value={filterBusiness} onChange={e=>setFilterBusiness(e.target.value)} style={{fontSize:12,padding:'6px 10px',width:160}}>
              <option value="">Toate businessurile</option>
              {BUSIENESS_OPTIONS.map(b=><option key={b} value={b}>{b}</option>)}
            </select>
            <select value={filterPrio} onChange={e=>setFilterPrio(e.target.value)} style={{fontSize:12,padding:'6px 10px',width:130}}>
              <option value="">Toate prioritățile</option>
              <option value="urgenta">Urgentă</option>
              <option value="normala">Normală</option>
              <option value="scazuta">Scăzută</option>
            </select>
            <BrainDump onTaskCreated={load}/>
            <Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Task nou</Button>
          </div>
        }
      />

      {loading ? (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'80px 0'}}>
          <Loader2 size={28} style={{animation:'spin 1s linear infinite',color:'#4DA3FF'}}/>
        </div>
      ) : (
        <div style={{padding:'16px 20px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,overflowY:'auto',flex:1}}>
          {COLS.map(col => (
            <div key={col.key} style={{display:'flex',flexDirection:'column',gap:0}}>
              {/* Column header */}
              <div style={{
                display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'10px 14px',marginBottom:10,
                background:col.bg,border:`1px solid ${col.color}25`,
                borderRadius:10,borderTop:`2px solid ${col.color}`,
              }}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:col.color,boxShadow:`0 0 6px ${col.color}`}}/>
                  <span style={{fontSize:12,fontWeight:600,color:'#FFFFFF'}}>{col.label}</span>
                </div>
                <span style={{fontSize:11,color:col.color,fontFamily:'monospace',fontWeight:600}}>{byStatus(col.key).length}</span>
              </div>

              {/* Cards */}
              <div style={{display:'flex',flexDirection:'column',gap:8,minHeight:100}}>
                {byStatus(col.key).length === 0 ? (
                  <div style={{padding:'24px 14px',textAlign:'center',fontSize:12,color:'rgba(159,215,255,0.25)',border:'1px dashed rgba(159,215,255,0.1)',borderRadius:8}}>
                    Niciun task
                  </div>
                ) : byStatus(col.key).map(t => (
                  <TaskCard key={t.id} task={t} onEdit={openEdit} onDelete={setDeleteId} onMove={moveTask}/>
                ))}

                {/* Add button in column */}
                <button onClick={openNew} style={{
                  width:'100%',padding:'8px',borderRadius:8,
                  background:'transparent',border:'1px dashed rgba(159,215,255,0.1)',
                  color:'rgba(159,215,255,0.3)',fontSize:12,cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:5,
                  transition:'all 0.12s',marginTop:4,
                }}>
                  <Plus size={12}/> Adaugă task
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      <Modal open={editOpen} onClose={()=>setEditOpen(false)} title={editing.id?'Editează task':'Task nou'} width="580px">
        <FormGroup><label>Titlu *</label><input value={editing.titlu||''} onChange={e=>setEditing({...editing,titlu:e.target.value})} placeholder="Ce trebuie făcut?"/></FormGroup>
        <FormGroup><label>Descriere</label><textarea value={editing.descriere||''} onChange={e=>setEditing({...editing,descriere:e.target.value})} rows={2} placeholder="Detalii suplimentare..."/></FormGroup>
        <FormRow cols={3}>
          <FormGroup><label>Status</label>
            <select value={editing.status||'de_facut'} onChange={e=>setEditing({...editing,status:e.target.value})}>
              <option value="de_facut">De făcut</option>
              <option value="in_lucru">În lucru</option>
              <option value="finalizat">Finalizat</option>
            </select>
          </FormGroup>
          <FormGroup><label>Prioritate</label>
            <select value={editing.prioritate||'normala'} onChange={e=>setEditing({...editing,prioritate:e.target.value})}>
              <option value="urgenta">🔴 Urgentă</option>
              <option value="normala">🔵 Normală</option>
              <option value="scazuta">⚫ Scăzută</option>
            </select>
          </FormGroup>
          <FormGroup><label>Business</label>
            <select value={editing.business||''} onChange={e=>setEditing({...editing,business:e.target.value})}>
              <option value="">— Selectează —</option>
              {BUSIENESS_OPTIONS.map(b=><option key={b} value={b}>{b}</option>)}
            </select>
          </FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup><label>Persoană asociată</label><input value={editing.persoana||''} onChange={e=>setEditing({...editing,persoana:e.target.value})} placeholder="Nume persoană..."/></FormGroup>
          <FormGroup><label>Dată limită</label><input type="date" value={editing.data_limita||''} onChange={e=>setEditing({...editing,data_limita:e.target.value})}/></FormGroup>
        </FormRow>
        <FormRow cols={2}>
          <FormGroup>
            <label>Impact (1-10): <span style={{color:'#4ADE80',fontWeight:600}}>{editing.impact_score||5}</span></label>
            <input type="range" min={1} max={10} value={editing.impact_score||5} onChange={e=>setEditing({...editing,impact_score:parseInt(e.target.value)})}/>
          </FormGroup>
          <FormGroup>
            <label>Efort necesar (1-10): <span style={{color:'#FCD34D',fontWeight:600}}>{editing.effort_score||5}</span></label>
            <input type="range" min={1} max={10} value={editing.effort_score||5} onChange={e=>setEditing({...editing,effort_score:parseInt(e.target.value)})}/>
          </FormGroup>
        </FormRow>
        <div style={{fontSize:12,color:'rgba(159,215,255,0.4)',marginBottom:16}}>
          Priority Score calculat: <span style={{color:'#4DA3FF',fontWeight:600}}>{Math.round(((editing.impact_score||5)*2 + (11-(editing.effort_score||5)))/3)}/10</span>
        </div>
        <div style={{display:'flex',gap:10}}>
          <Button variant="primary" onClick={save} loading={saving} style={{flex:1}}>Salvează</Button>
          <Button variant="secondary" onClick={()=>setEditOpen(false)} style={{flex:1}}>Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={()=>setDeleteId(null)} onConfirm={delTask} loading={deleting} title="Șterge task" message="Sigur vrei să ștergi acest task?"/>
      <Toast toast={toast}/>
    </>
  )
}
