'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Card, CardHeader, CardTitle, CanalBadge, Badge, PageLoading } from '@/components/ui'
import { Building2, CalendarCheck, TrendingUp, DollarSign, AlertCircle, CheckSquare, ArrowUpRight, LogIn, LogOut, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'

function KpiCard({ label, value, sub, color, accent, icon }: { label: string; value: string | number; sub?: string; color: string; accent: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.52)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(255,255,255,0.78)',
      borderRadius: 14, padding: '15px 16px',
      borderTop: `2.5px solid ${accent}`,
      transition: 'transform 0.15s',
      cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color, letterSpacing: -0.8, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: accent, opacity: 0.8 }}>{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ apartamenteActive: 0, rezervariActive: 0, incasariLuna: 0, comisioaneLuna: 0, deconturiNeplata: 0, taskuriUrgente: 0 })
  const [rezervariAzi, setRezervariAzi] = useState<any[]>([])
  const [rezervariRecente, setRezervariRecente] = useState<any[]>([])
  const [deconturiPending, setDeconturiPending] = useState<any[]>([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const primaZiLuna = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')
    const [
      { count: apCount },
      { count: rezCount },
      { data: rezervariLuna },
      { data: checkinAzi },
      { data: recente },
      { data: deconturi },
      { count: taskCount },
    ] = await Promise.all([
      supabase.from('apartamente').select('*', { count: 'exact', head: true }).eq('status', 'activ'),
      supabase.from('rezervari').select('*', { count: 'exact', head: true }).in('status_rezervare', ['confirmata', 'finalizata']).gte('data_checkout', today),
      supabase.from('rezervari').select('suma_incasata, comision_administrator').gte('data_checkin', primaZiLuna).in('status_rezervare', ['confirmata', 'finalizata']),
      supabase.from('rezervari').select('*, apartament:apartamente(nume)').or(`data_checkin.eq.${today},data_checkout.eq.${today}`).order('data_checkin'),
      supabase.from('rezervari').select('*, apartament:apartamente(nume)').order('created_at', { ascending: false }).limit(6),
      supabase.from('deconturi').select('*, apartament:apartamente(nume), proprietar:proprietari(nume)').in('status', ['draft', 'aprobat']).order('created_at', { ascending: false }).limit(5),
      supabase.from('taskuri').select('*', { count: 'exact', head: true }).eq('prioritate', 'urgenta').eq('status', 'de_facut'),
    ])
    const incasari = rezervariLuna?.reduce((s: number, r: any) => s + Number(r.suma_incasata || 0), 0) || 0
    const comisioane = rezervariLuna?.reduce((s: number, r: any) => s + Number(r.comision_administrator || 0), 0) || 0
    setStats({ apartamenteActive: apCount || 0, rezervariActive: rezCount || 0, incasariLuna: incasari, comisioaneLuna: comisioane, deconturiNeplata: deconturi?.length || 0, taskuriUrgente: taskCount || 0 })
    setRezervariAzi(checkinAzi || [])
    setRezervariRecente(recente || [])
    setDeconturiPending(deconturi || [])
    setLoading(false)
  }

  if (loading) return (<><PageHeader title="Dashboard" subtitle="Se încarcă..." /><PageLoading /></>)

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const luna = format(new Date(), 'MMMM yyyy', { locale: ro })

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={format(new Date(), 'EEEE, d MMMM yyyy', { locale: ro })}
        actions={
          <Link href="/rezervari" style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 18px', borderRadius: 10,
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 500, textDecoration: 'none',
            transition: 'background 0.15s',
          }}>
            + Rezervare nouă
          </Link>
        }
      />
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
          <KpiCard label="Apartamente active" value={stats.apartamenteActive} color="var(--denim-dark)" accent="#2E76A3" sub="în administrare" icon={<Building2 size={14} color="#2E76A3"/>} />
          <KpiCard label="Rezervări active" value={stats.rezervariActive} color="var(--text)" accent="#87A987" sub="în curs" icon={<CalendarCheck size={14} color="#87A987"/>} />
          <KpiCard label={`Încasări ${luna}`} value={`${stats.incasariLuna.toLocaleString('ro-RO')} RON`} color="#2A7A6F" accent="#52BE80" sub="venituri brute" icon={<DollarSign size={14} color="#52BE80"/>} />
          <KpiCard label={`Comisioane ${luna}`} value={`${stats.comisioaneLuna.toLocaleString('ro-RO')} RON`} color="var(--denim-dark)" accent="#2E76A3" sub="câștig firmă" icon={<TrendingUp size={14} color="#2E76A3"/>} />
          <KpiCard label="Deconturi neplatite" value={stats.deconturiNeplata} color={stats.deconturiNeplata > 0 ? 'var(--warning)' : 'var(--text)'} accent={stats.deconturiNeplata > 0 ? '#C8903A' : '#87A987'} sub="în așteptare" icon={<AlertCircle size={14} color={stats.deconturiNeplata > 0 ? '#C8903A' : '#87A987'}/>} />
          <KpiCard label="Task-uri urgente" value={stats.taskuriUrgente} color={stats.taskuriUrgente > 0 ? 'var(--danger)' : 'var(--text)'} accent={stats.taskuriUrgente > 0 ? '#B85450' : '#87A987'} sub="necesită atenție" icon={<CheckSquare size={14} color={stats.taskuriUrgente > 0 ? '#B85450' : '#87A987'}/>} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <div style={{ background: 'rgba(255,255,255,0.52)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.78)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid rgba(46,118,163,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Activitate azi</span>
              </div>
              <Link href="/rezervari" style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>Toate <ArrowUpRight size={11}/></Link>
            </div>
            {rezervariAzi.length === 0 ? (
              <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>Nicio activitate azi</div>
            ) : rezervariAzi.map((r: any) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid rgba(46,118,163,0.05)' }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: r.data_checkin === todayStr ? 'rgba(200,144,58,0.12)' : 'rgba(91,61,138,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {r.data_checkin === todayStr ? <LogIn size={13} color="#C8903A"/> : <LogOut size={13} color="#5B3D8A"/>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.data_checkin === todayStr ? 'Check-in' : 'Check-out'} · {r.nume_client}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.apartament?.nume || '—'}</div>
                </div>
                <CanalBadge canal={r.canal}/>
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.52)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.78)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid rgba(46,118,163,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Rezervări recente</span>
              <Link href="/rezervari" style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>Toate <ArrowUpRight size={11}/></Link>
            </div>
            {rezervariRecente.length === 0 ? (
              <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>Nicio rezervare</div>
            ) : rezervariRecente.map((r: any) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid rgba(46,118,163,0.05)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nume_client}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.data_checkin} → {r.data_checkout}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--verde-dark)', fontVariantNumeric: 'tabular-nums' }}>{Number(r.suma_incasata).toLocaleString('ro-RO')} RON</div>
                  <CanalBadge canal={r.canal}/>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.52)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.78)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid rgba(46,118,163,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Deconturi în așteptare</span>
              <Link href="/deconturi" style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>Toate <ArrowUpRight size={11}/></Link>
            </div>
            {deconturiPending.length === 0 ? (
              <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>Niciun decont în așteptare 🎉</div>
            ) : deconturiPending.map((d: any) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid rgba(46,118,163,0.05)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.apartament?.nume || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{d.proprietar?.nume || '—'} · {d.luna}/{d.an}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--verde-dark)', fontVariantNumeric: 'tabular-nums' }}>{Number(d.suma_neta_proprietar).toLocaleString('ro-RO')} RON</div>
                  <Badge color={d.status === 'aprobat' ? 'amber' : 'gray'}>{d.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
