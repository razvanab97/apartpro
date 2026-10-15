'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ScanLine, X, Copy, Check, Loader2, Plus, Pencil } from 'lucide-react'
import { fmt5star, parse5star } from '@/lib/syncFivestar'
import { payloadRezervare } from '@/lib/rezervareEdit'
import RezervareEditor from '@/components/RezervareEditor'
import { saveAdresaExtrasa } from '@/lib/locatii-romania'

// Sistemul extern (5starDesk sau orice alt PMS/ERP folosit pentru rezervări) nu are API de
// scriere, doar formularul lui web propriu — scopul principal e "extrage din poză + editează
// dacă e cazul + copiază", ca să nu mai retastezi manual
// nume/telefon/preț/cod/date/oaspeți dintr-o rezervare Airbnb/Booking, sau nume/CNP/adresă
// dintr-un buletin, direct în formularul acelui sistem — indiferent care e el.
type RezRaw = { nume_client:string; adulti:number; copii:number; data_checkin:string; data_checkout:string; nr_nopti:number|null; pret_total:number|null; moneda:string|null; apartament_text:string|null; cod:string|null; telefon?:string|null }
type CiRaw = { nume:string; cnp:string; serie:string; numar:string; judet:string; localitate:string; strada:string; telefon?:string }
type Apt = { id:string; nota:string|null; nume:string }

type RezForm = { aptId:string; nume:string; telefon:string; pret:string; cod:string; checkin:string; checkout:string; adulti:string; copii:string; canal:string; moneda:string }
type CiForm = { nume:string; cnp:string; serieNumar:string; telefon:string; judet:string; localitate:string; strada:string }
const emptyRezForm: RezForm = { aptId:'', nume:'', telefon:'', pret:'', cod:'', checkin:'', checkout:'', adulti:'', copii:'', canal:'airbnb', moneda:'RON' }
const CANALE_SCAN: [string, string][] = [['airbnb','Airbnb'], ['booking','Booking'], ['direct','Direct']]

