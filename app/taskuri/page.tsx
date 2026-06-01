'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Modal, FormGroup, FormRow, Toast, useToast, ConfirmDialog } from '@/components/ui'
import { Plus, Trash2, Edit2, Loader2, Sparkles, X, ImagePlus, Camera } from 'lucide-react'

type Task = {
  id: string
  titlu: string
  descriere?: string
  status: 'de_facut' | 'in_lucru' | 'finalizat'
  prioritate: 'urgenta' | 'normala' | 'scazuta'
  business?: string
  persoana?: string
  telefon_persoana?: string
  data_limita?: string
  ora_limita?: string
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
const empty = { titlu: '', descriere: '', status: 'de_facut' as const, prioritate: 'normala' as const, business: '', persoana: '', data_limita: '', impact_score: 5, effort_score: 5, telefon_persoana: '', ora_limita: '' }

/* ── BRAIN DUMP MODAL ── */
function BrainDumpModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [listening, setListening] = useState(false)
  const [forcedBiz, setForcedBiz] = useState('')
  const [forcedDate, setForcedDate] = useState('')
  const [image, setImage] = useState<{base64:string;type:string;preview:string}|null>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const recognitionRef = { current: null as any }
  const { toast, show } = useToast()

  function resetAll() { setInput(''); setResult(null); setForcedBiz(''); setForcedDate(''); setImage(null) }

  function handleImageUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    // Comprima imaginea la max 1200px si calitate 0.7 pentru a evita limita Vercel 4.5MB
    const img = new window.Image()
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX = 1200
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX }
          else { width = Math.round(width * MAX / height); height = MAX }
        }
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        const compressed = canvas.toDataURL('image/jpeg', 0.8)
        setImage({ base64: compressed.split(',')[1], type: 'image/jpeg', preview: compressed })
        setInput('')
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { show('error', 'Browserul nu suportă dictare vocală. Folosește Chrome.'); return }
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'ro-RO'
    recognition.continuous = true       // continuu - nu se opreste dupa pauza
    recognition.interimResults = true   // afiseaza text in timp real
    let finalTranscript = ''
    recognition.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalTranscript += t + ' '
        else interim = t
      }
      // Actualizeaza inputul cu ce s-a transcris pana acum + interim
      setInput(finalTranscript + interim)
    }
    recognition.onend = () => {
      if (listening) {
        // Restart automat daca s-a oprit din cauza pauzei
        try { recognition.start() } catch {}
      }
    }
    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech') setListening(false)
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  async function classifyAndSave() {
    // Scurtatura: analizeaza si salveaza direct fara a mai astepta confirmare
    if (!input.trim() && !image) return
    if (listening) { recognitionRef.current?.stop(); setListening(false) }
    await classify()
  }

  async function classify() {
    if (!input.trim() && !image) return  // permite imagine fara text
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input || (image ? '(din imagine)' : ''),
          forcedBiz, forcedDate,
          imageBase64: image?.base64 || null,
          imageType: image?.type || null,
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || '{}'
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
      setResult(parsed)
    } catch (err: any) {
      console.error('Classify error:', err)
      show('error', 'Eroare AI — ' + (err?.message || 'încearcă din nou'))
    }
    setLoading(false)
  }

  async function saveTask() {
    if (!result) return
    setSaving(true)
    const imp = Number(result.impact_score) || 5
    const eff = Number(result.effort_score) || 5
    // Fallback: daca AI nu a generat titlu, foloseste inputul original (primele 60 chars)
    const titluFinal = (result.titlu && result.titlu !== 'Task nou' && result.titlu.length > 3)
      ? result.titlu
      : input.slice(0, 60)
    const { error } = await supabase.from('taskuri').insert({
      titlu: titluFinal,
      descriere: result.descriere || null,
      status: 'de_facut',
      prioritate: result.prioritate || 'normala',
      business: forcedBiz || result.business || null,
      persoana: result.persoana || null,
      data_limita: forcedDate !== '' ? (forcedDate || null) : (result.data_limita || null),
      ora_limita: result.ora_limita || null,
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
        borderRadius: 20, padding: 20,
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

        {/* Business code shortcuts */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {[
            { code: '01', label: 'Apartamente', biz: 'Property Management', color: '#4DA3FF' },
            { code: '02', label: 'Produse', biz: 'Marketplace', color: '#22C55E' },
            { code: '03', label: 'Spălătorie', biz: 'Spalatorie', color: '#F59E0B' },
            { code: '04', label: 'Personal', biz: 'Personal', color: '#C4B5FD' },
            { code: '05', label: 'Admin', biz: 'Admin', color: '#94A3B8' },
            { code: '06', label: 'Financiar', biz: 'Financiar', color: '#FCD34D' },
          ].map(b => (
            <button key={b.code} onClick={() => {
              setForcedBiz(prev => prev === b.biz ? '' : b.biz)
            }} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
              background: forcedBiz === b.biz ? `${b.color}25` : 'rgba(214,228,244,0.05)',
              border: `1px solid ${forcedBiz === b.biz ? b.color + '60' : 'rgba(159,215,255,0.1)'}`,
              color: forcedBiz === b.biz ? b.color : 'rgba(159,215,255,0.45)',
              fontSize: 11, fontWeight: forcedBiz === b.biz ? 600 : 400, transition: 'all 0.12s',
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.7 }}>{b.code}</span>
              {b.label}
            </button>
          ))}
          {forcedBiz && <button onClick={() => { setForcedBiz(''); setInput(prev => prev.replace(/^\d{2}\s/, '')) }} style={{ padding: '4px 8px', borderRadius: 6, background: 'transparent', border: '1px solid rgba(159,215,255,0.08)', color: 'rgba(159,215,255,0.3)', fontSize: 11, cursor: 'pointer' }}>✕</button>}
        </div>

        {/* Timeline quick select */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.35)', marginRight: 2 }}>Când:</span>
          {[
            { label: 'Azi', days: 0 },
            { label: 'Mâine', days: 1 },
            { label: 'Săpt. asta', days: 5 },
            { label: 'Săpt. viit.', days: 7 },
            { label: 'Luna asta', days: -1 },
            { label: 'Fără', days: -99 },
          ].map(t => {
            const getDate = () => {
              if (t.days === -99) return ''
              if (t.days === -1) {
                const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().split('T')[0]
              }
              const d = new Date(); d.setDate(d.getDate()+t.days); return d.toISOString().split('T')[0]
            }
            const val = getDate()
            return (
              <button key={t.label} onClick={() => setForcedDate(val)} style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                background: forcedDate === val && val !== '' ? 'rgba(77,163,255,0.2)' : (forcedDate === '' && val === '' ? 'rgba(148,163,184,0.15)' : 'rgba(214,228,244,0.05)'),
                border: `1px solid ${forcedDate === val ? 'rgba(77,163,255,0.4)' : 'rgba(159,215,255,0.1)'}`,
                color: forcedDate === val ? '#7BC8FF' : 'rgba(159,215,255,0.4)',
                transition: 'all 0.12s',
              }}>{t.label}</button>
            )
          })}
          <input type="date" value={forcedDate} onChange={e => setForcedDate(e.target.value)}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(14,27,43,0.5)', border: '1px solid rgba(159,215,255,0.12)', color: forcedDate ? '#7BC8FF' : 'rgba(159,215,255,0.3)', width: 130 }}/>
        </div>

        {/* Image upload - iOS Safari compatible */}
        {image ? (
          <div style={{position:'relative' as const,marginBottom:10}}>
            <img src={image.preview} alt="preview"
              style={{maxHeight:130,maxWidth:'100%',borderRadius:10,border:'1px solid rgba(74,222,128,0.3)',display:'block'}}/>
            <button onClick={()=>setImage(null)}
              style={{position:'absolute' as const,top:4,right:4,width:24,height:24,borderRadius:'50%',background:'rgba(248,113,113,0.85)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <X size={12} color="#fff"/>
            </button>
            <div style={{marginTop:4,fontSize:10,color:'rgba(74,222,128,0.6)'}}>✓ AI va citi textul din imagine</div>
          </div>
        ) : (
          <div style={{marginBottom:10}}>
            <label htmlFor="task-img-upload" style={{
              display:'flex',alignItems:'center',gap:8,
              padding:'10px 14px',borderRadius:10,
              border:'1.5px dashed rgba(77,163,255,0.3)',
              background:'rgba(77,163,255,0.05)',
              color:'rgba(77,163,255,0.65)',fontSize:12,
              cursor:'pointer',userSelect:'none' as const
            }}>
              <ImagePlus size={15}/>
              <span>📸 Adaugă poză (WhatsApp, email, notițe)</span>
            </label>
            <input
              id="task-img-upload"
              type="file"
              accept="image/*,image/heic,image/heif"
              style={{display:'none'}}
              onChange={e=>{
                const f = e.target.files?.[0]
                if (f) handleImageUpload(f)
                e.target.value = ''
              }}
            />
          </div>
        )}

        {/* Voice + textarea */}
        <div style={{ position: 'relative' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={'Exemple:\n"Trebuie să sun furnizorul de prosoape săptămâna asta"\n"Idee: pachete weekend romantic la Airy Palas cu șampanie"\n"Reamintește-mi marți să trimit factura la Booking"'}
            autoFocus
            style={{
              width: '100%', minHeight: 110, padding: '12px 44px 12px 14px',
              background: 'rgba(214,228,244,0.07)', border: '1px solid rgba(159,215,255,0.15)',
              borderRadius: 10, color: '#FFFFFF', fontSize: 13,
              fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.6,
            }}
          />
          <button
            onClick={toggleVoice}
            title={listening ? 'Stop înregistrare' : 'Dictează cu vocea'}
            style={{
              position: 'absolute', top: 10, right: 10,
              width: 30, height: 30, borderRadius: '50%',
              background: listening ? 'rgba(239,68,68,0.25)' : 'rgba(77,163,255,0.15)',
              border: `1px solid ${listening ? 'rgba(239,68,68,0.5)' : 'rgba(159,215,255,0.2)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s',
              color: listening ? '#F87171' : 'rgba(159,215,255,0.6)',
            }}
          >
            {listening
              ? <span style={{ width: 8, height: 8, borderRadius: 2, background: '#F87171', display: 'block' }}/>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            }
          </button>
          {listening && (
            <div style={{ position: 'absolute', bottom: 8, right: 46, display: 'flex', alignItems: 'center', gap: 4 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 3, borderRadius: 2, background: '#F87171', animation: `pulse 0.8s ease-in-out ${i*0.15}s infinite alternate`, height: 8+i*4 }}/>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={classify}
            disabled={loading || (!input.trim() && !image)}
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
          <button onClick={resetAll} style={{ padding: '10px 16px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(159,215,255,0.12)', color: 'rgba(159,215,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
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

            <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', marginBottom: 4 }}>{result.titlu || input.slice(0,60)}</div>
            {result.descriere && <div style={{ fontSize: 12, color: 'rgba(214,228,244,0.6)', marginBottom: 12, lineHeight: 1.5 }}>{result.descriere}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
              {[
                { l: 'Prioritate', v: result.prioritate || 'normala', c: PRIO_COLOR[result.prioritate] || '#94A3B8' },
                { l: 'Business', v: forcedBiz || result.business || '—', c: forcedBiz ? '#4DA3FF' : 'rgba(159,215,255,0.7)' },
                { l: 'Impact', v: `${Number(result.impact_score) || 5}/10`, c: '#4ADE80' },
                { l: 'Efort', v: `${Number(result.effort_score) || 5}/10`, c: '#FCD34D' },
                { l: 'Deadline', v: forcedDate || result.data_limita || '—', c: forcedDate || result.data_limita ? '#F87171' : 'rgba(159,215,255,0.3)' },
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
  const today = new Date().toISOString().split('T')[0]
  const overdue = task.data_limita && task.data_limita < today
  const daysLeft = task.data_limita ? Math.ceil((new Date(task.data_limita).getTime() - new Date(today).getTime()) / 86400000) : null
  const isCriticalDeadline = daysLeft !== null && daysLeft <= 1
  const isWarningDeadline = daysLeft !== null && daysLeft >= 2 && daysLeft <= 3
  return (
    <div onClick={() => onEdit(task)} style={{
      background: 'rgba(214,228,244,0.06)', border: `1px solid rgba(159,215,255,0.1)`,
      borderLeft: `3px solid ${overdue || isCriticalDeadline ? '#EF4444' : isWarningDeadline ? '#F59E0B' : sc}`, borderRadius: 10, padding: '12px 12px 10px', cursor: 'pointer', transition: 'border-color 0.12s',
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF', marginBottom: 5, lineHeight: 1.4 }}>{task.titlu}</div>
      {task.descriere && <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.45)', marginBottom: 7, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.descriere}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: `${sc}18`, color: sc, border: `1px solid ${sc}25` }}>{PRIO_LABEL[task.prioritate]}</span>
        {task.business && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(77,163,255,0.1)', color: '#7BC8FF', border: '1px solid rgba(77,163,255,0.15)' }}>{task.business}</span>}
        {task.data_limita && (() => {
          const today = new Date().toISOString().split('T')[0]
          const diff = Math.ceil((new Date(task.data_limita).getTime() - new Date(today).getTime()) / 86400000)
          const isOverdue = diff < 0
          const isCritical = diff >= 0 && diff <= 1  // azi sau maine = rosu
          const isWarning = diff >= 2 && diff <= 3   // 2-3 zile = galben
          const bg = isOverdue || isCritical ? 'rgba(239,68,68,0.18)' : isWarning ? 'rgba(245,158,11,0.18)' : 'rgba(148,163,184,0.1)'
          const color = isOverdue || isCritical ? '#F87171' : isWarning ? '#FCD34D' : '#94A3B8'
          const border = isOverdue || isCritical ? 'rgba(239,68,68,0.3)' : isWarning ? 'rgba(245,158,11,0.3)' : 'rgba(148,163,184,0.15)'
          const prefix = isOverdue ? '🔴 ' : isCritical ? '🔴 ' : isWarning ? '🟡 ' : '📅 '
          return (
            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: bg, color, border: `1px solid ${border}` }}>
              {prefix}{task.data_limita}{task.ora_limita ? ` ⏰ ${task.ora_limita}` : ''}
            </span>
          )
        })()}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
        {/* Big check button - quick complete */}
        {task.status !== 'finalizat' && (
          <button
            onClick={() => onMove(task.id, 'finalizat')}
            title="Marchează ca finalizat"
            style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#4ADE80', transition: 'all 0.15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        )}
        {task.status === 'finalizat' && (
          <button
            onClick={() => onMove(task.id, 'de_facut')}
            title="Redeschide task"
            style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(34,197,94,0.25)', border: '1.5px solid rgba(34,197,94,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#4ADE80', transition: 'all 0.15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        )}
        {/* In lucru toggle */}
        {task.status === 'de_facut' && (
          <button onClick={() => onMove(task.id, 'in_lucru')} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(77,163,255,0.1)', color: '#7BC8FF', border: '1px solid rgba(77,163,255,0.2)', cursor: 'pointer' }}>
            ▶ Începe
          </button>
        )}
        {task.status === 'in_lucru' && (
          <button onClick={() => onMove(task.id, 'de_facut')} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(245,158,11,0.1)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.2)', cursor: 'pointer' }}>
            ⏸ Pauză
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={() => onEdit(task)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(159,215,255,0.4)', padding: 2, display: 'flex' }}><Edit2 size={12}/></button>
          <button onClick={() => onDelete(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.5)', padding: 2, display: 'flex' }}><Trash2 size={12}/></button>
        </div>
      </div>
    </div>
  )
}


/* ── TASK PROGRESS ── */
function TaskProgress({ tasks }: { tasks: Task[] }) {
  const [view, setView] = useState<'zi'|'saptamana'|'luna'>('zi')

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const weekStr = startOfWeek.toISOString().split('T')[0]

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

  const getStats = () => {
    let relevant = tasks
    if (view === 'zi') relevant = tasks.filter(t => t.created_at?.startsWith(todayStr) || (t.status === 'finalizat' && t.created_at?.startsWith(todayStr)))
    else if (view === 'saptamana') relevant = tasks.filter(t => t.created_at >= weekStr)
    else relevant = tasks.filter(t => t.created_at >= startOfMonth)

    const total = relevant.length || 1
    const done = relevant.filter(t => t.status === 'finalizat').length
    const inProgress = relevant.filter(t => t.status === 'in_lucru').length
    const urgent = tasks.filter(t => t.prioritate === 'urgenta' && t.status !== 'finalizat').length
    const pct = Math.round((done / total) * 100)

    // Streak - consecutive days with at least 1 task completed
    return { total: relevant.length, done, inProgress, urgent, pct }
  }

  const { total, done, inProgress, urgent, pct } = getStats()

  // XP-style level
  const totalDone = tasks.filter(t => t.status === 'finalizat').length
  const xp = totalDone * 10
  const level = Math.floor(xp / 100) + 1
  const xpInLevel = xp % 100
  const levelEmoji = level >= 10 ? '🏆' : level >= 7 ? '💎' : level >= 5 ? '🥇' : level >= 3 ? '🥈' : '🥉'

  return (
    <div style={{
      margin: '0 20px 0',
      background: 'rgba(214,228,244,0.05)',
      border: '1px solid rgba(159,215,255,0.1)',
      borderRadius: 14, padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
    }}>
      {/* XP Level */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 28, lineHeight: 1 }}>{levelEmoji}</div>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', marginBottom: 2 }}>Nivel {level}</div>
          <div style={{ width: 80, height: 5, borderRadius: 3, background: 'rgba(159,215,255,0.1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${xpInLevel}%`, background: 'linear-gradient(90deg,#4DA3FF,#7BC8FF)', borderRadius: 3, transition: 'width 0.5s ease' }}/>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.3)', marginTop: 2 }}>{xp} XP · {xpInLevel}/100</div>
        </div>
      </div>

      <div style={{ width: 1, height: 40, background: 'rgba(159,215,255,0.08)', flexShrink: 0 }}/>

      {/* Period tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(14,27,43,0.4)', borderRadius: 8, padding: 3, flexShrink: 0 }}>
        {(['zi','saptamana','luna'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: 'none',
            background: view === v ? 'rgba(77,163,255,0.2)' : 'transparent',
            color: view === v ? '#FFFFFF' : 'rgba(159,215,255,0.4)',
            fontWeight: view === v ? 500 : 400,
          }}>{v === 'zi' ? 'Azi' : v === 'saptamana' ? 'Săptămână' : 'Lună'}</button>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>{done}/{total} finalizate</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? '#4ADE80' : pct > 50 ? '#FCD34D' : '#4DA3FF' }}>{pct}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(159,215,255,0.08)', overflow: 'hidden', position: 'relative' }}>
          <div style={{
            height: '100%', borderRadius: 4, transition: 'width 0.6s cubic-bezier(.34,1.56,.64,1)',
            width: `${pct}%`,
            background: pct === 100
              ? 'linear-gradient(90deg,#22C55E,#4ADE80)'
              : pct > 50
                ? 'linear-gradient(90deg,#F59E0B,#FCD34D)'
                : 'linear-gradient(90deg,#3B82F6,#4DA3FF)',
          }}/>
          {/* Shimmer effect */}
          {pct > 0 && pct < 100 && (
            <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.1) 50%,transparent 100%)', animation:'shimmer 2s infinite', backgroundSize:'200% 100%' }}/>
          )}
        </div>
        {inProgress > 0 && <div style={{ fontSize: 10, color: 'rgba(77,163,255,0.6)', marginTop: 3 }}>{inProgress} în lucru</div>}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
        {urgent > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#F87171', fontFamily: 'monospace' }}>{urgent}</div>
            <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)' }}>urgente</div>
          </div>
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#4ADE80', fontFamily: 'monospace' }}>{totalDone}</div>
          <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)' }}>total ✓</div>
        </div>
      </div>

      {pct === 100 && total > 0 && (
        <div style={{ fontSize: 12, color: '#4ADE80', fontWeight: 600, animation: 'pulse 1s ease infinite' }}>
          🎉 Toate gata!
        </div>
      )}

      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
      `}</style>
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

  useEffect(() => {
    load()
    // Cere permisiunea pentru notificari
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    // Verifica task-urile cu deadline in urmatoarele 15 minute
    const checkNotifs = () => {
      const now = new Date()
      const pad = (n:number) => String(n).padStart(2,'0')
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`
      const in15 = new Date(now.getTime() + 15*60000)
      const in15Str = `${pad(in15.getHours())}:${pad(in15.getMinutes())}`
      setTasks(prev => {
        prev.forEach((task:any) => {
          if (task.ora_limita && task.data_limita === todayStr && task.status !== 'finalizat') {
            if (task.ora_limita === in15Str && Notification.permission === 'granted') {
              new Notification(`⏰ Task în 15 min: ${task.titlu}`, {
                body: `Deadline: ${task.ora_limita}${task.descriere ? ' — ' + task.descriere : ''}`,
                icon: '/icon-192.png',
                tag: `task-${task.id}`,
              })
            }
            if (task.ora_limita === timeStr && Notification.permission === 'granted') {
              new Notification(`🔔 Task acum: ${task.titlu}`, {
                body: task.descriere || 'Deadline atins!',
                icon: '/icon-192.png',
                tag: `task-now-${task.id}`,
              })
            }
          }
        })
        return prev
      })
    }
    const interval = setInterval(checkNotifs, 60000) // verifica la fiecare minut
    return () => clearInterval(interval)
  }, [])

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
      ora_limita: editing.ora_limita || null,
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
  const sortTasks = (list: Task[]) => [...list].sort((a,b) => {
    // 1. Urgente primul
    const prioOrder = { urgenta: 0, normala: 1, scazuta: 2 }
    const pDiff = (prioOrder[a.prioritate]||1) - (prioOrder[b.prioritate]||1)
    if (pDiff !== 0) return pDiff
    // 2. Cu data limita mai apropiata
    if (a.data_limita && b.data_limita) return a.data_limita.localeCompare(b.data_limita)
    if (a.data_limita) return -1
    if (b.data_limita) return 1
    // 3. Priority score desc
    return (b.priority_score||0) - (a.priority_score||0)
  })
  const byStatus = (s: Task['status']) => sortTasks(filtered.filter(t => t.status === s))

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

      {/* PROGRESS BAR SECTION */}
      <TaskProgress tasks={tasks}/>

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
          <FormGroup><label>Telefon/WA persoană</label><input value={(editing as any).telefon_persoana || ''} onChange={e=>setEditing({...editing,telefon_persoana:e.target.value} as any)} placeholder="+40 7xx xxx xxx"/></FormGroup>
          <FormGroup><label>Dată limită</label><input type="date" value={editing.data_limita || ''} onChange={e => setEditing({ ...editing, data_limita: e.target.value })}/></FormGroup>
           <FormGroup><label>⏰ Oră (opțional)</label><input type="time" value={editing.ora_limita || ''} onChange={e=>setEditing({...editing,ora_limita:e.target.value})} style={{width:'100%'}}/></FormGroup>
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
