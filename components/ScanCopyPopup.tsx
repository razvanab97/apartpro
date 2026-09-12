'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ScanLine, X, Copy, Check, Loader2 } from 'lucide-react'
import { fmt5star } from '@/lib/syncFivestar'

// Nu scrie nimic în baza proprie — sistemul extern (5starDesk sau orice alt PMS/ERP folosit
// pentru rezervări) nu are API de scriere, doar formularul lui web propriu. Scopul e pur
// "extrage din poză + editează dacă e cazul + copiază", ca să nu mai retastezi manual
// nume/telefon/preț/cod/date/oaspeți dintr-o rezervare Airbnb/Booking, sau nume/CNP/adresă
// dintr-un buletin, direct în formularul acelui sistem — indiferent care e el.
type RezRaw = { nume_client:string; adulti:number; copii:number; data_checkin:string; data_checkout:string; nr_nopti:number|null; pret_total:number|null; moneda:string|null; apartament_text:string|null; cod:string|null; telefon?:string|null }
type CiRaw = { nume:string; cnp:string; serie:string; numar:string; judet:string; localitate:string; strada:string; telefon?:string }
type Apt = { id:string; nota:string|null; nume:string }

type RezForm = { aptId:string; nume:string; telefon:string; pret:string; cod:string; checkin:string; checkout:string; adulti:string; copii:string }
type CiForm = { nume:string; cnp:string; serieNumar:string; telefon:string; judet:string; localitate:string; strada:string }
const emptyRezForm: RezForm = { aptId:'', nume:'', telefon:'', pret:'', cod:'', checkin:'', checkout:'', adulti:'', copii:'' }
const emptyCiForm: CiForm = { nume:'', cnp:'', serieNumar:'', telefon:'', judet:'', localitate:'', strada:'' }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Aceeași euristică de potrivire text→apartament ca la Calendar (matchApartament) — AI-ul
// citește titlul anunțului, nu codul intern, deci potrivirea e mereu aproximativă; de-asta
// rămâne un dropdown editabil lângă, nu doar rezultatul automat.
function matchApt(text: string|null|undefined, apts: Apt[]): string {
  if (!text) return ''
  const norm = (s:string) => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim()
  const t = norm(text)
  const found = apts.find(a => {
    const n = norm(a.nume||''), nota = norm(a.nota||'')
    return (n.length>2 && (t.includes(n)||n.includes(t))) || (nota.length>1 && t.includes(nota))
  })
  return found?.id || ''
}

