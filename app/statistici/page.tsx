'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type Platforma = 'booking' | 'airbnb'
type Tab = 'upload' | 'azi' | 'evolutie' | 'comparatie'

interface Apt { id: string; nume: string; nota: string }
interface StatRow {
  id: string
  apartament_id: string
  platforma: string
  data_inregistrare: string
  scor_comentarii: number
  vizualizari_cautari: number
  vizualizari_pagina: number
  rata_conversie_cautari: number
  rata_conversie_pagina: number
  rezervari_confirmate: number
  scor_pozitie_text: string
  rata_anulari: number
  adr: number
  innoptari: number
  venituri_ron: number
  completare_pagina: number
  rata_ocupare: number
  nopti_rezervate: number
  nopti_blocate: number
  tarif_mediu_noapte: number
  wishlist_total: number
  scor_5stele: number
  scor_acuratete: number
  scor_checkin: number
  scor_curatenie: number
  scor_comunicare: number
  scor_pozitie: number
  scor_valoare: number
  rata_conversie_globala: number
  rata_afisari_p1: number
  raw_extras: any
}

interface UploadItem {
  id: string
  file: File
  aptId: string
  platforma: Platforma
  status: 'pending' | 'processing' | 'done' | 'error'
  extracted: Partial<StatRow> | null
  errorMsg?: string
  preview?: string
}

