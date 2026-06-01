'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast } from '@/components/ui'
import { RefreshCw, Check, AlertCircle, Info } from 'lucide-react'

// Formateaza data ca "DD Mon YYYY" pentru 5starDesk
function fmtFor5SD(d: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getDate().toString().padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// Formateaza data ca "YYYY-MM-DD" pentru Supabase
function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`
}

export default function SyncPage() {
  const [apts, setApts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [log, setLog] = useState<string[]>([])
  const [results, setResults] = useState<any>(null)
  const { toast, show } = useToast()

  const addLog = (msg: string) => setLog(prev => [...prev, `[${new Date().toLocaleTimeString('ro-RO')}] ${msg}`])

  useEffect(() => {
    supabase.from('apartamente').select('id,nota,nume').eq('status','activ')
      .then(({ data }) => setApts(data || []))
  }, [])

  async function fivestar5(actiune: string, params = {}) {
    const res = await fetch('/api/fivestar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actiune, ...params }),
    })
    return res.json()
  }

  // Test API - verifica conectivitatea
  async function testAPI() {
    setTestLoading(true)
    setTestResult(null)
    try {
      const today = new Date()
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
      const data = await fivestar5('get_avail', {
        checkin: fmtFor5SD(today),
        checkout: fmtFor5SD(tomorrow),
      })
      setTestResult({ ok: true, data })
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message })
    }
    setTestLoading(false)
  }

  // Sincronizare prin get_avail - pentru fiecare zi din interval,
  // verifica care camere sunt INDISPONIBILE = sunt rezervate
  async function syncRezervari() {
    if (!apts.length) { show('error', 'Nu s-au incarcat apartamentele'); return }
    setLoading(true)
    setLog([])
    setResults(null)

    const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0 }

    try {
      addLog('Incepe sincronizarea prin get_avail...')

      const today = new Date()
      // Scaneaza urmatoarele 90 zile
      const daysToScan = 90
      addLog(`Scaneaza ${daysToScan} zile (azi + ${daysToScan} zile)...`)

      // Map: camera_id -> array de date indisponibile
      const indisponibil: Record<string, Set<string>> = {}
      // Map: camera_id -> info camera
      const cameraInfo: Record<string, any> = {}

      // Scaneam in blocuri de 7 zile pentru eficienta
      for (let offset = 0; offset < daysToScan; offset += 1) {
        const checkinDate = new Date(today)
        checkinDate.setDate(today.getDate() + offset)
        const checkoutDate = new Date(checkinDate)
        checkoutDate.setDate(checkinDate.getDate() + 1)

        const checkin5sd = fmtFor5SD(checkinDate)
        const checkout5sd = fmtFor5SD(checkoutDate)
        const dateISO = fmtISO(checkinDate)

        try {
          const avail = await fivestar5('get_avail', {
            checkin: checkin5sd,
            checkout: checkout5sd,
          })

          // Camere disponibile pentru aceasta zi
          const disponibile = new Set<string>()
          if (Array.isArray(avail?.camere)) {
            for (const cam of avail.camere) {
              const id = String(cam.id_camera || '')
              if (id) {
                disponibile.add(id)
                if (!cameraInfo[id]) cameraInfo[id] = cam
              }
            }
          }

          // Camerele care NU sunt in disponibile = sunt rezervate in acea zi
          // (doar camerele pe care le stim din DB)
          for (const apt of apts) {
            const nota = (apt.nota || '').toUpperCase()
            // Gaseste camera 5SD care corespunde acestui apartament
            for (const [camId, cam] of Object.entries(cameraInfo)) {
              const camNume = (cam.nume_camera || '').toLowerCase()
              const aptNota = nota.toLowerCase()
              if (camNume.includes(aptNota) || aptNota.includes(camNume.split(' ')[0])) {
                if (!disponibile.has(camId)) {
                  if (!indisponibil[camId]) indisponibil[camId] = new Set()
                  indisponibil[camId].add(dateISO)
                }
              }
            }
          }
        } catch {}

        // Progress la fiecare 10 zile
        if (offset % 10 === 0) {
          addLog(`Verificat ${offset}/${daysToScan} zile...`)
        }
      }

      addLog(`Analiza rezultate...`)

      // Grupeaza zilele consecutive in rezervari
      for (const [camId, zilePair] of Object.entries(indisponibil)) {
        const zile = Array.from(zilePair).sort()
        if (!zile.length) continue

        const cam = cameraInfo[camId]
        const apt = apts.find(a => {
          const nota = (a.nota || '').toLowerCase()
          const camNume = (cam?.nume_camera || '').toLowerCase()
          return camNume.includes(nota) || nota.includes(camNume.split(' ')[0])
        })
        if (!apt) continue

        // Grupeaza zile consecutive
        const grupuri: {from: string, to: string}[] = []
        let start = zile[0]
        let prev = zile[0]
        for (let i = 1; i <= zile.length; i++) {
          const curr = zile[i]
          const prevDate = new Date(prev)
          const currDate = curr ? new Date(curr) : null
          const diff = currDate ? (currDate.getTime() - prevDate.getTime()) / 86400000 : 999

          if (diff > 1 || !currDate) {
            // Sfarsit grup
            const checkoutDate = new Date(prev)
            checkoutDate.setDate(checkoutDate.getDate() + 1)
            grupuri.push({ from: start, to: fmtISO(checkoutDate) })
            if (currDate) start = curr
          }
          prev = curr || prev
        }

        // Insereaza fiecare rezervare dedusa
        for (const { from, to } of grupuri) {
          // Verifica daca exista deja
          const { data: existing } = await supabase.from('rezervari')
            .select('id')
            .eq('apartament_id', apt.id)
            .eq('data_checkin', from)
            .eq('data_checkout', to)
            .limit(1)

          if (existing && existing.length > 0) {
            stats.skipped++
          } else {
            const { error } = await supabase.from('rezervari').insert({
              apartament_id: apt.id,
              nume_client: 'Rezervare 5starDesk',
              data_checkin: from,
              data_checkout: to,
              canal: 'direct',
              status_rezervare: 'confirmata',
              observatii: `5SD-avail-${from}`,
            })
            if (error) {
              stats.errors++
              addLog(`Eroare insert ${apt.nota} ${from}-${to}: ${error.message}`)
            } else {
              stats.inserted++
              addLog(`✓ Inserata: ${apt.nota} ${from} → ${to}`)
            }
          }
        }
      }

      addLog(`✓ Gata! Inserate: ${stats.inserted}, Sarite: ${stats.skipped}, Erori: ${stats.errors}`)
      setResults({ ...stats, status: 'ok' })
      show('success', `Sync complet: +${stats.inserted} rezervari noi`)

    } catch (e: any) {
      addLog(`❌ Eroare: ${e.message}`)
      setResults({ status: 'error', message: e.message })
      show('error', 'Eroare sync: ' + e.message)
    }

    setLoading(false)
  }

  const glass: React.CSSProperties = {
    background: 'rgba(20,38,65,0.6)',
    border: '1px solid rgba(100,160,255,0.15)',
    borderRadius: 14, padding: 20, marginBottom: 14,
  }

  return (
    <>
      <PageHeader title="Sync 5starDesk" subtitle="Sincronizare rezervari din PMS prin disponibilitate"/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {/* Info */}
        <div style={{ ...glass, background: 'rgba(252,211,77,0.06)', border: '1px solid rgba(252,211,77,0.2)', display: 'flex', gap: 12 }}>
          <Info size={16} color="#FCD34D" style={{ flexShrink: 0, marginTop: 2 }}/>
          <div style={{ fontSize: 12, color: 'rgba(252,211,77,0.8)', lineHeight: 1.6 }}>
            <b>Cum functioneaza:</b> 5starDesk nu expune un API de citire rezervari pe acest cont. 
            ERP-ul deduce rezervarile verificand disponibilitatea zilnica prin <code>get_avail</code> — 
            zilele indisponibile = rezervate. Sincronizeaza urmatoarele 90 zile.
          </div>
        </div>

        {/* Test API */}
        <div style={glass}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#E8F4FF', marginBottom: 12 }}>Test conexiune API</div>
          <button onClick={testAPI} disabled={testLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 8,
              border: '1px solid rgba(77,163,255,0.3)', background: 'rgba(77,163,255,0.1)', color: '#7BC8FF',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
            <RefreshCw size={13} style={{ animation: testLoading ? 'spin 1s linear infinite' : 'none' }}/>
            {testLoading ? 'Se testeaza...' : 'Testeaza get_avail'}
          </button>
          {testResult && (
            <div style={{ fontSize: 11, fontFamily: 'monospace', padding: '8px 12px', borderRadius: 8,
              background: testResult.ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
              border: `1px solid ${testResult.ok ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
              color: testResult.ok ? '#4ADE80' : '#F87171' }}>
              {testResult.ok
                ? `✓ API functioneaza! ${JSON.stringify(testResult.data).slice(0,150)}`
                : `✗ Eroare: ${testResult.error}`}
            </div>
          )}
        </div>

        {/* Sync */}
        <div style={glass}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: apts.length > 0 ? 10 : 0 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#E8F4FF', marginBottom: 4 }}>Sincronizare rezervari</div>
              <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.45)' }}>
                Scaneaza disponibilitatea pentru 90 zile si insereaza rezervarile deduse
              </div>
            </div>
            <button onClick={syncRezervari} disabled={loading || !apts.length}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 10,
                border: '1px solid rgba(77,163,255,0.4)', background: 'rgba(77,163,255,0.15)',
                color: '#7BC8FF', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/>
              {loading ? 'Se sincronizeaza...' : 'Sincronizeaza acum'}
            </button>
          </div>
          {apts.length > 0 && (
            <div style={{ fontSize: 11, color: 'rgba(74,222,128,0.5)' }}>✓ {apts.length} apartamente active</div>
          )}
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div style={{ ...glass, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(159,215,255,0.4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Log</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8, maxHeight: 250, overflowY: 'auto' }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.includes('✓') ? '#4ADE80' : l.includes('❌') ? '#F87171' : 'rgba(214,228,244,0.5)' }}>
                  {l}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rezultate */}
        {results?.status === 'ok' && (
          <div style={glass}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[
                { label: 'Inserate', value: results.inserted, color: '#4ADE80' },
                { label: 'Existente (sarite)', value: results.skipped, color: 'rgba(159,215,255,0.5)' },
                { label: 'Erori', value: results.errors, color: results.errors > 0 ? '#F87171' : '#4ADE80' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'rgba(20,38,65,0.4)', border: '1px solid rgba(100,160,255,0.1)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' as const }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color }}>{value}</div>
                  <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <Toast toast={toast}/>
    </>
  )
}
