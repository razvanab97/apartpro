'use client'
// „Facturi gata de emis” (cerut direct: „sistemul să învețe și să recomande cum să facem să generăm automat facturile”;
// ales: recomandă + 1 click, emitere la 2 zile după check-out). Rezervarile Airbnb „de facturat” primesc propunerea completa
// (domiciliu salvat sau invatat dupa telefon / nume, suma, data emiterii); cele complete se emit toate dintr-un click,
// in ordinea datelor (seria RH trebuie sa fie cronologica). Ce lipseste se completeaza o data in rezervare - si se invata.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { aziRo, CHEIE_DATA_EMITERE, deschideTabRezervare, type ClientFactura } from '@/components/RezervareModal'
import { propune, normTel, normNume, ZILE_DUPA_CHECKOUT, type Invatat, type Propunere } from '@/lib/invatareFactura'

type Stare = { etapa?: 'trimit' | 'ok' | 'eroare'; mesaj?: string }
const zz = (d: string) => d ? d.split('-').reverse().join('.') : ''
const fmt = (n: number) => n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// rezultatul ultimului lot: lista se reincarca dupa emitere (pagina remonteaza componenta), mesajul trebuie sa ramana
let rezultatLot: { ok: boolean; text: string } | null = null
const parse = (v?: string | null) => { try { const o = JSON.parse(v || 'null'); return o && typeof o === 'object' ? o as ClientFactura : null } catch { return null } }

