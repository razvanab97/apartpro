'use client'
// „📥 Raport Airbnb” (cerut direct: „putem să adăugăm acest document ocazional și să se factureze automat?” + „verifică ce
// s-a facturat și ce a rămas nefacturat din document - sumele din facturi, nu din aplicație”). Se incarca exportul CSV de
// castiguri Airbnb; fiecare cod e comparat cu rezervarea din aplicatie si cu factura RH REALA din Oblio (totalul ei).
// Ce nu e facturat se pregateste dintr-un click: cod + canal Airbnb + suma de facturat = castigul brut + „de facturat”,
// apoi apare in „Facturi Airbnb gata de emis”. Inainte de orice scriere se salveaza valorile vechi (setari import_airbnb_backup_*).
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { citesteRaport } from '@/lib/raportAirbnb'
import { reconciliaza, deFacturat, fmt, zz, type Linie, type Stare } from '@/lib/reconciliereAirbnb'
import { adaugaInCoada } from '@/lib/coadaAirbnb'
import { plusZile, ZILE_DUPA_CHECKOUT } from '@/lib/invatareFactura'


const ORDINE: Stare[] = ['diferenta', 'marcata', 'de_pregatit', 'lipsa', 'pregatita', 'alta_firma', 'anulata', 'ok']
const ETICHETA: Record<Stare, { t: string; c: string }> = {
  diferenta: { t: 'Facturată cu altă sumă', c: '#F87171' },
  marcata: { t: 'Marcată „facturată”, dar fără factură găsită', c: '#FBBF24' },
  de_pregatit: { t: 'Nefacturată — de pregătit', c: '#FBBF24' },
  lipsa: { t: 'Nu există în aplicație', c: '#FBBF24' },
  pregatita: { t: 'Pregătită — apare în „gata de emis”', c: '#7BC8FF' },
  alta_firma: { t: 'Plătită în contul altei firme', c: '#C4B5FD' },
  anulata: { t: 'Rezervare anulată în aplicație', c: 'var(--text3)' },
  ok: { t: 'Facturată, suma corectă', c: '#4ADE80' },
}

