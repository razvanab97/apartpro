'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getNotifPrefs } from '@/lib/notifPrefs'
import { PageHeader } from '@/components/Layout'
import { Button, Modal, FormGroup, FormRow, Toast, useToast, ConfirmDialog, ConnectionError } from '@/components/ui'
import { Plus, Trash2, Edit2, Loader2, Sparkles, X, ImagePlus, Camera, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Task = {
  id: string
  titlu: string
  descriere?: string
  status: 'de_facut' | 'in_lucru' | 'finalizat' | 'template'
  prioritate: 'urgenta' | 'normala' | 'scazuta'
  business?: string
  persoana?: string
  telefon_persoana?: string
  data_limita?: string
  ora_limita?: string
  impact_score?: number
  effort_score?: number
  priority_score?: number
  recurent?: boolean
  interval_zile?: number | null
  data_urmatoare?: string | null
  created_at: string
  ordine?: number | null
}

type Carte = {
  id: string
  titlu: string
  autor?: string
  tip: 'fizic' | 'digital'
  pagini_total?: number | null
  pagini_citite: number
  status: 'in_curs' | 'terminata' | 'de_citit'
  created_at: string
}

const COLS: { key: Task['status']; label: string; color: string; icon: string }[] = [
  { key: 'de_facut',  label: 'De făcut',  color: '#F59E0B', icon: '📋' },
  { key: 'in_lucru',  label: 'În lucru',  color: '#4DA3FF', icon: '⚡' },
  { key: 'finalizat', label: 'Finalizat', color: '#22C55E', icon: '✅' },
]
const PRIO_COLOR: Record<string, string> = { urgenta: '#F97316', normala: '#4DA3FF', scazuta: '#94A3B8' }
const PRIO_LABEL: Record<string, string> = { urgenta: '🟠 Urgentă', normala: '🔵 Normală', scazuta: '⚫ Scăzută' }
const BIZ = ['Property Management', 'Marketplace', 'Spălătorie', 'Personal', 'Admin', 'Financiar', 'Alt business']
const BIZ_COLOR: Record<string, string> = {
  'Property Management': '#4DA3FF', 'Marketplace': '#22C55E', 'Spălătorie': '#F59E0B',
  'Personal': '#C4B5FD', 'Admin': '#94A3B8', 'Financiar': '#FCD34D', 'Alt business': '#64748B',
}

/* ── PILLS — selector cu butoane colorate, in loc de <select> nativ ── */
function Pills({ options, value, onChange }: { options: { value: string; label: string; color: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <button key={o.value || '_empty'} type="button" onClick={() => onChange(o.value)} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
            background: active ? `${o.color}22` : 'rgba(214,228,244,0.05)',
            border: `1px solid ${active ? o.color + '70' : 'rgba(159,215,255,0.12)'}`,
            color: active ? o.color : 'rgba(159,215,255,0.5)',
            fontSize: 12, fontWeight: active ? 600 : 400, transition: 'all 0.12s', whiteSpace: 'nowrap',
          }}>{o.label}</button>
        )
      })}
    </div>
  )
}
const empty = { titlu: '', descriere: '', status: 'de_facut' as const, prioritate: 'normala' as const, business: '', persoana: '', data_limita: '', impact_score: 5, effort_score: 5, telefon_persoana: '', ora_limita: '', recurent: false, interval_zile: 7 }

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
  const saveBtnRef = useRef<HTMLButtonElement>(null)
  const { toast, show } = useToast()
  function resetAll() { setInput(''); setResult(null); setForcedBiz(''); setForcedDate(''); setImage(null) }

  useEffect(() => {
    // Focus automat pe Salveaza, ca userul sa poata confirma instant cu Enter, fara click
    if (result) saveBtnRef.current?.focus()
  }, [result])

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
      const raw = data.content?.[0]?.text || '{}'
      // Extrage primul obiect JSON valid din raspuns
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      const cleaned = jsonMatch ? jsonMatch[0] : raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
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
                ref={saveBtnRef}
                onClick={saveTask}
                disabled={saving}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10,
                  background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.35)',
                  color: '#4ADE80', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}
              >
                {saving ? 'Salvează...' : '✓ Salvează ca task (Enter)'}
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
  const accent = task.status === 'finalizat' ? '#22C55E' : overdue || isCriticalDeadline ? '#EF4444' : isWarningDeadline ? '#F59E0B' : sc
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <div ref={setNodeRef} onClick={() => onEdit(task)} className="task-card" style={{
      position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(160deg, rgba(255,255,255,0.035), rgba(255,255,255,0.008))',
      border: '1px solid rgba(159,215,255,0.1)',
      borderRadius: 10, padding: '8px 9px 7px 22px', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
      transform: CSS.Transform.toString(transform), transitionProperty: transition ? transition : undefined,
      opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : undefined,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent }}/>
      <div {...attributes} {...listeners} onClick={e => e.stopPropagation()}
        title="Trage pentru a reordona"
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', color: 'rgba(159,215,255,0.25)', touchAction: 'none' }}>
        <GripVertical size={13}/>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', marginBottom: 3, lineHeight: 1.3 }}>{task.titlu}</div>
      {task.descriere && <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.45)', marginBottom: 5, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.descriere}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: `${sc}18`, color: sc, border: `1px solid ${sc}25` }}>{PRIO_LABEL[task.prioritate]}</span>
        {task.business && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(77,163,255,0.1)', color: '#7BC8FF', border: '1px solid rgba(77,163,255,0.15)' }}>{task.business}</span>}
        {task.data_limita && (() => {
          const today = new Date().toISOString().split('T')[0]
          const diff = Math.ceil((new Date(task.data_limita).getTime() - new Date(today).getTime()) / 86400000)
          const isDone = task.status === 'finalizat'
          const isOverdue = !isDone && diff < 0
          const isCritical = !isDone && diff >= 0 && diff <= 1  // azi sau maine = rosu
          const isWarning = !isDone && diff >= 2 && diff <= 3   // 2-3 zile = galben
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
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#4ADE80', transition: 'all 0.15s',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        )}
        {task.status === 'finalizat' && (
          <button
            onClick={() => onMove(task.id, 'de_facut')}
            title="Redeschide task"
            style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(34,197,94,0.25)', border: '1.5px solid rgba(34,197,94,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#4ADE80', transition: 'all 0.15s',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
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
    // Rutina zilei: 7 items zilnic = totalul de baza
    const RUTINA_TOTAL = 7
    let relevant = tasks.filter(t => t.business !== '__rutina__')
    if (view === 'zi') relevant = relevant.filter(t => t.created_at?.startsWith(todayStr))
    else if (view === 'saptamana') relevant = relevant.filter(t => t.created_at >= weekStr)
    else relevant = relevant.filter(t => t.created_at >= startOfMonth)

    // Adauga rutina zilei la totalul zilei curente
    const rutinaAzi = tasks.filter(t => t.business === '__rutina__' && t.created_at?.startsWith(todayStr))
    const rutinaDone = rutinaAzi.filter(t => t.status === 'finalizat').length

    let total: number, done: number
    if (view === 'zi') {
      // Azi: task-uri normale + 7 rutina
      const normalDone = relevant.filter(t => t.status === 'finalizat').length
      total = relevant.length + RUTINA_TOTAL
      done = normalDone + rutinaDone
    } else {
      total = relevant.length || 1
      done = relevant.filter(t => t.status === 'finalizat').length
    }

    const inProgress = relevant.filter(t => t.status === 'in_lucru').length
    const urgent = tasks.filter(t => t.prioritate === 'urgenta' && t.status !== 'finalizat' && t.business !== '__rutina__').length
    const pct = Math.round((done / (total||1)) * 100)

    return { total, done, inProgress, urgent, pct }
  }

  const { total, done, inProgress, urgent, pct } = getStats()

  // XP-style level - include rutina completions
  const totalDone = tasks.filter(t => t.status === 'finalizat').length
  const xp = totalDone * 10  // rutina tasks conteaza la XP
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
            <div style={{ fontSize: 18, fontWeight: 700, color: '#F97316', fontFamily: 'monospace' }}>{urgent}</div>
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
const RUTINA_ITEMS_LIST: [string, string][] = [
  ['💬', 'Mesaje check-out'],
  ['📢', 'Actualizare Publi24'],
  ['📦', 'Pregătit comenzi'],
  ['📱', 'Postare SM - Spălătorie'],
  ['🏠', 'Postare SM - Apartamente'],
  ['💰', 'Actualizare prețuri'],
  ['📖', 'Citit'],
]
function fmtElapsed(sec: number) {
  const m = Math.floor(sec / 60); const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
function fmtZiScurt(dataStr: string) {
  const d = new Date(dataStr + 'T00:00:00')
  return d.toLocaleDateString('ro-RO', { weekday: 'short', day: '2-digit', month: '2-digit' })
}
function fmtDataScurta(d: Date) {
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })
}

export default function TaskuriPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [brainOpen, setBrainOpen] = useState(false)
  const [editing, setEditing] = useState<any>(empty)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [filterBusiness, setFilterBusiness] = useState('')
  const [filterPrio, setFilterPrio] = useState('')
  const [viewMode, setViewMode] = useState<'coloane' | 'date' | 'publi24'>('coloane')
  const { toast, show } = useToast()
  const [rutinaBifata, setRutinaBifata] = useState<Set<number>>(new Set())
  const [rutinaTaskIds, setRutinaTaskIds] = useState<Record<number,string>>({})
  const [rutinaItems, setRutinaItems] = useState<[string,string][]>(RUTINA_ITEMS_LIST)
  const [rutinaEditOpen, setRutinaEditOpen] = useState(false)
  const [rutinaDraft, setRutinaDraft] = useState<[string,string][]>(RUTINA_ITEMS_LIST)
  const [rutinaNewEmoji, setRutinaNewEmoji] = useState('')
  const [rutinaNewTitlu, setRutinaNewTitlu] = useState('')
  const [savingRutina, setSavingRutina] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [quickAddCol, setQuickAddCol] = useState<string | null>(null)
  const [quickAddText, setQuickAddText] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [publi24Conturi, setPubli24Conturi] = useState<any[]>([])
  const [publi24Info, setPubli24Info] = useState('')
  const [editingPubli24Info, setEditingPubli24Info] = useState(false)
  const [publi24InfoDraft, setPubli24InfoDraft] = useState('')
  const [publi24Form, setPubli24Form] = useState({ cont: '', parola: '', nota: '' })
  const [publi24FormOpen, setPubli24FormOpen] = useState(false)
  const [editingPubli24Nota, setEditingPubli24Nota] = useState<string | null>(null)
  const [publi24NotaDraft, setPubli24NotaDraft] = useState('')
  const todayRutina = new Date().toISOString().split('T')[0]
  const [citireActiva, setCitireActiva] = useState<{ id: string; ora_start: string } | null>(null)
  const [citireTotalMin, setCitireTotalMin] = useState(0)
  const [citireNrSesiuni, setCitireNrSesiuni] = useState(0)
  const [citireElapsed, setCitireElapsed] = useState(0)
  const [citireStatsOpen, setCitireStatsOpen] = useState(false)
  const [citireIstoric, setCitireIstoric] = useState<{ data: string; total_min: number }[]>([])
  const [carti, setCarti] = useState<Carte[]>([])
  const [carteActivaId, setCarteActivaId] = useState<string | null>(null)
  const [carteMinPerPagina, setCarteMinPerPagina] = useState(2)
  const [citireDurataPresetata, setCitireDurataPresetata] = useState(20)
  const [editRitmDraft, setEditRitmDraft] = useState('')
  const [editRitmOpen, setEditRitmOpen] = useState(false)
  const [editDurataDraft, setEditDurataDraft] = useState('')
  const [editDurataOpen, setEditDurataOpen] = useState(false)
  const [addCarteOpen, setAddCarteOpen] = useState(false)
  const [addCarteForm, setAddCarteForm] = useState({ titlu: '', autor: '', tip: 'fizic' as 'fizic' | 'digital', pagini_total: '', deCitit: false })
  const [scanCarteLoading, setScanCarteLoading] = useState(false)
  const [confirmPagini, setConfirmPagini] = useState<{ sesiuneId: string; durataMin: number; pagini: string } | null>(null)
  const [citireSetariLoaded, setCitireSetariLoaded] = useState(false)
  const [editPaginiOpen, setEditPaginiOpen] = useState(false)
  const [editPaginiDraft, setEditPaginiDraft] = useState('')
  const [deleteCarteId, setDeleteCarteId] = useState<string | null>(null)
  const carteScanInputRef = useRef<HTMLInputElement>(null)
  const CITIT_IDX = rutinaItems.findIndex(r => r[1] === 'Citit')
  const cartiActive = carti.filter(c => c.status !== 'de_citit')
  const cartiDeCitit = carti.filter(c => c.status === 'de_citit')
  const carteActiva = carti.find(c => c.id === carteActivaId) || null
  const carteIndex = cartiActive.findIndex(c => c.id === carteActivaId)


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
    // Register push + check recurente
    registerPush()
    checkRecurente()
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { (async () => { const items = await loadRutinaItems(); loadRutina(items) })(); loadCitire(); loadCitireIstoric(); loadPubli24(); loadCarti(); loadCitireSetari() }, [])

  useEffect(() => {
    if (citireSetariLoaded && cartiActive.length > 0 && !cartiActive.some(c => c.id === carteActivaId)) {
      (async () => { await selectCarte(cartiActive[0].id, true) })()
    }
  }, [citireSetariLoaded, cartiActive, carteActivaId])

  async function loadPubli24() {
    const { data: conturi } = await supabase.from('publi24_conturi').select('*').order('created_at')
    setPubli24Conturi(conturi || [])
    const { data: info } = await supabase.from('setari').select('valoare').eq('cheie', 'publi24_info').maybeSingle()
    setPubli24Info(info?.valoare || '')
  }

  async function savePubli24Info() {
    const { data: ex } = await supabase.from('setari').select('id').eq('cheie', 'publi24_info').maybeSingle()
    if (ex?.id) await supabase.from('setari').update({ valoare: publi24InfoDraft }).eq('id', ex.id)
    else await supabase.from('setari').insert({ cheie: 'publi24_info', valoare: publi24InfoDraft })
    setPubli24Info(publi24InfoDraft)
    setEditingPubli24Info(false)
    show('success', '✓ Info salvat')
  }

  async function addPubli24Cont() {
    if (!publi24Form.cont.trim() || !publi24Form.parola.trim()) return
    const { error } = await supabase.from('publi24_conturi').insert({
      cont: publi24Form.cont.trim(), parola: publi24Form.parola.trim(), nota: publi24Form.nota.trim() || null,
    })
    if (error) { show('error', error.message); return }
    setPubli24Form({ cont: '', parola: '', nota: '' })
    setPubli24FormOpen(false)
    loadPubli24()
  }

  async function deletePubli24Cont(id: string) {
    if (!confirm('Ștergi acest cont Publi24?')) return
    await supabase.from('publi24_conturi').delete().eq('id', id)
    loadPubli24()
  }

  async function savePubli24Nota(id: string) {
    await supabase.from('publi24_conturi').update({ nota: publi24NotaDraft.trim() || null }).eq('id', id)
    setEditingPubli24Nota(null)
    loadPubli24()
  }

  async function copyPubli24(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      show('success', `✓ ${label} copiat`)
    } catch {
      show('error', 'Nu s-a putut copia')
    }
  }

  useEffect(() => {
    if (!citireActiva) return
    const start = new Date(citireActiva.ora_start).getTime()
    const tick = () => setCitireElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [citireActiva])

  async function registerPush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      await navigator.serviceWorker.register('/sw.js')
      const reg = await navigator.serviceWorker.ready
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) return
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey
      })
      await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub, categorii: getNotifPrefs() })
      })
    } catch (e) { console.log('Push:', e) }
  }

  function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }

  async function checkRecurente() {
    const today = new Date().toISOString().slice(0, 10)
    const { data: recurente, error } = await supabase
      .from('taskuri').select('*')
      .eq('recurent', true)
      .not('interval_zile', 'is', null)
    if (error) { console.error('[checkRecurente]', error.message); return }
    for (const task of (recurente || [])) {
      if (!task.data_urmatoare || task.data_urmatoare > today) continue
      // Creeaza task nou activ
      await supabase.from('taskuri').insert({
        titlu: task.titlu,
        descriere: task.descriere,
        prioritate: task.prioritate || 'normala',
        business: task.business,
        status: 'de_facut',
        recurent: false,
        interval_zile: null,
      })
      // Actualizeaza data urmatoare pe template
      const { error: updErr } = await supabase.from('taskuri').update({
        data_urmatoare: addDays(today, task.interval_zile),
        status: 'template'
      }).eq('id', task.id)
      if (updErr) console.error('[checkRecurente] update sablon', updErr.message)
      // Push notification
      fetch('/api/push-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🔔 ' + task.titlu,
          body: task.descriere || 'Task recurent generat automat',
          url: '/taskuri',
          tag: 'recurent-' + task.id,
          tip: 'task'
        })
      }).catch(() => {})
      supabase.from('notificari').insert({
        mesaj: '🔔 ' + task.titlu, tip: 'task', citit: false, url: '/taskuri',
      }).then(()=>{})
    }
    load()
  }

  async function loadRutinaItems(): Promise<[string,string][]> {
    const { data } = await supabase.from('setari').select('valoare').eq('cheie', 'rutina_items').maybeSingle()
    let items: [string,string][] = RUTINA_ITEMS_LIST
    if (data?.valoare) {
      try {
        const parsed = JSON.parse(data.valoare)
        if (Array.isArray(parsed) && parsed.length > 0) items = parsed
      } catch {}
    }
    setRutinaItems(items)
    return items
  }

  async function saveRutinaItems(items: [string,string][]) {
    setSavingRutina(true)
    const { data: ex } = await supabase.from('setari').select('id').eq('cheie', 'rutina_items').maybeSingle()
    const valoare = JSON.stringify(items)
    if (ex?.id) await supabase.from('setari').update({ valoare }).eq('id', ex.id)
    else await supabase.from('setari').insert({ cheie: 'rutina_items', valoare })
    setSavingRutina(false)
    setRutinaItems(items)
    setRutinaEditOpen(false)
    show('success', '✓ Rutina a fost actualizată')
    loadRutina()
  }

  async function loadRutina(items: [string,string][] = rutinaItems) {
    const { data } = await supabase.from('taskuri')
      .select('id,titlu,status')
      .eq('business', '__rutina__')
      .gte('created_at', todayRutina + 'T00:00:00')
      .lte('created_at', todayRutina + 'T23:59:59')
    if (!data) return
    const bifate = new Set<number>()
    const ids: Record<number,string> = {}
    data.forEach((t:any) => {
      const idx = items.findIndex(r => r[1] === t.titlu)
      if (idx >= 0) {
        ids[idx] = t.id
        if (t.status === 'finalizat') bifate.add(idx)
      }
    })
    setRutinaBifata(bifate)
    setRutinaTaskIds(ids)
  }

  async function toggleRutina(idx: number) {
    const item = rutinaItems[idx]
    const isBifat = rutinaBifata.has(idx)
    if (rutinaTaskIds[idx]) {
      const newStatus = isBifat ? 'de_facut' : 'finalizat'
      await supabase.from('taskuri').update({ status: newStatus }).eq('id', rutinaTaskIds[idx])
      setRutinaBifata(prev => { const n = new Set(prev); isBifat ? n.delete(idx) : n.add(idx); return n })
      setTasks((prev:Task[]) => prev.map(t => t.id === rutinaTaskIds[idx] ? {...t, status: newStatus as Task['status']} : t))
    } else {
      const { data } = await supabase.from('taskuri').insert({
        titlu: item[1], status: 'finalizat', prioritate: 'normala', business: '__rutina__',
      }).select().single()
      if (data) {
        setRutinaTaskIds(prev => ({...prev, [idx]: data.id}))
        setRutinaBifata(prev => { const n = new Set(prev); n.add(idx); return n })
        setTasks((prev:Task[]) => [...prev, data as Task])
      }
    }
  }

  async function loadCitire() {
    const { data } = await supabase.from('citire_sesiuni')
      .select('id,ora_start,ora_stop,durata_min').eq('data', todayRutina).order('ora_start')
    if (!data) return
    const activa = data.find((s:any) => !s.ora_stop)
    const terminate = data.filter((s:any) => s.ora_stop)
    setCitireActiva(activa ? { id: activa.id, ora_start: activa.ora_start } : null)
    setCitireTotalMin(terminate.reduce((sum:number, s:any) => sum + (s.durata_min || 0), 0))
    setCitireNrSesiuni(terminate.length)
  }

  async function startCitire() {
    const { data, error } = await supabase.from('citire_sesiuni')
      .insert({ data: todayRutina, ora_start: new Date().toISOString(), carte_id: carteActivaId }).select().single()
    if (error) { console.error('[startCitire]', error); show('error', 'Nu s-a putut porni sesiunea de citit'); return }
    if (data) setCitireActiva({ id: data.id, ora_start: data.ora_start })
  }

  async function stopCitire() {
    if (!citireActiva) return
    const start = new Date(citireActiva.ora_start).getTime()
    const durataMin = Math.max(1, Math.round((Date.now() - start) / 60000))
    const { error } = await supabase.from('citire_sesiuni').update({ ora_stop: new Date().toISOString(), durata_min: durataMin }).eq('id', citireActiva.id)
    if (error) { console.error('[stopCitire]', error); show('error', 'Nu s-a putut salva sesiunea de citit'); return }
    const eraPrimaAzi = citireNrSesiuni === 0
    const sesiuneId = citireActiva.id
    setCitireActiva(null)
    setCitireElapsed(0)
    setCitireTotalMin(prev => prev + durataMin)
    setCitireNrSesiuni(prev => prev + 1)
    if (eraPrimaAzi && CITIT_IDX >= 0 && !rutinaBifata.has(CITIT_IDX)) await toggleRutina(CITIT_IDX)
    if (carteActivaId) {
      const estimat = Math.max(1, Math.round(durataMin / carteMinPerPagina))
      setConfirmPagini({ sesiuneId, durataMin, pagini: String(estimat) })
    }
  }

  async function sesiunePresetata() {
    if (!carteActivaId) { show('error', 'Selectează o carte mai întâi'); return }
    const now = new Date()
    const start = new Date(now.getTime() - citireDurataPresetata * 60000)
    const { data, error } = await supabase.from('citire_sesiuni').insert({
      data: todayRutina, ora_start: start.toISOString(), ora_stop: now.toISOString(),
      durata_min: citireDurataPresetata, carte_id: carteActivaId,
    }).select().single()
    if (error) { console.error('[sesiunePresetata]', error); show('error', 'Nu s-a putut adăuga sesiunea'); return }
    const eraPrimaAzi = citireNrSesiuni === 0
    setCitireTotalMin(prev => prev + citireDurataPresetata)
    setCitireNrSesiuni(prev => prev + 1)
    if (eraPrimaAzi && CITIT_IDX >= 0 && !rutinaBifata.has(CITIT_IDX)) await toggleRutina(CITIT_IDX)
    const estimat = Math.max(1, Math.round(citireDurataPresetata / carteMinPerPagina))
    setConfirmPagini({ sesiuneId: data.id, durataMin: citireDurataPresetata, pagini: String(estimat) })
  }

  async function loadCarti() {
    const { data } = await supabase.from('carti').select('*').order('created_at', { ascending: false })
    setCarti(data || [])
  }

  async function loadCitireSetari() {
    const { data } = await supabase.from('setari').select('cheie,valoare')
      .in('cheie', ['citire_min_per_pagina', 'citire_durata_presetata_min', 'carte_activa_id'])
    for (const row of data || []) {
      if (row.cheie === 'citire_min_per_pagina') setCarteMinPerPagina(Number(row.valoare) || 2)
      if (row.cheie === 'citire_durata_presetata_min') setCitireDurataPresetata(Number(row.valoare) || 20)
      if (row.cheie === 'carte_activa_id') setCarteActivaId(row.valoare || null)
    }
    setCitireSetariLoaded(true)
  }

  async function setSetare(cheie: string, valoare: string) {
    const { data: ex } = await supabase.from('setari').select('id').eq('cheie', cheie).maybeSingle()
    if (ex?.id) await supabase.from('setari').update({ valoare }).eq('id', ex.id)
    else await supabase.from('setari').insert({ cheie, valoare })
  }

  async function selectCarte(id: string, silent = false) {
    setCarteActivaId(id)
    await setSetare('carte_activa_id', id)
    if (!silent) {
      const c = carti.find(c => c.id === id)
      show('success', `Carte selectată: ${c?.titlu || ''}`)
    }
  }

  function goPrevCarte() {
    if (cartiActive.length < 2) return
    const idx = carteIndex < 0 ? 0 : (carteIndex - 1 + cartiActive.length) % cartiActive.length
    selectCarte(cartiActive[idx].id, true)
  }

  function goNextCarte() {
    if (cartiActive.length < 2) return
    const idx = carteIndex < 0 ? 0 : (carteIndex + 1) % cartiActive.length
    selectCarte(cartiActive[idx].id, true)
  }

  async function saveEditPagini() {
    if (!carteActiva) { setEditPaginiOpen(false); return }
    const v = parseInt(editPaginiDraft)
    if (isNaN(v) || v < 0) { setEditPaginiOpen(false); return }
    const terminata = !!carteActiva.pagini_total && v >= carteActiva.pagini_total
    await supabase.from('carti').update({
      pagini_citite: v, status: terminata ? 'terminata' : 'in_curs',
      terminata_la: terminata ? new Date().toISOString() : null,
    }).eq('id', carteActiva.id)
    setCarti(prev => prev.map(c => c.id === carteActiva.id ? { ...c, pagini_citite: v, status: terminata ? 'terminata' : 'in_curs' } : c))
    setEditPaginiOpen(false)
    if (terminata) show('success', `🎉 Ai terminat cartea „${carteActiva.titlu}"!`)
  }

  async function terminaCarte() {
    if (!carteActiva) return
    await supabase.from('carti').update({
      status: 'terminata', terminata_la: new Date().toISOString(),
      pagini_citite: carteActiva.pagini_total ? carteActiva.pagini_total : carteActiva.pagini_citite,
    }).eq('id', carteActiva.id)
    setCarti(prev => prev.map(c => c.id === carteActiva.id
      ? { ...c, status: 'terminata', pagini_citite: c.pagini_total ? c.pagini_total : c.pagini_citite }
      : c))
    show('success', `🎉 Ai terminat cartea „${carteActiva.titlu}"!`)
  }

  async function incepeCarteDeCitit(id: string) {
    await supabase.from('carti').update({ status: 'in_curs' }).eq('id', id)
    setCarti(prev => prev.map(c => c.id === id ? { ...c, status: 'in_curs' } : c))
    await selectCarte(id)
  }

  async function stergeCarte() {
    if (!deleteCarteId) return
    const id = deleteCarteId
    await supabase.from('citire_sesiuni').update({ carte_id: null }).eq('carte_id', id)
    await supabase.from('carti').delete().eq('id', id)
    setCarti(prev => prev.filter(c => c.id !== id))
    if (carteActivaId === id) {
      setCarteActivaId(null)
      await setSetare('carte_activa_id', '')
    }
    setDeleteCarteId(null)
  }

  async function addCarte() {
    if (!addCarteForm.titlu.trim()) { show('error', 'Titlul e obligatoriu'); return }
    const status = addCarteForm.deCitit ? 'de_citit' : 'in_curs'
    const { data, error } = await supabase.from('carti').insert({
      titlu: addCarteForm.titlu.trim(),
      autor: addCarteForm.autor.trim() || null,
      tip: addCarteForm.tip,
      pagini_total: addCarteForm.pagini_total ? parseInt(addCarteForm.pagini_total) : null,
      pagini_citite: 0, status,
    }).select().single()
    if (error) { console.error('[addCarte]', error); show('error', 'Nu s-a putut adăuga cartea'); return }
    setCarti(prev => [data as Carte, ...prev])
    setAddCarteOpen(false)
    setAddCarteForm({ titlu: '', autor: '', tip: 'fizic', pagini_total: '', deCitit: false })
    if (status === 'in_curs') await selectCarte(data.id)
    else show('success', `Adăugată în coada „De citit": ${data.titlu}`)
  }

  async function scanCarteFoto(file: File) {
    setScanCarteLoading(true)
    try {
      const base64Data = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
      })
      const resp = await fetch('/api/carte-scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType: file.type || 'image/jpeg' }),
      })
      const data = await resp.json()
      if (data.titlu) setAddCarteForm(f => ({ ...f, titlu: data.titlu, autor: data.autor || f.autor }))
      else show('error', 'Nu am putut citi coperta, completează manual')
    } catch (e) {
      console.error('[scanCarteFoto]', e)
      show('error', 'Eroare la scanarea copertei')
    } finally {
      setScanCarteLoading(false)
    }
  }

  async function confirmaPaginiCitite() {
    if (!confirmPagini || !carteActivaId) { setConfirmPagini(null); return }
    const pagini = parseInt(confirmPagini.pagini) || 0
    if (pagini <= 0) { setConfirmPagini(null); return }
    await supabase.from('citire_sesiuni').update({ pagini_citite: pagini }).eq('id', confirmPagini.sesiuneId)
    const carte = carti.find(c => c.id === carteActivaId)
    if (carte) {
      const paginiCitite = carte.pagini_citite + pagini
      const terminata = !!carte.pagini_total && paginiCitite >= carte.pagini_total
      await supabase.from('carti').update({
        pagini_citite: paginiCitite,
        status: terminata ? 'terminata' : 'in_curs',
        terminata_la: terminata ? new Date().toISOString() : null,
      }).eq('id', carte.id)
      setCarti(prev => prev.map(c => c.id === carte.id ? { ...c, pagini_citite: paginiCitite, status: terminata ? 'terminata' : 'in_curs' } : c))
      if (terminata) show('success', `🎉 Ai terminat cartea „${carte.titlu}"!`)
    }
    const ritmNou = Math.max(0.2, confirmPagini.durataMin / pagini)
    setCarteMinPerPagina(ritmNou)
    await setSetare('citire_min_per_pagina', String(Math.round(ritmNou * 10) / 10))
    setConfirmPagini(null)
  }

  async function saveMinPerPagina() {
    const v = parseFloat(editRitmDraft.replace(',', '.'))
    if (!v || v <= 0) { setEditRitmOpen(false); return }
    setCarteMinPerPagina(v)
    await setSetare('citire_min_per_pagina', String(v))
    setEditRitmOpen(false)
  }

  async function saveDurataPresetata() {
    const v = parseInt(editDurataDraft)
    if (!v || v <= 0) { setEditDurataOpen(false); return }
    setCitireDurataPresetata(v)
    await setSetare('citire_durata_presetata_min', String(v))
    setEditDurataOpen(false)
  }

  async function loadCitireIstoric() {
    const acum7zile = new Date(); acum7zile.setDate(acum7zile.getDate() - 6)
    const { data } = await supabase.from('citire_sesiuni')
      .select('data,durata_min').gte('data', acum7zile.toISOString().split('T')[0]).not('durata_min', 'is', null)
    if (!data) return
    const perZi: Record<string, number> = {}
    data.forEach((s:any) => { perZi[s.data] = (perZi[s.data] || 0) + (s.durata_min || 0) })
    setCitireIstoric(Object.entries(perZi).map(([data, total_min]) => ({ data, total_min })).sort((a,b) => b.data.localeCompare(a.data)))
  }

  async function load() {
    setLoading(true)
    setLoadError(false)
    const bail=setTimeout(()=>{ setLoading(false); setLoadError(true) },20000)
    try{
      const { data, error } = await supabase.from('taskuri').select('*').order('priority_score', { ascending: false }).order('created_at', { ascending: false })
      if(error) throw error
      setTasks((data || []) as Task[])
      clearTimeout(bail)
    }catch(err){console.error('[taskuri load]',err);clearTimeout(bail);setLoadError(true)}
    setLoading(false)
  }

  function openNew() { setEditing(empty); setShowAdvanced(false); setEditOpen(true) }
  function openEdit(t: Task) { setEditing({ ...t }); setShowAdvanced(false); setEditOpen(true) }

  async function quickAddTask(status: string) {
    const titlu = quickAddText.trim()
    if (!titlu) { setQuickAddCol(null); return }
    const { error } = await supabase.from('taskuri').insert({
      titlu, status, prioritate: 'normala',
      business: filterBusiness || null,
      impact_score: 5, effort_score: 5, priority_score: 5,
    })
    if (error) { show('error', error.message); return }
    setQuickAddText('')
    setQuickAddCol(null)
    load()
  }

  async function save() {
    if (!editing.titlu) { show('error', 'Adaugă un titlu'); return }
    setSaving(true)
    const imp = Number(editing.impact_score) || 5
    const eff = Number(editing.effort_score) || 5
    // Recurenta se poate seta doar la creare - un task existent, vizibil in Kanban,
    // nu se transforma retroactiv in sablon ascuns
    const isRecurent = !editing.id && !!editing.recurent
    const payload: any = {
      titlu: editing.titlu, descriere: editing.descriere || null,
      status: isRecurent ? 'template' : editing.status, prioritate: editing.prioritate,
      business: editing.business || null, persoana: editing.persoana || null,
      data_limita: editing.data_limita || null,
      ora_limita: editing.ora_limita || null,
      impact_score: imp, effort_score: eff,
      priority_score: Math.round((imp * 2 + (11 - eff)) / 3),
      recurent: isRecurent,
      interval_zile: isRecurent ? (Number(editing.interval_zile) || 7) : null,
      data_urmatoare: isRecurent ? (editing.data_limita || new Date().toISOString().slice(0, 10)) : null,
    }
    const { error } = editing.id
      ? await supabase.from('taskuri').update(payload).eq('id', editing.id)
      : await supabase.from('taskuri').insert(payload)
    if (error) { show('error', error.message); setSaving(false); return }
    show('success', isRecurent ? 'Task recurent creat — va genera copii automat' : (editing.id ? 'Actualizat' : 'Task creat'))
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
    if (t.business === '__rutina__') return false  // rutina zilei e separata
    if (t.status === 'template') return false  // sablon recurent, generat automat de checkRecurente()
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
  const byStatus = (s: Task['status']) => {
    const list = filtered.filter(t => t.status === s)
    const hasManualOrder = list.some(t => t.ordine != null)
    if (hasManualOrder) return [...list].sort((a, b) => (a.ordine ?? Infinity) - (b.ordine ?? Infinity))
    return sortTasks(list)
  }

  async function handleDragEnd(colKey: Task['status'], event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const list = colKey === 'finalizat' ? finalizatShown : byStatus(colKey)
    const oldIndex = list.findIndex(t => t.id === active.id)
    const newIndex = list.findIndex(t => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(list, oldIndex, newIndex)
    const updates = reordered.map((t, i) => ({ id: t.id, ordine: i * 100 }))
    setTasks(prev => prev.map(t => {
      const u = updates.find(x => x.id === t.id)
      return u ? { ...t, ordine: u.ordine } : t
    }))
    await Promise.all(updates.map(u => supabase.from('taskuri').update({ ordine: u.ordine }).eq('id', u.id)))
  }

  const FINALIZAT_CAP = 20
  const finalizatAll = [...filtered.filter(t => t.status === 'finalizat')].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const finalizatShown = finalizatAll.slice(0, FINALIZAT_CAP)
  const finalizatHidden = finalizatAll.length - finalizatShown.length

  const dateGroups = (() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const weekEndStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    const buckets = [
      { key: 'restante',    label: '🔴 Restante',       color: '#EF4444', items: [] as Task[] },
      { key: 'azi',         label: '📅 Azi',             color: '#F59E0B', items: [] as Task[] },
      { key: 'maine',       label: '🌤 Mâine',           color: '#FCD34D', items: [] as Task[] },
      { key: 'saptamana',   label: '📆 Săptămâna asta',  color: '#4DA3FF', items: [] as Task[] },
      { key: 'mai_tarziu',  label: '🗓 Mai târziu',      color: '#94A3B8', items: [] as Task[] },
      { key: 'fara_data',   label: '⚪ Fără dată',       color: '#64748B', items: [] as Task[] },
    ]
    const active = filtered.filter(t => t.status !== 'finalizat')
    for (const t of active) {
      if (!t.data_limita) buckets[5].items.push(t)
      else if (t.data_limita < todayStr) buckets[0].items.push(t)
      else if (t.data_limita === todayStr) buckets[1].items.push(t)
      else if (t.data_limita === tomorrowStr) buckets[2].items.push(t)
      else if (t.data_limita <= weekEndStr) buckets[3].items.push(t)
      else buckets[4].items.push(t)
    }
    return buckets.map(b => ({ ...b, items: sortTasks(b.items) })).filter(b => b.items.length > 0)
  })()

  return (
    <>
      <PageHeader
        title="Task-uri"
        subtitle={`${tasks.length} total · ${byStatus('de_facut').length} de făcut · ${byStatus('in_lucru').length} în lucru`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'rgba(77,163,255,0.06)', border: '1px solid rgba(77,163,255,0.15)', borderRadius: 8, padding: 2 }}>
              <button onClick={() => setViewMode('coloane')} style={{ fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'coloane' ? '#4DA3FF' : 'transparent', color: viewMode === 'coloane' ? '#0B1224' : 'rgba(159,215,255,0.6)' }}>Pe coloane</button>
              <button onClick={() => setViewMode('date')} style={{ fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'date' ? '#4DA3FF' : 'transparent', color: viewMode === 'date' ? '#0B1224' : 'rgba(159,215,255,0.6)' }}>Pe date</button>
              <button onClick={() => setViewMode('publi24')} style={{ fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === 'publi24' ? '#4DA3FF' : 'transparent', color: viewMode === 'publi24' ? '#0B1224' : 'rgba(159,215,255,0.6)' }}>📢 Publi24</button>
            </div>
            <select value={filterBusiness} onChange={e => setFilterBusiness(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', width: 160 }}>
              <option value="">Toate businessurile</option>
              {BIZ.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={filterPrio} onChange={e => setFilterPrio(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', width: 120 }}>
              <option value="">Toate prioritățile</option>
              <option value="urgenta">🟠 Urgentă</option>
              <option value="normala">🔵 Normală</option>
              <option value="scazuta">⚫ Scăzută</option>
            </select>
            <Button variant="secondary" icon={<Sparkles size={14}/>} onClick={() => setBrainOpen(true)}>Brain Dump AI</Button>
            <Button variant="primary" icon={<Plus size={14}/>} onClick={openNew}>Task nou</Button>
          </div>
        }
      />

      {/* RUTINA ZILEI */}
      <div style={{ padding:'12px 20px 0' }}>
        <div style={{ background:'rgba(11,18,36,0.7)', border:'1px solid rgba(100,160,255,0.12)', borderRadius:14, padding:'14px 18px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'rgba(159,215,255,0.6)', textTransform:'uppercase', letterSpacing:'.08em' }}>
              ☀️ Rutina zilei — {rutinaBifata.size}/{rutinaItems.length} completate
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ fontSize:11, color: rutinaBifata.size === rutinaItems.length ? '#4ADE80' : 'rgba(159,215,255,0.3)' }}>
                {rutinaBifata.size === rutinaItems.length ? '✓ Zi completă!' : `${rutinaItems.length - rutinaBifata.size} rămase`}
              </div>
              <button onClick={() => { setRutinaDraft(rutinaItems.filter(([,t]) => t !== 'Citit')); setRutinaEditOpen(true) }}
                title="Editează rutina"
                style={{ width:24, height:24, borderRadius:6, border:'1px solid rgba(159,215,255,0.15)', background:'rgba(159,215,255,0.06)', color:'rgba(159,215,255,0.5)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>
                ✎
              </button>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
            {rutinaItems.map(([emoji, titlu], idx) => {
              if (idx === CITIT_IDX) return null
              const bifat = rutinaBifata.has(idx)
              return (
                <button key={idx} onClick={() => toggleRutina(idx)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', borderRadius:8,
                    background: bifat ? 'rgba(74,222,128,0.12)' : 'rgba(77,163,255,0.06)',
                    border: `1px solid ${bifat ? 'rgba(74,222,128,0.35)' : 'rgba(77,163,255,0.15)'}`,
                    cursor:'pointer', transition:'all .15s' }}>
                  <span style={{ fontSize:14 }}>{emoji}</span>
                  <span style={{ fontSize:11, fontWeight:600, color: bifat ? '#4ADE80' : 'rgba(159,215,255,0.7)',
                    textDecoration: bifat ? 'line-through' : 'none' }}>
                    {idx+1}. {titlu}
                  </span>
                  {bifat && <span style={{ fontSize:11, color:'#4ADE80' }}>✓</span>}
                </button>
              )
            })}
          </div>

          {/* CITIT - tracking sesiuni cu Start/Stop + carti */}
          <div style={{ marginTop:10, padding:'10px 13px', borderRadius:8,
            background: citireActiva ? 'rgba(251,146,60,0.08)' : rutinaBifata.has(CITIT_IDX) ? 'rgba(74,222,128,0.08)' : 'rgba(77,163,255,0.06)',
            border: `1px solid ${citireActiva ? 'rgba(251,146,60,0.3)' : rutinaBifata.has(CITIT_IDX) ? 'rgba(74,222,128,0.25)' : 'rgba(77,163,255,0.15)'}` }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap' as const, gap:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:14 }}>📖</span>
                <span style={{ fontSize:11, fontWeight:600, color: rutinaBifata.has(CITIT_IDX) ? '#4ADE80' : 'rgba(159,215,255,0.7)' }}>
                  {CITIT_IDX+1}. Citit
                </span>
                {rutinaBifata.has(CITIT_IDX) && <span style={{ fontSize:11, color:'#4ADE80' }}>✓</span>}
                {citireNrSesiuni>0 && <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)' }}>
                  {citireTotalMin} min azi ({citireNrSesiuni} {citireNrSesiuni===1?'sesiune':'sesiuni'})
                </span>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {citireActiva ? (
                  <>
                    <span style={{ fontSize:12, fontWeight:700, color:'#FB923C', fontFamily:'monospace' }}>⏱ {fmtElapsed(citireElapsed)}</span>
                    <button onClick={stopCitire} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid rgba(248,113,113,0.35)',
                      background:'rgba(248,113,113,0.12)', color:'#F87171', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                      ⏹ Stop citit
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={startCitire} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid rgba(74,222,128,0.35)',
                      background:'rgba(74,222,128,0.12)', color:'#4ADE80', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                      ▶️ Început citit
                    </button>
                    <button onClick={sesiunePresetata} title={`Loghează instant o sesiune de ${citireDurataPresetata} min, fără cronometru`}
                      style={{ padding:'5px 10px', borderRadius:7, border:'1px solid rgba(77,163,255,0.3)',
                        background:'rgba(77,163,255,0.1)', color:'#7BC8FF', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                      🎯 {citireDurataPresetata} min
                    </button>
                  </>
                )}
                <button onClick={() => { setCitireStatsOpen(o => !o); if (!citireStatsOpen) loadCitireIstoric() }}
                  style={{ padding:'5px 10px', borderRadius:7, border:'1px solid rgba(159,215,255,0.15)',
                    background:'transparent', color:'rgba(159,215,255,0.5)', fontSize:11, cursor:'pointer' }}>
                  📊 Statistici
                </button>
              </div>
            </div>

            {/* Carte curenta - navigator pe o linie */}
            <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(159,215,255,0.1)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:10, color:'rgba(159,215,255,0.4)', textTransform:'uppercase' as const, letterSpacing:'.05em' }}>
                  Carte curentă {cartiActive.length > 1 ? `(${carteIndex+1}/${cartiActive.length})` : ''}
                </span>
                <button onClick={() => setAddCarteOpen(true)} style={{ padding:'3px 9px', borderRadius:6, border:'1px solid rgba(74,222,128,0.3)',
                  background:'rgba(74,222,128,0.1)', color:'#4ADE80', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' as const }}>
                  ＋ Carte
                </button>
              </div>
              {carti.length === 0 ? (
                <div style={{ fontSize:12, color:'rgba(159,215,255,0.3)' }}>Nicio carte adăugată încă.</div>
              ) : carteActiva && (() => {
                const progres = carteActiva.pagini_total ? Math.min(100, Math.round((carteActiva.pagini_citite / carteActiva.pagini_total) * 100)) : null
                const totalMinIstoric = citireIstoric.reduce((s, z) => s + z.total_min, 0)
                const paginiPeZi = totalMinIstoric > 0 ? (totalMinIstoric / 7) / carteMinPerPagina : 0
                const paginiRamase = carteActiva.pagini_total ? Math.max(0, carteActiva.pagini_total - carteActiva.pagini_citite) : 0
                const zilePanaTermin = carteActiva.status !== 'terminata' && paginiPeZi > 0 && paginiRamase > 0 ? Math.ceil(paginiRamase / paginiPeZi) : null
                const dataEstimata = zilePanaTermin !== null ? new Date(Date.now() + zilePanaTermin * 86400000) : null
                const arrowStyle = {
                  width:26, height:26, flexShrink:0, borderRadius:7, border:'1px solid rgba(159,215,255,0.2)',
                  background:'rgba(255,255,255,0.03)', color: cartiActive.length<2 ? 'rgba(159,215,255,0.2)' : '#7BC8FF',
                  fontSize:15, cursor: cartiActive.length<2 ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                } as const
                return (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <button onClick={goPrevCarte} disabled={cartiActive.length<2} style={arrowStyle} title="Cartea anterioară">‹</button>
                    <div style={{ flex:1, minWidth:0, padding:'7px 10px', borderRadius:8,
                      background:'rgba(77,163,255,0.08)', border:'1px solid rgba(77,163,255,0.25)', opacity: carteActiva.status==='terminata' ? 0.6 : 1 }}>
                      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:6, flexWrap:'wrap' as const }}>
                        <span style={{ display:'flex', alignItems:'baseline', gap:6, flexWrap:'wrap' as const }}>
                          <span style={{ fontSize:12, fontWeight:700, color:'#E8F4FF' }}>
                            {carteActiva.status==='terminata' ? '✅' : (carteActiva.tip==='digital' ? '📱' : '📕')} {carteActiva.titlu}
                          </span>
                          {carteActiva.autor && <span style={{ fontSize:11, color:'rgba(159,215,255,0.5)' }}>— {carteActiva.autor}</span>}
                        </span>
                        <span style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                          {carteActiva.status !== 'terminata' && (
                            <span onClick={terminaCarte} title="Marchează cartea ca terminată"
                              style={{ fontSize:10, color:'#4ADE80', cursor:'pointer', fontWeight:600 }}>✅ Am terminat</span>
                          )}
                          <span onClick={() => setDeleteCarteId(carteActiva.id)} title="Șterge cartea"
                            style={{ fontSize:12, color:'rgba(248,113,113,0.6)', cursor:'pointer' }}>🗑</span>
                        </span>
                      </div>
                      {editPaginiOpen ? (
                        <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:4 }}>
                          <input autoFocus type="text" inputMode="numeric" value={editPaginiDraft}
                            onChange={e=>setEditPaginiDraft(e.target.value.replace(/\D/g,''))}
                            onKeyDown={e=>{ if(e.key==='Enter') saveEditPagini(); if(e.key==='Escape') setEditPaginiOpen(false) }}
                            onBlur={saveEditPagini}
                            style={{ width:48, fontSize:11, padding:'2px 4px', borderRadius:4, border:'1px solid rgba(159,215,255,0.3)', background:'#0B1220', color:'#E8F4FF' }} />
                          <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)' }}>/ {carteActiva.pagini_total ?? '—'} pag.</span>
                        </div>
                      ) : (
                        <div onClick={() => { setEditPaginiDraft(String(carteActiva.pagini_citite)); setEditPaginiOpen(true) }}
                          style={{ fontSize:11, color:'rgba(159,215,255,0.45)', marginTop:4, cursor:'pointer' }}>
                          {carteActiva.pagini_total ? `${carteActiva.pagini_citite}/${carteActiva.pagini_total} pag. (${progres}%)` : `${carteActiva.pagini_citite} pag. citite`} ✏️
                        </div>
                      )}
                      {progres !== null && (
                        <div style={{ marginTop:4, height:4, borderRadius:2, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                          <div style={{ width:`${progres}%`, height:'100%', background: carteActiva.status==='terminata' ? '#4ADE80' : '#4DA3FF' }} />
                        </div>
                      )}
                      {dataEstimata && (
                        <div style={{ fontSize:10, color:'rgba(159,215,255,0.4)', marginTop:4 }}>
                          📅 La ritmul tău din ultimele 7 zile, termini pe ~{fmtDataScurta(dataEstimata)}
                        </div>
                      )}
                    </div>
                    <button onClick={goNextCarte} disabled={cartiActive.length<2} style={arrowStyle} title="Cartea următoare">›</button>
                  </div>
                )
              })()}
              {cartiDeCitit.length > 0 && (
                <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:4 }}>
                  <span style={{ fontSize:10, color:'rgba(159,215,255,0.4)', textTransform:'uppercase' as const, letterSpacing:'.05em' }}>
                    📥 De citit ({cartiDeCitit.length})
                  </span>
                  {cartiDeCitit.map(c => (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
                      padding:'5px 8px', borderRadius:6, background:'rgba(255,255,255,0.03)' }}>
                      <span style={{ fontSize:11, color:'rgba(214,228,244,0.8)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                        {c.tip==='digital'?'📱':'📕'} {c.titlu}{c.autor ? ` — ${c.autor}` : ''}
                      </span>
                      <span style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                        <button onClick={() => incepeCarteDeCitit(c.id)} style={{ padding:'2px 8px', borderRadius:5, border:'1px solid rgba(74,222,128,0.3)',
                          background:'rgba(74,222,128,0.1)', color:'#4ADE80', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                          ▶ Începe
                        </button>
                        <span onClick={() => setDeleteCarteId(c.id)} title="Șterge" style={{ fontSize:11, color:'rgba(248,113,113,0.6)', cursor:'pointer' }}>🗑</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:8, fontSize:10, color:'rgba(159,215,255,0.4)' }}>
                {editRitmOpen ? (
                  <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                    Ritm:
                    <input autoFocus value={editRitmDraft} onChange={e=>setEditRitmDraft(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Enter') saveMinPerPagina(); if(e.key==='Escape') setEditRitmOpen(false) }}
                      onBlur={saveMinPerPagina}
                      style={{ width:40, fontSize:11, padding:'2px 4px', borderRadius:4, border:'1px solid rgba(159,215,255,0.3)', background:'#0B1220', color:'#E8F4FF' }} />
                    min/pag
                  </span>
                ) : (
                  <span onClick={() => { setEditRitmDraft(String(carteMinPerPagina)); setEditRitmOpen(true) }} style={{ cursor:'pointer' }}>
                    Ritm: ~{carteMinPerPagina} min/pagină ✏️
                  </span>
                )}
                {editDurataOpen ? (
                  <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                    Sesiune presetată:
                    <input autoFocus value={editDurataDraft} onChange={e=>setEditDurataDraft(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Enter') saveDurataPresetata(); if(e.key==='Escape') setEditDurataOpen(false) }}
                      onBlur={saveDurataPresetata}
                      style={{ width:36, fontSize:11, padding:'2px 4px', borderRadius:4, border:'1px solid rgba(159,215,255,0.3)', background:'#0B1220', color:'#E8F4FF' }} />
                    min
                  </span>
                ) : (
                  <span onClick={() => { setEditDurataDraft(String(citireDurataPresetata)); setEditDurataOpen(true) }} style={{ cursor:'pointer' }}>
                    Sesiune presetată: {citireDurataPresetata} min ✏️
                  </span>
                )}
              </div>
            </div>

            {/* Confirmare pagini citite dupa sesiune */}
            {confirmPagini && (
              <div style={{ marginTop:10, padding:'8px 10px', borderRadius:7, background:'rgba(251,146,60,0.1)', border:'1px solid rgba(251,146,60,0.3)',
                display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' as const }}>
                <span style={{ fontSize:12, color:'#FDBA74' }}>📄 Câte pagini ai citit în {confirmPagini.durataMin} min?</span>
                <input autoFocus value={confirmPagini.pagini} onChange={e => setConfirmPagini(p => p && ({ ...p, pagini: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') confirmaPaginiCitite() }}
                  style={{ width:50, fontSize:12, padding:'3px 6px', borderRadius:5, border:'1px solid rgba(251,146,60,0.4)', background:'#0B1220', color:'#E8F4FF' }} />
                <button onClick={confirmaPaginiCitite} style={{ padding:'4px 10px', borderRadius:6, border:'1px solid rgba(74,222,128,0.4)',
                  background:'rgba(74,222,128,0.15)', color:'#4ADE80', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                  ✓ Salvează
                </button>
                <button onClick={() => setConfirmPagini(null)} style={{ padding:'4px 8px', borderRadius:6, border:'none',
                  background:'transparent', color:'rgba(159,215,255,0.4)', fontSize:11, cursor:'pointer' }}>
                  Anulează
                </button>
              </div>
            )}

            {citireStatsOpen && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(159,215,255,0.1)' }}>
                <div style={{ fontSize:10, color:'rgba(159,215,255,0.4)', marginBottom:6, textTransform:'uppercase' as const, letterSpacing:'.05em' }}>Ultimele 7 zile</div>
                {citireIstoric.length===0 ? (
                  <div style={{ fontSize:12, color:'rgba(159,215,255,0.3)' }}>Niciun minut citit înregistrat.</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {citireIstoric.map(z => (
                      <div key={z.data} style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                        <span style={{ color:'rgba(159,215,255,0.55)' }}>{fmtZiScurt(z.data)}{z.data===todayRutina?' (azi)':''}</span>
                        <span style={{ color:'#7BC8FF', fontWeight:600 }}>{z.total_min} min</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:10, color:'rgba(159,215,255,0.4)', margin:'12px 0 6px', textTransform:'uppercase' as const, letterSpacing:'.05em' }}>
                  Cărți ({carti.filter(c=>c.status==='terminata').length} terminate din {carti.length})
                </div>
                {carti.length === 0 ? (
                  <div style={{ fontSize:12, color:'rgba(159,215,255,0.3)' }}>Nicio carte.</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {carti.map(c => (
                      <div key={c.id} style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                        <span style={{ color:'rgba(159,215,255,0.55)' }}>{c.status==='terminata'?'✅':c.status==='de_citit'?'📥':'📖'} {c.titlu}</span>
                        <span style={{ color:'#7BC8FF', fontWeight:600 }}>{c.status==='de_citit' ? 'de citit' : (c.pagini_total ? `${c.pagini_citite}/${c.pagini_total}` : `${c.pagini_citite} pag.`)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ADAUGA CARTE */}
      <Modal open={addCarteOpen} onClose={() => setAddCarteOpen(false)} title="Adaugă carte" width="420px">
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <input ref={carteScanInputRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) scanCarteFoto(f); e.target.value = '' }} />
          <Button variant="secondary" onClick={() => carteScanInputRef.current?.click()} loading={scanCarteLoading} style={{ width:'100%' }}>
            📷 Scanează coperta (AI)
          </Button>
          <FormGroup>
            <label>Titlu</label>
            <input value={addCarteForm.titlu} onChange={e => setAddCarteForm(f => ({ ...f, titlu: e.target.value }))}
              style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid rgba(159,215,255,0.2)', background:'#0B1220', color:'#E8F4FF' }} />
          </FormGroup>
          <FormGroup>
            <label>Autor</label>
            <input value={addCarteForm.autor} onChange={e => setAddCarteForm(f => ({ ...f, autor: e.target.value }))}
              style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid rgba(159,215,255,0.2)', background:'#0B1220', color:'#E8F4FF' }} />
          </FormGroup>
          <FormRow>
            <FormGroup>
              <label>Tip</label>
              <select value={addCarteForm.tip} onChange={e => setAddCarteForm(f => ({ ...f, tip: e.target.value as 'fizic' | 'digital' }))}
                style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid rgba(159,215,255,0.2)', background:'#0B1220', color:'#E8F4FF' }}>
                <option value="fizic">📕 Fizic</option>
                <option value="digital">📱 Digital</option>
              </select>
            </FormGroup>
            <FormGroup>
              <label>Nr. pagini (opțional)</label>
              <input value={addCarteForm.pagini_total} onChange={e => setAddCarteForm(f => ({ ...f, pagini_total: e.target.value.replace(/\D/g,'') }))}
                style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid rgba(159,215,255,0.2)', background:'#0B1220', color:'#E8F4FF' }} />
            </FormGroup>
          </FormRow>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'rgba(159,215,255,0.6)', cursor:'pointer' }}>
            <input type="checkbox" checked={addCarteForm.deCitit} onChange={e => setAddCarteForm(f => ({ ...f, deCitit: e.target.checked }))}
              style={{ width:15, height:15, accentColor:'#4DA3FF', cursor:'pointer' }} />
            📥 Adaugă în coada „De citit" (nu o încep acum)
          </label>
          <Button variant="primary" onClick={addCarte} style={{ width:'100%' }}>Salvează</Button>
        </div>
      </Modal>

      {/* EDITARE RUTINA ZILEI */}
      <Modal open={rutinaEditOpen} onClose={() => setRutinaEditOpen(false)} title="Editează rutina zilei" width="480px">
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
          {rutinaDraft.map(([emoji, titlu], idx) => (
            <div key={idx} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:8, background:'rgba(20,38,65,0.6)' }}>
              <span style={{ fontSize:16 }}>{emoji}</span>
              <span style={{ flex:1, fontSize:13, color:'#E8F4FF' }}>{titlu}</span>
              <button onClick={() => setRutinaDraft(d => d.filter((_,i) => i!==idx))}
                style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(248,113,113,0.7)', fontSize:16, lineHeight:1 }}>×</button>
            </div>
          ))}
          {rutinaDraft.length===0 && <div style={{ fontSize:12, color:'rgba(159,215,255,0.3)', textAlign:'center', padding:'10px 0' }}>Nicio activitate</div>}
        </div>
        <div style={{ fontSize:11, color:'rgba(159,215,255,0.4)', marginBottom:8 }}>Adaugă activitate nouă:</div>
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <input value={rutinaNewEmoji} onChange={e => setRutinaNewEmoji(e.target.value)} placeholder="🔹" style={{ width:50, textAlign:'center' as const }}/>
          <input value={rutinaNewTitlu} onChange={e => setRutinaNewTitlu(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter' && rutinaNewTitlu.trim()){ setRutinaDraft(d => [...d,[rutinaNewEmoji.trim()||'☑️', rutinaNewTitlu.trim()]]); setRutinaNewEmoji(''); setRutinaNewTitlu('') } }}
            placeholder="ex: Verificat stoc consumabile" style={{ flex:1 }}/>
          <Button variant="secondary" onClick={() => {
            if(!rutinaNewTitlu.trim()) return
            setRutinaDraft(d => [...d, [rutinaNewEmoji.trim()||'☑️', rutinaNewTitlu.trim()]])
            setRutinaNewEmoji(''); setRutinaNewTitlu('')
          }}>+ Adaugă</Button>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <Button variant="primary" onClick={() => saveRutinaItems([...rutinaDraft, ['📖','Citit']])} loading={savingRutina} style={{ flex:1 }}>Salvează</Button>
          <Button variant="secondary" onClick={() => setRutinaEditOpen(false)} style={{ flex:1 }}>Anulează</Button>
        </div>
      </Modal>

      {/* PROGRESS BAR SECTION */}
      <TaskProgress tasks={tasks}/>

      {/* KANBAN */}
      {loadError ? (
        <ConnectionError onRetry={()=>load()}/>
      ) : loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#4DA3FF' }}/>
        </div>
      ) : (
        viewMode === 'publi24' ? (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>
          {/* INFO */}
          <div style={{ background: 'rgba(77,163,255,0.06)', border: '1px solid rgba(77,163,255,0.2)', borderRadius: 12, padding: 16, maxWidth: 700 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7BC8FF', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>ℹ️ Info — cum adaugi un anunț</div>
              {!editingPubli24Info && (
                <button onClick={() => { setPubli24InfoDraft(publi24Info); setEditingPubli24Info(true) }}
                  style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(159,215,255,0.15)', background: 'rgba(159,215,255,0.06)', color: 'rgba(159,215,255,0.5)', cursor: 'pointer', fontSize: 12 }}>✎</button>
              )}
            </div>
            {editingPubli24Info ? (
              <>
                <textarea value={publi24InfoDraft} onChange={e => setPubli24InfoDraft(e.target.value)} rows={5}
                  placeholder="ex: 1. Intră pe publi24.ro cu contul... 2. Categorie Imobiliare > Închirieri... 3. Adaugă poze din Drive..."
                  style={{ width: '100%', boxSizing: 'border-box' as const, marginBottom: 10, fontFamily: 'inherit' }}/>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" onClick={savePubli24Info} style={{ flex: 1 }}>Salvează</Button>
                  <Button variant="secondary" onClick={() => setEditingPubli24Info(false)} style={{ flex: 1 }}>Anulează</Button>
                </div>
              </>
            ) : (
              publi24Info
                ? <div style={{ fontSize: 13, color: 'rgba(214,228,244,0.75)', whiteSpace: 'pre-wrap' as const }}>{publi24Info}</div>
                : <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.3)', fontStyle: 'italic' }}>Niciun info salvat încă — apasă ✎ ca să adaugi pașii de urmat.</div>
            )}
          </div>

          {/* CONTURI */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(159,215,255,0.6)', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>Conturi Publi24</div>
              <Button variant="secondary" onClick={() => setPubli24FormOpen(o => !o)}>{publi24FormOpen ? 'Anulează' : '+ Adaugă cont'}</Button>
            </div>

            {publi24FormOpen && (
              <div style={{ background: 'rgba(20,38,65,0.6)', border: '1px solid rgba(159,215,255,0.12)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <FormRow cols={2}>
                  <FormGroup><label>Cont (email/user)</label><input value={publi24Form.cont} onChange={e => setPubli24Form(f => ({ ...f, cont: e.target.value }))} placeholder="ex: office@abhomes.ro"/></FormGroup>
                  <FormGroup><label>Parolă</label><input value={publi24Form.parola} onChange={e => setPubli24Form(f => ({ ...f, parola: e.target.value }))} placeholder="parolă"/></FormGroup>
                </FormRow>
                <FormGroup><label>Notă (opțional)</label><input value={publi24Form.nota} onChange={e => setPubli24Form(f => ({ ...f, nota: e.target.value }))} placeholder="ex: cont pentru Green Station"/></FormGroup>
                <Button variant="primary" onClick={addPubli24Cont} style={{ width: '100%' }}>Salvează contul</Button>
              </div>
            )}

            {publi24Conturi.length === 0 ? (
              <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12, color: 'rgba(159,215,255,0.25)', border: '1px dashed rgba(159,215,255,0.08)', borderRadius: 8 }}>Niciun cont adăugat</div>
            ) : (
              <div className="publi24-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {publi24Conturi.map((c: any, idx: number) => (
                  <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(77,163,255,0.05)', border: '1px solid rgba(77,163,255,0.18)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#4DA3FF', background: 'rgba(77,163,255,0.15)', padding: '2px 9px', borderRadius: 20, flexShrink: 0 }}>{idx + 1}</span>
                      {editingPubli24Nota !== c.id && (
                        <span onClick={() => { setPubli24NotaDraft(c.nota || ''); setEditingPubli24Nota(c.id) }}
                          style={{ fontSize: 11, color: c.nota ? 'rgba(159,215,255,0.45)' : 'rgba(159,215,255,0.25)', fontStyle: c.nota ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, cursor: 'pointer' }}>
                          {c.nota || 'adaugă mesaj...'}
                        </span>
                      )}
                      <button onClick={() => deletePubli24Cont(c.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,0.5)', fontSize: 17, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
                    </div>
                    {editingPubli24Nota === c.id && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <textarea autoFocus value={publi24NotaDraft} onChange={e => setPubli24NotaDraft(e.target.value)} rows={2}
                          placeholder="ex: De cumpărat credite și adăugat anunțuri"
                          style={{ width: '100%', boxSizing: 'border-box' as const, fontSize: 12, fontFamily: 'inherit', resize: 'vertical' as const }}/>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => savePubli24Nota(c.id)}
                            style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', background: '#4DA3FF', color: '#0E1B2B', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Salvează</button>
                          <button onClick={() => setEditingPubli24Nota(null)}
                            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(159,215,255,0.15)', background: 'transparent', color: 'rgba(159,215,255,0.4)', fontSize: 11, cursor: 'pointer' }}>Anulează</button>
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(14,27,43,0.55)', borderRadius: 9 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: 'rgba(77,163,255,0.65)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>Email</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.cont}</div>
                      </div>
                      <button onClick={() => copyPubli24(c.cont, 'Email')}
                        style={{ flexShrink: 0, padding: '6px 11px', borderRadius: 20, border: 'none', background: 'rgba(77,163,255,0.15)', color: '#7BC8FF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📋 Copiază</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(14,27,43,0.55)', borderRadius: 9 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: 'rgba(252,211,77,0.7)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>Parolă</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#FCD34D', fontFamily: 'monospace' }}>{c.parola}</div>
                      </div>
                      <button onClick={() => copyPubli24(c.parola, 'Parola')}
                        style={{ flexShrink: 0, padding: '6px 11px', borderRadius: 20, border: 'none', background: 'rgba(252,211,77,0.15)', color: '#FCD34D', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📋 Copiază</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        ) : viewMode === 'coloane' ? (
        <div className="kanban-grid" style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, overflowY: 'auto', flex: 1, alignContent: 'start' }}>
          {COLS.map(col => {
            const totalCount = byStatus(col.key).length
            const colTasks = col.key === 'finalizat' ? finalizatShown : byStatus(col.key)
            return (
            <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14,
                background: `linear-gradient(135deg, ${col.color}20, ${col.color}06)`, border: `1px solid ${col.color}35`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: `${col.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                    {col.icon}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{col.label}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: col.color, background: `${col.color}1A`, borderRadius: 20, padding: '3px 11px', minWidth: 24, textAlign: 'center' as const }}>{totalCount}</span>
              </div>
              {colTasks.length === 0 ? (
                <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: 'rgba(159,215,255,0.2)', border: '1px dashed rgba(159,215,255,0.1)', borderRadius: 12 }}>Niciun task</div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDragEnd(col.key, e)}>
                  <SortableContext items={colTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {colTasks.map(t => (
                      <TaskCard key={t.id} task={t} onEdit={openEdit} onDelete={setDeleteId} onMove={moveTask}/>
                    ))}
                  </SortableContext>
                </DndContext>
              )}
              {col.key === 'finalizat' && finalizatHidden > 0 && (
                <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(159,215,255,0.3)', padding: '4px 0' }}>+{finalizatHidden} mai vechi</div>
              )}
              {quickAddCol === col.key ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input autoFocus value={quickAddText} onChange={e => setQuickAddText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') quickAddTask(col.key)
                      if (e.key === 'Escape') { setQuickAddCol(null); setQuickAddText('') }
                    }}
                    onBlur={() => { if (!quickAddText.trim()) setQuickAddCol(null) }}
                    placeholder="Titlu task... (Enter)" style={{ flex: 1, fontSize: 12, padding: '7px 9px' }}/>
                  <button onClick={() => quickAddTask(col.key)} title="Adaugă"
                    style={{ width: 30, borderRadius: 8, border: 'none', background: '#4DA3FF', color: '#0E1B2B', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>✓</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setQuickAddCol(col.key); setQuickAddText('') }} style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'transparent', border: '1px dashed rgba(159,215,255,0.15)', color: 'rgba(159,215,255,0.4)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <Plus size={11}/> Adaugă task
                  </button>
                  <button onClick={() => { setEditing({ ...empty, status: col.key }); setShowAdvanced(false); setEditOpen(true) }} title="Task detaliat"
                    style={{ width: 30, borderRadius: 8, background: 'transparent', border: '1px dashed rgba(159,215,255,0.08)', color: 'rgba(159,215,255,0.25)', fontSize: 12, cursor: 'pointer' }}>
                    ⋯
                  </button>
                </div>
              )}
            </div>
            )
          })}
        </div>
        ) : (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', flex: 1 }}>
          {dateGroups.length === 0 ? (
            <div style={{ padding: '40px 14px', textAlign: 'center', fontSize: 13, color: 'rgba(159,215,255,0.25)' }}>Niciun task activ — toate sunt finalizate 🎉</div>
          ) : dateGroups.map(g => (
            <div key={g.key}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: `${g.color}0F`, border: `1px solid ${g.color}25`, borderRadius: 10, borderTop: `2px solid ${g.color}`, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>{g.label}</span>
                <span style={{ fontSize: 11, color: g.color, fontFamily: 'monospace', fontWeight: 600 }}>{g.items.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {g.items.map(t => (
                  <TaskCard key={t.id} task={t} onEdit={openEdit} onDelete={setDeleteId} onMove={moveTask}/>
                ))}
              </div>
            </div>
          ))}
        </div>
        )
      )}

      {/* BRAIN DUMP MODAL — portal-style, outside kanban */}
      {brainOpen && <BrainDumpModal onClose={() => setBrainOpen(false)} onSaved={load}/>}

      {/* EDIT MODAL */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing.id ? 'Editează task' : 'Task nou'} width="560px">
        <FormGroup><label>Titlu *</label><input autoFocus value={editing.titlu || ''} onChange={e => setEditing({ ...editing, titlu: e.target.value })} placeholder="Ce trebuie făcut?"/></FormGroup>

        <div style={{ marginBottom: 14 }}>
          <label>Status</label>
          <Pills value={editing.status || 'de_facut'} onChange={v => setEditing({ ...editing, status: v })}
            options={COLS.map(c => ({ value: c.key, label: c.label, color: c.color }))}/>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label>Prioritate</label>
          <Pills value={editing.prioritate || 'normala'} onChange={v => setEditing({ ...editing, prioritate: v })}
            options={[
              { value: 'urgenta', label: PRIO_LABEL.urgenta, color: PRIO_COLOR.urgenta },
              { value: 'normala', label: PRIO_LABEL.normala, color: PRIO_COLOR.normala },
              { value: 'scazuta', label: PRIO_LABEL.scazuta, color: PRIO_COLOR.scazuta },
            ]}/>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Business</label>
          <Pills value={editing.business || ''} onChange={v => setEditing({ ...editing, business: v })}
            options={[{ value: '', label: '— Niciunul —', color: '#64748B' }, ...BIZ.map(b => ({ value: b, label: b, color: BIZ_COLOR[b] || '#94A3B8' }))]}/>
        </div>
        <FormRow cols={2}>
          <FormGroup><label>Dată limită</label><input type="date" value={editing.data_limita || ''} onChange={e => setEditing({ ...editing, data_limita: e.target.value })}/></FormGroup>
          <FormGroup><label>⏰ Oră (opțional)</label><input type="time" value={editing.ora_limita || ''} onChange={e=>setEditing({...editing,ora_limita:e.target.value})} style={{width:'100%'}}/></FormGroup>
        </FormRow>

        <button type="button" onClick={() => setShowAdvanced(v => !v)}
          style={{ width: '100%', padding: '8px', marginBottom: showAdvanced ? 14 : 4, borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(159,215,255,0.5)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {showAdvanced ? '▲ Ascunde detalii avansate' : '▼ Detalii avansate (descriere, persoană, impact/efort...)'}
        </button>

        {showAdvanced && (
          <>
            <FormGroup><label>Descriere</label><textarea value={editing.descriere || ''} onChange={e => setEditing({ ...editing, descriere: e.target.value })} rows={2}/></FormGroup>

            {!editing.id ? (
              <div style={{ marginBottom: 16 }}>
                <label>Recurență</label>
                <Pills value={editing.recurent ? 'da' : 'nu'} onChange={v => setEditing({ ...editing, recurent: v === 'da' })}
                  options={[
                    { value: 'nu', label: 'Task unic', color: '#94A3B8' },
                    { value: 'da', label: '🔁 Task recurent', color: '#4DA3FF' },
                  ]}/>
                {editing.recurent && (
                  <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(77,163,255,0.06)', border: '1px solid rgba(77,163,255,0.15)' }}>
                    <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', marginBottom: 8 }}>Se repetă:</div>
                    <Pills value={[1,7,30].includes(Number(editing.interval_zile)) ? String(editing.interval_zile) : 'custom'}
                      onChange={v => setEditing({ ...editing, interval_zile: v === 'custom' ? 14 : parseInt(v) })}
                      options={[
                        { value: '1', label: 'Zilnic', color: '#4ADE80' },
                        { value: '7', label: 'Săptămânal', color: '#4DA3FF' },
                        { value: '30', label: 'Lunar', color: '#C4B5FD' },
                        { value: 'custom', label: 'Personalizat', color: '#FCD34D' },
                      ]}/>
                    {![1,7,30].includes(Number(editing.interval_zile)) && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>La fiecare</span>
                        <input type="number" min={1} value={editing.interval_zile ?? 14} onChange={e => setEditing({ ...editing, interval_zile: parseInt(e.target.value) || 1 })} style={{ width: 60 }}/>
                        <span style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>zile</span>
                      </div>
                    )}
                    <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(159,215,255,0.4)' }}>
                      Începând cu data limită de mai jos (sau azi, dacă nu o setezi). Task-ul se salvează ca șablon ascuns — la fiecare interval se generează automat o copie activă.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: 16, fontSize: 11, color: 'rgba(159,215,255,0.35)', fontStyle: 'italic' }}>
                Recurența se poate seta doar la crearea unui task nou.
              </div>
            )}

            <FormRow cols={2}>
              <FormGroup><label>Persoană</label><input value={editing.persoana || ''} onChange={e => setEditing({ ...editing, persoana: e.target.value })} placeholder="Nume..."/></FormGroup>
              <FormGroup><label>Telefon/WA persoană</label><input value={(editing as any).telefon_persoana || ''} onChange={e=>setEditing({...editing,telefon_persoana:e.target.value} as any)} placeholder="+40 7xx xxx xxx"/></FormGroup>
            </FormRow>

            <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: 'rgba(214,228,244,0.04)', border: '1px solid rgba(159,215,255,0.1)' }}>
              <FormRow cols={2}>
                <FormGroup><label>Impact (1-10): <span style={{ color: '#4ADE80' }}>{editing.impact_score || 5}</span></label><input type="range" min={1} max={10} value={editing.impact_score || 5} onChange={e => setEditing({ ...editing, impact_score: parseInt(e.target.value) })}/></FormGroup>
                <FormGroup><label>Efort (1-10): <span style={{ color: '#FCD34D' }}>{editing.effort_score || 5}</span></label><input type="range" min={1} max={10} value={editing.effort_score || 5} onChange={e => setEditing({ ...editing, effort_score: parseInt(e.target.value) })}/></FormGroup>
              </FormRow>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>
                Priority Score:
                <span style={{ background: 'rgba(77,163,255,0.15)', color: '#4DA3FF', border: '1px solid rgba(77,163,255,0.3)', borderRadius: 20, padding: '2px 10px', fontWeight: 700, fontSize: 12 }}>
                  {Math.round(((editing.impact_score || 5) * 2 + (11 - (editing.effort_score || 5))) / 3)}/10
                </span>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="primary" onClick={save} loading={saving} style={{ flex: 1 }}>Salvează</Button>
          <Button variant="secondary" onClick={() => setEditOpen(false)} style={{ flex: 1 }}>Anulează</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={delTask} loading={deleting} title="Șterge task" message="Sigur vrei să ștergi acest task?"/>
      <ConfirmDialog open={!!deleteCarteId} onClose={() => setDeleteCarteId(null)} onConfirm={stergeCarte} title="Șterge carte" message="Sigur vrei să ștergi această carte? Progresul ei se pierde."/>
      <Toast toast={toast}/>

      <style>{`
        .task-card:hover { border-color: rgba(159,215,255,0.28) !important; transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.3); }
        @media (max-width: 1000px) {
          .publi24-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 720px) {
          .kanban-grid { grid-template-columns: 1fr !important; padding: 12px 14px !important; }
          .publi24-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  )
}
