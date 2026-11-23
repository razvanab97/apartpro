'use client'
import { useEffect, useState } from 'react'
import { X, Loader2, Copy } from 'lucide-react'
import { supabase, type Apartament } from '@/lib/supabase'
import { payloadRezervare } from '@/lib/rezervareEdit'
import { RangeCalendar } from '@/components/RangeCalendar'
import { rezervareDublata, pretPeNoapte, noptiIntre, plusZile } from '@/lib/dublare'

// Fereastra „⧉ Dublează” din rezervare (cerut direct: „un buton pe rezervare prin care să apăsăm și să se genereze o nouă
// rezervare pentru persoană, selectăm doar apartament și data”): alegi apartamentul + perioada, pretul vine din pretul pe
// noapte al rezervarii; verifica suprapunerile; la „Creează” scrie rezervarea noua si o intoarce (o deschide fereastra).
const aziRo = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
const fmt = (n: number) => (Number(n) || 0).toLocaleString('ro-RO', { maximumFractionDigits: 2 })
const scurt = (iso: string) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }) : ''

export default function DublareRezervare({ rezervare, apartamente, onCreata, onClose }: {
  rezervare: any; apartamente: Apartament[]; onCreata: (id: string) => void | Promise<void>; onClose: () => void
}) {
  const noptiOrig = Math.max(1, noptiIntre(rezervare.data_checkin, rezervare.data_checkout))
  const [aptId, setAptId] = useState<string>(rezervare.apartament_id || '')
  const [ci, setCi] = useState(aziRo())
  const [co, setCo] = useState(plusZile(aziRo(), noptiOrig))
  const pn = pretPeNoapte(rezervare)
  const n = ci && co ? noptiIntre(ci, co) : 0
  const [total, setTotal] = useState<string>(String(Math.round(pn * noptiOrig * 100) / 100 || ''))
  const [totalManual, setTotalManual] = useState(false)
  const [ocupat, setOcupat] = useState<{ nume: string; ci: string; co: string }[] | null>(null)
  const [lucrez, setLucrez] = useState(false)
  const [eroare, setEroare] = useState<string | null>(null)

  // pretul urmeaza noptile cat timp nu e scris de mana
  useEffect(() => { if (!totalManual) setTotal(pn && n > 0 ? String(Math.round(pn * n * 100) / 100) : '') }, [n, pn, totalManual])
  // suprapuneri pe apartamentul ales
  useEffect(() => {
    setOcupat(null)
    if (!aptId || !ci || !co || co <= ci) return
    let viu = true
    const t = setTimeout(() => {
      Promise.resolve(supabase.from('rezervari').select('id,nume_client,data_checkin,data_checkout,camera_semnalata').eq('apartament_id', aptId)
        .neq('status_rezervare', 'anulata').lt('data_checkin', co).gt('data_checkout', ci).limit(5))
        .then(({ data }) => { if (viu) setOcupat((data || []).filter((r: any) => r.camera_semnalata !== 'NEALOCAT').map((r: any) => ({ nume: r.nume_client, ci: r.data_checkin, co: r.data_checkout }))) })
        .catch(() => {})
    }, 200)
    return () => { viu = false; clearTimeout(t) }
  }, [aptId, ci, co])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose() } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [onClose])

  const apt = apartamente.find(a => a.id === aptId)
  const invalid = !aptId ? 'Alege apartamentul' : !ci ? 'Alege ziua de check-in în calendar' : !co || co <= ci ? 'Alege și ziua de check-out în calendar' : null
  async function creeaza() {
    if (invalid || lucrez) return
    setLucrez(true); setEroare(null)
    try {
      const rand = rezervareDublata(rezervare, { apartament_id: aptId, proprietar_id: apt?.proprietar_id || null, checkin: ci, checkout: co, total: total === '' ? 0 : Number(String(total).replace(',', '.')) || 0 })
      const { data, error } = await supabase.from('rezervari').insert(payloadRezervare(rand, apartamente)).select('id').single()
      if (error || !data) { setEroare(error?.message || 'Nu s-a putut crea'); return }
      await onCreata(data.id)
    } finally { setLucrez(false) }
  }

  const camp: React.CSSProperties = { width: '100%', padding: '9px 10px', borderRadius: 9, background: 'rgba(20,38,65,0.8)', border: '1px solid rgba(159,215,255,0.2)', color: '#FFFFFF', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', outline: 'none', colorScheme: 'dark' }
  const et = (t: string, el: React.ReactNode) => <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(159,215,255,0.6)', minWidth: 0 }}>{t}{el}</label>
  const blocat = !!ocupat?.length

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(3,7,15,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div data-dublare onClick={e => e.stopPropagation()} style={{ width: 'min(440px,100%)', maxHeight: 'calc(100vh - 32px)', overflow: 'auto', background: '#0B1524', border: '1px solid rgba(159,215,255,0.16)', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 13, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>⧉ Dublează rezervarea</div>
            <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.55)', marginTop: 3 }}>Rezervare nouă pentru <b style={{ color: '#D6E4F4' }}>{rezervare.nume_client}</b> — alegi doar apartamentul și perioada</div>
          </div>
          <button onClick={onClose} title="Închide" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, border: '1px solid rgba(159,215,255,0.18)', background: 'transparent', color: 'rgba(214,228,244,0.7)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={14} /></button>
        </div>
        {et('Apartament', <select data-dub-apt value={aptId} onChange={e => setAptId(e.target.value)} style={camp}>
          <option value="">— alege —</option>
          {apartamente.map(a => <option key={a.id} value={a.id}>{(a as any).nota ? `${(a as any).nota} · ${a.nume}` : a.nume}</option>)}
        </select>)}
        {/* perioada: selectorul de calendar (alegi check-in, apoi check-out; un nou click reia alegerea) */}
        <div data-dub-perioada style={{ padding: 12, borderRadius: 12, background: 'rgba(14,27,43,0.6)', border: '1px solid rgba(159,215,255,0.12)' }}>
          <RangeCalendar checkin={ci} checkout={co} onPick={(a, b) => { setCi(a); setCo(b) }} />
        </div>
        {et(`Total (${rezervare.moneda || 'RON'})`, <input data-dub-total inputMode="decimal" value={total} placeholder="fără preț" onChange={e => { setTotal(e.target.value); setTotalManual(true) }} style={camp} />)}
        <div style={{ fontSize: 11.5, color: 'rgba(159,215,255,0.5)', marginTop: -6 }}>
          {pn ? `${fmt(pn)} ${rezervare.moneda || 'RON'} / noapte, ca în rezervarea din ${scurt(rezervare.data_checkin)}${totalManual ? ' · total scris de mână' : ''}` : 'Rezervarea originală n-are preț — scrie totalul (sau lasă gol)'}
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(214,228,244,0.6)', lineHeight: 1.5, padding: '8px 10px', borderRadius: 9, background: 'rgba(159,215,255,0.04)', border: '1px solid rgba(159,215,255,0.08)' }}>
          Se copiază: nume, telefon, email, {Number(rezervare.nr_persoane) || 1} pers., canal{['airbnb', 'booking'].includes(rezervare.canal) ? ' (devine Direct)' : ''} și actele din observații (CNP). Pornește <b>neplătită</b> și <b>nefacturată</b>.
        </div>
        {blocat && <div data-dub-ocupat style={{ fontSize: 12, color: '#F87171', padding: '8px 10px', borderRadius: 9, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)' }}>
          ⚠ Apartamentul e ocupat: {ocupat!.map(o => `${o.nume} (${scurt(o.ci)} → ${scurt(o.co)})`).join('; ')}
        </div>}
        {(eroare || invalid) && <div style={{ fontSize: 12, color: eroare ? '#F87171' : '#FCD34D' }}>{eroare || invalid}</div>}
        <button data-dub-creeaza onClick={creeaza} disabled={!!invalid || lucrez}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 14px', borderRadius: 11, border: 'none', cursor: invalid || lucrez ? 'default' : 'pointer', fontSize: 14, fontWeight: 800, color: '#FFFFFF', opacity: invalid || lucrez ? 0.55 : 1,
            background: blocat ? 'linear-gradient(135deg,#B45309,#92400E)' : 'linear-gradient(135deg,#2563EB,#7C3AED)' }}>
          {lucrez ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={15} />}
          {blocat ? 'Creează oricum (suprapunere)' : 'Creează rezervarea'}{n > 0 ? ` · ${scurt(ci)} → ${scurt(co)}` : ''}
        </button>
      </div>
    </div>
  )
}
