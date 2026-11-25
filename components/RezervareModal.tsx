'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase, normalizeWaPhone, pretRezervareText, CANALE_LABEL, STATUS_REZERVARE_LABEL, STATUS_PLATA_LABEL, STATUS_DECONT_LABEL, STATUS_FACTURARE_LABEL, numVal, numInput, type Apartament } from '@/lib/supabase'
import { X, Minus, Plus, Hash, ChevronDown, FileText, ExternalLink, Loader2, Moon, AlertTriangle, Phone, MessageCircle, Globe, Handshake, CircleDot } from 'lucide-react'
import AvertismentNealocate from '@/components/AvertismentNealocate'
import { localitatiJudet, loadExtraLocs } from '@/lib/locatii-romania'
import { TARI, oraseTara, taraOblio } from '@/lib/tariOrase'
import ConfirmareClient from '@/components/ConfirmareClient'
import DublareRezervare from '@/components/DublareRezervare'
import DocumentConfirmare from '@/components/DocumentConfirmare'
import { MONEDE_REZ, CAMPURI_BANI, cursAzi } from '@/lib/moneda'
import { salveazaRezervare, cuCanal, payloadRezervare, validareRezervare, SELECT_REZERVARE } from '@/lib/rezervareEdit'

// Formularul de rezervare (nou/editare). A doua refacere, la cerere ("in continuare e greu de lucrat"):
// pe desktop doua coloane - stanga ce se completeaza (rezervare, oaspete, cod platforma, observatii),
// dreapta un panou fix cu banii, decontul, statusurile si factura, ca totul sa se vada fara derulare.
// Campurile rar folosite (comision platforma, costuri operationale) sunt un singur rand cu totalul,
// deschis doar la nevoie. Pe telefon coloanele se aseaza una sub alta.

type Props = {
  open: boolean
  editing: any
  setEditing: (fn: any) => void
  apartamente: Apartament[]
  onAptChange: (aptId: string) => void
  recalcComisionPlatforma: (brut: number | '', pct: number | '') => void
  calcul: { baza: number; comision: number; suma_proprietar: number } | null
  saving: boolean
  onSave: () => void
  onClose: () => void
  onReload?: () => void
  // Actiuni specifice paginii care deschide formularul (ex. calendarul: mesaje WhatsApp, anulare),
  // primesc rezervarea asa cum e in formular in acel moment
  extra?: (editing: any) => ReactNode
}

export const C = {
  text: '#EAF4FF',
  text2: 'rgba(214,228,244,0.75)',
  muted: 'rgba(159,215,255,0.5)',
  faint: 'rgba(159,215,255,0.32)',
  line: 'rgba(159,215,255,0.1)',
  aside: 'rgba(6,14,26,0.55)',
  blue: '#7BC8FF',
  green: '#4ADE80',
  red: '#F87171',
  amber: '#FCD34D',
}

const TONE: Record<string, { c: string; bg: string; b: string }> = {
  green: { c: '#4ADE80', bg: 'rgba(34,197,94,0.16)', b: 'rgba(34,197,94,0.45)' },
  amber: { c: '#FCD34D', bg: 'rgba(245,158,11,0.16)', b: 'rgba(245,158,11,0.45)' },
  red: { c: '#F87171', bg: 'rgba(239,68,68,0.16)', b: 'rgba(239,68,68,0.45)' },
  blue: { c: '#7BC8FF', bg: 'rgba(77,163,255,0.18)', b: 'rgba(77,163,255,0.5)' },
  gray: { c: '#CBD5E1', bg: 'rgba(148,163,184,0.16)', b: 'rgba(148,163,184,0.45)' },
}
const TON_REZ: Record<string, string> = { cerere: 'amber', confirmata: 'green', anulata: 'red', finalizata: 'blue' }
const TON_PLATA: Record<string, string> = { neplatit: 'red', avans: 'amber', achitat: 'green' }
const METODE_AVANS = ['Transfer bancar', 'Numerar', 'Card', 'Revolut', 'Altă metodă']
const TON_DECONT: Record<string, string> = { nedecontat: 'gray', inclus: 'amber', decontat: 'green' }
// Domiciliul clientului pe factura (cerut direct: „pentru facturare și pentru a ajunge în SPV, la clienți să ajungă și
// județul și localitatea de domiciliu”) - date REALE ale oaspetelui (ex. profilul Airbnb „Locuiește în …”), nu inventate
export const JUDETE = ['Alba', 'Arad', 'Arges', 'Bacau', 'Bihor', 'Bistrita-Nasaud', 'Botosani', 'Braila', 'Brasov', 'Bucuresti', 'Buzau', 'Calarasi', 'Caras-Severin', 'Cluj', 'Constanta', 'Covasna', 'Dambovita', 'Dolj', 'Galati', 'Giurgiu', 'Gorj', 'Harghita', 'Hunedoara', 'Ialomita', 'Iasi', 'Ilfov', 'Maramures', 'Mehedinti', 'Mures', 'Neamt', 'Olt', 'Prahova', 'Salaj', 'Satu Mare', 'Sibiu', 'Suceava', 'Teleorman', 'Timis', 'Tulcea', 'Valcea', 'Vaslui', 'Vrancea']
// pj = factura pe firma (cerut direct: „factură pe PJ - adăugăm CUI și primim toată informația”), datele din ANAF
export type ClientFactura = { tara: string; judet: string; localitate: string; adresa: string; pj?: boolean; cui?: string; firma?: string; regCom?: string; platitorTva?: boolean }
export const CLIENT_GOL: ClientFactura = { tara: 'Romania', judet: '', localitate: '', adresa: '', pj: false, cui: '', firma: '', regCom: '', platitorTva: false }
export const aziRo = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
export const CHEIE_DATA_EMITERE = 'factura_rh_ultima_data_aleasa'
export const eRomania = (t: string) => !t.trim() || /^rom[aâ]nia$/i.test(t.trim())
const TON_FACT: Record<string, string> = { nefacturat: 'gray', de_facturat: 'amber', facturata: 'green' }