function CopyRow({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v:string)=>void; placeholder?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(14,27,43,0.5)', border: '1px solid rgba(159,215,255,0.1)' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginBottom: 2 }}>{label}</div>
        <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||'—'}
          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', padding: 0, fontSize: 13, color: '#FFFFFF', fontWeight: 600 }}/>
      </div>
      <button
        onClick={() => { if(!value.trim()) return; navigator.clipboard.writeText(value).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
        title="Copiază" disabled={!value.trim()}
        style={{
          flexShrink: 0, width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: value.trim() ? 'pointer' : 'default', opacity: value.trim() ? 1 : 0.35,
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
  const [apts, setApts] = useState<Apt[]>([])
  const [rezForm, setRezForm] = useState<RezForm>(emptyRezForm)
  const [ciForm, setCiForm] = useState<CiForm>(emptyCiForm)
  const [hasResult, setHasResult] = useState(false)

  useEffect(() => {
    Promise.resolve(supabase.from('apartamente').select('id,nota,nume').eq('status','activ').order('nota'))
      .then(({ data }) => setApts(data || []))
      .catch(() => {})
  }, [])

  async function runScan(base64Data: string, mimeType: string) {
    setScanning(true); setError(null)
    try {
      const endpoint = mode === 'rezervare' ? '/api/scan-rezervare' : '/api/scan-ci'
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64Data, mimeType }) })
      const data = await res.json()
      if (mode === 'rezervare') {
        if (data.error || !data.result) { setError(data.error || 'Nu am putut citi datele din poză'); return }
        const r: RezRaw = data.result
        setRezForm({
          aptId: matchApt(r.apartament_text, apts),
          nume: r.nume_client || '',
          telefon: r.telefon || '',
          pret: r.pret_total != null ? String(r.pret_total) : '',
          cod: r.cod || '',
          checkin: r.data_checkin ? fmt5star(r.data_checkin) : '',
          checkout: r.data_checkout ? fmt5star(r.data_checkout) : '',
          adulti: r.adulti != null ? String(r.adulti) : '',
          copii: r.copii != null ? String(r.copii) : '',
        })
        setHasResult(true)
      } else {
        if (!data.success || !(data.nume || data.cnp)) { setError('Nu am putut citi datele din poză'); return }
        const r: CiRaw = data
        setCiForm({
          nume: r.nume || '',
          cnp: r.cnp || '',
          serieNumar: [r.serie, r.numar].filter(Boolean).join(' '),
          telefon: r.telefon || '',
          judet: r.judet || '',
          localitate: r.localitate || '',
          strada: r.strada || '',
        })
        setHasResult(true)
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
    setMode(m); setError(null); setHasResult(false); setRezForm(emptyRezForm); setCiForm(emptyCiForm)
  }

  const selectedApt = apts.find(a => a.id === rezForm.aptId)

  return (
    <>
      <div style={{ position: 'fixed', bottom: 152, right: 24, zIndex: 998 }}>
        <button
          onClick={() => setOpen(o => !o)}
          title="Preia rapid o rezervare sau un buletin, pentru orice sistem extern (5starDesk, ERP etc.)"
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

      <Modal open={open} onClose={() => setOpen(false)} title="Preia din captură" subtitle="Scanează o rezervare sau un buletin, editează dacă e nevoie, apoi copiază fiecare câmp — pentru 5starDesk, ERP sau orice alt sistem extern" width="340px">
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

        {hasResult && mode === 'rezervare' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Apartament — selector manual, nu doar ghicit din text (titlul de pe Airbnb/Booking
                diferă des de codul intern) — cerut direct */}
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(14,27,43,0.5)', border: '1px solid rgba(159,215,255,0.1)' }}>
              <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginBottom: 4 }}>Apartament</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={rezForm.aptId} onChange={e => setRezForm(f => ({ ...f, aptId: e.target.value }))}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: 0, fontSize: 13, color: '#FFFFFF', fontWeight: 600 }}>
                  <option value="" style={{ background: '#0E1B2B' }}>— alege —</option>
                  {apts.map(a => <option key={a.id} value={a.id} style={{ background: '#0E1B2B' }}>{a.nota ? `${a.nota} · ${a.nume}` : a.nume}</option>)}
                </select>
                <button
                  onClick={() => { const v = selectedApt?.nota || selectedApt?.nume || ''; if (!v) return; navigator.clipboard.writeText(v).catch(() => {}) }}
                  title="Copiază codul apartamentului" disabled={!selectedApt}
                  style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: selectedApt ? 'pointer' : 'default', opacity: selectedApt ? 1 : 0.35,
                    border: '1px solid rgba(159,215,255,0.15)', background: 'rgba(159,215,255,0.06)', color: 'rgba(159,215,255,0.6)' }}>
                  <Copy size={13} />
                </button>
              </div>
            </div>
            <CopyRow label="Nume" value={rezForm.nume} onChange={v => setRezForm(f => ({ ...f, nume: v }))} />
            <CopyRow label="Telefon" value={rezForm.telefon} onChange={v => setRezForm(f => ({ ...f, telefon: v }))} placeholder="completează manual" />
            <CopyRow label="Preț" value={rezForm.pret} onChange={v => setRezForm(f => ({ ...f, pret: v }))} />
            <CopyRow label="Cod" value={rezForm.cod} onChange={v => setRezForm(f => ({ ...f, cod: v }))} />
            <CopyRow label="Check-in" value={rezForm.checkin} onChange={v => setRezForm(f => ({ ...f, checkin: v }))} />
            <CopyRow label="Check-out" value={rezForm.checkout} onChange={v => setRezForm(f => ({ ...f, checkout: v }))} />
            <CopyRow label="Adulți" value={rezForm.adulti} onChange={v => setRezForm(f => ({ ...f, adulti: v }))} />
            <CopyRow label="Copii" value={rezForm.copii} onChange={v => setRezForm(f => ({ ...f, copii: v }))} />
          </div>
        )}

        {hasResult && mode === 'buletin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CopyRow label="Nume" value={ciForm.nume} onChange={v => setCiForm(f => ({ ...f, nume: v }))} />
            <CopyRow label="CNP" value={ciForm.cnp} onChange={v => setCiForm(f => ({ ...f, cnp: v }))} />
            <CopyRow label="Serie/Număr" value={ciForm.serieNumar} onChange={v => setCiForm(f => ({ ...f, serieNumar: v }))} />
            <CopyRow label="Telefon" value={ciForm.telefon} onChange={v => setCiForm(f => ({ ...f, telefon: v }))} placeholder="completează manual" />
            <CopyRow label="Județ" value={ciForm.judet} onChange={v => setCiForm(f => ({ ...f, judet: v }))} />
            <CopyRow label="Localitate" value={ciForm.localitate} onChange={v => setCiForm(f => ({ ...f, localitate: v }))} />
            <CopyRow label="Stradă" value={ciForm.strada} onChange={v => setCiForm(f => ({ ...f, strada: v }))} />
          </div>
        )}
      </Modal>
    </>
  )
}
