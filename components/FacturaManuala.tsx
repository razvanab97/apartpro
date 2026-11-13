'use client'
import { useEffect, useState } from 'react'
import { X, Loader2, FileText, ExternalLink, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { localitatiJudet, loadExtraLocs } from '@/lib/locatii-romania'
import { TARI, oraseTara } from '@/lib/tariOrase'
import { C, CSS, JUDETE, Label, CLIENT_GOL, aziRo, eRomania, CHEIE_DATA_EMITERE, type ClientFactura } from '@/components/RezervareModal'

// Factura fara rezervare in aplicatie (cerut direct: „dacă o rezervare nu există, dar avem nevoie să facem factură, să
// apară «Generează factura» și punem direct detaliile pentru facturare”). Aceeasi factura ca din rezervare (AB Textile,
// seria RH, prin ContaFlow / Oblio, SPV): client (persoana fizica sau firma din ANAF), cod rezervare, suma, data emiterii.
// Se retine in setari factura_manuala_<COD>, ca acelasi cod sa nu poata fi facturat de doua ori.

const eq = (a: string, b: string) => a.trim().localeCompare(b.trim(), 'ro', { sensitivity: 'base' }) === 0

export default function FacturaManuala({ initial, onClose, preset }: { initial: string; onClose: () => void; preset?: { nume?: string; cod?: string; suma?: number } }) {
  const pareCod = /^[A-Z0-9]{6,}$/i.test(initial.trim()) && /\d/.test(initial)
  const [nume, setNume] = useState(preset?.nume ?? (pareCod ? '' : initial.trim()))
  const [cod, setCod] = useState(preset?.cod ?? (pareCod ? initial.trim().toUpperCase() : ''))
  const [canal, setCanal] = useState<'airbnb' | 'booking'>(/^\d+$/.test(initial.trim()) ? 'booking' : 'airbnb')
  const [suma, setSuma] = useState(preset?.suma ? String(preset.suma) : '')
  const [dataEmitere, setDataEmitere] = useState(aziRo())
  const [cl, setCl] = useState<ClientFactura>(CLIENT_GOL)
  const [altaTara, setAltaTara] = useState(false)
  const [ultima, setUltima] = useState<{ stare: 'incarc' | 'ok' | 'eroare'; data?: string; numar?: string; eroare?: string }>({ stare: 'incarc' })
  const [firma, setFirma] = useState<{ incarc?: boolean; eroare?: string; avert?: string }>({})
  const [etapa, setEtapa] = useState<'form' | 'confirm' | 'trimit'>('form')
  const [eroare, setEroare] = useState('')
  const [emisa, setEmisa] = useState<{ serie: string; numar: string; link?: string | null; info?: string } | null>(null)
  const [, setLocIncarcate] = useState(false)
  const setC = (p: Partial<ClientFactura>) => setCl(c => ({ ...c, ...p }))

  useEffect(() => {
    void loadExtraLocs().finally(() => setLocIncarcate(true))
    void supabase.from('setari').select('valoare').eq('cheie', CHEIE_DATA_EMITERE).maybeSingle().then(({ data }) => {
      const d = String(data?.valoare || ''); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= aziRo()) setDataEmitere(d)
    })
  }, [])
  const [cerere, setCerere] = useState(0)
  useEffect(() => {
    let anulat = false
    fetch('/api/factura-oblio', { cache: 'no-store' }).then(r => r.json().then(o => ({ ok: r.ok, o }))).then(({ ok, o }) => {
      if (!anulat) setUltima(ok ? { stare: 'ok', data: o.ultima?.data, numar: o.ultima?.numar } : { stare: 'eroare', eroare: o.error || 'eroare' })
    }).catch(e => { if (!anulat) setUltima({ stare: 'eroare', eroare: e instanceof Error ? e.message : 'eroare' }) })
    return () => { anulat = true }
  }, [cerere])
  useEffect(() => { if (ultima.stare !== 'eroare') return; const t = setTimeout(() => setCerere(x => x + 1), 20000); return () => clearTimeout(t) }, [ultima])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const eRo = !altaTara && eRomania(cl.tara)
  const sugestii = eRo ? (cl.judet ? localitatiJudet(cl.judet) : []) : oraseTara(cl.tara)
  const zz = (d: string) => d ? d.split('-').reverse().join('.') : ''
  const sumaNr = Number(String(suma).replace(',', '.'))
  const motiv =
    !nume.trim() ? 'Scrie numele clientului (oaspetele)' :
    !cod.trim() ? 'Scrie codul rezervării de la platformă' :
    !(sumaNr > 0) ? 'Scrie suma de facturat' :
    cl.pj && !String(cl.cui || '').trim() ? 'Scrie CUI-ul firmei' :
    cl.pj && !String(cl.firma || '').trim() ? 'Caută firma după CUI (sau scrie denumirea)' :
    altaTara && !cl.tara.trim() ? 'Scrie țara clientului' :
    eRo && !cl.judet ? 'Alege județul de domiciliu al clientului' :
    !cl.localitate.trim() ? 'Completează localitatea clientului' :
    !dataEmitere ? 'Alege data emiterii' : dataEmitere > aziRo() ? 'Data emiterii nu poate fi în viitor' :
    ultima.stare === 'incarc' ? 'Se verifică ultima factură RH…' :
    ultima.data && dataEmitere < ultima.data ? `Interzis: data e înaintea ultimei facturi RH (${zz(ultima.data)})` : null

  function alegeData(d: string) {
    setDataEmitere(d)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= aziRo()) void supabase.from('setari').upsert({ cheie: CHEIE_DATA_EMITERE, valoare: d }, { onConflict: 'cheie' }).then(() => {})
  }
  async function cautaFirma() {
    setFirma({ incarc: true })
    try {
      const res = await fetch('/api/firma?cui=' + encodeURIComponent(String(cl.cui || '')), { cache: 'no-store' }); const o = await res.json()
      if (!res.ok) { setFirma({ eroare: o.error || 'Căutarea a eșuat' }); return }
      setAltaTara(false); setC({ cui: o.cui, firma: o.firma, regCom: o.regCom, platitorTva: o.platitorTva, tara: 'Romania', judet: o.judet, localitate: o.localitate, adresa: o.adresa })
      setFirma({ avert: o.radiata ? 'Atenție: firma apare RADIATĂ la ANAF' : o.inactiva ? 'Atenție: firma apare INACTIVĂ la ANAF' : undefined })
    } catch (e) { setFirma({ eroare: e instanceof Error ? e.message : 'Căutarea a eșuat' }) }
  }
  async function emite() {
    setEtapa('trimit'); setEroare('')
    try {
      const res = await fetch('/api/factura-oblio/manuala', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeClient: nume.trim(), cod: cod.trim().toUpperCase(), canal, suma: sumaNr, dataEmitere, client: cl }) })
      const o = await res.json().catch(() => ({}))
      if (!res.ok || !o.numar) { if (o.ultima?.data) setUltima({ stare: 'ok', data: o.ultima.data, numar: o.ultima.numar }); setEroare(o.error || `Eroare ${res.status}`); setEtapa('form'); return }
      alegeData(dataEmitere)
      setEmisa({ serie: o.serie, numar: o.numar, link: o.link, info: o.dejaEmisa ? 'Codul acesta era deja facturat — aceasta e factura existentă' : o.avertisment || undefined })
    } catch (e) { setEroare(e instanceof Error ? e.message : 'Emiterea a eșuat'); setEtapa('form') }
  }

  return (
    <div className="rz" onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ zIndex: 60 }}>
      <style>{CSS}</style>
      <div className="rz-panel" data-factura-manuala style={{ width: 640, height: 'auto', maxHeight: '94vh' }}>
        <div className="rz-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.muted }}>Factură fără rezervare în aplicație</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Generează factură · RH</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>AB Textile · Oblio · trimisă automat în SPV</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Închide" className="rz-x"><X size={16} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 22px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {emisa ? (
            <div className="rz-invoice" data-emisa>
              <FileText size={16} style={{ color: C.green, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: C.text }}>{emisa.serie} {emisa.numar}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{emisa.info || 'Factura a fost emisă și trimisă în SPV'}</div>
              </div>
              {emisa.link && <a href={emisa.link} target="_blank" rel="noopener noreferrer" className="rz-btn" style={{ marginLeft: 'auto' }}>PDF <ExternalLink size={12} /></a>}
            </div>
          ) : (<>
            <div style={{ fontSize: 12, padding: '8px 10px', borderRadius: 8, border: `1px solid ${ultima.stare === 'eroare' ? C.amber : C.line}`, color: ultima.stare === 'eroare' ? C.amber : C.muted }}>
              {ultima.stare === 'incarc' ? 'Se verifică ultima factură din seria RH…'
                : ultima.stare === 'eroare' ? <>Ultima factură RH nu s-a putut citi acum ({ultima.eroare}). Se reîncearcă automat; data e verificată oricum la emitere. <button type="button" className="rz-sug" onClick={() => setCerere(x => x + 1)}>Reîncearcă</button></>
                : ultima.data ? <>Ultima factură RH: <b style={{ color: C.text }}>{ultima.numar}</b> din <b style={{ color: C.text }}>{zz(ultima.data)}</b> · nu se poate factura cu o dată mai veche</>
                : 'Nicio factură emisă încă în seria RH'}
            </div>
            <div className="rz-grid rz-2">
              <div><Label>Nume client (oaspete) *</Label><input data-nume value={nume} onChange={e => setNume(e.target.value)} placeholder="ex. Mihai Popescu" /></div>
              <div><Label>Platformă</Label><select value={canal} onChange={e => setCanal(e.target.value as 'airbnb' | 'booking')}><option value="airbnb">Airbnb</option><option value="booking">Booking.com</option></select></div>
              <div><Label>Cod rezervare *</Label><input data-cod value={cod} onChange={e => setCod(e.target.value)} placeholder={canal === 'airbnb' ? 'HMXXXXXXXX' : '6012345678'} style={{ fontFamily: 'monospace' }} /></div>
              <div><Label>Sumă de facturat (RON) *</Label><input data-suma inputMode="decimal" value={suma} onChange={e => setSuma(e.target.value)} placeholder="ex. 764" /></div>
            </div>
            <label className="rz-check" data-pj>
              <input type="checkbox" checked={!!cl.pj} onChange={e => { const pj = e.target.checked; setFirma({}); setC(pj ? { pj, tara: 'Romania' } : { pj }); if (pj) setAltaTara(false) }} />
              Client persoană juridică (factură pe firmă)
            </label>
            {cl.pj && (
              <div style={{ padding: 10, borderRadius: 10, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}><Label>CUI firmă</Label><input data-cui value={cl.cui || ''} placeholder="ex. RO24837298" onChange={e => setC({ cui: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void cautaFirma() } }} /></div>
                  <button type="button" className="rz-btn" onClick={() => void cautaFirma()} disabled={firma.incarc || !String(cl.cui || '').trim()} style={{ padding: '10px 14px' }}>{firma.incarc ? <><Loader2 size={13} className="rz-spin" /> Caut…</> : 'Caută la ANAF'}</button>
                </div>
                <div><Label>Denumire firmă</Label><input data-denumire-firma value={cl.firma || ''} onChange={e => setC({ firma: e.target.value })} /></div>
                <div className="rz-grid rz-2">
                  <div><Label>Nr. Reg. Com.</Label><input value={cl.regCom || ''} onChange={e => setC({ regCom: e.target.value })} /></div>
                  <div><Label>TVA</Label><select value={cl.platitorTva ? 'da' : 'nu'} onChange={e => setC({ platitorTva: e.target.value === 'da' })}><option value="nu">neplătitoare de TVA</option><option value="da">plătitoare de TVA (RO)</option></select></div>
                </div>
                {firma.eroare && <div style={{ fontSize: 11.5, color: C.red }}>{firma.eroare}</div>}
                {firma.avert && <div style={{ fontSize: 11.5, color: C.amber }}>{firma.avert}</div>}
              </div>
            )}
            <div className="rz-grid rz-2">
              <div><Label>Țara clientului</Label>
                <select data-tara value={altaTara ? '__alta__' : (TARI.find(t => eq(t, cl.tara)) || '__alta__')}
                  onChange={e => { const v = e.target.value; if (v === '__alta__') { setAltaTara(true); setC({ tara: '', judet: '', localitate: '' }); return } setAltaTara(false); setC({ tara: v, ...(v !== cl.tara ? { judet: '', localitate: '' } : {}) }) }}>
                  {TARI.map(t => <option key={t} value={t}>{t}</option>)}<option value="__alta__">Altă țară…</option>
                </select>
                {altaTara && <input value={cl.tara} placeholder="scrie țara" onChange={e => setC({ tara: e.target.value })} style={{ marginTop: 6 }} />}
              </div>
              <div><Label>{eRo ? 'Județ' : 'Regiune / stat'}</Label>
                {eRo ? <select data-judet value={cl.judet} onChange={e => setC({ judet: e.target.value, ...(localitatiJudet(cl.judet).some(l => eq(l, cl.localitate)) && !localitatiJudet(e.target.value).some(l => eq(l, cl.localitate)) ? { localitate: '' } : {}) })}><option value="">— alege —</option>{JUDETE.map(j => <option key={j} value={j}>{j}</option>)}</select>
                  : <input value={cl.judet} placeholder="opțional" onChange={e => setC({ judet: e.target.value })} />}
              </div>
              <div style={{ gridColumn: '1 / -1' }}><Label>{eRo ? 'Localitate' : 'Oraș'}</Label><input data-localitate value={cl.localitate} onChange={e => setC({ localitate: e.target.value })} placeholder={eRo ? 'ex. Pașcani' : 'orașul de domiciliu'} /></div>
              {sugestii.length > 0 && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: -6 }}>
                  <span style={{ fontSize: 11, color: C.faint }}>{eRo ? `Localități în ${cl.judet}:` : `Orașe în ${cl.tara}:`}</span>
                  {sugestii.map(l => <button key={l} type="button" className="rz-sug" aria-pressed={eq(l, cl.localitate)} onClick={() => setC({ localitate: l })}>{l}</button>)}
                </div>
              )}
              <div><Label>Data emiterii</Label><input type="date" data-data value={dataEmitere} min={ultima.data || undefined} max={aziRo()} onChange={e => alegeData(e.target.value)} /></div>
              <div><Label>Adresă (opțional)</Label><input value={cl.adresa} placeholder="stradă, număr — dacă o știi" onChange={e => setC({ adresa: e.target.value })} /></div>
            </div>
            {etapa === 'confirm' ? (
              <div className="rz-confirm">
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                  Emiți factura <b>RH</b> pe <b>AB Textile</b> pentru <b>{cl.pj && cl.firma ? `${cl.firma} (CUI ${cl.cui})` : nume}</b> ({[cl.localitate, cl.judet, eRo ? '' : cl.tara].filter(Boolean).join(', ')}), <b>{sumaNr.toLocaleString('ro-RO', { minimumFractionDigits: 2 })} RON</b>, rezervare {canal === 'airbnb' ? 'Airbnb' : 'Booking'} <b style={{ fontFamily: 'monospace' }}>{cod.trim().toUpperCase()}</b>, cu data <b>{zz(dataEmitere)}</b>?
                  <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>Se trimite automat în SPV — nu se poate retrage din aplicație.</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" className="rz-btn" onClick={() => setEtapa('form')}>Renunță</button>
                  <button type="button" className="rz-btn rz-btn-go" onClick={() => void emite()}>Da, emite factura</button>
                </div>
              </div>
            ) : (<>
              <button type="button" className="rz-btn rz-btn-go" style={{ width: '100%', justifyContent: 'center', padding: '10px 12px' }} disabled={!!motiv || etapa === 'trimit'} onClick={() => setEtapa('confirm')}>
                {etapa === 'trimit' ? <><Loader2 size={14} className="rz-spin" /> Se emite…</> : <><FileText size={14} /> Emite factură (Oblio · RH)</>}
              </button>
              {motiv && <div style={{ fontSize: 11, color: C.muted }}>{motiv}</div>}
            </>)}
            {eroare && <div className="rz-msg rz-msg-err"><AlertTriangle size={13} /> {eroare}</div>}
          </>)}
        </div>
      </div>
    </div>
  )
}
