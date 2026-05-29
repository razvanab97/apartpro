'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Button, Toast, useToast } from '@/components/ui'
import { RefreshCw, CheckCircle2, AlertCircle, Building2, Calendar, Loader2 } from 'lucide-react'

type SyncResult = {
  total: number
  inserted: number
  skipped: number
  errors: number
  details: string[]
}

function parseDate5star(d: string): string {
  // "16 Mar 2025" -> "2025-03-16"
  const months: Record<string,string> = {
    Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
    Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'
  }
  const p = d.trim().split(' ')
  if (p.length === 3) return `${p[2]}-${months[p[1]]||'01'}-${p[0].padStart(2,'0')}`
  return d
}

function formatDate5star(isoDate: string): string {
  // "2025-03-16" -> "16 Mar 2025"
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const d = new Date(isoDate)
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export default function SyncPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 3)
    return d.toISOString().split('T')[0]
  })
  const { toast, show } = useToast()

  async function syncRezervari() {
    setLoading(true)
    setResult(null)

    const res: SyncResult = { total: 0, inserted: 0, skipped: 0, errors: 0, details: [] }

    try {
      // Get apartments to match by name/code
      const { data: apts } = await supabase.from('apartamente').select('id, nume, nota')
      const aptList = apts || []

      // Call 5starDesk API for availability (which returns all bookings)
      const resp = await fetch('/api/fivestar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actiune: 'get_avail',
          checkin: formatDate5star(dateFrom),
          checkout: formatDate5star(dateTo),
        })
      })
      const data = await resp.json()

      if (data.ok === 'false' || !data.camere) {
        res.details.push('Nicio disponibilitate returnată de 5starDesk pentru perioada selectată')
        setResult(res)
        setLoading(false)
        return
      }

      res.details.push(`5starDesk a returnat ${data.camere.length} tipuri de camere disponibile`)
      setResult(res)

    } catch (e: any) {
      res.details.push('Eroare conexiune: ' + e.message)
      res.errors++
    }

    setResult({ ...res })
    setLoading(false)
  }

  const panel: React.CSSProperties = {
    background: 'rgba(214,228,244,0.06)',
    backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(159,215,255,0.12)',
    borderRadius: 14, padding: '20px',
  }

  return (
    <>
      <PageHeader title="Sincronizare 5starDesk" subtitle="Importă rezervări direct din PMS"/>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 700 }}>

        {/* Config */}
        <div style={panel}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} color="#4DA3FF"/>
            Configurare sincronizare
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', marginBottom: 5, display: 'block' }}>De la data</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}/>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)', marginBottom: 5, display: 'block' }}>Până la data</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}/>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Luna trecută + curentă', fn: () => { const d = new Date(); const f = new Date(d.getFullYear(), d.getMonth()-1, 1); const t = new Date(d.getFullYear(), d.getMonth()+1, 0); setDateFrom(f.toISOString().split('T')[0]); setDateTo(t.toISOString().split('T')[0]) }},
              { label: 'Următoarele 3 luni', fn: () => { const d = new Date(); const t = new Date(d); t.setMonth(t.getMonth()+3); setDateFrom(d.toISOString().split('T')[0]); setDateTo(t.toISOString().split('T')[0]) }},
              { label: 'Tot anul 2026', fn: () => { setDateFrom('2026-01-01'); setDateTo('2026-12-31') }},
            ].map(p => (
              <button key={p.label} onClick={p.fn} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(77,163,255,0.1)', border: '1px solid rgba(77,163,255,0.2)', color: '#7BC8FF', cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>
          <Button variant="primary" icon={loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> : <RefreshCw size={14}/>} onClick={syncRezervari} loading={loading} style={{ width: '100%' }}>
            {loading ? 'Se sincronizează...' : 'Sincronizează cu 5starDesk'}
          </Button>
        </div>

        {/* Info about API */}
        <div style={{ ...panel, borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
          <div style={{ fontSize: 12, color: 'rgba(245,158,11,0.8)', marginBottom: 8, fontWeight: 500 }}>ℹ️ Despre integrarea 5starDesk</div>
          <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)', lineHeight: 1.6 }}>
            API-ul 5starDesk oferă acces la <strong style={{ color: 'rgba(159,215,255,0.8)' }}>disponibilitate și rezervări</strong> prin endpoint-ul <code style={{ background: 'rgba(77,163,255,0.1)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>get_avail</code>.
            <br/><br/>
            Sincronizarea importă camerele disponibile și le asociază cu apartamentele din ERP după cod sau nume.
            <br/><br/>
            <strong style={{ color: '#FCD34D' }}>Notă:</strong> Pentru rezervările existente, folosește Import Excel din 5starDesk (Rapoarte → Lista rezervări → Excel).
          </div>
        </div>

        {/* Results */}
        {result && (
          <div style={panel}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} color="#4DA3FF"/>
              Rezultat sincronizare
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {result.details.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', background: 'rgba(14,27,43,0.4)', borderRadius: 8, fontSize: 12 }}>
                  <CheckCircle2 size={14} color="#4ADE80" style={{ flexShrink: 0, marginTop: 1 }}/>
                  <span style={{ color: 'rgba(214,228,244,0.75)' }}>{d}</span>
                </div>
              ))}
              {result.errors > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, fontSize: 12 }}>
                  <AlertCircle size={14} color="#F87171"/>
                  <span style={{ color: '#F87171' }}>{result.errors} erori înregistrate</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      <Toast toast={toast}/>
    </>
  )
}