// Alegerea platformei (cerut direct: „la ales platforma să fie mai dinamic, să arate o imagine în dreptul fiecărei
// platforme, sau culoarea potrivită”): butoane cu insigna si culoarea fiecarei platforme in loc de lista simpla.
// c = culoarea insignei, t = culoarea textului pe fundalul inchis (Booking e prea inchis ca text)
const PLATFORME: Record<string, { c: string; t: string; semn: ReactNode }> = {
  airbnb: { c: '#FF5A5F', t: '#FF7A7E', semn: <b style={{ fontSize: 12, fontWeight: 900, letterSpacing: '-.02em' }}>A</b> },
  booking: { c: '#003580', t: '#6EA8FF', semn: <b style={{ fontSize: 11, fontWeight: 900, letterSpacing: '-.04em' }}>B<span style={{ color: '#5BC0F8' }}>.</span></b> },
  direct: { c: '#16A34A', t: '#4ADE80', semn: <Handshake size={13} /> },
  telefon: { c: '#0EA5E9', t: '#7DD3FC', semn: <Phone size={12} /> },
  whatsapp: { c: '#25D366', t: '#4ADE80', semn: <MessageCircle size={13} /> },
  site: { c: '#8B5CF6', t: '#C4B5FD', semn: <Globe size={13} /> },
}
const platforma = (k: string) => PLATFORME[k] || { c: '#64748B', t: '#CBD5E1', semn: <CircleDot size={12} /> }
function InsignaPlatforma({ k, size = 22 }: { k: string; size?: number }) {
  const p = platforma(k)
  return <span aria-hidden style={{ width: size, height: size, borderRadius: 6, background: p.c, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 0 0 1px ${p.c}55, 0 2px 8px ${p.c}40` }}>{p.semn}</span>
}

// Eticheta/placeholder pentru codul rezervarii, dupa canal - numarul de la platforma (nu ID-ul 5starDesk)
const COD_CANAL: Record<string, { label: string; ph: string }> = {
  airbnb: { label: 'Cod rezervare Airbnb', ph: 'HMXXXXXXXX' },
  booking: { label: 'Nr. rezervare Booking', ph: '6012345678' },
}

const COSTURI: [string, string][] = [
  ['cost_curatenie', 'Curățenie'], ['cost_spalatorie', 'Spălătorie'], ['cost_consumabile', 'Consumabile'],
  ['cost_mentenanta', 'Mentenanță'], ['alte_costuri', 'Alte costuri'],
]

const fmt = (n: number) => (Number(n) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtZi = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }) : '—'

export function Label({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
      <span className="rz-lbl">{children}</span>
      {right}
    </div>
  )
}

function Group({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <div style={{ paddingTop: first ? 0 : 18, marginTop: first ? 0 : 18, borderTop: first ? 'none' : `1px solid ${C.line}` }}>
      <div className="rz-group">{title}</div>
      {children}
    </div>
  )
}

function Money({ value, onChange, suffix = 'RON', big }: { value: any; onChange: (v: number | '') => void; suffix?: string; big?: boolean }) {
  return (
    <div style={{ position: 'relative' }}>
      <input type="number" inputMode="decimal" min={0} step={0.01} value={numVal(value, 0)} onChange={e => onChange(numInput(e.target.value, 0))}
        className={big ? 'rz-big' : undefined} style={{ paddingRight: 48, fontVariantNumeric: 'tabular-nums' }} />
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: C.faint, pointerEvents: 'none' }}>{suffix}</span>
    </div>
  )
}

function Segmented({ value, options, tones, onChange }: { value: string; options: Record<string, string>; tones: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <div className="rz-seg">
      {Object.entries(options).map(([k, v]) => {
        const on = value === k
        const t = TONE[tones[k] || 'gray']
        return (
          <button key={k} type="button" onClick={() => onChange(k)} style={on ? { color: t.c, background: t.bg, boxShadow: `inset 0 0 0 1px ${t.b}`, fontWeight: 700 } : undefined}>{v}</button>
        )
      })}
    </div>
  )
}

// Rand pliabil pentru campuri rar folosite: arata doar totalul, se deschide la click
function Fold({ title, value, open, onToggle, children }: { title: string; value: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${C.line}`, background: open ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
      <button type="button" onClick={onToggle} className="rz-fold">
        <span>{title}</span>
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <ChevronDown size={14} style={{ color: C.faint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && <div style={{ padding: '2px 12px 12px' }}>{children}</div>}
    </div>
  )
}

export default function RezervareModal({ open, editing, setEditing, apartamente, onAptChange, recalcComisionPlatforma, calcul, saving, onSave, onClose, onReload, extra }: Props) {
  const totalCosturi = COSTURI.reduce((s, [k]) => s + (Number(editing?.[k]) || 0), 0)
  const comision = (Number(editing?.comision_platforma_valoare) || 0) + (Number(editing?.tva_comision_platforma) || 0)
  const [showCosturi, setShowCosturi] = useState(false)
  const [confirmare, setConfirmare] = useState(false)
  // „⧉ Dublează”: rezervare noua pentru acelasi client; dupa creare fereastra trece pe ea
  const [dublare, setDublare] = useState(false)
  const [documentConf, setDocumentConf] = useState(false)
  const [dublataInfo, setDublataInfo] = useState<string | null>(null)
  // telefonul proprietarului apartamentului (pentru „Confirmare proprietar”, cerut direct)
  const [telProp, setTelProp] = useState<{ nume: string; tel: string | null } | null>(null)  // null = apartament fara proprietar
  useEffect(() => {
    if (!open || !editing?.apartament_id) { setTelProp(null); return }
    const din = editing?.apartament?.id === editing.apartament_id ? editing.apartament?.proprietar : null
    if (din?.telefon) { setTelProp({ nume: din.nume || '', tel: din.telefon }); return }
    setTelProp(null)
    let viu = true
    Promise.resolve(supabase.from('apartamente').select('proprietar:proprietari(nume,telefon)').eq('id', editing.apartament_id).maybeSingle())
      .then(({ data }) => { const p: any = (data as any)?.proprietar; if (viu) setTelProp(p ? { nume: p.nume || '', tel: p.telefon || null } : null) }).catch(() => {})
    return () => { viu = false }
  }, [open, editing?.apartament_id, editing?.apartament?.proprietar?.telefon]) // eslint-disable-line react-hooks/exhaustive-deps
  const msgPropietar = () => {
    const apt = String(apartamente.find(a => a.id === editing.apartament_id)?.nume || editing.apartament?.nume || 'apartament').trim()
    const zi = (d?: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' }) : ''
    const n = editing.data_checkin && editing.data_checkout ? Math.max(1, Math.round((new Date(editing.data_checkout).getTime() - new Date(editing.data_checkin).getTime()) / 86400000)) : '?'
    const pret = pretRezervareText(editing)
    return `🏠 Rezervare nouă — ${apt}\n\nS-a rezervat pentru data de ${zi(editing.data_checkin)} → ${zi(editing.data_checkout)} (${n} nopți), ${editing.nr_persoane || '?'} persoane.\nClient: ${editing.nume_client || ''}${editing.canal ? `\nPlatformă: ${CANALE_LABEL[editing.canal] || editing.canal}` : ''}${pret ? `\nPreț: ${pret}` : ''}`
  }
  // asistentul stie ce rezervare e deschisa pe ecran („mut-o pe N32”)
  useEffect(() => { if (open && editing?.id) window.dispatchEvent(new CustomEvent('agent:context', { detail: { rezervare_id: editing.id, rezervare_nume: `${editing.nume_client || ''} · ${editing.data_checkin || ''} → ${editing.data_checkout || ''}` } })) }, [open, editing?.id])
  const [showComision, setShowComision] = useState(false)
  const [original, setOriginal] = useState<any>(null)
  // Suma de facturat (cerut direct: „suma de facturat, în loc de încasat efectiv. Unde vom scrie o sumă, posibil alta decât
  // cea din calcul”) - în setari suma_facturare_<idRezervare>; goală = se facturează totalul rezervării (valoarea brută).
  // Factura Oblio (/api/factura-oblio) o folosește pe aceasta când e completată.
  const [sumaFact, setSumaFact] = useState<number | ''>('')
  const [sumaFactSalvata, setSumaFactSalvata] = useState<number | ''>('')
  const [showIncasat, setShowIncasat] = useState(false)
  // „Încasat efectiv” e valoarea folosită de rapoarte / statistici / deconturi: dacă e gol / 0 sau era egal cu totalul,
  // urmează totalul rezervării (altfel rezervarea apărea în raport fără sumă - raportat direct, Ionela Florentina N45)
  const brutAnterior = useRef<number | null>(null), idAnterior = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !editing) { brutAnterior.current = null; return }
    if (idAnterior.current !== (editing.id || 'nou')) { idAnterior.current = editing.id || 'nou'; brutAnterior.current = null }
    const brut = Number(editing.valoare_bruta) || 0, inc = Number(editing.suma_incasata) || 0
    if (brut > 0 && (inc === 0 || (brutAnterior.current != null && inc === brutAnterior.current)) && inc !== brut)
      setEditing((prev: any) => ({ ...prev, suma_incasata: brut }))
    brutAnterior.current = brut
  }, [open, editing?.id, editing?.valoare_bruta])  // eslint-disable-line react-hooks/exhaustive-deps
  // Pretul pe noapte: cand e completat de mana, totalul (valoarea bruta) = pret × nopti si se
  // recalculeaza singur cand se schimba datele; cand se scrie direct totalul, pretul se deduce din el
  const [pretNoapte, setPretNoapte] = useState<number | '' | null>(null)
  // moneda rezervarii (cerut direct: „să putem seta prețurile și în euro … în zonele unde setăm rezervările”): cursul BNR
  // de azi pentru „≈ X RON” si propunerea de a transforma sumele cand schimbi moneda unei rezervari care are deja preturi
  const [cursuri, setCursuri] = useState<Record<string, number>>({ RON: 1 })
  const [schimbMoneda, setSchimbMoneda] = useState<{ de: string; la: string } | null>(null)
  useEffect(() => { Promise.all(MONEDE_REZ.filter(m => m !== 'RON').map(async m => [m, await cursAzi(m)] as const)).then(v => setCursuri(c => ({ ...c, ...Object.fromEntries(v.filter(([, k]) => k > 0)) }))).catch(() => {}) }, [])
  const [auto, setAuto] = useState<{ stare: 'idle' | 'salvez' | 'salvat' | 'eroare'; mesaj?: string; ora?: string }>({ stare: 'idle' })
  const autoInZbor = useRef(false), autoSalvate = useRef(false)
  const [factura, setFactura] = useState<{ etapa: 'idle' | 'confirm' | 'trimit'; eroare?: string; info?: string }>({ etapa: 'idle' })
  // stornarea facturii emise (cerut direct: „funcția de stornare a unei facturi deja emise pe o rezervare anume”) + istoricul
  const [storno, setStorno] = useState<{ etapa: 'idle' | 'confirm' | 'trimit'; eroare?: string; info?: string; link?: string | null }>({ etapa: 'idle' })
  const [stornari, setStornari] = useState<any[]>([])
  const [clientFact, setClientFact] = useState<ClientFactura>(CLIENT_GOL)
  const [firmaStare, setFirmaStare] = useState<{ incarc?: boolean; eroare?: string; avert?: string }>({})
  const [altaTara, setAltaTara] = useState(false)   // tara scrisa de mana (nu e in lista)
  // datele de facturare ale clientului se salveaza la rezervare odata cu restul (cerut direct: „dacă am setat deja
  // informațiile de facturare, când dau salvează sau se închide pagina, să rămână salvate, să nu stau să reselectez”)
  const [clientSalvat, setClientSalvat] = useState(JSON.stringify(CLIENT_GOL))
  const [dataEmitere, setDataEmitere] = useState('')
  // sugestii de localitati pe judet (lista din Generator locatii + adresele extrase din acte) - se incarca o data
  const [locIncarcate, setLocIncarcate] = useState(false)
  useEffect(() => { if (open && !locIncarcate) void loadExtraLocs().finally(() => setLocIncarcate(true)) }, [open, locIncarcate])
  // ultima factura din seria RH (din Oblio): nu se poate emite cu data mai veche
  const [ultimaFact, setUltimaFact] = useState<{ stare: 'incarc' | 'ok' | 'eroare'; data?: string; numar?: string; eroare?: string }>({ stare: 'incarc' })
  const [ultimaCerere, setUltimaCerere] = useState(0)

  // La fiecare deschidere: randurile pliabile pornesc deschise doar daca au valori; se retine starea
  // salvata a rezervarii (factura se emite din datele SALVATE, deci modificarile nesalvate o blocheaza)
  const deschidere = open ? String(editing?.id || 'nou') : null
  const [ultimaDeschidere, setUltimaDeschidere] = useState<string | null>(null)
  // rezervarea noua tocmai creata la „Emite factură” primeste id - e aceeasi fereastra, nu o redeschidere (fara resetare)
  const idCreat = useRef<string | null>(null)
  // Enter = salveaza rezervarea, Enter dublu = emite factura (cerut direct: „butonul enter să salveze rezervarea și dublu
  // enter să confirme factura”). Primul Enter asteapta putin: daca vine al doilea, nu se mai salveaza/inchide ci se factureaza.
  const tasta = useRef<{ enter?: () => void; dublu?: () => void; confirm?: () => void }>({})
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  if (deschidere !== ultimaDeschidere) {
    const continuare = ultimaDeschidere === 'nou' && !!deschidere && deschidere === idCreat.current
    setUltimaDeschidere(deschidere)
    if (deschidere && !continuare) {
      setShowCosturi(totalCosturi > 0)
      setShowComision(comision > 0)
      setOriginal(editing)
      setPretNoapte(null)
      setSumaFact(''); setSumaFactSalvata('')
      setShowIncasat(Number(editing?.suma_incasata) > 0 && Number(editing?.suma_incasata) !== Number(editing?.valoare_bruta))
      setFactura({ etapa: 'idle' })
      setClientFact(CLIENT_GOL); setClientSalvat(JSON.stringify(CLIENT_GOL)); setAltaTara(false); setFirmaStare({}); setDataEmitere(aziRo())
      setAuto({ stare: 'idle' })
    }
  }

  useEffect(() => {
    if (!open || !editing?.id) return
    let anulat = false
    supabase.from('setari').select('valoare').eq('cheie', `suma_facturare_${editing.id}`).maybeSingle().then(({ data }) => {
      if (anulat) return
      const v = data?.valoare != null && data.valoare !== '' ? Number(data.valoare) : ''
      setSumaFact(v === '' || isNaN(v as number) ? '' : v); setSumaFactSalvata(v === '' || isNaN(v as number) ? '' : v)
    })
    // domiciliul clientului folosit data trecuta (se salveaza la emitere)
    supabase.from('setari').select('valoare').eq('cheie', `client_factura_${editing.id}`).maybeSingle().then(({ data }) => {
      if (anulat || !data?.valoare) return
      try { const c0 = { ...CLIENT_GOL, ...JSON.parse(data.valoare) }, c = { ...c0, tara: taraOblio(String(c0.tara || '')) }; setClientFact(c); setClientSalvat(JSON.stringify(c)); setAltaTara(!!c.tara.trim() && !TARI.some(t => t.localeCompare(c.tara.trim(), 'ro', { sensitivity: 'base' }) === 0)) } catch { /* ignorat */ }
    })
    return () => { anulat = true }
  }, [open, editing?.id])  // eslint-disable-line react-hooks/exhaustive-deps
  // istoricul stornarilor rezervarii (factura originala + factura de stornare, cu PDF)
  useEffect(() => {
    setStorno({ etapa: 'idle' }); setStornari([])
    if (!open || !editing?.id) return
    let anulat = false
    supabase.from('setari').select('valoare').eq('cheie', `stornari_factura_${editing.id}`).maybeSingle().then(({ data }) => {
      try { const v = JSON.parse(data?.valoare || '[]'); if (!anulat && Array.isArray(v)) setStornari(v) } catch {}
    })
    return () => { anulat = true }
  }, [open, editing?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // ultima factura RH + data emiterii propusa - si la rezervarile noi, nesalvate inca
  useEffect(() => {
    if (!open || !editing) return
    let anulat = false
    if (editing.canal === 'airbnb' && !editing.factura_numar) {
      setUltimaFact({ stare: 'incarc' })
      fetch('/api/factura-oblio', { cache: 'no-store' }).then(r => r.json().then(o => ({ ok: r.ok, o }))).then(({ ok, o }) => {
        if (anulat) return
        setUltimaFact(ok ? { stare: 'ok', data: o.ultima?.data, numar: o.ultima?.numar } : { stare: 'eroare', eroare: o.error || 'eroare' })
      }).catch(e => { if (!anulat) setUltimaFact({ stare: 'eroare', eroare: e instanceof Error ? e.message : 'eroare' }) })
    }
    // Data emiterii porneste de la ultima data aleasa (cerut direct: „la data emiterii să fie mereu ultima pe care am setat-o”)
    // - in setari, aceeasi pe orice dispozitiv; niciodata in viitor (ziua de azi e limita)
    if (editing.canal === 'airbnb' && !editing.factura_numar) supabase.from('setari').select('valoare').eq('cheie', CHEIE_DATA_EMITERE).maybeSingle().then(({ data }) => {
      const d = String(data?.valoare || '')
      if (!anulat && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= aziRo()) setDataEmitere(d)
    })
    return () => { anulat = true }
  }, [open, editing?.canal, !!editing?.factura_numar, ultimaCerere])  // eslint-disable-line react-hooks/exhaustive-deps

  // Salvare automata (cerut direct: „să se salveze automat modificările făcute - adăugăm cod de rezervare, se salvează,
  // adăugăm alt preț, se salvează”): la o rezervare EXISTENTA, fiecare modificare se scrie singura la ~0,9 s dupa ultima
  // tastare (rezervarea + suma de facturat). Rezervarile noi se creeaza in continuare cu „Salvează rezervarea”.
  const curat = (r: any) => { if (!r) return ''; const { apartament: _a, proprietar: _p, updated_at: _u, ...rest } = r; return JSON.stringify(rest) }
  const clientDeSalvat = () => JSON.stringify(clientFact) !== clientSalvat
  async function salveazaClient(): Promise<string | null> {
    if (!editing?.id || !clientDeSalvat()) return null
    const c = clientFact
    const { error } = await supabase.from('setari').upsert({ cheie: `client_factura_${editing.id}`, valoare: JSON.stringify(c) }, { onConflict: 'cheie' })
    if (!error) setClientSalvat(JSON.stringify(c))
    return error ? error.message : null
  }
  const arePending = () => !!editing?.id && !!original && (curat(editing) !== curat(original) || String(sumaFact) !== String(sumaFactSalvata) || clientDeSalvat())
  async function salveazaAuto(): Promise<boolean> {
    if (!editing?.id || autoInZbor.current || !arePending()) return true
    autoInZbor.current = true
    const instantaneu = editing, sumaAcum = sumaFact
    setAuto({ stare: 'salvez' })
    try {
      if (String(sumaAcum) !== String(sumaFactSalvata)) {
        const cheie = `suma_facturare_${instantaneu.id}`
        const { error } = sumaAcum === '' || !(Number(sumaAcum) > 0)
          ? await supabase.from('setari').delete().eq('cheie', cheie)
          : await supabase.from('setari').upsert({ cheie, valoare: String(sumaAcum) }, { onConflict: 'cheie' })
        if (error) { setAuto({ stare: 'eroare', mesaj: error.message }); return false }
        setSumaFactSalvata(sumaAcum)
      }
      const eCl = await salveazaClient()
      if (eCl) { setAuto({ stare: 'eroare', mesaj: eCl }); return false }
      if (curat(instantaneu) !== curat(original)) {
        const err = await salveazaRezervare(instantaneu, apartamente)
        if (err) { setAuto({ stare: 'eroare', mesaj: err }); return false }
        setOriginal(instantaneu)
      }
      autoSalvate.current = true
      setAuto({ stare: 'salvat', ora: new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) })
      return true
    } finally { autoInZbor.current = false }
  }
  useEffect(() => {
    if (!open || !editing?.id || !arePending()) return
    const t = setTimeout(() => { void salveazaAuto() }, 900)
    return () => clearTimeout(t)
  }, [open, editing, sumaFact, sumaFactSalvata, original, auto.stare, clientFact, clientSalvat])  // eslint-disable-line react-hooks/exhaustive-deps
  // inchiderea: ce n-a apucat sa se salveze se salveaza acum; lista se reincarca daca s-a salvat ceva
  async function inchide() {
    if (arePending()) await salveazaAuto()
    if (autoSalvate.current) { autoSalvate.current = false; onReload?.() }
    onClose()
  }

  // ultima factura RH necitita (ex. Oblio indisponibil) -> se reincearca singur la 20 s, cat timp fereastra e deschisa
  useEffect(() => {
    if (!open || ultimaFact.stare !== 'eroare') return
    const t = setTimeout(() => setUltimaCerere(x => x + 1), 20000)
    return () => clearTimeout(t)
  }, [open, ultimaFact])

  // salvarea: întâi suma de facturat (dacă rezervarea există), apoi rezervarea
  async function salveazaTot() {
    if (editing?.id && String(sumaFact) !== String(sumaFactSalvata)) {
      const cheie = `suma_facturare_${editing.id}`
      const { error } = sumaFact === '' || !(Number(sumaFact) > 0)
        ? await supabase.from('setari').delete().eq('cheie', cheie)
        : await supabase.from('setari').upsert({ cheie, valoare: String(sumaFact) }, { onConflict: 'cheie' })
      if (!error) setSumaFactSalvata(sumaFact)
    }
    await salveazaClient()
    onSave()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void inchide()
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); salveazaTot() }
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.repeat || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return
      const t = e.target as HTMLElement | null
      // textarea = rand nou; pe butoane / linkuri Enter le apasa pe ele; ferestrele peste formular (confirmare client) au tastele lor
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'A' || t.isContentEditable)) return
      if (document.querySelector('.rz-panel ~ *:not(style)')) return
      e.preventDefault()
      if (tasta.current.confirm) { if (enterTimer.current) clearTimeout(enterTimer.current); enterTimer.current = null; tasta.current.confirm(); return }
      if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; tasta.current.dublu?.(); return }
      enterTimer.current = setTimeout(() => { enterTimer.current = null; tasta.current.enter?.() }, 350)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null } }
  }, [open, onClose, onSave, sumaFact, sumaFactSalvata, editing, original])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !editing) return null

  const set = (patch: Record<string, any>) => setEditing((prev: any) => ({ ...prev, ...patch }))
  // avansul potriveste singur statusul platii si pune data de azi la primul avans (ambele se pot schimba de mana)
  const setAvans = (v: number | '') => setEditing((prev: any) => {
    const av = Number(v) || 0, totalRez = Number(prev.valoare_bruta) || 0, st = prev.status_plata
    // „Achitat” pus de avans (avansul acoperea totalul) se retrage odata cu avansul; „Achitat” pus de mana ramane
    const achitatDinAvans = st === 'achitat' && totalRez > 0 && (Number(prev.avans) || 0) >= totalRez
    const status = av > 0 && totalRez > 0 && av >= totalRez ? 'achitat'
      : av > 0 ? (st === 'achitat' && !achitatDinAvans ? 'achitat' : 'avans')
      : st === 'avans' || achitatDinAvans ? 'neplatit' : st
    return { ...prev, avans: v, avans_data: av > 0 ? (prev.avans_data || aziRo()) : null, ...(av > 0 ? {} : { avans_metoda: null }), status_plata: status }
  })
  const apt = apartamente.find(a => a.id === editing.apartament_id)
  const nopti = editing.data_checkin && editing.data_checkout
    ? Math.max(0, Math.round((new Date(editing.data_checkout).getTime() - new Date(editing.data_checkin).getTime()) / 86400000))
    : 0
  const moneda = editing.moneda || 'RON'
  const cod = COD_CANAL[editing.canal] || { label: 'Cod rezervare platformă', ph: 'nr. rezervării de la platformă' }
  const procentAdmin = Number((apt as any)?.comision_procent || 20)
  const pePerNoapte = nopti > 0 ? (Number(editing.valoare_bruta) || 0) / nopti : 0
  const noptiIntre = (ci: string, co: string) => ci && co ? Math.max(0, Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000)) : 0
  const total = (pret: number, n: number) => Math.round(pret * n * 100) / 100
  // Schimbarea datelor: daca pretul pe noapte a fost scris de mana, totalul se actualizeaza cu noile nopti
  const setDate = (patch: { data_checkin?: string; data_checkout?: string }) => {
    set(patch)
    if (pretNoapte !== null && Number(pretNoapte) > 0) {
      const n = noptiIntre(patch.data_checkin ?? editing.data_checkin, patch.data_checkout ?? editing.data_checkout)
      recalcComisionPlatforma(total(Number(pretNoapte), n), editing.comision_platforma_procent)
    }
  }
  const pretAfisat = pretNoapte !== null ? pretNoapte : (pePerNoapte > 0 ? Math.round(pePerNoapte * 100) / 100 : '')

  // Factura (Oblio, prin ContaFlow): doar Airbnb, rezervare salvata, cu cod si suma, fara modificari nesalvate
  const campuriFactura = ['cod_rezervare_platforma', 'valoare_bruta', 'nume_client', 'data_checkin', 'data_checkout', 'canal', 'apartament_id', 'nr_persoane', 'telefon_client']
  const nesalvat = (!!original && campuriFactura.some(k => String(original[k] ?? '') !== String(editing[k] ?? ''))) || String(sumaFact) !== String(sumaFactSalvata)
  const deFacturat = Number(sumaFact) > 0 ? Number(sumaFact) : Number(editing.valoare_bruta) || 0
  const eRo = !altaTara && eRomania(clientFact.tara)
  const sugestiiLoc = eRo ? (clientFact.judet ? localitatiJudet(clientFact.judet) : []) : oraseTara(clientFact.tara)
  const MOTIV_NESALVAT = 'Salvează întâi modificările — factura se emite din datele salvate'
  const motivFaraFactura =
    !editing.id && validareRezervare(editing) ? validareRezervare(editing) :
    editing.canal !== 'airbnb' ? 'Facturarea automată e doar pentru rezervările Airbnb' :
    !String(editing.cod_rezervare_platforma || '').trim() ? 'Completează codul rezervării Airbnb' :
    !(deFacturat > 0) ? 'Completează valoarea brută sau suma de facturat' :
    editing.status_rezervare === 'anulata' ? 'Rezervarea e anulată' :
    clientFact.pj && !String(clientFact.cui || '').trim() ? 'Scrie CUI-ul firmei' :
    clientFact.pj && !String(clientFact.firma || '').trim() ? 'Caută firma după CUI (sau scrie denumirea)' :
    altaTara && !clientFact.tara.trim() ? 'Scrie țara clientului' :
    eRo && !clientFact.judet ? 'Alege județul de domiciliu al clientului' :
    !clientFact.localitate.trim() ? 'Completează localitatea de domiciliu a clientului' :
    !dataEmitere ? 'Alege data emiterii' : dataEmitere > aziRo() ? 'Data emiterii nu poate fi în viitor' :
    ultimaFact.stare === 'incarc' ? 'Se verifică ultima factură RH…' :
    // (cerut direct: „să putem genera factura și, imediat ce avem din nou tokenul, să primim informația actualizată”) - lista
    // necitita nu mai blocheaza: ContaFlow verifica oricum data fata de ultima factura RH chiar inainte de emitere
    ultimaFact.data && dataEmitere < ultimaFact.data ? `Interzis: data e înaintea ultimei facturi RH (${ultimaFact.data.split('-').reverse().join('.')}) — alege această dată sau una ulterioară` :
    // la final: asa Enter dublu stie ca singura piedica e salvarea (o face el, apoi emite)
    editing.id && nesalvat ? MOTIV_NESALVAT : null
  const alegeDataEmitere = (d: string) => {
    setDataEmitere(d)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d <= aziRo()) void supabase.from('setari').upsert({ cheie: CHEIE_DATA_EMITERE, valoare: d }, { onConflict: 'cheie' }).then(() => {})   // builderul Supabase porneste cererea doar la then
  }
  const setClient = (p: Partial<ClientFactura>) => setClientFact(c => ({ ...c, ...p }))
  async function cautaFirma() {
    setFirmaStare({ incarc: true })
    try {
      const res = await fetch('/api/firma?cui=' + encodeURIComponent(String(clientFact.cui || '')), { cache: 'no-store' })
      const o = await res.json()
      if (!res.ok) { setFirmaStare({ eroare: o.error || 'Căutarea a eșuat' }); return }
      setAltaTara(false)
      setClient({ cui: o.cui, firma: o.firma, regCom: o.regCom, platitorTva: o.platitorTva, tara: 'Romania', judet: o.judet, localitate: o.localitate, adresa: o.adresa })
      setFirmaStare({ avert: o.radiata ? 'Atenție: firma apare RADIATĂ la ANAF' : o.inactiva ? 'Atenție: firma apare INACTIVĂ la ANAF' : undefined })
    } catch (e) { setFirmaStare({ eroare: e instanceof Error ? e.message : 'Căutarea a eșuat' }) }
  }
  const zz = (d: string) => d ? d.split('-').reverse().join('.') : ''

  async function emiteFactura() {
    setFactura({ etapa: 'trimit' })
    try {
      // rezervare noua (cerut direct: „de ce nu pot salva?” - butonul cerea intai salvarea): se creeaza acum, apoi se factureaza
      let rezervareId = editing.id
      if (!rezervareId) {
        const { data: nou, error } = await supabase.from('rezervari').insert(payloadRezervare(editing, apartamente)).select('id').single()
        if (error || !nou) { setFactura({ etapa: 'idle', eroare: 'Rezervarea nu s-a putut salva: ' + (error?.message || 'eroare') }); return }
        rezervareId = nou.id; idCreat.current = nou.id
        if (Number(sumaFact) > 0) await supabase.from('setari').upsert({ cheie: `suma_facturare_${nou.id}`, valoare: String(sumaFact) }, { onConflict: 'cheie' })
        await supabase.from('setari').upsert({ cheie: `client_factura_${nou.id}`, valoare: JSON.stringify(clientFact) }, { onConflict: 'cheie' })
        const cuId = { ...editing, id: nou.id }
        setEditing(cuId); setOriginal(cuId); setSumaFactSalvata(sumaFact); setClientSalvat(JSON.stringify(clientFact))
        autoSalvate.current = true
      }
      const res = await fetch('/api/factura-oblio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rezervareId, dataEmitere, client: clientFact }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || !out.numar) {
        // refuz pentru data: ContaFlow intoarce si ultima factura RH -> caseta se actualizeaza pe loc
        if (out.ultima?.data) setUltimaFact({ stare: 'ok', data: out.ultima.data, numar: out.ultima.numar })
        setFactura({ etapa: 'idle', eroare: out.error || `Eroare ${res.status}` }); return
      }
      // si data emiterii (inainte lipsea din patch -> salvarea automata o rescria cu gol)
      const patch = { factura_serie: out.serie, factura_numar: out.numar, factura_link: out.link, status_facturare: 'facturata', factura_emisa_la: new Date().toISOString() }
      set(patch)
      setOriginal((o: any) => ({ ...o, ...patch }))
      setUltimaCerere(x => x + 1)
      alegeDataEmitere(dataEmitere)   // data folosita ramane cea propusa data viitoare
      setFactura({ etapa: 'idle', info: out.avertisment || (out.dejaEmisa ? 'Factura era deja emisă' : 'Factura a fost emisă și trimisă în SPV') })
      onReload?.()
    } catch (e) {
      setFactura({ etapa: 'idle', eroare: e instanceof Error ? e.message : 'Emiterea a eșuat' })
    }
  }

  async function stornezaFactura() {
    if (!editing.id || !editing.factura_numar) return
    setStorno({ etapa: 'trimit' })
    try {
      const res = await fetch('/api/factura-oblio/storno', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rezervareId: editing.id }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || !out.storno?.numar) { setStorno({ etapa: 'idle', eroare: out.error || `Eroare ${res.status}` }); return }
      // rezervarea revine la „Nefacturat” si in fereastra (si in „original”, ca salvarea automata sa nu rescrie factura veche)
      const patch = { factura_serie: null, factura_numar: null, factura_link: null, factura_emisa_la: null, status_facturare: 'nefacturat' }
      set(patch)
      setOriginal((o: any) => ({ ...o, ...patch }))
      if (Array.isArray(out.stornari)) setStornari(out.stornari)
      setStorno({ etapa: 'idle', link: out.storno.link, info: out.avertisment || `Factura ${out.original.serie} ${out.original.numar} a fost stornată prin ${out.storno.serie} ${out.storno.numar} (trimisă în SPV). Poți emite o factură nouă.` })
      setUltimaCerere(x => x + 1)
      onReload?.()
    } catch (e) {
      setStorno({ etapa: 'idle', eroare: e instanceof Error ? e.message : 'Stornarea a eșuat' })
    }
  }

  // ce fac Enter / Enter dublu cu starea de acum (efectul de taste citeste mereu valorile curente de aici)
  tasta.current = {
    enter: () => { if (!saving && factura.etapa !== 'trimit') void salveazaTot() },
    dublu: () => {
      if (factura.etapa === 'trimit') return
      if (editing.factura_numar) { setFactura({ etapa: 'idle', info: `Factura ${editing.factura_serie || ''} ${editing.factura_numar} e deja emisă` }); return }
      // singura piedica = modificari inca nesalvate automat: se salveaza acum, apoi se emite
      if (motivFaraFactura === MOTIV_NESALVAT && !autoInZbor.current) { void salveazaAuto().then(ok => { if (ok) void emiteFactura() }); return }
      if (motivFaraFactura) { setFactura({ etapa: 'idle', eroare: `Enter dublu: factura nu se poate emite — ${motivFaraFactura}` }); return }
      void emiteFactura()
    },
    confirm: factura.etapa === 'confirm' && !motivFaraFactura ? () => void emiteFactura() : undefined,
  }

  return (
    <div className="rz" onClick={e => { if (e.target === e.currentTarget) void inchide() }}>
      <style>{CSS}</style>
      <div className="rz-panel">
        {/* ── Antet ── */}
        <header className="rz-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="rz-lbl" style={{ marginBottom: 2 }}>{editing.id ? 'Editează rezervare' : 'Rezervare nouă'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {editing.nume_client || 'Client nou'}
              </h2>
              <span className="rz-pill" style={{ ...pill({ c: platforma(editing.canal).t, bg: `${platforma(editing.canal).c}26`, b: `${platforma(editing.canal).c}80` }), display: 'inline-flex', alignItems: 'center', gap: 5 }}><InsignaPlatforma k={editing.canal} size={15} />{CANALE_LABEL[editing.canal] || editing.canal}</span>
              {editing.cod_rezervare_platforma && <span className="rz-pill rz-mono" style={pill(TONE.amber)}># {editing.cod_rezervare_platforma}</span>}
            </div>
            <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>
              {apt ? `${(apt as any).nota ? (apt as any).nota + ' · ' : ''}${apt.nume}` : 'Fără apartament'}
              <span style={{ color: C.faint }}> · </span>{fmtZi(editing.data_checkin)} → {fmtZi(editing.data_checkout)}
              <span style={{ color: C.faint }}> · </span>{nopti} {nopti === 1 ? 'noapte' : 'nopți'}
              <span style={{ color: C.faint }}> · </span>{Number(editing.nr_persoane) || 1} pers.
            </div>
          </div>
          <button type="button" onClick={() => void inchide()} aria-label="Închide" className="rz-x"><X size={16} /></button>
        </header>

        <div className="rz-body">
          {/* ── Stanga: ce se completeaza ── */}
          <div className="rz-main">
            <Group title="Rezervare" first>
              <div className="rz-grid">
                <div>
                  <Label>Apartament *</Label>
                  <select value={editing.apartament_id || ''} onChange={e => onAptChange(e.target.value)}>
                    <option value="">— Selectează —</option>
                    {apartamente.map(a => <option key={a.id} value={a.id}>{(a as any).nota ? `${(a as any).nota} · ${a.nume}` : a.nume}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Canal</Label>
                  <div className="rz-canale" role="radiogroup" aria-label="Canal">
                    {/* Canale din afara listei (ex. „intern” din calendar) raman selectate, ca buton separat */}
                    {[...(editing.canal && !CANALE_LABEL[editing.canal] ? [[editing.canal, editing.canal.charAt(0).toUpperCase() + editing.canal.slice(1)]] : []), ...Object.entries(CANALE_LABEL)].map(([k, v]) => {
                      const p = platforma(k), ales = editing.canal === k
                      return (
                        <button key={k} type="button" role="radio" aria-checked={ales} data-canal={k} className="rz-canal" onClick={() => setEditing((prev: any) => cuCanal(prev, k))}
                          style={ales ? { borderColor: p.c, background: `${p.c}24`, color: p.t, boxShadow: `0 0 0 1px ${p.c} inset` } : undefined}>
                          <InsignaPlatforma k={k} /><span>{v}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="rz-grid rz-dates" style={{ marginTop: 12 }}>
                <div><Label>Check-in *</Label><input type="date" value={editing.data_checkin} onChange={e => setDate({ data_checkin: e.target.value })} /></div>
                <div className="rz-nights" title="Nopți"><Moon size={12} />{nopti}</div>
                <div><Label>Check-out *</Label><input type="date" value={editing.data_checkout} onChange={e => setDate({ data_checkout: e.target.value })} /></div>
                <div>
                  <Label>Persoane</Label>
                  <div className="rz-step">
                    <button type="button" onClick={() => set({ nr_persoane: Math.max(1, (Number(editing.nr_persoane) || 1) - 1) })} aria-label="Mai puține"><Minus size={13} /></button>
                    <input type="number" min={1} value={numVal(editing.nr_persoane, 1)} onChange={e => set({ nr_persoane: numInput(e.target.value, 1) })} />
                    <button type="button" onClick={() => set({ nr_persoane: (Number(editing.nr_persoane) || 0) + 1 })} aria-label="Mai multe"><Plus size={13} /></button>
                  </div>
                </div>
              </div>
              {!editing.id && <div style={{ marginTop: 10 }}><AvertismentNealocate checkin={editing.data_checkin} checkout={editing.data_checkout} compact/></div>}
            </Group>

            <Group title="Oaspete">
              <div className="rz-grid rz-2">
                <div><Label>Nume client *</Label><input value={editing.nume_client || ''} onChange={e => set({ nume_client: e.target.value })} placeholder="Prenume Nume" /></div>
                <div><Label>Telefon</Label><input type="tel" value={editing.telefon_client || ''} onChange={e => set({ telefon_client: e.target.value })} placeholder="+40 7xx xxx xxx" /></div>
                <div><Label>Email</Label><input type="email" value={editing.email_client || ''} onChange={e => set({ email_client: e.target.value })} placeholder="email@..." /></div>
                <div>
                  <Label right={!editing.cod_rezervare_platforma && editing.canal === 'airbnb' ? <span style={{ fontSize: 11, color: C.amber }}>necesar pe factură</span> : undefined}>{cod.label}</Label>
                  <div style={{ position: 'relative' }}>
                    <Hash size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.amber, pointerEvents: 'none' }} />
                    <input value={editing.cod_rezervare_platforma || ''} placeholder={cod.ph} className="rz-mono"
                      onChange={e => set({ cod_rezervare_platforma: e.target.value.toUpperCase().replace(/\s+/g, '') })}
                      style={{ paddingLeft: 30, letterSpacing: '.05em', ...(editing.canal === 'airbnb' && !editing.cod_rezervare_platforma ? { borderColor: 'rgba(245,158,11,0.45)' } : {}) }} />
                  </div>
                </div>
              </div>
            </Group>

            <Group title="Observații">
              <textarea value={editing.observatii || ''} onChange={e => set({ observatii: e.target.value })} rows={2} placeholder="Notițe interne..." style={{ resize: 'vertical' }} />
            </Group>

            {extra && <Group title="Mesaje și acțiuni">{extra(editing)}</Group>}
          </div>

          {/* ── Dreapta: bani, decont, statusuri, factura ── */}
          <aside className="rz-aside">
            <Group title="Încasări" first>
              <Label right={
                <select data-moneda-rez value={moneda} onChange={e => {
                  const la = e.target.value
                  if (la !== moneda && CAMPURI_BANI.some(f => Number(editing[f]) > 0)) setSchimbMoneda({ de: moneda, la }); else setSchimbMoneda(null)
                  set({ moneda: la })
                }} className="rz-mini" title="Moneda rezervării — toate sumele de aici sunt în moneda aceasta">
                  {Array.from(new Set([...MONEDE_REZ, moneda])).map(m => <option key={m}>{m}</option>)}
                </select>
              }>Preț pe noapte × {nopti} {nopti === 1 ? 'noapte' : 'nopți'}</Label>
              <div className="rz-calc">
                <Money value={pretAfisat} suffix={`${moneda}/n`} onChange={v => {
                  setPretNoapte(v)
                  recalcComisionPlatforma(v === '' ? '' : total(Number(v), nopti), editing.comision_platforma_procent)
                }} />
                <span className="rz-eq">=</span>
                <div>
                  <Money big value={editing.valoare_bruta} suffix={moneda} onChange={v => { setPretNoapte(null); recalcComisionPlatforma(v, editing.comision_platforma_procent) }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: C.faint, marginTop: 4 }}>
                <span>preț / noapte</span><span>total rezervare (valoare brută)</span>
              </div>
              {moneda !== 'RON' && Number(editing.valoare_bruta) > 0 && cursuri[moneda] > 0 && (
                <div data-echiv-lei style={{ fontSize: 11.5, marginTop: 6, color: '#9FD7FF' }}>
                  ≈ {fmt(Math.round(Number(editing.valoare_bruta) * cursuri[moneda] * 100) / 100)} RON la cursul BNR de azi ({cursuri[moneda].toLocaleString('ro-RO', { maximumFractionDigits: 4 })}) · în rapoarte se trece în lei la cursul din ziua check-in-ului
                </div>
              )}
              {schimbMoneda && schimbMoneda.la === moneda && (() => {
                const k = (cursuri[schimbMoneda.de] || 0) / (cursuri[schimbMoneda.la] || 0)
                const conv = (v: any) => Math.round(Number(v) * k * 100) / 100
                return (
                  <div data-schimb-moneda style={{ marginTop: 8, padding: '8px 10px', borderRadius: 9, background: 'rgba(77,163,255,0.08)', border: '1px solid rgba(77,163,255,0.3)', fontSize: 12, color: '#D6E4F4', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span>Ai schimbat moneda din {schimbMoneda.de} în {schimbMoneda.la}. Sumele rămân cum sunt scrise{k > 0 && isFinite(k) ? <> — sau le transformi la cursul BNR ({fmt(Number(editing.valoare_bruta) || 0)} {schimbMoneda.de} → <b>{fmt(conv(editing.valoare_bruta))} {schimbMoneda.la}</b>)</> : ''}?</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {k > 0 && isFinite(k) && <button type="button" data-transforma className="rz-btn" style={{ fontSize: 12, padding: '5px 10px', borderColor: 'rgba(77,163,255,0.45)', color: '#7BC8FF' }}
                        onClick={() => { setPretNoapte(null); setEditing((prev: any) => { const o = { ...prev }; for (const f of CAMPURI_BANI) if (Number(o[f]) > 0) o[f] = conv(o[f]); return o }); setSchimbMoneda(null) }}>↻ Transformă sumele</button>}
                      <button type="button" className="rz-btn" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setSchimbMoneda(null)}>Lasă-le așa</button>
                    </div>
                  </div>
                )
              })()}
              {!(Number(editing.valoare_bruta) > 0) && Number(editing.suma_incasata) > 0 && (
                <button type="button" className="rz-btn" style={{ marginTop: 8, fontSize: 12, padding: '6px 10px' }}
                  onClick={() => { setPretNoapte(null); recalcComisionPlatforma(Number(editing.suma_incasata), editing.comision_platforma_procent) }}>
                  Folosește încasatul ({fmt(Number(editing.suma_incasata))} {moneda}) ca total
                </button>
              )}
              <div className="rz-grid rz-2" style={{ marginTop: 12 }}>
                <div data-suma-facturare>
                  <Label>Sumă de facturat</Label>
                  <Money value={sumaFact} suffix={moneda} onChange={v => setSumaFact(v)} />
                  <div style={{ fontSize: 11, marginTop: 4, color: Number(sumaFact) > 0 && Number(sumaFact) !== Number(editing.valoare_bruta) ? C.amber : C.faint }}>
                    {moneda !== 'RON' && <div data-factura-lei style={{ color: '#9FD7FF', marginBottom: 2 }}>Factura se emite în lei, la cursul BNR din data emiterii</div>}
                    {!(Number(sumaFact) > 0) ? `gol = se facturează totalul (${fmt(Number(editing.valoare_bruta) || 0)} ${moneda})`
                      : Number(sumaFact) !== Number(editing.valoare_bruta) ? `diferă de total (${fmt(Number(editing.valoare_bruta) || 0)} ${moneda}) cu ${fmt(Math.round((Number(sumaFact) - (Number(editing.valoare_bruta) || 0)) * 100) / 100)}` : 'egală cu totalul rezervării'}
                  </div>
                </div>
                <div><Label>Taxă curățenie</Label><Money value={editing.taxa_curatenie_incasata} suffix={moneda} onChange={v => set({ taxa_curatenie_incasata: v })} /></div>
              </div>
              {/* Avans (cerut direct: „la rezervări să avem și o secțiune unde se trece avansul”): suma, data, cum s-a plătit,
                  restul de plată; statusul „Plată” se potrivește singur (Neplatit → Avans → Achitat) */}
              <div data-avans style={{ marginTop: 12, padding: 12, borderRadius: 12, border: `1px solid ${Number(editing.avans) > 0 ? 'rgba(245,180,60,0.35)' : 'rgba(255,255,255,0.08)'}`, background: Number(editing.avans) > 0 ? 'rgba(245,180,60,0.06)' : 'transparent' }}>
                <div className="rz-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
                  <div data-avans-suma><Label>Avans încasat</Label><Money value={editing.avans ?? ''} suffix={moneda} onChange={v => setAvans(v)} /></div>
                  <div><Label>Data avansului</Label><input data-avans-data type="date" value={editing.avans_data || ''} max={aziRo()} onChange={e => set({ avans_data: e.target.value || null })} /></div>
                  <div><Label>Plătit prin</Label>
                    <select data-avans-metoda value={editing.avans_metoda || ''} onChange={e => set({ avans_metoda: e.target.value || null })}>
                      <option value="">—</option>{METODE_AVANS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                {/* Avans de încasat (cerut direct: „cum avem Avans încasat, să avem și avans de încasat, până la data x”):
                    cât trebuie să trimită clientul și până când; după termen intră în reamintirea de la 16:00 */}
                <div className="rz-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', marginTop: 10 }}>
                  <div data-avans-cerut><Label>Avans de încasat</Label><Money value={editing.avans_cerut ?? ''} suffix={moneda} onChange={v => set({ avans_cerut: v, ...(Number(v) > 0 ? {} : { avans_termen: null }) })} /></div>
                  <div><Label>Până la data</Label><input data-avans-termen type="date" value={editing.avans_termen || ''} onChange={e => set({ avans_termen: e.target.value || null })} /></div>
                </div>
                {Number(editing.avans_cerut) > 0 && (() => {
                  const lipsa = Math.round((Number(editing.avans_cerut) - (Number(editing.avans) || 0)) * 100) / 100
                  const termen = editing.avans_termen as string | null, azi = aziRo()
                  const depasit = !!termen && termen < azi, astazi = termen === azi
                  return <div data-avans-cerut-stare data-depasit={depasit ? '1' : undefined} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: 12.5 }}>
                    <span style={{ color: C.faint }}>{lipsa > 0 ? 'Avans de primit' : 'Avans cerut'}</span>
                    <b style={{ color: lipsa <= 0 ? C.green : depasit ? C.red : C.amber, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                      {lipsa <= 0 ? '✓ primit' : `${fmt(lipsa)} ${moneda}${termen ? (depasit ? ` · termen depășit (${fmtZi(termen)})` : astazi ? ' · termen azi' : ` până la ${fmtZi(termen)}`) : ' · fără termen'}`}
                    </b>
                  </div>
                })()}
                {Number(editing.avans) > 0 && (() => {
                  const totalRez = Number(editing.valoare_bruta) || 0, rest = Math.round((totalRez - Number(editing.avans)) * 100) / 100
                  return <div data-rest-plata style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: 12.5 }}>
                    <span style={{ color: C.faint }}>Rest de plată la sosire</span>
                    <b style={{ color: rest > 0 ? C.amber : C.green, fontVariantNumeric: 'tabular-nums' }}>{rest > 0 ? `${fmt(rest)} ${moneda}` : rest < 0 ? `avansul depășește totalul cu ${fmt(-rest)} ${moneda}` : 'achitat integral'}</b>
                  </div>
                })()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <Fold title="Încasat efectiv" open={showIncasat} onToggle={() => setShowIncasat(x => !x)}
                  value={<span style={{ color: Number(editing.suma_incasata) > 0 ? C.text : C.faint }}>{Number(editing.suma_incasata) > 0 ? `${fmt(Number(editing.suma_incasata))} ${moneda}` : '0 · editează'}</span>}>
                  <Money value={editing.suma_incasata} suffix={moneda} onChange={v => set({ suma_incasata: v })} />
                </Fold>
                <Fold title="Comision platformă" open={showComision} onToggle={() => setShowComision(s => !s)}
                  value={comision > 0 ? <span style={{ color: C.red }}>−{fmt(comision)} RON</span> : <span style={{ color: C.faint }}>0 · editează</span>}>
                  <div className="rz-grid" style={{ gridTemplateColumns: '0.8fr 1fr 1fr' }}>
                    <div>
                      <Label>Procent</Label>
                      <div style={{ position: 'relative' }}>
                        <input type="number" inputMode="decimal" min={0} max={100} step={0.5} value={numVal(editing.comision_platforma_procent, 0)}
                          onChange={e => recalcComisionPlatforma(editing.valoare_bruta, numInput(e.target.value, 0))} style={{ paddingRight: 26 }} />
                        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: C.faint }}>%</span>
                      </div>
                    </div>
                    <div><Label>Valoare</Label><Money value={editing.comision_platforma_valoare} suffix={moneda} onChange={v => set({ comision_platforma_valoare: v })} /></div>
                    <div><Label>TVA / taxă</Label><Money value={editing.tva_comision_platforma} suffix={moneda} onChange={v => set({ tva_comision_platforma: v })} /></div>
                  </div>
                </Fold>
                <Fold title="Costuri operaționale" open={showCosturi} onToggle={() => setShowCosturi(s => !s)}
                  value={totalCosturi > 0 ? <span style={{ color: C.red }}>−{fmt(totalCosturi)} RON</span> : <span style={{ color: C.faint }}>0 · editează</span>}>
                  <div className="rz-grid rz-2">
                    {COSTURI.map(([k, l]) => (
                      <div key={k}><Label>{l}</Label><Money value={editing[k]} suffix={moneda} onChange={v => set({ [k]: v })} /></div>
                    ))}
                  </div>
                </Fold>
              </div>
            </Group>

            {editing.apartament_id && calcul && (
              <Group title="Decont proprietar">
                <div className="rz-rows">
                  <div><span>Bază calcul</span><b>{fmt(calcul.baza)} {moneda}</b></div>
                  <div><span>Comision administrator {procentAdmin}%</span><b style={{ color: C.red }}>−{fmt(calcul.comision)} {moneda}</b></div>
                </div>
                <div className="rz-total" data-decont-virat>
                  <span>De virat proprietarului</span>
                  <b>{fmt(calcul.suma_proprietar)} {moneda}</b>
                </div>
                {/* rezervare in valuta: decontul e in moneda ei; in Deconturi / Proprietari se trece in lei (curs BNR din ziua check-in-ului) */}
                {moneda !== 'RON' && cursuri[moneda] > 0 && (
                  <div data-decont-lei style={{ fontSize: 11.5, color: '#9FD7FF', marginTop: 6 }}>
                    ≈ {fmt(Math.round(calcul.suma_proprietar * cursuri[moneda] * 100) / 100)} RON de virat la cursul BNR de azi · în Deconturi se trece în lei la cursul din ziua check-in-ului
                  </div>
                )}
                <label className="rz-check">
                  <input type="checkbox" checked={!!editing.platit_proprietar}
                    onChange={e => set({ platit_proprietar: e.target.checked, suma_platita_proprietar: editing.suma_platita_proprietar ?? calcul.suma_proprietar })} />
                  Plătit către proprietar
                </label>
                {editing.platit_proprietar && (
                  <div style={{ marginTop: 8 }}><Label>Sumă plătită</Label><Money value={editing.suma_platita_proprietar} suffix={moneda} onChange={v => set({ suma_platita_proprietar: v })} /></div>
                )}
              </Group>
            )}

            <Group title="Statusuri">
              <div className="rz-status">
                <span>Rezervare</span><Segmented value={editing.status_rezervare} options={STATUS_REZERVARE_LABEL} tones={TON_REZ} onChange={v => set({ status_rezervare: v })} />
                <span>Plată</span><Segmented value={editing.status_plata} options={STATUS_PLATA_LABEL} tones={TON_PLATA} onChange={v => set({ status_plata: v })} />
                <span>Decont</span><Segmented value={editing.status_decont} options={STATUS_DECONT_LABEL} tones={TON_DECONT} onChange={v => set({ status_decont: v })} />
                <span>Facturare</span><Segmented value={editing.status_facturare || 'nefacturat'} options={STATUS_FACTURARE_LABEL} tones={TON_FACT} onChange={v => set({ status_facturare: v })} />
              </div>
            </Group>

            <div data-sectiune-factura style={{ scrollMarginTop: 8 }} />
            <Group title="Factură">
              {editing.factura_numar ? (
                <div className="rz-invoice">
                  <FileText size={16} style={{ color: C.green, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: C.text }}>{editing.factura_serie} {editing.factura_numar}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>AB Textile · emisă în Oblio, trimisă în SPV</div>
                  </div>
                  {editing.factura_link && (
                    <a href={editing.factura_link} target="_blank" rel="noopener noreferrer" className="rz-btn" style={{ marginLeft: 'auto' }}>
                      PDF <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ) : null}
              {/* Stornare factura emisa */}
              {editing.factura_numar && editing.id && (storno.etapa === 'confirm' ? (
                <div data-storno-confirm style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.red}66`, background: 'rgba(239,68,68,0.06)', fontSize: 12.5, lineHeight: 1.5, color: C.text2 }}>
                  Stornezi factura <b style={{ color: C.text }}>{editing.factura_serie} {editing.factura_numar}</b>? Se emite în Oblio o factură <b>RH cu minus</b> (storno total, același client), cu data de azi.
                  <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>Se trimite automat în SPV — nu se poate retrage din aplicație. Rezervarea revine la „Nefacturat” și poți emite o factură nouă.</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" className="rz-btn" onClick={() => setStorno({ etapa: 'idle' })}>Renunță</button>
                    <button type="button" data-storno-da className="rz-btn" style={{ background: C.red, borderColor: C.red, color: '#fff', fontWeight: 700 }} onClick={stornezaFactura}>Da, stornează factura</button>
                  </div>
                </div>
              ) : (
                <button type="button" data-storno className="rz-btn" disabled={storno.etapa === 'trimit'} onClick={() => setStorno({ etapa: 'confirm' })}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 8, color: C.red, borderColor: `${C.red}55` }}>
                  {storno.etapa === 'trimit' ? <><Loader2 size={14} className="rz-spin" /> Se stornează…</> : '↩ Stornează factura'}
                </button>
              ))}
              {storno.eroare && <div className="rz-msg rz-msg-err"><AlertTriangle size={13} /> {storno.eroare}</div>}
              {storno.info && <div className="rz-msg" data-storno-info>{storno.info}{storno.link && <> · <a href={storno.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>PDF storno</a></>}</div>}
              {stornari.length > 0 && (
                <div data-istoric-stornari style={{ fontSize: 11.5, color: C.muted, margin: '8px 0', lineHeight: 1.6 }}>
                  {stornari.map((x: any, i: number) => (
                    <div key={i}>↩ {x.original?.link ? <a href={x.original.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{x.original?.serie} {x.original?.numar}</a> : `${x.original?.serie} ${x.original?.numar}`} stornată prin {x.storno?.link ? <a href={x.storno.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{x.storno?.serie} {x.storno?.numar}</a> : `${x.storno?.serie} ${x.storno?.numar}`}{x.storno?.data ? ` · ${zz(x.storno.data)}` : ''}</div>
                  ))}
                </div>
              )}
              {!editing.factura_numar && (<>
                {editing.canal === 'airbnb' && (
                  <div data-client-factura style={{ marginBottom: 10 }}>
                    <div data-ultima-factura style={{ fontSize: 12, marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${ultimaFact.stare === 'eroare' ? C.amber : C.line}`, color: ultimaFact.stare === 'eroare' ? C.amber : C.muted, lineHeight: 1.45 }}>
                      {ultimaFact.stare === 'incarc' ? 'Se verifică ultima factură din seria RH…'
                        : ultimaFact.stare === 'eroare' ? <>Ultima factură RH nu s-a putut citi acum ({ultimaFact.eroare}). Se reîncearcă automat; poți emite oricum — data e verificată la emitere. <button type="button" className="rz-sug" onClick={() => setUltimaCerere(x => x + 1)} style={{ marginLeft: 4 }}>Reîncearcă</button></>
                        : ultimaFact.data ? <>Ultima factură RH: <b style={{ color: C.text }}>{ultimaFact.numar}</b> din <b style={{ color: C.text }}>{zz(ultimaFact.data)}</b> · nu se poate factura cu o dată mai veche</>
                        : 'Nicio factură emisă încă în seria RH'}
                    </div>
                    <label className="rz-check" data-pj style={{ marginBottom: 10 }}>
                      <input type="checkbox" checked={!!clientFact.pj} onChange={e => { const pj = e.target.checked; setFirmaStare({}); setClient(pj ? { pj, tara: 'Romania' } : { pj }); if (pj) setAltaTara(false) }} />
                      Client persoană juridică (factură pe firmă)
                    </label>
                    {clientFact.pj && (
                      <div data-firma style={{ marginBottom: 12, padding: 10, borderRadius: 10, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                          <div style={{ flex: 1 }}><Label>CUI firmă</Label><input data-cui value={clientFact.cui || ''} placeholder="ex. RO24837298" onChange={e => setClient({ cui: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void cautaFirma() } }} /></div>
                          <button type="button" className="rz-btn" onClick={() => void cautaFirma()} disabled={firmaStare.incarc || !String(clientFact.cui || '').trim()} style={{ padding: '10px 14px' }}>
                            {firmaStare.incarc ? <><Loader2 size={13} className="rz-spin" /> Caut…</> : 'Caută la ANAF'}
                          </button>
                        </div>
                        <div><Label>Denumire firmă</Label><input data-denumire-firma value={clientFact.firma || ''} placeholder="se completează din ANAF" onChange={e => setClient({ firma: e.target.value })} /></div>
                        <div className="rz-grid rz-2">
                          <div><Label>Nr. Reg. Com.</Label><input value={clientFact.regCom || ''} onChange={e => setClient({ regCom: e.target.value })} /></div>
                          <div><Label>TVA</Label><select value={clientFact.platitorTva ? 'da' : 'nu'} onChange={e => setClient({ platitorTva: e.target.value === 'da' })}><option value="nu">neplătitoare de TVA</option><option value="da">plătitoare de TVA (RO)</option></select></div>
                        </div>
                        {firmaStare.eroare && <div style={{ fontSize: 11.5, color: C.red }}>{firmaStare.eroare}</div>}
                        {firmaStare.avert && <div style={{ fontSize: 11.5, color: C.amber }}>{firmaStare.avert}</div>}
                        <div style={{ fontSize: 11, color: C.faint }}>Adresa sediului se completează mai jos (județ, localitate, adresă). Sub denumire, pe factură, rămân oaspetele și codul rezervării.</div>
                      </div>
                    )}
                    <div className="rz-grid rz-2">
                      <div><Label>Țara clientului</Label>
                        <select data-tara value={altaTara ? '__alta__' : (TARI.find(t => t.localeCompare(clientFact.tara.trim(), 'ro', { sensitivity: 'base' }) === 0) || '__alta__')}
                          onChange={e => { const v = e.target.value
                            if (v === '__alta__') { setAltaTara(true); setClient({ tara: '', judet: '', localitate: '' }); return }
                            setAltaTara(false); setClient({ tara: v, ...(v !== clientFact.tara ? { judet: '', localitate: '' } : {}) }) }}>
                          {TARI.map(t => <option key={t} value={t}>{t}</option>)}
                          <option value="__alta__">Altă țară…</option>
                        </select>
                        {altaTara && <input data-tara-alta value={clientFact.tara} placeholder="scrie țara (ex. Noua Zeelandă)" onChange={e => setClient({ tara: e.target.value })} style={{ marginTop: 6 }} />}
                      </div>
                      <div><Label>{eRo ? 'Județ' : 'Regiune / stat'}</Label>
                        {eRo
                          ? <select value={clientFact.judet} onChange={e => { const j = e.target.value; setClient({ judet: j, ...(clientFact.localitate && !localitatiJudet(j).some(l => l.localeCompare(clientFact.localitate.trim(), 'ro', { sensitivity: 'base' }) === 0) && localitatiJudet(clientFact.judet).some(l => l.localeCompare(clientFact.localitate.trim(), 'ro', { sensitivity: 'base' }) === 0) ? { localitate: '' } : {}) }) }}><option value="">— alege —</option>{JUDETE.map(j => <option key={j} value={j}>{j}</option>)}</select>
                          : <input value={clientFact.judet} placeholder="opțional" onChange={e => setClient({ judet: e.target.value })} />}
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}><Label>{eRo ? 'Localitate' : 'Oraș'}</Label><input list="rz-localitati" value={clientFact.localitate} placeholder={eRo ? (clientFact.judet === 'Bucuresti' ? 'ex. Sector 3' : 'ex. Pașcani') : 'orașul de domiciliu'} onChange={e => setClient({ localitate: e.target.value })} />
                        <datalist id="rz-localitati">{sugestiiLoc.map(l => <option key={l} value={l} />)}</datalist>
                      </div>
                      {sugestiiLoc.length > 0 && (
                        <div data-sugestii-localitati style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: -6 }}>
                          <span style={{ fontSize: 11, color: C.faint }}>{eRo ? `Localități în ${clientFact.judet}:` : `Orașe în ${clientFact.tara}:`}</span>
                          {sugestiiLoc.map(l => {
                            const ales = clientFact.localitate.trim().localeCompare(l, 'ro', { sensitivity: 'base' }) === 0
                            return <button key={l} type="button" className="rz-sug" aria-pressed={ales} onClick={() => setClient({ localitate: l })}>{l}</button>
                          })}
                        </div>
                      )}
                      <div><Label>Data emiterii</Label><input type="date" value={dataEmitere} min={ultimaFact.data || undefined} max={aziRo()} onChange={e => alegeDataEmitere(e.target.value)} /></div>
                      <div><Label>Adresă (opțional)</Label><input value={clientFact.adresa} placeholder="stradă, număr — dacă o știi" onChange={e => setClient({ adresa: e.target.value })} /></div>
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.45 }}>Domiciliul real al oaspetelui (pe Airbnb: profilul oaspetelui → „Locuiește în …”). Apare pe factură și ajunge în SPV.</div>
                  </div>
                )}
              {factura.etapa === 'confirm' ? (
                <div className="rz-confirm">
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                    Emiți factura <b>RH</b> pe <b>AB Textile</b> pentru <b>{clientFact.pj && clientFact.firma ? `${clientFact.firma} (CUI ${clientFact.cui})` : editing.nume_client}</b> ({[clientFact.localitate, clientFact.judet, eRo ? '' : clientFact.tara].filter(Boolean).join(', ')}), <b>{fmt(deFacturat)} RON</b>, rezervare Airbnb <b className="rz-mono">{editing.cod_rezervare_platforma}</b>, cu data <b>{zz(dataEmitere)}</b>?
                    <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>Se trimite automat în SPV — nu se poate retrage din aplicație.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" className="rz-btn" onClick={() => setFactura({ etapa: 'idle' })}>Renunță</button>
                    <button type="button" className="rz-btn rz-btn-go" onClick={emiteFactura}>Da, emite factura</button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" className="rz-btn rz-btn-go" style={{ width: '100%', justifyContent: 'center', padding: '10px 12px' }}
                    disabled={!!motivFaraFactura || factura.etapa === 'trimit'} onClick={() => setFactura({ etapa: 'confirm' })}>
                    {factura.etapa === 'trimit' ? <><Loader2 size={14} className="rz-spin" /> Se emite…</> : <><FileText size={14} /> Emite factură (Oblio · RH)</>}
                  </button>
                  {motivFaraFactura && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{motivFaraFactura}</div>}
                </>
              )}
              </>)}
              {factura.eroare && <div className="rz-msg rz-msg-err"><AlertTriangle size={13} /> {factura.eroare}</div>}
              {factura.info && <div className="rz-msg">{factura.info}</div>}
            </Group>
          </aside>
        </div>

        {/* ── Subsol ── */}
        <footer className="rz-foot">
          {dublataInfo ? <span data-dublata className="rz-auto" style={{ color: C.green }}>{dublataInfo}</span> : editing.id ? (
            <span data-auto-salvare className="rz-auto" style={{ color: auto.stare === 'eroare' ? C.red : auto.stare === 'salvat' ? C.green : C.faint }}>
              {auto.stare === 'salvez' || (auto.stare !== 'eroare' && arePending()) ? <><Loader2 size={12} className="rz-spin" /> Se salvează…</>
                : auto.stare === 'salvat' ? `✓ Salvat automat · ${auto.ora}`
                : auto.stare === 'eroare' ? `Nesalvat: ${auto.mesaj}`
                : 'Modificările se salvează automat'}
            </span>
          ) : <span className="rz-hint">Esc închide · Enter salvează · Enter ×2 emite factura</span>}
          {/* confirmare pentru client (poza / PDF) - doar pentru rezervari salvate */}
          {editing.apartament_id && telProp && (
            telProp.tel
              ? <a className="rz-btn" href={`https://wa.me/${normalizeWaPhone(telProp.tel!)}?text=${encodeURIComponent(msgPropietar())}`} target="_blank" rel="noreferrer"
                  title={`Trimite proprietarului (${telProp.nume}) confirmarea rezervării pe WhatsApp`}
                  style={{ padding: '10px 16px', borderColor: 'rgba(74,222,128,0.45)', color: '#4ADE80', background: 'rgba(74,222,128,0.08)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>🏠 Confirmare proprietar</a>
              : <span className="rz-btn" title={`${telProp.nume || 'Proprietarul'} nu are telefon salvat — completează-l în Proprietari`} style={{ padding: '10px 16px', opacity: 0.45, cursor: 'default' }}>🏠 Proprietar fără telefon</span>
          )}
          {editing.id && (
            <button data-dubleaza type="button" className="rz-btn" onClick={async () => { if (arePending()) await salveazaAuto(); setDublare(true) }}
              title="Creează o rezervare nouă pentru același client — alegi doar apartamentul și perioada"
              style={{ padding: '10px 16px', borderColor: 'rgba(123,200,255,0.4)', color: '#7BC8FF', background: 'rgba(77,163,255,0.08)' }}>⧉ Dublează</button>
          )}
          {editing.id && (
            <button type="button" className="rz-btn" onClick={() => setConfirmare(true)} title="Poză / PDF cu confirmarea rezervării, de trimis clientului"
              style={{ padding: '10px 16px', borderColor: 'rgba(167,139,250,0.45)', color: '#C4B5FD', background: 'rgba(139,92,246,0.1)' }}>✦ Confirmare client</button>
          )}
          {editing.id && (
            <button data-document-btn type="button" className="rz-btn" onClick={async () => { if (arePending()) await salveazaAuto(); setDocumentConf(true) }}
              title="Document A4 (PDF) de confirmare a rezervării — alegi ce informații apar"
              style={{ padding: '10px 16px', borderColor: 'rgba(94,234,212,0.4)', color: '#5EEAD4', background: 'rgba(45,212,191,0.08)' }}>📄 Document</button>
          )}
          <button type="button" className="rz-btn" onClick={() => void inchide()} style={{ padding: '10px 18px' }}>{editing.id ? 'Închide' : 'Anulează'}</button>
          <button type="button" className="rz-btn rz-btn-primary" onClick={salveazaTot} disabled={saving}>
            {saving ? <><Loader2 size={14} className="rz-spin" /> Se salvează…</> : 'Salvează rezervarea'}
          </button>
        </footer>
      </div>
      {dublare && <DublareRezervare rezervare={editing} apartamente={apartamente} onClose={() => setDublare(false)}
        onCreata={async id => {
          const { data } = await supabase.from('rezervari').select(SELECT_REZERVARE).eq('id', id).single()
          autoSalvate.current = true; onReload?.()
          setDublare(false)
          if (data) { setEditing(data); setDublataInfo('✓ Rezervare nouă creată (dublată) — acum o editezi pe ea'); setTimeout(() => setDublataInfo(null), 7000) }
        }} />}
      {documentConf && <DocumentConfirmare rezervare={editing} apt={apartamente.find(a => a.id === editing.apartament_id) || editing.apartament || null} onClose={() => setDocumentConf(false)} />}
      {confirmare && <ConfirmareClient rezervare={editing} apt={apartamente.find(a => a.id === editing.apartament_id) || editing.apartament || null} onClose={() => setConfirmare(false)} />}
    </div>
  )
}

