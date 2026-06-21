'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { ConnectionError } from '@/components/ui'
import { ChevronLeft, ChevronRight, Check, Clock, AlertTriangle, Download } from 'lucide-react'

const BOOKING_COMISION = 0.17 // 17%

function getWeekPeriod(offsetWeeks = 0): { from: string; to: string; payDate: string } {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 5=Fri
  // Find last Friday
  const diffToFriday = (day + 2) % 7 // days since last Friday
  const friday = new Date(now)
  friday.setDate(now.getDate() - diffToFriday + offsetWeeks * 7)
  friday.setHours(0,0,0,0)
  const thursday = new Date(friday)
  thursday.setDate(friday.getDate() + 6)
  const payFriday = new Date(friday)
  payFriday.setDate(friday.getDate() + 7)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { from: fmt(friday), to: fmt(thursday), payDate: fmt(payFriday) }
}

function fmtRon(v: number) {
  return v.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateShort(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })
}

type Rez = {
  id: string; observatii?: string; nume_client: string
  data_checkin: string; data_checkout: string
  valoare_bruta: number; suma_incasata: number
  status_rezervare: string; status_plata: string
  nr_nopti: number; canal: string
  apartament: { nota: string; nume: string }
  _comision: number; _net: number; _status: string
}

type Perioada = {
  from: string; to: string; payDate: string
  rezervari: Rez[]; total_brut: number; total_comision: number
  total_net: number; status: string; id?: string
}

