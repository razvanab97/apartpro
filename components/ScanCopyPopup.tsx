'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui'
import { ScanLine, X, Copy, Check, Loader2 } from 'lucide-react'
import { fmt5star } from '@/lib/syncFivestar'

// Nu scrie nimic în baza proprie — 5starDesk (PMS-ul folosit efectiv pentru rezervări) nu are
// API de scriere, doar formularul lui web propriu. Scopul e pur "extrage din poză + copiază",
// ca să nu mai retastezi manual nume/preț/cod/date/oaspeți din Airbnb/Booking, sau
// nume/CNP/adresă dintr-un buletin, direct în formularul 5starDesk.
type RezResult = { nume_client:string; adulti:number; copii:number; data_checkin:string; data_checkout:string; nr_nopti:number|null; pret_total:number|null; moneda:string|null; apartament_text:string|null; cod:string|null }
type CiResult = { nume:string; cnp:string; serie:string; numar:string; judet:string; localitate:string; strada:string }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(14,27,43,0.5)', border: '1px solid rgba(159,215,255,0.1)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      </div>
      <button
        onClick={() => { navigator.clipboard.writeText(value).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
        title="Copiază"
        style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          border: `1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'rgba(159,215,255,0.15)'}`,
          background: copied ? 'rgba(74,222,128,0.1)' : 'rgba(159,215,255,0.06)',
          color: copied ? '#4ADE80' : 'rgba(159,215,255,0.6)',
        }}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

export default function ScanCopyPopup() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'rezervare' | 'buletin'>('rezervare')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rez, setRez] = useState<RezResult | null>(null)
  const [ci, setCi] = useState<CiResult | null>(null)

  async function runScan(base64Data: string, mimeType: string) {
    setScanning(true); setError(null)
    try {
      const endpoint = mode === 'rezervare' ? '/api/scan-rezervare' : '/api/scan-ci'
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64Data, mimeType }) })
      const data = await res.json()
      if (mode === 'rezervare') {
        if (data.error || !data.result) { setError(data.error || 'Nu am putut citi datele din poză'); return }
        setRez(data.result); setCi(null)
      } else {
        if (!data.success || !(data.nume || data.cnp)) { setError('Nu am putut citi datele din poză'); return }
        setCi(data); setRez(null)
      }
    } catch (e: any) {
      setError('Eroare la scanare: ' + (e.message || e))
    }
    setScanning(false)
  }

  async function handleFiles(files: FileList) {
    for (const f of Array.from(files)) {
      try {
        const b64 = await fileToBase64(f)
        await runScan(b64, f.type || 'image/jpeg')
      } catch { setError('Eroare la citirea fișierului') }
    }
  }

  async function pasteFromClipboard() {
    if (!navigator.clipboard?.read) { setError('Browserul nu suportă citirea directă din clipboard'); return }
    try {
      const items = await navigator.clipboard.read()
      let blob: Blob | null = null
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/'))
        if (type) { blob = await item.getType(type); break }
      }
      if (!blob) { setError('Nu am găsit nicio imagine în clipboard — fă un screenshot, apoi încearcă din nou'); return }
      const b64 = await fileToBase64(new File([blob], 'clip.png', { type: blob.type }))
      await runScan(b64, blob.type)
    } catch {
      setError('Eroare la citirea clipboard-ului')
    }
  }

  function switchMode(m: 'rezervare' | 'buletin') {
    setMode(m); setError(null)
  }

  return (
    <>
      <div style={{ position: 'fixed', bottom: 152, right: 24, zIndex: 998 }}>
        <button
          onClick={() => setOpen(o => !o)}
          title="Preia rapid o rezervare sau un buletin pentru 5starDesk"
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: open ? 'rgba(14,27,43,0.9)' : 'rgba(196,181,253,0.9)',
            border: '2px solid rgba(196,181,253,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#FFFFFF',
            boxShadow: '0 4px 20px rgba(167,139,250,0.4)',
            transition: 'all 0.2s',
          }}
        >
          {open ? <X size={16} /> : <ScanLine size={16} />}
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Preia din captură — 5starDesk" subtitle="Scanează o rezervare sau un buletin, apoi copiază fiecare câmp" width="340px">
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: 'rgba(14,27,43,0.5)', marginBottom: 14 }}>
          {(['rezervare', 'buletin'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)} style={{
              flex: 1, padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: mode === m ? 'rgba(196,181,253,0.18)' : 'transparent',
              color: mode === m ? '#C4B5FD' : 'rgba(159,215,255,0.45)',
            }}>
              {m === 'rezervare' ? '📋 Rezervare' : '🪪 Buletin'}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', marginBottom: 12 }}>
          {mode === 'rezervare' ? 'Captură din Airbnb sau Booking cu detaliile rezervării' : 'Poză a actului de identitate (buletin)'}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <label style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px dashed rgba(196,181,253,0.35)', background: 'rgba(196,181,253,0.06)', color: '#C4B5FD', fontSize: 12, fontWeight: 600, textAlign: 'center', cursor: 'pointer' }}>
            📎 Alege poză
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }} />
          </label>
          <button onClick={pasteFromClipboard} style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid rgba(196,181,253,0.25)', background: 'transparent', color: '#C4B5FD', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            📋 Din clipboard
          </button>
        </div>

        {scanning && (
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'rgba(159,215,255,0.5)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analizez captura…
          </div>
        )}
        {error && <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171', fontSize: 12, marginBottom: 10 }}>{error}</div>}

        {rez && mode === 'rezervare' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CopyRow label="Nume" value={rez.nume_client || ''} />
            <CopyRow label="Preț" value={rez.pret_total != null ? String(rez.pret_total) : ''} />
            <CopyRow label="Cod" value={rez.cod || ''} />
            <CopyRow label="Check-in" value={rez.data_checkin ? fmt5star(rez.data_checkin) : ''} />
            <CopyRow label="Check-out" value={rez.data_checkout ? fmt5star(rez.data_checkout) : ''} />
            <CopyRow label="Adulți" value={rez.adulti != null ? String(rez.adulti) : ''} />
            <CopyRow label="Copii" value={rez.copii != null ? String(rez.copii) : ''} />
          </div>
        )}

        {ci && mode === 'buletin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CopyRow label="Nume" value={ci.nume || ''} />
            <CopyRow label="CNP" value={ci.cnp || ''} />
            <CopyRow label="Serie/Număr" value={[ci.serie, ci.numar].filter(Boolean).join(' ')} />
            <CopyRow label="Județ" value={ci.judet || ''} />
            <CopyRow label="Localitate" value={ci.localitate || ''} />
            <CopyRow label="Stradă" value={ci.strada || ''} />
          </div>
        )}
      </Modal>
    </>
  )
}
