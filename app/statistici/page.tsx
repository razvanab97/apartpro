'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

type Platforma = 'airbnb' | 'booking'
type Tab = 'dashboard' | 'evolutie' | 'upload'
type SortBy = 'vizualizari' | 'ocupare' | 'pozitie' | 'tarif' | 'delta'
type ShowFilter = 'toate' | 'scaderi' | 'cresteri'

interface Apt { id: string; nume: string; nota: string }

interface StatRow {
  id: string
  apartament_id: string
  platforma: Platforma
  data_inregistrare: string
  rata_ocupare?: number
  nopti_rezervate?: number
  nopti_blocate?: number
  nopti_fara_rezervare?: number
  checkin_uri?: number
  rata_anulari?: number
  durata_medie_sedere?: number
  tarif_mediu_noapte?: number
  tarif_vs_similar?: number
  afisari_pagina_total?: number
  afisari_p1_total?: number
  rata_afisari_p1?: number
  rata_conversie_globala?: number
  rata_conversie_cautari_p1?: number
  rata_conversie_vizite_rez?: number
  wishlist_total?: number
  wishlist_vs_similar?: number
  rata_ocupare_vs_similar?: number
  durata_sedere_vs_similar?: number
  vizualizari_cautari?: number
  vizualizari_pagina?: number
  rezervari_confirmate?: number
  scor_pozitie_rank?: number
  scor_pozitie_total?: number
  scor_pozitie_pct?: number
  rata_conversie_cautari?: number
  rata_conversie_pagina?: number
  adr?: number
  scor_comentarii?: number
  completare_pagina_pct?: number
  raw_extras?: any
}

interface UploadItem {
  id: string
  file: File
  aptId: string
  platforma: Platforma
  status: 'pending' | 'processing' | 'done' | 'error'
  extracted: any
  errorMsg?: string
  preview?: string
}

interface AlertThresholds { vizualizari: number; ocupare: number; pozitie: number }

const DEFAULT_THRESH: AlertThresholds = { vizualizari: 20, ocupare: 15, pozitie: 10 }

function pctDelta(curr?: number, prev?: number): number | null {
  if (curr == null || prev == null || prev === 0) return null
  return ((curr - prev) / Math.abs(prev)) * 100
}

function DeltaBadge({ d, inverted = false }: { d: number | null; inverted?: boolean }) {
  if (d == null) return null
  const abs = Math.abs(d)
  if (abs < 0.05) return <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)' }}>—</span>
  const isGood = inverted ? d < 0 : d > 0
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: isGood ? '#4ade80' : '#f87171' }}>
      {d > 0 ? '+' : ''}{d.toFixed(1)}%
    </span>
  )
}

function VsBadge({ val, unit = '' }: { val?: number; unit?: string }) {
  if (val == null) return null
  const color = val > 0 ? '#4ade80' : '#f87171'
  return <span style={{ fontSize: 10, color, marginLeft: 4 }}>{val > 0 ? '+' : ''}{val}{unit} vs. similare</span>
}

const METRIC_OPTS: Record<Platforma, { key: string; label: string }[]> = {
  airbnb: [
    { key: 'rata_afisari_p1', label: 'Afișări p.1 (%)' },
    { key: 'rata_ocupare', label: 'Ocupare (%)' },
    { key: 'tarif_mediu_noapte', label: 'Tarif/noapte (RON)' },
    { key: 'rata_conversie_globala', label: 'Conversie globală (%)' },
    { key: 'rata_conversie_vizite_rez', label: 'Conversie vizite→rez (%)' },
    { key: 'afisari_p1_total', label: 'Afișări prima pagină' },
    { key: 'afisari_pagina_total', label: 'Afișări pagină total' },
    { key: 'wishlist_total', label: 'Wishlist' },
    { key: 'durata_medie_sedere', label: 'Durata ședere (zile)' },
    { key: 'rata_anulari', label: 'Rată anulări (%)' },
  ],
  booking: [
    { key: 'vizualizari_cautari', label: 'Vizualizări căutări' },
    { key: 'vizualizari_pagina', label: 'Vizualizări pagină' },
    { key: 'scor_pozitie_pct', label: 'Scor poziție (%)' },
    { key: 'rata_conversie_pagina', label: 'Conversie pagină (%)' },
    { key: 'adr', label: 'ADR (RON)' },
    { key: 'rezervari_confirmate', label: 'Rezervări' },
    { key: 'rata_anulari', label: 'Rată anulări (%)' },
    { key: 'scor_comentarii', label: 'Scor comentarii' },
    { key: 'completare_pagina_pct', label: 'Completare pagină (%)' },
  ],
}

