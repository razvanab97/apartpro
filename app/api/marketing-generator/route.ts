import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

const FIELDS = [
  'facebook_post', 'instagram_post', 'instagram_story', 'reel_script',
  'tiktok_script', 'newsletter', 'email_marketing', 'google_business',
] as const

const SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(FIELDS.map(f => [f, { type: 'string' }])),
  required: FIELDS as unknown as string[],
  additionalProperties: false,
}

function describeApartment(apt: any, extra?: string): string {
  const parts = [
    `Nume: ${apt.nume}`,
    apt.nota ? `Cod intern: ${apt.nota}` : null,
    apt.adresa ? `Adresă/zonă: ${apt.adresa}${apt.zona ? ', ' + apt.zona : ''}` : null,
    apt.nr_camere ? `Camere: ${apt.nr_camere}` : null,
    apt.capacitate_max ? `Capacitate maximă: ${apt.capacitate_max} persoane` : null,
    apt.pret_standard ? `Preț standard: ${apt.pret_standard} RON/noapte` : null,
    apt.dotari?.length ? `Dotări: ${apt.dotari.join(', ')}` : null,
    apt.reguli ? `Reguli casă: ${apt.reguli}` : null,
    extra ? `Text sursă suplimentar (notițe/descriere scrisă manual):\n${extra}` : null,
  ].filter(Boolean)
  return parts.join('\n')
}

// Un singur mod, mereu HORECA — spre deosebire de o agenție imobiliară care vinde/închiriază
// pe termen lung, toate apartamentele din portofoliul AB Homes sunt cazare turistică (regim
// hotelier), deci nu există aici un comutator vânzare/închiriere de dezambiguizat.
const SYSTEM_PROMPT =
  "Ești un social media manager cu experiență în HORECA — marketing pentru hoteluri, pensiuni și " +
  "apartamente închiriate în regim hotelier (cazare turistică pe termen scurt, tip Airbnb/Booking). " +
  "Lucrezi pentru AB Homes Iași, administrator de apartamente turistice. Primești specificațiile unui " +
  "apartament (și, uneori, fotografii ale lui și/sau un text sursă suplimentar) și trebuie să generezi " +
  "8 materiale de marketing diferite, fiecare adaptat platformei și publicului ei. Publicul tău sunt " +
  "oaspeți potențiali (turiști, oameni de afaceri în deplasare, cupluri într-un city break) — vinzi o " +
  "EXPERIENȚĂ DE ȘEDERE, nu o proprietate imobiliară. Dacă NU primești fotografii, nu descrie vizual ce " +
  "nu poți ști — poți spune generic 'vezi pozele' sau 'în galerie' unde e cazul; dacă PRIMEȘTI " +
  "fotografii, folosește-le pentru detalii vizuale reale (dar nu inventa ce nu se vede clar):\n\n" +
  "- facebook_post: postare pentru pagina de Facebook — ton cald, ospitalier, ca o gazdă care " +
  "întâmpină oaspeți; evidențiază confortul și amenajările utile unui sejur scurt (wifi, parcare, " +
  "bucătărie utilată, locație) plus zona/atracțiile din apropiere; poate include 2-3 hashtag-uri de " +
  "turism/cazare la final.\n" +
  "- instagram_post: caption aspirațional, stil 'stay experience' — cum arată să locuiești acolo câteva " +
  "zile, nu specificații seci; emoji folosite cu măsură, hashtag-uri de turism/city break relevante " +
  "zonei reale (adaptate, nu inventate la întâmplare).\n" +
  "- instagram_story: text scurt (5-15 cuvinte) cu urgență de rezervare tipică cazării pe termen scurt " +
  "(ex: 'Disponibil weekendul ăsta', 'Ultimele zile libere luna asta', 'Rezervă direct, fără comision'), " +
  "cu un call-to-action clar.\n" +
  "- reel_script: scenariu de 15-30 secunde stil 'room tour' de hotel/Airbnb — cadru cu cadru prin " +
  "spațiu (intrare, living, dormitor, bucătărie, baie, eventual vedere/balcon), ritm rapid, hook în " +
  "primele 2-3 secunde.\n" +
  "- tiktok_script: stil nativ platformei, autentic, nu corporate — poate fi din perspectiva unui oaspete " +
  "fictiv ('POV: ai ajuns la cazare și...') sau 'hidden gem' din zonă, hook puternic imediat, ton mai " +
  "jucăuș/curajos decât Reels.\n" +
  "- newsletter: bloc de conținut pentru newsletter-ul lunar, prezentând apartamentul ca o opțiune de " +
  "cazare recomandată — ton informativ, se integrează firesc lângă alte cazări din același email.\n" +
  "- email_marketing: email dedicat, trimis unei liste relevante pentru cazare de scurtă durată (agenții " +
  "de turism, companii cu angajați în deplasare, foști oaspeți) — subiect de email inclus (prima linie, " +
  "prefixată cu 'Subiect: '), corp orientat spre disponibilitate/rezervare, cu call-to-action clar la " +
  "final.\n" +
  "- google_business: postare pentru Google Business Profile — scurtă, orientată local SEO pentru " +
  "căutări de cazare (menționează orașul/zona), informativă, fără emoji sau foarte puține.\n\n" +
  "REGULĂ FOARTE IMPORTANTĂ: fiecare text trebuie să sune ca scris de un om, NU generat de AI. Evită: " +
  "fraze clișeu de marketing ('nu rata ocazia', 'oportunitate unică', 'contactează-ne acum'), exces de " +
  "emoji sau hashtag-uri, aceeași structură de propoziție repetată în toate cele 8 texte, ton robotic. " +
  "Fiecare text trebuie să aibă o voce diferită, potrivită platformei lui. Nu inventa detalii care nu " +
  "apar în specificații."

export async function POST(req: NextRequest) {
  const { apartamentId, extra, images } = await req.json()
  if (!apartamentId) return NextResponse.json({ error: 'apartamentId lipsă' }, { status: 400 })

  const { data: apt, error: aptErr } = await supabase.from('apartamente')
    .select('id,nume,nota,adresa,zona,nr_camere,capacitate_max,pret_standard,dotari,reguli')
    .eq('id', apartamentId).single()
  if (aptErr || !apt) return NextResponse.json({ error: 'Apartament negăsit' }, { status: 404 })

  const content: any[] = [{ type: 'text', text: describeApartment(apt, extra) }]
  for (const img of (images || []).slice(0, 6)) {
    content.push({ type: 'image_url', image_url: { url: img } })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.8,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'marketing_copy', strict: true, schema: SCHEMA } },
    }),
  })

  const data = await res.json()
  if (data.error) {
    console.error('marketing-generator OpenAI error:', res.status, JSON.stringify(data.error))
    return NextResponse.json({ error: data.error.message || 'Eroare la generare' }, { status: 500 })
  }

  const raw = data.choices?.[0]?.message?.content || '{}'
  try {
    return NextResponse.json({ result: JSON.parse(raw) })
  } catch {
    return NextResponse.json({ error: 'Răspuns invalid de la model' }, { status: 500 })
  }
}
