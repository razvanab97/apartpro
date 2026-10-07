'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { CANALE_LABEL, STATUS_REZERVARE_LABEL, STATUS_PLATA_LABEL, STATUS_DECONT_LABEL, STATUS_FACTURARE_LABEL, numVal, numInput, type Apartament } from '@/lib/supabase'
import { X, Minus, Plus, Hash, ChevronDown, FileText, ExternalLink, Loader2, Moon, AlertTriangle } from 'lucide-react'

// Formularul de rezervare (nou/editare). A doua refacere, la cerere ("in continuare e greu de lucrat"):
// pe desktop doua coloane - stanga ce se completeaza (rezervare, oaspete, cod platforma, observatii),
// dreapta un panou fix cu banii, decontul, statusurile si factura, ca totul sa se vada fara derulare.
// Campurile rar folosite (comision platforma, costuri operationale) sunt un singur rand cu totalul,
// deschis doar la nevoie. Pe telefon coloanele se aseaza una sub alta.

type Props = {
  open: boolean
  editing: any
  setEditing: (fn: any) => void
  apartamente: Apartament[]
  onAptChange: (aptId: string) => void
  recalcComisionPlatforma: (brut: number | '', pct: number | '') => void
  calcul: { baza: number; comision: number; suma_proprietar: number } | null
  saving: boolean
  onSave: () => void
  onClose: () => void
  onReload?: () => void
  // Actiuni specifice paginii care deschide formularul (ex. calendarul: mesaje WhatsApp, anulare),
  // primesc rezervarea asa cum e in formular in acel moment
  extra?: (editing: any) => ReactNode
}

const C = {
  text: '#EAF4FF',
  text2: 'rgba(214,228,244,0.75)',
  muted: 'rgba(159,215,255,0.5)',
  faint: 'rgba(159,215,255,0.32)',
  line: 'rgba(159,215,255,0.1)',
  aside: 'rgba(6,14,26,0.55)',
  blue: '#7BC8FF',
  green: '#4ADE80',
  red: '#F87171',
  amber: '#FCD34D',
}

const TONE: Record<string, { c: string; bg: string; b: string }> = {
  green: { c: '#4ADE80', bg: 'rgba(34,197,94,0.16)', b: 'rgba(34,197,94,0.45)' },
  amber: { c: '#FCD34D', bg: 'rgba(245,158,11,0.16)', b: 'rgba(245,158,11,0.45)' },
  red: { c: '#F87171', bg: 'rgba(239,68,68,0.16)', b: 'rgba(239,68,68,0.45)' },
  blue: { c: '#7BC8FF', bg: 'rgba(77,163,255,0.18)', b: 'rgba(77,163,255,0.5)' },
  gray: { c: '#CBD5E1', bg: 'rgba(148,163,184,0.16)', b: 'rgba(148,163,184,0.45)' },
}
const TON_REZ: Record<string, string> = { cerere: 'amber', confirmata: 'green', anulata: 'red', finalizata: 'blue' }
const TON_PLATA: Record<string, string> = { neplatit: 'red', avans: 'amber', achitat: 'green' }
const TON_DECONT: Record<string, string> = { nedecontat: 'gray', inclus: 'amber', decontat: 'green' }
const TON_FACT: Record<string, string> = { nefacturat: 'gray', de_facturat: 'amber', facturata: 'green' }

// Eticheta/placeholder pentru codul rezervarii, dupa canal - numarul de la platforma (nu ID-ul 5starDesk)
const COD_CANAL: Record<string, { label: string; ph: string }> = {
  airbnb: { label: 'Cod rezervare Airbnb', ph: 'HMXXXXXXXX' },
  booking: { label: 'Nr. rezervare Booking', ph: '6012345678' },
}

const COSTURI: [string, string][] = [
  ['cost_curatenie', 'Curățenie'], ['cost_spalatorie', 'Spălătorie'], ['cost_consumabile', 'Consumabile'],
  ['cost_mentenanta', 'Mentenanță'], ['alte_costuri', 'Alte costuri'],
]

