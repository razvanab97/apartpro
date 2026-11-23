'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Download, MessageCircle, Mail, Loader2, RotateCcw, Save, Check, ExternalLink } from 'lucide-react'
import { supabase, normalizeWaPhone } from '@/lib/supabase'
import { SITE, WHATSAPP, codRezervare, nr, noptiIntre, prenumeImplicit, type Limba } from '@/lib/confirmareDesen'
import { documentConfirmarePdf, type DocPdf, type RandPdf } from '@/lib/documentConfirmarePdf'

// Fereastra „📄 Document confirmare” (cerut direct: „ce document de confirmare recomanzi să generăm pentru fiecare
// rezervare … cu buton” → „da, e bine, dar să putem să ștergem din informații dacă nu vrem să apară”).
// PDF A4 cu text real, RO / EN: antet cu firma, nr. document CR-AAAA-NNNN, oaspete, cazare, plata (+ IBAN), conditii,
// mentiuni. FIECARE rand are o bifa (debifat = nu apare pe document) si se poate rescrie; ↺ revine la valoarea din rezervare.
// Datele firmei, conditiile, orele si ce e ascuns se pot tine minte ca implicite (setari „document_confirmare”).
// Fiecare document emis primeste un numar si o copie a continutului (setari „doc_confirmare_<id rezervare>”).
// Observatiile INTERNE ale rezervarii (CNP, pasaport etc.) nu apar niciodata pe document.

const CHEIE_IMPLICIT = 'document_confirmare', CHEIE_CONTOR = 'doc_confirmare_contor', cheieDoc = (id: string) => 'doc_confirmare_' + id
type Firma = { nume: string; cui: string; regcom: string; adresa: string; telefon: string; email: string; site: string; iban: string; banca: string; titular: string }
type Implicit = { firma: Firma; oraCi: string; oraCo: string; conditii: Record<Limba, string>; ascunse: string[] }
type Emis = { nr: string; data: string; ultima?: string }

const FIRMA0: Firma = { nume: 'AB HOMES', cui: '', regcom: '', adresa: '', telefon: WHATSAPP, email: '', site: SITE, iban: '', banca: '', titular: '' }
const CONDITII0: Record<Limba, string> = {
  ro: '• Check-in de la ora {ci}, check-out până la ora {co}. Pentru alte ore, vă rugăm să ne anunțați din timp.\n• Fumatul este interzis în apartament. Vă rugăm să păstrați liniștea între orele 22:00 și 08:00.\n• Nu sunt permise petrecerile sau evenimentele.\n• Detaliile de acces vi le trimitem pe WhatsApp în ziua sosirii.\n• Pentru modificări sau anulare, vă rugăm să ne contactați cât mai din timp.',
  en: '• Check-in from {ci}, check-out by {co}. For other times, please let us know in advance.\n• Smoking is not allowed in the apartment. Please keep quiet hours between 22:00 and 08:00.\n• Parties and events are not allowed.\n• Access details will be sent to you on WhatsApp on the day of arrival.\n• For changes or cancellation, please contact us as early as possible.',
}

