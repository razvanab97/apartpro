'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Copy, Check, Download, FileText, MessageCircle, Loader2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { citesteGhid, incarcaMedia } from '@/lib/ghid'

// Confirmare de rezervare pentru client, ca imagine / PDF - design „Futuristic Luxury” reprodus dupa imaginea de
// referinta aprobata (cerut direct: „1:1 cu imaginea de referință”, 1098×1432): antet AB HOMES, bifa neon, „Vă
// mulțumim, <prenume>!”, cardul apartamentului cu poza reala, check-in / check-out, cardul oaspeti / nopti / plata
// (total, avans, rest de plata), cardul compact WhatsApp, subsol cu nr. rezervare + site, curbe luminoase decorative.
// Se deseneaza local pe canvas, la rezolutie dubla (2196×2864) - identic pe orice telefon / browser, fara servicii externe.
// Observatiile INTERNE ale rezervarii (CNP etc.) nu apar niciodata pe confirmare.

import { SITE, WHATSAPP, T, codRezervare, nr, fmtBani, noptiIntre, prenumeImplicit, incarcaFonturi, deseneaza, type Limba, type DateConfirmare } from '@/lib/confirmareDesen'

// PDF minim (o pagina, imaginea JPEG pe toata pagina, fara margini) - fara biblioteci
function pdfDinJpeg(jpeg: Uint8Array, wPx: number, hPx: number): Blob {
  const pw = 595.28, ph = +(pw * hPx / wPx).toFixed(2)
  const enc = new TextEncoder(); const parti: Uint8Array[] = []; const offs: number[] = []; let len = 0
  const add = (p: string | Uint8Array) => { const b = typeof p === 'string' ? enc.encode(p) : p; parti.push(b); len += b.length }
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const obj = (n: number, body: string) => { offs[n] = len; add(`${n} 0 obj\n${body}\nendobj\n`) }
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  offs[4] = len
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  add(jpeg); add('\nendstream\nendobj\n')
  const cont = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`
  obj(5, `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`)
  const xref = len
  add(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)
  return new Blob(parti as BlobPart[], { type: 'application/pdf' })
}

function textConfirmare(d: DateConfirmare) {
  const L = T[d.limba], data = (iso: string) => { const z = new Date(iso + 'T12:00:00'); return `${String(z.getDate()).padStart(2, '0')} ${L.luni[z.getMonth()]} · ${L.zile[z.getDay()]}` }
  const total = d.total, achitat = Math.min(d.achitat, total || d.achitat), rest = Math.max(0, total - achitat)
  const plata = total > 0 && achitat >= total ? `✓ ${L.integral.toLowerCase()}` : achitat > 0 ? `${L.avans.toLowerCase()}: ${fmtBani(achitat, d.moneda)} · ${L.rest.toLowerCase()}: ${fmtBani(rest, d.moneda)}` : `${L.rest.toLowerCase()}: ${fmtBani(rest, d.moneda)}`
  return [
    `✅ *${L.titlu}* — AB Homes Iași`, '',
    `${L.multumim}${d.prenume}!`,
    `🔖 ${L.nr.charAt(0) + L.nr.slice(1).toLowerCase()}: ${d.cod}`,
    `🏠 ${d.apt}${d.adresa ? ` — ${d.adresa}` : ''}`,
    `📅 ${L.checkin}: ${data(d.ci)} · ${L.dela}${d.oraCi}`,
    `📅 ${L.checkout}: ${data(d.co)} · ${L.panala}${d.oraCo}`,
    `👥 ${L.oaspeti(d.oaspeti)} · ${L.nopti(noptiIntre(d.ci, d.co))}`,
    `💳 ${L.total.charAt(0) + L.total.slice(1).toLowerCase()}: ${fmtBani(total, d.moneda)} · ${plata}`,
    '', `💬 ${L.wa}`, '', SITE,
  ].join('\n')
}

// Se deschide fie cu rezervarea deja incarcata (editorul), fie doar cu id-ul ei (ex. fereastra rapida din Calendar)
export default function ConfirmareClient(props: { rezervare?: any; apt?: any; rezervareId?: string; onClose: () => void }) {
  const [incarcat, setIncarcat] = useState<{ r: any; apt: any } | null>(props.rezervare ? { r: props.rezervare, apt: props.apt } : null)
  const [eroare, setEroare] = useState<string | null>(null)
  useEffect(() => {
    if (props.rezervare || !props.rezervareId) return
    Promise.resolve(supabase.from('rezervari').select('*, apartament:apartamente(id,nume,nota,adresa)').eq('id', props.rezervareId).single())
      .then(({ data, error }) => error || !data ? setEroare(error?.message || 'Rezervarea nu a fost găsită') : setIncarcat({ r: data, apt: (data as any).apartament }))
      .catch((e: any) => setEroare(e.message))
  }, [props.rezervare, props.rezervareId])
  if (incarcat) return <ConfirmareClientPanou rezervare={incarcat.r} apt={incarcat.apt} onClose={props.onClose} />
  return (
    <div onClick={props.onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(3,7,15,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderRadius: 12, background: '#0B1524', border: '1px solid rgba(159,215,255,0.14)', color: eroare ? '#F87171' : 'rgba(159,215,255,0.7)', fontSize: 13 }}>
        {eroare ? '⚠ ' + eroare : <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Se încarcă rezervarea…</>}
      </div>
    </div>
  )
}

// poza apartamentului: aleasa pentru confirmari (setari confirmare_poza_<aptId>) sau, implicit, fundalul / prima poza din ghidul de check-in
const cheiePoza = (aptId: string) => 'confirmare_poza_' + aptId
function incarcaImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise(res => { if (!url) return res(null); const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url })
}

function ConfirmareClientPanou({ rezervare, apt, onClose }: { rezervare: any; apt: any; onClose: () => void }) {
  const aptId = apt?.id || rezervare.apartament_id
  const totalImplicit = nr(rezervare.valoare_bruta) || nr(rezervare.suma_incasata)
  // platit = suma incasata; daca rezervarea e marcata „achitat” fara suma incasata, se considera achitata integral
  const achitatImplicit = nr(rezervare.suma_incasata) || (rezervare.status_plata === 'achitat' ? totalImplicit : 0)
  const [limba, setLimba] = useState<Limba>('ro')
  const [prenume, setPrenume] = useState(() => prenumeImplicit(rezervare.nume_client, rezervare.canal))
  const [oraCi, setOraCi] = useState('15:00')
  const [oraCo, setOraCo] = useState('11:00')
  const [oaspeti, setOaspeti] = useState(String(Number(rezervare.nr_persoane) || 1))
  const [total, setTotal] = useState(String(totalImplicit || ''))
  const [achitat, setAchitat] = useState(String(Math.min(achitatImplicit, totalImplicit || achitatImplicit) || 0))
  const [pozaUrl, setPozaUrl] = useState('')
  const [pozeGhid, setPozeGhid] = useState<string[]>([])
  const [poza, setPoza] = useState<HTMLImageElement | null>(null)
  const [incarcPoza, setIncarcPoza] = useState(false)
  const [img, setImg] = useState<string | null>(null)
  const [stare, setStare] = useState<string | null>(null)
  const [gata, setGata] = useState(false)
  const cvRef = useRef<HTMLCanvasElement | null>(null)

  // poza: cea salvata pentru confirmari, altfel din ghidul apartamentului
  useEffect(() => {
    if (!aptId) return
    ;(async () => {
      const [{ data: s }, g] = await Promise.all([supabase.from('setari').select('valoare').eq('cheie', cheiePoza(aptId)).maybeSingle(), citesteGhid(aptId)])
      const dinGhid = g ? [g.fundal, ...g.pasi.flatMap(p => p.media.filter(m => m.tip === 'img').map(m => m.url))].filter(Boolean) as string[] : []
      setPozeGhid(Array.from(new Set(dinGhid)).slice(0, 8))
      setPozaUrl(s?.valoare || dinGhid[0] || '')
    })().catch(() => {})
  }, [aptId])
  useEffect(() => { let v = true; incarcaImg(pozaUrl).then(im => v && setPoza(im)); return () => { v = false } }, [pozaUrl])

  const d: DateConfirmare = useMemo(() => ({
    limba, prenume, nume: String(rezervare.nume_client || '').trim(), cod: codRezervare(rezervare), apt: String(apt?.nume || '').trim(), adresa: String(apt?.adresa || '').trim(),
    ci: rezervare.data_checkin, co: rezervare.data_checkout, oraCi, oraCo, oaspeti: Math.max(1, Number(oaspeti) || 1),
    total: nr(total), achitat: nr(achitat), moneda: rezervare.moneda || 'RON',
  }), [limba, prenume, rezervare, apt, oraCi, oraCo, oaspeti, total, achitat])

  useEffect(() => { let v = true; incarcaFonturi().then(() => v && setGata(true)); return () => { v = false } }, [])
  useEffect(() => {
    if (!gata) return
    const t = setTimeout(() => {
      const cv = cvRef.current || (cvRef.current = document.createElement('canvas'))
      deseneaza(cv, d, poza)
      try { setImg(cv.toDataURL('image/png')) } catch { deseneaza(cv, d, null); setImg(cv.toDataURL('image/png')) }  // poza fara CORS -> fara poza
    }, 120)
    return () => clearTimeout(t)
  }, [gata, d, poza])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose() } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [onClose])

  const flash = (m: string) => { setStare(m); setTimeout(() => setStare(s => s === m ? null : s), 2400) }
  async function alegePoza(url: string) {
    setPozaUrl(url)
    if (aptId) await supabase.from('setari').upsert({ cheie: cheiePoza(aptId), valoare: url }, { onConflict: 'cheie' })
    flash('Poza a fost salvată pentru confirmările acestui apartament')
  }
  async function incarcaPozaNoua(f?: File) {
    if (!f) return
    setIncarcPoza(true)
    const { media, eroare } = await incarcaMedia(String(apt?.nota || aptId || 'confirmari'), f)
    setIncarcPoza(false)
    if (eroare || !media) { flash('Eroare la încărcare: ' + (eroare || '')); return }
    setPozeGhid(p => [media.url, ...p]); await alegePoza(media.url)
  }
  const blobPng = () => new Promise<Blob>((res, rej) => cvRef.current ? cvRef.current.toBlob(b => b ? res(b) : rej(new Error('canvas')), 'image/png') : rej(new Error('canvas')))
  const numeFisier = `Confirmare-${d.cod}-${d.nume.replace(/\s+/g, '-')}`
  async function copiazaPoza() {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPng() })]); flash('Poza a fost copiată — lipește-o în WhatsApp (⌘/Ctrl+V)') }
    catch { flash('Browserul n-a permis copierea pozei — folosește „Descarcă PNG”') }
  }
  async function copiazaText() { try { await navigator.clipboard.writeText(textConfirmare(d)); flash('Textul a fost copiat') } catch { flash('Nu s-a putut copia textul') } }
  function descarca(blob: Blob, nume: string) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = nume; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000) }
  async function descarcaPng() { try { descarca(await blobPng(), numeFisier + '.png') } catch { flash('Eroare la generare') } }
  async function descarcaPdf() {
    const cv = cvRef.current; if (!cv) return
    const jb = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.94)); if (!jb) return
    descarca(pdfDinJpeg(new Uint8Array(await jb.arrayBuffer()), cv.width, cv.height), numeFisier + '.pdf')
  }
  const tel = String(rezervare.telefon_client || '').replace(/[^0-9]/g, '')
  const rest = Math.max(0, nr(total) - nr(achitat))

  const btn = (bgc: string, fg: string, br: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 12px', borderRadius: 10, border: `1px solid ${br}`, background: bgc, color: fg, fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' })
  const camp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, background: 'rgba(20,38,65,0.8)', border: '1px solid rgba(159,215,255,0.2)', color: '#FFFFFF', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }
  const et = (t: string, el: React.ReactNode, c = 'rgba(159,215,255,0.6)') => <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: c, minWidth: 0 }}>{t}{el}</label>

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(3,7,15,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="cf-wrap" style={{ width: 'min(1100px,100%)', maxHeight: 'calc(100vh - 32px)', overflow: 'auto', background: '#0B1524', border: '1px solid rgba(159,215,255,0.14)', borderRadius: 18, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,10,20,0.6)', borderRight: '1px solid rgba(159,215,255,0.08)', minHeight: 300 }}>
          {img ? <img data-confirmare src={img} alt="Confirmare rezervare" style={{ width: '100%', maxWidth: 540, maxHeight: 'calc(100vh - 70px)', objectFit: 'contain', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} />
            : <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(159,215,255,0.6)', fontSize: 13 }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Se generează confirmarea…</div>}
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>Confirmare pentru client</div>
              <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.5)', marginTop: 2 }}>Verifică datele — previzualizarea se actualizează pe loc</div>
            </div>
            <button onClick={onClose} title="Închide" style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(159,215,255,0.18)', background: 'transparent', color: 'rgba(214,228,244,0.7)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={15} /></button>
          </div>

          <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, background: 'rgba(14,27,43,0.6)', border: '1px solid rgba(159,215,255,0.1)' }}>
            {(['ro', 'en'] as Limba[]).map(l => (
              <button key={l} onClick={() => setLimba(l)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: limba === l ? 'rgba(77,163,255,0.2)' : 'transparent', color: limba === l ? '#7BC8FF' : 'rgba(159,215,255,0.5)' }}>{l === 'ro' ? '🇷🇴 Română' : '🇬🇧 English'}</button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {et('Prenume („Vă mulțumim, …!”)', <input data-camp="prenume" value={prenume} onChange={e => setPrenume(e.target.value)} style={camp} />)}
            {et('Oaspeți', <input data-camp="oaspeti" type="number" min={1} value={oaspeti} onChange={e => setOaspeti(e.target.value)} style={camp} />)}
            {et('Ora check-in', <input data-camp="ora-ci" value={oraCi} onChange={e => setOraCi(e.target.value)} style={camp} />)}
            {et('Ora check-out', <input data-camp="ora-co" value={oraCo} onChange={e => setOraCo(e.target.value)} style={camp} />)}
            {et(`Total sejur (${d.moneda})`, <input data-camp="total" inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} style={camp} />, '#E8CCFF')}
            {et(`Plătit / avans (${d.moneda})`, <input data-camp="achitat" inputMode="decimal" value={achitat} onChange={e => setAchitat(e.target.value)} style={camp} />, '#E8CCFF')}
          </div>
          <div style={{ fontSize: 11.5, color: nr(total) > 0 && nr(achitat) >= nr(total) ? '#5EEAD4' : '#E8CCFF' }}>
            {nr(total) > 0 && nr(achitat) >= nr(total) ? '✓ Pe confirmare: „Achitat integral”' : `Rest de plată pe confirmare: ${fmtBani(rest, d.moneda)}${nr(achitat) > 0 ? '' : ' (fără rândul „Avans plătit”)'}`}
          </div>

          {et('Poza apartamentului', <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {pozeGhid.map(u => (
              <button key={u} type="button" onClick={() => alegePoza(u)} title="Folosește poza aceasta" style={{ width: 54, height: 40, padding: 0, borderRadius: 7, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${u === pozaUrl ? '#C794F6' : 'rgba(159,215,255,0.15)'}`, background: '#000' }}>
                <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
            <label style={{ width: 54, height: 40, borderRadius: 7, border: '1.5px dashed rgba(199,148,246,0.6)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#C794F6' }} title="Încarcă o poză nouă">
              {incarcPoza ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { incarcaPozaNoua(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            {!pozeGhid.length && !incarcPoza && <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'rgba(159,215,255,0.45)' }}>Încarcă o poză (se ține minte pentru apartament)</span>}
          </div>)}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
            {([
              ['Poză', <>
                <button key="cp" onClick={copiazaPoza} disabled={!img} style={{ ...btn('linear-gradient(135deg,#7C3AED,#2563EB)', '#FFFFFF', 'transparent'), flex: 1.4 }}><Copy size={14} /> Copiază poza</button>
                <button key="png" onClick={descarcaPng} disabled={!img} style={{ ...btn('rgba(159,215,255,0.06)', 'rgba(214,228,244,0.85)', 'rgba(159,215,255,0.2)'), flex: 1 }}><Download size={14} /> PNG</button>
              </>],
              ['Text', <>
                <button key="ct" onClick={copiazaText} style={{ ...btn('rgba(77,163,255,0.1)', '#7BC8FF', 'rgba(77,163,255,0.3)'), flex: 1.4 }}><FileText size={14} /> Copiază text</button>
                {tel.length >= 9
                  ? <a key="wa" href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer" style={{ ...btn('rgba(37,211,102,0.12)', '#4ADE80', 'rgba(37,211,102,0.35)'), flex: 1 }}><MessageCircle size={14} /> WhatsApp</a>
                  : <span key="wa" style={{ ...btn('transparent', 'rgba(159,215,255,0.35)', 'rgba(159,215,255,0.1)'), flex: 1, cursor: 'default', fontWeight: 500, fontSize: 11.5 }}>fără telefon</span>}
              </>],
              ['PDF', <>
                <button key="pdf" onClick={descarcaPdf} disabled={!img} style={{ ...btn('rgba(159,215,255,0.06)', 'rgba(214,228,244,0.85)', 'rgba(159,215,255,0.2)'), flex: 1 }}><Download size={14} /> Descarcă PDF</button>
              </>],
            ] as [string, React.ReactNode][]).map(([e, c]) => (
              <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 38, flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(159,215,255,0.45)' }}>{e}</span>
                {c}
              </div>
            ))}
          </div>
          {stare && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: /Browserul|Nu |Eroare/.test(stare) ? '#FCD34D' : '#4ADE80' }}><Check size={13} /> {stare}</div>}
          <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.4)', lineHeight: 1.5 }}>Pas rapid: „Copiază poza” → „WhatsApp” (se deschide chatul cu clientul, {WHATSAPP} rămâne contactul AB Homes) → lipește poza. Nimic nu se trimite automat.</div>
        </div>
      </div>
      <style>{`@media (max-width: 780px){ .cf-wrap{ grid-template-columns: 1fr !important } }`}</style>
    </div>
  )
}
