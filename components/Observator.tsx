'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// Observatorul ERP-ului (cerut direct: „AI-ul și sistemul să citească și să urmărească tot ce facem în ERP, să vedem
// dacă putem forma automatizări și unde — acum doar să observe”). Noteaza discret, fara sa schimbe nimic:
//  - paginile deschise si cat timp stai pe ele (doar cat tabul e vizibil)
//  - click-urile pe butoane / linkuri (eticheta lor), alegerile din liste, deschiderile de WhatsApp
//  - fiecare scriere in baza de date (tabel, operatie, campuri; valori doar pentru statusuri) - vezi lib/supabase.ts
//  - intrebarile catre Asistent si erorile din pagina
// NU noteaza ce tastezi in campuri. Evenimentele pleaca in pachete la /api/observator -> tabela jurnal_activitate;
// daca serverul nu le primeste (ex. tabela inca necreata) raman in browser si se retrimit, nu se pierd.

type Ev = { eid?: string; tip: string; ts: number; pagina?: string; tinta?: string; detalii?: any; sesiune?: string; rol?: string; dispozitiv?: string }
const CHEIE_COADA = 'observator_coada'
const MAX_COADA = 1500

function sesiune() {
  try { let s = sessionStorage.getItem('observator_sesiune'); if (!s) { s = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); sessionStorage.setItem('observator_sesiune', s) } return s } catch { return 'fara' }
}
function dispozitiv() {
  const ua = navigator.userAgent
  const tip = matchMedia('(max-width: 768px)').matches ? 'telefon' : 'desktop'
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'alt'
  return `${tip} · ${br}`
}
function eticheta(el: Element): string {
  const t = (el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLElement).innerText || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim()
  return t.slice(0, 80)
}

