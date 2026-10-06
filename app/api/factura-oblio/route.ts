import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// „Emite factură” din formularul rezervarii: trimite rezervarea la ContaFlow, care emite factura in
// Oblio (AB Textile, seria RH, SPV automat - setarile stau in ContaFlow), apoi salveaza aici seria,
// numarul si linkul PDF si marcheaza rezervarea „Facturată”. Secretul nu ajunge niciodata in browser.
export async function POST(req: NextRequest) {
  const { rezervareId } = await req.json().catch(() => ({}))
  if (!rezervareId) return NextResponse.json({ error: 'Lipsește rezervarea' }, { status: 400 })

  const url = process.env.CONTAFLOW_URL
  const secret = process.env.CONTAFLOW_FACTURARE_SECRET
  if (!url || !secret) return NextResponse.json({ error: 'Facturarea nu e configurată (CONTAFLOW_URL / CONTAFLOW_FACTURARE_SECRET)' }, { status: 500 })

  const { data: r, error } = await supabase.from('rezervari')
    .select('*, apartament:apartamente(nume,nota)').eq('id', rezervareId).single()
  if (error || !r) return NextResponse.json({ error: error?.message || 'Rezervare negăsită' }, { status: 404 })
  if (r.factura_numar) {
    return NextResponse.json({ serie: r.factura_serie, numar: r.factura_numar, link: r.factura_link, dejaEmisa: true })
  }
  if (r.status_rezervare === 'anulata') return NextResponse.json({ error: 'Rezervarea e anulată' }, { status: 400 })

  const nopti = Math.max(0, Math.round((new Date(r.data_checkout).getTime() - new Date(r.data_checkin).getTime()) / 86400000))
  let resp: Response
  try {
    resp = await fetch(`${url.replace(/\/$/, '')}/api/oblio/factura-cazare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-apartpro-secret': secret },
      body: JSON.stringify({
        rezervareId: r.id,
        canal: r.canal,
        codRezervare: r.cod_rezervare_platforma,
        numeClient: r.nume_client,
        telefon: r.telefon_client || null,
        email: r.email_client || null,
        apartament: [r.apartament?.nota, r.apartament?.nume].filter(Boolean).join(' '),
        checkin: r.data_checkin,
        checkout: r.data_checkout,
        nopti,
        persoane: r.nr_persoane,
        suma: Number(r.valoare_bruta) || 0,
      }),
    })
  } catch (e) {
    return NextResponse.json({ error: 'ContaFlow nu răspunde: ' + (e instanceof Error ? e.message : '') }, { status: 502 })
  }
  const out = await resp.json().catch(() => ({ error: `ContaFlow a răspuns ${resp.status}` }))
  if (!resp.ok || !out.numar) return NextResponse.json({ error: out.error || 'Emiterea a eșuat' }, { status: resp.status >= 400 ? resp.status : 502 })

  const { error: errSalv } = await supabase.from('rezervari').update({
    factura_serie: out.serie, factura_numar: out.numar, factura_link: out.link,
    factura_emisa_la: new Date().toISOString(), status_facturare: 'facturata',
  }).eq('id', r.id)
  // Factura e emisa in Oblio chiar daca salvarea aici esueaza - o intoarcem oricum, cu avertisment
  return NextResponse.json({ ...out, avertisment: errSalv ? `Factura s-a emis, dar nu s-a salvat la rezervare: ${errSalv.message}` : null })
}