// Platforma dedusa din codul rezervarii: Airbnb „HMXXXXXXXX”, Booking doar cifre (ex. 6012345678)
function canalDinCod(cod: string|null|undefined): string {
  const c = String(cod||'').trim()
  if (/^HM[A-Z0-9]{6,}$/i.test(c)) return 'airbnb'
  if (/^\d{8,12}$/.test(c)) return 'booking'
  return 'airbnb'
}
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
  // Creare rezervare direct din captura (cerut direct): verificare dubluri/suprapuneri, apoi insert
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [suprapunere, setSuprapunere] = useState<string | null>(null)
  const [creata, setCreata] = useState<{ id: string; text: string } | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [duplicatId, setDuplicatId] = useState<string | null>(null)

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
          canal: canalDinCod(r.cod),
          moneda: r.moneda || 'RON',
        })
        setCreata(null); setCreateErr(null); setSuprapunere(null)
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
        // Adresa reala de pe buletin creste pool-ul generatorului de adrese
        // (Șabloane → Generator Locații), cerut direct — best-effort, nu blochează UI-ul
        saveAdresaExtrasa(r.judet || '', r.localitate || '', r.strada || '')
        // rezervare din buletin (cerut direct): oaspetele vine de obicei direct, nu prin platforma
        setRezForm({ ...emptyRezForm, canal: 'direct', adulti: '1' })
        setCreata(null); setCreateErr(null); setSuprapunere(null)
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
    setMode(m); setError(null); setHasResult(false); setRezForm(emptyRezForm); setCiForm(emptyCiForm); setCreata(null); setCreateErr(null); setSuprapunere(null); setDuplicatId(null)
  }

  const selectedApt = apts.find(a => a.id === rezForm.aptId)

  async function creeazaRezervare(fortat = false) {
    setCreateErr(null)
    const dinCI = mode === 'buletin'
    const isoSau5 = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : parse5star(v)
    const ci = isoSau5(rezForm.checkin), co = isoSau5(rezForm.checkout)
    const nume = (dinCI ? ciForm.nume : rezForm.nume).trim()
    const telefon = (dinCI ? ciForm.telefon : rezForm.telefon).trim()
    const lipsa = [!rezForm.aptId && 'apartamentul', !nume && 'numele',
      !/^\d{4}-\d{2}-\d{2}$/.test(ci) && (dinCI ? 'check-in' : 'check-in (ex. 13 Oct 2026)'), !/^\d{4}-\d{2}-\d{2}$/.test(co) && (dinCI ? 'check-out' : 'check-out (ex. 14 Oct 2026)')].filter(Boolean)
    if (lipsa.length) { setCreateErr(`Completează: ${lipsa.join(', ')}`); return }
    if (co <= ci) { setCreateErr('Check-out trebuie să fie după check-in'); return }
    setCreating(true)
    try {
      const cod = rezForm.cod.trim().toUpperCase()
      // 1. Aceeasi rezervare deja in sistem (acelasi cod de la platforma) -> nu se mai creeaza
      if (cod) {
        const { data: dup } = await supabase.from('rezervari').select('id,nume_client,data_checkin,data_checkout')
          .eq('cod_rezervare_platforma', cod).neq('status_rezervare', 'anulata').limit(1)
        if (dup?.length) {
          setCreateErr(`Există deja rezervarea cu codul ${cod}: ${dup[0].nume_client}, ${dup[0].data_checkin} → ${dup[0].data_checkout}`)
          setCreata({ id: dup[0].id, text: `${dup[0].nume_client} · ${dup[0].data_checkin} → ${dup[0].data_checkout}` })
          return
        }
      }
      // 2. Din buletin: acelasi oaspete are deja o rezervare care se suprapune (ex. venita din 5starDesk)
      if (!fortat && dinCI) {
        const { data: same } = await supabase.from('rezervari').select('id,nume_client,data_checkin,data_checkout,apartament:apartamente(nota,nume)')
          .ilike('nume_client', `%${nume.replace(/[%_,()]/g, ' ').trim()}%`).neq('status_rezervare', 'anulata').lt('data_checkin', co).gt('data_checkout', ci).limit(3)
        if (same?.length) {
          setSuprapunere(`${nume} are deja o rezervare în perioada asta: ` + same.map((o: any) => `${o.apartament?.nota || o.apartament?.nume || ''} (${o.data_checkin} → ${o.data_checkout})`).join('; '))
          setCreata(null); setDuplicatId(same[0].id)
          return
        }
      }
      // 3. Apartamentul ocupat in perioada -> avertisment, se poate crea oricum (al doilea click)
      if (!fortat) {
        const { data: ocup } = await supabase.from('rezervari').select('nume_client,data_checkin,data_checkout')
          .eq('apartament_id', rezForm.aptId).neq('status_rezervare', 'anulata').lt('data_checkin', co).gt('data_checkout', ci).limit(3)
        if (ocup?.length) {
          setSuprapunere('Apartamentul e deja ocupat în perioada asta: ' + ocup.map(o => `${o.nume_client} (${o.data_checkin} → ${o.data_checkout})`).join('; ')); setDuplicatId(null)
          return
        }
      }
      const { data: aptRows } = await supabase.from('apartamente').select('*').eq('id', rezForm.aptId)
      const pret = Number(String(rezForm.pret).replace(',', '.')) || 0
      const persoane = (Number(rezForm.adulti) || 0) + (Number(rezForm.copii) || 0)
      const rez = {
        apartament_id: rezForm.aptId,
        proprietar_id: aptRows?.[0]?.proprietar_id || null,
        canal: rezForm.canal,
        nume_client: nume,
        telefon_client: telefon || null,
        data_checkin: ci,
        data_checkout: co,
        nr_persoane: persoane || 1,
        valoare_bruta: pret,
        suma_incasata: pret,
        moneda: rezForm.moneda || 'RON',
        cod_rezervare_platforma: cod || null,
        status_rezervare: 'confirmata',
        // Airbnb incaseaza oaspetele la rezervare; la Booking/direct plata se confirma ulterior
        status_plata: rezForm.canal === 'airbnb' ? 'achitat' : 'neplatit',
        status_decont: 'nedecontat',
        status_facturare: 'nefacturat',
        // datele din buletin raman pe rezervare (tabela n-are coloane dedicate) - utile la facturare / declarare
        observatii: dinCI
          ? ['Creată din buletin', ciForm.serieNumar && `Buletin ${ciForm.serieNumar}`, ciForm.cnp && `CNP ${ciForm.cnp}`,
             [ciForm.strada, ciForm.localitate, ciForm.judet && `jud. ${ciForm.judet}`].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
          : 'Creată din captură',
      }
      const { data, error } = await supabase.from('rezervari').insert(payloadRezervare(rez, aptRows || [])).select('id').single()
      if (error) { setCreateErr(error.message); return }
      setSuprapunere(null)
      setCreata({ id: data.id, text: `${rez.nume_client} · ${selectedApt?.nota || selectedApt?.nume || ''} · ${ci} → ${co}` }); setDuplicatId(null)
      // Paginile deschise (Calendar, Rezervari, Dashboard) se reincarca imediat
      window.dispatchEvent(new CustomEvent('rezervari:modificate'))
    } catch (e: any) {
      setCreateErr('Eroare: ' + (e.message || e))
    } finally {
      setCreating(false)
    }
  }

  const blocCreare = (
    <>
              <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginBottom: 6 }}>Canal</div>
              <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 9, background: 'rgba(14,27,43,0.5)', border: '1px solid rgba(159,215,255,0.1)', marginBottom: 10 }}>
                {CANALE_SCAN.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setRezForm(f => ({ ...f, canal: k }))} style={{
                    flex: 1, padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: rezForm.canal === k ? 700 : 500,
                    background: rezForm.canal === k ? 'rgba(77,163,255,0.18)' : 'transparent', color: rezForm.canal === k ? '#7BC8FF' : 'rgba(159,215,255,0.45)',
                  }}>{l}</button>
                ))}
              </div>

              {creata ? (
                <div style={{ padding: '10px 12px', borderRadius: 9, background: createErr ? 'rgba(245,158,11,0.08)' : 'rgba(74,222,128,0.08)', border: `1px solid ${createErr ? 'rgba(245,158,11,0.3)' : 'rgba(74,222,128,0.3)'}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: createErr ? '#FCD34D' : '#4ADE80', marginBottom: 3 }}>{createErr ? '⚠ Rezervarea există deja' : '✓ Rezervare creată'}</div>
                  <div style={{ fontSize: 12, color: 'rgba(214,228,244,0.8)', marginBottom: 8 }}>{creata.text}</div>
                  <button type="button" onClick={() => setEditId(creata.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(77,163,255,0.35)', background: 'rgba(77,163,255,0.1)', color: '#7BC8FF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    <Pencil size={12} /> Deschide rezervarea
                  </button>
                </div>
              ) : suprapunere ? (
                <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
                  <div style={{ fontSize: 12, color: '#FCD34D', marginBottom: 8, lineHeight: 1.45 }}>⚠ {suprapunere}</div>
                  {duplicatId && <button type="button" onClick={() => setEditId(duplicatId)} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(77,163,255,0.35)', background: 'rgba(77,163,255,0.1)', color: '#7BC8FF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Pencil size={12} /> Deschide rezervarea existentă</button>}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => setSuprapunere(null)} style={{ flex: 1, padding: '7px', borderRadius: 7, border: '1px solid rgba(159,215,255,0.2)', background: 'transparent', color: 'rgba(214,228,244,0.75)', fontSize: 12, cursor: 'pointer' }}>Renunță</button>
                    <button type="button" onClick={() => creeazaRezervare(true)} disabled={creating} style={{ flex: 1, padding: '7px', borderRadius: 7, border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.15)', color: '#FCD34D', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Creează oricum</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => creeazaRezervare()} disabled={creating} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px', borderRadius: 9, border: 'none',
                  background: 'linear-gradient(135deg,#22C55E,#16A34A)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: creating ? 'wait' : 'pointer', opacity: creating ? 0.7 : 1,
                }}>
                  {creating ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Se creează…</> : <><Plus size={15} /> Creează rezervarea</>}
                </button>
              )}
              {createErr && !creata && <div style={{ marginTop: 8, fontSize: 12, color: '#F87171' }}>{createErr}</div>}
    </>
  )

  const aptSelect = (
    <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(14,27,43,0.5)', border: '1px solid rgba(159,215,255,0.1)' }}>
      <div style={{ fontSize: 10, color: 'rgba(159,215,255,0.4)', marginBottom: 4 }}>Apartament</div>
      <select value={rezForm.aptId} onChange={e => { setRezForm(f => ({ ...f, aptId: e.target.value })); setCreateErr(null); setSuprapunere(null) }}
        style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', padding: 0, fontSize: 13, color: '#FFFFFF', fontWeight: 600 }}>
        <option value="" style={{ background: '#0E1B2B' }}>— alege —</option>
        {apts.map(a => <option key={a.id} value={a.id} style={{ background: '#0E1B2B' }}>{a.nota ? `${a.nota} · ${a.nume}` : a.nume}</option>)}
      </select>
    </div>
  )
  const campCreare = (label: string, k: keyof RezForm, tip: string, ph = '') => (
    <label style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 8, background: 'rgba(14,27,43,0.5)', border: '1px solid rgba(159,215,255,0.1)', fontSize: 10, color: 'rgba(159,215,255,0.4)' }}>{label}
      <input type={tip} value={rezForm[k]} placeholder={ph} onChange={e => { setRezForm(f => ({ ...f, [k]: e.target.value })); setCreateErr(null); setSuprapunere(null) }}
        style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', padding: 0, fontSize: 13, color: '#FFFFFF', fontWeight: 600, minWidth: 0 }} />
    </label>
  )

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

            {/* Creare rezervare in aplicatie, din datele de mai sus */}
            <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid rgba(159,215,255,0.1)' }}>
              {blocCreare}
            </div>
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

            {/* Rezervare noua pe baza buletinului (cerut direct): numele + telefonul vin din buletin,
                restul il completezi; CI / CNP / adresa se salveaza in observatiile rezervarii */}
            <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid rgba(159,215,255,0.1)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#E8F4FF' }}>Creează rezervare pentru {ciForm.nume || 'acest oaspete'}</div>
              {aptSelect}
              <div style={{ display: 'flex', gap: 6 }}>
                {campCreare('Check-in', 'checkin', 'date')}
                {campCreare('Check-out', 'checkout', 'date')}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {campCreare('Adulți', 'adulti', 'number')}
                {campCreare('Copii', 'copii', 'number', '0')}
                {campCreare('Preț total', 'pret', 'number', 'RON')}
              </div>
              <div style={{ marginTop: 4 }}>{blocCreare}</div>
            </div>
          </div>
        )}
      </Modal>
      {editId && <RezervareEditor rezervareId={editId} onClose={() => setEditId(null)} onSaved={() => window.dispatchEvent(new CustomEvent('rezervari:modificate'))} />}
    </>
  )
}
