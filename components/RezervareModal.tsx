'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { CANALE_LABEL, STATUS_REZERVARE_LABEL, STATUS_PLATA_LABEL, STATUS_DECONT_LABEL, STATUS_FACTURARE_LABEL, numVal, numInput, type Apartament } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { X, BedDouble, User, Wallet, Wrench, Calculator, ListChecks, ReceiptText, ChevronDown, Minus, Plus, Hash } from 'lucide-react'

// Formularul de rezervare (nou/editare), refacut la cerere: inainte era o lista lunga de campuri
// la acelasi nivel, cu variabile CSS inexistente (--border/--bg3/--text3 -> linii albe, buton alb).
// Acum: antet fix cu rezumatul sejurului, sectiuni pe carduri, statusuri ca butoane, costurile si
// decontul pliabile, subsol fix cu Salveaza.

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
}

const C = {
  text: '#E8F4FF',
  text2: 'rgba(214,228,244,0.72)',
  muted: 'rgba(159,215,255,0.45)',
  line: 'rgba(159,215,255,0.1)',
  card: 'rgba(255,255,255,0.025)',
  blue: '#7BC8FF',
  green: '#4ADE80',
  red: '#F87171',
  amber: '#FCD34D',
}

const TONE: Record<string, { c: string; bg: string; b: string }> = {
  green: { c: '#4ADE80', bg: 'rgba(34,197,94,0.14)', b: 'rgba(34,197,94,0.4)' },
  amber: { c: '#FCD34D', bg: 'rgba(245,158,11,0.14)', b: 'rgba(245,158,11,0.4)' },
  red: { c: '#F87171', bg: 'rgba(239,68,68,0.14)', b: 'rgba(239,68,68,0.4)' },
  blue: { c: '#7BC8FF', bg: 'rgba(77,163,255,0.16)', b: 'rgba(77,163,255,0.45)' },
  gray: { c: '#CBD5E1', bg: 'rgba(148,163,184,0.14)', b: 'rgba(148,163,184,0.4)' },
}
const TON_REZ: Record<string, string> = { cerere: 'amber', confirmata: 'green', anulata: 'red', finalizata: 'blue' }
const TON_PLATA: Record<string, string> = { neplatit: 'red', avans: 'amber', achitat: 'green' }
const TON_DECONT: Record<string, string> = { nedecontat: 'gray', inclus: 'amber', decontat: 'green' }
const TON_FACT: Record<string, string> = { nefacturat: 'gray', de_facturat: 'amber', facturata: 'green' }

// Eticheta/placeholder pentru codul rezervarii, dupa canal - numarul de la platforma (nu ID-ul 5starDesk)
const COD_CANAL: Record<string, { label: string; ph: string }> = {
  airbnb: { label: 'Cod rezervare Airbnb', ph: 'ex. HMXXXXXXXX' },
  booking: { label: 'Nr. rezervare Booking', ph: 'ex. 6012345678' },
}

const fmt = (n: number) => (Number(n) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtZi = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }) : '—'

function Section({ icon, title, right, children }: { icon: ReactNode; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ color: C.blue, display: 'flex' }}>{icon}</span>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '.04em', textTransform: 'uppercase', margin: 0 }}>{title}</h3>
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </header>
      {children}
    </section>
  )
}

function Collapsible({ icon, title, summary, open, onToggle, children }: { icon: ReactNode; title: string; summary?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
      <button type="button" onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: C.text, fontFamily: 'inherit' }}>
        <span style={{ color: C.blue, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.text2 }}>{summary}</span>
        <ChevronDown size={15} style={{ color: C.muted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function Chips({ value, options, tones, onChange }: { value: string; options: Record<string, string>; tones: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {Object.entries(options).map(([k, v]) => {
        const on = value === k
        const t = TONE[tones[k] || 'gray']
        return (
          <button key={k} type="button" onClick={() => onChange(k)} style={{
            padding: '6px 11px', borderRadius: 8, fontSize: 12, fontWeight: on ? 700 : 500, fontFamily: 'inherit', cursor: 'pointer',
            color: on ? t.c : C.muted, background: on ? t.bg : 'transparent', border: `1px solid ${on ? t.b : C.line}`, transition: 'all .12s',
          }}>{v}</button>
        )
      })}
    </div>
  )
}

function Money({ value, onChange, suffix = 'RON' }: { value: any; onChange: (v: number | '') => void; suffix?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <input type="number" inputMode="decimal" min={0} step={0.01} value={numVal(value, 0)} onChange={e => onChange(numInput(e.target.value, 0))} style={{ paddingRight: 46 }} />
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: C.muted, pointerEvents: 'none' }}>{suffix}</span>
    </div>
  )
}

