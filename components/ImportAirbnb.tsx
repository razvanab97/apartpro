'use client'
// „📥 Raport Airbnb” (cerut direct: „putem să adăugăm acest document ocazional și să se factureze automat?” + „verifică ce
// s-a facturat și ce a rămas nefacturat din document - sumele din facturi, nu din aplicație”). Se incarca exportul CSV de
// castiguri Airbnb; fiecare cod e comparat cu rezervarea din aplicatie si cu factura RH REALA din Oblio (totalul ei).
// Ce nu e facturat se pregateste dintr-un click: cod + canal Airbnb + suma de facturat = castigul brut + „de facturat”,
// apoi apare in „Facturi Airbnb gata de emis”. Inainte de orice scriere se salveaza valorile vechi (setari import_airbnb_backup_*).
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { citesteRaport, eFirmaFacturare, type RandRaport } from '@/lib/raportAirbnb'
import { normNume, plusZile, ZILE_DUPA_CHECKOUT } from '@/lib/invatareFactura'

type FacturaOblio = { numar: string; data: string; total: number | null; client: string; anulata: boolean }
type Stare = 'diferenta' | 'de_pregatit' | 'lipsa' | 'marcata' | 'alta_firma' | 'anulata' | 'ok' | 'pregatita'
type Rez = { id: string; nume_client: string; canal: string; cod_rezervare_platforma: string | null; status_facturare: string; status_rezervare: string; factura_serie: string | null; factura_numar: string | null; data_checkin: string; data_checkout: string; valoare_bruta: number }
type Linie = { r: RandRaport; rez?: Rez; dupaNume?: boolean; factura?: FacturaOblio; facturaGhicita?: boolean; manuala?: { numar: string; suma?: number }; stare: Stare; detaliu: string }

const fmt = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const zz = (d: string) => d ? d.split('-').reverse().join('.') : ''
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
const cheieFact = (serie?: string | null, nr?: string | null) => `${serie || 'RH'} ${String(nr || '').trim()}`.replace(/\s+/g, ' ').toUpperCase()