const L = {
  ro: {
    titlu: 'Confirmare de rezervare', nrEt: 'Nr.', dataEt: 'Data emiterii', stareOk: 'Rezervare confirmată',
    intro: (p: string) => `Bună ziua${p ? ', ' + p : ''}! Vă mulțumim pentru rezervare. Mai jos găsiți detaliile sejurului dumneavoastră.`,
    oaspete: 'Date oaspete', cazare: 'Detalii cazare', plata: 'Plată', cont: 'Plata prin transfer', conditii: 'Condiții și regulament', mentiuni: 'Mențiuni',
    o_nume: 'Nume', o_tel: 'Telefon', o_email: 'Email', o_pers: 'Persoane',
    c_apt: 'Apartament', c_adresa: 'Adresă', c_ci: 'Check-in', c_co: 'Check-out', c_nopti: 'Durată', c_cod: 'Nr. rezervare',
    p_pn: 'Preț pe noapte', p_total: 'Total sejur', p_achitat: 'Avans plătit', p_avansde: 'Avans de plătit', p_rest: 'Rest de plată', p_stare: 'Stare plată',
    p_iban: 'IBAN', p_titular: 'Titular cont', p_banca: 'Banca',
    f_cui: 'CUI', f_regcom: 'Reg. Com.', f_adresa: 'Adresă', f_tel: 'Tel.', f_email: 'Email', f_site: 'Web',
    dela: 'de la ora', panala: 'până la ora', pana: 'până la', integral: 'Achitat integral', avansPl: 'Avans plătit', neplatit: 'În așteptarea plății',
    pers: (n: number) => n === 1 ? '1 persoană' : `${n} persoane`, nopti: (n: number) => n === 1 ? '1 noapte' : `${n} nopți`,
    subsol: 'Acest document confirmă rezervarea și nu ține loc de factură fiscală.', pagina: (i: number, n: number) => `Pagina ${i} / ${n}`,
    luni: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
    zile: ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'],
    mesaj: (nr: string) => `Bună ziua! Vă trimit atașat confirmarea rezervării nr. ${nr}. Vă mulțumim!`,
  },
  en: {
    titlu: 'Booking confirmation', nrEt: 'No.', dataEt: 'Issue date', stareOk: 'Booking confirmed',
    intro: (p: string) => `Dear ${p || 'guest'}, thank you for your booking. Please find the details of your stay below.`,
    oaspete: 'Guest details', cazare: 'Stay details', plata: 'Payment', cont: 'Bank transfer', conditii: 'Terms & house rules', mentiuni: 'Notes',
    o_nume: 'Name', o_tel: 'Phone', o_email: 'Email', o_pers: 'Guests',
    c_apt: 'Apartment', c_adresa: 'Address', c_ci: 'Check-in', c_co: 'Check-out', c_nopti: 'Length of stay', c_cod: 'Booking ref.',
    p_pn: 'Price per night', p_total: 'Total stay', p_achitat: 'Deposit paid', p_avansde: 'Deposit due', p_rest: 'Balance due', p_stare: 'Payment status',
    p_iban: 'IBAN', p_titular: 'Account holder', p_banca: 'Bank',
    f_cui: 'VAT ID', f_regcom: 'Trade Reg.', f_adresa: 'Address', f_tel: 'Phone', f_email: 'Email', f_site: 'Web',
    dela: 'from', panala: 'until', pana: 'by', integral: 'Paid in full', avansPl: 'Deposit paid', neplatit: 'Awaiting payment',
    pers: (n: number) => n === 1 ? '1 guest' : `${n} guests`, nopti: (n: number) => n === 1 ? '1 night' : `${n} nights`,
    subsol: 'This document confirms the booking and is not a fiscal invoice.', pagina: (i: number, n: number) => `Page ${i} / ${n}`,
    luni: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    zile: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    mesaj: (nr: string) => `Hello! Please find attached the confirmation of your booking no. ${nr}. Thank you!`,
  },
}
type Cheie = keyof typeof L.ro

// sectiunile si randurile lor (cheile sunt si etichetele din L); firma: randuri ale caror valori vin din datele firmei
const SECTIUNI: { k: string; titlu: Cheie; randuri: string[] }[] = [
  { k: 's_firma', titlu: 'titlu', randuri: ['f_nume', 'f_cui', 'f_regcom', 'f_adresa', 'f_tel', 'f_email', 'f_site'] },
  { k: 's_oaspete', titlu: 'oaspete', randuri: ['o_nume', 'o_tel', 'o_email', 'o_pers'] },
  { k: 's_cazare', titlu: 'cazare', randuri: ['c_apt', 'c_adresa', 'c_ci', 'c_co', 'c_nopti', 'c_cod'] },
  { k: 's_plata', titlu: 'plata', randuri: ['p_pn', 'p_achitat', 'p_avansde', 'p_rest', 'p_stare', 'p_total', 'p_iban', 'p_titular', 'p_banca'] },
]
const DIN_FIRMA: Record<string, keyof Firma> = { f_nume: 'nume', f_cui: 'cui', f_regcom: 'regcom', f_adresa: 'adresa', f_tel: 'telefon', f_email: 'email', f_site: 'site', p_iban: 'iban', p_titular: 'titular', p_banca: 'banca' }
const ETICHETA_UI: Record<string, string> = { f_nume: 'Denumire', s_firma: 'Antet — firma', t_intro: 'Introducere', t_conditii: 'Condiții și regulament', t_mentiuni: 'Mențiuni', stare: 'Pastila „Rezervare confirmată”' }

const aziIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
const fmtSuma = (v: number, m: string) => v.toLocaleString('ro-RO', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' ' + m
const parse = <T,>(s: string | null | undefined, d: T): T => { try { const v = JSON.parse(s || ''); return v && typeof v === 'object' ? v : d } catch { return d } }

export default function DocumentConfirmare({ rezervare, apt, onClose }: { rezervare: any; apt: any; onClose: () => void }) {
  const [limba, setLimba] = useState<Limba>('ro')
  const [firma, setFirma] = useState<Firma>(FIRMA0)
  const [oraCi, setOraCi] = useState('15:00'), [oraCo, setOraCo] = useState('11:00')
  const [conditii, setConditii] = useState<Record<Limba, string>>(CONDITII0)
  const [mentiuni, setMentiuni] = useState('')
  const [ascunse, setAscunse] = useState<Set<string>>(new Set())
  const [override, setOverride] = useState<Record<string, string>>({})
  const [emis, setEmis] = useState<Emis | null>(null)
  const [nrProv, setNrProv] = useState<string>('')
  const [incarcat, setIncarcat] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [genereaza, setGenereaza] = useState(false)
  const [stare, setStare] = useState<string | null>(null)
  const [lucrez, setLucrez] = useState(false)
  const blobRef = useRef<Blob | null>(null)

  // moneda (ca la Confirmare client): sumele in moneda rezervarii, convertite la cursul BNR
  const monedaBaza = String(rezervare.moneda || 'RON').toUpperCase()
  const [monedaAfis, setMonedaAfis] = useState(monedaBaza)
  const [curs, setCurs] = useState<Record<string, number> | null>(null)
  useEffect(() => { fetch('/api/curs-bnr').then(r => r.json()).then(j => j?.toate && setCurs(j.toate)).catch(() => {}) }, [])
  const leiPer = (m: string) => m === 'RON' ? 1 : curs?.[m] || 0
  const factor = monedaAfis === monedaBaza ? 1 : (leiPer(monedaBaza) && leiPer(monedaAfis) ? leiPer(monedaBaza) / leiPer(monedaAfis) : 0)
  const moneda = factor ? monedaAfis : monedaBaza
  const monede = Array.from(new Set([monedaBaza, 'RON', 'EUR', 'USD', 'GBP']))

  // implicitele + documentul deja emis pentru rezervare + urmatorul numar
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('setari').select('cheie,valoare').in('cheie', [CHEIE_IMPLICIT, CHEIE_CONTOR, cheieDoc(rezervare.id)])
      const v = (k: string) => (data || []).find((r: any) => r.cheie === k)?.valoare
      const imp = parse<Partial<Implicit>>(v(CHEIE_IMPLICIT), {})
      if (imp.firma) setFirma({ ...FIRMA0, ...imp.firma })
      if (imp.oraCi) setOraCi(imp.oraCi); if (imp.oraCo) setOraCo(imp.oraCo)
      if (imp.conditii) setConditii({ ...CONDITII0, ...imp.conditii })
      if (Array.isArray(imp.ascunse)) setAscunse(new Set(imp.ascunse))
      const e = parse<Emis | null>(v(cheieDoc(rezervare.id)), null)
      if (e?.nr) setEmis(e)
      const c = parse<{ an?: number; n?: number }>(v(CHEIE_CONTOR), {}), an = Number(aziIso().slice(0, 4))
      setNrProv(`CR-${an}-${String((c.an === an ? Number(c.n) || 0 : 0) + 1).padStart(4, '0')}`)
    })().catch(() => setNrProv(`CR-${aziIso().slice(0, 4)}-0001`)).finally(() => setIncarcat(true))
  }, [rezervare.id])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose() } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true) }, [onClose])

  // sumele (aceeasi logica ca la Confirmare client)
  const total = nr(rezervare.valoare_bruta) || nr(rezervare.suma_incasata)
  const achitat = Math.min(total || Infinity, rezervare.status_plata === 'neplatit' ? 0
    : nr(rezervare.avans) > 0 && rezervare.status_plata !== 'achitat' ? nr(rezervare.avans)
    : rezervare.status_plata === 'avans' ? (nr(rezervare.suma_incasata) < total ? nr(rezervare.suma_incasata) : 0)
    : nr(rezervare.suma_incasata) || (rezervare.status_plata === 'achitat' ? total : 0))
  const integral = total > 0 && achitat >= total
  const avansDe = integral ? 0 : Math.max(0, Math.min(Math.round((nr(rezervare.avans_cerut) - nr(rezervare.avans)) * 100) / 100, total - achitat))
  const rest = integral ? 0 : Math.max(0, Math.round((total - achitat - avansDe) * 100) / 100)
  const nopti = noptiIntre(rezervare.data_checkin, rezervare.data_checkout)

  const t = L[limba]
  const dataLunga = (iso: string, zi = true) => { if (!iso) return ''; const z = new Date(iso + 'T12:00:00'); return `${z.getDate()} ${t.luni[z.getMonth()]} ${z.getFullYear()}${zi ? ` (${t.zile[z.getDay()]})` : ''}` }
  const bani = (x: number) => fmtSuma(Math.round(x * (factor || 1) * 100) / 100, moneda)
  const prenume = prenumeImplicit(rezervare.nume_client, rezervare.canal)

  // valorile calculate din rezervare (pe limba / moneda aleasa) - suprascrise de ce scrii in panou
  const calculat: Record<string, string> = useMemo(() => ({
    o_nume: String(rezervare.nume_client || '').trim(), o_tel: String(rezervare.telefon_client || '').trim(), o_email: String(rezervare.email_client || '').trim(),
    o_pers: t.pers(Math.max(1, Number(rezervare.nr_persoane) || 1)),
    c_apt: String(apt?.nume || '').trim(), c_adresa: String(apt?.adresa || '').trim(),
    c_ci: `${dataLunga(rezervare.data_checkin)}, ${t.dela} ${oraCi}`, c_co: `${dataLunga(rezervare.data_checkout)}, ${t.panala} ${oraCo}`,
    c_nopti: t.nopti(nopti), c_cod: codRezervare(rezervare),
    p_pn: total > 0 ? bani(total / nopti) : '',
    p_total: total > 0 ? bani(total) + (moneda !== monedaBaza ? ` (${fmtSuma(total, monedaBaza)})` : '') : '',
    p_achitat: achitat > 0 && !integral ? bani(achitat) : '',
    p_avansde: avansDe > 0 ? bani(avansDe) + (rezervare.avans_termen ? ` — ${t.pana} ${dataLunga(rezervare.avans_termen, false)}` : '') : '',
    p_rest: rest > 0 ? bani(rest) : '',
    p_stare: total > 0 ? (integral ? t.integral : achitat > 0 ? t.avansPl : t.neplatit) : '',
    t_intro: t.intro(prenume),
    t_conditii: (conditii[limba] || '').replace(/\{ci\}/g, oraCi).replace(/\{co\}/g, oraCo),
    t_mentiuni: mentiuni,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [limba, rezervare, apt, oraCi, oraCo, conditii, mentiuni, factor, moneda])
  const val = (k: string): string => DIN_FIRMA[k] ? firma[DIN_FIRMA[k]] : override[k] ?? calculat[k] ?? ''
  const pe = (k: string) => !ascunse.has(k) && !!String(val(k)).trim()
  const secPe = (k: string) => !ascunse.has(k)
  const eticheta = (k: string) => ETICHETA_UI[k] || (t as any)[k] || L.ro[k as Cheie] as string || k

  // modelul PDF-ului: doar ce e bifat si completat
  const nrAfisat = emis?.nr || nrProv
  const model: DocPdf = useMemo(() => {
    const rand = (k: string, tare = false): RandPdf | null => pe(k) ? { et: (t as any)[k], v: val(k), tare } : null
    const lista = (ks: [string, boolean?][]) => ks.map(([k, b]) => rand(k, !!b)).filter(Boolean) as RandPdf[]
    const fPe = secPe('s_firma')
    const carduri = [
      secPe('s_oaspete') && { titlu: t.oaspete, randuri: lista([['o_nume', true], ['o_tel'], ['o_email'], ['o_pers']]) },
      secPe('s_cazare') && { titlu: t.cazare, randuri: lista([['c_apt', true], ['c_adresa'], ['c_ci', true], ['c_co', true], ['c_nopti'], ['c_cod']]) },
    ].filter((c): c is { titlu: string; randuri: RandPdf[] } => !!c && c.randuri.length > 0)
    const plataPe = secPe('s_plata')
    return {
      titlu: t.titlu, nrEt: t.nrEt, nrDoc: nrAfisat || '—', dataEt: t.dataEt, dataEmitere: dataLunga(emis?.data || aziIso(), false),
      firma: {
        nume: fPe && pe('f_nume') ? val('f_nume') : '',
        linii: fPe ? [
          [pe('f_cui') && `${t.f_cui} ${val('f_cui')}`, pe('f_regcom') && `${t.f_regcom} ${val('f_regcom')}`].filter(Boolean).join(' · '),
          pe('f_adresa') ? val('f_adresa') : '',
          [pe('f_tel') && val('f_tel'), pe('f_email') && val('f_email'), pe('f_site') && val('f_site')].filter(Boolean).join(' · '),
        ].filter(Boolean) : [],
      },
      stare: secPe('stare') ? { text: t.stareOk, ton: 'verde' } : null,
      intro: pe('t_intro') ? val('t_intro') : '',
      carduri,
      plata: plataPe ? {
        titlu: t.plata, randuri: lista([['p_pn'], ['p_achitat'], ['p_avansde', true], ['p_rest', true], ['p_stare']]),
        total: rand('p_total', true), jos: lista([['p_iban', true], ['p_titular'], ['p_banca']]),
      } : null,
      texte: [pe('t_conditii') && { titlu: t.conditii, text: val('t_conditii') }, pe('t_mentiuni') && { titlu: t.mentiuni, text: val('t_mentiuni') }].filter(Boolean) as { titlu: string; text: string }[],
      subsol: [secPe('subsol') ? t.subsol : '', [firma.nume, firma.site, firma.telefon].filter(Boolean).join(' · ')].filter(Boolean),
      pagina: t.pagina,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculat, override, ascunse, firma, nrAfisat, emis, limba])

  const flash = (m: string) => { setStare(m); setTimeout(() => setStare(s => s === m ? null : s), 3200) }
  // previzualizarea: PDF-ul real, regenerat la fiecare schimbare (cu o mica pauza)
  useEffect(() => {
    if (!incarcat) return
    let viu = true
    setGenereaza(true)
    const tm = setTimeout(() => {
      documentConfirmarePdf(model).then(b => {
        if (!viu) return
        blobRef.current = b
        setPdfUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(b) })
      }).catch(() => viu && flash('Eroare la generarea PDF-ului')).finally(() => viu && setGenereaza(false))
    }, 350)
    return () => { viu = false; clearTimeout(tm) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, incarcat])
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

  const comuta = (k: string) => setAscunse(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const scrie = (k: string, v: string) => {
    if (DIN_FIRMA[k]) { setFirma(f => ({ ...f, [DIN_FIRMA[k]]: v })); return }
    if (k === 't_conditii') { const inapoi = (txt: string, ora: string, loc: string) => ora.trim() ? txt.split(ora).join(loc) : txt; setConditii(c => ({ ...c, [limba]: inapoi(inapoi(v, oraCi, '{ci}'), oraCo, '{co}') })); return }
    if (k === 't_mentiuni') { setMentiuni(v); return }
    setOverride(o => ({ ...o, [k]: v }))
  }

  // numarul + copia documentului se salveaza la prima descarcare / trimitere (reemiterea pastreaza numarul)
  async function emite(): Promise<string> {
    const azi = aziIso(), nrDoc = emis?.nr || nrProv
    try {
      if (!emis) {
        const an = Number(azi.slice(0, 4)), n = Number(nrDoc.slice(-4)) || 1
        const { data } = await supabase.from('setari').select('valoare').eq('cheie', CHEIE_CONTOR).maybeSingle()
        const c = parse<{ an?: number; n?: number }>(data?.valoare, {})
        await supabase.from('setari').upsert({ cheie: CHEIE_CONTOR, valoare: JSON.stringify({ an, n: Math.max(n, c.an === an ? Number(c.n) || 0 : 0) }) }, { onConflict: 'cheie' })
      }
      const e: Emis = { nr: nrDoc, data: emis?.data || azi, ultima: new Date().toISOString() }
      const { pagina: _p, ...copie } = model
      await supabase.from('setari').upsert({ cheie: cheieDoc(rezervare.id), valoare: JSON.stringify({ ...e, limba, continut: copie }) }, { onConflict: 'cheie' })
      setEmis(e)
    } catch { flash('Documentul s-a generat, dar numărul nu s-a putut salva') }
    return nrDoc
  }
  const numeFisier = () => `Confirmare-${nrAfisat}-${String(rezervare.nume_client || '').trim().replace(/\s+/g, '-')}.pdf`
  function descarcaBlob(b: Blob) { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = numeFisier(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000) }
  async function descarca() {
    const b = blobRef.current; if (!b) return
    setLucrez(true); descarcaBlob(b); await emite(); setLucrez(false); flash(`PDF descărcat · ${nrAfisat}`)
  }
  const tel = normalizeWaPhone(String(rezervare.telefon_client || ''))
  function trimiteWa() {
    const b = blobRef.current; if (!b) return
    const ua = navigator.userAgent, nav: any = navigator
    const mobil = /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    const fisier = new File([b], numeFisier(), { type: 'application/pdf' })
    // pe telefon: meniul de partajare cu PDF-ul atasat (pornit sincron din click, altfel Safari il refuza)
    if (mobil && nav.canShare?.({ files: [fisier] })) {
      nav.share({ files: [fisier], title: t.titlu }).then(() => { void emite(); flash('Documentul a fost trimis') })
        .catch((e: any) => { if (e?.name !== 'AbortError') flash('Nu s-a putut deschide partajarea — folosește „Descarcă PDF”') })
      return
    }
    // pe calculator: se descarca PDF-ul si se deschide chatul clientului cu mesajul gata scris -> atasezi fisierul
    if (!tel) { flash('Rezervarea nu are telefon — descarcă PDF-ul și trimite-l din WhatsApp'); return }
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(t.mesaj(nrAfisat))}`, '_blank', 'noopener')
    descarcaBlob(b); void emite()
    flash('PDF-ul s-a descărcat și s-a deschis WhatsApp — atașează fișierul în chat')
  }
  function trimiteEmail() {
    const b = blobRef.current; if (!b) return
    descarcaBlob(b); void emite()
    window.location.href = `mailto:${encodeURIComponent(String(rezervare.email_client || '').trim())}?subject=${encodeURIComponent(`${t.titlu} ${nrAfisat}`)}&body=${encodeURIComponent(t.mesaj(nrAfisat))}`
    flash('PDF-ul s-a descărcat — atașează-l la emailul deschis')
  }
  async function salveazaImplicit() {
    const imp: Implicit = { firma, oraCi, oraCo, conditii, ascunse: Array.from(ascunse) }
    const { error } = await supabase.from('setari').upsert({ cheie: CHEIE_IMPLICIT, valoare: JSON.stringify(imp) }, { onConflict: 'cheie' })
    flash(error ? 'Nu s-a putut salva: ' + error.message : 'Ținut minte: firma, orele, condițiile și ce e ascuns — pentru toate documentele')
  }

  // ── UI
  const camp: React.CSSProperties = { width: '100%', minWidth: 0, padding: '7px 9px', borderRadius: 8, background: 'rgba(20,38,65,0.8)', border: '1px solid rgba(159,215,255,0.18)', color: '#FFFFFF', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }
  const btn = (bgc: string, fg: string, br: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 12px', borderRadius: 10, border: `1px solid ${br}`, background: bgc, color: fg, fontSize: 13, fontWeight: 700, cursor: 'pointer' })
  const bifa = (k: string) => <input type="checkbox" data-bifa={k} checked={!ascunse.has(k)} onChange={() => comuta(k)} title={ascunse.has(k) ? 'Nu apare pe document — bifează ca să apară' : 'Apare pe document — debifează ca să nu apară'} style={{ width: 15, height: 15, accentColor: '#8B5CF6', cursor: 'pointer', flexShrink: 0 }} />
  const rand = (k: string, sec: string) => {
    const v = val(k), gol = !String(v).trim(), stins = ascunse.has(k) || ascunse.has(sec) || gol
    return (
      <div key={k} data-rand={k} data-apare={!stins} style={{ display: 'grid', gridTemplateColumns: '15px 92px minmax(0,1fr) 22px', alignItems: 'center', gap: 7, opacity: stins ? 0.5 : 1 }}>
        {bifa(k)}
        <span style={{ fontSize: 11, color: 'rgba(159,215,255,0.65)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: ascunse.has(k) ? 'line-through' : 'none' }} title={eticheta(k)}>{eticheta(k)}</span>
        <input data-val={k} value={v} placeholder={DIN_FIRMA[k] ? 'completează (gol = nu apare)' : 'gol = nu apare'} onChange={e => scrie(k, e.target.value)} style={camp} />
        {override[k] != null
          ? <button type="button" data-reset={k} onClick={() => setOverride(o => { const n = { ...o }; delete n[k]; return n })} title="Revino la valoarea din rezervare" style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'transparent', color: '#C4B5FD', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><RotateCcw size={13} /></button>
          : <span />}
      </div>
    )
  }
  const sectiune = (k: string, titlu: string, children: React.ReactNode) => (
    <div key={k} data-sectiune={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 11, background: 'rgba(14,27,43,0.55)', border: '1px solid rgba(159,215,255,0.1)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: ascunse.has(k) ? 'rgba(159,215,255,0.4)' : '#C4B5FD', cursor: 'pointer' }}>
        {bifa(k)} {titlu}{ascunse.has(k) && <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'rgba(159,215,255,0.45)' }}>— nu apare</span>}
      </label>
      {!ascunse.has(k) && children}
    </div>
  )
  const text = (k: string, randuri = 3) => sectiune(k, eticheta(k), <>
      <textarea data-val={k} value={val(k)} rows={randuri} placeholder={k === 't_mentiuni' ? 'ex.: parcare inclusă, pat suplimentar… (gol = nu apare)' : 'gol = nu apare'} onChange={e => scrie(k, e.target.value)} style={{ ...camp, resize: 'vertical', lineHeight: 1.45, fontWeight: 500 }} />
      {k === 't_conditii' && <div style={{ fontSize: 10.5, color: 'rgba(159,215,255,0.45)' }}>Textul se ține separat pe RO / EN. Orele de check-in / check-out se completează singure.</div>}
    </>)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(3,7,15,0.78)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div data-document-confirmare onClick={e => e.stopPropagation()} className="dc-wrap" style={{ width: 'min(1180px,100%)', height: 'calc(100vh - 32px)', background: '#0B1524', border: '1px solid rgba(159,215,255,0.14)', borderRadius: 18, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 430px', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div className="dc-prev" style={{ position: 'relative', background: '#3A4152', minHeight: 0 }}>
          {pdfUrl ? <iframe data-pdf-preview title="Previzualizare document" src={pdfUrl + '#toolbar=0&navpanes=0&view=FitH'} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
            : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'rgba(214,228,244,0.7)', fontSize: 13 }}><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Se generează documentul…</span></div>}
          {pdfUrl && <a data-doc-deschide href={pdfUrl} target="_blank" rel="noreferrer" title="Deschide documentul într-un tab nou (dacă previzualizarea nu apare pe acest dispozitiv)"
            style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 999, background: 'rgba(11,21,36,0.88)', border: '1px solid rgba(159,215,255,0.2)', color: '#9FD7FF', fontSize: 11.5, fontWeight: 700, textDecoration: 'none' }}><ExternalLink size={12} /> Deschide</a>}
          {genereaza && pdfUrl && <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 999, background: 'rgba(11,21,36,0.85)', color: '#9FD7FF', fontSize: 11 }}><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> se actualizează</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '16px 18px 10px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid rgba(159,215,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>📄 Document confirmare</div>
                <div data-doc-nr style={{ fontSize: 12, color: 'rgba(159,215,255,0.55)', marginTop: 2 }}>
                  {emis ? <>Emis <b style={{ color: '#D6E4F4' }}>{emis.nr}</b> pe {emis.data.split('-').reverse().join('.')} · la descărcare se reemite cu același număr</> : nrProv ? <>Va primi nr. <b style={{ color: '#D6E4F4' }}>{nrProv}</b> la prima descărcare / trimitere</> : 'Se pregătește…'}
                </div>
              </div>
              <button onClick={onClose} title="Închide" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, border: '1px solid rgba(159,215,255,0.18)', background: 'transparent', color: 'rgba(214,228,244,0.7)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={15} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, alignItems: 'center' }}>
              <div style={{ gridColumn: 'span 2', display: 'flex', gap: 3, padding: 3, borderRadius: 9, background: 'rgba(14,27,43,0.6)', border: '1px solid rgba(159,215,255,0.1)' }}>
                {(['ro', 'en'] as Limba[]).map(l => <button key={l} data-limba={l} onClick={() => setLimba(l)} style={{ flex: 1, padding: '6px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: limba === l ? 'rgba(77,163,255,0.2)' : 'transparent', color: limba === l ? '#7BC8FF' : 'rgba(159,215,255,0.5)' }}>{l === 'ro' ? '🇷🇴 RO' : '🇬🇧 EN'}</button>)}
              </div>
              <select data-moneda value={monedaAfis} onChange={e => setMonedaAfis(e.target.value)} title="Moneda sumelor de pe document (cursul BNR al zilei)" style={{ ...camp, colorScheme: 'dark', gridColumn: 'span 2' }}>
                {monede.map(m => <option key={m} value={m} disabled={m !== monedaBaza && !(leiPer(m) && leiPer(monedaBaza))}>Sume în {m}{m === monedaBaza ? ' (rezervare)' : ''}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(159,215,255,0.5)' }}>Debifează ce nu vrei să apară · scrie peste orice valoare · <RotateCcw size={10} style={{ verticalAlign: -1 }} /> revine la rezervare</div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {sectiune('s_firma', 'Antet — firma', SECTIUNI[0].randuri.map(k => rand(k, 's_firma')))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(214,228,244,0.85)', padding: '2px 10px', cursor: 'pointer' }}>{bifa('stare')} Pastila „{t.stareOk}”</label>
            {text('t_intro', 2)}
            {sectiune('s_oaspete', t.oaspete, SECTIUNI[1].randuri.map(k => rand(k, 's_oaspete')))}
            {sectiune('s_cazare', t.cazare, <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 2 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(159,215,255,0.6)' }}>Ora check-in <input data-ora-ci value={oraCi} onChange={e => setOraCi(e.target.value)} style={{ ...camp, width: 70 }} /></label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(159,215,255,0.6)' }}>Ora check-out <input data-ora-co value={oraCo} onChange={e => setOraCo(e.target.value)} style={{ ...camp, width: 70 }} /></label>
              </div>
              {SECTIUNI[2].randuri.map(k => rand(k, 's_cazare'))}
            </>)}
            {sectiune('s_plata', t.plata, <>
              {SECTIUNI[3].randuri.map(k => rand(k, 's_plata'))}
              <div style={{ fontSize: 10.5, color: 'rgba(159,215,255,0.45)' }}>IBAN-ul, titularul și banca vin din datele firmei (se țin minte cu „Ține minte”).</div>
            </>)}
            {text('t_conditii', 6)}
            {text('t_mentiuni', 2)}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(214,228,244,0.85)', padding: '2px 10px', cursor: 'pointer' }}>{bifa('subsol')} Subsol „{t.subsol}”</label>
            <button data-tine-minte type="button" onClick={salveazaImplicit} style={{ ...btn('transparent', '#C4B5FD', 'rgba(167,139,250,0.35)'), fontSize: 12, padding: '8px 10px' }}><Save size={13} /> Ține minte firma, orele, condițiile și ce e ascuns</button>
          </div>

          <div style={{ padding: '12px 18px 16px', borderTop: '1px solid rgba(159,215,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stare && <div data-doc-stare style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: /Nu |Eroare|nu s-a/.test(stare) ? '#FCD34D' : '#4ADE80' }}><Check size={13} /> {stare}</div>}
            <button data-doc-descarca onClick={descarca} disabled={!pdfUrl || lucrez || genereaza} style={{ ...btn('linear-gradient(135deg,#7C3AED,#2563EB)', '#FFFFFF', 'transparent'), padding: '12px', fontSize: 14, opacity: !pdfUrl || genereaza ? 0.6 : 1 }}>
              {lucrez ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={15} />} Descarcă PDF
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button data-doc-wa onClick={trimiteWa} disabled={!pdfUrl || genereaza} style={{ ...btn('linear-gradient(135deg,#25D366,#128C7E)', '#FFFFFF', 'transparent'), flex: 1.3, opacity: !pdfUrl || genereaza ? 0.6 : 1 }}><MessageCircle size={14} /> WhatsApp</button>
              <button data-doc-email onClick={trimiteEmail} disabled={!pdfUrl || genereaza} title={rezervare.email_client ? `Email către ${rezervare.email_client}` : 'Rezervarea nu are email — se deschide un email gol'} style={{ ...btn('rgba(159,215,255,0.06)', 'rgba(214,228,244,0.85)', 'rgba(159,215,255,0.2)'), flex: 1, opacity: !pdfUrl || genereaza ? 0.6 : 1 }}><Mail size={14} /> Email</button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 860px){ .dc-wrap{ grid-template-columns: 1fr !important; grid-template-rows: 46vh minmax(0,1fr); } }`}</style>
    </div>
  )
}