const fmt = (n: number) => (Number(n) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtZi = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }) : '—'

function Label({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
      <span className="rz-lbl">{children}</span>
      {right}
    </div>
  )
}

function Group({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <div style={{ paddingTop: first ? 0 : 18, marginTop: first ? 0 : 18, borderTop: first ? 'none' : `1px solid ${C.line}` }}>
      <div className="rz-group">{title}</div>
      {children}
    </div>
  )
}

function Money({ value, onChange, suffix = 'RON', big }: { value: any; onChange: (v: number | '') => void; suffix?: string; big?: boolean }) {
  return (
    <div style={{ position: 'relative' }}>
      <input type="number" inputMode="decimal" min={0} step={0.01} value={numVal(value, 0)} onChange={e => onChange(numInput(e.target.value, 0))}
        className={big ? 'rz-big' : undefined} style={{ paddingRight: 48, fontVariantNumeric: 'tabular-nums' }} />
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: C.faint, pointerEvents: 'none' }}>{suffix}</span>
    </div>
  )
}

function Segmented({ value, options, tones, onChange }: { value: string; options: Record<string, string>; tones: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <div className="rz-seg">
      {Object.entries(options).map(([k, v]) => {
        const on = value === k
        const t = TONE[tones[k] || 'gray']
        return (
          <button key={k} type="button" onClick={() => onChange(k)} style={on ? { color: t.c, background: t.bg, boxShadow: `inset 0 0 0 1px ${t.b}`, fontWeight: 700 } : undefined}>{v}</button>
        )
      })}
    </div>
  )
}

