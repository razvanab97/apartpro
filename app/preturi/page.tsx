'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { useToast, Toast } from '@/components/ui'

interface BookingResult {
  rank: number
  name: string
  price: number
  priceText: string
  isOurs: boolean
  matchedCode?: string
}

interface ScanState {
  status: 'idle' | 'scanning' | 'done' | 'error'
  results: BookingResult[]
  errorMsg?: string
  scannedAt?: string
  lowestPrice?: number
  weAreLowest?: boolean
  ourLowestRank?: number
  checkin?: string
  checkout?: string
}

const OUR_IDENTIFIERS = [
  'ab homes', 'abhomes', 'ab-homes',
  'ex59', 'gs08', 'hd02', 'l83', 'l88', 'l94', 'l99',
  'n32', 'n33', 'nt9', 'vm07', 'c64', 'cg40',
]

function isOurProperty(name: string): { isOurs: boolean; matchedCode?: string } {
  const lower = name.toLowerCase()
  for (const id of OUR_IDENTIFIERS) {
    if (lower.includes(id)) return { isOurs: true, matchedCode: id.toUpperCase() }
  }
  return { isOurs: false }
}

function buildBookingSearchUrl(checkin: string, checkout: string): string {
  return `https://www.booking.com/searchresults.ro.html?ss=Ia%C8%99i%2C+Rom%C3%A2nia&checkin=${checkin}&checkout=${checkout}&group_adults=2&no_rooms=1&nflt=ht_id%3D204&order=price`
}