export default function FacturiGata({ rezervari, modalDeschis, onDeschide, onReload }: { rezervari: any[]; modalDeschis: boolean; onDeschide: (r: any) => void; onReload: () => void }) {
  const candidati = useMemo(() => rezervari.filter(r => r.canal === 'airbnb' && r.status_facturare === 'de_facturat' && !r.factura_numar && r.status_rezervare !== 'anulata' && r.data_checkout), [rezervari])
  const cheie = candidati.map(r => r.id).join(',')
  const [salvate, setSalvate] = useState<Record<string, ClientFactura | null>>({})
  const [sume, setSume] = useState<Record<string, number>>({})
  const [invatate, setInvatate] = useState<Invatat[]>([])
  const [ultima, setUltima] = useState<{ stare: 'incarc' | 'ok' | 'eroare'; data?: string; numar?: string }>({ stare: 'incarc' })
  const [incarcat, setIncarcat] = useState(false)
  const [bife, setBife] = useState<Record<string, boolean>>({})
  const [stari, setStari] = useState<Record<string, Stare>>({})
  const [confirm, setConfirm] = useState(false)
  const [emit, setEmit] = useState(false)
  const [deschis, setDeschis] = useState(true)
  const [viitoare, setViitoare] = useState(false)
  const [rezultat, setRezultat] = useState(rezultatLot)

  // invatarea: toate datele de facturare salvate (setari client_factura_<id>) + numele/telefonul rezervarilor lor
  useEffect(() => {
    if (modalDeschis || !candidati.length) return
    let anulat = false
    ;(async () => {
      const [{ data: cl }, { data: sf }] = await Promise.all([
        supabase.from('setari').select('cheie,valoare').like('cheie', 'client_factura_%').limit(5000),
        supabase.from('setari').select('cheie,valoare').in('cheie', candidati.map(r => `suma_facturare_${r.id}`)),
      ])
      const peRez: Record<string, ClientFactura | null> = {}
      for (const x of cl || []) peRez[x.cheie.slice('client_factura_'.length)] = parse(x.valoare)
      const ids = Object.keys(peRez), rand: Record<string, any> = {}
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase.from('rezervari').select('id,nume_client,telefon_client,data_checkin').in('id', ids.slice(i, i + 150))
        for (const r of data || []) rand[r.id] = r
      }
      if (anulat) return
      setSalvate(peRez)
      setSume(Object.fromEntries((sf || []).map(x => [x.cheie.slice('suma_facturare_'.length), Number(x.valoare) || 0])))
      setInvatate(ids.filter(id => rand[id] && peRez[id]).map(id => ({ rezId: id, nume: normNume(rand[id].nume_client), tel: normTel(rand[id].telefon_client), checkin: rand[id].data_checkin || '', client: peRez[id]! })))
      setIncarcat(true)
    })()
    return () => { anulat = true }
  }, [cheie, modalDeschis])  // eslint-disable-line react-hooks/exhaustive-deps

  const citesteUltima = () => {
    setUltima({ stare: 'incarc' })
    fetch('/api/factura-oblio', { cache: 'no-store' }).then(r => r.json().then(o => ({ ok: r.ok, o }))).then(({ ok, o }) => {
      setUltima(ok && !o.error ? { stare: 'ok', data: o.ultima?.data, numar: o.ultima?.numar } : { stare: 'eroare' })
    }).catch(() => setUltima({ stare: 'eroare' }))
  }
  useEffect(() => { if (candidati.length && !modalDeschis) citesteUltima() }, [!!candidati.length, modalDeschis])  // eslint-disable-line react-hooks/exhaustive-deps

  const azi = aziRo()
  const randuri = useMemo(() => candidati.map(r => ({ r, p: propune(r, salvate[r.id] || null, invatate, sume[r.id] || 0, ultima.data || null, azi) }))
    .sort((a, b) => a.p.dataEmitere.localeCompare(b.p.dataEmitere) || a.r.data_checkout.localeCompare(b.r.data_checkout) || String(a.r.nume_client).localeCompare(String(b.r.nume_client))),
  [candidati, salvate, invatate, sume, ultima.data, azi])
  const gata = randuri.filter(x => x.p.gataLa <= azi)
  const urmeaza = randuri.filter(x => x.p.gataLa > azi)
  const pregatite = gata.filter(x => !x.p.probleme.length)
  const deCompletat = gata.filter(x => x.p.probleme.length)
  const bifat = (id: string, p: Propunere) => bife[id] ?? !p.verifica.length
  const alese = pregatite.filter(x => bifat(x.r.id, x.p) && stari[x.r.id]?.etapa !== 'ok')
  const total = alese.reduce((s, x) => s + x.p.suma, 0)
  const invatateCount = randuri.filter(x => x.p.sursa === 'telefon' || x.p.sursa === 'nume').length

  // emiterea pe rand, in ordinea datei; la prima eroare se opreste (seria RH ramane cronologica)
  async function emiteToate() {
    setConfirm(false); setEmit(true)
    let ultimaData = '', emise = 0, eroare = ''
    for (const { r, p } of alese) {
      setStari(s => ({ ...s, [r.id]: { etapa: 'trimit' } }))
      try {
        const res = await fetch('/api/factura-oblio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rezervareId: r.id, dataEmitere: p.dataEmitere, client: p.client }) })
        const out = await res.json().catch(() => ({}))
        if (!res.ok || !out.numar) {
          setStari(s => ({ ...s, [r.id]: { etapa: 'eroare', mesaj: out.error || `Eroare ${res.status}` } }))
          if (out.ultima?.data) setUltima({ stare: 'ok', data: out.ultima.data, numar: out.ultima.numar })
          eroare = `${r.nume_client}: ${out.error || `Eroare ${res.status}`}`; break
        }
        ultimaData = p.dataEmitere; emise++
        setStari(s => ({ ...s, [r.id]: { etapa: 'ok', mesaj: `${out.serie} ${out.numar}${out.dejaEmisa ? ' (era deja emisă)' : ''}` } }))
      } catch (e) {
        eroare = `${r.nume_client}: ${e instanceof Error ? e.message : 'Emiterea a eșuat'}`
        setStari(s => ({ ...s, [r.id]: { etapa: 'eroare', mesaj: e instanceof Error ? e.message : 'Emiterea a eșuat' } })); break
      }
    }
    if (ultimaData) await supabase.from('setari').upsert({ cheie: CHEIE_DATA_EMITERE, valoare: ultimaData }, { onConflict: 'cheie' })
    setEmit(false)
    rezultatLot = { ok: !eroare, text: `${emise} ${emise === 1 ? 'factură emisă și trimisă' : 'facturi emise și trimise'} în SPV.${eroare ? ` Oprit la ${eroare} — celelalte n-au fost trimise, ca seria RH să rămână în ordine.` : ''}` }
    setRezultat(rezultatLot)
    if (ultimaData) { citesteUltima(); onReload() }
  }

  if (!candidati.length && !rezultat) return null
  const btn = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fontSize: 12, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'inherit', ...extra })
  const sursaText = (p: Propunere) => p.sursa === 'salvat' ? 'domiciliu salvat' : p.sursa === 'telefon' ? `învățat: același telefon (${zz(p.din!.checkin)})` : p.sursa === 'nume' ? `învățat: același nume (${zz(p.din!.checkin)})` : ''
  const loc = (c: ClientFactura | null) => c ? [c.pj && c.firma ? `${c.firma}` : '', c.localitate, c.judet, /^rom[aâ]nia$/i.test(c.tara || 'Romania') ? '' : c.tara].filter(Boolean).join(', ') : ''

  return (
    <div data-facturi-gata className="bg-[#161b27] border border-[#2a3350] rounded-[14px] overflow-hidden mb-5">
      <button type="button" onClick={() => setDeschis(d => !d)} style={{ width: '100%', padding: '14px 18px', borderBottom: deschis ? '1px solid #2a3350' : 'none', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#E8F4FF' }}>🧾 Facturi Airbnb gata de emis</span>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.25)', fontWeight: 600 }}>{pregatite.length} pregătite</span>
        {deCompletat.length > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(251,191,36,0.12)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.25)', fontWeight: 600 }}>{deCompletat.length} de completat</span>}
        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>la {ZILE_DUPA_CHECKOUT} zile după check-out · {ultima.stare === 'ok' ? (ultima.numar ? `ultima: ${ultima.numar} din ${zz(ultima.data!)}` : 'nicio factură RH încă') : ultima.stare === 'incarc' ? 'verific ultima factură RH…' : 'ultima factură RH nu s-a putut citi'}</span>
      </button>
      {deschis && (
        <div style={{ padding: '12px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rezultat && (
            <div data-rezultat-lot style={{ fontSize: 12, borderRadius: 10, padding: '9px 12px', display: 'flex', gap: 10, alignItems: 'flex-start', background: rezultat.ok ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${rezultat.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.35)'}`, color: rezultat.ok ? '#4ADE80' : '#F87171' }}>
              <span style={{ flex: 1 }}>{rezultat.ok ? '✓ ' : '⚠ '}{rezultat.text}</span>
              <button type="button" aria-label="Închide mesajul" onClick={() => { rezultatLot = null; setRezultat(null) }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 14 }}>✕</button>
            </div>
          )}
          {/* recomandarile: ce lipseste ca facturarea sa mearga singura */}
          {incarcat && candidati.length > 0 && (
            <div data-recomandari style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55, background: 'rgba(77,163,255,0.06)', border: '1px solid rgba(77,163,255,0.15)', borderRadius: 10, padding: '10px 12px' }}>
              <b style={{ color: '#7BC8FF' }}>Ce am învățat:</b> {invatate.length} {invatate.length === 1 ? 'client cu domiciliu salvat' : 'clienți cu domiciliu salvat'}{invatateCount > 0 ? ` · ${invatateCount} ${invatateCount === 1 ? 'rezervare recunoscută' : 'rezervări recunoscute'} după telefon / nume` : ''}.
              {deCompletat.length > 0
                ? <> Ca să meargă dintr-un click: completează o singură dată domiciliul la cele {deCompletat.length} galbene (Airbnb → profilul oaspetelui → „Locuiește în”). Îl țin minte și data viitoare îl recunosc singur după telefon sau nume.</>
                : pregatite.length > 0 ? <> Toate facturile ajunse la termen sunt complete — verifică lista și apasă „Emite”.</> : <> Nicio factură nu a ajuns încă la termen.</>}
              {ultima.stare === 'ok' && gata.some(x => x.p.mutata) && <> Unele au data mutată la {zz(ultima.data!)} (nu se poate factura înaintea ultimei facturi RH).</>}
            </div>
          )}
          {!incarcat && candidati.length > 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Pregătesc propunerile…</div>}

          {incarcat && gata.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {gata.map(({ r, p }) => {
                const st = stari[r.id], gal = p.probleme.length > 0
                return (
                  <div key={r.id} data-rand-factura={gal ? 'de-completat' : 'pregatita'} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(159,215,255,0.06)', flexWrap: 'wrap' }}>
                    <input type="checkbox" aria-label={`Emite factura pentru ${r.nume_client}`} disabled={gal || emit || st?.etapa === 'ok'} checked={!gal && st?.etapa !== 'ok' && bifat(r.id, p)} onChange={e => setBife(b => ({ ...b, [r.id]: e.target.checked }))} style={{ width: 16, height: 16, flexShrink: 0 }} />
                    <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        <button type="button" onClick={() => { onDeschide(r); setTimeout(() => deschideTabRezervare('factura'), 350) }} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(123,200,255,0.45)', textUnderlineOffset: 3 }}>{r.nume_client}</button>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>{r.cod_rezervare_platforma}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {r.apartament?.nume || '—'} · check-out {zz(r.data_checkout)} · {gal
                          ? <span style={{ color: '#FBBF24' }}>{p.probleme.join(', ')}{p.taraTelefon && !p.client ? ` (telefon din ${p.taraTelefon})` : ''}</span>
                          : <span><span style={{ color: 'var(--text2)' }}>{loc(p.client)}</span> · {sursaText(p)}</span>}
                        {p.verifica.length > 0 && !gal && <span style={{ color: '#FBBF24' }}> · {p.verifica.join(', ')}</span>}
                      </div>
                      {st?.mesaj && <div style={{ fontSize: 11, marginTop: 3, color: st.etapa === 'ok' ? '#4ADE80' : '#F87171' }}>{st.etapa === 'ok' ? '✓ ' : '⚠ '}{st.mesaj}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: p.suma > 0 ? 'var(--green)' : '#FBBF24' }}>{p.suma > 0 ? `${fmt(p.suma)} RON` : '—'}</div>
                      <div style={{ fontSize: 11, color: p.mutata ? '#FBBF24' : 'var(--text3)' }}>{st?.etapa === 'trimit' ? 'se emite…' : `data ${zz(p.dataEmitere)}`}</div>
                    </div>
                    {gal && <button type="button" onClick={() => { onDeschide(r); setTimeout(() => deschideTabRezervare('factura'), 350) }} style={btn({ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#FBBF24' })}>Completează</button>}
                  </div>
                )
              })}
            </div>
          )}

          {incarcat && pregatite.length > 0 && (confirm ? (
            <div data-confirmare-lot style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                Emiți <b>{alese.length} {alese.length === 1 ? 'factură' : 'facturi'}</b> RH pe AB Textile, total <b>{fmt(total)} RON</b>, cu datele {zz(alese[0]?.p.dataEmitere || '')}{alese.length > 1 ? ` – ${zz(alese[alese.length - 1].p.dataEmitere)}` : ''}?
                <div style={{ fontSize: 11, color: '#FBBF24', marginTop: 3 }}>Se trimit automat în SPV, în ordinea datelor — nu se pot retrage din aplicație.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => setConfirm(false)} style={btn({ background: 'transparent', border: '1px solid rgba(159,215,255,0.2)', color: 'var(--text2)' })}>Renunță</button>
                <button type="button" onClick={emiteToate} style={btn({ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ADE80' })}>Da, emite {alese.length === 1 ? 'factura' : `cele ${alese.length} facturi`}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" data-emite-lot disabled={!alese.length || emit} onClick={() => setConfirm(true)} style={btn({ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ADE80', opacity: !alese.length || emit ? 0.5 : 1, cursor: !alese.length || emit ? 'default' : 'pointer' })}>
                {emit ? 'Se emit facturile…' : `🧾 Emite ${alese.length} ${alese.length === 1 ? 'factură' : 'facturi'} · ${fmt(total)} RON`}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Doar cele bifate. Cele cu „verifică” nu sunt bifate implicit.</span>
            </div>
          ))}

          {urmeaza.length > 0 && (
            <div>
              <button type="button" onClick={() => setViitoare(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: '#7BC8FF', fontFamily: 'inherit' }}>
                {viitoare ? '▾' : '▸'} {urmeaza.length} {urmeaza.length === 1 ? 'devine gata' : 'devin gata'} în zilele următoare{urmeaza.filter(x => x.p.probleme.length).length ? ` (${urmeaza.filter(x => x.p.probleme.length).length} fără domiciliu — le poți completa de acum)` : ''}
              </button>
              {viitoare && urmeaza.map(({ r, p }) => (
                <div key={r.id} style={{ fontSize: 12, color: 'var(--text3)', padding: '5px 0 5px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => onDeschide(r)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text2)', font: 'inherit', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(123,200,255,0.35)' }}>{r.nume_client}</button>
                  <span>gata pe {zz(p.gataLa)}</span>
                  <span style={{ color: p.probleme.length ? '#FBBF24' : '#4ADE80' }}>{p.probleme.length ? p.probleme.join(', ') : `✓ ${loc(p.client)}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
