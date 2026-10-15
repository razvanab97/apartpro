'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { supabase, type Apartament } from '@/lib/supabase'
import { SELECT_REZERVARE, cuApartament, payloadRezervare, salveazaRezervare } from '@/lib/rezervareEdit'
import RezervareEditor from '@/components/RezervareEditor'
import ConfirmareClient from '@/components/ConfirmareClient'
import { Sparkles, X, Send, Loader2, Mic, Copy, Check, MessageCircle, RotateCcw, History, Trash2, Pin, AlertTriangle, CalendarPlus, Ban, MoveRight, Pencil, ListTodo } from 'lucide-react'

// Asistentul AB Homes (cerut direct: agent personal care vede tot ce se intampla in platforma si poate face /
// anula / muta rezervari si pregati mesaje). Serverul (/api/agent) citeste baza si PROPUNE actiuni; aici le
// afisam ca un card „Confirmă / Renunță” si le executam DOAR dupa click, cu aceleasi functii ca formularul de
// rezervare (decontul se recalculeaza identic). Fiecare actiune intra in jurnal (setari „agent_jurnal”) cu „Anulează acțiunea”.

type Card = Record<string, any> & { stare?: 'asteapta' | 'gata' | 'renuntat' | 'eroare' | 'anulat'; info?: string; jurnalId?: string }
type Msg = { role: 'user' | 'assistant'; content: string; cards?: Card[]; nota?: boolean; ts: number }
type Ctx = { rezervare_id: string; rezervare_nume?: string } | null
type Jurnal = { id: string; ts: number; actiune: string; titlu: string; descriere: string; undo: any; anulat?: boolean }

const CHEIE_CONV = 'agent_conv_v1', CHEIE_JURNAL = 'agent_jurnal'
const SUGESTII = ['Ce am de făcut azi?', 'Ce apartamente sunt libere weekendul ăsta?', 'Ce rezervări nu au telefon?', 'Ce aș putea îmbunătăți săptămâna asta?']

// ── jurnal (setari key/value, fara migrare) ──
async function citesteJurnal(): Promise<Jurnal[]> {
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_JURNAL).maybeSingle()
  try { return JSON.parse(data?.valoare || '[]') } catch { return [] }
}
async function scrieJurnal(j: Jurnal[]) {
  await supabase.from('setari').upsert({ cheie: CHEIE_JURNAL, valoare: JSON.stringify(j.slice(0, 150)) }, { onConflict: 'cheie' })
}

async function incarcaApts(): Promise<Apartament[]> {
  const { data } = await supabase.from('apartamente').select('*')
  return (data as Apartament[]) || []
}
async function ocupat(aptId: string, ci: string, co: string, exceptId?: string) {
  let q = supabase.from('rezervari').select('id,nume_client,data_checkin,data_checkout,camera_semnalata').eq('apartament_id', aptId).neq('status_rezervare', 'anulata').lt('data_checkin', co).gt('data_checkout', ci).limit(3)
  if (exceptId) q = q.neq('id', exceptId)
  const { data } = await q
  return (data || []).filter((r: any) => r.camera_semnalata !== 'NEALOCAT')
}