export default function ImportAirbnb({ onClose, onReload, onManuala }: { onClose: () => void; onReload: () => void; onManuala: (p: { nume: string; cod: string; suma: number }) => void }) {
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
      const coduri = randuri.map(r => r.cod)
      const SEL = 'id,nume_client,canal,cod_rezervare_platforma,status_facturare,status_rezervare,factura_serie,factura_numar,data_checkin,data_checkout,valoare_bruta'
      const [{ data: dupaCod }, { data: dupaData }, { data: manuale }, lista] = await Promise.all([
        supabase.from('rezervari').select(SEL).in('cod_rezervare_platforma', coduri),
        supabase.from('rezervari').select(SEL).in('data_checkin', [...new Set(randuri.map(r => r.checkin).filter(Boolean))]),
        supabase.from('setari').select('cheie,valoare').in('cheie', coduri.map(c => `factura_manuala_${c}`)),
        fetch('/api/factura-oblio?lista=1', { cache: 'no-store' }).then(r => r.json().then(o => ({ ok: r.ok && !o.error, o }))).catch(() => ({ ok: false, o: { error: 'ContaFlow nu răspunde' } })),
      ])
      const facturi: FacturaOblio[] = lista.ok ? lista.o.facturi || [] : []
      setOblio(lista.ok ? { ok: true } : { ok: false, mesaj: lista.o.error })
      const peNumar = new Map(facturi.map(f => [cheieFact(f.numar.split(' ')[0], f.numar.split(' ').slice(1).join(' ')), f]))
      const man = new Map((manuale || []).map(m => { try { const v = JSON.parse(m.valoare); return [m.cheie.slice('factura_manuala_'.length), { numar: cheieFact(v.serie, v.numar), suma: Number(v.suma) || undefined }] } catch { return [m.cheie, { numar: '' }] } }))
      // facturile din Oblio deja legate de o rezervare / factura manuala -> restul se pot ghici dupa numele clientului
      const legate = new Set<string>([...(dupaCod || []).filter(x => x.factura_numar).map(x => cheieFact(x.factura_serie, x.factura_numar)), ...[...man.values()].map(m => m.numar)])
      const out: Linie[] = randuri.map(r => {
        let rez = (dupaCod || []).find(x => String(x.cod_rezervare_platforma || '').trim().toUpperCase() === r.cod) as Rez | undefined, dupaNume = false
        if (!rez) {
          const n = new Set(normNume(r.oaspete).split(' ').filter(t => t.length >= 3))
          rez = (dupaData || []).find(x => x.data_checkin === r.checkin && x.status_rezervare !== 'anulata' && normNume(x.nume_client).split(' ').some(t => n.has(t))) as Rez | undefined
          dupaNume = !!rez
        }
        const manuala = man.get(r.cod)
        let factura = rez?.factura_numar ? peNumar.get(cheieFact(rez.factura_serie, rez.factura_numar)) : manuala ? peNumar.get(manuala.numar) : undefined
        let facturaGhicita = false
        if (!factura && !rez?.factura_numar && !manuala) {
          const n = normNume(r.oaspete)
          const g = facturi.filter(f => !f.anulata && !legate.has(cheieFact(f.numar.split(' ')[0], f.numar.split(' ').slice(1).join(' '))) && normNume(f.client) === n)
          if (g.length === 1) { factura = g[0]; facturaGhicita = true }
        }
        const nrFact = rez?.factura_numar ? cheieFact(rez.factura_serie, rez.factura_numar) : manuala?.numar || (factura ? factura.numar : '')
        const aj = r.ajustari.length ? ` · ajustare Airbnb ${r.ajustari.map(a => `${a.suma > 0 ? '+' : ''}${fmt(a.suma)}`).join(', ')} (nu e inclusă)` : ''
        let stare: Stare, detaliu: string
        if (!eFirmaFacturare(r.firma)) { stare = 'alta_firma'; detaliu = `banii au intrat la ${r.firma} — nu se facturează pe AB Textile (RH)${nrFact ? ` · are totuși factura ${nrFact}` : ''}` }
        else if (nrFact) {
          if (factura?.total == null) { stare = 'ok'; detaliu = `${nrFact}${lista.ok ? ' — nu am găsit-o în lista Oblio' : ' — suma nu s-a putut verifica acum (Oblio)'}` }
          else if (factura.anulata) { stare = 'diferenta'; detaliu = `${factura.numar} e ANULATĂ în Oblio` }
          else if (Math.abs(factura.total - r.brut) > 0.01) { stare = 'diferenta'; detaliu = `${factura.numar} din ${zz(factura.data)} are ${fmt(factura.total)} RON, câștigul brut Airbnb e ${fmt(r.brut)} RON (diferență ${fmt(r.brut - factura.total)})` }
          else { stare = 'ok'; detaliu = `${factura.numar} din ${zz(factura.data)} · ${fmt(factura.total)} RON${facturaGhicita ? ' · găsită după numele clientului' : ''}` }
          if (facturaGhicita && rez?.status_facturare !== 'facturata') detaliu += ' (rezervarea nu e legată de factură)'
        }
        else if (!rez) { stare = 'lipsa'; detaliu = 'nicio rezervare cu acest cod sau cu acest nume și check-in' }
        else if (rez.status_rezervare === 'anulata') { stare = 'anulata'; detaliu = `${rez.nume_client} e anulată în aplicație, dar Airbnb a plătit ${fmt(r.brut)} RON` }
        else if (rez.status_facturare === 'facturata') { stare = 'marcata'; detaliu = `${rez.nume_client} e marcată „facturată”, dar nu are factură RH${lista.ok ? ' și nu am găsit-o în Oblio după nume' : ''}` }
        else {
          stare = 'de_pregatit'
          const sch = [!rez.cod_rezervare_platforma && 'adaug codul', rez.canal !== 'airbnb' && `canal ${rez.canal} → airbnb`, rez.status_facturare !== 'de_facturat' && '→ de facturat'].filter(Boolean)
          detaliu = `${rez.nume_client}${dupaNume ? ' (găsită după nume + check-in — verifică)' : ''} · suma de facturat ${fmt(r.brut)} RON${sch.length ? ' · ' + sch.join(', ') : ''}`
        }
        return { r, rez, dupaNume, factura, facturaGhicita, manuala, stare, detaliu: detaliu + aj }
      })
      setLinii(out)
      setBife(Object.fromEntries(out.filter(l => l.stare === 'de_pregatit').map(l => [l.r.cod, !l.dupaNume && !l.r.ajustari.length])))
    } catch (e) { setEroare(e instanceof Error ? e.message : 'Nu am putut citi fișierul') }
    finally { setLucrez(false) }
  }

  const dePregatit = (linii || []).filter(l => l.stare === 'de_pregatit' && bife[l.r.cod])
  async function pregateste() {
    if (!dePregatit.length) return
    setLucrez(true); setMesaj('')
    try {
      const ids = dePregatit.map(l => l.rez!.id)
      const { data: vechi } = await supabase.from('rezervari').select('id,cod_rezervare_platforma,canal,status_facturare').in('id', ids)
      const { data: sumeVechi } = await supabase.from('setari').select('cheie,valoare').in('cheie', ids.map(id => `suma_facturare_${id}`))
      const { error: eb } = await supabase.from('setari').upsert({ cheie: `import_airbnb_backup_${new Date().toISOString()}`, valoare: JSON.stringify({ fisier, rezervari: vechi, sume: sumeVechi }) }, { onConflict: 'cheie' })
      if (eb) throw new Error('Backup-ul nu s-a putut salva: ' + eb.message)
      let ok = 0
      for (const l of dePregatit) {
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
      setMesaj(`✓ ${ok} ${ok === 1 ? 'rezervare pregătită' : 'rezervări pregătite'}. Le găsești în „Facturi Airbnb gata de emis”: cele cu domiciliul cunoscut se emit dintr-un click, la celelalte completezi domiciliul o dată.`)
      setSchimbat(true)
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
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{l.r.oaspete} <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{l.r.cod}</span></div>
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
        {linii && (linii.some(l => l.stare === 'de_pregatit')) && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(159,215,255,0.1)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" data-pregateste disabled={!dePregatit.length || lucrez} onClick={pregateste} style={btn({ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ADE80', opacity: !dePregatit.length || lucrez ? 0.5 : 1 })}>
              {lucrez ? 'Se pregătesc…' : `Pregătește ${dePregatit.length} pentru facturare · ${fmt(dePregatit.reduce((s, l) => s + l.r.brut, 0))} RON`}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Nu emite încă nimic: setează suma, codul și „de facturat”. Cele găsite după nume sau cu ajustări nu sunt bifate implicit.</span>
          </div>
        )}
      </div>
    </div>
  )
}

