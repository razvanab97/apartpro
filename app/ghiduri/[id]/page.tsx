'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/components/Layout'
import GhidView from '@/components/GhidView'
import { citesteGhid, salveazaGhid, ghidNou, aptDupaCod, linkGhid, pasGol, incarcaMedia, codLink, LIMITA_VIDEO_MB, type Ghid, type Pas } from '@/lib/ghid'
import { ArrowUp, ArrowDown, X, Plus, Upload, Loader2, Copy, ExternalLink, Languages, Check, Star, Film } from 'lucide-react'

// Editorul ghidului de check-in (cerut direct: „o modalitate de modificare text și de adăugat alte poze”).
// Stanga: textele (RO sau EN), pozele / videoclipurile pe fiecare pas, ordinea; dreapta: ghidul exact cum il vede
// oaspetele. Se salveaza singur la fiecare modificare.

type Apt = { id: string; nota: string | null; nume: string; adresa: string | null }
const muta = <T,>(a: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= a.length) return a; const c = [...a]; [c[i], c[j]] = [c[j], c[i]]; return c }

const card: React.CSSProperties = { background: 'rgba(14,27,48,0.6)', border: '1px solid rgba(159,215,255,0.12)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(159,215,255,0.55)' }
const sec: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7BC8FF', margin: '6px 0 0' }
const mic = (c = 'rgba(214,228,244,0.75)', b = 'rgba(159,215,255,0.2)'): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: `1px solid ${b}`, background: 'transparent', color: c, fontSize: 12, fontWeight: 700, cursor: 'pointer' })
const iconBtn: React.CSSProperties = { width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 7, border: '1px solid rgba(159,215,255,0.18)', background: 'transparent', color: 'rgba(214,228,244,0.7)', cursor: 'pointer', padding: 0 }