export default function StatisticiPage() {
  const [apts, setApts] = useState<Apt[]>([])
  const [tab, setTab] = useState<Tab>('upload')
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [stats, setStats] = useState<StatRow[]>([])
  const [loadingStats, setLoadingStats] = useState(false)
  const [filterApt, setFilterApt] = useState('')
  const [filterPlatforma, setFilterPlatforma] = useState<Platforma | ''>('')
  const [evolutieMetrica, setEvolutieMetrica] = useState('rata_ocupare')
  const [evolutieApt, setEvolutieApt] = useState('')
  const [evolutiePlatforma, setEvolutiePlatforma] = useState<Platforma>('airbnb')
  const [evolutieData, setEvolutieData] = useState<any[]>([])
  const { toast, show } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('apartamente').select('id,nume,nota').eq('status','activ').order('nota')
      .then(({ data }) => setApts(data || []))
  }, [])

  useEffect(() => {
    if (tab === 'azi' || tab === 'comparatie') loadStats()
  }, [tab, filterApt, filterPlatforma])

  useEffect(() => {
    if (tab === 'evolutie' && evolutieApt) loadEvolutie()
  }, [tab, evolutieApt, evolutiePlatforma, evolutieMetrica])

  async function loadStats() {
    setLoadingStats(true)
    let q = supabase.from('statistici_platforme').select('*').order('data_inregistrare', { ascending: false })
    if (filterApt) q = q.eq('apartament_id', filterApt)
    if (filterPlatforma) q = q.eq('platforma', filterPlatforma)
    const { data } = await q.limit(200)
    setStats(data || [])
    setLoadingStats(false)
  }

  async function loadEvolutie() {
    const { data } = await supabase.from('statistici_platforme')
      .select('*')
      .eq('apartament_id', evolutieApt)
      .eq('platforma', evolutiePlatforma)
      .order('data_inregistrare', { ascending: true })
      .limit(90)
    setEvolutieData(data || [])
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    const newItems: UploadItem[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      aptId: apts[0]?.id || '',
      platforma: 'airbnb' as Platforma,
      status: 'pending' as const,
      extracted: null,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }))
    // CSV hint
    Array.from(files).forEach(f => { if(f.name.endsWith('.csv')) console.log('CSV detected:', f.name) })
    setUploads(prev => [...prev, ...newItems])
  }

  function updateUpload(id: string, changes: Partial<UploadItem>) {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...changes } : u))
  }

  async function processAll() {
    const pending = uploads.filter(u => u.status === 'pending' && u.aptId)
    if (!pending.length) { show('error', 'Nu există fișiere de procesat'); return }
    setProcessing(true)
    for (const item of pending) {
      updateUpload(item.id, { status: 'processing' })
      try {
        const extracted = await extractWithAI(item)
        updateUpload(item.id, { status: 'done', extracted })
      } catch (e: any) {
        updateUpload(item.id, { status: 'error', errorMsg: e.message })
      }
    }
    setProcessing(false)
    show('success', `Procesate ${pending.length} fișiere`)
  }

  async function extractWithAI(item: UploadItem): Promise<Partial<StatRow>> {
    const base64 = await fileToBase64(item.file)
    const apt = apts.find(a => a.id === item.aptId)
    const res = await fetch('/api/statistici-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: base64,
        mimeType: item.file.type || (item.file.name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream'),
        filename: item.file.name,
        platforma: item.platforma,
        aptNume: apt ? apt.nota + ' ' + apt.nume : 'necunoscut'
      })
    })
    const data = await res.json()
    if(data.error) throw new Error(data.error)
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
    const done = uploads.filter(u => u.status === 'done' && u.extracted)
    if (!done.length) { show('error', 'Nu există date extrase de salvat'); return }
    let saved = 0
    for (const item of done) {
      const row = {
        apartament_id: item.aptId,
        platforma: item.platforma,
        data_inregistrare: new Date().toISOString().split('T')[0],
        ...item.extracted
      }
      const { error } = await supabase.from('statistici_platforme').insert(row)
      if (!error) saved++
    }
    show('success', `Salvate ${saved}/${done.length} înregistrări`)
    setUploads([])
    if (tab === 'azi') loadStats()
  }

  function removeUpload(id: string) {
    setUploads(prev => prev.filter(u => u.id !== id))
  }

  const aptName = (id: string) => {
    const a = apts.find(x => x.id === id)
    return a ? `[${a.nota}] ${a.nume}` : id
  }

  // Latest stats per apt per platform
  const latestStats = (() => {
    const map: Record<string, StatRow> = {}
    stats.forEach(s => {
      const key = `${s.apartament_id}_${s.platforma}`
      if (!map[key]) map[key] = s
    })
    return Object.values(map)
  })()

  const delta = (current: number | null | undefined, prev: number | null | undefined) => {
    if (current == null || prev == null) return null
    return current - prev
  }

  const fmtDelta = (d: number | null, pct = false) => {
    if (d == null) return null
    const sign = d > 0 ? '+' : ''
    return `${sign}${d.toFixed(1)}${pct ? '%' : ''}`
  }

  const metricOptions = [
    { value: 'rata_ocupare', label: 'Rată ocupare (%)' },
    { value: 'tarif_mediu_noapte', label: 'Tarif mediu noapte (RON)' },
    { value: 'adr', label: 'ADR Booking (RON)' },
    { value: 'rata_conversie_globala', label: 'Conversie globală (%)' },
    { value: 'rata_conversie_pagina', label: 'Conversie pagină→rezervare (%)' },
    { value: 'vizualizari_cautari', label: 'Vizualizări căutări' },
    { value: 'vizualizari_pagina', label: 'Vizualizări pagină' },
    { value: 'scor_comentarii', label: 'Scor comentarii' },
    { value: 'scor_5stele', label: 'Scor 5 stele Airbnb (%)' },
    { value: 'wishlist_total', label: 'Wishlist-uri' },
    { value: 'innoptari', label: 'Înnoptări' },
    { value: 'venituri_ron', label: 'Venituri RON' },
  ]

  const s = { // styles
    page: { padding: '20px', maxWidth: 1400, margin: '0 auto' },
    tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 0 },
    tab: (active: boolean) => ({
      padding: '8px 16px', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 13, fontWeight: 600,
      background: active ? 'rgba(77,163,255,0.15)' : 'transparent',
      color: active ? '#4DA3FF' : 'rgba(159,215,255,0.5)',
      border: 'none', borderBottom: active ? '2px solid #4DA3FF' : '2px solid transparent',
      transition: 'all 0.15s'
    }),
    card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, marginBottom: 12 },
    label: { fontSize: 11, color: 'rgba(159,215,255,0.5)', marginBottom: 4 },
    value: { fontSize: 22, fontWeight: 700, color: '#fff' },
    subvalue: { fontSize: 12, color: 'rgba(159,215,255,0.6)' },
    select: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 13 },
    btn: (color: string) => ({ padding: '8px 18px', borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }),
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 },
    metricCard: (color: string) => ({ background: `rgba(${color},0.08)`, border: `1px solid rgba(${color},0.2)`, borderRadius: 10, padding: '12px 14px' }),
    deltaPos: { fontSize: 11, color: '#4ade80', fontWeight: 600 },
    deltaNeg: { fontSize: 11, color: '#f87171', fontWeight: 600 },
    badge: (p: string) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: p === 'booking' ? 'rgba(0,82,204,0.3)' : 'rgba(255,90,90,0.2)', color: p === 'booking' ? '#60a5fa' : '#fca5a5' }),
    dropzone: { border: '2px dashed rgba(77,163,255,0.3)', borderRadius: 12, padding: '40px 20px', textAlign: 'center' as const, cursor: 'pointer', transition: 'all 0.2s' },
    uploadRow: { display: 'grid', gridTemplateColumns: '60px 1fr 160px 130px 80px', gap: 10, alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 6 },
  }

  return (
    <>
      <PageHeader title="Statistici Platforme" subtitle="Booking.com & Airbnb — evoluție și comparații" />
      <div style={s.page}>
        <div style={s.tabs}>
          {([['upload','📤 Upload'], ['azi','📊 Azi'], ['evolutie','📈 Evoluție'], ['comparatie','🔀 Comparație']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>

        {/* ── UPLOAD TAB ── */}
        {tab === 'upload' && (
          <div>
            <div style={s.card}>
              <div style={{ marginBottom: 12, fontSize: 13, color: 'rgba(159,215,255,0.7)' }}>
                Încarcă screenshot-uri sau PDF-uri din Booking / Airbnb. Poți adăuga mai multe fișiere odată.
              </div>
              <div
                style={s.dropzone}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                <div style={{ fontSize: 14, color: 'rgba(159,215,255,0.7)' }}>Click sau trage fișierele aici</div>
                <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.4)', marginTop: 4 }}>PNG, JPG, PDF — multiple fișiere acceptate</div>
              </div>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.csv" style={{ display: 'none' }}
                onChange={e => handleFiles(e.target.files)} />
            </div>

            {uploads.length > 0 && (
              <div style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{uploads.length} fișiere</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={s.btn('#4DA3FF')} onClick={processAll} disabled={processing}>
                      {processing ? '⏳ Procesez...' : '🤖 Extrage date AI'}
                    </button>
                    <button style={s.btn('#22c55e')} onClick={saveAll}>💾 Salvează tot</button>
                    <button style={{ ...s.btn('rgba(255,255,255,0.1)') }} onClick={() => setUploads([])}>🗑 Șterge tot</button>
                  </div>
                </div>

                {/* Header */}
                <div style={{ ...s.uploadRow, background: 'transparent', color: 'rgba(159,215,255,0.5)', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                  <span>Preview</span><span>Fișier</span><span>Apartament</span><span>Platformă</span><span>Status</span>
                </div>

                {uploads.map(item => (
                  <div key={item.id}>
                    <div style={s.uploadRow}>
                      {/* Preview */}
                      <div>
                        {item.preview
                          ? <img src={item.preview} style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                          : <div style={{ width: 56, height: 40, background: 'rgba(255,255,255,0.06)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📄</div>
                        }
                      </div>
                      {/* Filename */}
                      <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.file.name}
                      </div>
                      {/* Apt select */}
                      <select style={s.select} value={item.aptId} onChange={e => updateUpload(item.id, { aptId: e.target.value })}>
                        <option value="">— Selectează —</option>
                        {apts.map(a => <option key={a.id} value={a.id}>[{a.nota}] {a.nume}</option>)}
                      </select>
                      {/* Platform select */}
                      <select style={s.select} value={item.platforma} onChange={e => updateUpload(item.id, { platforma: e.target.value as Platforma })}>
                        <option value="airbnb">Airbnb</option>
                        <option value="booking">Booking</option>
                      </select>
                      {/* Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: item.status === 'done' ? '#4ade80' : item.status === 'error' ? '#f87171' : item.status === 'processing' ? '#fbbf24' : 'rgba(159,215,255,0.5)' }}>
                          {item.status === 'done' ? '✓ Gata' : item.status === 'error' ? '✗ Eroare' : item.status === 'processing' ? '⏳' : '—'}
                        </span>
                        <button onClick={() => removeUpload(item.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                      </div>
                    </div>
                    {/* Extracted preview */}
                    {item.status === 'done' && item.extracted && (
                      <div style={{ marginLeft: 70, marginBottom: 8, padding: '8px 12px', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 8, fontSize: 11, color: 'rgba(159,215,255,0.7)', display: 'flex', flexWrap: 'wrap' as const, gap: '4px 16px' }}>
                        {Object.entries(item.extracted).filter(([,v]) => v != null).map(([k, v]) => (
                          <span key={k}><span style={{ color: 'rgba(159,215,255,0.4)' }}>{k}:</span> <strong style={{ color: '#fff' }}>{String(v)}</strong></span>
                        ))}
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div style={{ marginLeft: 70, marginBottom: 8, fontSize: 11, color: '#f87171' }}>{item.errorMsg}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AZI TAB ── */}
        {tab === 'azi' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const }}>
              <select style={s.select} value={filterPlatforma} onChange={e => setFilterPlatforma(e.target.value as any)}>
                <option value="">Toate platformele</option>
                <option value="airbnb">Airbnb</option>
                <option value="booking">Booking</option>
              </select>
              <select style={s.select} value={filterApt} onChange={e => setFilterApt(e.target.value)}>
                <option value="">Toate apartamentele</option>
                {apts.map(a => <option key={a.id} value={a.id}>[{a.nota}] {a.nume}</option>)}
              </select>
              <button style={s.btn('rgba(77,163,255,0.2)')} onClick={loadStats}>🔄 Refresh</button>
            </div>

            {loadingStats ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(159,215,255,0.5)' }}>Se încarcă...</div>
            ) : latestStats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(159,215,255,0.5)' }}>
                Nu există date. Mergi la tab-ul Upload pentru a adăuga statistici.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
                {latestStats.map(stat => {
                  const apt = apts.find(a => a.id === stat.apartament_id)
                  // find previous entry for delta
                  const prev = stats.find(s => s.apartament_id === stat.apartament_id && s.platforma === stat.platforma && s.id !== stat.id)
                  return (
                    <div key={stat.id} style={s.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>
                            {apt ? `[${apt.nota}] ${apt.nume}` : stat.apartament_id}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>{stat.data_inregistrare}</div>
                        </div>
                        <span style={s.badge(stat.platforma)}>{stat.platforma}</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {stat.platforma === 'airbnb' && <>
                          {stat.rata_ocupare != null && <MetricBox label="Rată ocupare" value={`${stat.rata_ocupare}%`} delta={fmtDelta(delta(stat.rata_ocupare, prev?.rata_ocupare), true)} />}
                          {stat.tarif_mediu_noapte != null && <MetricBox label="Tarif/noapte" value={`${stat.tarif_mediu_noapte} RON`} delta={fmtDelta(delta(stat.tarif_mediu_noapte, prev?.tarif_mediu_noapte))} />}
                          {stat.rata_conversie_globala != null && <MetricBox label="Conversie globală" value={`${stat.rata_conversie_globala}%`} delta={fmtDelta(delta(stat.rata_conversie_globala, prev?.rata_conversie_globala), true)} />}
                          {stat.scor_5stele != null && <MetricBox label="Scor 5 stele" value={`${stat.scor_5stele}%`} delta={fmtDelta(delta(stat.scor_5stele, prev?.scor_5stele), true)} />}
                          {stat.wishlist_total != null && <MetricBox label="Wishlist-uri" value={String(stat.wishlist_total)} delta={fmtDelta(delta(stat.wishlist_total, prev?.wishlist_total))} />}
                          {stat.rata_afisari_p1 != null && <MetricBox label="Afișări pag.1" value={`${stat.rata_afisari_p1}%`} delta={fmtDelta(delta(stat.rata_afisari_p1, prev?.rata_afisari_p1), true)} />}
                        </>}
                        {stat.platforma === 'booking' && <>
                          {stat.vizualizari_cautari != null && <MetricBox label="Vizualizări căutări" value={stat.vizualizari_cautari.toLocaleString()} delta={fmtDelta(delta(stat.vizualizari_cautari, prev?.vizualizari_cautari))} />}
                          {stat.vizualizari_pagina != null && <MetricBox label="Vizualizări pagină" value={stat.vizualizari_pagina.toLocaleString()} delta={fmtDelta(delta(stat.vizualizari_pagina, prev?.vizualizari_pagina))} />}
                          {stat.rata_conversie_pagina != null && <MetricBox label="Conversie pagină" value={`${stat.rata_conversie_pagina}%`} delta={fmtDelta(delta(stat.rata_conversie_pagina, prev?.rata_conversie_pagina), true)} />}
                          {stat.adr != null && <MetricBox label="ADR" value={`${stat.adr} RON`} delta={fmtDelta(delta(stat.adr, prev?.adr))} />}
                          {stat.rata_anulari != null && <MetricBox label="Rata anulări" value={`${stat.rata_anulari}%`} delta={fmtDelta(delta(stat.rata_anulari, prev?.rata_anulari), true)} inverted />}
                          {stat.scor_comentarii != null && <MetricBox label="Scor comentarii" value={String(stat.scor_comentarii)} delta={fmtDelta(delta(stat.scor_comentarii, prev?.scor_comentarii))} />}
                          {stat.scor_pozitie_text && <MetricBox label="Poziție căutări" value={stat.scor_pozitie_text} delta={null} />}
                          {stat.rezervari_confirmate != null && <MetricBox label="Rezervări" value={String(stat.rezervari_confirmate)} delta={fmtDelta(delta(stat.rezervari_confirmate, prev?.rezervari_confirmate))} />}
                        </>}
                      </div>

                      {/* Airbnb subcategory scores */}
                      {stat.platforma === 'airbnb' && (stat.scor_curatenie || stat.scor_comunicare || stat.scor_checkin || stat.scor_acuratete) && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                          {[
                            ['Curățenie', stat.scor_curatenie],
                            ['Comunicare', stat.scor_comunicare],
                            ['Check-in', stat.scor_checkin],
                            ['Acuratețe', stat.scor_acuratete],
                            ['Poziție', stat.scor_pozitie],
                            ['Valoare', stat.scor_valoare],
                          ].filter(([,v]) => v != null).map(([label, val]) => (
                            <div key={String(label)} style={{ fontSize: 11, color: 'rgba(159,215,255,0.6)' }}>
                              {label}: <strong style={{ color: '#fff' }}>{val}%</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── EVOLUTIE TAB ── */}
        {tab === 'evolutie' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <select style={s.select} value={evolutieApt} onChange={e => setEvolutieApt(e.target.value)}>
                <option value="">— Selectează apartament —</option>
                {apts.map(a => <option key={a.id} value={a.id}>[{a.nota}] {a.nume}</option>)}
              </select>
              <select style={s.select} value={evolutiePlatforma} onChange={e => setEvolutiePlatforma(e.target.value as Platforma)}>
                <option value="airbnb">Airbnb</option>
                <option value="booking">Booking</option>
              </select>
              <select style={s.select} value={evolutieMetrica} onChange={e => setEvolutieMetrica(e.target.value)}>
                {metricOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            {!evolutieApt ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'rgba(159,215,255,0.4)' }}>Selectează un apartament</div>
            ) : evolutieData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'rgba(159,215,255,0.4)' }}>Nu există date pentru acest apartament / platformă</div>
            ) : (
              <div style={s.card}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 16 }}>
                  {aptName(evolutieApt)} — {metricOptions.find(m => m.value === evolutieMetrica)?.label}
                  <span style={{ marginLeft: 8, ...s.badge(evolutiePlatforma) }}>{evolutiePlatforma}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={evolutieData.map(d => ({ data: d.data_inregistrare, valoare: d[evolutieMetrica] }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="data" tick={{ fontSize: 11, fill: 'rgba(159,215,255,0.5)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'rgba(159,215,255,0.5)' }} />
                    <Tooltip contentStyle={{ background: '#1a2035', border: '1px solid rgba(77,163,255,0.3)', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="valoare" stroke="#4DA3FF" strokeWidth={2} dot={{ r: 4, fill: '#4DA3FF' }} name={metricOptions.find(m => m.value === evolutieMetrica)?.label} />
                  </LineChart>
                </ResponsiveContainer>

                {/* Summary stats */}
                <div style={{ display: 'flex', gap: 20, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {(() => {
                    const vals = evolutieData.map(d => d[evolutieMetrica]).filter(v => v != null)
                    if (!vals.length) return null
                    const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length
                    const min = Math.min(...vals)
                    const max = Math.max(...vals)
                    const last = vals[vals.length - 1]
                    const first = vals[0]
                    const trend = last - first
                    return <>
                      <div><div style={s.label}>Medie</div><div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{avg.toFixed(1)}</div></div>
                      <div><div style={s.label}>Min</div><div style={{ fontSize: 16, fontWeight: 700, color: '#f87171' }}>{min.toFixed(1)}</div></div>
                      <div><div style={s.label}>Max</div><div style={{ fontSize: 16, fontWeight: 700, color: '#4ade80' }}>{max.toFixed(1)}</div></div>
                      <div><div style={s.label}>Trend total</div><div style={{ fontSize: 16, fontWeight: 700, color: trend >= 0 ? '#4ade80' : '#f87171' }}>{trend >= 0 ? '+' : ''}{trend.toFixed(1)}</div></div>
                    </>
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── COMPARATIE TAB ── */}
        {tab === 'comparatie' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <select style={s.select} value={filterPlatforma} onChange={e => setFilterPlatforma(e.target.value as any)}>
                <option value="">Toate platformele</option>
                <option value="airbnb">Airbnb</option>
                <option value="booking">Booking</option>
              </select>
              <button style={s.btn('rgba(77,163,255,0.2)')} onClick={loadStats}>🔄 Refresh</button>
            </div>

            {loadingStats ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(159,215,255,0.5)' }}>Se încarcă...</div>
            ) : (
              <div style={{ overflowX: 'auto' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <th style={{ textAlign: 'left' as const, padding: '8px 10px', color: 'rgba(159,215,255,0.6)', fontWeight: 600, whiteSpace: 'nowrap' as const }}>Apartament</th>
                      <th style={{ textAlign: 'left' as const, padding: '8px 10px', color: 'rgba(159,215,255,0.6)', fontWeight: 600 }}>Platformă</th>
                      <th style={{ textAlign: 'right' as const, padding: '8px 10px', color: 'rgba(159,215,255,0.6)', fontWeight: 600 }}>Ocupare %</th>
                      <th style={{ textAlign: 'right' as const, padding: '8px 10px', color: 'rgba(159,215,255,0.6)', fontWeight: 600 }}>Tarif/noapte</th>
                      <th style={{ textAlign: 'right' as const, padding: '8px 10px', color: 'rgba(159,215,255,0.6)', fontWeight: 600 }}>Conversie %</th>
                      <th style={{ textAlign: 'right' as const, padding: '8px 10px', color: 'rgba(159,215,255,0.6)', fontWeight: 600 }}>Vizualizări</th>
                      <th style={{ textAlign: 'right' as const, padding: '8px 10px', color: 'rgba(159,215,255,0.6)', fontWeight: 600 }}>Rezervări</th>
                      <th style={{ textAlign: 'right' as const, padding: '8px 10px', color: 'rgba(159,215,255,0.6)', fontWeight: 600 }}>Scor</th>
                      <th style={{ textAlign: 'right' as const, padding: '8px 10px', color: 'rgba(159,215,255,0.6)', fontWeight: 600 }}>Dată</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestStats
                      .filter(s => !filterPlatforma || s.platforma === filterPlatforma)
                      .sort((a, b) => (b.rata_ocupare || 0) - (a.rata_ocupare || 0))
                      .map((stat, i) => {
                        const apt = apts.find(a => a.id === stat.apartament_id)
                        return (
                          <tr key={stat.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                            <td style={{ padding: '8px 10px', color: '#fff', fontWeight: 600 }}>
                              {apt ? `[${apt.nota}]` : ''} {apt?.nume || stat.apartament_id}
                            </td>
                            <td style={{ padding: '8px 10px' }}><span style={s.badge(stat.platforma)}>{stat.platforma}</span></td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: stat.rata_ocupare != null ? (stat.rata_ocupare > 70 ? '#4ade80' : stat.rata_ocupare > 40 ? '#fbbf24' : '#f87171') : 'rgba(159,215,255,0.3)' }}>
                              {stat.rata_ocupare != null ? `${stat.rata_ocupare}%` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: '#fff' }}>
                              {stat.tarif_mediu_noapte != null ? `${stat.tarif_mediu_noapte} RON` : stat.adr != null ? `${stat.adr} RON` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: 'rgba(159,215,255,0.8)' }}>
                              {stat.rata_conversie_globala != null ? `${stat.rata_conversie_globala}%` : stat.rata_conversie_pagina != null ? `${stat.rata_conversie_pagina}%` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: 'rgba(159,215,255,0.8)' }}>
                              {stat.vizualizari_cautari != null ? stat.vizualizari_cautari.toLocaleString() : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: 'rgba(159,215,255,0.8)' }}>
                              {stat.rezervari_confirmate != null ? stat.rezervari_confirmate : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: '#fbbf24' }}>
                              {stat.scor_comentarii != null ? stat.scor_comentarii : stat.scor_5stele != null ? `${stat.scor_5stele}%` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: 'rgba(159,215,255,0.5)', fontSize: 11 }}>
                              {stat.data_inregistrare}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </>
  )
}

function MetricBox({ label, value, delta, inverted = false }: { label: string; value: string; delta: string | null; inverted?: boolean }) {
  const isPos = delta && delta.startsWith('+')
  const isNeg = delta && delta.startsWith('-')
  const goodColor = inverted ? '#f87171' : '#4ade80'
  const badColor = inverted ? '#4ade80' : '#f87171'
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.45)', marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{value}</div>
      {delta && (
        <div style={{ fontSize: 11, fontWeight: 600, color: isPos ? goodColor : isNeg ? badColor : 'rgba(159,215,255,0.5)' }}>
          {delta}
        </div>
      )}
    </div>
  )
}