const LINE_COLORS = ['#4DA3FF','#4ade80','#fbbf24','#f87171','#a78bfa','#34d399','#fb923c','#38bdf8','#e879f9','#a3e635']

export default function StatisticiPage() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [apts, setApts] = useState<Apt[]>([])
  const [stats, setStats] = useState<StatRow[]>([])
  const [loading, setLoading] = useState(false)

  // Dashboard filters
  const [filterPlatforma, setFilterPlatforma] = useState<Platforma | ''>('')
  const [sortBy, setSortBy] = useState<SortBy>('vizualizari')
  const [showFilter, setShowFilter] = useState<ShowFilter>('toate')
  const [thresholds] = useState<AlertThresholds>(DEFAULT_THRESH)

  // Evoluție
  const [evoApt, setEvoApt] = useState('')
  const [evoPlatforma, setEvoPlatforma] = useState<Platforma>('airbnb')
  const [evoMode, setEvoMode] = useState<'combined' | 'grid'>('combined')
  const [evoMetrics, setEvoMetrics] = useState<string[]>(['rata_afisari_p1', 'rata_ocupare'])

  // Upload
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [processing, setProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('id,nume,nota').eq('status','activ').order('nota')
      .then(({ data }) => setApts(data || []))
  }, [])

  useEffect(() => {
    if (tab === 'dashboard' || tab === 'evolutie') loadStats()
  }, [tab])

  async function loadStats() {
    setLoading(true)
    const { data } = await supabase
      .from('statistici_platforme').select('*')
      .order('data_inregistrare', { ascending: false }).limit(600)
    setStats(data || [])
    setLoading(false)
  }

  const aptName = (id: string) => {
    const a = apts.find(x => x.id === id)
    return a ? `[${a.nota}] ${a.nume}` : id
  }

  // Group stats by apt+platform, sorted by date desc
  const pairMap = useMemo(() => {
    const map: Record<string, StatRow[]> = {}
    stats.forEach(s => {
      const k = `${s.apartament_id}_${s.platforma}`
      if (!map[k]) map[k] = []
      map[k].push(s)
    })
    Object.values(map).forEach(arr => arr.sort((a, b) => b.data_inregistrare.localeCompare(a.data_inregistrare)))
    return map
  }, [stats])

  const cards = useMemo(() => Object.values(pairMap).map(entries => ({ latest: entries[0], prev: entries[1] })), [pairMap])

  const alerts = useMemo(() => cards.filter(({ latest, prev }) => {
    if (!prev) return false
    if (latest.platforma === 'booking') {
      const vd = pctDelta(latest.vizualizari_cautari, prev.vizualizari_cautari)
      if (vd != null && vd < -thresholds.vizualizari) return true
      if (latest.scor_pozitie_rank != null && prev.scor_pozitie_rank != null) {
        const rankWorse = ((latest.scor_pozitie_rank - prev.scor_pozitie_rank) / prev.scor_pozitie_rank) * 100
        if (rankWorse > thresholds.pozitie) return true
      }
    } else {
      const vd = pctDelta(latest.afisari_p1_total ?? latest.rata_afisari_p1, prev.afisari_p1_total ?? prev.rata_afisari_p1)
      if (vd != null && vd < -thresholds.vizualizari) return true
      const od = pctDelta(latest.rata_ocupare, prev.rata_ocupare)
      if (od != null && od < -thresholds.ocupare) return true
    }
    return false
  }), [cards, thresholds])

  const filteredCards = useMemo(() => {
    let c = cards
    if (filterPlatforma) c = c.filter(x => x.latest.platforma === filterPlatforma)
    if (showFilter !== 'toate') c = c.filter(({ latest, prev }) => {
      if (!prev) return false
      const d = latest.platforma === 'booking'
        ? pctDelta(latest.vizualizari_cautari, prev.vizualizari_cautari)
        : pctDelta(latest.rata_afisari_p1 ?? latest.afisari_p1_total, prev.rata_afisari_p1 ?? prev.afisari_p1_total)
      return showFilter === 'scaderi' ? (d != null && d < 0) : (d != null && d > 0)
    })
    return [...c].sort((a, b) => {
      if (sortBy === 'ocupare') return (b.latest.rata_ocupare || 0) - (a.latest.rata_ocupare || 0)
      if (sortBy === 'tarif') return Math.max(b.latest.tarif_mediu_noapte || 0, b.latest.adr || 0) - Math.max(a.latest.tarif_mediu_noapte || 0, a.latest.adr || 0)
      if (sortBy === 'pozitie') return (a.latest.scor_pozitie_rank || 9999) - (b.latest.scor_pozitie_rank || 9999)
      if (sortBy === 'delta') {
        const da = Math.abs(pctDelta(a.latest.vizualizari_cautari ?? a.latest.afisari_p1_total, a.prev?.vizualizari_cautari ?? a.prev?.afisari_p1_total) || 0)
        const db = Math.abs(pctDelta(b.latest.vizualizari_cautari ?? b.latest.afisari_p1_total, b.prev?.vizualizari_cautari ?? b.prev?.afisari_p1_total) || 0)
        return db - da
      }
      // vizualizari (default)
      return Math.max(b.latest.vizualizari_cautari || 0, b.latest.afisari_p1_total || 0) - Math.max(a.latest.vizualizari_cautari || 0, a.latest.afisari_p1_total || 0)
    })
  }, [cards, filterPlatforma, showFilter, sortBy])

  const evoData = useMemo(() => {
    if (!evoApt) return []
    const k = `${evoApt}_${evoPlatforma}`
    return (pairMap[k] || []).slice().reverse()
  }, [pairMap, evoApt, evoPlatforma])

  // Upload helpers
  function handleFiles(files: FileList | null) {
    if (!files) return
    const items: UploadItem[] = Array.from(files).map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f, aptId: '', platforma: 'airbnb',
      status: 'pending', extracted: null,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
    }))
    setUploads(prev => [...prev, ...items])
  }

  function updUpload(id: string, ch: Partial<UploadItem>) {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...ch } : u))
  }

  async function processAll() {
    const pending = uploads.filter(u => u.status === 'pending')
    if (!pending.length) { show('error', 'Nu există fișiere de procesat'); return }
    setProcessing(true)
    await Promise.all(pending.map(async item => {
      updUpload(item.id, { status: 'processing' })
      try {
        const result = await extractWithAI(item)
        updUpload(item.id, {
          status: 'done', extracted: result,
          aptId: result.detected_apt_id || item.aptId,
          platforma: (result.detected_platforma as Platforma) || item.platforma
        })
      } catch (e: any) {
        updUpload(item.id, { status: 'error', errorMsg: e.message })
      }
    }))
    setProcessing(false)
    show('success', `Procesate ${pending.length} fișiere`)
  }

  async function extractWithAI(item: UploadItem) {
    const base64 = await fileToBase64(item.file)
    const isPDF = item.file.name.endsWith('.pdf')
    const isCSV = item.file.name.endsWith('.csv')
    const mimeType = isPDF ? 'application/pdf' : isCSV ? 'text/csv' : (item.file.type || 'image/png')
    const res = await fetch('/api/statistici-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data: base64, mimeType, filename: item.file.name, aptList: apts.map(a => ({ id: a.id, name: `${a.nota} ${a.nume}` })) })
    })
    if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || 'Eroare server') }
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res((r.result as string).split(',')[1])
      r.onerror = rej
      r.readAsDataURL(file)
    })
  }

  async function saveAll() {
    const done = uploads.filter(u => u.status === 'done' && u.extracted && u.aptId)
    if (!done.length) { show('error', 'Nu există date de salvat sau apartamentul nu e selectat'); return }
    let saved = 0
    for (const item of done) {
      const { detected_apt_id, detected_platforma, ...metrics } = item.extracted
      const { error } = await supabase.from('statistici_platforme').insert({
        apartament_id: item.aptId, platforma: item.platforma,
        data_inregistrare: new Date().toISOString().split('T')[0],
        ...metrics
      })
      if (!error) saved++
    }
    show('success', `Salvate ${saved}/${done.length} înregistrări`)
    setUploads([])
    loadStats()
  }

  // Styles
  const S = {
    page: { padding: '20px', maxWidth: 1400, margin: '0 auto' },
    tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.1)' },
    tab: (a: boolean) => ({
      padding: '8px 18px', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 13, fontWeight: 600, border: 'none',
      background: a ? 'rgba(77,163,255,0.15)' : 'transparent',
      color: a ? '#4DA3FF' : 'rgba(159,215,255,0.5)',
      borderBottom: a ? '2px solid #4DA3FF' : '2px solid transparent', transition: 'all 0.15s'
    }),
    card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, marginBottom: 12 },
    sel: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 13 },
    btn: (c: string) => ({ padding: '7px 16px', borderRadius: 8, border: 'none', background: c, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }),
    tog: (a: boolean) => ({ padding: '5px 12px', borderRadius: 6, border: `1px solid ${a ? '#4DA3FF' : 'rgba(255,255,255,0.1)'}`, background: a ? 'rgba(77,163,255,0.15)' : 'transparent', color: a ? '#4DA3FF' : 'rgba(159,215,255,0.5)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }),
    badge: (p: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: p === 'booking' ? 'rgba(0,82,204,0.3)' : 'rgba(255,90,90,0.2)', color: p === 'booking' ? '#60a5fa' : '#fca5a5' }),
    filterBar: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const, alignItems: 'center' },
    dropzone: { border: '2px dashed rgba(77,163,255,0.3)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' as const, cursor: 'pointer' },
    div: { width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' },
  }

  const metricOpts = METRIC_OPTS[evoPlatforma]

  return (
    <>
      <PageHeader title="Statistici Platforme" subtitle="Booking.com & Airbnb — evoluție zilnică" />
      <div style={S.page}>
        <div style={S.tabs}>
          {([['dashboard','📊 Dashboard'],['evolutie','📈 Evoluție'],['upload','📤 Upload']] as [Tab,string][]).map(([t,l]) => (
            <button key={t} style={S.tab(tab===t)} onClick={() => setTab(t)}>{l}</button>
          ))}
        </div>

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div>
            {/* Alerts */}
            {alerts.length > 0 && (
              <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f87171', marginBottom: 8 }}>⚠️ Atenție — scăderi semnificative</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                  {alerts.map(({ latest }) => (
                    <span key={latest.id} style={{ fontSize: 12, color: '#fca5a5', background: 'rgba(248,113,113,0.1)', padding: '3px 10px', borderRadius: 20 }}>
                      {aptName(latest.apartament_id)} · {latest.platforma}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Filters */}
            <div style={S.filterBar}>
              {(['','airbnb','booking'] as (Platforma|'')[]).map(p => (
                <button key={String(p)} style={S.tog(filterPlatforma===p)} onClick={() => setFilterPlatforma(p)}>
                  {p==='' ? 'Toate' : p==='airbnb' ? '🏠 Airbnb' : '🔵 Booking'}
                </button>
              ))}
              <div style={S.div} />
              <select style={S.sel} value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}>
                <option value="vizualizari">↕ Vizualizări</option>
                <option value="ocupare">↕ Ocupare</option>
                <option value="pozitie">↕ Poziție clasament</option>
                <option value="tarif">↕ Tarif/noapte</option>
                <option value="delta">↕ Delta maxim</option>
              </select>
              <div style={S.div} />
              {(['toate','scaderi','cresteri'] as ShowFilter[]).map(f => (
                <button key={f} style={S.tog(showFilter===f)} onClick={() => setShowFilter(f)}>
                  {f==='toate' ? 'Toate' : f==='scaderi' ? '📉 Scăderi' : '📈 Creșteri'}
                </button>
              ))}
              <button style={{ ...S.btn('rgba(77,163,255,0.15)'), marginLeft: 'auto' }} onClick={loadStats}>🔄</button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'rgba(159,215,255,0.4)' }}>Se încarcă...</div>
            ) : filteredCards.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'rgba(159,215,255,0.4)' }}>
                Nu există date.{' '}
                <button style={{ background: 'none', border: 'none', color: '#4DA3FF', cursor: 'pointer', fontSize: 14 }} onClick={() => setTab('upload')}>
                  📤 Adaugă statistici
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                {filteredCards.map(({ latest, prev }) => (
                  <AptCard key={latest.id} stat={latest} prev={prev} name={aptName(latest.apartament_id)} badge={S.badge} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EVOLUȚIE ── */}
        {tab === 'evolutie' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <select style={S.sel} value={evoApt} onChange={e => setEvoApt(e.target.value)}>
                <option value="">— Selectează apartament —</option>
                {apts.map(a => <option key={a.id} value={a.id}>[{a.nota}] {a.nume}</option>)}
              </select>
              <select style={S.sel} value={evoPlatforma} onChange={e => { setEvoPlatforma(e.target.value as Platforma); setEvoMetrics([]) }}>
                <option value="airbnb">Airbnb</option>
                <option value="booking">Booking</option>
              </select>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button style={S.tog(evoMode==='combined')} onClick={() => setEvoMode('combined')}>📊 Combinat</button>
                <button style={S.tog(evoMode==='grid')} onClick={() => setEvoMode('grid')}>⊞ Grid</button>
              </div>
            </div>

            {!evoApt ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'rgba(159,215,255,0.4)' }}>Selectează un apartament</div>
            ) : evoData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'rgba(159,215,255,0.4)' }}>Nu există date pentru această combinație</div>
            ) : evoMode === 'combined' ? (
              <div style={S.card}>
                <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)', marginBottom: 10 }}>Selectează metricile vizibile:</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 16 }}>
                  {metricOpts.map(m => (
                    <button key={m.key} style={S.tog(evoMetrics.includes(m.key))}
                      onClick={() => setEvoMetrics(p => p.includes(m.key) ? p.filter(x => x!==m.key) : [...p, m.key])}>
                      {m.label}
                    </button>
                  ))}
                </div>
                {evoMetrics.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'rgba(159,215,255,0.4)' }}>Selectează cel puțin o metrică</div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={evoData.map(d => ({ data: d.data_inregistrare, ...d }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="data" tick={{ fontSize: 10, fill: 'rgba(159,215,255,0.5)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'rgba(159,215,255,0.5)' }} />
                      <Tooltip contentStyle={{ background: '#1a2035', border: '1px solid rgba(77,163,255,0.3)', borderRadius: 8, fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {evoMetrics.map((mk, i) => (
                        <Line key={mk} type="monotone" dataKey={mk} stroke={LINE_COLORS[i % LINE_COLORS.length]}
                          strokeWidth={2} dot={{ r: 3 }} name={metricOpts.find(m => m.key===mk)?.label || mk} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {metricOpts.map(m => {
                  const vals = evoData.map(d => ({ data: d.data_inregistrare, v: (d as any)[m.key] })).filter(x => x.v != null)
                  if (!vals.length) return null
                  const last = vals[vals.length-1]?.v
                  const first = vals[0]?.v
                  const trend = last != null && first != null ? last - first : null
                  return (
                    <div key={m.key} style={S.card}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(159,215,255,0.6)', marginBottom: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{vals[vals.length-1]?.v?.toFixed(1)}</div>
                      {trend != null && (
                        <div style={{ fontSize: 11, color: trend >= 0 ? '#4ade80' : '#f87171', marginBottom: 8 }}>
                          {trend >= 0 ? '+' : ''}{trend.toFixed(1)} total
                        </div>
                      )}
                      <ResponsiveContainer width="100%" height={80}>
                        <LineChart data={vals}>
                          <Line type="monotone" dataKey="v" stroke="#4DA3FF" strokeWidth={2} dot={false} />
                          <Tooltip contentStyle={{ background: '#1a2035', border: '1px solid rgba(77,163,255,0.3)', borderRadius: 8, fontSize: 10 }}
                            formatter={(v: any) => [Number(v).toFixed(2), m.label]} labelFormatter={(l: any) => l} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── UPLOAD ── */}
        {tab === 'upload' && (
          <div>
            <div style={S.card}>
              <div style={{ fontSize: 13, color: 'rgba(159,215,255,0.7)', marginBottom: 12 }}>
                Trage toate screenshot-urile sau PDF-urile zilei. AI detectează automat apartamentul și platforma din conținut.
              </div>
              <div style={S.dropzone} onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                <div style={{ fontSize: 14, color: 'rgba(159,215,255,0.7)' }}>Click sau trage fișierele aici</div>
                <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.4)', marginTop: 4 }}>PNG, JPG, PDF — toate deodată</div>
              </div>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }}
                onChange={e => handleFiles(e.target.files)} />
            </div>

            {uploads.length > 0 && (
              <div style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{uploads.length} fișiere</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={S.btn('#4DA3FF')} onClick={processAll} disabled={processing}>
                      {processing ? '⏳ Procesez...' : '🤖 Extrage cu AI'}
                    </button>
                    <button style={S.btn('#22c55e')} onClick={saveAll}>💾 Salvează tot</button>
                    <button style={S.btn('rgba(255,255,255,0.08)')} onClick={() => setUploads([])}>🗑</button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 190px 140px 90px', gap: 10, padding: '6px 8px', fontSize: 11, color: 'rgba(159,215,255,0.4)', fontWeight: 600 }}>
                  <span>Preview</span><span>Fișier</span><span>Apartament</span><span>Platformă</span><span>Status</span>
                </div>

                {uploads.map(item => (
                  <div key={item.id}>
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 190px 140px 90px', gap: 10, alignItems: 'center', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 4 }}>
                      <div>
                        {item.preview
                          ? <img src={item.preview} style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                          : <div style={{ width: 56, height: 40, background: 'rgba(255,255,255,0.06)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📄</div>
                        }
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</div>
                      <select style={{ ...S.sel, fontSize: 12 }} value={item.aptId} onChange={e => updUpload(item.id, { aptId: e.target.value })}>
                        <option value="">— Auto-detectat —</option>
                        {apts.map(a => <option key={a.id} value={a.id}>[{a.nota}] {a.nume}</option>)}
                      </select>
                      <select style={{ ...S.sel, fontSize: 12 }} value={item.platforma} onChange={e => updUpload(item.id, { platforma: e.target.value as Platforma })}>
                        <option value="airbnb">Airbnb</option>
                        <option value="booking">Booking</option>
                      </select>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: item.status==='done' ? '#4ade80' : item.status==='error' ? '#f87171' : item.status==='processing' ? '#fbbf24' : 'rgba(159,215,255,0.4)' }}>
                          {item.status==='done' ? '✓ Gata' : item.status==='error' ? '✗ Eroare' : item.status==='processing' ? '⏳' : '—'}
                        </span>
                        <button onClick={() => setUploads(p => p.filter(u => u.id!==item.id))} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                      </div>
                    </div>
                    {item.status === 'done' && item.extracted && (
                      <div style={{ marginLeft: 70, marginBottom: 6, padding: '6px 10px', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.12)', borderRadius: 6, fontSize: 11, display: 'flex', flexWrap: 'wrap' as const, gap: '3px 12px' }}>
                        {item.aptId && <span style={{ color: '#4DA3FF', fontWeight: 700 }}>{aptName(item.aptId)}</span>}
                        <span style={{ color: item.platforma==='airbnb' ? '#fca5a5' : '#60a5fa', fontWeight: 700 }}>{item.platforma}</span>
                        {Object.entries(item.extracted).filter(([k,v]) => v != null && !k.startsWith('detected_')).slice(0,10).map(([k,v]) => (
                          <span key={k}><span style={{ color: 'rgba(159,215,255,0.4)' }}>{k}:</span> <strong style={{ color: '#fff' }}>{String(v)}</strong></span>
                        ))}
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div style={{ marginLeft: 70, marginBottom: 6, fontSize: 11, color: '#f87171' }}>{item.errorMsg}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </>
  )
}

function AptCard({ stat, prev, name, badge }: { stat: StatRow; prev?: StatRow; name: string; badge: (p: string) => any }) {
  const isAirbnb = stat.platforma === 'airbnb'

  const primary = isAirbnb ? [
    { label: 'Afișări prima pagină', value: stat.rata_afisari_p1 != null ? `${stat.rata_afisari_p1}%` : stat.afisari_p1_total != null ? stat.afisari_p1_total.toLocaleString() : null, d: pctDelta(stat.rata_afisari_p1 ?? stat.afisari_p1_total, prev?.rata_afisari_p1 ?? prev?.afisari_p1_total) },
    { label: 'Rată ocupare', value: stat.rata_ocupare != null ? `${stat.rata_ocupare}%` : null, d: pctDelta(stat.rata_ocupare, prev?.rata_ocupare), vsv: stat.rata_ocupare_vs_similar, vsu: '%' },
    { label: 'Tarif/noapte', value: stat.tarif_mediu_noapte != null ? `${stat.tarif_mediu_noapte} RON` : null, d: pctDelta(stat.tarif_mediu_noapte, prev?.tarif_mediu_noapte), vsv: stat.tarif_vs_similar, vsu: ' RON' },
    { label: 'Conversie globală', value: stat.rata_conversie_globala != null ? `${stat.rata_conversie_globala}%` : null, d: pctDelta(stat.rata_conversie_globala, prev?.rata_conversie_globala) },
  ] : [
    { label: 'Vizualizări căutări', value: stat.vizualizari_cautari != null ? stat.vizualizari_cautari.toLocaleString() : null, d: pctDelta(stat.vizualizari_cautari, prev?.vizualizari_cautari) },
    { label: 'Poziție clasament', value: stat.scor_pozitie_rank != null ? `${stat.scor_pozitie_rank}/${stat.scor_pozitie_total} · ${stat.scor_pozitie_pct}%` : null, d: stat.scor_pozitie_rank != null && prev?.scor_pozitie_rank != null ? -(pctDelta(stat.scor_pozitie_rank, prev.scor_pozitie_rank) ?? 0) : null, inv: true },
    { label: 'Conversie pagină', value: stat.rata_conversie_pagina != null ? `${stat.rata_conversie_pagina}%` : null, d: pctDelta(stat.rata_conversie_pagina, prev?.rata_conversie_pagina) },
    { label: 'ADR', value: stat.adr != null ? `${stat.adr} RON` : null, d: pctDelta(stat.adr, prev?.adr) },
  ]

  const secondary: [string, any][] = isAirbnb ? [
    ['Nopți rez.', stat.nopti_rezervate],
    ['Nopți blocate', stat.nopti_blocate],
    ['Fără rezervare', stat.nopti_fara_rezervare],
    ['Check-in-uri', stat.checkin_uri],
    ['Rata anulări', stat.rata_anulari != null ? `${stat.rata_anulari}%` : null],
    ['Durata ședere', stat.durata_medie_sedere != null ? `${stat.durata_medie_sedere} zile` : null],
    ['Afișări pagină', stat.afisari_pagina_total?.toLocaleString()],
    ['Conv. viz→rez', stat.rata_conversie_vizite_rez != null ? `${stat.rata_conversie_vizite_rez}%` : null],
    ['Wishlist', stat.wishlist_total != null ? `${stat.wishlist_total}${stat.wishlist_vs_similar != null ? ` (${stat.wishlist_vs_similar > 0 ? '+' : ''}${stat.wishlist_vs_similar} vs. sim.)` : ''}` : null],
  ] : [
    ['Viz. pagină', stat.vizualizari_pagina?.toLocaleString()],
    ['Rezervări', stat.rezervari_confirmate],
    ['Conv. căutări', stat.rata_conversie_cautari != null ? `${stat.rata_conversie_cautari}%` : null],
    ['Rata anulări', stat.rata_anulari != null ? `${stat.rata_anulari}%` : null],
    ['Scor comentarii', stat.scor_comentarii],
    ['Completare pagină', stat.completare_pagina_pct != null ? `${stat.completare_pagina_pct}%` : null],
  ]

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)' }}>{stat.data_inregistrare}</div>
        </div>
        <span style={badge(stat.platforma)}>{stat.platforma}</span>
      </div>

      {/* Primary metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {primary.filter(m => m.value != null).map((m, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{m.value}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' as const }}>
              <DeltaBadge d={m.d} inverted={'inv' in m ? m.inv : false} />
              {m.vsv != null && <VsBadge val={m.vsv} unit={m.vsu} />}
            </div>
          </div>
        ))}
      </div>

      {/* Secondary metrics */}
      {secondary.some(([,v]) => v != null) && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, display: 'flex', flexWrap: 'wrap' as const, gap: '4px 14px' }}>
          {secondary.filter(([,v]) => v != null).map(([label, val]) => (
            <div key={String(label)} style={{ fontSize: 11, color: 'rgba(159,215,255,0.55)' }}>
              {label}: <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{String(val)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