// Executa o propunere confirmata. Intoarce textul pentru conversatie + datele de anulare.
async function executaCard(c: Card, fortat: boolean): Promise<{ text: string; undo: any }> {
  const p = c.payload || {}
  if (c.actiune === 'creare') {
    if (!fortat) { const ov = await ocupat(p.apartament_id, p.data_checkin, p.data_checkout); if (ov.length) throw new Error('Apartamentul s-a ocupat între timp: ' + ov.map((o: any) => o.nume_client).join(', ')) }
    const apts = await incarcaApts()
    const editing = { ...p, moneda: 'RON', status_rezervare: 'confirmata', status_decont: 'nedecontat', status_facturare: 'nefacturat' }
    const { data, error } = await supabase.from('rezervari').insert(payloadRezervare(editing, apts)).select('id').single()
    if (error) throw new Error(error.message)
    return { text: `rezervare creată [[rez:${data.id}|${p.nume_client} · ${p.data_checkin} → ${p.data_checkout}]]`, undo: { tip: 'creare', id: data.id } }
  }
  if (c.actiune === 'task') {
    const { data, error } = await supabase.from('taskuri').insert({ ...p, status: 'de_facut', impact_score: 5, effort_score: 5, priority_score: 5 }).select('id').single()
    if (error) throw new Error(error.message)
    return { text: `task creat: „${p.titlu}”`, undo: { tip: 'task', id: data.id } }
  }
  // actiuni pe o rezervare existenta: incarcam randul complet + apartamentele si salvam ca formularul
  const [{ data: r, error: e1 }, apts] = await Promise.all([supabase.from('rezervari').select(SELECT_REZERVARE).eq('id', c.rezervare_id).single(), incarcaApts()])
  if (e1 || !r) throw new Error('Rezervarea nu mai există')
  if (c.actiune === 'anulare') {
    const prev = { status_rezervare: r.status_rezervare, observatii: r.observatii }
    const obs = [r.observatii, `Anulată de Asistent${p.motiv ? ': ' + p.motiv : ''} (${new Date().toLocaleDateString('ro-RO')})`].filter(Boolean).join('\n')
    const { error } = await supabase.from('rezervari').update({ status_rezervare: 'anulata', observatii: obs }).eq('id', r.id)
    if (error) throw new Error(error.message)
    return { text: `rezervare anulată [[rez:${r.id}|${r.nume_client}]]`, undo: { tip: 'camp', id: r.id, prev } }
  }
  if (c.actiune === 'mutare') {
    if (!fortat) { const ov = await ocupat(p.apartament_id, p.data_checkin, p.data_checkout, r.id); if (ov.length) throw new Error('Destinația s-a ocupat între timp: ' + ov.map((o: any) => o.nume_client).join(', ')) }
    const prev = { apartament_id: r.apartament_id, data_checkin: r.data_checkin, data_checkout: r.data_checkout }
    let ed: any = { ...r }
    if (p.apartament_id !== r.apartament_id) ed = cuApartament(ed, p.apartament_id, apts)
    ed.data_checkin = p.data_checkin; ed.data_checkout = p.data_checkout
    const err = await salveazaRezervare(ed, apts)
    if (err) throw new Error(err)
    return { text: `rezervare mutată [[rez:${r.id}|${r.nume_client} · ${p.data_checkin} → ${p.data_checkout}]]`, undo: { tip: 'mutare', id: r.id, prev } }
  }
  if (c.actiune === 'modificare') {
    const prev: any = {}
    for (const k of Object.keys(p)) prev[k] = r[k] ?? null
    const err = await salveazaRezervare({ ...r, ...p }, apts)
    if (err) throw new Error(err)
    return { text: `rezervare modificată [[rez:${r.id}|${r.nume_client}]]`, undo: { tip: 'camp_complet', id: r.id, prev } }
  }
  throw new Error('Acțiune necunoscută')
}

async function anuleazaActiune(u: any) {
  if (u.tip === 'creare') {
    const { error } = await supabase.from('rezervari').update({ status_rezervare: 'anulata', observatii: 'Creată din greșeală de Asistent — anulată' }).eq('id', u.id)
    if (error) throw new Error(error.message)
    return
  }
  if (u.tip === 'task') { const { error } = await supabase.from('taskuri').delete().eq('id', u.id); if (error) throw new Error(error.message); return }
  if (u.tip === 'camp') { const { error } = await supabase.from('rezervari').update(u.prev).eq('id', u.id); if (error) throw new Error(error.message); return }
  const [{ data: r }, apts] = await Promise.all([supabase.from('rezervari').select(SELECT_REZERVARE).eq('id', u.id).single(), incarcaApts()])
  if (!r) throw new Error('Rezervarea nu mai există')
  let ed: any = { ...r, ...u.prev }
  if (u.tip === 'mutare' && u.prev.apartament_id !== r.apartament_id) ed = { ...cuApartament(r, u.prev.apartament_id, apts), data_checkin: u.prev.data_checkin, data_checkout: u.prev.data_checkout }
  const err = await salveazaRezervare(ed, apts)
  if (err) throw new Error(err)
}

