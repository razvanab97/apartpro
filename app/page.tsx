'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { CanalBadge, Badge, PageLoading } from '@/components/ui'
import { Building2, CalendarCheck, TrendingUp, DollarSign, AlertCircle, CheckSquare, ArrowUpRight, LogIn, LogOut, Activity, Percent } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'

// Sparkline SVG mini chart
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 80, h = 28
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.85" />
    </svg>
  )
}

// Revenue bar chart
function RevenueChart({ data }: { data: { luna: string; valoare: number; comision: number }[] }) {
  const max = Math.max(...data.map(d => d.valoare)) || 1
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, padding: '0 4px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: 64, gap: 1 }}>
            <div style={{
              width: '100%', borderRadius: '3px 3px 0 0',
              background: i === data.length - 1 ? 'rgba(77,163,255,0.85)' : 'rgba(77,163,255,0.25)',
              border: i === data.length - 1 ? '1px solid rgba(159,215,255,0.5)' : '1px solid rgba(77,163,255,0.2)',
              height: `${(d.valoare / max) * 60}px`,
              transition: 'height 0.3s ease',
              position: 'relative',
            }}>
              {i === data.length - 1 && (
                <div style={{
                  position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
                  fontSize: 9, color: '#4DA3FF', whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 600,
                }}>{(d.valoare / 1000).toFixed(1)}k</div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)', fontFamily: 'monospace' }}>{d.luna}</div>
        </div>
      ))}
    </div>
  )
}

