'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { RefreshCw, Check, AlertTriangle, Clock, Zap } from 'lucide-react'

export default function SyncPage() {
  const [lastSync, setLastSync] = useState<any>(null)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<any>(null)

  useEffect(() => { loadStatus() }, [])

  async function loadStatus() {
    const { data } = await supabase.from('setari').select('valoare').eq('cheie', 'last_sync').single()
    if (data?.valoare) {
      try { setLastSync(JSON.parse(data.valoare)) } catch {}
    }
  }

  async function triggerSync() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/auto-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'apartpro-cron-2026' })
      })
      const data = await res.json()
      setResult(data)
      await loadStatus()
    } catch (e: any) {
      setResult({ ok: false, error: e.message })
    }
    setSyncing(false)
  }

  const panel: React.CSSProperties = { background: 'rgba(214,228,244,0.05)', border: '0.5px solid rgba(159,215,255,0.1)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }
  const hdr: React.CSSProperties = { padding: '10px 14px', background: 'rgba(14,27,43,0.5)', borderBottom: '0.5px solid rgba(159,215,255,0.07)', display: 'flex', alignItems: 'center', gap: 8 }

  return (
    <>
      <PageHeader title="Sync 5starDesk" subtitle="Sincronizare automată rezervări"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 40px' }}>

        {/* Status sync */}
        <div style={{ ...panel, borderTop: `2px solid ${lastSync?.status==='ok'?'#4ADE80':'#F87171'}` }}>
          <div style={hdr}>
            {lastSync?.status === 'ok' ? <Check size={14} color="#4ADE80"/> : <AlertTriangle size={14} color="#F87171"/>}
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(159,215,255,0.6)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Status sync</span>
          </div>
          <div style={{ padding: '12px 14px' }}>
            {lastSync ? <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                {[
                  { l: 'Ultimul sync', v: lastSync.time ? new Date(lastSync.time).toLocaleString('ro-RO') : '—' },
                  { l: 'Status', v: lastSync.status === 'ok' ? '✓ OK' : '✗ Eroare' },
                  { l: 'Rezervări 5starDesk', v: lastSync.total_5star || '0' },
                  { l: 'Durată', v: lastSync.duration_ms ? `${lastSync.duration_ms}ms` : '—' },
                  { l: 'Inserate', v: lastSync.inserted || 0 },
                  { l: 'Actualizate', v: lastSync.updated || 0 },
                  { l: 'Anulate', v: lastSync.cancelled || 0 },
                  { l: 'Erori', v: lastSync.errors?.length || 0 },
                ].map(item => (
                  <div key={item.l} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 7, padding: '7px 10px' }}>
                    <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{item.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF' }}>{String(item.v)}</div>
                  </div>
                ))}
              </div>
              {lastSync.errors?.length > 0 && (
                <div style={{ background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.2)', borderRadius: 7, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, color: '#F87171', fontWeight: 600, marginBottom: 4 }}>Erori:</div>
                  {lastSync.errors.slice(0, 5).map((e: string, i: number) => (
                    <div key={i} style={{ fontSize: 10, color: 'rgba(248,113,113,0.7)', fontFamily: 'monospace', marginBottom: 2 }}>{e}</div>
                  ))}
                </div>
              )}
            </> : <div style={{ fontSize: 13, color: 'rgba(159,215,255,0.3)', fontStyle: 'italic' }}>Niciun sync efectuat încă</div>}
          </div>
        </div>

        {/* Trigger manual */}
        <button onClick={triggerSync} disabled={syncing}
          style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: syncing ? 'rgba(77,163,255,0.3)' : 'rgba(77,163,255,0.8)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: syncing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, transition: 'all .2s' }}>
          <RefreshCw size={16} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}/>
          {syncing ? 'Se sincronizează...' : 'Sincronizează acum'}
        </button>

        {/* Rezultat */}
        {result && (
          <div style={{ ...panel, borderTop: `2px solid ${result.ok ? '#4ADE80' : '#F87171'}` }}>
            <div style={hdr}>
              {result.ok ? <Check size={14} color="#4ADE80"/> : <AlertTriangle size={14} color="#F87171"/>}
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(159,215,255,0.6)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                {result.ok ? 'Sync reușit' : 'Eroare sync'}
              </span>
            </div>
            <div style={{ padding: '12px 14px' }}>
              {result.ok ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { l: 'Din 5starDesk', v: result.total_from_5star || 0, c: '#7BC8FF' },
                    { l: 'Inserate', v: result.inserted || 0, c: '#4ADE80' },
                    { l: 'Actualizate', v: result.updated || 0, c: '#FCD34D' },
                    { l: 'Anulate', v: result.cancelled || 0, c: '#F87171' },
                    { l: 'Erori', v: result.errors?.length || 0, c: result.errors?.length ? '#F87171' : '#4ADE80' },
                    { l: 'Durată', v: `${result.duration_ms || 0}ms`, c: 'rgba(159,215,255,0.6)' },
                  ].map(item => (
                    <div key={item.l} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 7, padding: '7px 10px' }}>
                      <div style={{ fontSize: 9, color: 'rgba(159,215,255,0.35)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{item.l}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: item.c, fontFamily: 'monospace' }}>{item.v}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#F87171', fontFamily: 'monospace' }}>{result.error || result.msg}</div>
              )}
              {result.raw_sample && (
                <div style={{ marginTop: 10, padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, fontSize: 10, color: 'rgba(159,215,255,0.4)', fontFamily: 'monospace', wordBreak: 'break-all' as const }}>
                  Sample 5starDesk response: {result.raw_sample}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info cron */}
        <div style={{ ...panel }}>
          <div style={hdr}>
            <Clock size={14} color="rgba(159,215,255,0.5)"/>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(159,215,255,0.6)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Cron automat</span>
          </div>
          <div style={{ padding: '12px 14px' }}>
            {[
              { l: 'Frecvență', v: 'La fiecare 30 minute' },
              { l: 'Interval sync', v: 'Ultimele 30 zile + urm. 90 zile' },
              { l: 'Rezervări incluse', v: 'Toate canalele (Booking, Airbnb, Direct)' },
              { l: 'Rezervări excluse', v: 'Canal intern (rezervări manuale)' },
              { l: 'La rezervare nouă', v: 'Inserată automat în baza de date' },
              { l: 'La anulare', v: 'Status actualizat la anulata' },
            ].map(item => (
              <div key={item.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '0.5px solid rgba(159,215,255,0.06)' }}>
                <span style={{ fontSize: 12, color: 'rgba(159,215,255,0.45)' }}>{item.l}</span>
                <span style={{ fontSize: 12, color: 'rgba(214,228,244,0.7)', textAlign: 'right' as const, maxWidth: '55%' }}>{item.v}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
