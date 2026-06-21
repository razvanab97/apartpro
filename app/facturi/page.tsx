'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { Toast, useToast, ConnectionError } from '@/components/ui'
import { Upload, FileText, Check, Trash2, Plus, Loader, AlertCircle, RefreshCw } from 'lucide-react'

const FURNIZORI_LIST = [
  'E.ON Curent','E.ON Gaz','E.ON DUO','Urbica','TermoService','Salubris',
  'Orange','Vodafone','Royal','Internet','Asociatie','Alta',
]

const FURNIZOR_COLORS: Record<string,string> = {
  'E.ON Curent':  '#FCD34D','E.ON Gaz':    '#FB923C','E.ON DUO': '#FBBF24',
  'Urbica':       '#60A5FA','TermoService':'#F87171',
  'Salubris':     '#4ADE80','Orange':      '#FB923C',
  'Vodafone':     '#F87171','Royal':       '#C084FC',
  'Internet':     '#38BDF8','Asociatie':   '#A78BFA',
  'Alta':         '#94A3B8',
}

type Factura = {
  id?: string
  filename: string
  furnizor: string
  categorie?: string
  categorieLabel: string
  suma_totala: number
  moneda: string
  data_scadenta: string | null
  data_emitere: string | null
  perioada: string
  nr_factura: string
  tip_serviciu: string
  detalii: string
  adresa_consum?: string
  adresa_titular?: string
  titular?: string
  adrese_matching?: string[]
  apartament_id: string | null
  _autoMatched?: boolean
  status: 'procesat' | 'salvat' | 'eroare'
  processing?: boolean
  base64Preview?: string
  mimeType?: string
  cheltuiala_id?: string
  file_url?: string
}