const DEMO_REVENUE = [
  { luna: 'Ian', valoare: 6200, comision: 930 },
  { luna: 'Feb', valoare: 5800, comision: 870 },
  { luna: 'Mar', valoare: 7400, comision: 1110 },
  { luna: 'Apr', valoare: 8100, comision: 1215 },
  { luna: 'Mai', valoare: 9200, comision: 1380 },
  { luna: 'Iun', valoare: 11400, comision: 1710 },
]
const SPARKLINE_DATA = [42, 45, 38, 52, 48, 61, 55, 68, 72, 65, 78, 82]

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    apartamenteActive: 0, rezervariActive: 0,
    incasariLuna: 0, comisioaneLuna: 0,
    deconturiNeplata: 0, taskuriUrgente: 0,
  })
  const [rezervariRecente, setRezervariRecente] = useState<any[]>([])
  const [rezervariAzi, setRezervariAzi] = useState<any[]>([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const primaZiLuna = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')
    const [
      { count: apCount }, { count: rezCount },
      { data: rezervariLuna },
      { data: checkinAzi },
      { data: recente },
      { data: deconturi },
      { count: taskCount },
    ] = await Promise.all([
      supabase.from('apartamente').select('*', { count: 'exact', head: true }).eq('status', 'activ'),
      supabase.from('rezervari').select('*', { count: 'exact', head: true }).in('status_rezervare', ['confirmata', 'finalizata']).gte('data_checkout', today),
      supabase.from('rezervari').select('suma_incasata,comision_administrator').gte('data_checkin', primaZiLuna).in('status_rezervare', ['confirmata', 'finalizata']),
      supabase.from('rezervari').select('*,apartament:apartamente(nume)').or(`data_checkin.eq.${today},data_checkout.eq.${today}`).order('data_checkin'),
      supabase.from('rezervari').select('*,apartament:apartamente(nume,comision_procent)').order('created_at', { ascending: false }).limit(8),
      supabase.from('deconturi').select('*').in('status', ['draft', 'aprobat']),
      supabase.from('taskuri').select('*', { count: 'exact', head: true }).eq('prioritate', 'urgenta').eq('status', 'de_facut'),
    ])
    const inc = rezervariLuna?.reduce((s: number, r: any) => s + Number(r.suma_incasata || 0), 0) || 0
    const com = rezervariLuna?.reduce((s: number, r: any) => s + Number(r.comision_administrator || 0), 0) || 0
    setStats({
      apartamenteActive: apCount || 0, rezervariActive: rezCount || 0,
      incasariLuna: inc, comisioaneLuna: com,
      deconturiNeplata: deconturi?.length || 0, taskuriUrgente: taskCount || 0,
    })
    setRezervariAzi(checkinAzi || [])
    setRezervariRecente(recente || [])
    setLoading(false)
  }

  if (loading) return <><PageHeader title="Dashboard" /><PageLoading /></>

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const luna = format(new Date(), 'MMMM yyyy', { locale: ro })
  const gradOcupare = stats.apartamenteActive > 0
    ? Math.round((stats.rezervariActive / stats.apartamenteActive) * 100)
    : 0

  // Panel styles
  const panel: React.CSSProperties = {
    background: 'rgba(214,228,244,0.05)',
    backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(159,215,255,0.1)',
    borderRadius: 10,
    overflow: 'hidden',
  }
  const panelHdr: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 14px',
    background: 'rgba(14,27,43,0.5)',
    borderBottom: '1px solid rgba(159,215,255,0.07)',
  }
  const panelTitle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.55)',
    textTransform: 'uppercase', letterSpacing: '0.8px',
  }
  const bigNum: React.CSSProperties = {
    fontFamily: 'monospace', fontSize: 28, fontWeight: 700,
    color: '#FFFFFF', letterSpacing: -1, lineHeight: 1,
  }
  const label: React.CSSProperties = { fontSize: 10, color: 'rgba(159,215,255,0.4)', marginTop: 4 }
  const sub: React.CSSProperties = { fontSize: 11, color: '#4DA3FF', marginTop: 2 }

  return (
    <>
      {/* COMPACT TOP BAR */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 20px',
        background: 'rgba(14,27,43,0.65)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(159,215,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', letterSpacing: -0.2 }}>
            Dashboard
          </span>
          <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', fontFamily: 'monospace' }}>
            {format(new Date(), 'EEE dd MMM yyyy · HH:mm', { locale: ro })}
          </span>
          {/* Live indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.8)' }} />
            <span style={{ fontSize: 10, color: '#22C55E', fontFamily: 'monospace' }}>LIVE</span>
          </div>
        </div>
        <Link href="/rezervari" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 7,
          background: 'rgba(77,163,255,0.85)',
          border: '1px solid rgba(159,215,255,0.35)',
          color: '#FFFFFF', fontSize: 12, fontWeight: 500, textDecoration: 'none',
        }}>+ Rezervare nouă</Link>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ROW 1 — KPI STRIP */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
          {[
            { label: 'APARTAMENTE', value: stats.apartamenteActive, accent: '#4DA3FF', icon: <Building2 size={12} />, sub2: 'active' },
            { label: 'REZERVĂRI ACTIVE', value: stats.rezervariActive, accent: '#9FD7FF', icon: <CalendarCheck size={12} />, sub2: 'în curs' },
            { label: `ÎNCASĂRI ${luna.split(' ')[0].toUpperCase()}`, value: `${stats.incasariLuna.toLocaleString('ro-RO')}`, accent: '#22C55E', icon: <DollarSign size={12} />, sub2: 'RON' },
            { label: 'COMISIOANE', value: `${stats.comisioaneLuna.toLocaleString('ro-RO')}`, accent: '#4DA3FF', icon: <Percent size={12} />, sub2: 'RON firmă' },
            { label: 'GRAD OCUPARE', value: `${gradOcupare}%`, accent: gradOcupare > 60 ? '#22C55E' : '#F59E0B', icon: <Activity size={12} />, sub2: `${stats.rezervariActive}/${stats.apartamenteActive} ap.` },
            { label: 'TASKURI URGENTE', value: stats.taskuriUrgente, accent: stats.taskuriUrgente > 0 ? '#EF4444' : '#22C55E', icon: <CheckSquare size={12} />, sub2: 'nerezolvate' },
          ].map((k, i) => (
            <div key={i} style={{ ...panel, borderTop: `2px solid ${k.accent}` }}>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ ...panelTitle }}>{k.label}</span>
                  <span style={{ color: k.accent, opacity: 0.7 }}>{k.icon}</span>
                </div>
                <div style={{ ...bigNum, fontSize: 22, color: k.accent }}>{k.value}</div>
                <div style={{ ...label }}>{k.sub2}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ROW 2 — CHART + ACTIVITY */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 8 }}>

          {/* REVENUE CHART */}
          <div style={panel}>
            <div style={panelHdr}>
              <span style={panelTitle}>Venituri lunare</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 10, color: 'rgba(77,163,255,0.6)', fontFamily: 'monospace' }}>
                  {DEMO_REVENUE[DEMO_REVENUE.length - 1].valoare.toLocaleString('ro-RO')} RON
                </span>
                <span style={{ fontSize: 9, color: '#22C55E', fontFamily: 'monospace' }}>▲ +23.9%</span>
              </div>
            </div>
            <div style={{ padding: '16px 14px 10px' }}>
              <RevenueChart data={DEMO_REVENUE} />
              <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#4DA3FF' }}>
                    {stats.incasariLuna > 0 ? `${stats.incasariLuna.toLocaleString('ro-RO')}` : '11.400'}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)' }}>RON luna curentă</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#22C55E' }}>
                    {stats.comisioaneLuna > 0 ? `${stats.comisioaneLuna.toLocaleString('ro-RO')}` : '1.710'}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)' }}>RON comisioane</div>
                </div>
              </div>
            </div>
          </div>

          {/* REZERVARI RECENTE TABLE */}
          <div style={panel}>
            <div style={panelHdr}>
              <span style={panelTitle}>Rezervări recente</span>
              <Link href="/rezervari" style={{ fontSize: 9, color: '#4DA3FF', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
                TOATE <ArrowUpRight size={9} />
              </Link>
            </div>
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['CLIENT', 'APARTAMENT', 'CI', 'CO', 'SUMĂ', 'CANAL'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: 'rgba(159,215,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(159,215,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rezervariRecente.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '20px 10px', textAlign: 'center', fontSize: 12, color: 'rgba(159,215,255,0.3)' }}>Nicio rezervare</td></tr>
                  ) : rezervariRecente.map((r: any) => (
                    <tr key={r.id} style={{ cursor: 'pointer' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 500, color: '#FFFFFF', borderBottom: '1px solid rgba(159,215,255,0.04)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>{r.nume_client}</td>
                      <td style={{ padding: '8px 10px', fontSize: 11, color: 'rgba(159,215,255,0.55)', borderBottom: '1px solid rgba(159,215,255,0.04)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90 }}>{r.apartament?.nume || '—'}</td>
                      <td style={{ padding: '8px 10px', fontSize: 10, color: 'rgba(214,228,244,0.5)', borderBottom: '1px solid rgba(159,215,255,0.04)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.data_checkin?.slice(5)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 10, color: 'rgba(214,228,244,0.5)', borderBottom: '1px solid rgba(159,215,255,0.04)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.data_checkout?.slice(5)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#4ADE80', borderBottom: '1px solid rgba(159,215,255,0.04)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{Number(r.suma_incasata).toLocaleString('ro-RO')}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(159,215,255,0.04)', whiteSpace: 'nowrap' }}><CanalBadge canal={r.canal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT COLUMN — TODAY ACTIVITY */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* CHECK-IN / CHECK-OUT AZI */}
            <div style={panel}>
              <div style={panelHdr}>
                <span style={panelTitle}>Activitate azi</span>
                <span style={{ fontSize: 9, color: 'rgba(159,215,255,0.4)', fontFamily: 'monospace' }}>
                  {rezervariAzi.length} evenimente
                </span>
              </div>
              <div style={{ maxHeight: 140, overflow: 'auto' }}>
                {rezervariAzi.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', fontSize: 11, color: 'rgba(159,215,255,0.25)' }}>Nicio activitate</div>
                ) : rezervariAzi.map((r: any) => {
                  const isCI = r.data_checkin === todayStr
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(159,215,255,0.04)' }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: isCI ? 'rgba(245,158,11,0.14)' : 'rgba(167,139,250,0.14)',
                        border: isCI ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(167,139,250,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isCI ? <LogIn size={11} color="#FCD34D" /> : <LogOut size={11} color="#C4B5FD" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nume_client}</div>
                        <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.38)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isCI ? '↓ CI' : '↑ CO'} · {r.apartament?.nume || '—'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* OCUPARE GAUGE */}
            <div style={panel}>
              <div style={panelHdr}><span style={panelTitle}>Ocupare</span></div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 32, fontWeight: 700, color: gradOcupare > 60 ? '#22C55E' : '#F59E0B', letterSpacing: -1 }}>{gradOcupare}%</span>
                  <span style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)' }}>grad ocupare</span>
                </div>
                <div style={{ height: 6, background: 'rgba(159,215,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', width: `${gradOcupare}%`, background: gradOcupare > 60 ? 'linear-gradient(90deg,#22C55E,#4ADE80)' : 'linear-gradient(90deg,#F59E0B,#FCD34D)', borderRadius: 3, transition: 'width 0.6s ease', boxShadow: gradOcupare > 60 ? '0 0 8px rgba(34,197,94,0.5)' : '0 0 8px rgba(245,158,11,0.5)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 6, padding: '6px 8px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#4ADE80' }}>{stats.rezervariActive}</div>
                    <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)' }}>OCUPATE</div>
                  </div>
                  <div style={{ background: 'rgba(77,163,255,0.08)', border: '1px solid rgba(77,163,255,0.15)', borderRadius: 6, padding: '6px 8px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#7BC8FF' }}>{Math.max(0, stats.apartamenteActive - stats.rezervariActive)}</div>
                    <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)' }}>LIBERE</div>
                  </div>
                </div>
              </div>
            </div>

            {/* SPARKLINE TREND */}
            <div style={panel}>
              <div style={panelHdr}>
                <span style={panelTitle}>Trend rezervări</span>
                <span style={{ fontSize: 9, color: '#22C55E', fontFamily: 'monospace' }}>▲ +18%</span>
              </div>
              <div style={{ padding: '10px 12px 8px' }}>
                <Sparkline data={SPARKLINE_DATA} color="#4DA3FF" />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 9, color: 'rgba(159,215,255,0.3)', fontFamily: 'monospace' }}>Ian</span>
                  <span style={{ fontSize: 9, color: 'rgba(159,215,255,0.3)', fontFamily: 'monospace' }}>Iun</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </>
  )
}
// Build: 20260528_174746
