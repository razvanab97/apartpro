'use client'
import { useEffect, useMemo, useState } from 'react'

// "Mesaje pe rand" (cerut direct, varianta de telefon aleasa): un singur mesaj pe ecran, gata scris,
// cu un buton mare "Trimite pe WhatsApp" care il marcheaza trimis si aduce urmatorul. File dupa
// momentul zilei + "Numere lipsa" (rezervarile din urmatoarele zile fara telefon, ca sa le completezi
// din timp, nu in ziua sosirii). Datele si actiunile vin din Dashboard (aceleasi sabloane/override-uri).
export type MesajRand = {
  id: string; rawId: string; categorie: string; titluCategorie: string; nume: string; nota?: string; linie2?: string
  telefon: string; mesaj: string; faraTelefon?: boolean; trimis: boolean; apt?: string
}
export type NumarLipsa = { id: string; nume_client: string; data_checkin: string; data_checkout: string; canal: string; nota?: string; apt?: string }
export type FilaMesaje = 'dim' | 'sos' | 'prop' | 'numere'

const FILE: { k: FilaMesaje; t: string }[] = [
  { k: 'dim', t: 'Dimineața' }, { k: 'sos', t: 'Sosiri' }, { k: 'prop', t: 'Proprietari' }, { k: 'numere', t: 'Numere lipsă' },
]
export const filaMesaj = (c: string): FilaMesaje => c === 'checkout' ? 'dim' : (c === 'checkin' || c === 'gata') ? 'sos' : 'prop'
const ORD: Record<string, number> = { checkout: 0, checkin: 1, gata: 2, 'prop-nou': 3, 'prop-ci': 4, 'prop-co': 5 }
const KIND: Record<string, { l: string; c: string; bg: string }> = {
  checkout: { l: 'Checkout', c: '#C084FC', bg: 'rgba(192,132,252,0.14)' },
  checkin: { l: 'Confirmare', c: '#FCD34D', bg: 'rgba(252,211,77,0.12)' },
  gata: { l: 'Date acces', c: '#7BC8FF', bg: 'rgba(77,163,255,0.14)' },
}
const fmtZi = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'][m-1]}` }

