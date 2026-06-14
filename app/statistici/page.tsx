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
  vizualizari_cautari_30z?: number
  vizualizari_pagina_30z?: number
  rezervari_confirmate_30z?: number
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

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [cardOrder, setCardOrder] = useState<string[]>([])
  const [hiddenCards, setHiddenCards] = useState<string[]>([])

  // Evoluție
  const [evoApts, setEvoApts] = useState<string[]>([])
  const [evoPlatforma, setEvoPlatforma] = useState<Platforma>('airbnb')
  const [evoMode, setEvoMode] = useState<'grafice' | 'tabel'>('grafice')
  const [evoMetrics, setEvoMetrics] = useState<string[]>(['rata_afisari_p1', 'rata_ocupare'])

  // Upload
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [uploadDate, setUploadDate] = useState(() => new Date().toISOString().split('T')[0])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast, show } = useToast()

  useEffect(() => {
    supabase.from('apartamente').select('id,nume,nota').eq('status','activ').order('nota')
      .then(({ data }) => setApts(data || []))
    try {
      const o = localStorage.getItem('stat_card_order'); if (o) setCardOrder(JSON.parse(o))
      const h = localStorage.getItem('stat_card_hidden'); if (h) setHiddenCards(JSON.parse(h))
    } catch {}
  }, [])

  useEffect(() => { try { localStorage.setItem('stat_card_order', JSON.stringify(cardOrder)) } catch {} }, [cardOrder])
  useEffect(() => { try { localStorage.setItem('stat_card_hidden', JSON.stringify(hiddenCards)) } catch {} }, [hiddenCards])

  useEffect(() => {
    if (tab === 'dashboard' || tab === 'evolutie') loadStats()
  }, [tab])

  async function loadStats() {
    setLoading(true)
    const { data } = await supabase
      .from('statistici_platforme').select('*')
      .order('data_inregistrare', { ascending: false }).limit(3000)
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

  const allCards = useMemo(() => Object.values(pairMap).map(entries => ({ latest: entries[0], prev: entries[1] })), [pairMap])
  const cards = allCards

  // Edit helpers
  const cardKey = (s: StatRow) => `${s.apartament_id}_${s.platforma}`
  function moveCard(key: string, dir: -1 | 1) {
    setCardOrder(prev => {
      const base = allCards.map(c => cardKey(c.latest))
      const ordered = base.slice().sort((a, b) => {
        const ia = prev.indexOf(a), ib = prev.indexOf(b)
        if (ia === -1 && ib === -1) return 0; if (ia === -1) return 1; if (ib === -1) return -1
        return ia - ib
      })
      const i = ordered.indexOf(key)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= ordered.length) return prev
      const arr = [...ordered];[arr[i], arr[j]] = [arr[j], arr[i]]
      return arr
    })
  }
  function toggleHidden(key: string) {
    setHiddenCards(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

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
    let c = cards.filter(({ latest }) => !hiddenCards.includes(cardKey(latest)))
    if (filterPlatforma) c = c.filter(x => x.latest.platforma === filterPlatforma)
    if (showFilter !== 'toate') c = c.filter(({ latest, prev }) => {
      if (!prev) return false
      const d = latest.platforma === 'booking'
        ? pctDelta(latest.vizualizari_cautari, prev.vizualizari_cautari)
        : pctDelta(latest.rata_afisari_p1 ?? latest.afisari_p1_total, prev.rata_afisari_p1 ?? prev.afisari_p1_total)
      return showFilter === 'scaderi' ? (d != null && d < 0) : (d != null && d > 0)
    })
    if (cardOrder.length > 0) {
      return [...c].sort((a, b) => {
        const ia = cardOrder.indexOf(cardKey(a.latest)), ib = cardOrder.indexOf(cardKey(b.latest))
        if (ia === -1 && ib === -1) return 0; if (ia === -1) return 1; if (ib === -1) return -1
        return ia - ib
      })
    }
    return [...c].sort((a, b) => {
      if (sortBy === 'ocupare') return (b.latest.rata_ocupare || 0) - (a.latest.rata_ocupare || 0)
      if (sortBy === 'tarif') return Math.max(b.latest.tarif_mediu_noapte || 0, b.latest.adr || 0) - Math.max(a.latest.tarif_mediu_noapte || 0, a.latest.adr || 0)
      if (sortBy === 'pozitie') return (a.latest.scor_pozitie_rank || 9999) - (b.latest.scor_pozitie_rank || 9999)
      if (sortBy === 'delta') {
        const da = Math.abs(pctDelta(a.latest.vizualizari_cautari ?? a.latest.afisari_p1_total, a.prev?.vizualizari_cautari ?? a.prev?.afisari_p1_total) || 0)
        const db = Math.abs(pctDelta(b.latest.vizualizari_cautari ?? b.latest.afisari_p1_total, b.prev?.vizualizari_cautari ?? b.prev?.afisari_p1_total) || 0)
        return db - da
      }
      return Math.max(b.latest.vizualizari_cautari || 0, b.latest.afisari_p1_total || 0) - Math.max(a.latest.vizualizari_cautari || 0, a.latest.afisari_p1_total || 0)
    })
  }, [cards, filterPlatforma, showFilter, sortBy, cardOrder, hiddenCards])

  const evoDataMap = useMemo(() => {
    const map: Record<string, StatRow[]> = {}
    for (const aptId of evoApts) {
      const k = `${aptId}_${evoPlatforma}`
      map[aptId] = (pairMap[k] || []).slice().reverse()
    }
    return map
  }, [pairMap, evoApts, evoPlatforma])

  const compChartData = useMemo(() => {
    const dates = new Set<string>()
    Object.values(evoDataMap).forEach(rows => rows.forEach(r => dates.add(r.data_inregistrare)))
    return Array.from(dates).sort().map(d => {
      const obj: Record<string, any> = { data: d }
      for (const [aptId, rows] of Object.entries(evoDataMap)) {
        obj[aptId] = rows.find(r => r.data_inregistrare === d)
      }
      return obj
    })
  }, [evoDataMap])

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
    const isPDF = item.file.name.endsWith('.pdf')
    const isCSV = item.file.name.endsWith('.csv')
    // Images are always compressed to JPEG — use image/jpeg regardless of original format
    const mimeType = isPDF ? 'application/pdf' : isCSV ? 'text/csv' : 'image/jpeg'

    // Vercel hard limit ~4.5MB on request body; base64 adds 33% overhead → cap at 3MB binary
    const MAX_BYTES = 3 * 1024 * 1024
    if (isPDF && item.file.size > MAX_BYTES) {
      throw new Error(`PDF prea mare (${(item.file.size/1024/1024).toFixed(1)} MB). Exportă o singură pagină sau un interval mai scurt.`)
    }

    const base64 = await fileToBase64(item.file, MAX_BYTES)
    const res = await fetch('/api/statistici-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64Data: base64, mimeType, filename: item.file.name, aptList: apts.map(a => ({ id: a.id, name: `${a.nota} ${a.nume}` })) })
    })
    if (!res.ok) {
      if (res.status === 413) throw new Error('Fișier prea mare. Folosește o captură mai mică sau un PDF de o singură pagină.')
      const e = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(e.error || 'Eroare server')
    }
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data
  }

  async function fileToBase64(file: File, maxBytes?: number): Promise<string> {
    if (file.type.startsWith('image/')) {
      return new Promise((res, rej) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
          URL.revokeObjectURL(url)
          // Compress aggressively: max 1280px, JPEG 0.75
          const MAX = 1280
          let w = img.width, h = img.height
          if (w > MAX || h > MAX) {
            if (w > h) { h = Math.round(h * MAX / w); w = MAX }
            else { w = Math.round(w * MAX / h); h = MAX }
          }
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
          canvas.toBlob(blob => {
            if (!blob) { rej(new Error('compress failed')); return }
            if (maxBytes && blob.size > maxBytes) {
              rej(new Error(`Imaginea e prea mare după compresie (${(blob.size/1024/1024).toFixed(1)} MB). Încearcă o captură mai mică.`))
              return
            }
            const r = new FileReader()
            r.onload = () => res((r.result as string).split(',')[1])
            r.onerror = rej
            r.readAsDataURL(blob)
          }, 'image/jpeg', 0.75)
        }
        img.onerror = rej
        img.src = url
      })
    }
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
    let saved = 0, errors = 0
    for (const item of done) {
      const { detected_apt_id, detected_platforma, ...metrics } = item.extracted
      // Șterge rândul existent pentru aceeași zi (dacă există) apoi inserează fresh
      await supabase.from('statistici_platforme').delete()
        .eq('apartament_id', item.aptId).eq('platforma', item.platforma).eq('data_inregistrare', uploadDate)
      const { error } = await supabase.from('statistici_platforme').insert({
        apartament_id: item.aptId, platforma: item.platforma, data_inregistrare: uploadDate, ...metrics
      })
      if (error) { console.error('save error', error.message); errors++ } else saved++
    }
    if (errors) show('error', `${errors} erori la salvare`)
    else show('success', `✓ Salvate ${saved} înregistrări pentru ${uploadDate}`)
    setUploads([])
    await loadStats()
    setTab('dashboard')
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
              <div style={{ display:'flex', gap:8, marginLeft:'auto' }}>
                <button style={S.btn('rgba(77,163,255,0.15)')} onClick={loadStats}>🔄</button>
                <button style={S.btn(editMode ? '#4DA3FF' : 'rgba(255,255,255,0.08)')} onClick={() => setEditMode(e => !e)}>
                  ✏️ Editează
                </button>
              </div>
            </div>

            {/* Edit panel */}
            {editMode && allCards.length > 0 && (
              <div style={{ background:'rgba(15,20,35,0.95)', border:'1px solid rgba(77,163,255,0.25)', borderRadius:12, padding:16, marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#4DA3FF' }}>✏️ Configurare carduri</span>
                  <div style={{ display:'flex', gap:8 }}>
                    <button style={{ ...S.btn('rgba(255,255,255,0.06)'), fontSize:11 }}
                      onClick={() => { setCardOrder([]); setHiddenCards([]) }}>Resetează</button>
                    <button style={{ ...S.btn('#4DA3FF'), fontSize:11 }} onClick={() => setEditMode(false)}>✓ Gata</button>
                  </div>
                </div>
                <div style={{ fontSize:11, color:'rgba(159,215,255,0.4)', marginBottom:10 }}>
                  Reordonează cu ↑ ↓ · Ascunde/arată cu butonul 👁
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {[...allCards].sort((a,b) => {
                    const ia = cardOrder.indexOf(cardKey(a.latest)), ib = cardOrder.indexOf(cardKey(b.latest))
                    if(ia===-1&&ib===-1) return 0; if(ia===-1) return 1; if(ib===-1) return -1; return ia-ib
                  }).map(({ latest }, idx, arr) => {
                    const k = cardKey(latest)
                    const hidden = hiddenCards.includes(k)
                    const isAirbnb = latest.platforma === 'airbnb'
                    return (
                      <div key={k} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background: hidden ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.04)', borderRadius:8, opacity: hidden ? 0.45 : 1 }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                          <button onClick={() => moveCard(k,-1)} disabled={idx===0}
                            style={{ background:'none', border:'none', color: idx===0 ? 'rgba(255,255,255,0.15)' : 'rgba(159,215,255,0.7)', cursor: idx===0 ? 'default':'pointer', fontSize:12, lineHeight:1, padding:'1px 4px' }}>▲</button>
                          <button onClick={() => moveCard(k,1)} disabled={idx===arr.length-1}
                            style={{ background:'none', border:'none', color: idx===arr.length-1 ? 'rgba(255,255,255,0.15)' : 'rgba(159,215,255,0.7)', cursor: idx===arr.length-1 ? 'default':'pointer', fontSize:12, lineHeight:1, padding:'1px 4px' }}>▼</button>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:12, background: isAirbnb ? 'rgba(255,90,95,0.2)':'rgba(59,130,246,0.2)', color: isAirbnb ? '#fca5a5':'#93c5fd' }}>
                          {isAirbnb ? 'Airbnb':'Booking'}
                        </span>
                        <span style={{ flex:1, fontSize:12, color:'rgba(255,255,255,0.85)', fontWeight:600 }}>{aptName(latest.apartament_id)}</span>
                        <span style={{ fontSize:11, color:'rgba(159,215,255,0.35)' }}>{latest.data_inregistrare}</span>
                        <button onClick={() => toggleHidden(k)}
                          style={{ background: hidden ? 'rgba(248,113,113,0.15)':'rgba(74,222,128,0.1)', border: `1px solid ${hidden ? 'rgba(248,113,113,0.3)':'rgba(74,222,128,0.2)'}`, borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:12, color: hidden ? '#f87171':'#4ade80' }}>
                          {hidden ? '🚫 Ascuns':'👁 Vizibil'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                {filteredCards.map(({ latest, prev }) => (
                  <AptCard key={latest.id} stat={latest} prev={prev} name={aptName(latest.apartament_id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EVOLUȚIE ── */}
        {tab === 'evolutie' && (
          <div>
            {/* Panel selecție */}
            <div style={{ ...S.card, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                <button style={S.tog(evoPlatforma==='airbnb')} onClick={() => { setEvoPlatforma('airbnb'); setEvoMetrics([]) }}>🏠 Airbnb</button>
                <button style={S.tog(evoPlatforma==='booking')} onClick={() => { setEvoPlatforma('booking'); setEvoMetrics([]) }}>🔵 Booking</button>
                <div style={S.div} />
                <button style={S.tog(evoMode==='grafice')} onClick={() => setEvoMode('grafice')}>📊 Grafice</button>
                <button style={S.tog(evoMode==='tabel')} onClick={() => setEvoMode('tabel')}>📋 Tabel</button>
                {evoApts.length > 0 && (
                  <button style={{ ...S.btn('rgba(255,255,255,0.06)'), marginLeft: 'auto', fontSize: 11 }} onClick={() => setEvoApts([])}>✕ Resetează</button>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', marginBottom: 8 }}>
                Selectează locații pentru comparație ({evoApts.length} selectate):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                {apts.map((a, i) => {
                  const sel = evoApts.includes(a.id)
                  const hasData = !!pairMap[`${a.id}_${evoPlatforma}`]
                  const color = LINE_COLORS[evoApts.indexOf(a.id) % LINE_COLORS.length]
                  return (
                    <button key={a.id} style={{
                      padding: '5px 12px', borderRadius: 6, border: `1px solid ${sel ? color : 'rgba(255,255,255,0.1)'}`,
                      background: sel ? `${color}22` : 'transparent',
                      color: sel ? color : 'rgba(159,215,255,0.5)',
                      fontSize: 12, fontWeight: 600, cursor: hasData ? 'pointer' : 'default',
                      opacity: hasData ? 1 : 0.35,
                    }} onClick={() => hasData && setEvoApts(prev => prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id])}>
                      {sel && <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:color, marginRight:5 }} />}
                      [{a.nota}] {a.nume}
                    </button>
                  )
                })}
              </div>
            </div>

            {evoApts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'rgba(159,215,255,0.4)' }}>Selectează cel puțin o locație</div>
            ) : evoMode === 'grafice' ? (
              <div>
                {/* Selector metrici */}
                <div style={{ ...S.card, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', marginBottom: 8 }}>Metrici (câte un grafic per metrică):</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                    {metricOpts.map(m => (
                      <button key={m.key} style={S.tog(evoMetrics.includes(m.key))}
                        onClick={() => setEvoMetrics(p => p.includes(m.key) ? p.filter(x => x!==m.key) : [...p, m.key])}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                {evoMetrics.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'rgba(159,215,255,0.4)' }}>Selectează cel puțin o metrică</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 14 }}>
                    {evoMetrics.map(mk => {
                      const mLabel = metricOpts.find(m => m.key===mk)?.label || mk
                      const chartData = compChartData.map(d => ({
                        data: d.data,
                        ...Object.fromEntries(evoApts.map(id => [id, d[id]?.[mk] ?? null]))
                      }))
                      return (
                        <div key={mk} style={S.card}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(159,215,255,0.7)', marginBottom: 12 }}>{mLabel}</div>
                          <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                              <XAxis dataKey="data" tick={{ fontSize: 9, fill: 'rgba(159,215,255,0.5)' }} />
                              <YAxis tick={{ fontSize: 9, fill: 'rgba(159,215,255,0.5)' }} width={40} />
                              <Tooltip contentStyle={{ background: '#1a2035', border: '1px solid rgba(77,163,255,0.3)', borderRadius: 8, fontSize: 11 }}
                                formatter={(v: any, name: any) => [v != null ? Number(v).toFixed(1) : '—', aptName(String(name))]} />
                              <Legend wrapperStyle={{ fontSize: 10 }} formatter={(id: string) => aptName(id)} />
                              {evoApts.map((id, i) => (
                                <Line key={id} type="monotone" dataKey={id} stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                  strokeWidth={2} dot={{ r: 3 }} connectNulls name={id} />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* ── TABEL COMPARATIV ── */
              <div style={S.card}>
                <div style={{ overflowX: 'auto' as const }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'rgba(159,215,255,0.5)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' as const }}>Locație</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'rgba(159,215,255,0.5)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' as const }}>Data</th>
                        {metricOpts.map(m => (
                          <th key={m.key} style={{ textAlign: 'right', padding: '8px 12px', fontSize: 11, color: 'rgba(159,215,255,0.5)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' as const }}>{m.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {evoApts.map((aptId, ri) => {
                        const rows = evoDataMap[aptId] || []
                        const latest = rows[rows.length - 1]
                        const prev = rows[rows.length - 2]
                        const dotColor = LINE_COLORS[ri % LINE_COLORS.length]
                        if (!latest) return (
                          <tr key={aptId}>
                            <td style={{ padding: '8px 12px', color: '#fff', fontWeight: 700 }}>
                              <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:dotColor, marginRight:6 }} />
                              {aptName(aptId)}
                            </td>
                            <td colSpan={metricOpts.length + 1} style={{ padding: '8px 12px', color: 'rgba(159,215,255,0.3)', fontSize: 11 }}>— fără date pentru {evoPlatforma} —</td>
                          </tr>
                        )
                        return (
                          <tr key={aptId} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' as const }}>
                              <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:dotColor, marginRight:6 }} />
                              {aptName(aptId)}
                            </td>
                            <td style={{ padding: '10px 12px', color: 'rgba(159,215,255,0.4)', fontSize: 11, whiteSpace: 'nowrap' as const }}>{latest.data_inregistrare}</td>
                            {metricOpts.map(m => {
                              const val = (latest as any)[m.key]
                              const prevVal = prev ? (prev as any)[m.key] : undefined
                              const d = pctDelta(val, prevVal)
                              return (
                                <td key={m.key} style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' as const }}>
                                  {val != null ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                      <span style={{ fontWeight: 700, color: '#fff' }}>{Number(val).toFixed(1)}</span>
                                      <DeltaBadge d={d} />
                                    </div>
                                  ) : <span style={{ color: 'rgba(159,215,255,0.2)' }}>—</span>}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── UPLOAD ── */}
        {tab === 'upload' && (
          <div>
            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' as const }}>
                <div style={{ fontSize: 13, color: 'rgba(159,215,255,0.7)' }}>Data statisticilor:</div>
                <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
                  style={{ ...S.sel, fontSize: 13, fontWeight: 600, color: '#fff' }} />
                <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.35)' }}>
                  Poți uploada date pentru orice zi — istoricul se păstrează complet
                </div>
              </div>
              <div style={S.dropzone} onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                <div style={{ fontSize: 14, color: 'rgba(159,215,255,0.7)' }}>Click sau trage fișierele aici</div>
                <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.4)', marginTop: 4 }}>PNG, JPG, PDF, CSV — toate deodată</div>
              </div>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.csv" style={{ display: 'none' }}
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

interface PrimaryMetric { label: string; value: string | null; d: number | null; inv?: boolean; icon?: string }

function Delta({ d, inv = false, size = 11 }: { d: number | null; inv?: boolean; size?: number }) {
  if (d == null) return null
  if (Math.abs(d) < 0.05) return <span style={{ fontSize: size, color: 'rgba(159,215,255,0.3)' }}>—</span>
  const good = inv ? d < 0 : d > 0
  return (
    <span style={{ fontSize: size, fontWeight: 700, color: good ? '#4ade80' : '#f87171',
      background: good ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
      padding: '1px 5px', borderRadius: 4 }}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%
    </span>
  )
}

function Stat({ label, value, d, inv, sub, accent }: { label: string; value: string | null; d?: number | null; inv?: boolean; sub?: string; accent?: string }) {
  if (value == null) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent || '#fff', lineHeight: 1.1 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 16 }}>
        {d != null && <Delta d={d} inv={inv} />}
        {sub && <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.35)' }}>{sub}</span>}
      </div>
    </div>
  )
}

function MiniStat({ label, value, d, inv }: { label: string; value: string | null; d?: number | null; inv?: boolean }) {
  if (value == null) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {d != null && <Delta d={d} inv={inv} size={10} />}
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{value}</span>
      </div>
    </div>
  )
}

function AptCard({ stat, prev, name }: { stat: StatRow; prev?: StatRow; name: string }) {
  const isAirbnb = stat.platforma === 'airbnb'
  const accent = isAirbnb ? '#FF5A5F' : '#3B82F6'
  const accentBg = isAirbnb ? 'rgba(255,90,95,0.08)' : 'rgba(59,130,246,0.08)'
  const accentBorder = isAirbnb ? 'rgba(255,90,95,0.2)' : 'rgba(59,130,246,0.2)'

  const fmt = (n?: number, dec = 0) => n != null ? n.toLocaleString('ro-RO', { maximumFractionDigits: dec }) : null
  const pct = (n?: number) => n != null ? `${n}%` : null

  // Rank bar pentru Booking
  const rankPct = stat.scor_pozitie_rank != null && stat.scor_pozitie_total
    ? Math.round((1 - stat.scor_pozitie_rank / stat.scor_pozitie_total) * 100) : null

  return (
    <div style={{ background: 'rgba(15,20,35,0.8)', border: `1px solid ${accentBorder}`, borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: accentBg, borderBottom: `1px solid ${accentBorder}`, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginTop: 1 }}>{stat.data_inregistrare}{prev ? ` · prev ${prev.data_inregistrare}` : ''}</div>
        </div>
        <span style={{ marginLeft: 8, padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', background: accent, color: '#fff', whiteSpace: 'nowrap' }}>
          {isAirbnb ? '✈ Airbnb' : '🔵 Booking'}
        </span>
      </div>

      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* KPI principale — 3 coloane */}
        {isAirbnb ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px 12px' }}>
            <Stat label="Ocupare" value={pct(stat.rata_ocupare)} d={pctDelta(stat.rata_ocupare, prev?.rata_ocupare)} accent={stat.rata_ocupare != null && stat.rata_ocupare >= 80 ? '#4ade80' : undefined} />
            <Stat label="Tarif/noapte" value={stat.tarif_mediu_noapte != null ? `${stat.tarif_mediu_noapte} RON` : null} d={pctDelta(stat.tarif_mediu_noapte, prev?.tarif_mediu_noapte)} />
            <Stat label="Afișări P1" value={stat.afisari_p1_total != null ? fmt(stat.afisari_p1_total) : pct(stat.rata_afisari_p1)} d={pctDelta(stat.afisari_p1_total ?? stat.rata_afisari_p1, prev?.afisari_p1_total ?? prev?.rata_afisari_p1)} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px 12px' }}>
            <Stat label="Viz. căutări" value={fmt(stat.vizualizari_cautari)} d={pctDelta(stat.vizualizari_cautari, prev?.vizualizari_cautari)} />
            <Stat label="Rezervări" value={fmt(stat.rezervari_confirmate)} d={pctDelta(stat.rezervari_confirmate, prev?.rezervari_confirmate)} />
            <Stat label="ADR" value={stat.adr != null ? `${stat.adr} RON` : null} d={pctDelta(stat.adr, prev?.adr)} />
          </div>
        )}

        {/* Clasament Booking cu bară vizuală */}
        {!isAirbnb && stat.scor_pozitie_rank != null && (
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>Poziție clasament</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {prev?.scor_pozitie_rank != null && <Delta d={-(pctDelta(stat.scor_pozitie_rank, prev.scor_pozitie_rank) ?? 0)} size={10} />}
                <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                  {stat.scor_pozitie_rank}<span style={{ color: 'rgba(159,215,255,0.35)', fontWeight: 400 }}>/{stat.scor_pozitie_total}</span>
                </span>
                {stat.scor_pozitie_pct != null && (
                  <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>top {100 - stat.scor_pozitie_pct}%</span>
                )}
              </div>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${rankPct}%`, background: rankPct != null && rankPct > 60 ? '#4ade80' : rankPct != null && rankPct > 30 ? '#fbbf24' : '#f87171', borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
          </div>
        )}

        {/* Metrici secundare */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {isAirbnb ? (<>
            <MiniStat label="Conversie globală" value={pct(stat.rata_conversie_globala)} d={pctDelta(stat.rata_conversie_globala, prev?.rata_conversie_globala)} />
            <MiniStat label="Conv. vizite → rez." value={pct(stat.rata_conversie_vizite_rez)} d={pctDelta(stat.rata_conversie_vizite_rez, prev?.rata_conversie_vizite_rez)} />
            <MiniStat label="Afișări pagină" value={fmt(stat.afisari_pagina_total)} d={pctDelta(stat.afisari_pagina_total, prev?.afisari_pagina_total)} />
            <MiniStat label="Wishlist" value={stat.wishlist_total != null ? `${stat.wishlist_total}${stat.wishlist_vs_similar != null ? ` (${stat.wishlist_vs_similar > 0 ? '+' : ''}${stat.wishlist_vs_similar})` : ''}` : null} d={pctDelta(stat.wishlist_total, prev?.wishlist_total)} />
            <MiniStat label="Durata ședere" value={stat.durata_medie_sedere != null ? `${stat.durata_medie_sedere} zile` : null} />
            <MiniStat label="Rată anulări" value={pct(stat.rata_anulari)} inv />
          </>) : (<>
            <MiniStat label="Viz. pagină (90z)" value={fmt(stat.vizualizari_pagina)} d={pctDelta(stat.vizualizari_pagina, prev?.vizualizari_pagina)} />
            <MiniStat label="Conv. căutări → viz." value={stat.rata_conversie_cautari != null ? `${stat.rata_conversie_cautari}%` : null} d={pctDelta(stat.rata_conversie_cautari, prev?.rata_conversie_cautari)} />
            <MiniStat label="Conv. viz. → rez." value={stat.rata_conversie_pagina != null ? `${stat.rata_conversie_pagina}%` : null} d={pctDelta(stat.rata_conversie_pagina, prev?.rata_conversie_pagina)} />
            <MiniStat label="Scor comentarii" value={stat.scor_comentarii != null ? `${stat.scor_comentarii}/10` : null} d={pctDelta(stat.scor_comentarii, prev?.scor_comentarii)} />
            <MiniStat label="Completare pagină" value={pct(stat.completare_pagina_pct)} />
            <MiniStat label="Rată anulări" value={pct(stat.rata_anulari)} inv />
          </>)}
        </div>

        {/* 30-day strip pentru Booking */}
        {!isAirbnb && (stat.vizualizari_cautari_30z != null || stat.rezervari_confirmate_30z != null) && (
          <div style={{ marginTop: 2, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)', borderRadius: 8, padding: '7px 10px' }}>
            <div style={{ fontSize: 9, color: 'rgba(59,130,246,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: 5 }}>Ultimele 30 zile</div>
            <div style={{ display: 'flex', gap: 14 }}>
              {stat.vizualizari_cautari_30z != null && (
                <div><div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)' }}>Căutări</div><div style={{ fontSize: 13, fontWeight: 700, color: '#93c5fd' }}>{fmt(stat.vizualizari_cautari_30z)}</div></div>
              )}
              {stat.vizualizari_pagina_30z != null && (
                <div><div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)' }}>Viz. pagină</div><div style={{ fontSize: 13, fontWeight: 700, color: '#93c5fd' }}>{fmt(stat.vizualizari_pagina_30z)}</div></div>
              )}
              {stat.rezervari_confirmate_30z != null && (
                <div><div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)' }}>Rezervări</div><div style={{ fontSize: 13, fontWeight: 700, color: '#93c5fd' }}>{stat.rezervari_confirmate_30z}</div></div>
              )}
            </div>
          </div>
        )}

        {/* Nopți strip pentru Airbnb */}
        {isAirbnb && (stat.nopti_rezervate != null || stat.nopti_blocate != null) && (
          <div style={{ background: 'rgba(255,90,95,0.05)', border: '1px solid rgba(255,90,95,0.12)', borderRadius: 8, padding: '7px 10px' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,90,95,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: 5 }}>Nopți perioadă</div>
            <div style={{ display: 'flex', gap: 14 }}>
              {stat.nopti_rezervate != null && <div><div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)' }}>Rezervate</div><div style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>{stat.nopti_rezervate}</div></div>}
              {stat.nopti_blocate != null && <div><div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)' }}>Blocate</div><div style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>{stat.nopti_blocate}</div></div>}
              {stat.nopti_fara_rezervare != null && <div><div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)' }}>Libere</div><div style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>{stat.nopti_fara_rezervare}</div></div>}
              {stat.checkin_uri != null && <div><div style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)' }}>Check-in</div><div style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>{stat.checkin_uri}</div></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