export default function PreturiPage() {
  const [apts, setApts] = useState<any[]>([])
  const [preturi, setPreturi] = useState<Record<string, { booking: string; airbnb: string }>>({})
  const [dataSelectata, setDataSelectata] = useState('')
  const [ocupate, setOcupate] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const { toast, show } = useToast()

  const [checkinMonitor, setCheckinMonitor] = useState('')
  const [checkoutMonitor, setCheckoutMonitor] = useState('')
  const [scan, setScan] = useState<ScanState>({ status: 'idle', results: [] })

  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const add = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d) }
  const today = fmt(new Date())
  const dow = new Date().getDay()

  const QUICK = [
    { label: 'Azi', val: today },
    { label: 'Mâine', val: add(1) },
    { label: 'Poimâine', val: add(2) },
    { label: 'Sâmbătă', val: add(dow === 6 ? 7 : 6 - dow) },
    { label: 'Duminică', val: add(dow === 0 ? 7 : 7 - dow) },
    { label: '+7 zile', val: add(7) },
  ]

  useEffect(() => {
    const ci = add(1)
    const d = new Date(ci + 'T12:00:00'); d.setDate(d.getDate() + 1)
    setCheckinMonitor(ci)
    setCheckoutMonitor(fmt(d))

    supabase.from('apartamente')
      .select('id,nota,nume,link_booking,link_airbnb,booking_links,airbnb_links')
      .eq('status', 'activ').order('nota')
      .then(async ({ data }) => {
        const list = (data || []).map((apt: any) => {
          const bks = (apt.booking_links || []).filter((l: string) => l?.includes('booking.com'))
          const abs = (apt.airbnb_links || []).filter((l: string) => l?.includes('airbnb.'))
          const bk = bks[0] || (apt.link_booking?.includes('booking.com') ? apt.link_booking : null)
          const ab = apt.link_airbnb?.includes('airbnb.') ? apt.link_airbnb : abs[0] || null
          return { ...apt, _bk: bk, _ab: ab }
        }).filter((a: any) => a._bk || a._ab)
        setApts(list)
        setDataSelectata(today)
        loadOcupate(today, list.map((a: any) => a.id))
        const { data: saved } = await supabase.from('preturi_live')
          .select('*').in('apartament_id', list.map((a: any) => a.id))
          .eq('data_checkin', today)
        const map: Record<string, any> = {}
        ;(saved || []).forEach((p: any) => { map[p.apartament_id] = p })
        const pretMap: Record<string, { booking: string; airbnb: string }> = {}
        list.forEach((a: any) => {
          pretMap[a.id] = {
            booking: map[a.id]?.pret_booking?.toString() || '',
            airbnb: map[a.id]?.pret_airbnb?.toString() || '',
          }
        })
        setPreturi(pretMap)
      })
  }, [])

  async function loadOcupate(data: string, aptIds: string[]) {
    const { data: rez } = await supabase.from('rezervari')
      .select('apartament_id')
      .lte('data_checkin', data)
      .gt('data_checkout', data)
      .neq('status_rezervare', 'anulata')
      .in('apartament_id', aptIds)
    setOcupate(new Set((rez || []).map((r: any) => r.apartament_id)))
  }

  function buildUrl(baseUrl: string, platform: string, checkin: string) {
    if (!checkin) checkin = today
    if (!baseUrl) return ''
    const coD = new Date(checkin + 'T12:00:00'); coD.setDate(coD.getDate() + 1)
    const checkout = fmt(coD)
    if (platform === 'booking' || baseUrl.includes('booking.com')) {
      return baseUrl.split('?')[0] + `?checkin=${checkin}&checkout=${checkout}&group_adults=2&no_rooms=1`
    }
    if (platform === 'airbnb' || baseUrl.includes('airbnb.')) {
      const roomMatch = baseUrl.match(/airbnb\.com\/rooms\/(\d+)/)
      if (roomMatch) return `https://www.airbnb.com/rooms/${roomMatch[1]}?check_in=${checkin}&check_out=${checkout}&adults=2`
      return baseUrl.split('?')[0] + `?check_in=${checkin}&check_out=${checkout}&adults=2`
    }
    return baseUrl
  }

  async function savePret(aptId: string, checkin: string) {
    const p = preturi[aptId]
    if (!p?.booking && !p?.airbnb) { show('error', 'Introdu cel puțin un preț'); return }
    setSaving(aptId)
    await supabase.from('preturi_live').upsert({
      apartament_id: aptId, data_checkin: checkin,
      pret_booking: p.booking ? parseInt(p.booking) : null,
      pret_airbnb: p.airbnb ? parseInt(p.airbnb) : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'apartament_id,data_checkin' })
    setSaving(null)
    show('success', 'Preț salvat!')
  }

  function updatePret(aptId: string, field: 'booking' | 'airbnb', val: string) {
    setPreturi(prev => ({ ...prev, [aptId]: { ...prev[aptId], [field]: val } }))
  }

  function changeData(data: string) {
    setDataSelectata(data)
    if (!apts.length) return
    supabase.from('preturi_live')
      .select('*').in('apartament_id', apts.map(a => a.id))
      .eq('data_checkin', data)
      .then(({ data: saved }) => {
        const pretMap: Record<string, { booking: string; airbnb: string }> = {}
        apts.forEach(a => {
          const p = (saved || []).find((x: any) => x.apartament_id === a.id)
          pretMap[a.id] = { booking: p?.pret_booking?.toString() || '', airbnb: p?.pret_airbnb?.toString() || '' }
        })
        setPreturi(pretMap)
      })
  }

  // ── Booking scan via Claude API ──────────────────────────────────────────
  const handleScan = useCallback(async () => {
    if (!checkinMonitor || !checkoutMonitor) { show('error', 'Selectează perioada'); return }
    setScan({ status: 'scanning', results: [], checkin: checkinMonitor, checkout: checkoutMonitor })

    try {
      const bookingUrl = buildBookingSearchUrl(checkinMonitor, checkoutMonitor)

      const prompt = `Folosind browser-ul, navighează la acest URL și extrage primele 5 proprietăți listate (sortate după preț mic):
URL: ${bookingUrl}

Pași:
1. Navighează la URL
2. Așteaptă 3 secunde să se încarce pagina
3. Dacă apare un banner/popup de cookie, închide-l
4. Extrage primele 5 proprietăți cu numele și prețul per noapte în RON

Returnează DOAR un JSON array, fără alt text:
[{"rank":1,"name":"Numele proprietatii","priceText":"182 lei","price":182},...]`

      const response = await fetch('/api/booking-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, checkin: checkinMonitor, checkout: checkoutMonitor, bookingUrl }),
      })

      if (!response.ok) throw new Error(`API error: ${response.status}`)
      const { results: rawResults, error } = await response.json()
      if (error) throw new Error(error)

      const results: BookingResult[] = (rawResults || []).slice(0, 5).map((item: any, idx: number) => {
        const { isOurs, matchedCode } = isOurProperty(item.name || '')
        return {
          rank: item.rank || idx + 1,
          name: item.name || 'Necunoscut',
          price: typeof item.price === 'number' ? item.price : parseInt(item.price) || 0,
          priceText: item.priceText || `${item.price} lei`,
          isOurs, matchedCode,
        }
      })

      if (!results.length) throw new Error('Nu s-au găsit rezultate. Încearcă din nou.')

      const lowestPrice = Math.min(...results.map(r => r.price))
      const ourResults = results.filter(r => r.isOurs)
      const weAreLowest = ourResults.some(r => r.price === lowestPrice)
      const ourLowestRank = ourResults.length ? Math.min(...ourResults.map(r => r.rank)) : undefined

      setScan({
        status: 'done', results, lowestPrice, weAreLowest, ourLowestRank,
        checkin: checkinMonitor, checkout: checkoutMonitor,
        scannedAt: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
      })
    } catch (err: any) {
      setScan({ status: 'error', results: [], errorMsg: err.message || 'Eroare necunoscută' })
    }
  }, [checkinMonitor, checkoutMonitor])

  // ── Styles ───────────────────────────────────────────────────────────────
  const panel: React.CSSProperties = {
    background: 'rgba(214,228,244,0.05)', border: '1px solid rgba(159,215,255,0.1)',
    borderRadius: 14, overflow: 'hidden', marginBottom: 14,
  }
  const inp: React.CSSProperties = {
    width: 80, padding: '4px 8px', borderRadius: 6,
    border: '1px solid rgba(100,160,255,0.2)',
    background: 'rgba(20,38,65,0.8)', color: 'rgba(214,228,244,0.9)',
    fontSize: 13, outline: 'none', textAlign: 'center' as const,
    fontFamily: 'monospace', fontWeight: 600,
  }
  const dateInp: React.CSSProperties = {
    padding: '5px 10px', borderRadius: 7, fontSize: 12,
    border: '1px solid rgba(100,160,255,0.2)',
    background: 'rgba(20,38,65,0.8)', color: 'rgba(214,228,244,0.9)', outline: 'none',
  }

  return (
    <>
      <PageHeader title="💰 Prețuri live" subtitle="Booking.com & Airbnb" />
      <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>

        {/* Selector dată */}
        <div style={{ ...panel }}>
          <div style={{ padding: '12px 16px', display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            {QUICK.map(({ label, val }) => (
              <button key={val} onClick={() => changeData(val)}
                style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${dataSelectata === val ? 'rgba(77,163,255,0.5)' : 'rgba(159,215,255,0.15)'}`,
                  background: dataSelectata === val ? 'rgba(77,163,255,0.15)' : 'transparent',
                  color: dataSelectata === val ? '#7BC8FF' : 'rgba(159,215,255,0.5)',
                }}>
                {label}
              </button>
            ))}
            <input type="date" value={dataSelectata} onChange={e => changeData(e.target.value)}
              style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(100,160,255,0.2)', background: 'rgba(20,38,65,0.8)', color: 'rgba(214,228,244,0.9)', fontSize: 12, outline: 'none' }} />
          </div>
        </div>

        {/* Tabel apartamente */}
        <div style={{ ...panel }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(159,215,255,0.08)', fontSize: 11, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>
            Check-in: {dataSelectata} — introduci prețul manual sau deschizi linkul
          </div>
          {apts.map((apt, i) => (
            <div key={apt.id} style={{ padding: '10px 16px', borderBottom: i < apts.length - 1 ? '1px solid rgba(159,215,255,0.05)' : 'none', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 60 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>{apt.nota}</span>
                <span title={ocupate.has(apt.id) ? 'Ocupat' : 'Disponibil'} style={{ fontSize: 10, lineHeight: 1 }}>
                  {ocupate.has(apt.id) ? '🔴' : '🟢'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(77,163,255,0.5)', minWidth: 14 }}>🏨</span>
                <input type="number" placeholder="RON" value={preturi[apt.id]?.booking || ''} onChange={e => updatePret(apt.id, 'booking', e.target.value)} style={inp} />
                {apt._bk && (
                  <a href={buildUrl(apt._bk, 'booking', dataSelectata || today)} target="_blank" rel="noopener"
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(77,163,255,0.3)', color: '#7BC8FF', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                    Deschide Bk ↗
                  </a>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(248,113,113,0.5)', minWidth: 14 }}>🏠</span>
                <input type="number" placeholder="RON" value={preturi[apt.id]?.airbnb || ''} onChange={e => updatePret(apt.id, 'airbnb', e.target.value)} style={inp} />
                {apt._ab && (
                  <a href={buildUrl(apt._ab, 'airbnb', dataSelectata || today)} target="_blank" rel="noopener"
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.3)', color: '#F87171', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                    Deschide Ab ↗
                  </a>
                )}
              </div>
              {preturi[apt.id]?.booking && preturi[apt.id]?.airbnb && (
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: parseInt(preturi[apt.id].booking) > parseInt(preturi[apt.id].airbnb) ? '#FCD34D' : '#4ADE80' }}>
                  {parseInt(preturi[apt.id].booking) > parseInt(preturi[apt.id].airbnb)
                    ? `Bk +${parseInt(preturi[apt.id].booking) - parseInt(preturi[apt.id].airbnb)}`
                    : `Ab +${parseInt(preturi[apt.id].airbnb) - parseInt(preturi[apt.id].booking)}`}
                </div>
              )}
              <button onClick={() => savePret(apt.id, dataSelectata)} disabled={saving === apt.id}
                style={{ marginLeft: 'auto', padding: '4px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.08)', color: '#4ADE80', opacity: saving === apt.id ? 0.5 : 1 }}>
                {saving === apt.id ? '...' : '✓ Salvează'}
              </button>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════════
            BOOKING MONITOR
        ══════════════════════════════════════════════ */}
        <div style={{ ...panel, border: '1px solid rgba(99,179,237,0.2)', background: 'rgba(15,30,55,0.6)' }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(99,179,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>🔍</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#93C5FD', letterSpacing: '.03em' }}>Monitorizare Booking</span>
              <span style={{ fontSize: 10, color: 'rgba(147,197,253,0.4)', fontFamily: 'monospace' }}>TOP 5 · IAȘI · AUTOMAT</span>
            </div>
            {scan.scannedAt && (
              <span style={{ fontSize: 10, color: 'rgba(147,197,253,0.4)', fontFamily: 'monospace' }}>
                Ultima scanare: {scan.scannedAt} · {scan.checkin} → {scan.checkout}
              </span>
            )}
          </div>

          {/* Controls */}
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const, borderBottom: '1px solid rgba(99,179,237,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'rgba(147,197,253,0.5)' }}>Check-in</span>
              <input type="date" value={checkinMonitor}
                onChange={e => {
                  setCheckinMonitor(e.target.value)
                  const d = new Date(e.target.value + 'T12:00:00'); d.setDate(d.getDate() + 1)
                  setCheckoutMonitor(fmt(d))
                }} style={dateInp} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'rgba(147,197,253,0.5)' }}>Check-out</span>
              <input type="date" value={checkoutMonitor} onChange={e => setCheckoutMonitor(e.target.value)} style={dateInp} />
            </div>
            <button onClick={handleScan} disabled={scan.status === 'scanning'}
              style={{
                marginLeft: 'auto', padding: '7px 18px', borderRadius: 8, fontSize: 12, cursor: scan.status === 'scanning' ? 'wait' : 'pointer',
                border: '1px solid rgba(99,179,237,0.4)', background: scan.status === 'scanning' ? 'rgba(99,179,237,0.05)' : 'rgba(99,179,237,0.15)',
                color: '#93C5FD', fontWeight: 700, opacity: scan.status === 'scanning' ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
              }}>
              {scan.status === 'scanning' ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'pulse 1s ease-in-out infinite' }}>⏳</span>
                  Se scanează Booking...
                </>
              ) : '🔍 Caută pe Booking'}
            </button>
          </div>

          {/* Error */}
          {scan.status === 'error' && (
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 12, color: '#F87171', fontWeight: 600 }}>{scan.errorMsg}</div>
                <div style={{ fontSize: 11, color: 'rgba(248,113,113,0.5)', marginTop: 2 }}>
                  Verifică că extensia Claude in Chrome este conectată și încearcă din nou.
                </div>
              </div>
              <button onClick={() => setScan({ status: 'idle', results: [] })}
                style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '1px solid rgba(248,113,113,0.2)', background: 'transparent', color: 'rgba(248,113,113,0.5)' }}>
                ✕ Închide
              </button>
            </div>
          )}

          {/* Scanning state */}
          {scan.status === 'scanning' && (
            <div style={{ padding: '20px 16px', textAlign: 'center' as const }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 13, color: '#93C5FD', fontWeight: 600, marginBottom: 4 }}>
                Se caută pe Booking.com...
              </div>
              <div style={{ fontSize: 11, color: 'rgba(147,197,253,0.5)' }}>
                {checkinMonitor} → {checkoutMonitor} · 2 adulți · sortare după preț
              </div>
            </div>
          )}

          {/* Results */}
          {scan.status === 'done' && scan.results.length > 0 && (
            <div>
              {/* Banner */}
              <div style={{
                padding: '12px 16px',
                background: scan.weAreLowest ? 'rgba(74,222,128,0.08)' : scan.ourLowestRank ? 'rgba(252,211,77,0.06)' : 'rgba(99,179,237,0.05)',
                borderBottom: '1px solid rgba(99,179,237,0.08)',
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const,
              }}>
                <span style={{ fontSize: 20 }}>
                  {scan.weAreLowest ? '🏆' : scan.ourLowestRank ? '📍' : '👀'}
                </span>
                <div style={{ flex: 1 }}>
                  {scan.weAreLowest ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#4ADE80' }}>Tu ești cel mai ieftin din piață! 🎉</div>
                  ) : scan.ourLowestRank ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#FCD34D' }}>
                      Ești pe locul #{scan.ourLowestRank} — prețul minim în piață: <span style={{ fontFamily: 'monospace' }}>{scan.lowestPrice} lei</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(147,197,253,0.7)' }}>
                      Niciun apartament AB Homes în top 5 — prețul minim: <span style={{ fontFamily: 'monospace' }}>{scan.lowestPrice} lei</span>
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'rgba(147,197,253,0.4)', marginTop: 2 }}>
                    {scan.checkin} → {scan.checkout} · 2 adulți · sortat după preț
                  </div>
                </div>
                <button onClick={handleScan}
                  style={{ padding: '5px 14px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '1px solid rgba(99,179,237,0.25)', background: 'rgba(99,179,237,0.08)', color: 'rgba(147,197,253,0.7)' }}>
                  ↺ Rescanează
                </button>
              </div>

              {/* Top 5 list */}
              {scan.results.map((r, i) => (
                <div key={i} style={{
                  padding: '10px 16px',
                  borderBottom: i < scan.results.length - 1 ? '1px solid rgba(99,179,237,0.06)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: r.isOurs ? 'rgba(74,222,128,0.04)' : 'transparent',
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                    background: r.rank === 1 ? 'rgba(252,211,77,0.15)' : 'rgba(99,179,237,0.08)',
                    color: r.rank === 1 ? '#FCD34D' : 'rgba(147,197,253,0.5)',
                    border: `1px solid ${r.rank === 1 ? 'rgba(252,211,77,0.3)' : 'rgba(99,179,237,0.15)'}`,
                  }}>
                    {r.rank}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: r.isOurs ? 700 : 500, color: r.isOurs ? '#4ADE80' : '#E8F4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {r.isOurs && <span style={{ marginRight: 4 }}>⭐</span>}
                      {r.name}
                    </div>
                    {r.isOurs && r.matchedCode && (
                      <div style={{ fontSize: 10, color: 'rgba(74,222,128,0.5)', marginTop: 1 }}>AB Homes · {r.matchedCode}</div>
                    )}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, flexShrink: 0, color: r.price === scan.lowestPrice ? '#4ADE80' : r.isOurs ? '#93C5FD' : 'rgba(214,228,244,0.8)' }}>
                    {r.priceText}
                    {r.price === scan.lowestPrice && <span style={{ fontSize: 9, marginLeft: 4, color: '#4ADE80', verticalAlign: 'super' }}>MIN</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Idle */}
          {scan.status === 'idle' && (
            <div style={{ padding: '20px 16px', textAlign: 'center' as const, color: 'rgba(147,197,253,0.3)', fontSize: 12 }}>
              Apasă "Caută pe Booking" — se deschide automat Booking.com și extrage top 5 apartamente din Iași după preț
            </div>
          )}
        </div>

      </div>
      <Toast toast={toast} />
    </>
  )
}