// ── text: **bold**, liste, [[rez:ID|eticheta]] -> buton care deschide rezervarea ──
function Text({ t, onRez }: { t: string; onRez: (id: string) => void }) {
  const linii = t.split('\n')
  const inline = (s: string, k: number): ReactNode[] => {
    const out: ReactNode[] = []
    const re = /\[\[rez:([0-9a-f-]{8,})\|([^\]]+)\]\]|\*\*([^*]+)\*\*/gi
    let last = 0, m: RegExpExecArray | null, i = 0
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index))
      if (m[1]) { const id = m[1]; out.push(<button key={`${k}-${i++}`} onClick={() => onRez(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '1px 2px', padding: '1px 8px', borderRadius: 7, border: '1px solid rgba(77,163,255,0.35)', background: 'rgba(77,163,255,0.12)', color: '#7BC8FF', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', verticalAlign: 'baseline' }}>↗ {m[2]}</button>) }
      else out.push(<b key={`${k}-${i++}`} style={{ color: '#FFFFFF' }}>{m[3]}</b>)
      last = re.lastIndex
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }
  return <>{linii.map((l, k) => {
    const li = /^\s*([-•*]|\d+\.)\s+/.exec(l)
    if (!l.trim()) return <div key={k} style={{ height: 6 }} />
    return li
      ? <div key={k} style={{ display: 'flex', gap: 7, paddingLeft: 2 }}><span style={{ color: '#7C9BFF', flexShrink: 0 }}>{/\d/.test(li[1]) ? li[1] : '•'}</span><span>{inline(l.slice(li[0].length), k)}</span></div>
      : <div key={k}>{inline(l.replace(/^#+\s*/, ''), k)}</div>
  })}</>
}

const ICON: Record<string, any> = { creare: CalendarPlus, anulare: Ban, mutare: MoveRight, modificare: Pencil, task: ListTodo }

export default function Agent() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [ctx, setCtx] = useState<Ctx>(null)
  const [rezDeschisa, setRezDeschisa] = useState<string | null>(null)
  const [confId, setConfId] = useState<string | null>(null)
  const [jurnal, setJurnal] = useState<Jurnal[] | null>(null)
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [copiatK, setCopiatK] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const recRef = useRef<any>(null)
  const inpRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(CHEIE_CONV) || '[]'); if (Array.isArray(v)) setMsgs(v) } catch {} }, [])
  useEffect(() => { try { localStorage.setItem(CHEIE_CONV, JSON.stringify(msgs.slice(-60))) } catch {} }, [msgs])
  useEffect(() => { if (open) setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60) }, [msgs, open, loading])
  // contextul: ultima rezervare deschisa pe ecran (formular / calendar) - trimis de RezervareModal si Calendar
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.rezervare_id) setCtx(d) }
    window.addEventListener('agent:context', h)
    const deschide = (e: Event) => { setOpen(true); const t = (e as CustomEvent).detail?.text; if (t) setTimeout(() => trimite(t), 50) }
    window.addEventListener('agent:deschide', deschide)
    return () => { window.removeEventListener('agent:context', h); window.removeEventListener('agent:deschide', deschide) }
  })

  async function trimite(text?: string) {
    const t = (text ?? input).trim()
    if (!t || loading) return
    setInput('')
    const nou: Msg[] = [...msgs, { role: 'user', content: t, ts: Date.now() }]
    setMsgs(nou); setLoading(true)
    try {
      // istoricul pentru AI: textul + starea cardurilor (ca sa stie ce s-a confirmat / renuntat)
      const mesaje = nou.map(m => ({ role: m.role, content: m.content + (m.cards?.length ? '\n' + m.cards.map(c => `[card ${c.tip}${c.actiune ? ' ' + c.actiune : ''}: ${c.titlu || ''} — ${c.stare || 'afișat'}${c.info ? ' · ' + c.info : ''}]`).join('\n') : '') }))
      const res = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesaje, context: { pagina: pathname, ...(ctx || {}) } }) })
      const j = await res.json()
      if (!j.ok) setMsgs(m => [...m, { role: 'assistant', content: '⚠ ' + (j.error || 'Eroare'), ts: Date.now(), nota: true }])
      else setMsgs(m => [...m, { role: 'assistant', content: j.reply || (j.cards?.length ? 'Ți-am pregătit mai jos:' : '…'), cards: (j.cards || []).map((c: Card) => c.tip === 'actiune' ? { ...c, stare: 'asteapta' } : c), ts: Date.now() }])
    } catch (e: any) {
      setMsgs(m => [...m, { role: 'assistant', content: '⚠ Nu am putut contacta asistentul: ' + e.message, ts: Date.now(), nota: true }])
    }
    setLoading(false)
  }

  const actualizeazaCard = (mi: number, ci: number, patch: Partial<Card>) => setMsgs(ms => ms.map((m, i) => i !== mi ? m : { ...m, cards: m.cards?.map((c, j) => j !== ci ? c : { ...c, ...patch }) }))

  async function confirma(mi: number, ci: number, fortat = false) {
    const c = msgs[mi].cards![ci]; const k = `${mi}-${ci}`
    setBusy(k)
    try {
      const { text, undo } = await executaCard(c, fortat)
      const jid = Math.random().toString(36).slice(2, 10)
      const j = await citesteJurnal()
      await scrieJurnal([{ id: jid, ts: Date.now(), actiune: c.actiune, titlu: c.titlu, descriere: (c.randuri || []).map((r: any[]) => `${r[0]}: ${r[1] ? r[1] + ' → ' : ''}${r[2]}`).join(' · '), undo }, ...j])
      actualizeazaCard(mi, ci, { stare: 'gata', info: text.replace(/\[\[rez:[^|]+\|([^\]]+)\]\]/g, '$1'), jurnalId: jid })
      setMsgs(ms => [...ms, { role: 'assistant', content: `✓ Gata: ${text}.`, ts: Date.now(), nota: true }])
      window.dispatchEvent(new CustomEvent('rezervari:modificate'))
    } catch (e: any) {
      actualizeazaCard(mi, ci, { stare: 'eroare', info: e.message })
    }
    setBusy(null)
  }

  async function anuleaza(jid: string, mi?: number, ci?: number) {
    setBusy('u-' + jid)
    try {
      const j = await citesteJurnal(); const it = j.find(x => x.id === jid)
      if (!it) throw new Error('Acțiunea nu mai e în jurnal')
      if (it.anulat) throw new Error('Acțiunea a fost deja anulată')
      await anuleazaActiune(it.undo)
      const j2 = j.map(x => x.id === jid ? { ...x, anulat: true } : x)
      await scrieJurnal(j2); if (jurnal) setJurnal(j2)
      if (mi != null && ci != null) actualizeazaCard(mi, ci, { stare: 'anulat' })
      setMsgs(ms => [...ms, { role: 'assistant', content: `↺ Am anulat acțiunea: ${it.titlu} (${it.descriere.slice(0, 120)}).`, ts: Date.now(), nota: true }])
      window.dispatchEvent(new CustomEvent('rezervari:modificate'))
    } catch (e: any) {
      setMsgs(ms => [...ms, { role: 'assistant', content: '⚠ Nu am putut anula: ' + e.message, ts: Date.now(), nota: true }])
    }
    setBusy(null)
  }

  function voce() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    if (listening) { recRef.current?.stop(); setListening(false); return }
    const r = new SR(); r.lang = 'ro-RO'; r.continuous = true; r.interimResults = true
    let fin = ''
    r.onresult = (e: any) => { let inter = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t + ' '; else inter = t } setInput(fin + inter) }
    r.onend = () => setListening(false)
    recRef.current = r; r.start(); setListening(true)
  }

  const btn = (bg: string, fg: string, br: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: `1px solid ${br}`, background: bg, color: fg, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' })

  function cardActiune(c: Card, mi: number, ci: number) {
    const Ic = ICON[c.actiune] || Sparkles
    const k = `${mi}-${ci}`
    const culoare = c.actiune === 'anulare' ? '#F87171' : c.actiune === 'creare' ? '#4ADE80' : '#7BC8FF'
    return (
      <div key={ci} style={{ marginTop: 8, borderRadius: 14, border: `1px solid ${c.stare === 'gata' ? 'rgba(74,222,128,0.4)' : 'rgba(159,215,255,0.18)'}`, background: 'rgba(14,27,48,0.85)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: '1px solid rgba(159,215,255,0.08)' }}>
          <Ic size={15} color={culoare} /><span style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', flex: 1 }}>{c.titlu}</span>
          {c.stare === 'gata' && <span style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80' }}>✓ executat</span>}
          {c.stare === 'renuntat' && <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>renunțat</span>}
          {c.stare === 'anulat' && <span style={{ fontSize: 11, fontWeight: 700, color: '#FCD34D' }}>↺ anulat</span>}
        </div>
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(c.randuri || []).map((r: any[], i: number) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '78px 1fr', gap: 8, fontSize: 12.5 }}>
              <span style={{ color: 'rgba(159,215,255,0.5)' }}>{r[0]}</span>
              <span style={{ color: '#E8F4FF', fontWeight: 600 }}>{r[1] != null && <><s style={{ color: 'rgba(248,113,113,0.8)', fontWeight: 400 }}>{String(r[1])}</s> → </>}{String(r[2])}</span>
            </div>
          ))}
          {(c.avertismente || []).map((a: string, i: number) => <div key={i} style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 12, color: '#FCD34D', lineHeight: 1.4 }}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{a}</div>)}
          {c.stare === 'eroare' && <div style={{ marginTop: 4, fontSize: 12, color: '#F87171' }}>⚠ {c.info}</div>}
        </div>
        {(c.stare === 'asteapta' || c.stare === 'eroare') && (
          <div style={{ display: 'flex', gap: 6, padding: '0 12px 11px' }}>
            {c.blocat
              ? <button disabled={busy === k} onClick={() => confirma(mi, ci, true)} style={{ ...btn('rgba(245,158,11,0.15)', '#FCD34D', 'rgba(245,158,11,0.45)'), flex: 1 }}>{busy === k ? <Loader2 size={13} className="ag-spin" /> : null} Confirmă oricum</button>
              : <button disabled={busy === k} onClick={() => confirma(mi, ci)} style={{ ...btn('linear-gradient(135deg,#22C55E,#16A34A)', '#FFFFFF', 'transparent'), flex: 1 }}>{busy === k ? <Loader2 size={13} className="ag-spin" /> : <Check size={14} />} Confirmă</button>}
            <button onClick={() => actualizeazaCard(mi, ci, { stare: 'renuntat' })} style={btn('transparent', 'rgba(214,228,244,0.7)', 'rgba(159,215,255,0.2)')}>Renunță</button>
          </div>
        )}
        {c.stare === 'gata' && c.jurnalId && (
          <div style={{ padding: '0 12px 11px' }}>
            <button disabled={busy === 'u-' + c.jurnalId} onClick={() => anuleaza(c.jurnalId!, mi, ci)} style={btn('transparent', '#FCD34D', 'rgba(245,158,11,0.35)')}><RotateCcw size={12} /> Anulează acțiunea</button>
          </div>
        )}
      </div>
    )
  }

  function cardMesaj(c: Card, mi: number, ci: number) {
    const k = `${mi}-${ci}`, copiat = copiatK === k
    const tel = String(c.telefon || '').replace(/[^0-9]/g, '')
    return (
      <div key={ci} style={{ marginTop: 8, borderRadius: 14, border: '1px solid rgba(37,211,102,0.3)', background: 'rgba(10,30,24,0.6)', padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#4ADE80', marginBottom: 6 }}>💬 {c.titlu}</div>
        <textarea value={c.text} onChange={e => actualizeazaCard(mi, ci, { text: e.target.value })} rows={Math.min(14, String(c.text).split('\n').length + 1)}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(159,215,255,0.12)', background: 'rgba(5,12,24,0.6)', color: '#E8F4FF', fontSize: 12.5, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none' }} />
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={() => navigator.clipboard.writeText(c.text).then(() => { setCopiatK(k); setTimeout(() => setCopiatK(x => x === k ? null : x), 1800) }).catch(() => {})} style={{ ...btn('rgba(77,163,255,0.1)', '#7BC8FF', 'rgba(77,163,255,0.3)'), flex: 1 }}>{copiat ? <Check size={13} /> : <Copy size={13} />} {copiat ? 'Copiat' : 'Copiază'}</button>
          {tel.length >= 9 && <a href={`https://wa.me/${tel}?text=${encodeURIComponent(c.text)}`} target="_blank" rel="noreferrer" style={{ ...btn('#25D366', '#03250F', 'transparent'), flex: 1.3 }}><MessageCircle size={13} /> Trimite pe WhatsApp</a>}
        </div>
      </div>
    )
  }

  async function deschideJurnal() { setJurnal(await citesteJurnal()) }

  return (
    <>
      <style>{`.ag-spin{animation:spin 1s linear infinite} @keyframes agPulse{0%,100%{box-shadow:0 0 0 0 rgba(124,155,255,.45)}50%{box-shadow:0 0 0 10px rgba(124,155,255,0)}}
        .ag-panel{position:fixed;bottom:90px;right:24px;width:440px;height:min(680px,calc(100vh - 120px));z-index:1001}
        @media (max-width:640px){.ag-panel{inset:0;width:auto;height:auto;bottom:0;right:0;border-radius:0!important}}`}</style>
      <button onClick={() => setOpen(o => !o)} title="Asistent AB Homes"
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, width: 54, height: 54, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#FFFFFF', boxShadow: '0 10px 30px rgba(37,99,235,0.45)', animation: open ? 'none' : 'agPulse 3s ease-in-out infinite' }}>
        {open ? <X size={22} /> : <Sparkles size={23} />}
      </button>

      {open && (
        <div className="ag-panel" style={{ display: 'flex', flexDirection: 'column', borderRadius: 20, overflow: 'hidden', background: '#0A1322', border: '1px solid rgba(124,155,255,0.3)', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
          {/* antet */}
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,rgba(37,99,235,0.2),rgba(124,58,237,0.2))', borderBottom: '1px solid rgba(124,155,255,0.2)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#38BDF8,#8B5CF6)' }}><Sparkles size={17} color="#fff" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF' }}>Asistent AB Homes</div>
              <div style={{ fontSize: 11, color: 'rgba(186,214,255,0.6)' }}>vede rezervările, disponibilitatea, mesajele · acțiunile cer confirmare</div>
            </div>
            <button onClick={deschideJurnal} title="Jurnal acțiuni" style={{ ...btn('transparent', 'rgba(214,228,244,0.75)', 'rgba(159,215,255,0.2)'), padding: 7 }}><History size={14} /></button>
            <button onClick={() => { if (msgs.length) setMsgs([]) }} title="Conversație nouă" style={{ ...btn('transparent', 'rgba(214,228,244,0.75)', 'rgba(159,215,255,0.2)'), padding: 7 }}><Trash2 size={14} /></button>
            <button onClick={() => setOpen(false)} title="Închide" style={{ ...btn('transparent', 'rgba(214,228,244,0.75)', 'rgba(159,215,255,0.2)'), padding: 7 }}><X size={14} /></button>
          </div>

          {ctx && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 11.5, color: '#C4B5FD', background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
              <Pin size={12} /> <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Rezervarea de pe ecran: <b>{ctx.rezervare_nume || ctx.rezervare_id.slice(0, 8)}</b></span>
              <button onClick={() => setCtx(null)} title="Nu mai folosi această rezervare" style={{ border: 'none', background: 'none', color: 'rgba(196,181,253,0.7)', cursor: 'pointer', padding: 0 }}><X size={12} /></button>
            </div>
          )}

          {/* conversatie / jurnal */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {jurnal ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(186,214,255,0.7)' }}>Jurnal acțiuni</span>
                  <button onClick={() => setJurnal(null)} style={btn('transparent', '#7BC8FF', 'rgba(77,163,255,0.3)')}>← Înapoi la chat</button>
                </div>
                {jurnal.length === 0 && <div style={{ fontSize: 12.5, color: 'rgba(159,215,255,0.5)' }}>Nicio acțiune încă.</div>}
                {jurnal.map(it => (
                  <div key={it.id} style={{ padding: '9px 11px', borderRadius: 11, border: '1px solid rgba(159,215,255,0.12)', background: 'rgba(14,27,48,0.6)', opacity: it.anulat ? 0.55 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: '#FFFFFF', flex: 1 }}>{it.titlu}{it.anulat ? ' · anulată' : ''}</span>
                      <span style={{ fontSize: 10.5, color: 'rgba(159,215,255,0.45)' }}>{new Date(it.ts).toLocaleString('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'rgba(214,228,244,0.7)', marginTop: 3, lineHeight: 1.45 }}>{it.descriere}</div>
                    {!it.anulat && <button disabled={busy === 'u-' + it.id} onClick={() => anuleaza(it.id)} style={{ ...btn('transparent', '#FCD34D', 'rgba(245,158,11,0.35)'), marginTop: 7, padding: '5px 10px', fontSize: 11.5 }}><RotateCcw size={11} /> Anulează acțiunea</button>}
                  </div>
                ))}
              </>
            ) : msgs.length === 0 ? (
              <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF' }}>Salut! Cu ce te ajut?</div>
                <div style={{ fontSize: 12.5, color: 'rgba(186,214,255,0.65)', lineHeight: 1.5 }}>Pot să caut rezervări, să verific disponibilitatea, să fac / anulez / mut rezervări (cu confirmarea ta), să scriu mesaje pentru clienți și să-ți spun ce ai de făcut.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {SUGESTII.map(s => <button key={s} onClick={() => trimite(s)} style={{ ...btn('rgba(124,155,255,0.08)', '#C7D2FE', 'rgba(124,155,255,0.25)'), justifyContent: 'flex-start', fontWeight: 600 }}>{s}</button>)}
                  {ctx && <button onClick={() => trimite('Ce trebuie să știu despre rezervarea asta și ce mesaj ar trebui să-i trimit clientului acum?')} style={{ ...btn('rgba(139,92,246,0.1)', '#C4B5FD', 'rgba(139,92,246,0.3)'), justifyContent: 'flex-start', fontWeight: 600 }}>📌 Ce fac cu rezervarea de pe ecran?</button>}
                </div>
              </div>
            ) : msgs.map((m, mi) => (
              <div key={mi} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '85%' : '100%' }}>
                <div style={{ padding: m.role === 'user' ? '8px 12px' : m.nota ? '6px 10px' : '2px 0', borderRadius: 13, fontSize: m.nota ? 12 : 13.5, lineHeight: 1.55,
                  background: m.role === 'user' ? 'linear-gradient(135deg,#2563EB,#4F46E5)' : m.nota ? 'rgba(124,155,255,0.08)' : 'transparent',
                  color: m.role === 'user' ? '#FFFFFF' : m.nota ? '#C7D2FE' : 'rgba(232,244,255,0.92)', whiteSpace: m.role === 'user' ? 'pre-wrap' : undefined }}>
                  {m.role === 'user' ? m.content : <Text t={m.content} onRez={setRezDeschisa} />}
                </div>
                {m.cards?.map((c, ci) => c.tip === 'actiune' ? cardActiune(c, mi, ci)
                  : c.tip === 'mesaj' ? cardMesaj(c, mi, ci)
                  : c.tip === 'confirmare' ? <button key={ci} onClick={() => setConfId(c.rezervare_id)} style={{ ...btn('linear-gradient(135deg,rgba(37,99,235,0.2),rgba(124,58,237,0.2))', '#7DD3FC', 'rgba(56,189,248,0.4)'), marginTop: 8, width: '100%' }}>✦ Deschide confirmarea pentru {c.titlu} (poză / PDF)</button>
                  : null)}
              </div>
            ))}
            {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'rgba(186,214,255,0.6)' }}><Loader2 size={14} className="ag-spin" /> Mă uit în sistem…</div>}
            <div ref={endRef} />
          </div>

          {/* intrare */}
          {!jurnal && (
            <div style={{ padding: 10, borderTop: '1px solid rgba(124,155,255,0.15)', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <textarea ref={inpRef} value={input} onChange={e => setInput(e.target.value)} rows={1} placeholder="Întreabă sau cere ceva…"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); trimite() } }}
                style={{ flex: 1, resize: 'none', maxHeight: 120, padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(124,155,255,0.25)', background: 'rgba(14,27,48,0.8)', color: '#FFFFFF', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', lineHeight: 1.4 }} />
              <button onClick={voce} title="Dictează" style={{ ...btn(listening ? 'rgba(239,68,68,0.2)' : 'transparent', listening ? '#F87171' : 'rgba(214,228,244,0.7)', 'rgba(159,215,255,0.2)'), padding: 10 }}><Mic size={16} /></button>
              <button onClick={() => trimite()} disabled={loading || !input.trim()} title="Trimite" style={{ ...btn('linear-gradient(135deg,#2563EB,#7C3AED)', '#FFFFFF', 'transparent'), padding: 10, opacity: loading || !input.trim() ? 0.5 : 1 }}><Send size={16} /></button>
            </div>
          )}
        </div>
      )}
      {/* formularul are z-index 50 - il ridicam deasupra ferestrei asistentului */}
      {rezDeschisa && <div style={{ position: 'relative', zIndex: 1100 }}><RezervareEditor rezervareId={rezDeschisa} onClose={() => setRezDeschisa(null)} onSaved={() => window.dispatchEvent(new CustomEvent('rezervari:modificate'))} /></div>}
      {confId && <ConfirmareClient rezervareId={confId} onClose={() => setConfId(null)} />}
    </>
  )
}