// Rand pliabil pentru campuri rar folosite: arata doar totalul, se deschide la click
function Fold({ title, value, open, onToggle, children }: { title: string; value: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${C.line}`, background: open ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
      <button type="button" onClick={onToggle} className="rz-fold">
        <span>{title}</span>
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <ChevronDown size={14} style={{ color: C.faint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && <div style={{ padding: '2px 12px 12px' }}>{children}</div>}
    </div>
  )
}

export default function RezervareModal({ open, editing, setEditing, apartamente, onAptChange, recalcComisionPlatforma, calcul, saving, onSave, onClose, onReload, extra }: Props) {
  const totalCosturi = COSTURI.reduce((s, [k]) => s + (Number(editing?.[k]) || 0), 0)
  const comision = (Number(editing?.comision_platforma_valoare) || 0) + (Number(editing?.tva_comision_platforma) || 0)
  const [showCosturi, setShowCosturi] = useState(false)
  const [showComision, setShowComision] = useState(false)
  const [original, setOriginal] = useState<any>(null)
  // Pretul pe noapte: cand e completat de mana, totalul (valoarea bruta) = pret × nopti si se
  // recalculeaza singur cand se schimba datele; cand se scrie direct totalul, pretul se deduce din el
  const [pretNoapte, setPretNoapte] = useState<number | '' | null>(null)
  const [factura, setFactura] = useState<{ etapa: 'idle' | 'confirm' | 'trimit'; eroare?: string; info?: string }>({ etapa: 'idle' })

  // La fiecare deschidere: randurile pliabile pornesc deschise doar daca au valori; se retine starea
  // salvata a rezervarii (factura se emite din datele SALVATE, deci modificarile nesalvate o blocheaza)
  const deschidere = open ? String(editing?.id || 'nou') : null
  const [ultimaDeschidere, setUltimaDeschidere] = useState<string | null>(null)
  if (deschidere !== ultimaDeschidere) {
    setUltimaDeschidere(deschidere)
    if (deschidere) {
      setShowCosturi(totalCosturi > 0)
      setShowComision(comision > 0)
      setOriginal(editing)
      setPretNoapte(null)
      setFactura({ etapa: 'idle' })
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); onSave() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, onSave])

  if (!open || !editing) return null

  const set = (patch: Record<string, any>) => setEditing((prev: any) => ({ ...prev, ...patch }))
  const apt = apartamente.find(a => a.id === editing.apartament_id)
  const nopti = editing.data_checkin && editing.data_checkout
    ? Math.max(0, Math.round((new Date(editing.data_checkout).getTime() - new Date(editing.data_checkin).getTime()) / 86400000))
    : 0
  const moneda = editing.moneda || 'RON'
  const cod = COD_CANAL[editing.canal] || { label: 'Cod rezervare platformă', ph: 'nr. rezervării de la platformă' }
  const procentAdmin = Number((apt as any)?.comision_procent || 20)
  const pePerNoapte = nopti > 0 ? (Number(editing.valoare_bruta) || 0) / nopti : 0
  const noptiIntre = (ci: string, co: string) => ci && co ? Math.max(0, Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000)) : 0
  const total = (pret: number, n: number) => Math.round(pret * n * 100) / 100
  // Schimbarea datelor: daca pretul pe noapte a fost scris de mana, totalul se actualizeaza cu noile nopti
  const setDate = (patch: { data_checkin?: string; data_checkout?: string }) => {
    set(patch)
    if (pretNoapte !== null && Number(pretNoapte) > 0) {
      const n = noptiIntre(patch.data_checkin ?? editing.data_checkin, patch.data_checkout ?? editing.data_checkout)
      recalcComisionPlatforma(total(Number(pretNoapte), n), editing.comision_platforma_procent)
    }
  }
  const pretAfisat = pretNoapte !== null ? pretNoapte : (pePerNoapte > 0 ? Math.round(pePerNoapte * 100) / 100 : '')

  // Factura (Oblio, prin ContaFlow): doar Airbnb, rezervare salvata, cu cod si suma, fara modificari nesalvate
  const campuriFactura = ['cod_rezervare_platforma', 'valoare_bruta', 'nume_client', 'data_checkin', 'data_checkout', 'canal', 'apartament_id', 'nr_persoane', 'telefon_client']
  const nesalvat = !!original && campuriFactura.some(k => String(original[k] ?? '') !== String(editing[k] ?? ''))
  const motivFaraFactura =
    !editing.id ? 'Salvează întâi rezervarea' :
    editing.canal !== 'airbnb' ? 'Facturarea automată e doar pentru rezervările Airbnb' :
    !String(editing.cod_rezervare_platforma || '').trim() ? 'Completează codul rezervării Airbnb' :
    !(Number(editing.valoare_bruta) > 0) ? 'Completează valoarea brută' :
    editing.status_rezervare === 'anulata' ? 'Rezervarea e anulată' :
    nesalvat ? 'Salvează întâi modificările — factura se emite din datele salvate' : null

  async function emiteFactura() {
    setFactura({ etapa: 'trimit' })
    try {
      const res = await fetch('/api/factura-oblio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rezervareId: editing.id }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || !out.numar) { setFactura({ etapa: 'idle', eroare: out.error || `Eroare ${res.status}` }); return }
      const patch = { factura_serie: out.serie, factura_numar: out.numar, factura_link: out.link, status_facturare: 'facturata' }
      set(patch)
      setOriginal((o: any) => ({ ...o, ...patch }))
      setFactura({ etapa: 'idle', info: out.avertisment || (out.dejaEmisa ? 'Factura era deja emisă' : 'Factura a fost emisă și trimisă în SPV') })
      onReload?.()
    } catch (e) {
      setFactura({ etapa: 'idle', eroare: e instanceof Error ? e.message : 'Emiterea a eșuat' })
    }
  }

  return (
    <div className="rz" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <style>{CSS}</style>
      <div className="rz-panel">
        {/* ── Antet ── */}
        <header className="rz-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="rz-lbl" style={{ marginBottom: 2 }}>{editing.id ? 'Editează rezervare' : 'Rezervare nouă'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {editing.nume_client || 'Client nou'}
              </h2>
              <span className="rz-pill" style={pill(TONE.blue)}>{CANALE_LABEL[editing.canal] || editing.canal}</span>
              {editing.cod_rezervare_platforma && <span className="rz-pill rz-mono" style={pill(TONE.amber)}># {editing.cod_rezervare_platforma}</span>}
            </div>
            <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>
              {apt ? `${(apt as any).nota ? (apt as any).nota + ' · ' : ''}${apt.nume}` : 'Fără apartament'}
              <span style={{ color: C.faint }}> · </span>{fmtZi(editing.data_checkin)} → {fmtZi(editing.data_checkout)}
              <span style={{ color: C.faint }}> · </span>{nopti} {nopti === 1 ? 'noapte' : 'nopți'}
              <span style={{ color: C.faint }}> · </span>{Number(editing.nr_persoane) || 1} pers.
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Închide" className="rz-x"><X size={16} /></button>
        </header>

        <div className="rz-body">
          {/* ── Stanga: ce se completeaza ── */}
          <div className="rz-main">
            <Group title="Rezervare" first>
              <div className="rz-grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
                <div>
                  <Label>Apartament *</Label>
                  <select value={editing.apartament_id || ''} onChange={e => onAptChange(e.target.value)}>
                    <option value="">— Selectează —</option>
                    {apartamente.map(a => <option key={a.id} value={a.id}>{(a as any).nota ? `${(a as any).nota} · ${a.nume}` : a.nume}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Canal</Label>
                  <select value={editing.canal} onChange={e => set({ canal: e.target.value })}>
                    {/* Canale din afara listei (ex. „intern” din calendar) raman selectate, nu apar ca Booking */}
                    {editing.canal && !CANALE_LABEL[editing.canal] && <option value={editing.canal}>{editing.canal.charAt(0).toUpperCase() + editing.canal.slice(1)}</option>}
                    {Object.entries(CANALE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="rz-grid rz-dates" style={{ marginTop: 12 }}>
                <div><Label>Check-in *</Label><input type="date" value={editing.data_checkin} onChange={e => setDate({ data_checkin: e.target.value })} /></div>
                <div className="rz-nights" title="Nopți"><Moon size={12} />{nopti}</div>
                <div><Label>Check-out *</Label><input type="date" value={editing.data_checkout} onChange={e => setDate({ data_checkout: e.target.value })} /></div>
                <div>
                  <Label>Persoane</Label>
                  <div className="rz-step">
                    <button type="button" onClick={() => set({ nr_persoane: Math.max(1, (Number(editing.nr_persoane) || 1) - 1) })} aria-label="Mai puține"><Minus size={13} /></button>
                    <input type="number" min={1} value={numVal(editing.nr_persoane, 1)} onChange={e => set({ nr_persoane: numInput(e.target.value, 1) })} />
                    <button type="button" onClick={() => set({ nr_persoane: (Number(editing.nr_persoane) || 0) + 1 })} aria-label="Mai multe"><Plus size={13} /></button>
                  </div>
                </div>
              </div>
            </Group>

            <Group title="Oaspete">
              <div className="rz-grid rz-2">
                <div><Label>Nume client *</Label><input value={editing.nume_client || ''} onChange={e => set({ nume_client: e.target.value })} placeholder="Prenume Nume" /></div>
                <div><Label>Telefon</Label><input type="tel" value={editing.telefon_client || ''} onChange={e => set({ telefon_client: e.target.value })} placeholder="+40 7xx xxx xxx" /></div>
                <div><Label>Email</Label><input type="email" value={editing.email_client || ''} onChange={e => set({ email_client: e.target.value })} placeholder="email@..." /></div>
                <div>
                  <Label right={!editing.cod_rezervare_platforma && editing.canal === 'airbnb' ? <span style={{ fontSize: 11, color: C.amber }}>necesar pe factură</span> : undefined}>{cod.label}</Label>
                  <div style={{ position: 'relative' }}>
                    <Hash size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.amber, pointerEvents: 'none' }} />
                    <input value={editing.cod_rezervare_platforma || ''} placeholder={cod.ph} className="rz-mono"
                      onChange={e => set({ cod_rezervare_platforma: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                      style={{ paddingLeft: 30, letterSpacing: '.05em', ...(editing.canal === 'airbnb' && !editing.cod_rezervare_platforma ? { borderColor: 'rgba(245,158,11,0.45)' } : {}) }} />
                  </div>
                </div>
              </div>
            </Group>

            <Group title="Observații">
              <textarea value={editing.observatii || ''} onChange={e => set({ observatii: e.target.value })} rows={2} placeholder="Notițe interne..." style={{ resize: 'vertical' }} />
            </Group>

            {extra && <Group title="Mesaje și acțiuni">{extra(editing)}</Group>}
          </div>

          {/* ── Dreapta: bani, decont, statusuri, factura ── */}
          <aside className="rz-aside">
            <Group title="Încasări" first>
              <Label right={
                <select value={moneda} onChange={e => set({ moneda: e.target.value })} className="rz-mini">
                  <option>RON</option><option>EUR</option><option>USD</option>
                </select>
              }>Preț pe noapte × {nopti} {nopti === 1 ? 'noapte' : 'nopți'}</Label>
              <div className="rz-calc">
                <Money value={pretAfisat} suffix={`${moneda}/n`} onChange={v => {
                  setPretNoapte(v)
                  recalcComisionPlatforma(v === '' ? '' : total(Number(v), nopti), editing.comision_platforma_procent)
                }} />
                <span className="rz-eq">=</span>
                <div>
                  <Money big value={editing.valoare_bruta} suffix={moneda} onChange={v => { setPretNoapte(null); recalcComisionPlatforma(v, editing.comision_platforma_procent) }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: C.faint, marginTop: 4 }}>
                <span>preț / noapte</span><span>total rezervare (valoare brută)</span>
              </div>
              {!(Number(editing.valoare_bruta) > 0) && Number(editing.suma_incasata) > 0 && (
                <button type="button" className="rz-btn" style={{ marginTop: 8, fontSize: 12, padding: '6px 10px' }}
                  onClick={() => { setPretNoapte(null); recalcComisionPlatforma(Number(editing.suma_incasata), editing.comision_platforma_procent) }}>
                  Folosește încasatul ({fmt(Number(editing.suma_incasata))} {moneda}) ca total
                </button>
              )}
              <div className="rz-grid rz-2" style={{ marginTop: 12 }}>
                <div><Label>Încasat efectiv</Label><Money value={editing.suma_incasata} suffix={moneda} onChange={v => set({ suma_incasata: v })} /></div>
                <div><Label>Taxă curățenie</Label><Money value={editing.taxa_curatenie_incasata} suffix={moneda} onChange={v => set({ taxa_curatenie_incasata: v })} /></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <Fold title="Comision platformă" open={showComision} onToggle={() => setShowComision(s => !s)}
                  value={comision > 0 ? <span style={{ color: C.red }}>−{fmt(comision)} RON</span> : <span style={{ color: C.faint }}>0 · editează</span>}>
                  <div className="rz-grid" style={{ gridTemplateColumns: '0.8fr 1fr 1fr' }}>
                    <div>
                      <Label>Procent</Label>
                      <div style={{ position: 'relative' }}>
                        <input type="number" inputMode="decimal" min={0} max={100} step={0.5} value={numVal(editing.comision_platforma_procent, 0)}
                          onChange={e => recalcComisionPlatforma(editing.valoare_bruta, numInput(e.target.value, 0))} style={{ paddingRight: 26 }} />
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.faint }}>%</span>
                      </div>
                    </div>
                    <div><Label>Valoare</Label><Money value={editing.comision_platforma_valoare} onChange={v => set({ comision_platforma_valoare: v })} /></div>
                    <div><Label>TVA / taxă</Label><Money value={editing.tva_comision_platforma} onChange={v => set({ tva_comision_platforma: v })} /></div>
                  </div>
                </Fold>
                <Fold title="Costuri operaționale" open={showCosturi} onToggle={() => setShowCosturi(s => !s)}
                  value={totalCosturi > 0 ? <span style={{ color: C.red }}>−{fmt(totalCosturi)} RON</span> : <span style={{ color: C.faint }}>0 · editează</span>}>
                  <div className="rz-grid rz-2">
                    {COSTURI.map(([k, l]) => (
                      <div key={k}><Label>{l}</Label><Money value={editing[k]} onChange={v => set({ [k]: v })} /></div>
                    ))}
                  </div>
                </Fold>
              </div>
            </Group>

            {editing.apartament_id && calcul && (
              <Group title="Decont proprietar">
                <div className="rz-rows">
                  <div><span>Bază calcul</span><b>{fmt(calcul.baza)}</b></div>
                  <div><span>Comision administrator {procentAdmin}%</span><b style={{ color: C.red }}>−{fmt(calcul.comision)}</b></div>
                </div>
                <div className="rz-total">
                  <span>De virat proprietarului</span>
                  <b>{fmt(calcul.suma_proprietar)} RON</b>
                </div>
                <label className="rz-check">
                  <input type="checkbox" checked={!!editing.platit_proprietar}
                    onChange={e => set({ platit_proprietar: e.target.checked, suma_platita_proprietar: editing.suma_platita_proprietar ?? calcul.suma_proprietar })} />
                  Plătit către proprietar
                </label>
                {editing.platit_proprietar && (
                  <div style={{ marginTop: 8 }}><Label>Sumă plătită</Label><Money value={editing.suma_platita_proprietar} onChange={v => set({ suma_platita_proprietar: v })} /></div>
                )}
              </Group>
            )}

            <Group title="Statusuri">
              <div className="rz-status">
                <span>Rezervare</span><Segmented value={editing.status_rezervare} options={STATUS_REZERVARE_LABEL} tones={TON_REZ} onChange={v => set({ status_rezervare: v })} />
                <span>Plată</span><Segmented value={editing.status_plata} options={STATUS_PLATA_LABEL} tones={TON_PLATA} onChange={v => set({ status_plata: v })} />
                <span>Decont</span><Segmented value={editing.status_decont} options={STATUS_DECONT_LABEL} tones={TON_DECONT} onChange={v => set({ status_decont: v })} />
                <span>Facturare</span><Segmented value={editing.status_facturare || 'nefacturat'} options={STATUS_FACTURARE_LABEL} tones={TON_FACT} onChange={v => set({ status_facturare: v })} />
              </div>
            </Group>

            <Group title="Factură">
              {editing.factura_numar ? (
                <div className="rz-invoice">
                  <FileText size={16} style={{ color: C.green, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: C.text }}>{editing.factura_serie} {editing.factura_numar}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>AB Textile · emisă în Oblio, trimisă în SPV</div>
                  </div>
                  {editing.factura_link && (
                    <a href={editing.factura_link} target="_blank" rel="noopener noreferrer" className="rz-btn" style={{ marginLeft: 'auto' }}>
                      PDF <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ) : factura.etapa === 'confirm' ? (
                <div className="rz-confirm">
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                    Emiți factura <b>RH</b> pe <b>AB Textile</b> pentru <b>{editing.nume_client}</b>, <b>{fmt(Number(editing.valoare_bruta))} RON</b>, rezervare Airbnb <b className="rz-mono">{editing.cod_rezervare_platforma}</b>?
                    <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>Se trimite automat în SPV — nu se poate retrage din aplicație.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" className="rz-btn" onClick={() => setFactura({ etapa: 'idle' })}>Renunță</button>
                    <button type="button" className="rz-btn rz-btn-go" onClick={emiteFactura}>Da, emite factura</button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" className="rz-btn rz-btn-go" style={{ width: '100%', justifyContent: 'center', padding: '10px 12px' }}
                    disabled={!!motivFaraFactura || factura.etapa === 'trimit'} onClick={() => setFactura({ etapa: 'confirm' })}>
                    {factura.etapa === 'trimit' ? <><Loader2 size={14} className="rz-spin" /> Se emite…</> : <><FileText size={14} /> Emite factură (Oblio · RH)</>}
                  </button>
                  {motivFaraFactura && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{motivFaraFactura}</div>}
                </>
              )}
              {factura.eroare && <div className="rz-msg rz-msg-err"><AlertTriangle size={13} /> {factura.eroare}</div>}
              {factura.info && <div className="rz-msg">{factura.info}</div>}
            </Group>
          </aside>
        </div>

        {/* ── Subsol ── */}
        <footer className="rz-foot">
          <span className="rz-hint">Esc închide · ⌘S salvează</span>
          <button type="button" className="rz-btn" onClick={onClose} style={{ padding: '10px 18px' }}>Anulează</button>
          <button type="button" className="rz-btn rz-btn-primary" onClick={onSave} disabled={saving}>
            {saving ? <><Loader2 size={14} className="rz-spin" /> Se salvează…</> : 'Salvează rezervarea'}
          </button>
        </footer>
      </div>
    </div>
  )
}

const pill = (t: { c: string; bg: string; b: string }): React.CSSProperties => ({ color: t.c, background: t.bg, borderColor: t.b })

const CSS = `
.rz{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;
  background:rgba(4,10,20,0.74);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.rz-panel{width:1080px;max-width:100%;height:min(860px,94vh);display:flex;flex-direction:column;overflow:hidden;
  background:#0D1A2B;border:1px solid rgba(159,215,255,0.16);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.5);animation:fadeIn .18s ease}
.rz-head{display:flex;align-items:flex-start;gap:14px;padding:18px 22px 16px;border-bottom:1px solid ${C.line}}
.rz-x{width:34px;height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:10px;cursor:pointer;
  background:transparent;border:1px solid ${C.line};color:${C.muted}}
.rz-x:hover{color:${C.text};border-color:rgba(159,215,255,0.3)}
.rz-pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;border:1px solid;white-space:nowrap}
.rz-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.rz-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}
.rz-main{overflow-y:auto;padding:20px 22px 24px}
.rz-aside{overflow-y:auto;padding:20px 22px 24px;background:${C.aside};border-left:1px solid ${C.line}}
.rz-group{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.blue};margin-bottom:12px}
.rz-lbl{font-size:11.5px;font-weight:500;color:${C.muted}}
.rz-grid{display:grid;gap:12px}
.rz-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.rz-dates{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) 128px;align-items:end}
.rz-nights{display:flex;align-items:center;gap:4px;height:38px;padding:0 8px;font-size:12px;font-weight:700;color:${C.blue};
  border-radius:999px;background:rgba(77,163,255,0.1);border:1px solid rgba(77,163,255,0.25)}
