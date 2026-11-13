import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Datele unei firme dupa CUI, din serviciul public ANAF (acelasi registru din care completeaza si Oblio) - pentru factura
// pe persoana juridica (cerut direct: „adăugăm client PJ, adăugăm CUI și primim toată informația”).
const JUDET_AUTO: Record<string, string> = {
  AB: 'Alba', AR: 'Arad', AG: 'Arges', BC: 'Bacau', BH: 'Bihor', BN: 'Bistrita-Nasaud', BT: 'Botosani', BR: 'Braila', BV: 'Brasov', B: 'Bucuresti',
  BZ: 'Buzau', CS: 'Caras-Severin', CL: 'Calarasi', CJ: 'Cluj', CT: 'Constanta', CV: 'Covasna', DB: 'Dambovita', DJ: 'Dolj', GL: 'Galati', GR: 'Giurgiu',
  GJ: 'Gorj', HR: 'Harghita', HD: 'Hunedoara', IL: 'Ialomita', IS: 'Iasi', IF: 'Ilfov', MM: 'Maramures', MH: 'Mehedinti', MS: 'Mures', NT: 'Neamt',
  OT: 'Olt', PH: 'Prahova', SM: 'Satu Mare', SJ: 'Salaj', SB: 'Sibiu', SV: 'Suceava', TR: 'Teleorman', TM: 'Timis', TL: 'Tulcea', VS: 'Vaslui', VL: 'Valcea', VN: 'Vrancea',
}

export async function GET(req: NextRequest) {
  const cui = String(req.nextUrl.searchParams.get('cui') || '').toUpperCase().replace(/^RO/, '').replace(/\D/g, '')
  if (!/^\d{2,10}$/.test(cui)) return NextResponse.json({ error: 'CUI invalid — scrie doar cifrele (cu sau fără RO)' }, { status: 400 })
  let out: any
  try {
    const azi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
    const res = await fetch('https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ cui: Number(cui), data: azi }]), cache: 'no-store',
    })
    out = await res.json()
  } catch {
    return NextResponse.json({ error: 'ANAF nu răspunde acum — încearcă din nou sau completează de mână' }, { status: 502 })
  }
  const f = out?.found?.[0]
  if (!f) return NextResponse.json({ error: `Nu am găsit firma cu CUI ${cui} la ANAF` }, { status: 404 })
  const g = f.date_generale || {}, a = f.adresa_sediu_social || {}
  const strada = [a.sdenumire_Strada, a.snumar_Strada && `nr. ${a.snumar_Strada}`, a.sdetalii_Adresa].filter(Boolean).join(', ')
  return NextResponse.json({
    cui,
    firma: String(g.denumire || '').trim(),
    regCom: String(g.nrRegCom || '').trim(),
    platitorTva: !!f.inregistrare_scop_Tva?.scpTVA,
    judet: JUDET_AUTO[String(a.scod_JudetAuto || '').toUpperCase()] || String(a.sdenumire_Judet || '').trim(),
    localitate: String(a.sdenumire_Localitate || '').trim(),
    adresa: strada || String(g.adresa || '').trim(),
    inactiva: !!f.stare_inactiv?.statusInactivi,
    radiata: !!String(f.stare_inactiv?.dataRadiere || '').trim(),
  })
}