const pill = (t: { c: string; bg: string; b: string }): React.CSSProperties => ({ color: t.c, background: t.bg, borderColor: t.b })

export const CSS = `
.rz{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;
  background:rgba(4,10,20,0.74);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.rz-panel{width:1080px;max-width:100%;height:min(860px,94vh);display:flex;flex-direction:column;overflow:hidden;
  background:#0D1A2B;border:1px solid rgba(159,215,255,0.16);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.5);animation:fadeIn .18s ease}
.rz-head{display:flex;align-items:flex-start;gap:14px;padding:18px 22px 16px;border-bottom:1px solid ${C.line}}
.rz-x{width:34px;height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:10px;cursor:pointer;
  background:transparent;border:1px solid ${C.line};color:${C.muted}}
.rz-x:hover{color:${C.text};border-color:rgba(159,215,255,0.3)}
.rz-pill{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;border:1px solid;white-space:nowrap}
.rz-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.rz-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}
.rz-main{overflow-y:auto;padding:20px 22px 24px}
.rz-aside{overflow-y:auto;padding:20px 22px 24px;background:${C.aside};border-left:1px solid ${C.line}}
.rz-group{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.blue};margin-bottom:12px}
.rz-lbl{font-size:11.5px;font-weight:500;color:${C.muted}}
.rz-grid{display:grid;gap:12px}
.rz-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.rz-dates{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) 128px;align-items:end}
.rz-nights{display:flex;align-items:center;gap:4px;height:38px;padding:0 8px;font-size:12px;font-weight:700;color:${C.blue};
  border-radius:999px;background:rgba(77,163,255,0.1);border:1px solid rgba(77,163,255,0.25)}
.rz input,.rz select,.rz textarea{height:38px;padding:0 12px;font-size:13.5px;border-radius:9px;background:rgba(255,255,255,0.035);
  border:1px solid rgba(159,215,255,0.16);backdrop-filter:none;-webkit-backdrop-filter:none}
.rz textarea{height:auto;padding:10px 12px;line-height:1.5}
.rz input:hover,.rz select:hover,.rz textarea:hover{border-color:rgba(159,215,255,0.28)}
.rz input:focus,.rz select:focus,.rz textarea:focus{border-color:#4DA3FF;background:rgba(77,163,255,0.06)}
.rz input[type=number]::-webkit-inner-spin-button,.rz input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.rz input[type=number]{-moz-appearance:textfield}
.rz .rz-big{height:48px;font-size:22px;font-weight:700;letter-spacing:-.01em}
.rz-calc{display:grid;grid-template-columns:minmax(0,0.9fr) auto minmax(0,1.3fr);align-items:center;gap:8px}
.rz-calc .rz-big{height:48px}
.rz-calc > div:first-child input{height:48px;font-size:16px;font-weight:600}
.rz-eq{font-size:18px;color:${C.faint}}
.rz .rz-mini{width:auto;height:26px;padding:0 8px;font-size:11.5px}
.rz-step{display:flex;height:38px;border:1px solid rgba(159,215,255,0.16);border-radius:9px;overflow:hidden;background:rgba(255,255,255,0.035)}
.rz-step button{width:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:${C.blue};cursor:pointer}
.rz-step button:hover{background:rgba(77,163,255,0.1)}
.rz .rz-step input{border:none;border-radius:0;height:100%;text-align:center;padding:0;background:transparent}
.rz-fold{width:100%;display:flex;align-items:center;gap:8px;padding:10px 12px;background:transparent;border:none;cursor:pointer;
  font-family:inherit;font-size:12.5px;color:${C.text2}}
.rz-seg{display:flex;flex-wrap:wrap;gap:2px;padding:3px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid ${C.line}}
.rz-seg button{flex:1;min-width:max-content;padding:6px 9px;border:none;border-radius:7px;background:transparent;color:${C.muted};
  font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;transition:all .12s}
.rz-seg button:hover{color:${C.text}}
.rz-status{display:grid;grid-template-columns:72px minmax(0,1fr);gap:8px 10px;align-items:center}
.rz-status > span{font-size:12px;color:${C.muted}}
.rz-rows{display:flex;flex-direction:column;gap:6px;font-size:13px}
.rz-rows > div{display:flex;justify-content:space-between;gap:10px;color:${C.text2}}
.rz-rows b{font-weight:600;color:${C.text};font-variant-numeric:tabular-nums}
.rz-total{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding:11px 13px;border-radius:10px;
  background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);font-size:13px;color:${C.text}}
.rz-total b{font-size:17px;font-weight:800;color:${C.green};font-variant-numeric:tabular-nums}
.rz-check{display:flex !important;align-items:center;gap:8px;margin:10px 0 0 !important;font-size:13px !important;color:${C.text2} !important;cursor:pointer}
.rz .rz-check input{width:16px;height:16px;padding:0;accent-color:#22C55E}
.rz-invoice{display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:10px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);font-size:13px}
.rz-confirm{padding:12px 13px;border-radius:10px;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.3)}
.rz-sug{padding:3px 9px;border-radius:999px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:rgba(214,228,244,0.75);font-family:inherit;font-size:12px;font-weight:600;cursor:pointer}
.rz-sug:hover{background:rgba(77,163,255,0.1);border-color:rgba(77,163,255,0.4);color:#CFE4FF}
.rz-sug[aria-pressed=true]{background:rgba(77,163,255,0.18);border-color:#4DA3FF;color:#CFE4FF}
.rz-canale{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.rz-canal{display:flex;align-items:center;gap:8px;min-width:0;padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.09);background:rgba(255,255,255,0.025);color:rgba(214,228,244,0.62);font-family:inherit;font-size:13px;font-weight:650;cursor:pointer;text-align:left;transition:background .15s,border-color .15s,color .15s,transform .1s}
.rz-canal span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rz-canal:hover{background:rgba(255,255,255,0.05);color:rgba(232,240,250,0.9)}
.rz-canal:active{transform:scale(.98)}
.rz-canal:focus-visible{outline:2px solid #4DA3FF;outline-offset:2px}
.rz-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:9px;font-family:inherit;font-size:13px;font-weight:600;
  cursor:pointer;text-decoration:none;color:${C.text2};background:rgba(255,255,255,0.04);border:1px solid rgba(159,215,255,0.2)}
.rz-btn:hover:not(:disabled){color:${C.text};border-color:rgba(159,215,255,0.35)}
.rz-btn:disabled{opacity:.45;cursor:not-allowed}
.rz-btn-go{color:#0B1A10;background:#4ADE80;border-color:#4ADE80}
.rz-btn-go:hover:not(:disabled){color:#0B1A10;background:#6EE7A0}
.rz-btn-primary{flex:0 0 auto;min-width:220px;justify-content:center;padding:10px 22px;color:#fff;background:#2F7BEA;border-color:#2F7BEA}
.rz-btn-primary:hover:not(:disabled){color:#fff;background:#3B88F5}
.rz-msg{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:${C.green}}
.rz-msg-err{color:${C.red}}
.rz-spin{animation:spin 1s linear infinite}
.rz-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 22px;border-top:1px solid ${C.line};background:rgba(6,14,26,0.7)}
.rz-auto{margin-right:auto;display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;min-width:0}
.rz-hint{margin-right:auto;font-size:11px;color:${C.faint}}
@media (max-width:900px){
  .rz{padding:0;align-items:flex-end}
  .rz-panel{height:96dvh;border-radius:18px 18px 0 0}
  .rz-body{display:block;overflow-y:auto}
  .rz-main,.rz-aside{overflow:visible;padding:16px}
  .rz-aside{border-left:none;border-top:1px solid ${C.line}}
  .rz-head{padding:14px 16px}
  .rz-foot{padding:10px 16px}
  .rz-hint{display:none}
  .rz-btn-primary{flex:1;min-width:0}
}
@media (max-width:520px){
  .rz-2{grid-template-columns:1fr}
  .rz-canale{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rz-dates{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .rz-nights{display:none}
  .rz-status{grid-template-columns:1fr}
}
`