.rz input,.rz select,.rz textarea{height:38px;padding:0 12px;font-size:13.5px;border-radius:9px;background:rgba(255,255,255,0.035);
  border:1px solid rgba(159,215,255,0.16);backdrop-filter:none;-webkit-backdrop-filter:none}
.rz textarea{height:auto;padding:10px 12px;line-height:1.5}
.rz input:hover,.rz select:hover,.rz textarea:hover{border-color:rgba(159,215,255,0.28)}
.rz input:focus,.rz select:focus,.rz textarea:focus{border-color:#4DA3FF;background:rgba(77,163,255,0.06)}
.rz input[type=number]::-webkit-inner-spin-button,.rz input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.rz input[type=number]{-moz-appearance:textfield}
.rz .rz-big{height:48px;font-size:22px;font-weight:700;letter-spacing:-.01em}
.rz-calc{display:grid;grid-template-columns:minmax(0,0.9fr) auto minmax(0,1.3fr);align-items:center;gap:8px}
.rz-calc .rz-big{height:48px}
.rz-calc > div:first-child input{height:48px;font-size:16px;font-weight:600}
.rz-eq{font-size:18px;color:${C.faint}}
.rz .rz-mini{width:auto;height:26px;padding:0 8px;font-size:11.5px}
.rz-step{display:flex;height:38px;border:1px solid rgba(159,215,255,0.16);border-radius:9px;overflow:hidden;background:rgba(255,255,255,0.035)}
.rz-step button{width:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:${C.blue};cursor:pointer}
.rz-step button:hover{background:rgba(77,163,255,0.1)}
.rz .rz-step input{border:none;border-radius:0;height:100%;text-align:center;padding:0;background:transparent}
.rz-fold{width:100%;display:flex;align-items:center;gap:8px;padding:10px 12px;background:transparent;border:none;cursor:pointer;
  font-family:inherit;font-size:12.5px;color:${C.text2}}
.rz-seg{display:flex;flex-wrap:wrap;gap:2px;padding:3px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid ${C.line}}
.rz-seg button{flex:1;min-width:max-content;padding:6px 9px;border:none;border-radius:7px;background:transparent;color:${C.muted};
  font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;transition:all .12s}
.rz-seg button:hover{color:${C.text}}
.rz-status{display:grid;grid-template-columns:72px minmax(0,1fr);gap:8px 10px;align-items:center}
.rz-status > span{font-size:12px;color:${C.muted}}
.rz-rows{display:flex;flex-direction:column;gap:6px;font-size:13px}
.rz-rows > div{display:flex;justify-content:space-between;gap:10px;color:${C.text2}}
.rz-rows b{font-weight:600;color:${C.text};font-variant-numeric:tabular-nums}
.rz-total{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding:11px 13px;border-radius:10px;
  background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);font-size:13px;color:${C.text}}