export default function EditorGhid() {
  const { id } = useParams<{ id: string }>()
  const [apt, setApt] = useState<Apt | null>(null)
  const [g, setG] = useState<Ghid | null>(null)
  const [l, setL] = useState<'ro' | 'en'>('ro')
  const [stare, setStare] = useState<'salvat' | 'modificat' | 'salvez' | 'eroare'>('salvat')
  const [eroare, setEroare] = useState<string | null>(null)
  const [incarc, setIncarc] = useState<Record<number, number>>({})
  const [progres, setProgres] = useState<Record<number, number>>({})
  const [traduc, setTraduc] = useState<string | null>(null)
  const [vedere, setVedere] = useState<'edit' | 'preview'>('edit')
  const [copiat, setCopiat] = useState(false)
  const prima = useRef(true)

  useEffect(() => {
    ;(async () => {
      // /ghiduri/<id> sau /ghiduri/<COD> (ex. GS08 - vine din scurtatura /ghid/GS08/admin)
      const data = await aptDupaCod(String(id))
      if (!data) { setApt({ id: '', nota: null, nume: 'Apartament negăsit', adresa: null }); setG(ghidNou()); return }
      setApt(data as Apt)
      const ghid = await citesteGhid(data.id)
      setG(ghid || { ...ghidNou(String(data?.nume || '')), sub_ro: data?.adresa || '' })
    })()
  }, [id])

  // salvare automata, la 1 s dupa ultima modificare
  useEffect(() => {
    if (!g) return
    if (prima.current) { prima.current = false; return }
    setStare('modificat')
    const t = setTimeout(async () => {
      setStare('salvez')
      if (!apt?.id) return
      const err = await salveazaGhid(apt.id, g)
      if (err) { setStare('eroare'); setEroare(err) } else { setStare('salvat'); setEroare(null) }
    }, 1000)
    return () => clearTimeout(t)
  }, [g, id, apt?.id])
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (stare !== 'salvat') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', f); return () => window.removeEventListener('beforeunload', f)
  }, [stare])

  if (!g || !apt) return <div style={{ padding: 40, color: 'rgba(159,215,255,0.6)', display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Se încarcă ghidul…</div>

  const set = (p: Partial<Ghid>) => setG(x => x ? { ...x, ...p } : x)
  const setPas = (i: number, p: Partial<Pas>) => setG(x => x ? { ...x, pasi: x.pasi.map((s, j) => j === i ? { ...s, ...p } : s) } : x)
  const k = (base: string): string => `${base}_${l}`
  const gv = (base: string): string => (g as any)[k(base)] || ''
  const pv = (p: Pas, base: string): string => (p as any)[k(base)] || ''
  const link = linkGhid(apt)

  async function adaugaMedia(i: number, files: FileList | File[]) {
    const lista = Array.from(files)
    if (!lista.length) return
    setIncarc(x => ({ ...x, [i]: (x[i] || 0) + lista.length }))
    const erori: string[] = []
    for (const f of lista) {
      setProgres(x => ({ ...x, [i]: 0 }))
      const r = await incarcaMedia(codLink(apt!), f, pct => setProgres(x => ({ ...x, [i]: pct })))
      if (r.media) setG(x => x ? { ...x, pasi: x.pasi.map((s, j) => j === i ? { ...s, media: [...s.media, r.media!] } : s) } : x)
      else if (r.eroare) erori.push(r.eroare)
      setIncarc(x => ({ ...x, [i]: Math.max(0, (x[i] || 1) - 1) }))
    }
    if (erori.length) setEroare(erori.join(' · '))
  }

  // traduce in engleza tot ce are text in romana si nu are inca traducere
  async function traduceTot() {
    const sarcini: { ro: string; pune: (en: string) => void }[] = []
    const adauga = (ro: string, en: string, pune: (en: string) => void) => { if (ro?.trim() && !en?.trim()) sarcini.push({ ro, pune }) }
    adauga(g!.sub_ro, g!.sub_en, en => set({ sub_en: en }))
    adauga(g!.acces_nota_ro, g!.acces_nota_en, en => set({ acces_nota_en: en }))
    adauga(g!.final_ro, g!.final_en, en => set({ final_en: en }))
    g!.acces.forEach((a, i) => adauga(a.ro, a.en, en => setG(x => x ? { ...x, acces: x.acces.map((y, j) => j === i ? { ...y, en } : y) } : x)))
    g!.reguli.forEach((r, i) => {
      adauga(r.eticheta_ro, r.eticheta_en, en => setG(x => x ? { ...x, reguli: x.reguli.map((y, j) => j === i ? { ...y, eticheta_en: en } : y) } : x))
      adauga(r.text_ro, r.text_en, en => setG(x => x ? { ...x, reguli: x.reguli.map((y, j) => j === i ? { ...y, text_en: en } : y) } : x))
    })
    g!.pasi.forEach((p, i) => {
      for (const c of ['titlu', 'text', 'nota', 'link'] as const) adauga((p as any)[c + '_ro'], (p as any)[c + '_en'], en => setPas(i, { [c + '_en']: en } as any))
      p.media.forEach((m, j) => adauga(m.ro, m.en, en => setG(x => x ? { ...x, pasi: x.pasi.map((s, a) => a === i ? { ...s, media: s.media.map((mm, b) => b === j ? { ...mm, en } : mm) } : s) } : x)))
    })
    if (!sarcini.length) { setTraduc('Totul e deja tradus'); setTimeout(() => setTraduc(null), 2000); return }
    let n = 0
    for (const s of sarcini) {
      setTraduc(`Traduc ${++n}/${sarcini.length}…`)
      try {
        const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: s.ro }) })
        const j = await r.json(); if (j.translated || j.text || j.traducere) s.pune(String(j.translated || j.text || j.traducere).trim())
      } catch {}
    }
    setTraduc('Tradus ✓'); setTimeout(() => setTraduc(null), 2000)
  }

  const camp = (eticheta: string, val: string, on: (v: string) => void, opt: { rows?: number; ph?: string; mono?: boolean } = {}) => (
    <label style={lbl}>{eticheta}
      {opt.rows
        ? <textarea value={val} onChange={e => on(e.target.value)} rows={opt.rows} placeholder={opt.ph} style={{ resize: 'vertical', textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: 13.5, lineHeight: 1.5 }} />
        : <input value={val} onChange={e => on(e.target.value)} placeholder={opt.ph} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, fontSize: 13.5, fontFamily: opt.mono ? 'ui-monospace,Menlo,monospace' : undefined }} />}
    </label>
  )
  const lb = l === 'en' ? ' (EN)' : ''

  const formular = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {eroare && <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171', fontSize: 12.5 }}>{eroare} <button onClick={() => setEroare(null)} style={{ ...mic('#F87171', 'transparent'), padding: '0 4px' }}>ok</button></div>}

      <div style={sec}>General</div>
      <div style={card}>
        {camp('Titlu (mare, sus)', g.titlu, v => set({ titlu: v }), { ph: 'GREEN STATION' })}
        {camp('Subtitlu' + lb, gv('sub'), v => set({ [k('sub')]: v } as any), { ph: 'Bloc I4 · scara C · etaj 1 · apartament 8' })}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 8 }}>
          {camp('Check-in de la', g.checkin, v => set({ checkin: v }), { ph: '15:00' })}
          {camp('Check-out până la', g.checkout, v => set({ checkout: v }), { ph: '11:00' })}
          {camp('Telefon contact', g.telefon, v => set({ telefon: v }), { ph: '+40 …' })}
        </div>
      </div>

      <div style={sec}>Acces rapid (cod, Wi-Fi…)</div>
      <div style={card}>
        {g.acces.map((a, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
            {camp('Etichetă' + lb, l === 'en' ? a.en : a.ro, v => setG(x => x ? { ...x, acces: x.acces.map((y, j) => j === i ? { ...y, [l]: v } : y) } : x))}
            {camp('Valoare', a.valoare, v => setG(x => x ? { ...x, acces: x.acces.map((y, j) => j === i ? { ...y, valoare: v } : y) } : x), { mono: true })}
            <div style={{ display: 'flex', gap: 4, paddingBottom: 2 }}>
              <button title="Afișează mare, portocaliu (cod)" onClick={() => setG(x => x ? { ...x, acces: x.acces.map((y, j) => j === i ? { ...y, cod: !y.cod } : y) } : x)} style={{ ...iconBtn, color: a.cod ? '#FF8A3D' : iconBtn.color, borderColor: a.cod ? 'rgba(255,138,61,0.6)' : 'rgba(159,215,255,0.18)' }}><Star size={13} /></button>
              <button title="Mută sus" onClick={() => set({ acces: muta(g.acces, i, -1) })} style={iconBtn}><ArrowUp size={13} /></button>
              <button title="Șterge" onClick={() => set({ acces: g.acces.filter((_, j) => j !== i) })} style={iconBtn}><X size={13} /></button>
            </div>
          </div>
        ))}
        <button onClick={() => set({ acces: [...g.acces, { ro: '', en: '', valoare: '', cod: false }] })} style={{ ...mic(), alignSelf: 'flex-start' }}><Plus size={13} /> Rând nou</button>
        {camp('Notă sub acces' + lb, gv('acces_nota'), v => set({ [k('acces_nota')]: v } as any), { rows: 2 })}
      </div>

      <div style={sec}>Pașii, în ordinea în care ajunge oaspetele</div>
      {g.pasi.map((p, i) => (
        <div key={i} style={card}
          onDragOver={e => { e.preventDefault() }} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.length) adaugaMedia(i, e.dataTransfer.files) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'Impact,"Arial Narrow",sans-serif', fontSize: 24, color: '#FF8A3D', width: 26 }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: '#E8F4FF' }}>{(l === 'en' ? p.titlu_en || p.titlu_ro : p.titlu_ro) || 'Pas nou'}</span>
            <button title="Mută sus" onClick={() => set({ pasi: muta(g.pasi, i, -1) })} style={iconBtn}><ArrowUp size={13} /></button>
            <button title="Mută jos" onClick={() => set({ pasi: muta(g.pasi, i, 1) })} style={iconBtn}><ArrowDown size={13} /></button>
            <button title="Șterge pasul" onClick={() => { if (window.confirm(`Ștergi pasul „${p.titlu_ro || i + 1}” cu tot cu poze?`)) set({ pasi: g.pasi.filter((_, j) => j !== i) }) }} style={{ ...iconBtn, color: '#F87171' }}><X size={13} /></button>
          </div>
          {camp('Titlu' + lb, pv(p, 'titlu'), v => setPas(i, { [k('titlu')]: v } as any))}
          {camp('Text' + lb, pv(p, 'text'), v => setPas(i, { [k('text')]: v } as any), { rows: 3, ph: 'Ce trebuie să facă oaspetele la acest pas…' })}
          {camp('Text cu buton „Copiază” (ex. strada și numărul)', p.copiaza || '', v => setPas(i, { copiaza: v }), { ph: 'Străpungere Silvestru nr. 7' })}
          {camp('Notă evidențiată (portocaliu)' + lb, pv(p, 'nota'), v => setPas(i, { [k('nota')]: v } as any), { rows: 2, ph: 'ex. Se lucrează la interfon…' })}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
            {camp('Buton cu link (ex. Google Maps)', p.link_url, v => setPas(i, { link_url: v }), { ph: 'https://maps.app.goo.gl/…' })}
            {camp('Text buton' + lb, pv(p, 'link'), v => setPas(i, { [k('link')]: v } as any), { ph: 'Deschide în Google Maps' })}
          </div>
          <div style={{ ...lbl, marginTop: 2 }}>Poze și video</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8 }}>
            {p.media.map((m, j) => (
              <div key={j} style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${g.fundal === m.url ? 'rgba(255,138,61,0.7)' : 'rgba(159,215,255,0.15)'}`, background: 'rgba(5,12,24,0.6)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#000' }}>
                  {m.tip === 'img'
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <video src={m.url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  {m.tip === 'video' && <span style={{ position: 'absolute', left: 6, top: 6, display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10.5, fontWeight: 700 }}><Film size={11} /> video</span>}
                  <div style={{ position: 'absolute', right: 4, top: 4, display: 'flex', gap: 3 }}>
                    {m.tip === 'img' && <button title={g.fundal === m.url ? 'Fundalul paginii' : 'Folosește ca fundal al paginii'} onClick={() => set({ fundal: g.fundal === m.url ? '' : m.url })} style={{ ...iconBtn, width: 24, height: 24, background: 'rgba(0,0,0,0.55)', color: g.fundal === m.url ? '#FF8A3D' : '#fff' }}><Star size={12} /></button>}
                    <button title="Mută la stânga" onClick={() => setPas(i, { media: muta(p.media, j, -1) })} style={{ ...iconBtn, width: 24, height: 24, background: 'rgba(0,0,0,0.55)', color: '#fff' }}><ArrowUp size={12} style={{ transform: 'rotate(-90deg)' }} /></button>
                    <button title="Mută la dreapta" onClick={() => setPas(i, { media: muta(p.media, j, 1) })} style={{ ...iconBtn, width: 24, height: 24, background: 'rgba(0,0,0,0.55)', color: '#fff' }}><ArrowUp size={12} style={{ transform: 'rotate(90deg)' }} /></button>
                    <button title="Șterge" onClick={() => setPas(i, { media: p.media.filter((_, b) => b !== j) })} style={{ ...iconBtn, width: 24, height: 24, background: 'rgba(0,0,0,0.55)', color: '#F87171' }}><X size={12} /></button>
                  </div>
                </div>
                <input value={l === 'en' ? m.en : m.ro} placeholder={'Descriere' + lb} onChange={e => setPas(i, { media: p.media.map((mm, b) => b === j ? { ...mm, [l]: e.target.value } : mm) })}
                  style={{ border: 'none', borderRadius: 0, borderTop: '1px solid rgba(159,215,255,0.1)', fontSize: 12, padding: '7px 9px' }} />
              </div>
            ))}
            <label style={{ minHeight: 120, borderRadius: 10, border: '1.5px dashed rgba(255,138,61,0.5)', background: 'rgba(255,138,61,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', color: '#FF8A3D', fontSize: 12, fontWeight: 700, textAlign: 'center', padding: 8 }}>
              {incarc[i] ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Se încarcă{incarc[i] > 1 ? ` (${incarc[i]} fișiere)` : ''}… {progres[i] ?? 0}%<span style={{ width: '80%', height: 5, borderRadius: 3, background: 'rgba(255,138,61,0.2)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${progres[i] ?? 0}%`, background: '#FF8A3D', transition: 'width .2s' }} /></span></> : <><Upload size={18} /> Adaugă poze / video<span style={{ fontWeight: 500, color: 'rgba(255,138,61,0.7)', fontSize: 11 }}>sau trage fișierele aici · video max {LIMITA_VIDEO_MB} MB</span></>}
              <input type="file" accept="image/*,video/*,.mp4,.mov,.m4v,.webm" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) adaugaMedia(i, e.target.files); e.target.value = '' }} />
            </label>
          </div>
        </div>
      ))}
      <button onClick={() => set({ pasi: [...g.pasi, pasGol()] })} style={{ ...mic('#FF8A3D', 'rgba(255,138,61,0.45)'), padding: '10px', fontSize: 13 }}><Plus size={14} /> Adaugă un pas</button>

      <div style={sec}>Regulile locației</div>
      <div style={card}>
        {g.reguli.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 8, alignItems: 'end' }}>
            {camp('Etichetă' + lb, ((r as any)[k('eticheta')] || ''), v => setG(x => x ? { ...x, reguli: x.reguli.map((y, j) => j === i ? { ...y, [k('eticheta')]: v } : y) } : x))}
            {camp('Regula' + lb, ((r as any)[k('text')] || ''), v => setG(x => x ? { ...x, reguli: x.reguli.map((y, j) => j === i ? { ...y, [k('text')]: v } : y) } : x))}
            <div style={{ display: 'flex', gap: 4, paddingBottom: 2 }}>
              <button title="Mută sus" onClick={() => set({ reguli: muta(g.reguli, i, -1) })} style={iconBtn}><ArrowUp size={13} /></button>
              <button title="Șterge" onClick={() => set({ reguli: g.reguli.filter((_, j) => j !== i) })} style={iconBtn}><X size={13} /></button>
            </div>
          </div>
        ))}
        <button onClick={() => set({ reguli: [...g.reguli, { eticheta_ro: '', eticheta_en: '', text_ro: '', text_en: '' }] })} style={{ ...mic(), alignSelf: 'flex-start' }}><Plus size={13} /> Regulă nouă</button>
      </div>
      <div style={card}>{camp('Mesaj de final' + lb, gv('final'), v => set({ [k('final')]: v } as any))}</div>
    </div>
  )

  const stareTxt = stare === 'salvat' ? <span style={{ color: '#4ADE80', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Salvat</span>
    : stare === 'salvez' ? <span style={{ color: 'rgba(159,215,255,0.7)' }}>Se salvează…</span>
    : stare === 'eroare' ? <span style={{ color: '#F87171' }}>Nesalvat — eroare</span>
    : <span style={{ color: '#FCD34D' }}>Modificări…</span>

  return (
    <>
      <PageHeader title={`Ghid check-in · ${apt.nota ? apt.nota + ' · ' : ''}${apt.nume}`} subtitle={link.replace(/^https?:\/\//, '')}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{stareTxt}</span>
            <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, border: '1px solid rgba(159,215,255,0.15)' }}>
              {(['ro', 'en'] as const).map(x => <button key={x} onClick={() => setL(x)} style={{ border: 'none', borderRadius: 7, padding: '5px 11px', fontSize: 12, fontWeight: 800, cursor: 'pointer', background: l === x ? '#4DA3FF' : 'transparent', color: l === x ? '#fff' : 'rgba(159,215,255,0.6)' }}>{x === 'ro' ? 'Editez RO' : 'Editez EN'}</button>)}
            </div>
            <button onClick={traduceTot} disabled={!!traduc && traduc.startsWith('Traduc')} style={mic('#C4B5FD', 'rgba(196,181,253,0.35)')}><Languages size={13} /> {traduc || 'Traduce în EN ce lipsește'}</button>
            <button onClick={() => navigator.clipboard.writeText(link).then(() => { setCopiat(true); setTimeout(() => setCopiat(false), 1500) }).catch(() => {})} style={mic('#7BC8FF', 'rgba(77,163,255,0.35)')}>{copiat ? <Check size={13} /> : <Copy size={13} />} {copiat ? 'Copiat' : 'Copiază linkul'}</button>
            <a href={link} target="_blank" rel="noreferrer" style={{ ...mic('#FF8A3D', 'rgba(255,138,61,0.45)'), textDecoration: 'none' }}><ExternalLink size={13} /> Deschide</a>
          </div>
        } />
      <div className="ghe-tabs" style={{ display: 'none', gap: 6, padding: '10px 16px 0' }}>
        {(['edit', 'preview'] as const).map(v => <button key={v} onClick={() => setVedere(v)} style={{ ...mic(vedere === v ? '#fff' : undefined, vedere === v ? '#4DA3FF' : undefined), background: vedere === v ? '#4DA3FF' : 'transparent', flex: 1 }}>{v === 'edit' ? 'Editează' : 'Cum arată'}</button>)}
      </div>
      <div className="ghe" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 420px', gap: 18, padding: 16, alignItems: 'start' }}>
        <div className={'ghe-form' + (vedere === 'preview' ? ' ascuns' : '')}>{formular}</div>
        <div className={'ghe-prev' + (vedere === 'edit' ? ' ascuns' : '')} style={{ position: 'sticky', top: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(159,215,255,0.5)', marginBottom: 6 }}>Cum îl vede oaspetele</div>
          <div style={{ height: 'calc(100dvh - 150px)', overflowY: 'auto', borderRadius: 26, border: '6px solid #1c2433', background: '#120d0a' }}>
            <GhidView g={g} fix={false} limbaStart={l} key={l} />
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 980px){ .ghe{grid-template-columns:1fr!important} .ghe-tabs{display:flex!important} .ghe .ascuns{display:none} .ghe-prev{position:static!important} }`}</style>
    </>
  )
}
