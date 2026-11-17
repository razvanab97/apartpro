import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// „Stornează factura” din formularul rezervarii (cerut direct: „așa cum avem funcția de facturare, să avem și funcția de
// stornare a unei facturi deja emise pe o rezervare anume”): ContaFlow emite in Oblio factura de stornare (seria RH, cu
// minus, trimisa in SPV), apoi aici rezervarea revine la „Nefacturat” (se poate emite o factura noua), iar factura
// originala + stornarea raman in istoric (setari stornari_factura_<id>). Secretul nu ajunge niciodata in browser.
const cheieStornari = (id: string) => `stornari_factura_${id}`

export async function POST(req: NextRequest) {
  const { rezervareId, dataEmitere } = await req.json().catch(() => ({}))
  if (!rezervareId) return NextResponse.json({ error: 'Lipsește rezervarea' }, { status: 400 })
  const url = process.env.CONTAFLOW_URL
  const secret = process.env.CONTAFLOW_FACTURARE_SECRET
  if (!url || !secret) return NextResponse.json({ error: 'Facturarea nu e configurată (CONTAFLOW_URL / CONTAFLOW_FACTURARE_SECRET)' }, { status: 500 })

  const { data: r, error } = await supabase.from('rezervari').select('id,factura_serie,factura_numar,factura_link,factura_emisa_la').eq('id', rezervareId).single()
  if (error || !r) return NextResponse.json({ error: error?.message || 'Rezervare negăsită' }, { status: 404 })
  if (!r.factura_numar) return NextResponse.json({ error: 'Rezervarea nu are o factură emisă' }, { status: 400 })

  let resp: Response
  try {
    resp = await fetch(`${url.replace(/\/$/, '')}/api/oblio/factura-cazare/storno`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-apartpro-secret': secret },
      body: JSON.stringify({ rezervareId: r.id, serie: r.factura_serie, numar: r.factura_numar, dataEmitere: dataEmitere || undefined }),
    })
  } catch (e) {
    return NextResponse.json({ error: 'ContaFlow nu răspunde: ' + (e instanceof Error ? e.message : '') }, { status: 502 })
  }
  const out = await resp.json().catch(() => ({ error: `ContaFlow a răspuns ${resp.status}` }))
  if (!resp.ok || !out.numar) return NextResponse.json({ error: out.error || 'Stornarea a eșuat', ultima: out.ultima || null }, { status: resp.status >= 400 ? resp.status : 502 })

  // istoric: factura originala + stornarea ei (citire proaspata, se adauga la lista)
  const { data: st } = await supabase.from('setari').select('valoare').eq('cheie', cheieStornari(r.id)).maybeSingle()
  let lista: any[] = []; try { const v = JSON.parse(st?.valoare || '[]'); if (Array.isArray(v)) lista = v } catch {}
  const intrare = { original: { serie: r.factura_serie, numar: r.factura_numar, link: r.factura_link, emisaLa: r.factura_emisa_la }, storno: { serie: out.serie, numar: out.numar, link: out.link, data: out.data }, la: new Date().toISOString() }
  lista.push(intrare)
  const { error: e1 } = await supabase.from('setari').upsert({ cheie: cheieStornari(r.id), valoare: JSON.stringify(lista) }, { onConflict: 'cheie' })
  const { error: e2 } = await supabase.from('rezervari').update({ factura_serie: null, factura_numar: null, factura_link: null, factura_emisa_la: null, status_facturare: 'nefacturat' }).eq('id', r.id)
  // Stornarea e emisa in Oblio chiar daca salvarea aici esueaza - o intoarcem oricum, cu avertisment
  const err = e1 || e2
  return NextResponse.json({ ...intrare, stornari: lista, avertisment: err ? `Stornarea s-a emis (${out.serie} ${out.numar}), dar nu s-a salvat la rezervare: ${err.message}` : null })
}