export default function FacturiPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [facturi, setFacturi] = useState<Factura[]>([])
  const [apts, setApts] = useState<any[]>([])
  const [savedFacturi, setSavedFacturi] = useState<any[]>([])
  const [loadingArchiva, setLoadingArchiva] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<Factura | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [searchArchiva, setSearchArchiva] = useState<string>('')
  const [syncingAll, setSyncingAll] = useState(false)
  const [editArchiva, setEditArchiva] = useState<any>(null)
  const [editArchivaForm, setEditArchivaForm] = useState({apartament_id:'',valoare:'',status:'nevalidat',data:''})
  const { toast, show } = useToast()

  useEffect(() => {
    loadApts()
    loadSaved()
  }, [])

  async function loadApts() {
    const { data } = await supabase.from('apartamente').select('id,nume,nota,adresa,status').order('nota,nume')
    setApts(data || [])
  }

  // Extrage numarul apartamentului din cod nota (L83->83, N32->32, CG40->40, EX59->59)
  // Coduri locatie Urbica → nota apartament (direct, pentru cazuri speciale)
  const URBICA_COD_NOTA_MAP: Record<string,string> = {
    'is9pgrum': 'NT9',   // Newton Urban - nr apartament e 9N3, nestandard
  }

  // Royal app: Bl R7 ap 99 = R99
  const ROYAL_AP_MAP: Record<string,string> = {
    '99': 'R99',
    '9': 'R99', // fallback
  }
  function matchByRoyal(adresa: string | null, nrApt: string | null, aptList: any[]): string | null {
    const a = (adresa||'').toLowerCase()
    const isRoyalAddr = a.includes('r7') || a.includes('royal') || a.includes('bl. r')
    // Cauta dupa nr apartament
    if (nrApt) {
      const nota = ROYAL_AP_MAP[nrApt]
      if (nota) {
        const apt = aptList.find((x:any) => (x.nota||'').toUpperCase() === nota)
        if (apt) return apt.id
      }
    }
    // Daca adresa e Royal si nu avem nr, cauta dupa R99 direct
    if (isRoyalAddr) {
      const apt = aptList.find((x:any) => (x.nota||'').toUpperCase() === 'R99')
      if (apt) return apt.id
    }
    return null
  }

  // Coduri locatie Urbica → numar apartament
  const URBICA_COD_MAP: Record<string,string> = {
    'isextia5': '83',  // L83 Lazar Comfy
    'is1c3zgu': '94',  // L94 Palas Retreat
    'isue3rni': '88',  // L88 Palas SkyNest
    'isqu7njc': '99',  // L99 Airy Palas
    'isrjpjvo': '32',  // N32 Mint Loft Copou
    'is9woaaw': '33',  // N33
    'isbiba8y': '59',  // EX59 Cozy Studio
    'is9pgrum': '9',   // NT9 Newton Urban
    'isxdhxbg': '64',  // C64 SkyPort
    'islynpyd': '16',  // Canta
  }

  function extractAptNr(nota: string | null): string | null {
    if (!nota) return null
    const m = nota.match(/\d+/)
    return m ? m[0] : null
  }

  // Auto-potrivire apartament dupa adresa + numar apartament din factura
  function matchApartament(adresaFactura: string | null, aptList: any[], nrAptExplicit?: string | null): string | null {
    if (!adresaFactura || !aptList.length) return null
    const af = adresaFactura.toLowerCase().replace(/[,\.\-]/g,' ').replace(/\s+/g,' ').trim()
    const keywords = af.split(' ').filter((w:string) => w.length > 3)

    // Numarul apartamentului: prioritate la cel extras explicit de AI
    // Fallback: cauta "ap X" sau "apartament X" in adresa (NU "nr X" care e nr strada)
    let apNrInAddr: string | null = nrAptExplicit || null
    if (!apNrInAddr) {
      // Cauta explicit "ap 99", "ap. 99", "apartament 99" - NU "nr 18A"
      const apMatch = af.match(/\bap(?:artament|\.)?\s*(\d+)\b/i)
      apNrInAddr = apMatch ? apMatch[1] : null
    }

    let bestMatch: {id:string; score:number} | null = null
    for (const apt of aptList) {
      const aptAddr = (apt.adresa || '').toLowerCase().replace(/[,\.\-]/g,' ')
      const aptNota = (apt.nota || '').toLowerCase()
      const aptNume = (apt.nume || '').toLowerCase()
      const aptNr = extractAptNr(apt.nota) // numarul din cod: L83->83, N32->32, L99->99
      let score = 0

      // Matching dupa adresa (cuvinte cheie comune)
      if (aptAddr) {
        for (const kw of keywords) {
          if (aptAddr.includes(kw)) score += 2
        }
      }

      // BONUS DECISIV: numarul apartamentului din factura == numarul din codul apartamentului
      // Daca nr apartament e cunoscut si nu se potriveste → penalizare puternica
      if (apNrInAddr && aptNr) {
        if (apNrInAddr === aptNr) score += 50  // match perfect - castig garantat
        else score -= 30                        // nr diferit - eliminat practic
      }

      // Bonus nota/nume direct in adresa
      if (aptNota.length > 2 && af.includes(aptNota)) score += 5
      if (aptNume.length > 2 && af.includes(aptNume)) score += 3

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: apt.id, score }
      }
    }
    return bestMatch && bestMatch.score >= 2 ? bestMatch.id : null
  }

  // Matching si dupa titular (ex: "Canta Alexandru" → apt nota "Canta")
  function matchByTitular(titular: string | null, aptList: any[]): string | null {
    if (!titular || !aptList.length) return null
    const t = titular.toLowerCase()
    for (const apt of aptList) {
      const nota = (apt.nota || '').toLowerCase()
      const nume = (apt.nume || '').toLowerCase()
      if (nota.length > 2 && t.includes(nota)) return apt.id
      if (nume.length > 3 && t.includes(nume)) return apt.id
    }
    return null
  }

  // Matching special pentru TermoService - adresa in format "AC05, Bl A43, Sc A, Ap 08"
  // Mircea = Bl A43, Canta = Bl 503
  const TERMOSERVICE_BL_MAP: Record<string,string> = {
    'a43': 'Mircea',      // str. Vamasoaia, Bl A43
    'vamasoaia': 'Mircea',
  }

  // Ebloc matching dupa adresa
  const EBLOC_ADDR_MAP: Record<string,string> = {
    'rozelor': 'HD02',   // Aleea Rozelor nr 40, ap 2
    'rozelor 40': 'HD02',
  }
  function matchByEbloc(adresa: string | null, aptList: any[]): string | null {
    if (!adresa) return null
    const a = adresa.toLowerCase()
    for (const [keyword, aptNota] of Object.entries(EBLOC_ADDR_MAP)) {
      if (a.includes(keyword)) {
        const apt = aptList.find((x:any) => (x.nota||'').toUpperCase() === aptNota)
        if (apt) return apt.id
      }
    }
    return null
  }
  function matchByTermoService(adresa: string | null, aptList: any[]): string | null {
    if (!adresa) return null
    const a = adresa.toLowerCase()
    for (const [bl, aptNota] of Object.entries(TERMOSERVICE_BL_MAP)) {
      if (a.includes(bl)) {
        const apt = aptList.find((x:any) =>
          (x.nota||'').toLowerCase().includes(aptNota.toLowerCase()) ||
          (x.nume||'').toLowerCase().includes(aptNota.toLowerCase())
        )
        if (apt) return apt.id
      }
    }
    return null
  }

  async function saveEditArchiva() {
    if (!editArchiva) return
    setSaving('archiva-edit')
    const { error } = await supabase.from('cheltuieli').update({
      apartament_id: editArchivaForm.apartament_id || null,
      valoare: parseFloat(editArchivaForm.valoare) || editArchiva.valoare,
      status: editArchivaForm.status,
      data: editArchivaForm.data || editArchiva.data,
    }).eq('id', editArchiva.id)
    if (error) show('error', error.message)
    else { show('success', 'Factură actualizată'); setEditArchiva(null); loadSaved() }
    setSaving(null)
  }

  async function sincronizeazaToate() {
    setSyncingAll(true)
    let count = 0
    for (const f of savedFacturi.filter(s => !s.cheltuiala_sincronizata)) {
      if (!f.apartament_id) continue
      // Verifica daca exista deja in cheltuieli
      const { data: existing } = await supabase.from('cheltuieli')
        .select('id').eq('fisier_url', f.fisier_url).limit(1)
      if (existing && existing.length > 0) continue
      // Data: luna emiterii (data facturii) dar cu ziua scadentei
      const dataFactura = f.data || new Date().toISOString().slice(0,10)
      const categorieToColKey: Record<string,string> = {
        'E.ON Gaz':'eon_gaz','E.ON Curent':'eon_curent','E.ON Energie':'eon_curent','E.ON DUO':'eon_curent',
        'Urbica':'asociatie','TermoService':'asociatie','Royal':'asociatie',
        'Salubris':'salubris','Internet':'internet','Asociatie':'asociatie',
      }
      const colKey = categorieToColKey[f.categorie||''] || 'alte'
      await supabase.from('cheltuieli').insert({
        apartament_id: f.apartament_id,
        categorie: colKey,
        descriere: f.descriere || f.categorie,
        valoare: f.valoare,
        data: dataFactura,
        status: 'nevalidat',
        suportat_de: 'administrator',
        tva: 0,
        nota: f.nota || '',
        fisier_url: f.fisier_url,
      })
      count++
    }
    show('success', count > 0 ? `✓ Sincronizate ${count} facturi` : 'Toate facturile sunt deja sincronizate')
    setSyncingAll(false)
    loadSaved()
  }

  async function loadSaved() {
    setLoadingArchiva(true)
    setLoadError(false)
    // Bail safety: daca query-ul Supabase atarna (retea blocata/timeout), fortam iesirea dupa 13s
    const bail = setTimeout(()=>{ setLoadingArchiva(false); setLoadError(true) }, 20000)
    try{
      const { data, error } = await supabase.from('cheltuieli')
        .select('id,descriere,valoare,data,nota,categorie,status,apartament_id,fisier_url')
        .not('fisier_url', 'is', null)
        .order('data', { ascending: false })
      if(error) throw error
      setSavedFacturi(data || [])
      clearTimeout(bail)
    }catch(err){ console.error('[facturi loadSaved]', err); clearTimeout(bail); setLoadError(true) }
    setLoadingArchiva(false)
  }

  async function deleteFacturaSalvata(id: string) {
    if (!confirm('Ștergi această cheltuială?')) return
    const { error } = await supabase.from('cheltuieli').delete().eq('id', id)
    if (error) show('error', error.message)
    else { show('success', 'Cheltuială ștearsă'); loadSaved() }
  }

  async function processFile(file: File) {
    const id = Math.random().toString(36).slice(2)
    const mimeType = file.type || 'application/pdf'

    // add placeholder
    setFacturi(f => [...f, {
      id, filename: file.name, furnizor: '...', categorieLabel: '...', suma_totala: 0,
      moneda: 'RON', data_scadenta: null, data_emitere: null, perioada: '', nr_factura: '', tip_serviciu: '',
      detalii: '', apartament_id: null, status: 'procesat', processing: true,
    }])

    // convert to base64
    const base64Data = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res((r.result as string).split(',')[1])
      r.onerror = rej
      r.readAsDataURL(file)
    })

    // preview URL
    const previewUrl = URL.createObjectURL(file)

    // Upload fisier in Supabase Storage
    let fileUrl: string | null = null
    try {
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2,'0')
      const storagePath = `facturi/${now.getFullYear()}-${pad(now.getMonth()+1)}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('Facturi')
        .upload(storagePath, file, { contentType: mimeType, upsert: true })
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from('Facturi').getPublicUrl(storagePath)
        fileUrl = urlData.publicUrl
      }
    } catch {}

    try {
      const resp = await fetch('/api/facturi-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, mimeType, filename: file.name })
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)

      // Numarul apartamentului - prioritate: cod Urbica > nr_apartament din AI
      const nrDinCodUrbica = data.cod_locatie_urbica ? URBICA_COD_MAP[data.cod_locatie_urbica] || null : null
      const nrAptExplicit = nrDinCodUrbica || data.nr_apartament || null
      if (nrDinCodUrbica) {
        show('info', `Urbica cod ${data.cod_locatie_urbica} → ap. ${nrDinCodUrbica}`)
      }
      // Declaram autoAptId inainte de orice utilizare
      let autoAptId: string | null = null
      // Matching direct dupa nota (pentru NT9 si alte cazuri speciale cu cod Urbica)
      const notaDirecta = data.cod_locatie_urbica ? URBICA_COD_NOTA_MAP[data.cod_locatie_urbica] || null : null
      if (notaDirecta) {
        const aptDirect = apts.find((a:any) => a.nota === notaDirecta)
        if (aptDirect) {
          show('info', `Urbica cod ${data.cod_locatie_urbica} → ${notaDirecta}`)
          autoAptId = aptDirect.id
        }
      }
      // PRIORITATE 1: Royal (inainte de matching general - altfel 'ap 99' e confundat cu L99)
      const isRoyal = (data.furnizor||'').toLowerCase().includes('royal') ||
        (data.adresa_consum||'').toLowerCase().includes('bl. r7') ||
        (data.adresa_consum||'').toLowerCase().includes('bl r7')
      if (!autoAptId && isRoyal) {
        autoAptId = matchByRoyal(data.adresa_consum, nrAptExplicit, apts)
        if (autoAptId) show('info', `Royal → R99 ✓`)
      }

      // PRIORITATE 2: TermoService
      if (!autoAptId && (data.furnizor||'').toLowerCase().includes('termo')) {
        autoAptId = matchByTermoService(data.adresa_consum, apts)
      }

      // PRIORITATE 3: Ebloc
      if (!autoAptId) {
        const isEbloc = (data.furnizor||'').toLowerCase().includes('ebloc') ||
          (data.furnizor||'').toLowerCase().includes('e-bloc') ||
          (data.furnizor||'').toLowerCase().includes('kondo') ||
          (data.detalii||'').toLowerCase().includes('e-bloc')
        if (isEbloc) autoAptId = matchByEbloc(data.adresa_consum, apts)
      }

      // PRIORITATE 4: Matching general dupa adresa (Urbica, EON, etc)
      // Excludem Royal din matching general ca sa nu prinda 'ap 99' → L99
      if (!autoAptId && !isRoyal) {
        const adreseToTry = [data.adresa_consum, ...(data.adrese_matching || []), data.adresa_titular].filter(Boolean)
        for (const addr of adreseToTry) {
          autoAptId = matchApartament(addr, apts, nrAptExplicit)
          if (autoAptId) break
        }
      }

      // PRIORITATE 5: Matching dupa titular
      if (!autoAptId && data.titular) {
        autoAptId = matchByTitular(data.titular, apts)
      }
      const facturaFinala = {
        ...data, id, processing: false,
        base64Preview: previewUrl, mimeType, status: 'procesat' as const,
        apartament_id: autoAptId,
        _autoMatched: !!autoAptId,
        file_url: fileUrl || undefined,
      }
      setFacturi(f => f.map(x => x.id === id ? facturaFinala : x))

      // Auto-save daca apartamentul a fost identificat automat
      if (autoAptId) {
        const aptNume = apts.find((a:any) => a.id === autoAptId)?.nume || ''
        show('info', `Asociat automat cu ${aptNume} — se salvează...`)
        await autoSave(facturaFinala, apts)
      }
    } catch (e: any) {
      setFacturi(f => f.map(x => x.id === id ? { ...x, processing: false, status: 'eroare' as const, furnizor: 'Eroare extragere' } : x))
      show('error', 'Eroare la procesare: ' + e.message)
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(f => {
      if (f.type === 'application/pdf' || f.type.startsWith('image/')) processFile(f)
      else show('error', `${f.name}: doar PDF sau imagine`)
    })
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  async function autoSave(f: any, aptList: any[]) {
    const now = new Date()
    const pad = (n:number) => String(n).padStart(2,'0')

    // Verifica duplicat dupa numarul facturii
    if (f.nr_factura) {
      const { data: existing } = await supabase.from('cheltuieli')
        .select('id,descriere').ilike('nota', `%${f.nr_factura}%`).limit(1)
      if (existing && existing.length > 0) {
        setFacturi(list => list.map(x => x.id === f.id ? { ...x, status: 'eroare' as const, furnizor: `Duplicat — factura ${f.nr_factura} există deja` } : x))
        show('error', `⚠ Factura ${f.nr_factura} a mai fost încărcată`)
        return
      }
    }

    // Data = prima zi a lunii de emitere (nu scadenta)
    const dataEmitereAuto = f.data_emitere
      ? f.data_emitere.slice(0,7)+'-01'
      : `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`
    const dataScadenta = f.data_scadenta || null
    const categorieToColKey: Record<string,string> = {
      'E.ON Gaz':'eon_gaz','E.ON Curent':'eon_curent','E.ON Energie':'eon_curent','E.ON DUO':'eon_curent','eon_energie':'eon_curent',
      'Urbica':'asociatie','TermoService':'asociatie','Royal':'asociatie',
      'Salubris':'salubris','Internet':'internet','Asociatie':'asociatie',
    }
    const colKey = categorieToColKey[f.categorieLabel||''] || categorieToColKey[f.categorie||''] || 'alte'
    const { data, error } = await supabase.from('cheltuieli').insert({
      apartament_id: f.apartament_id,
      categorie: colKey || f.categorie || 'alta',
      descriere: `${f.categorieLabel} — ${f.furnizor}`,
      valoare: f.suma_totala,
      data: dataEmitereAuto,
      status: 'nevalidat',
      suportat_de: 'administrator',
      tva: 0,
      nota: `Factură ${f.nr_factura || f.filename} | ${f.perioada || ''}`.trim(),
      fisier_url: f.file_url || null,
    }).select().single()
    if (!error && data) {
      setFacturi(list => list.map(x => x.id === f.id ? { ...x, status: 'salvat' as const, cheltuiala_id: data.id } : x))
      const aptNume = aptList.find((a:any) => a.id === f.apartament_id)?.nota || aptList.find((a:any) => a.id === f.apartament_id)?.nume || ''
      show('success', `✓ ${f.categorieLabel} ${f.suma_totala} RON salvat automat → ${aptNume}`)
      loadSaved()
    }
  }

  async function saveForcedToSupabase(f: Factura) {
    // Salvare fortata - bypass verificare duplicat, permite corectare erori
    if (!f.id || !f.apartament_id) return
    setSaving(f.id)
    const now = new Date()
    const pad = (n:number) => String(n).padStart(2,'0')
    const dataEmitereFortat = f.data_emitere
      ? f.data_emitere.slice(0,7)+'-01'
      : `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`
    const dataScadenta = f.data_scadenta || `${now.getFullYear()}-${pad(now.getMonth()+1)}-25`
    const categorieToColKey: Record<string,string> = {
      'E.ON Gaz': 'eon_gaz', 'eon_gaz': 'eon_gaz',
      'E.ON Curent': 'eon_curent', 'E.ON DUO': 'eon_curent', 'eon_curent': 'eon_curent',
      'Urbica':'asociatie','TermoService':'asociatie','Royal':'asociatie',
      'Salubris':'salubris','Internet':'internet','Asociatie':'asociatie',
    }
    const colKey = categorieToColKey[f.categorieLabel || ''] || categorieToColKey[f.categorie || ''] || 'alte'
    const { data, error } = await supabase.from('cheltuieli').insert({
      apartament_id: f.apartament_id,
      categorie: colKey,
      descriere: `${f.categorieLabel} — ${f.furnizor}`,
      valoare: f.suma_totala,
      data: dataEmitereFortat,
      status: 'nevalidat',
      suportat_de: 'administrator',
      tva: 0,
      nota: `Factură ${f.nr_factura || f.filename} | ${f.perioada || ''}`.trim(),
      fisier_url: f.file_url || null,
    }).select().single()
    if (error) { show('error', error.message) }
    else {
      setFacturi(list => list.map(x => x.id === f.id ? { ...x, status: 'salvat' as const, cheltuiala_id: data.id } : x))
      const aptNume = apts.find((a:any) => a.id === f.apartament_id)?.nota || ''
      show('success', `✓ Salvat forțat → ${aptNume}`)
      loadSaved()
    }
    setSaving(null)
  }

  async function saveToSupabase(f: Factura) {
    if (!f.id) return
    setSaving(f.id)

    // Verifica duplicat dupa numarul facturii
    if (f.nr_factura) {
      const { data: existing } = await supabase.from('cheltuieli')
        .select('id').ilike('nota', `%${f.nr_factura}%`).limit(1)
      if (existing && existing.length > 0) {
        show('error', `⚠ Factura ${f.nr_factura} a mai fost încărcată`)
        setSaving(null)
        return
      }
    }

    const now = new Date()
    const pad = (n:number) => String(n).padStart(2,'0')
    // Pastreaza MEREU data scadentei din factura
    const dataScadenta = f.data_scadenta || `${now.getFullYear()}-${pad(now.getMonth()+1)}-25`
    // Mapeaza categoria facturii la UTIL_KEYS reale din cheltuieli
    // UTIL_KEYS: chirie, asociatie, eon_curent, eon_gaz, internet, salubris
    const categorieToColKey: Record<string,string> = {
      // E.ON
      'E.ON Gaz': 'eon_gaz', 'eon_gaz': 'eon_gaz',
      'E.ON Curent': 'eon_curent', 'E.ON DUO': 'eon_curent', 'eon_curent': 'eon_curent',
      // Asociatie / intretinere - Urbica, Ebloc, Newton Park etc → sectiunea asociatie
      'Urbica': 'asociatie', 'urbica': 'asociatie',
      'Asociatie': 'asociatie', 'asociatie': 'asociatie',
      'TermoService': 'asociatie', 'termoservice': 'asociatie',
      // Salubris
      'Salubris': 'salubris', 'salubris': 'salubris',
      // Internet
      'Internet': 'internet', 'internet': 'internet',
      // Royal → asociatie
      'Royal': 'asociatie', 'royal': 'asociatie',
    }
    const colKey = categorieToColKey[f.categorieLabel || ''] || categorieToColKey[f.categorie || ''] || 'alte'
    const { data, error } = await supabase.from('cheltuieli').insert({
      apartament_id: f.apartament_id || null,
      categorie: colKey,
      descriere: `${f.categorieLabel} — ${f.furnizor}`,
      valoare: f.suma_totala,
      data: dataScadenta,
      status: 'nevalidat',
      suportat_de: 'administrator',
      tva: 0,
      nota: `Factură ${f.nr_factura || f.filename} | ${f.perioada || ''}`.trim(),
      fisier_url: f.file_url || null,
    }).select().single()

    if (error) { show('error', error.message) }
    else {
      setFacturi(list => list.map(x => x.id === f.id ? { ...x, status: 'salvat' as const, cheltuiala_id: data.id } : x))
      show('success', `${f.categorieLabel} ${f.suma_totala} RON salvat în cheltuieli`)
      loadSaved()
    }
    setSaving(null)
  }

  function removeFactura(id: string) {
    setFacturi(f => f.filter(x => x.id !== id))
  }

  const glassCard: React.CSSProperties = {
    background: 'rgba(20,38,65,0.6)',
    border: '1px solid rgba(100,160,255,0.15)',
    borderRadius: 14,
    backdropFilter: 'blur(12px)',
  }

  if(loadError)return(<><PageHeader title="Facturi & Documente"/><ConnectionError onRetry={()=>loadSaved()}/></>)

  return (
    <>
      <PageHeader title="Facturi & Documente" subtitle="Încarcă și extrage automat datele din facturi"/>

      <div style={{ flex:1, overflowY:'auto', padding:'0 24px 40px' }}>

        {/* ── Drop zone ── */}
        <div
          ref={dropRef}
          onDragOver={e=>{e.preventDefault();setDragging(true)}}
          onDragLeave={()=>setDragging(false)}
          onDrop={onDrop}
          onClick={()=>fileRef.current?.click()}
          style={{
            ...glassCard,
            marginBottom: 24,
            padding: '40px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            cursor: 'pointer', transition: 'all .2s',
            border: `2px dashed ${dragging ? 'rgba(77,163,255,0.6)' : 'rgba(100,160,255,0.2)'}`,
            background: dragging ? 'rgba(77,163,255,0.08)' : 'rgba(20,38,65,0.4)',
          }}
        >
          <div style={{ width:52, height:52, borderRadius:14, background:'rgba(77,163,255,0.12)', border:'1px solid rgba(77,163,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Upload size={24} color="var(--accent-blue)"/>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:15, fontWeight:500, color:'var(--text)', marginBottom:4 }}>Trage facturile aici sau click pentru a selecta</div>
            <div style={{ fontSize:12, color:'rgba(159,215,255,0.45)' }}>PDF, JPG, PNG — E.ON, Urbica, TermoService, Salubris, Orange, Vodafone, Royal și altele</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,image/*" multiple onChange={e=>handleFiles(e.target.files)} style={{display:'none'}}/>
        </div>

        {/* ── Facturi procesate ── */}
        {facturi.length > 0 && (
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:11, fontWeight:500, color:'rgba(159,215,255,0.45)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12 }}>
              Facturi procesate — {facturi.length}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {facturi.map(f => {
                const color = FURNIZOR_COLORS[f.categorieLabel] || '#94A3B8'
                const isSaving = saving === f.id
                return (
                  <div key={f.id} style={{ ...glassCard, overflow:'hidden', borderLeft:`3px solid ${f.status==='salvat'?'#4ADE80':f.status==='eroare'?'#F87171':color}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px' }}>
                      {/* icon */}
                      <div style={{ width:40, height:40, borderRadius:10, background:`${color}18`, border:`1px solid ${color}33`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {f.processing
                          ? <Loader size={18} color={color} style={{ animation:'spin 1s linear infinite' }}/>
                          : f.status==='eroare'
                          ? <AlertCircle size={18} color="#F87171"/>
                          : <FileText size={18} color={color}/>
                        }
                      </div>

                      {/* info */}
                      <div style={{ flex:1, minWidth:0 }}>
                        {f.processing ? (
                          <div style={{ fontSize:13, color:'rgba(159,215,255,0.5)' }}>Se procesează {f.filename}...</div>
                        ) : (
                          <>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                              <select
                                value={f.categorieLabel||''}
                                onChange={e => setFacturi(list => list.map(x => x.id===f.id ? {...x, categorieLabel: e.target.value} : x))}
                                style={{ fontSize:11, fontWeight:600, color, background:`${color}18`, padding:'2px 8px', borderRadius:5, textTransform:'uppercase' as const, letterSpacing:'.04em', border:`1px solid ${color}40`, outline:'none', cursor:'pointer' }}
                              >
                                {['E.ON Energie','E.ON Gaz','E.ON DUO','Urbica','TermoService','Salubris','Internet','Asociatie','Royal','Alta'].map(c=>(
                                  <option key={c} value={c} style={{ background:'#0E1B2B', color:'#E8F4FF', textTransform:'none' }}>{c}</option>
                                ))}
                              </select>
                              <span style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{f.furnizor}</span>
                              {f.nr_factura && <span style={{ fontSize:11, color:'rgba(159,215,255,0.35)' }}>#{f.nr_factura}</span>}
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                              <span style={{ fontSize:18, fontWeight:700, color: f.status==='salvat'?'#4ADE80': color, letterSpacing:'-.5px' }}>
                                {f.suma_totala?.toLocaleString('ro-RO',{minimumFractionDigits:2})} <span style={{ fontSize:11, fontWeight:400 }}>RON</span>
                              </span>
                              {f.apartament_id && (() => {
                                const apt = apts.find((a:any) => a.id === f.apartament_id)
                                const label = apt ? (apt.nota ? `[${apt.nota}] ${apt.nume}` : apt.nume) : null
                                if (!label) return null
                                return (
                                  <span style={{ fontSize:10, padding:'2px 8px', borderRadius:5, background:(f as any)._autoMatched?'rgba(74,222,128,0.12)':'rgba(77,163,255,0.12)', border:`1px solid ${(f as any)._autoMatched?'rgba(74,222,128,0.3)':'rgba(77,163,255,0.3)'}`, color:(f as any)._autoMatched?'#4ADE80':'#7BC8FF', fontWeight:600 }}>
                                    {(f as any)._autoMatched ? '✓ ' : '📍 '}{label}
                                  </span>
                                )
                              })()}
                            {f.file_url && (
                                <a href={f.file_url} target="_blank" rel="noopener"
                                  style={{ fontSize:10, padding:'2px 8px', borderRadius:5, background:'rgba(77,163,255,0.08)', border:'1px solid rgba(77,163,255,0.25)', color:'#7BC8FF', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:3 }}>
                                  📄 Deschide
                                </a>
                              )}
                            {f.data_emitere && <span style={{ fontSize:11, color:'rgba(159,215,255,0.35)' }}>emis: {f.data_emitere}</span>}
                            {f.data_scadenta && <span style={{ fontSize:11, color:'rgba(159,215,255,0.45)' }}>scad. {f.data_scadenta}</span>}
                              {f.perioada && <span style={{ fontSize:11, color:'rgba(159,215,255,0.35)' }}>{f.perioada}</span>}
                            </div>
                          </>
                        )}
                      </div>

                      {/* apartament selector - vizibil si la eroare pentru corectare */}
                      {!f.processing && f.status !== 'salvat' && (
                        <div style={{ flexShrink:0 }}>
                          <select
                            value={f.apartament_id || ''}
                            onChange={e => setFacturi(list => list.map(x => x.id===f.id ? {...x, apartament_id: e.target.value||null} : x))}
                            style={{ background: f.status==='eroare' ? 'rgba(40,20,20,0.9)' : 'rgba(20,38,65,0.8)', border:`1px solid ${f.status==='eroare'?'rgba(248,113,113,0.4)':'rgba(100,160,255,0.2)'}`, borderRadius:7, color:'rgba(159,215,255,0.7)', fontSize:12, padding:'6px 10px', outline:'none', maxWidth:160 }}
                          >
                            <option value="">— Selectează apartament —</option>
                            {[...apts].sort((a:any,b:any)=>(a.nota||a.nume||'').localeCompare(b.nota||b.nume||'')).map((a:any)=><option key={a.id} value={a.id}>{a.nota||a.nume}</option>)}
                            {apts.filter((a:any)=>a.status!=='activ').length>0&&<option disabled>── Alte locații ──</option>}
                            {[...apts].filter((a:any)=>a.status!=='activ').sort((a:any,b:any)=>(a.nota||a.nume||'').localeCompare(b.nota||b.nume||'')).map((a:any)=><option key={a.id} value={a.id}>{a.nota||a.nume}</option>)}
                          </select>
                        </div>
                      )}

                      {/* actiuni */}
                      {!f.processing && (
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          {f.status !== 'salvat' && f.status !== 'eroare' && (
                            <button
                              onClick={() => saveToSupabase(f)}
                              disabled={!!isSaving || !f.apartament_id}
                              title={!f.apartament_id ? 'Selectează apartamentul mai întâi' : ''}
                              style={{
                                display:'flex', alignItems:'center', gap:5, padding:'7px 16px',
                                borderRadius:8, border:`1px solid ${f.apartament_id ? 'rgba(74,222,128,0.4)' : 'rgba(159,215,255,0.15)'}`,
                                background: f.apartament_id ? 'rgba(74,222,128,0.12)' : 'rgba(159,215,255,0.04)',
                                color: f.apartament_id ? '#4ADE80' : 'rgba(159,215,255,0.3)',
                                cursor: f.apartament_id ? 'pointer' : 'not-allowed',
                                fontSize:12, fontWeight: f.apartament_id ? 600 : 400,
                                opacity: isSaving ? 0.5 : 1, transition:'all .15s',
                              }}
                            >
                              {isSaving ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : null}
                              {isSaving ? 'Se salvează...' : f.apartament_id ? (() => {
                                const apt = apts.find((a:any) => a.id === f.apartament_id)
                                const aptLabel = apt?.nota || apt?.nume || '?'
                                const catMap: Record<string,string> = {
                                  'E.ON Gaz':'Gaz','E.ON Curent':'Curent','Urbica':'Asociație',
                                  'TermoService':'Asociație','Salubris':'Salubris','Internet':'Internet',
                                  'Asociatie':'Asociație','Royal':'Asociație',
                                }
                                const catLabel = catMap[f.categorieLabel] || f.categorieLabel || 'Cheltuieli'
                                return `✓ → ${aptLabel} / ${catLabel}`
                              })() : 'Selectează apartament'}
                            </button>
                          )}
                          {f.status === 'eroare' && (
                            <button
                              onClick={() => saveForcedToSupabase(f)}
                              disabled={!!isSaving || !f.apartament_id}
                              title={!f.apartament_id ? 'Selectează mai întâi apartamentul' : 'Salvează ignorând eroarea de duplicat'}
                              style={{
                                display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                                borderRadius:8, border:'1px solid rgba(252,211,77,0.4)',
                                background: f.apartament_id ? 'rgba(252,211,77,0.12)' : 'rgba(159,215,255,0.04)',
                                color: f.apartament_id ? '#FCD34D' : 'rgba(159,215,255,0.3)',
                                cursor: f.apartament_id ? 'pointer' : 'not-allowed',
                                fontSize:12, fontWeight:600, opacity: isSaving ? 0.5 : 1,
                              }}
                            >
                              {isSaving ? <Loader size={12} style={{ animation:'spin 1s linear infinite' }}/> : '✏️'}
                              {isSaving ? 'Se salvează...' : 'Salvează manual'}
                            </button>
                          )}
                          {f.status === 'salvat' && (
                            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:8, background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.25)', color:'#4ADE80', fontSize:12, fontWeight:600 }}>
                              <Check size={12}/>Salvat
                            </div>
                          )}
                          <button onClick={() => removeFactura(f.id!)}
                            style={{ padding:'7px 9px', borderRadius:8, border:'1px solid rgba(248,113,113,0.2)', background:'rgba(248,113,113,0.06)', color:'rgba(248,113,113,0.6)', cursor:'pointer', display:'flex', alignItems:'center' }}>
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* detalii expandate */}
                    {!f.processing && f.detalii && (
                      <div style={{ padding:'8px 18px 12px', borderTop:'1px solid rgba(100,160,255,0.08)', fontSize:11, color:'rgba(159,215,255,0.35)' }}>
                        {f.detalii}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Arhivă facturi — grupate pe apartament ── */}
        {loadingArchiva && (
          <div style={{...glassCard,padding:'24px',textAlign:'center',color:'rgba(159,215,255,0.4)',fontSize:13}}>Se încarcă arhiva de facturi...</div>
        )}
        {!loadingArchiva && savedFacturi.length===0 && (
          <div style={{...glassCard,padding:'24px',textAlign:'center',color:'rgba(159,215,255,0.4)',fontSize:13}}>Nicio factură salvată încă</div>
        )}
        {savedFacturi.length > 0 && (()=>{
          // Grupeaza pe apartament_id
          const filteredFacturi = searchArchiva
            ? savedFacturi.filter(f =>
                (f.descriere||'').toLowerCase().includes(searchArchiva.toLowerCase()) ||
                (f.nota||'').toLowerCase().includes(searchArchiva.toLowerCase()) ||
                (f.categorie||'').toLowerCase().includes(searchArchiva.toLowerCase()) ||
                String(f.valoare||'').includes(searchArchiva)
              )
            : savedFacturi
          const grouped: Record<string, any[]> = {}
          for (const f of filteredFacturi) {
            const key = f.apartament_id || '__fara__'
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(f)
          }
          return (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, gap:10, flexWrap:'wrap' as const }}>
                <div style={{ fontSize:11, fontWeight:500, color:'rgba(159,215,255,0.45)', textTransform:'uppercase', letterSpacing:'.08em' }}>
                  Arhivă facturi — {savedFacturi.length} total
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input
                    value={searchArchiva}
                    onChange={e=>setSearchArchiva(e.target.value)}
                    placeholder="🔍 Caută factură..."
                    style={{ background:'rgba(20,38,65,0.8)', border:'1px solid rgba(100,160,255,0.2)', borderRadius:8, color:'rgba(214,228,244,0.8)', fontSize:12, padding:'6px 12px', outline:'none', width:180 }}
                  />
                  <button onClick={sincronizeazaToate} disabled={syncingAll}
                    style={{ padding:'6px 14px', borderRadius:8, border:'1px solid rgba(77,163,255,0.4)', background:'rgba(77,163,255,0.12)', color:'#7BC8FF', fontSize:12, fontWeight:600, cursor:'pointer', opacity:syncingAll?0.6:1 }}>
                    {syncingAll ? '⏳ Sincronizare...' : '⟳ Sincronizează în Cheltuieli'}
                  </button>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {Object.entries(grouped).map(([aptId, items]) => {
                  const apt = apts.find(a => a.id === aptId)
                  const aptLabel = apt ? (apt.nota ? `[${apt.nota}] ${apt.nume}` : apt.nume) : 'Fără apartament'
                  const total = items.reduce((s,i) => s + Number(i.valoare), 0)
                  return (
                    <div key={aptId} style={{ ...glassCard, overflow:'hidden' }}>
                      {/* Header apartament */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'rgba(11,18,32,0.5)', borderBottom:'1px solid rgba(100,160,255,0.1)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          {apt?.nota && <span style={{ fontSize:11, fontWeight:600, color:'var(--accent-blue)', background:'rgba(77,163,255,0.12)', padding:'2px 8px', borderRadius:5 }}>{apt.nota}</span>}
                          <span style={{ fontSize:13, fontWeight:600, color:'#E8F4FF' }}>{aptLabel}</span>
                          <span style={{ fontSize:11, color:'rgba(159,215,255,0.4)' }}>{items.length} facturi</span>
                        </div>
                        <span style={{ fontSize:13, fontWeight:600, color:'#FCD34D', fontFamily:'monospace' }}>{total.toLocaleString('ro-RO')} RON</span>
                      </div>
                      {/* Randuri facturi */}
                      {items.map((f,i) => (
                        <div key={f.id} style={{ display:'grid', gridTemplateColumns:'1fr 100px 110px 90px auto', padding:'10px 16px', borderBottom: i<items.length-1?'1px solid rgba(100,160,255,0.05)':'none', alignItems:'center', gap:10 }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{f.descriere}</div>
                            {f.nota && <div style={{ fontSize:10, color:'rgba(159,215,255,0.3)', marginTop:1 }}>{f.nota}</div>}
                          </div>
                          <div style={{ fontSize:11, color:'rgba(159,215,255,0.5)', fontFamily:'monospace' }}>{f.data}</div>
                          <div style={{ fontSize:13, fontWeight:600, color:'#E8F4FF', fontFamily:'monospace' }}>{Number(f.valoare).toLocaleString('ro-RO')} RON</div>
                          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:5, background: f.status==='validat'?'rgba(74,222,128,0.12)':'rgba(252,211,77,0.1)', color: f.status==='validat'?'#4ADE80':'#FCD34D', fontWeight:500, textAlign:'center' as const }}>
                            {f.status==='validat'?'Plătit':'Neachitat'}
                          </span>
                          <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                            {f.fisier_url && (<>
                              <a href={f.fisier_url} target="_blank" rel="noopener"
                                title="Deschide factura"
                                style={{ width:28, height:28, borderRadius:6, border:'1px solid rgba(77,163,255,0.25)', background:'rgba(77,163,255,0.08)', color:'#7BC8FF', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }}>
                                📄
                              </a>
                              <a href={f.fisier_url} download
                                title="Descarcă factura"
                                style={{ width:28, height:28, borderRadius:6, border:'1px solid rgba(74,222,128,0.25)', background:'rgba(74,222,128,0.08)', color:'#4ADE80', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', fontSize:13 }}>
                                ⬇
                              </a>
                            </>)}
                            <button
                              onClick={() => { setEditArchiva(f); setEditArchivaForm({apartament_id:f.apartament_id||'',valoare:String(f.valoare),status:f.status,data:f.data||''}) }}
                              title="Editează"
                              style={{ width:28, height:28, borderRadius:6, border:'1px solid rgba(252,211,77,0.25)', background:'rgba(252,211,77,0.08)', color:'#FCD34D', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>
                              ✏️
                            </button>
                            <button onClick={() => deleteFacturaSalvata(f.id)}
                              title="Șterge"
                              style={{ width:28, height:28, borderRadius:6, border:'1px solid rgba(248,113,113,0.2)', background:'rgba(248,113,113,0.06)', color:'rgba(248,113,113,0.6)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

      </div>

      {/* Modal editare arhiva */}
      {editArchiva && (
        <div onClick={()=>setEditArchiva(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:380,background:'rgba(8,18,36,0.99)',border:'1px solid rgba(100,160,255,0.25)',borderRadius:14,padding:'22px' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18 }}>
              <div>
                <div style={{ fontSize:14,fontWeight:700,color:'#FCD34D' }}>✏️ Editează factură</div>
                <div style={{ fontSize:11,color:'rgba(159,215,255,0.4)',marginTop:2 }}>{editArchiva.descriere}</div>
              </div>
              <button onClick={()=>setEditArchiva(null)} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(159,215,255,0.4)',fontSize:18 }}>✕</button>
            </div>
            {/* Apartament */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>Apartament</div>
              <select value={editArchivaForm.apartament_id} onChange={e=>setEditArchivaForm(f=>({...f,apartament_id:e.target.value}))}
                style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}>
                <option value="">— Fără apartament —</option>
                {[...apts].sort((a:any,b:any)=>(a.nota||a.nume||'').localeCompare(b.nota||b.nume||'')).map((a:any)=>(
                  <option key={a.id} value={a.id}>{a.nota ? `[${a.nota}] ` : ''}{a.nume}{a.status!=='activ'?' ⚠':''}</option>
                ))}
              </select>
            </div>
            {/* Valoare + Data */}
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12 }}>
              <div>
                <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>Valoare (RON)</div>
                <input type="number" value={editArchivaForm.valoare} onChange={e=>setEditArchivaForm(f=>({...f,valoare:e.target.value}))} min={0}
                  style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}/>
              </div>
              <div>
                <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>Data scadență</div>
                <input type="date" value={editArchivaForm.data} onChange={e=>setEditArchivaForm(f=>({...f,data:e.target.value}))}
                  style={{ width:'100%',background:'rgba(20,38,65,0.8)',border:'1px solid rgba(100,160,255,0.2)',borderRadius:8,color:'rgba(214,228,244,0.9)',fontSize:13,padding:'8px 10px',outline:'none' }}/>
              </div>
            </div>
            {/* Status */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:10,color:'rgba(159,215,255,0.45)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.06em' }}>Status plată</div>
              <div style={{ display:'flex',gap:8 }}>
                {['nevalidat','validat'].map(s=>(
                  <button key={s} onClick={()=>setEditArchivaForm(f=>({...f,status:s}))}
                    style={{ flex:1,padding:'8px',borderRadius:8,border:`1px solid ${editArchivaForm.status===s?(s==='validat'?'rgba(74,222,128,0.5)':'rgba(252,211,77,0.5)'):'rgba(159,215,255,0.15)'}`,background:editArchivaForm.status===s?(s==='validat'?'rgba(74,222,128,0.12)':'rgba(252,211,77,0.1)'):'transparent',color:editArchivaForm.status===s?(s==='validat'?'#4ADE80':'#FCD34D'):'rgba(159,215,255,0.4)',fontSize:12,fontWeight:600,cursor:'pointer' }}>
                    {s==='validat'?'✓ Plătit':'⏳ Neachitat'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:'flex',gap:8 }}>
              <button onClick={saveEditArchiva} disabled={saving==='archiva-edit'}
                style={{ flex:1,padding:'10px',borderRadius:9,border:'none',background:'rgba(252,211,77,0.8)',color:'#0E1B2B',fontSize:13,fontWeight:700,cursor:'pointer' }}>
                {saving==='archiva-edit'?'Se salvează...':'💾 Salvează modificările'}
              </button>
              <button onClick={()=>setEditArchiva(null)}
                style={{ padding:'10px 16px',borderRadius:9,border:'1px solid rgba(159,215,255,0.15)',background:'transparent',color:'rgba(159,215,255,0.5)',fontSize:13,cursor:'pointer' }}>
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <Toast toast={toast}/>
    </>
  )
}