export default function RezervareModal({ open, editing, setEditing, apartamente, onAptChange, recalcComisionPlatforma, calcul, saving, onSave, onClose }: Props) {
  const totalCosturi = ['cost_curatenie', 'cost_spalatorie', 'cost_consumabile', 'cost_mentenanta', 'alte_costuri'].reduce((s, k) => s + (Number(editing?.[k]) || 0), 0)
  const [showCosturi, setShowCosturi] = useState(false)
  const [showDecont, setShowDecont] = useState(false)

  // La fiecare deschidere: costurile se deschid singure doar daca exista costuri completate
  const deschidere = open ? String(editing?.id || 'nou') : null
  const [ultimaDeschidere, setUltimaDeschidere] = useState<string | null>(null)
  if (deschidere !== ultimaDeschidere) {
    setUltimaDeschidere(deschidere)
    if (deschidere) { setShowCosturi(totalCosturi > 0); setShowDecont(false) }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !editing) return null

  const set = (patch: Record<string, any>) => setEditing((prev: any) => ({ ...prev, ...patch }))
  const apt = apartamente.find(a => a.id === editing.apartament_id)
  const nopti = editing.data_checkin && editing.data_checkout
    ? Math.max(0, Math.round((new Date(editing.data_checkout).getTime() - new Date(editing.data_checkin).getTime()) / 86400000))
    : 0
  const moneda = editing.moneda || 'RON'
  const cod = COD_CANAL[editing.canal] || { label: 'Cod rezervare platformă', ph: 'numărul rezervării de la platformă' }
  const procentAdmin = Number((apt as any)?.comision_procent || 20)

  return (
    <div className="rez-ed" onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(7,18,32,0.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', padding: 16,
    }}>
      <style>{`
        .rez-ed input[type=number]::-webkit-inner-spin-button,.rez-ed input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
        .rez-ed input[type=number]{-moz-appearance:textfield}
        .rez-ed .g{display:grid;gap:12px}
        .rez-ed .g2{grid-template-columns:repeat(2,minmax(0,1fr))}
        .rez-ed .g3{grid-template-columns:repeat(3,minmax(0,1fr))}
        .rez-ed .g4{grid-template-columns:repeat(4,minmax(0,1fr))}
        @media (max-width:720px){
          .rez-ed{padding:0 !important;align-items:flex-end !important}
          .rez-ed .panel{max-height:94dvh !important;border-radius:18px 18px 0 0 !important}
          .rez-ed .g3,.rez-ed .g4{grid-template-columns:repeat(2,minmax(0,1fr))}
          .rez-ed .g2.stack,.rez-ed .g3.stack{grid-template-columns:1fr}
        }
      `}</style>
      <div className="panel" style={{
        width: 780, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        background: 'rgba(14,27,43,0.96)', border: '1px solid rgba(159,215,255,0.18)', borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)', animation: 'fadeIn 0.18s ease', overflow: 'hidden',
      }}>
        {/* Antet: rezumatul sejurului, mereu vizibil */}
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
              {editing.id ? 'Editează rezervare' : 'Rezervare nouă'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {editing.nume_client || 'Client nou'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, fontSize: 12 }}>
              <span style={pill(TONE.blue)}>{CANALE_LABEL[editing.canal] || editing.canal}</span>
              {apt && <span style={pill(TONE.gray)}>{(apt as any).nota ? `${(apt as any).nota} · ` : ''}{apt.nume}</span>}
              <span style={pill(TONE.gray)}>{fmtZi(editing.data_checkin)} → {fmtZi(editing.data_checkout)} · {nopti} {nopti === 1 ? 'noapte' : 'nopți'}</span>
              {editing.cod_rezervare_platforma && <span style={pill(TONE.amber)}># {editing.cod_rezervare_platforma}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Închide" style={{
            width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(14,27,43,0.6)', border: `1px solid ${C.line}`, borderRadius: 9, cursor: 'pointer', color: C.muted,
          }}><X size={15} /></button>
        </div>

        {/* Continut */}
        <div style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Section icon={<BedDouble size={15} />} title="Sejur">
            <div className="g g2 stack" style={{ marginBottom: 12 }}>
              <Field label="Apartament *">
                <select value={editing.apartament_id || ''} onChange={e => onAptChange(e.target.value)}>
                  <option value="">— Selectează apartament —</option>
                  {apartamente.map(a => <option key={a.id} value={a.id}>{(a as any).nota ? `${(a as any).nota} · ${a.nume}` : a.nume}</option>)}
                </select>
              </Field>
              <Field label="Canal">
                <select value={editing.canal} onChange={e => set({ canal: e.target.value })}>
                  {Object.entries(CANALE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <div className="g g3">
              <Field label="Check-in *"><input type="date" value={editing.data_checkin} onChange={e => set({ data_checkin: e.target.value })} /></Field>
              <Field label="Check-out *"><input type="date" value={editing.data_checkout} onChange={e => set({ data_checkout: e.target.value })} /></Field>
              <Field label="Persoane">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" onClick={() => set({ nr_persoane: Math.max(1, (Number(editing.nr_persoane) || 1) - 1) })} style={stepBtn}><Minus size={14} /></button>
                  <input type="number" min={1} value={numVal(editing.nr_persoane, 1)} onChange={e => set({ nr_persoane: numInput(e.target.value, 1) })} style={{ textAlign: 'center' }} />
                  <button type="button" onClick={() => set({ nr_persoane: (Number(editing.nr_persoane) || 0) + 1 })} style={stepBtn}><Plus size={14} /></button>
                </div>
              </Field>
            </div>
          </Section>

          <Section icon={<User size={15} />} title="Oaspete">
            <div className="g g3 stack" style={{ marginBottom: 12 }}>
              <Field label="Nume client *"><input value={editing.nume_client || ''} onChange={e => set({ nume_client: e.target.value })} placeholder="Prenume Nume" /></Field>
              <Field label="Telefon"><input type="tel" value={editing.telefon_client || ''} onChange={e => set({ telefon_client: e.target.value })} placeholder="+40 7xx xxx xxx" /></Field>
              <Field label="Email"><input type="email" value={editing.email_client || ''} onChange={e => set({ email_client: e.target.value })} placeholder="email@..." /></Field>
            </div>
            <Field label={cod.label} hint="Numărul rezervării de la platformă (nu ID-ul din 5starDesk) — apare pe factură.">
              <div style={{ position: 'relative' }}>
                <Hash size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.amber, pointerEvents: 'none' }} />
                <input value={editing.cod_rezervare_platforma || ''} placeholder={cod.ph}
                  onChange={e => set({ cod_rezervare_platforma: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                  style={{ paddingLeft: 32, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '.04em' }} />
              </div>
            </Field>
          </Section>

          <Section icon={<Wallet size={15} />} title="Încasări"
            right={<select value={moneda} onChange={e => set({ moneda: e.target.value })} style={{ width: 84, padding: '5px 10px', fontSize: 12 }}>
              <option>RON</option><option>EUR</option><option>USD</option>
            </select>}>
            <div className="g g3" style={{ marginBottom: 14 }}>
              <Field label="Valoare brută"><Money value={editing.valoare_bruta} suffix={moneda} onChange={v => recalcComisionPlatforma(v, editing.comision_platforma_procent)} /></Field>
              <Field label="Taxă curățenie încasată"><Money value={editing.taxa_curatenie_incasata} suffix={moneda} onChange={v => set({ taxa_curatenie_incasata: v })} /></Field>
              <Field label="Sumă efectiv încasată"><Money value={editing.suma_incasata} suffix={moneda} onChange={v => set({ suma_incasata: v })} /></Field>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', margin: '2px 0 8px' }}>Comision platformă</div>
            <div className="g g3">
              <Field label="Procent">
                <div style={{ position: 'relative' }}>
                  <input type="number" inputMode="decimal" min={0} max={100} step={0.5} value={numVal(editing.comision_platforma_procent, 0)}
                    onChange={e => recalcComisionPlatforma(editing.valoare_bruta, numInput(e.target.value, 0))} style={{ paddingRight: 30 }} />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.muted }}>%</span>
                </div>
              </Field>
              <Field label="Valoare comision"><Money value={editing.comision_platforma_valoare} onChange={v => set({ comision_platforma_valoare: v })} /></Field>
              <Field label="TVA / taxă aferentă"><Money value={editing.tva_comision_platforma} onChange={v => set({ tva_comision_platforma: v })} /></Field>
            </div>
          </Section>

          <Collapsible icon={<Wrench size={15} />} title="Costuri operaționale" open={showCosturi} onToggle={() => setShowCosturi(s => !s)}
            summary={totalCosturi > 0 ? <span style={{ color: C.red, fontWeight: 600 }}>−{fmt(totalCosturi)} RON</span> : 'fără costuri'}>
            <div className="g g3" style={{ marginBottom: 12 }}>
              <Field label="Curățenie"><Money value={editing.cost_curatenie} onChange={v => set({ cost_curatenie: v })} /></Field>
              <Field label="Spălătorie"><Money value={editing.cost_spalatorie} onChange={v => set({ cost_spalatorie: v })} /></Field>
              <Field label="Consumabile"><Money value={editing.cost_consumabile} onChange={v => set({ cost_consumabile: v })} /></Field>
            </div>
            <div className="g g2">
              <Field label="Mentenanță"><Money value={editing.cost_mentenanta} onChange={v => set({ cost_mentenanta: v })} /></Field>
              <Field label="Alte costuri"><Money value={editing.alte_costuri} onChange={v => set({ alte_costuri: v })} /></Field>
            </div>
          </Collapsible>

          {editing.apartament_id && calcul && (
            <Collapsible icon={<Calculator size={15} />} title="Decont proprietar" open={showDecont} onToggle={() => setShowDecont(s => !s)}
              summary={<span>de virat <b style={{ color: C.green }}>{fmt(calcul.suma_proprietar)} RON</b>{editing.platit_proprietar ? <span style={{ color: C.green }}> · plătit ✓</span> : ''}</span>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <Row label="Valoare brută" value={fmt(Number(editing.valoare_bruta))} />
                {Number(editing.comision_platforma_valoare) > 0 && <Row label="− Comision platformă" value={`−${fmt(Number(editing.comision_platforma_valoare))}`} red />}
                {Number(editing.tva_comision_platforma) > 0 && <Row label="− TVA platformă" value={`−${fmt(Number(editing.tva_comision_platforma))}`} red />}
                {totalCosturi > 0 && <Row label="− Costuri operaționale" value={`−${fmt(totalCosturi)}`} red />}
                <div style={{ borderTop: `1px solid ${C.line}`, margin: '4px 0' }} />
                <Row label="Bază calcul comision" value={fmt(calcul.baza)} strong />
                <Row label={`− Comision administrator ${procentAdmin}%`} value={`−${fmt(calcul.comision)}`} red />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, padding: '10px 12px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)' }}>
                  <span style={{ fontWeight: 700, color: C.text }}>Suma de virat proprietar</span>
                  <span style={{ fontWeight: 800, color: C.green, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{fmt(calcul.suma_proprietar)} RON</span>
                </div>
                <div className="g g2 stack" style={{ marginTop: 8, alignItems: 'end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: C.text2, margin: 0, padding: '9px 0' }}>
                    <input type="checkbox" checked={!!editing.platit_proprietar} style={{ width: 16, height: 16, accentColor: '#22C55E' }}
                      onChange={e => set({ platit_proprietar: e.target.checked, suma_platita_proprietar: editing.suma_platita_proprietar ?? calcul.suma_proprietar })} />
                    Plătit către proprietar
                  </label>
                  {editing.platit_proprietar && (
                    <Field label="Sumă plătită"><Money value={editing.suma_platita_proprietar} onChange={v => set({ suma_platita_proprietar: v })} /></Field>
                  )}
                </div>
              </div>
            </Collapsible>
          )}

          <Section icon={<ListChecks size={15} />} title="Statusuri">
            <div className="g g2 stack" style={{ rowGap: 14 }}>
              <Field label="Rezervare"><Chips value={editing.status_rezervare} options={STATUS_REZERVARE_LABEL} tones={TON_REZ} onChange={v => set({ status_rezervare: v })} /></Field>
              <Field label="Plată"><Chips value={editing.status_plata} options={STATUS_PLATA_LABEL} tones={TON_PLATA} onChange={v => set({ status_plata: v })} /></Field>
              <Field label="Decont"><Chips value={editing.status_decont} options={STATUS_DECONT_LABEL} tones={TON_DECONT} onChange={v => set({ status_decont: v })} /></Field>
              <Field label="Facturare"><Chips value={editing.status_facturare || 'nefacturat'} options={STATUS_FACTURARE_LABEL} tones={TON_FACT} onChange={v => set({ status_facturare: v })} /></Field>
            </div>
          </Section>

          <Section icon={<ReceiptText size={15} />} title="Observații">
            <textarea value={editing.observatii || ''} onChange={e => set({ observatii: e.target.value })} rows={2} placeholder="Notițe interne..." style={{ resize: 'vertical' }} />
          </Section>
        </div>

        {/* Subsol fix */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.line}`, display: 'flex', gap: 10, background: 'rgba(10,20,34,0.6)' }}>
          <Button variant="secondary" onClick={onClose} style={{ flex: 1 }}>Anulează</Button>
          <Button variant="primary" onClick={onSave} loading={saving} style={{ flex: 2 }}>Salvează rezervarea</Button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, red, strong }: { label: string; value: string; red?: boolean; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: strong ? C.text : C.text2, fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: red ? C.red : C.text, fontWeight: strong ? 700 : 500 }}>{value} RON</span>
    </div>
  )
}

const pill = (t: { c: string; bg: string; b: string }): React.CSSProperties => ({
  padding: '3px 9px', borderRadius: 999, color: t.c, background: t.bg, border: `1px solid ${t.b}`, fontWeight: 600, whiteSpace: 'nowrap',
})

const stepBtn: React.CSSProperties = {
  width: 36, height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10,
  background: 'rgba(14,27,43,0.58)', border: '1px solid rgba(159,215,255,0.25)', color: '#7BC8FF', cursor: 'pointer',
}