export default function ImportAirbnb({ onClose, onReload, onManuala, onDeschide, onCoada }: { onClose: () => void; onReload: () => void; onManuala: (p: { nume: string; cod: string; suma: number }) => void; onDeschide: (rezId: string, reincarca: boolean) => void; onCoada: () => void }) {
  const [linii, setLinii] = useState<Linie[] | null>(null)
  const [fisier, setFisier] = useState('')
  const [eroare, setEroare] = useState('')
  const [oblio, setOblio] = useState<{ ok: boolean; mesaj?: string }>({ ok: true })
  const [lucrez, setLucrez] = useState(false)
  const [bife, setBife] = useState<Record<string, boolean>>({})
  const [mesaj, setMesaj] = useState('')
  // lista de rezervari se reincarca la inchidere (reincarcarea pagini ar inchide fereastra si ar pierde rezultatul)
  const [schimbat, setSchimbat] = useState(false)
  const inchide = () => { if (schimbat) onReload(); onClose() }

  async function citeste(f: File) {
    setEroare(''); setMesaj(''); setLinii(null); setFisier(f.name); setLucrez(true)
    try {
      const { randuri, eroare: e } = citesteRaport(await f.text())
      if (e) { setEroare(e); return }
      // raportul ramane la indemana: intra in coada „Facturare Airbnb pe rând”
      await adaugaInCoada(randuri)
      const { linii: out, oblio: ob } = await reconciliaza(randuri)
      setOblio(ob)
      setLinii(out)
      setBife(Object.fromEntries(out.filter(l => l.stare === 'de_pregatit').map(l => [l.r.cod, !l.dupaNume && !l.r.ajustari.length])))
    } catch (e) { setEroare(e instanceof Error ? e.message : 'Nu am putut citi fișierul') }
    finally { setLucrez(false) }
  }

  const dePregatit = (linii || []).filter(l => l.stare === 'de_pregatit' && bife[l.r.cod])
  // pregatirea (backup -> cod / canal / „de facturat” -> suma de facturat = castigul brut Airbnb)
  async function pregatesteLinii(lista: Linie[]): Promise<number> {
      const ids = lista.map(l => l.rez!.id)
      const { data: vechi } = await supabase.from('rezervari').select('id,cod_rezervare_platforma,canal,status_facturare').in('id', ids)
      const { data: sumeVechi } = await supabase.from('setari').select('cheie,valoare').in('cheie', ids.map(id => `suma_facturare_${id}`))
      const { error: eb } = await supabase.from('setari').upsert({ cheie: `import_airbnb_backup_${new Date().toISOString()}`, valoare: JSON.stringify({ fisier, rezervari: vechi, sume: sumeVechi }) }, { onConflict: 'cheie' })
      if (eb) throw new Error('Backup-ul nu s-a putut salva: ' + eb.message)
      let ok = 0
      for (const l of lista) {
        const rez = l.rez!
        const patch: Record<string, string> = { status_facturare: 'de_facturat' }
        if (!rez.cod_rezervare_platforma) patch.cod_rezervare_platforma = l.r.cod
        if (rez.canal !== 'airbnb') patch.canal = 'airbnb'
        const { error } = await supabase.from('rezervari').update(patch).eq('id', rez.id)
        if (error) throw new Error(`${rez.nume_client}: ${error.message}`)
        const { error: es } = await supabase.from('setari').upsert({ cheie: `suma_facturare_${rez.id}`, valoare: String(l.r.brut) }, { onConflict: 'cheie' })
        if (es) throw new Error(`${rez.nume_client}: ${es.message}`)
        ok++; setSchimbat(true)
        setLinii(ls => ls && ls.map(x => x.r.cod === l.r.cod ? { ...x, stare: 'pregatita', detaliu: `${rez.nume_client} · ${fmt(l.r.brut)} RON · gata de emis la ${zz(plusZile(l.r.checkout, ZILE_DUPA_CHECKOUT))}` } : x))
      }
      return ok
  }
  async function pregateste() {
    if (!dePregatit.length) return
    setLucrez(true); setMesaj('')
    try {
      const ok = await pregatesteLinii(dePregatit)
      setMesaj(`✓ ${ok} ${ok === 1 ? 'rezervare pregătită' : 'rezervări pregătite'}. Le găsești în „Facturi Airbnb gata de emis”: cele cu domiciliul cunoscut se emit dintr-un click, la celelalte completezi domiciliul o dată.`)
      setSchimbat(true)
    } catch (e) { setMesaj('⚠ ' + (e instanceof Error ? e.message : 'Eroare')) }
    finally { setLucrez(false) }
  }
  // click pe client (cerut direct: „să intrăm direct în facturare - apăsăm pe client, se deschide zona de facturare”):
  // nefacturata -> se pregateste intai (suma, cod, canal), apoi se deschide rezervarea la Factură
  async function deschide(l: Linie) {
    if (!l.rez) return
    setLucrez(true); setMesaj('')
    try {
      if (l.stare === 'de_pregatit') await pregatesteLinii([l])
      onDeschide(l.rez.id, schimbat || l.stare === 'de_pregatit')
    } catch (e) { setMesaj('⚠ ' + (e instanceof Error ? e.message : 'Eroare')) }
    finally { setLucrez(false) }
  }

  const grupe = ORDINE.map(s => ({ s, l: (linii || []).filter(x => x.stare === s) })).filter(g => g.l.length)
  const btn = (x: React.CSSProperties = {}): React.CSSProperties => ({ fontSize: 12, padding: '8px 13px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap', ...x })
  return (
    <div onClick={e => { if (e.target === e.currentTarget) inchide() }} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(4,10,20,0.74)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div data-import-airbnb style={{ width: 920, maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: '#0D1A2B', border: '1px solid rgba(159,215,255,0.16)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(159,215,255,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#E8F4FF' }}>📥 Raport câștiguri Airbnb</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Airbnb → Câștiguri → Exportă CSV. Compar fiecare rezervare cu factura RH reală din Oblio și pregătesc ce n-a fost facturat.</div>
          </div>
          <button type="button" onClick={inchide} aria-label="Închide" style={btn({ background: 'transparent', border: '1px solid rgba(159,215,255,0.2)', color: 'var(--text2)' })}>✕</button>
        </div>
        <div style={{ padding: '14px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px dashed rgba(123,200,255,0.35)', borderRadius: 10, cursor: 'pointer', color: '#7BC8FF', fontSize: 13 }}>
            <input data-fisier-csv type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void citeste(f); e.target.value = '' }} />
            {lucrez && !linii ? 'Citesc raportul și facturile din Oblio…' : fisier ? `📄 ${fisier} — alege alt fișier` : 'Alege fișierul CSV exportat din Airbnb'}
          </label>
          {eroare && <div style={{ color: '#F87171', fontSize: 13 }}>⚠ {eroare}</div>}
          {!oblio.ok && linii && <div style={{ color: '#FBBF24', fontSize: 12 }}>⚠ Facturile din Oblio nu s-au putut citi acum ({oblio.mesaj}). Sumele facturilor nu sunt verificate, încearcă din nou peste puțin.</div>}
          {linii && (
            <div data-sumar style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--text2)' }}>{linii.length} rezervări · {fmt(linii.reduce((s, l) => s + l.r.brut, 0))} RON brut:</span>
              {grupe.map(g => <span key={g.s} style={{ color: ETICHETA[g.s].c, fontWeight: 600 }}>{g.l.length} {ETICHETA[g.s].t.toLowerCase()}</span>)}
            </div>
          )}
          {grupe.map(g => (
            <div key={g.s} data-grup={g.s}>
              <div style={{ fontSize: 12, fontWeight: 700, color: ETICHETA[g.s].c, margin: '4px 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ETICHETA[g.s].t} · {g.l.length}</div>
              {g.l.map(l => (
                <div key={l.r.cod} data-linie={l.r.cod} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(159,215,255,0.06)', flexWrap: 'wrap' }}>
                  {g.s === 'de_pregatit' && <input type="checkbox" aria-label={`Pregătește ${l.r.oaspete}`} checked={!!bife[l.r.cod]} onChange={e => setBife(b => ({ ...b, [l.r.cod]: e.target.checked }))} style={{ width: 16, height: 16 }} />}
                  <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{l.rez && g.s !== 'alta_firma'
                      ? <button type="button" data-deschide-rez disabled={lucrez} onClick={() => void deschide(l)} title={g.s === 'de_pregatit' ? 'Pregătește și deschide rezervarea la Factură' : 'Deschide rezervarea la Factură'}
                          style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: lucrez ? 'wait' : 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(123,200,255,0.5)', textUnderlineOffset: 3 }}>{l.r.oaspete}</button>
                      : g.s === 'lipsa'
                        ? <button type="button" onClick={() => { if (schimbat) onReload(); onManuala({ nume: l.r.oaspete, cod: l.r.cod, suma: l.r.brut }) }} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(123,200,255,0.5)', textUnderlineOffset: 3 }}>{l.r.oaspete}</button>
                        : l.r.oaspete} <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{l.r.cod}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{zz(l.r.checkin)} → {zz(l.r.checkout)} · {l.detaliu}</div>
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmt(l.r.brut)}</div>
                  {g.s === 'lipsa' && <button type="button" onClick={() => { if (schimbat) onReload(); onManuala({ nume: l.r.oaspete, cod: l.r.cod, suma: l.r.brut }) }} style={btn({ background: 'rgba(77,163,255,0.1)', border: '1px solid rgba(77,163,255,0.3)', color: '#7BC8FF' })}>🧾 Generează factură</button>}
                </div>
              ))}
            </div>
          ))}
          {mesaj && <div data-mesaj-import style={{ fontSize: 13, color: mesaj.startsWith('⚠') ? '#F87171' : '#4ADE80' }}>{mesaj}</div>}
        </div>
        {linii && linii.some(deFacturat) && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(159,215,255,0.1)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" data-pe-rand disabled={lucrez} onClick={() => { if (schimbat) onReload(); onCoada() }} style={btn({ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ADE80' })}>
              ▶ Facturează pe rând · {linii.filter(deFacturat).length} · {fmt(linii.filter(deFacturat).reduce((s, l) => s + l.r.brut, 0))} RON
            </button>
            {linii.some(l => l.stare === 'de_pregatit') && (
              <button type="button" data-pregateste disabled={!dePregatit.length || lucrez} onClick={pregateste} style={btn({ background: 'transparent', border: '1px solid rgba(159,215,255,0.2)', color: 'var(--text2)', opacity: !dePregatit.length || lucrez ? 0.5 : 1 })}>
                {lucrez ? 'Se pregătesc…' : `doar pregătește bifatele (${dePregatit.length})`}
              </button>
            )}
            <span style={{ fontSize: 11, color: 'var(--text3)', width: '100%' }}>Raportul rămâne salvat: îl reiei oricând din Rezervări → „🧾 Facturare Airbnb”. Pe rând: verifici fiecare factură, completezi domiciliul și confirmi.</span>
          </div>
        )}
      </div>
    </div>
  )
}