export default function MesajePeRand(p: {
  tasks: MesajRand[]
  numereLipsa: NumarLipsa[]
  telSugestii: Record<string, string>
  filaInitiala?: FilaMesaje
  traducandId: string | null
  waLink: (tel: string, msg: string) => string
  onTrimis: (t: MesajRand) => void
  onNuAzi: (id: string) => void
  onAnuleazaNuAzi: (id: string) => void
  // mesajele scoase azi: sterse de tine (se pot readuce) sau scoase automat (apartament eliberat in Curatenie)
  sterse?: { id: string; nume: string; nota?: string; apt?: string; titluCategorie: string; motiv: 'sters' | 'eliberat' }[]
  trimiseOrdine?: string[]                 // mesajele trimise azi, in ordinea trimiterii (din baza)
  onNetrimis?: (id: string) => void
  onUpdate: (id: string, patch: { telefon?: string; mesaj?: string }) => void
  onTraduce: (t: MesajRand) => void
  onSalveazaTelefon: (t: MesajRand) => void
  onSalveazaNumar: (rezId: string, tel: string) => Promise<boolean>
  onClose: () => void
}) {
  const [fila, setFila] = useState<FilaMesaje>(p.filaInitiala || 'dim')
  const [amanate, setAmanate] = useState<string[]>([])          // "Mai tarziu" -> la coada filei
  const [editez, setEditez] = useState(false)
  const [toast, setToast] = useState<{ msg: string; undoId?: string } | null>(null)
  const [numereInput, setNumereInput] = useState<Record<string, string>>({})
  const [salvate, setSalvate] = useState<Record<string, boolean>>({})
  // "Inapoi la ultimul mesaj" (cerut direct): istoricul mesajelor trimise / amanate in sesiunea asta;
  // revId = mesajul revazut (poate fi deja trimis -> "Retrimite"), altfel cartonasul e capul cozii
  const [istoric, setIstoric] = useState<string[]>([])
  const [revId, setRevId] = useState<string | null>(null)
  // Pozitia in coada filei (cerut direct: "sa putem da next la urmatorul mesaj") - rasfoire fara sa trimiti/amani
  const [poz, setPoz] = useState<Record<string, number>>({})
  const [subProp, setSubProp] = useState<string | null>(null)
  // Mesajul tocmai trimis ramane pe ecran ("✓ Trimis") pana apesi "Urmatorul" (cerut direct: "sa dispara
  // mesajul dupa ce dam la urmatorul, pana atunci sa ramana pe loc") - poti verifica / retrimite
  const [tinut, setTinut] = useState<string | null>(null)
  const [confirmSterge, setConfirmSterge] = useState(false)
  const [aratSterse, setAratSterse] = useState(false)

  const deTrimis = (k: FilaMesaje) => p.tasks
    .filter(t => !t.trimis && filaMesaj(t.categorie) === k)
    .sort((a, b) => (amanate.indexOf(a.id) - amanate.indexOf(b.id)) || (ORD[a.categorie] - ORD[b.categorie]))
  const totalFila = (k: FilaMesaje) => p.tasks.filter(t => filaMesaj(t.categorie) === k)
  const numereRamase = p.numereLipsa.filter(n => !salvate[n.id])
  const revazut = revId ? p.tasks.find(t => t.id === revId) || null : null
  // Proprietari: sub-file separate (cerut direct: "check-in si check-out proprietari sa fie sectiuni diferite,
  // altfel ne incurcam") - Rezervari noi / Check-in azi / Check-out azi, fiecare cu coada ei
  const SUB_PROP: { k: string; t: string; c: string }[] = [
    { k: 'prop-nou', t: 'Rezervări noi', c: '#A78BFA' }, { k: 'prop-ci', t: 'Check-in azi', c: '#34D399' }, { k: 'prop-co', t: 'Check-out azi', c: '#FB923C' },
  ]
  const nSub = (k: string) => deTrimis('prop').filter(t => t.categorie === k).length
  const subActiv = SUB_PROP.find(x => x.k === subProp && nSub(x.k) > 0)?.k || SUB_PROP.find(x => nSub(x.k) > 0)?.k || 'prop-nou'
  const coada = fila === 'numere' ? [] : fila === 'prop' ? deTrimis('prop').filter(t => t.categorie === subActiv) : deTrimis(fila)
  const cheiePoz = fila === 'prop' ? 'prop:' + subActiv : fila
  const idxCoada = coada.length ? Math.min(poz[cheiePoz] || 0, coada.length - 1) : 0
  const tinutTask = tinut ? p.tasks.find(t => t.id === tinut) || null : null
  const curent = fila === 'numere' ? null : (revazut || tinutTask || coada[idxCoada] || null)
  useEffect(() => { setConfirmSterge(false) }, [curent?.id])
  function mergiLa(d: number) {
    setRevId(null); setToast(null)
    if (tinutTask) {
      // mesajul trimis pleaca abia acum; "Urmatorul" = cel care i-a luat locul in coada (acelasi index)
      setTinut(null)
      if (d < 0 && coada.length) setPoz(x => ({ ...x, [cheiePoz]: (idxCoada - 1 + coada.length) % coada.length }))
      return
    }
    if (!coada.length) return
    setPoz(x => ({ ...x, [cheiePoz]: (idxCoada + d + coada.length) % coada.length }))
  }
  // Istoricul = mesajele trimise azi (din baza, deci si dupa inchidere/reincarcare) + ce ai amanat acum;
  // ordinea = cand s-a trimis/amanat, ultimul la final
  const istoricEf = (() => {
    const tot = [...(p.trimiseOrdine || []), ...istoric]
    return tot.filter((id, i) => tot.lastIndexOf(id) === i && p.tasks.some(t => t.id === id))
  })()
  const idxInapoi = revazut ? istoricEf.lastIndexOf(revazut.id) - 1 : tinutTask ? istoricEf.lastIndexOf(tinutTask.id) - 1 : istoricEf.length - 1
  const tintaInapoi = idxInapoi >= 0 ? p.tasks.find(t => t.id === istoricEf[idxInapoi]) || null : null
  function inapoi() {
    if (!tintaInapoi) return
    setRevId(tintaInapoi.id); setFila(filaMesaj(tintaInapoi.categorie)); setToast(null)
  }
  const total = p.tasks.length, trimise = p.tasks.filter(t => t.trimis).length

  // Prima fila cu ceva de facut, daca cea curenta e goala la deschidere
  useEffect(() => {
    if (fila !== 'numere' && !deTrimis(fila).length) {
      const urm = FILE.find(f => f.k === 'numere' ? numereRamase.length > 0 : deTrimis(f.k).length > 0)
      if (urm) setFila(urm.k)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { setEditez(false) }, [curent?.id, fila])
  useEffect(() => { setTinut(null) }, [fila, subProp])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowRight') { e.preventDefault(); mergiLa(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); mergiLa(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function trimite() {
    if (!curent || !curent.telefon.trim()) return
    window.open(p.waLink(curent.telefon, curent.mesaj), '_blank')
    if (!curent.trimis) p.onTrimis(curent)
    if (revazut) { setRevId(null); setToast({ msg: `Retrimis: ${curent.nume}` }); return }
    if (tinutTask) { setToast({ msg: `Retrimis: ${curent.nume}` }); return }
    setIstoric(h => [...h.filter(x => x !== curent.id), curent.id])
    setTinut(curent.id)
    setToast({ msg: `Trimis: ${curent.nume} — apasă „Următorul” când ești gata` })
  }
  function maiTarziu() {
    if (!curent) return
    if (revazut) { setRevId(null); setToast(null); return }   // in revizuire: "Inapoi la coada"
    if (tinutTask) { mergiLa(1); return }                       // deja trimis -> doar treci mai departe
    setIstoric(h => [...h.filter(x => x !== curent.id), curent.id])
    setAmanate(a => [...a.filter(x => x !== curent.id), curent.id])
    setToast({ msg: `${curent.nume} — mutat la coada filei` })
  }
  // „Șterge mesajul” (cerut direct: „să apară și șterge mesaj pentru un oaspete, dacă nu mai trebuie trimis”) -
  // scos din coada de azi pe toate dispozitivele (salvat in baza); se poate readuce din „Șterse azi”
  function nuAzi() {
    if (!curent) return
    setRevId(null); setConfirmSterge(false)
    p.onNuAzi(curent.id)
    setToast({ msg: `${curent.nume} — mesaj șters pentru azi`, undoId: curent.id })
  }

  const urmFila = FILE.find(f => f.k !== fila && (f.k === 'numere' ? numereRamase.length > 0 : deTrimis(f.k).length > 0))
  const K = curent ? (KIND[curent.categorie] || { l: curent.titluCategorie.replace('Proprietar · ', ''), c: '#A78BFA', bg: 'rgba(167,139,250,0.14)' }) : null
  const btn: React.CSSProperties = { border: 'none', background: 'transparent', color: 'rgba(159,215,255,0.55)', fontSize: 12, fontWeight: 700, padding: '6px 4px', cursor: 'pointer' }

  return (
    <div className="mpr-overlay" onClick={p.onClose}>
      <style>{`
        .mpr-overlay{position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px}
        .mpr-sheet{background:#060D18;border:1px solid rgba(159,215,255,.18);border-radius:22px;width:100%;max-width:460px;height:min(92vh,860px);display:flex;flex-direction:column;overflow:hidden}
        @media (max-width:600px){.mpr-overlay{padding:0;align-items:stretch}.mpr-sheet{max-width:none;max-height:none;height:100%;border-radius:0;border:none}}
        .mpr-sheet>*:not(.mpr-content),.mpr-content>*:not(.mpr-card),.mpr-card>*:not(.mpr-text){flex-shrink:0}
        .mpr-tab{border:none;background:transparent;border-radius:8px;padding:6px 2px;font-size:11.5px;font-weight:700;color:rgba(159,215,255,.5);display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer}
        .mpr-tab.on{background:#12243F;color:#E8F4FF}
      `}</style>
      <div className="mpr-sheet" onClick={e => e.stopPropagation()}>
        {/* Antet + file */}
        <div style={{ padding: '14px 16px 10px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid rgba(159,215,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#E8F4FF', flex: 1 }}>Mesaje de azi</div>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(159,215,255,0.5)' }}>{trimise}/{total} trimise</span>
            <button onClick={p.onClose} aria-label="Închide" style={{ ...btn, fontSize: 18, padding: '0 4px' }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 3, background: '#0E1B30', borderRadius: 11, padding: 3 }}>
            {FILE.map(f => {
              const n = f.k === 'numere' ? numereRamase.length : deTrimis(f.k).length
              const gol = f.k !== 'numere' && totalFila(f.k).length === 0
              return (
                <button key={f.k} className={'mpr-tab' + (fila === f.k ? ' on' : '')} onClick={() => setFila(f.k)}>
                  {f.t}
                  <small style={{ fontFamily: 'monospace', fontSize: 10.5, fontWeight: 600, color: n ? (f.k === 'numere' ? '#F87171' : '#FCD34D') : '#4ADE80' }}>{gol ? '—' : n ? n : '✓'}</small>
                </button>
              )
            })}
          </div>
        </div>

        {/* Continut */}
        <div className="mpr-content" style={{ flex: 1, minHeight: 0, overflowY: fila === 'numere' || !curent ? 'auto' : 'hidden', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {fila === 'prop' && !revazut && deTrimis('prop').length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {SUB_PROP.map(x => {
                const n = nSub(x.k), on = x.k === subActiv
                return (
                  <button key={x.k} onClick={() => { setSubProp(x.k); setToast(null) }} disabled={!n}
                    style={{ border: `1px solid ${on ? x.c : 'rgba(159,215,255,0.15)'}`, background: on ? x.c : 'transparent', color: on ? '#04111F' : n ? x.c : 'rgba(159,215,255,0.3)', borderRadius: 10, padding: '7px 4px', fontSize: 11.5, fontWeight: 800, cursor: n ? 'pointer' : 'default' }}>
                    {x.t} · {n}
                  </button>
                )
              })}
            </div>
          )}
          {fila !== 'numere' && (tintaInapoi || revazut) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {tintaInapoi && (
                <button onClick={inapoi} style={{ border: '1px solid rgba(159,215,255,0.25)', background: '#0E1B30', color: '#E8F4FF', borderRadius: 10, padding: '7px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                  ↩ {tintaInapoi.trimis ? 'Ultimul trimis' : 'Ultimul mesaj'} · {tintaInapoi.nume}
                </button>
              )}
              {revazut && <button onClick={() => setRevId(null)} style={{ ...btn, marginLeft: 'auto', color: '#7BC8FF' }}>Coada →</button>}
            </div>
          )}
          {fila === 'numere' ? (
            <>
              <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.55)', lineHeight: 1.5 }}>
                Rezervări din azi și următoarele 3 zile fără număr de telefon (Booking nu le-a trimis). Ia-le din chat-ul platformei acum, ca în ziua sosirii mesajele să fie gata. Numărul se salvează în rezervare.
              </div>
              {numereRamase.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: '#4ADE80', fontWeight: 700 }}>Toate rezervările din următoarele zile au telefon ✓</div>}
              {numereRamase.map(n => {
                const sug = p.telSugestii[n.nume_client]
                const val = numereInput[n.id] ?? ''
                return (
                  <div key={n.id} style={{ background: '#0E1B30', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(n.nota || n.apt) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#4DA3FF', color: '#04111F', borderRadius: 10, padding: '7px 10px' }}>
                        <span>📍</span>
                        {n.nota && <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 800 }}>{n.nota}</span>}
                        {n.apt && <span style={{ fontSize: 13.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.apt}</span>}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: '#E8F4FF' }}>{n.nume_client}</div>
                      <div style={{ fontSize: 11.5, color: 'rgba(159,215,255,0.5)' }}>sosește {fmtZi(n.data_checkin)} · {n.canal}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={val} onChange={e => setNumereInput(x => ({ ...x, [n.id]: e.target.value }))} placeholder="Număr de telefon"
                        style={{ flex: 1, minWidth: 0, background: '#0A1424', border: '1px solid rgba(159,215,255,0.18)', borderRadius: 9, color: '#E8F4FF', fontFamily: 'monospace', fontSize: 13, padding: '8px 10px', outline: 'none' }}/>
                      <button disabled={!val.trim()} onClick={async () => { if (await p.onSalveazaNumar(n.id, val.trim())) { setSalvate(s => ({ ...s, [n.id]: true })); setToast({ msg: `Salvat: ${n.nume_client}` }) } }}
                        style={{ border: 'none', borderRadius: 9, padding: '8px 14px', fontWeight: 800, fontSize: 12, background: val.trim() ? '#4ADE80' : 'rgba(74,222,128,0.15)', color: val.trim() ? '#03250F' : 'rgba(74,222,128,0.5)', cursor: val.trim() ? 'pointer' : 'default' }}>
                        Salvează
                      </button>
                    </div>
                    {sug && !val && (
                      <button onClick={() => setNumereInput(x => ({ ...x, [n.id]: sug }))} style={{ ...btn, alignSelf: 'flex-start', color: '#4ADE80', padding: 0 }}>
                        Folosește {sug} (rezervare anterioară)
                      </button>
                    )}
                  </div>
                )
              })}
            </>
          ) : !curent ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', padding: '40px 10px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#4ADE80' }}>{totalFila(fila).length ? 'Gata aici ✓' : 'Nimic de trimis aici azi'}</div>
              <div style={{ fontSize: 13, color: 'rgba(159,215,255,0.5)' }}>{urmFila ? `Mai ai la „${urmFila.t}”.` : 'Toate mesajele de azi sunt trimise.'}</div>
              {urmFila && <button onClick={() => setFila(urmFila.k)} style={{ border: '1px solid rgba(159,215,255,0.25)', background: 'transparent', color: '#E8F4FF', borderRadius: 12, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' }}>Mergi la {urmFila.t}</button>}
            </div>
          ) : (
            <div className="mpr-card" style={{ background: '#0E1B30', border: '1px solid rgba(159,215,255,0.2)', borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
              {/* Locatia - cel mai vizibil element al cartonasului (cerut direct: "locatia sa aiba o culoare mai evidenta") */}
              {(() => {
                const eProp = fila === 'prop'
                const numeApt = String(curent.apt || (eProp ? '' : curent.linie2) || '').trim()
                return (curent.nota || numeApt) ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: eProp ? (SUB_PROP.find(x => x.k === curent.categorie)?.c || '#A78BFA') : '#4DA3FF', color: '#04111F', borderRadius: 12, padding: '10px 12px' }}>
                    <span style={{ fontSize: 18 }}>📍</span>
                    {curent.nota && <span style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 800, letterSpacing: '.02em' }}>{curent.nota}</span>}
                    {numeApt && <span style={{ fontSize: 15, fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{numeApt}</span>}
                    {K && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: '#04111F', background: 'rgba(255,255,255,0.55)', borderRadius: 20, padding: '4px 9px', whiteSpace: 'nowrap' }}>{K.l}</span>}
                  </div>
                ) : null
              })()}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#E8F4FF', lineHeight: 1.2 }}>{curent.nume}</div>
                  {fila === 'prop' && curent.linie2 && <div style={{ fontSize: 11.5, color: 'rgba(159,215,255,0.5)' }}>{curent.linie2}</div>}
                </div>
                {K && !curent.nota && !curent.apt && !(fila !== 'prop' && curent.linie2) && <span style={{ fontSize: 11, fontWeight: 800, color: K.c, background: K.bg, borderRadius: 20, padding: '4px 9px', whiteSpace: 'nowrap' }}>{K.l}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, background: curent.telefon.trim() ? '#0A1424' : 'rgba(248,113,113,0.1)', border: `1px solid ${curent.telefon.trim() ? 'rgba(159,215,255,0.14)' : 'rgba(248,113,113,0.55)'}`, padding: '7px 10px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(159,215,255,0.5)' }}>Tel.</span>
                <input value={curent.telefon} onChange={e => p.onUpdate(curent.id, { telefon: e.target.value })} placeholder="Scrie numărul (lipsește de la platformă)"
                  style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: '#E8F4FF', fontFamily: 'monospace', fontSize: 13, outline: 'none' }}/>
                {curent.faraTelefon && curent.telefon.trim() && <button onClick={() => { p.onSalveazaTelefon(curent); setToast({ msg: 'Număr salvat în rezervare' }) }} style={{ ...btn, color: '#4ADE80', padding: 0 }}>Salvează</button>}
              </div>
              {curent.faraTelefon && !curent.telefon.trim() && p.telSugestii[curent.nume] && (
                <button onClick={() => p.onUpdate(curent.id, { telefon: p.telSugestii[curent.nume] })} style={{ ...btn, alignSelf: 'flex-start', color: '#4ADE80', padding: 0 }}>
                  Folosește {p.telSugestii[curent.nume]} (rezervare anterioară)
                </button>
              )}
              {editez ? (
                <textarea className="mpr-text" value={curent.mesaj} onChange={e => p.onUpdate(curent.id, { mesaj: e.target.value })} autoFocus
                  style={{ width: '100%', flex: 1, minHeight: 90, background: '#0A1424', border: '1px solid rgba(77,163,255,0.35)', borderRadius: 12, color: '#E8F4FF', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, padding: '10px 12px', resize: 'none', outline: 'none' }}/>
              ) : (
                <div className="mpr-text" onClick={() => setEditez(true)} style={{ background: '#0A1424', border: '1px solid rgba(159,215,255,0.1)', borderRadius: 12, padding: '10px 12px', fontSize: 13, lineHeight: 1.6, color: 'rgba(214,228,244,0.8)', whiteSpace: 'pre-wrap', flex: 1, minHeight: 90, overflowY: 'auto', cursor: 'text' }}>{curent.mesaj}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setEditez(e => !e)} style={btn}>{editez ? '✓ Gata editarea' : '✏️ Editează'}</button>
                <button onClick={() => p.onTraduce(curent)} disabled={p.traducandId === curent.id} style={btn}>{p.traducandId === curent.id ? 'Traduc…' : '🇬🇧 Traduce'}</button>
                {!(revazut?.trimis || tinutTask) && (confirmSterge ? (
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#F87171' }}>
                    Ștergi mesajul?
                    <button onClick={nuAzi} style={{ border: 'none', background: '#EF4444', color: '#FFFFFF', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Da, șterge</button>
                    <button onClick={() => setConfirmSterge(false)} style={{ ...btn, padding: '5px 6px' }}>Nu</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmSterge(true)} title="Nu mai trebuie trimis azi — îl scoate din coadă (se poate readuce din „Șterse azi”)"
                    style={{ ...btn, marginLeft: 'auto', color: '#F87171' }}>🗑 Șterge mesajul</button>
                ))}
              </div>
              {revazut && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: revazut.trimis ? '#4ADE80' : '#FCD34D' }}>{revazut.trimis ? '✓ Mesaj deja trimis — îl poți retrimite' : 'Mesaj amânat — îl poți trimite acum'}</span>
                  {revazut.trimis && p.onNetrimis && (
                    <button onClick={() => { p.onNetrimis!(revazut.id); setRevId(null); setToast({ msg: `${revazut.nume} — înapoi în coadă, netrimis` }) }}
                      style={{ border: '1px solid rgba(252,211,77,0.45)', background: 'rgba(252,211,77,0.1)', color: '#FCD34D', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                      ↺ Marchează netrimis
                    </button>
                  )}
                </div>
              )}
              {tinutTask && <div style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800, color: '#4ADE80' }}>✓ Trimis — rămâne aici până apeși „Următorul”</div>}
              {!revazut && (coada.length > 1 || (tinutTask && coada.length > 0)) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <button onClick={() => mergiLa(-1)} style={{ border: '1px solid rgba(159,215,255,0.22)', background: 'transparent', color: '#E8F4FF', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>‹ Anterior</button>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(159,215,255,0.55)' }}>{tinutTask ? `încă ${coada.length}` : `${idxCoada + 1} / ${coada.length}`}</span>
                  <button onClick={() => mergiLa(1)} style={{ border: '1px solid rgba(77,163,255,0.45)', background: tinutTask ? '#4DA3FF' : 'rgba(77,163,255,0.14)', color: tinutTask ? '#04111F' : '#7BC8FF', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Următorul ›</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Șterse azi: cele sterse de tine (cu „Readu”) + cele scoase automat (apartament eliberat) */}
        {(p.sterse?.length || 0) > 0 && (
          <div style={{ padding: '0 16px 4px' }}>
            <button onClick={() => setAratSterse(v => !v)} style={{ ...btn, fontSize: 11.5, color: 'rgba(159,215,255,0.6)', padding: '4px 0' }}>
              🗑 Șterse azi ({p.sterse!.length}) {aratSterse ? '▴' : '▾'}
            </button>
            {aratSterse && (
              <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {p.sterse!.map(x => (
                  <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 9, background: 'rgba(159,215,255,0.05)', border: '1px solid rgba(159,215,255,0.08)', fontSize: 12 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(214,228,244,0.85)' }}>
                      <b>{x.nume}</b> <span style={{ color: 'rgba(159,215,255,0.5)' }}>· {x.titluCategorie}{x.nota ? ' · ' + x.nota : ''}</span>
                    </span>
                    {x.motiv === 'eliberat'
                      ? <span title="Apartamentul e marcat „Eliberat” în Curățenie — reminderul de check-out nu mai e necesar. Revine singur dacă debifezi." style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80', whiteSpace: 'nowrap' }}>🚪 eliberat</span>
                      : <button onClick={() => { p.onAnuleazaNuAzi(x.id); setToast({ msg: `${x.nume} — readus în coadă` }) }} style={{ ...btn, color: '#7BC8FF', padding: 0, whiteSpace: 'nowrap' }}>↺ Readu</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Toast + butoane */}
        <div style={{ minHeight: 20, textAlign: 'center', fontSize: 12, color: '#4ADE80', padding: '0 16px' }}>
          {toast?.msg}
          {toast?.undoId && <button onClick={() => { p.onAnuleazaNuAzi(toast.undoId!); setToast(null) }} style={{ ...btn, color: '#7BC8FF', padding: '0 0 0 6px' }}>Anulează</button>}
        </div>
        {fila !== 'numere' && curent && (
          <div style={{ padding: '10px 16px 16px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, borderTop: '1px solid rgba(159,215,255,0.08)' }}>
            <button onClick={maiTarziu} style={{ border: '1px solid rgba(159,215,255,0.25)', background: 'transparent', color: 'rgba(214,228,244,0.8)', borderRadius: 14, padding: '13px 14px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>{revazut ? 'Înapoi la coadă' : tinutTask ? 'Următorul ›' : 'Mai târziu'}</button>
            <button onClick={trimite} disabled={!curent.telefon.trim()}
              style={{ border: 'none', background: curent.telefon.trim() ? '#25D366' : 'rgba(37,211,102,0.25)', color: '#03250F', borderRadius: 14, padding: '13px 14px', fontWeight: 800, fontSize: 15, cursor: curent.telefon.trim() ? 'pointer' : 'default' }}>
              {(revazut?.trimis || tinutTask) ? 'Retrimite pe WhatsApp' : 'Trimite pe WhatsApp'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
