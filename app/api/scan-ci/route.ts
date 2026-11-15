import { NextRequest, NextResponse } from 'next/server'
import { citesteMrz, cnpValid, majuscule } from '@/lib/actIdentitate'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

// Folosea Gemini cu o cheie hardcodata care a expirat/a devenit invalida (401
// "invalid authentication credentials") - trecut pe OpenAI, aceeasi cheie deja
// folosita si functionala pentru restul rutelor AI din aplicatie (/api/ai etc.)
export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType } = await req.json()
    if (!base64Data) return NextResponse.json({ success: false, error: 'No image' }, { status: 400 })

    // buletin SAU pasaport (cerut direct: „asta e un pașaport, să știe sistemul să le citească și pe acestea”)
    const prompt = 'Ești expert în citirea actelor de identitate (buletin / carte de identitate românească SAU pașaport, românesc ori străin). Din această imagine extrage:\n' +
      '- tip_act: "buletin" sau "pasaport" (pașaportul are „PAȘAPORT / PASSPORT” și rânduri care încep cu P<)\n' +
      '- Numele complet: Prenume Nume, cu cratimele exact ca pe act (ex. „Ana-Maria Popescu”)\n' +
      '- CNP-ul (13 cifre): la buletin câmpul CNP; la pașaportul românesc câmpul 5 „Cod Numeric Personal”. La pașaport străin, gol\n' +
      '- Seria (2 litere) și numărul (6 cifre) la buletin; la PAȘAPORT seria e gol, iar numărul = numărul pașaportului (ex. 051234567)\n' +
      '- Cetățenia / țara emitentă (codul de 3 litere din act, ex. ROU, MDA, GBR)\n' +
      '- Județul, localitatea și strada (cu nr., bloc, ap.) din secțiunea Domiciliu — DOAR la buletin; pașaportul nu are adresă: string gol (NU pune locul nașterii)\n' +
      '- Telefon, DOAR dacă apare explicit vizibil în imagine, altfel string gol\n' +
      '- mrz: rândurile de jos ale actului (zona cu <<<), fiecare rând exact cum e scris, caracter cu caracter, ca listă de stringuri; listă goală dacă nu există\n' +
      'Răspunde STRICT doar cu JSON, fără nimic altceva: {"tip_act":"buletin","nume":"Ion Popescu","cnp":"1234567890123",' +
      '"serie":"XZ","numar":"123456","tara":"ROU","judet":"Iași","localitate":"Iași","strada":"Str. Exemplu nr. 1",' +
      '"telefon":"","mrz":[]}. ' +
      'Dacă nu poți citi clar un câmp, pune string gol pentru el. Nu inventa date.'

    const res = await fetch((process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64Data}`, detail: 'high' } },
          ],
        }],
      }),
    })

    const data = await res.json()
    if (data.error) {
      console.error('scan-ci OpenAI error:', res.status, JSON.stringify(data.error))
      return NextResponse.json({ success: false, error: data.error.message || 'Eroare la scanare' }, { status: 200 })
    }

    const rawText = data.choices?.[0]?.message?.content || '{}'
    let parsed: any = {}
    try { parsed = JSON.parse(rawText) } catch {}

    // zona de jos a actului (MRZ) are cifre de control: numarul actului si CNP-ul de acolo au prioritate cand se verifica
    const mrz = citesteMrz(parsed.mrz)
    const pasaport = parsed.tip_act === 'pasaport' || mrz?.tip === 'pasaport'
    let cnp = String(parsed.cnp || '').replace(/\D/g, '')
    if (!cnpValid(cnp) && cnpValid(mrz?.nrPersonal)) cnp = mrz!.nrPersonal!
    let numar = String(parsed.numar || '').replace(/\s/g, '')
    // la pasaport numarul din MRZ (verificat) castiga; la buletin il folosim doar daca AI-ul n-a citit numarul
    if (mrz?.numar && (pasaport || !numar)) numar = pasaport ? mrz.numar : mrz.numar.replace(/^[A-Z]{2}/, '')
    let nume = String(parsed.nume || '').trim()
    if (!nume && mrz) nume = `${mrz.prenume} ${mrz.numeFamilie}`
    nume = majuscule(nume)
    const tara = String(parsed.tara || mrz?.tara || '').toUpperCase().slice(0, 3)
    return NextResponse.json({
      success: true,
      tip_act: pasaport ? 'pasaport' : 'buletin',
      nume,
      cnp,
      cnp_verificat: cnpValid(cnp),
      serie: pasaport ? '' : (parsed.serie || ''),
      numar,
      numar_verificat: !!mrz?.numar,
      tara,
      judet: pasaport ? '' : (parsed.judet || ''),
      localitate: pasaport ? '' : (parsed.localitate || ''),
      strada: pasaport ? '' : (parsed.strada || ''),
      telefon: parsed.telefon || '',
      raw: rawText,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 200 })
  }
}
