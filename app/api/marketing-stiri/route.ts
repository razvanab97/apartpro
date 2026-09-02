import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''

const CATEGORII = ['eveniment','turism','transport','infrastructura','cultura','sport','meteo','economie','altele'] as const
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
  "sau un eveniment din Iași — și trebuie să evaluezi dacă merită transformat în conținut de " +
  "social media pentru afacere, apoi (dacă merită) să generezi conținutul.\n\n" +
  "Evaluează:\n" +
  "- relevant: e o informație reală și coerentă (nu spam/gunoi/text ilizibil sau fără sens)?\n" +
  "- localRelevant: se referă la Iași sau zona apropiată (nu o știre națională/internațională " +
  "fără nicio legătură locală)?\n" +
  "- businessRelevant: are legătură cu turism, evenimente, transport, cazare, city break, " +
  "afluență de vizitatori — orice ar putea influența cererea de cazare pe termen scurt?\n" +
  "- businessImpact: cât ar putea influența cererea de cazare în perioada următoare — " +
  "'none' = deloc, 'low' = marginal, 'medium' = observabil, 'high' = eveniment major " +
  "(concert/festival mare, aeroport cu rută nouă, conferință mare etc.)\n" +
  "- businessImpactReason: 1 propoziție, de ce ai ales acel nivel\n\n" +
  "category: alege UNA din: eveniment, turism, transport, infrastructura, cultura, sport, " +
  "meteo, economie, altele\n\n" +
  "contentType: instagram_story (ceva rapid/perisabil, gen azi/mâine), instagram_post " +
  "(merită un post mai atent), facebook_post (public mai local/matur), sau niciunul (dacă " +
  "businessImpact e 'none')\n\n" +
  "Dacă businessImpact NU e 'none', generează și:\n" +
  "- overlayText: text scurt (5-12 cuvinte) pentru suprapus pe o poză/video de Instagram " +
  "Story, care leagă știrea de cazarea AB Homes\n" +
  "- postCaption: caption complet, gata de postat, care conectează știrea de business — ton " +
  "natural, ca scris de un om, NU clișee de marketing ('nu rata ocazia', 'oportunitate " +
  "unică'), poate avea 2-3 hashtag-uri relevante la final\n" +
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
