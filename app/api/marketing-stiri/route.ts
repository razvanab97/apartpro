import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

const CATEGORII = ['eveniment','turism','transport','infrastructura','cultura','sport','meteo','economie','horeca','altele'] as const
const TIPURI_CONTINUT = ['instagram_story','instagram_post','facebook_post','niciunul'] as const
const IMPACT = ['none','low','medium','high'] as const

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    category: { type: 'string', enum: CATEGORII as unknown as string[] },
    contentType: { type: 'string', enum: TIPURI_CONTINUT as unknown as string[] },
    relevant: { type: 'boolean' },
    localRelevant: { type: 'boolean' },
    businessRelevant: { type: 'boolean' },
    businessImpact: { type: 'string', enum: IMPACT as unknown as string[] },
    businessImpactReason: { type: 'string' },
    overlayText: { type: 'string' },
    postCaption: { type: 'string' },
    imagePrompt: { type: 'string' },
  },
  required: ['summary','category','contentType','relevant','localRelevant','businessRelevant','businessImpact','businessImpactReason','overlayText','postCaption','imagePrompt'],
  additionalProperties: false,
}

const SYSTEM_PROMPT =
  "Ești social media manager pentru AB Homes Iași, administrator de apartamente în regim " +
  "hotelier (cazare turistică pe termen scurt) în Iași. Primești un text — o știre, un anunț " +
  "sau un eveniment — și trebuie să evaluezi dacă merită transformat în conținut de social " +
  "media pentru afacere, apoi (dacă merită) să generezi conținutul.\n\n" +
  "IMPORTANT — două tipuri de relevanță contează AMÂNDOUĂ, nu doar cea locală:\n" +
  "1) Știri LOCALE din Iași/zona apropiată (evenimente, turism, transport, infrastructură) — " +
  "care ar putea aduce vizitatori sau interesa oaspeți.\n" +
  "2) Știri despre industria HORECA / regim hotelier / cazare turistică (Airbnb, Booking, " +
  "turism) la nivel NAȚIONAL — legislație nouă, taxe, reglementări pentru proprietari, " +
  "statistici de piață, tendințe. Acestea sunt relevante chiar dacă nu menționează Iași deloc, " +
  "pentru că afectează direct businessul (ex. reguli noi UE pentru închirieri pe termen scurt).\n\n" +
  "Evaluează:\n" +
  "- relevant: e o informație reală și coerentă (nu spam/gunoi/text ilizibil sau fără sens)?\n" +
  "- localRelevant: se referă la Iași/zona apropiată, SAU e o știre HORECA/regim hotelier la " +
  "nivel național (vezi punctul 2 de mai sus — contează ca relevant chiar fără legătură locală " +
  "directă)? Doar o știre națională/internațională FĂRĂ nicio legătură cu Iași SAU cu industria " +
  "HORECA/cazare e 'false'.\n" +
  "- businessRelevant: are legătură cu turism, evenimente, transport, cazare, city break, " +
  "afluență de vizitatori, sau cu industria HORECA/regim hotelier la nivel național (legislație, " +
  "taxe, platforme de rezervare)?\n" +
  "- businessImpact: cât ar putea influența afacerea în perioada următoare — 'none' = deloc, " +
  "'low' = marginal, 'medium' = observabil, 'high' = eveniment major (concert/festival mare, " +
  "aeroport cu rută nouă) SAU schimbare legislativă/reglementare care afectează direct " +
  "închirierile pe termen scurt\n" +
  "- businessImpactReason: 1 propoziție, de ce ai ales acel nivel\n\n" +
  "category: alege UNA din: eveniment, turism, transport, infrastructura, cultura, sport, " +
  "meteo, economie, horeca (pentru știri de industrie — legislație/taxe/platforme, indiferent " +
  "dacă sunt locale sau naționale), altele\n\n" +
  "contentType: instagram_story (ceva rapid/perisabil, gen azi/mâine), instagram_post " +
  "(merită un post mai atent), facebook_post (public mai local/matur — potrivit și pentru " +
  "explicat o schimbare legislativă pe îndelete), sau niciunul (dacă businessImpact e 'none')\n\n" +
  "Dacă businessImpact NU e 'none', generează și:\n" +
  "- overlayText: text scurt (5-12 cuvinte) pentru suprapus pe o poză/video de Instagram " +
  "Story, care leagă știrea de cazarea AB Homes (pentru știri de tip 'horeca' naționale, poate " +
  "fi orientat spre informare/încredere, nu neapărat spre 'vino în vizită')\n" +
  "- postCaption: caption complet, gata de postat, care conectează știrea de business — ton " +
  "natural, ca scris de un om, NU clișee de marketing ('nu rata ocazia', 'oportunitate " +
  "unică'), poate avea 2-3 hashtag-uri relevante la final. Pentru o știre 'horeca' națională " +
  "(legislație/reguli), caption-ul poate explica ce înseamnă schimbarea pentru oaspeți/proprietari, " +
  "nu doar promova o vizită.\n" +
  "- imagePrompt: prompt în engleză, descriptiv (scenă, stil, atmosferă, luminozitate), " +
  "pentru generarea unei imagini AI care să însoțească postarea, potrivit evenimentului/știrii\n\n" +
  "Dacă businessImpact E 'none', lasă overlayText/postCaption/imagePrompt string gol \"\". Nu " +
  "inventa detalii care nu apar în text — dacă ceva e neclar, scrie summary pe baza a ce ai " +
  "sigur, fără să completezi tu lipsurile."

export async function POST(req: NextRequest) {
  const { text, url } = await req.json()
  const sursaText = String(text || '').trim()
  if (!sursaText) return NextResponse.json({ error: 'Lipsește textul știrii' }, { status: 400 })

  const userContent = url ? `Sursă: ${url}\n\n${sursaText}` : sursaText

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'stire_analiza', strict: true, schema: SCHEMA } },
    }),
  })

  const data = await res.json()
  if (data.error) {
    console.error('marketing-stiri OpenAI error:', res.status, JSON.stringify(data.error))
    return NextResponse.json({ error: data.error.message || 'Eroare la analiză' }, { status: 500 })
  }

  const raw = data.choices?.[0]?.message?.content || '{}'
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Răspuns invalid de la model' }, { status: 500 })
  }

  let savedId: string | null = null
  try {
    const { data: saved } = await supabase.from('marketing_stiri')
      .insert({ sursa_text: sursaText, sursa_url: url || null, rezultat: parsed })
      .select('id').single()
    savedId = saved?.id || null
  } catch (e) {
    console.error('marketing-stiri: eroare salvare istoric', e)
  }

  return NextResponse.json({ result: parsed, savedId })
}

export async function GET() {
  const { data, error } = await supabase.from('marketing_stiri')
    .select('id,sursa_text,sursa_url,rezultat,created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ istoric: data })
}
