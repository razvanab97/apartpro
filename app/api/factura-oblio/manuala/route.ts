import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Factura fara rezervare in aplicatie (Rezervari → cautare fara rezultat → „Generează factură”). Aceeasi emitere ca la
// rezervare (ContaFlow → Oblio, AB Textile, seria RH, SPV). Un cod de rezervare se factureaza o singura data: se verifica
// facturile manuale (setari factura_manuala_<COD>) si rezervarile cu acelasi cod deja facturate.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const url = process.env.CONTAFLOW_URL, secret = process.env.CONTAFLOW_FACTURARE_SECRET
  if (!url || !secret) return NextResponse.json({ error: 'Facturarea nu e configurată (CONTAFLOW_URL / CONTAFLOW_FACTURARE_SECRET)' }, { status: 500 })
  const cod = String(b.cod || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
  const nume = String(b.numeClient || '').trim(), suma = Math.round(Number(b.suma) * 100) / 100
  const canal = b.canal === 'booking' ? 'booking' : 'airbnb'
  const c = b.client || {}
  const cl = { tara: String(c.tara || '').trim(), judet: String(c.judet || '').trim(), localitate: String(c.localitate || '').trim(), adresa: String(c.adresa || '').trim(),
    pj: !!c.pj, cui: String(c.cui || '').trim(), firma: String(c.firma || '').trim(), regCom: String(c.regCom || '').trim(), platitorTva: !!c.platitorTva }
  const eRo = !cl.tara || /^rom[aâ]nia$/i.test(cl.tara)
  const lipsa = [!nume && 'numele clientului', cod.length < 4 && 'codul rezervării', !(suma > 0) && 'suma', eRo && !cl.judet && 'județul clientului',
    !cl.localitate && 'localitatea clientului', !/^\d{4}-\d{2}-\d{2}$/.test(String(b.dataEmitere || '')) && 'data emiterii',
    cl.pj && !cl.cui && 'CUI-ul firmei', cl.pj && !cl.firma && 'denumirea firmei'].filter(Boolean)
  if (lipsa.length) return NextResponse.json({ error: `Completează: ${lipsa.join(', ')}` }, { status: 400 })

  const cheie = `factura_manuala_${cod}`
  const { data: exista } = await supabase.from('setari').select('valoare').eq('cheie', cheie).maybeSingle()
  if (exista?.valoare) { try { const f = JSON.parse(exista.valoare); return NextResponse.json({ serie: f.serie, numar: f.numar, link: f.link, dejaEmisa: true }) } catch { /* continua */ } }
  const { data: rez } = await supabase.from('rezervari').select('factura_serie,factura_numar,factura_link').ilike('cod_rezervare_platforma', cod).not('factura_numar', 'is', null).limit(1)
  if (rez?.[0]) return NextResponse.json({ serie: rez[0].factura_serie, numar: rez[0].factura_numar, link: rez[0].factura_link, dejaEmisa: true })

  let resp: Response
  try {
    resp = await fetch(`${url.replace(/\/$/, '')}/api/oblio/factura-cazare`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-apartpro-secret': secret },
      body: JSON.stringify({ rezervareId: `manual-${cod}`, canal, codRezervare: cod, numeClient: nume, suma, dataEmitere: b.dataEmitere, client: { ...cl, tara: eRo ? 'Romania' : cl.tara } }),
    })
  } catch (e) {
    return NextResponse.json({ error: 'ContaFlow nu răspunde: ' + (e instanceof Error ? e.message : '') }, { status: 502 })
  }
  const out = await resp.json().catch(() => ({ error: `ContaFlow a răspuns ${resp.status}` }))
  if (!resp.ok || !out.numar) return NextResponse.json({ error: out.error || 'Emiterea a eșuat', ultima: out.ultima || null }, { status: resp.status >= 400 ? resp.status : 502 })
  const { error: errSalv } = await supabase.from('setari').upsert({ cheie, valoare: JSON.stringify({ serie: out.serie, numar: out.numar, link: out.link, numeClient: nume, canal, suma, dataEmitere: b.dataEmitere, client: cl, emisaLa: new Date().toISOString() }) }, { onConflict: 'cheie' })
  return NextResponse.json({ ...out, avertisment: errSalv ? `Factura s-a emis, dar nu s-a salvat în aplicație: ${errSalv.message}` : null })
}