export default function Observator() {
  const pathname = usePathname()
  const coada = useRef<Ev[]>([])
  const pagina = useRef<{ cale: string; start: number; vizibil: number; ultimVizibil: number | null } | null>(null)
  const ctx = useRef({ sesiune: '', rol: '', dispozitiv: '' })
  const contor = useRef(0)

  const adauga = (e: Omit<Ev, 'ts'> & { ts?: number }) => {
    contor.current++
    coada.current.push({ eid: `${ctx.current.sesiune}-${contor.current}-${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), pagina: window.location.pathname, ...e, ...ctx.current })
    if (coada.current.length > MAX_COADA) coada.current.splice(0, coada.current.length - MAX_COADA)
  }

  // coada locala (localStorage) = sursa de adevar: evenimentele raman acolo pana confirma serverul; fiecare are un
  // id unic (eid), deci o retrimitere nu creeaza dubluri (serverul le ignora pe cele deja primite)
  const inZbor = useRef(false)
  const citeste = (): Ev[] => { try { return JSON.parse(localStorage.getItem(CHEIE_COADA) || '[]') } catch { return [] } }
  const scrie = (l: Ev[]) => { try { localStorage.setItem(CHEIE_COADA, JSON.stringify(l.slice(-MAX_COADA))) } catch {} }
  const trimite = () => {
    if (coada.current.length) { scrie([...citeste(), ...coada.current]); coada.current = [] }
    if (inZbor.current) return
    const pachet = citeste().slice(0, 400)
    if (!pachet.length) return
    inZbor.current = true
    const corp = JSON.stringify({ evenimente: pachet })
    fetch('/api/observator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corp, keepalive: corp.length < 60000 })
      .then(r => { if (r.ok) { const trimise = new Set(pachet.map(e => e.eid)); scrie(citeste().filter(e => !trimise.has(e.eid))) } })
      .catch(() => {})
      .finally(() => { inZbor.current = false })
  }

  // pornire: context + ascultatori
  useEffect(() => {
    ctx.current = { sesiune: sesiune(), rol: window.location.pathname.startsWith('/staff') ? 'staff' : 'admin', dispozitiv: dispozitiv() }

    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element)?.closest?.('a,button,[role="button"],input[type="checkbox"],input[type="radio"],summary,label')
      if (!el) return
      const href = el.tagName === 'A' ? (el as HTMLAnchorElement).getAttribute('href') || '' : ''
      if (/wa\.me|whatsapp/i.test(href)) {
        const nr = (href.match(/wa\.me\/(\d+)/) || [])[1] || ''
        const text = decodeURIComponent((href.split('text=')[1] || '').replace(/\+/g, ' ')).slice(0, 160)
        adauga({ tip: 'whatsapp', tinta: eticheta(el) || 'WhatsApp', detalii: { nr: nr ? '…' + nr.slice(-4) : null, inceput_mesaj: text || null } })
        return
      }
      const zona = el.closest('[role="dialog"],.rz,.ag-panel,aside,nav,header,table')
      adauga({ tip: 'click', tinta: eticheta(el) || el.tagName.toLowerCase(), detalii: {
        el: el.tagName.toLowerCase(), href: href && !href.startsWith('javascript') ? href.slice(0, 120) : undefined,
        zona: zona ? (zona.tagName.toLowerCase() + (zona.className && typeof zona.className === 'string' ? '.' + zona.className.split(' ')[0] : '')) : undefined,
        bifat: (el as HTMLInputElement).type === 'checkbox' ? (el as HTMLInputElement).checked : undefined,
      } })
    }
    const onChange = (e: Event) => {
      const el = e.target as HTMLSelectElement
      if (el?.tagName !== 'SELECT') return
      // numele listei: aria-label / name / prima optiune (ex. „Toate canalele”)
      const lbl = el.getAttribute('aria-label') || el.name || el.options[0]?.text || ''
      adauga({ tip: 'alegere', tinta: (lbl || el.name || 'listă').replace(/\s+/g, ' ').trim().slice(0, 60), detalii: { valoare: el.options[el.selectedIndex]?.text?.slice(0, 60) } })
    }
    const onScriere = (e: Event) => { const d = (e as CustomEvent).detail; adauga({ tip: 'scriere', tinta: `${d.tabel} · ${d.op}`, detalii: d }) }
    const onEveniment = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.tip) adauga(d) }
    const onEroare = (e: ErrorEvent) => adauga({ tip: 'eroare', tinta: String(e.message || 'eroare').slice(0, 200), detalii: { sursa: (e.filename || '').split('/').pop(), linie: e.lineno } })
    const onRespins = (e: PromiseRejectionEvent) => adauga({ tip: 'eroare', tinta: String((e.reason as any)?.message || e.reason || 'promisiune respinsa').slice(0, 200) })
    const onVizibil = () => {
      const p = pagina.current
      if (p) { if (document.hidden) { if (p.ultimVizibil) { p.vizibil += Date.now() - p.ultimVizibil; p.ultimVizibil = null } } else p.ultimVizibil = Date.now() }
      if (document.hidden) trimite()
    }
    const onIesire = () => { inchidePagina(); trimite() }

    document.addEventListener('click', onClick, true)
    document.addEventListener('change', onChange, true)
    window.addEventListener('observator:scriere', onScriere)
    window.addEventListener('observator:eveniment', onEveniment)
    window.addEventListener('error', onEroare)
    window.addEventListener('unhandledrejection', onRespins)
    document.addEventListener('visibilitychange', onVizibil)
    window.addEventListener('pagehide', onIesire)
    const int = setInterval(() => trimite(), 20000)
    const prima = setTimeout(() => trimite(), 4000)
    return () => {
      document.removeEventListener('click', onClick, true); document.removeEventListener('change', onChange, true)
      window.removeEventListener('observator:scriere', onScriere); window.removeEventListener('observator:eveniment', onEveniment)
      window.removeEventListener('error', onEroare); window.removeEventListener('unhandledrejection', onRespins)
      document.removeEventListener('visibilitychange', onVizibil); window.removeEventListener('pagehide', onIesire)
      clearInterval(int); clearTimeout(prima)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function inchidePagina() {
    const p = pagina.current
    if (!p) return
    const vizibil = p.vizibil + (p.ultimVizibil ? Date.now() - p.ultimVizibil : 0)
    adauga({ tip: 'pagina', pagina: p.cale, tinta: p.cale, ts: p.start, detalii: { secunde_vizibil: Math.round(vizibil / 1000), secunde_total: Math.round((Date.now() - p.start) / 1000) } })
    pagina.current = null
  }

  // schimbare de pagina: inchidem pagina anterioara (cu timpul petrecut) si o pornim pe cea noua
  useEffect(() => {
    inchidePagina()
    pagina.current = { cale: pathname + (window.location.search || ''), start: Date.now(), vizibil: 0, ultimVizibil: document.hidden ? null : Date.now() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return null
}
