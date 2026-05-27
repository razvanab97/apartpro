'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Card, CardHeader, CardTitle, StatCard, Badge, CanalBadge, PageLoading } from '@/components/ui'
import { Building2, CalendarCheck, TrendingUp, DollarSign, AlertCircle, CheckSquare, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ apartamenteActive:0, rezervariActive:0, incasariLuna:0, comisioaneLuna:0, deconturiNeplata:0, taskuriUrgente:0 })
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
      supabase.from('rezervari').select('*', { count: 'exact', head: true }).in('status_rezervare', ['confirmata','finalizata']).gte('data_checkout', today),
      supabase.from('rezervari').select('suma_incasata, comision_administrator').gte('data_checkin', primaZiLuna).in('status_rezervare', ['confirmata','finalizata']),
      supabase.from('rezervari').select('*, apartament:apartamente(nume)').or(`data_checkin.eq.${today},data_checkout.eq.${today}`).order('data_checkin'),
      supabase.from('rezervari').select('*, apartament:apartamente(nume)').order('created_at', { ascending: false }).limit(6),
      supabase.from('deconturi').select('*, apartament:apartamente(nume), proprietar:proprietari(nume)').in('status', ['draft','aprobat']).order('created_at', { ascending: false }).limit(5),
      supabase.from('taskuri').select('*', { count: 'exact', head: true }).eq('prioritate', 'urgenta').eq('status', 'de_facut'),
    ])
    const incasari = rezervariLuna?.reduce((s:number, r:any) => s + Number(r.suma_incasata||0), 0)||0
    const comisioane = rezervariLuna?.reduce((s:number, r:any) => s + Number(r.comision_administrator||0), 0)||0
    setStats({ apartamenteActive: apCount||0, rezervariActive: rezCount||0, incasariLuna: incasari, comisioaneLuna: comisioane, deconturiNeplata: deconturi?.length||0, taskuriUrgente: taskCount||0 })
    setRezervariAzi(checkinAzi||[])
    setRezervariRecente(recente||[])
    setDeconturiPending(deconturi||[])
    setLoading(false)
  }

  if (loading) return (<><PageHeader title="Dashboard" subtitle="Se încarcă..." /><PageLoading /></>)

  const luna = format(new Date(), 'MMMM yyyy', { locale: ro })
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <>
      <PageHeader title="Dashboard" subtitle={format(new Date(), 'EEEE, d MMMM yyyy', { locale: ro })} />
      <div className="p-6 space-y-5">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          <StatCard label="Apartamente active" value={stats.apartamenteActive} color="text-[#4f7cff]" />
          <StatCard label="Rezervări active" value={stats.rezervariActive} />
          <StatCard label={`Încasări ${luna}`} value={`${stats.incasariLuna.toLocaleString('ro-RO')} RON`} color="text-[#2dd4a0]" />
          <StatCard label={`Comisioane ${luna}`} value={`${stats.comisioaneLuna.toLocaleString('ro-RO')} RON`} color="text-[#a78bfa]" />
          <StatCard label="Deconturi neplatite" value={stats.deconturiNeplata} color={stats.deconturiNeplata>0?'text-[#f5a623]':'text-[#e8edf8]'} />
          <StatCard label="Task-uri urgente" value={stats.taskuriUrgente} color={stats.taskuriUrgente>0?'text-[#ff5b5b]':'text-[#e8edf8]'} />
        </div>

        <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Card>
            <CardHeader>
              <CardTitle>Activitate azi</CardTitle>
              <Link href="/rezervari" className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>Toate <ArrowUpRight size={12}/></Link>
            </CardHeader>
            {rezervariAzi.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text3)' }}>Nicio activitate azi</p>
            ) : rezervariAzi.map((r:any) => (
              <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg mb-1.5" style={{ background: 'var(--bg3)' }}>
                <span className="text-base">{r.data_checkin === todayStr ? '🟢' : '🟡'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                    {r.data_checkin === todayStr ? 'Check-in' : 'Check-out'} · {r.nume_client}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--text3)' }}>{r.apartament?.nume||'—'}</p>
                </div>
                <CanalBadge canal={r.canal}/>
              </div>
            ))}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rezervări recente</CardTitle>
              <Link href="/rezervari" className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>Toate <ArrowUpRight size={12}/></Link>
            </CardHeader>
            {rezervariRecente.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text3)' }}>Nicio rezervare</p>
            ) : rezervariRecente.map((r:any) => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{r.nume_client}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text3)' }}>{r.data_checkin} → {r.data_checkout}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <p className="text-xs font-mono font-semibold" style={{ color: 'var(--green)' }}>{Number(r.suma_incasata).toLocaleString('ro-RO')} RON</p>
                  <CanalBadge canal={r.canal}/>
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deconturi în așteptare</CardTitle>
              <Link href="/deconturi" className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>Toate <ArrowUpRight size={12}/></Link>
            </CardHeader>
            {deconturiPending.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text3)' }}>Niciun decont în așteptare 🎉</p>
            ) : deconturiPending.map((d:any) => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{d.apartament?.nume||'—'}</p>
                  <p className="text-[11px]" style={{ color: 'var(--text3)' }}>{d.proprietar?.nume||'—'} · {d.luna}/{d.an}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <p className="text-xs font-mono font-semibold" style={{ color: 'var(--green)' }}>{Number(d.suma_neta_proprietar).toLocaleString('ro-RO')} RON</p>
                  <Badge color={d.status==='aprobat'?'amber':'gray'}>{d.status}</Badge>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  )
}