.rz-total b{font-size:17px;font-weight:800;color:${C.green};font-variant-numeric:tabular-nums}
.rz-check{display:flex !important;align-items:center;gap:8px;margin:10px 0 0 !important;font-size:13px !important;color:${C.text2} !important;cursor:pointer}
.rz .rz-check input{width:16px;height:16px;padding:0;accent-color:#22C55E}
.rz-invoice{display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:10px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);font-size:13px}
.rz-confirm{padding:12px 13px;border-radius:10px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.3)}
.rz-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:9px;font-family:inherit;font-size:13px;font-weight:600;
  cursor:pointer;text-decoration:none;color:${C.text2};background:rgba(255,255,255,0.04);border:1px solid rgba(159,215,255,0.2)}
.rz-btn:hover:not(:disabled){color:${C.text};border-color:rgba(159,215,255,0.35)}
.rz-btn:disabled{opacity:.45;cursor:not-allowed}
.rz-btn-go{color:#0B1A10;background:#4ADE80;border-color:#4ADE80}
.rz-btn-go:hover:not(:disabled){color:#0B1A10;background:#6EE7A0}
.rz-btn-primary{flex:0 0 auto;min-width:220px;justify-content:center;padding:10px 22px;color:#fff;background:#2F7BEA;border-color:#2F7BEA}
.rz-btn-primary:hover:not(:disabled){color:#fff;background:#3B88F5}
.rz-msg{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:${C.green}}
.rz-msg-err{color:${C.red}}
.rz-spin{animation:spin 1s linear infinite}
.rz-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 22px;border-top:1px solid ${C.line};background:rgba(6,14,26,0.7)}
.rz-hint{margin-right:auto;font-size:11px;color:${C.faint}}
@media (max-width:900px){
  .rz{padding:0;align-items:flex-end}
  .rz-panel{height:96dvh;border-radius:18px 18px 0 0}
  .rz-body{display:block;overflow-y:auto}
  .rz-main,.rz-aside{overflow:visible;padding:16px}
  .rz-aside{border-left:none;border-top:1px solid ${C.line}}
  .rz-head{padding:14px 16px}
  .rz-foot{padding:10px 16px}
  .rz-hint{display:none}
  .rz-btn-primary{flex:1;min-width:0}
}
@media (max-width:520px){
  .rz-2{grid-template-columns:1fr}
  .rz-dates{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .rz-nights{display:none}
  .rz-status{grid-template-columns:1fr}
}
`