export default function BookingRapoartePage() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [perioada, setPerioada] = useState<Perioada | null>(null)
  const [istoric, setIstoric] = useState<Perioada[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState({ apt: '', status: '' })
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [apts, setApts] = useState<any[]>([])

  useEffect(() => { loadPeriod() }, [weekOffset])
  useEffect(() => { loadIstoric(); loadApts() }, [])

  async function loadApts() {
    try{
      const { data } = await supabase.from('apartamente').select('id,nota,nume').eq('status', 'activ').order('nota')
      setApts(data || [])
    }catch(err){console.error('[rapoarte/booking loadApts]',err)}
  }

  async function loadPeriod() {
    setLoading(true)
    setLoadError(false)
    const bail=setTimeout(()=>{ setLoading(false); setLoadError(true) },20000)
    try{
      const { from, to, payDate } = getWeekPeriod(weekOffset)
      const { data: rez } = await supabase.from('rezervari')
        .select('id,observatii,nume_client,data_checkin,data_checkout,valoare_bruta,suma_incasata,status_rezervare,status_plata,nr_nopti,canal,apartament:apartamente(nota,nume)')
        .eq('canal', 'booking')
        .neq('status_rezervare', 'anulata')
        .gte('data_checkout', from)
        .lte('data_checkout', to)
        .order('data_checkout')

      const mapped: Rez[] = (rez || []).map((r: any) => {
        const brut = Number(r.valoare_bruta || r.suma_incasata || 0)
        const comision = Math.round(brut * BOOKING_COMISION * 100) / 100
        const net = Math.round((brut - comision) * 100) / 100
        const status = !brut ? 'verifica' : r.status_plata === 'incasat' ? 'incasat' : 'urmeaza'
        return { ...r, _comision: comision, _net: net, _status: status }
      })

      const total_brut = mapped.reduce((s, r) => s + Number(r.valoare_bruta || r.suma_incasata || 0), 0)
      const total_comision = mapped.reduce((s, r) => s + r._comision, 0)
      const total_net = mapped.reduce((s, r) => s + r._net, 0)
      const allIncasat = mapped.length > 0 && mapped.every(r => r._status === 'incasat')

      // Check if we have a saved status in setari
      const key = `booking_period_${from}`
      const { data: saved } = await supabase.from('setari').select('valoare').eq('cheie', key).maybeSingle()
      const status = saved?.valoare || (allIncasat ? 'incasat' : 'urmeaza')

      setPerioada({ from, to, payDate, rezervari: mapped, total_brut, total_comision, total_net, status, id: key })
      clearTimeout(bail)
    }catch(err){console.error('[rapoarte/booking loadPeriod]',err);clearTimeout(bail);setLoadError(true)}
    setLoading(false)
  }

  async function loadIstoric() {
    try{
      // Load past 8 periods
      const periods: Perioada[] = []
      for (let i = -1; i >= -8; i--) {
        const { from, to, payDate } = getWeekPeriod(i)
        const { data: rez } = await supabase.from('rezervari')
          .select('id,valoare_bruta,suma_incasata,status_plata,canal')
          .eq('canal', 'booking').neq('status_rezervare', 'anulata')
          .gte('data_checkout', from).lte('data_checkout', to)
        const mapped = (rez || []).map((r: any) => {
          const brut = Number(r.valoare_bruta || r.suma_incasata || 0)
          const comision = Math.round(brut * BOOKING_COMISION * 100) / 100
          return { ...r, _comision: comision, _net: brut - comision, _status: r.status_plata === 'incasat' ? 'incasat' : 'urmeaza' }
        })
        const total_net = mapped.reduce((s: number, r: any) => s + r._net, 0)
        const key = `booking_period_${from}`
        const { data: saved } = await supabase.from('setari').select('valoare').eq('cheie', key).maybeSingle()
        if (mapped.length > 0) {
          periods.push({ from, to, payDate, rezervari: mapped as any, total_brut: 0, total_comision: 0, total_net, status: saved?.valoare || 'urmeaza', id: key })
        }
      }
      setIstoric(periods)
    }catch(err){console.error('[rapoarte/booking loadIstoric]',err)}
  }

  async function confirmIncasat() {
    if (!perioada?.id) return
    setConfirmingId(perioada.id)
    await supabase.from('setari').upsert({ cheie: perioada.id, valoare: 'incasat' }, { onConflict: 'cheie' })
    // Update all rezervari in period
    const ids = perioada.rezervari.map(r => r.id)
    if (ids.length) await supabase.from('rezervari').update({ status_plata: 'incasat' }).in('id', ids)
    setPerioada(p => p ? { ...p, status: 'incasat' } : p)
    setConfirmingId(null)
    loadIstoric()
  }

  const filteredRez = (perioada?.rezervari || []).filter(r => {
    if (filter.apt && r.apartament?.nota !== filter.apt) return false
    if (filter.status && r._status !== filter.status) return false
    return true
  })

  const statusBadge = (s: string) => {
    if (s === 'incasat') return { label: 'Încasat ✓', color: '#4ADE80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)' }
    if (s === 'verifica') return { label: 'Verifică', color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' }
    return { label: 'Urmează', color: '#FCD34D', bg: 'rgba(252,211,77,0.08)', border: 'rgba(252,211,77,0.25)' }
  }

  const panel: React.CSSProperties = { background: 'rgba(214,228,244,0.05)', border: '0.5px solid rgba(159,215,255,0.1)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }
  const hdr: React.CSSProperties = { padding: '10px 14px', background: 'rgba(14,27,43,0.5)', borderBottom: '0.5px solid rgba(159,215,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }

  if (loadError) return (<><PageHeader title="Încasări Booking" subtitle="Raportare săptămânală"/><ConnectionError onRetry={()=>loadPeriod()}/></>)

  return (
    <>
      <PageHeader title="Încasări Booking" subtitle="Raportare săptămânală"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 40px' }}>

        {/* Navigator săptămâni */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, background: 'rgba(20,35,58,0.6)', border: '0.5px solid rgba(0,83,186,0.3)', borderRadius: 10, padding: '10px 14px' }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{ width: 36, height: 36, borderRadius: 8, border: '0.5px solid rgba(159,215,255,0.2)', background: 'rgba(159,215,255,0.06)', color: 'rgba(214,228,244,0.8)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={16}/>
          </button>
          <div style={{ flex: 1, textAlign: 'center' as const }}>
            {loading ? <span style={{ color: 'rgba(159,215,255,0.4)' }}>Se încarcă...</span> : perioada && <>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>
                {fmtDateShort(perioada.from)} — {fmtDateShort(perioada.to)}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', marginTop: 2 }}>
                {weekOffset === 0 ? 'Săptămâna curentă' : weekOffset === 1 ? 'Săptămâna viitoare' : weekOffset === -1 ? 'Săptămâna trecută' : `${weekOffset > 0 ? '+' : ''}${weekOffset} săptămâni`}
                {' · '}Plată estimată: <span style={{ color: '#FCD34D' }}>{fmtDateShort(perioada.payDate)}</span>
              </div>
            </>}
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)} style={{ width: 36, height: 36, borderRadius: 8, border: '0.5px solid rgba(159,215,255,0.2)', background: 'rgba(159,215,255,0.06)', color: 'rgba(214,228,244,0.8)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16}/>
          </button>
        </div>

        {/* Butoane rapide */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' as const }}>
          {[[-1,'Săpt. trecută'],[0,'Curentă'],[1,'Următoarea']].map(([w, l]) => (
            <button key={w} onClick={() => setWeekOffset(Number(w))}
              style={{ flex: 1, padding: '8px', borderRadius: 8, border: `0.5px solid ${weekOffset===w?'rgba(0,83,186,0.5)':'rgba(159,215,255,0.12)'}`, background: weekOffset===w?'rgba(0,83,186,0.15)':'transparent', color: weekOffset===w?'#60A5FA':'rgba(159,215,255,0.5)', fontSize: 12, cursor: 'pointer', fontWeight: weekOffset===w?600:400 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Sumar perioadă */}
        {!loading && perioada && (
          <div style={{ ...panel, borderTop: `2px solid ${perioada.status==='incasat'?'#4ADE80':'#0055A5'}` }}>
            <div style={hdr}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(159,215,255,0.55)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                Sumar · {perioada.rezervari.length} rezervări
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, color: statusBadge(perioada.status).color, background: statusBadge(perioada.status).bg, border: `0.5px solid ${statusBadge(perioada.status).border}` }}>
                {statusBadge(perioada.status).label}
              </span>
            </div>
            <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: 'Sumă brută', value: fmtRon(perioada.total_brut), color: 'rgba(214,228,244,0.7)' },
                { label: `Comision Booking (${Math.round(BOOKING_COMISION*100)}%)`, value: '- ' + fmtRon(perioada.total_comision), color: '#F87171' },
                { label: 'NET estimat', value: fmtRon(perioada.total_net), color: '#4ADE80' },
              ].map(item => (
                <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: item.color, fontFamily: 'monospace' }}>{item.value}</div>
                  <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.3)', marginTop: 2 }}>RON</div>
                </div>
              ))}
            </div>
            {/* Confirmare plată */}
            {perioada.status !== 'incasat' && (
              <div style={{ padding: '0 14px 12px' }}>
                <button onClick={confirmIncasat} disabled={!!confirmingId}
                  style={{ width: '100%', padding: '10px', borderRadius: 9, border: 'none', background: 'rgba(74,222,128,0.8)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: confirmingId ? 0.6 : 1 }}>
                  <Check size={15}/>Confirmă plată Booking primită
                </button>
              </div>
            )}
          </div>
        )}

        {/* Filtre */}
        {!loading && (perioada?.rezervari.length||0) > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' as const }}>
            <select value={filter.apt} onChange={e => setFilter(f => ({ ...f, apt: e.target.value }))}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: 'rgba(20,35,58,0.8)', border: '0.5px solid rgba(100,160,255,0.2)', color: 'rgba(214,228,244,0.8)', fontSize: 12 }}>
              <option value="">Toate apartamentele</option>
              {apts.map(a => <option key={a.id} value={a.nota}>{a.nota} · {a.nume}</option>)}
            </select>
            <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: 'rgba(20,35,58,0.8)', border: '0.5px solid rgba(100,160,255,0.2)', color: 'rgba(214,228,244,0.8)', fontSize: 12 }}>
              <option value="">Toate statusurile</option>
              <option value="urmeaza">Urmează</option>
              <option value="incasat">Încasat</option>
              <option value="verifica">Verifică</option>
            </select>
          </div>
        )}

        {/* Lista rezervări */}
        {!loading && filteredRez.length === 0 && (
          <div style={{ ...panel, padding: '24px', textAlign: 'center' as const }}>
            <div style={{ fontSize: 13, color: 'rgba(159,215,255,0.3)', fontStyle: 'italic' }}>
              {(perioada?.rezervari.length||0) === 0 ? 'Nicio rezervare Booking cu check-out în această perioadă' : 'Niciun rezultat pentru filtrele selectate'}
            </div>
          </div>
        )}

        {!loading && filteredRez.map((r, idx) => {
          const sb = statusBadge(r._status)
          const obs = r.observatii?.split('|')[0]?.trim() || ''
          return (
            <div key={r.id||idx} style={{ ...panel, borderLeft: `3px solid ${sb.color}40` }}>
              <div style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' as const }}>
                  {r.apartament?.nota && <span style={{ fontSize: 10, fontWeight: 700, color: '#4DA3FF', background: 'rgba(77,163,255,0.12)', padding: '2px 7px', borderRadius: 4, fontFamily: 'monospace', flexShrink: 0 }}>{r.apartament.nota}</span>}
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF', flex: 1 }}>{r.nume_client}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, color: sb.color, background: sb.bg, border: `0.5px solid ${sb.border}`, flexShrink: 0 }}>{sb.label}</span>
                </div>
                {obs && <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.35)', marginBottom: 6, fontFamily: 'monospace' }}>{obs}</div>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.45)' }}>CI: {fmtDateShort(r.data_checkin)}</span>
                  <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.25)' }}>→</span>
                  <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.45)' }}>CO: {fmtDateShort(r.data_checkout)}</span>
                  {r.nr_nopti && <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.35)' }}>· {r.nr_nopti}n</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 8px' }}>
                    <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.3)', marginBottom: 2 }}>BRUT</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(214,228,244,0.7)', fontFamily: 'monospace' }}>{fmtRon(Number(r.valoare_bruta||r.suma_incasata||0))}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 8px' }}>
                    <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.3)', marginBottom: 2 }}>COMISION</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#F87171', fontFamily: 'monospace' }}>- {fmtRon(r._comision)}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 8px' }}>
                    <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.3)', marginBottom: 2 }}>NET</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#4ADE80', fontFamily: 'monospace' }}>{fmtRon(r._net)}</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Istoric */}
        {istoric.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>Istoric perioade anterioare</div>
            {istoric.map((p, idx) => {
              const sb = statusBadge(p.status)
              return (
                <div key={idx} onClick={() => setWeekOffset(idx * -1 - 1)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(214,228,244,0.03)', border: '0.5px solid rgba(159,215,255,0.08)', borderRadius: 9, marginBottom: 6, cursor: 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(214,228,244,0.7)' }}>{fmtDateShort(p.from)} — {fmtDateShort(p.to)}</div>
                    <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.35)', marginTop: 2 }}>{p.rezervari.length} rez · Plată: {fmtDateShort(p.payDate)}</div>
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#4ADE80', fontFamily: 'monospace' }}>{fmtRon(p.total_net)}</div>
                    <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.3)' }}>RON net</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 12, color: sb.color, background: sb.bg, border: `0.5px solid ${sb.border}`, flexShrink: 0 }}>{sb.label}</span>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </>
  )
}
