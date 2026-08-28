import { NextRequest, NextResponse } from 'next/server'
import { supabase, getStorageUrl } from '@/lib/supabase'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''
const BUCKET = 'marketing'

const SCRIPT_PROMPT =
  "Ești un fotograf profesionist specializat în fotografie de interior pentru cazări turistice " +
  "(Airbnb/Booking). Primești o fotografie de referință — stilul/aspectul pe care cineva vrea să-l " +
  "obțină la o poză proprie, făcută cu telefonul sau o cameră, în propriul apartament. Analizează " +
  "AMĂNUNȚIT imaginea și scrie un script/ghid tehnic, în limba română, pe care oricine îl poate urma " +
  "ca să recreeze ACEEAȘI senzație vizuală într-un spațiu real (nu neapărat identic ca decor, ci " +
  "același stil de fotografiere). Structurează răspunsul pe secțiuni clare, cu titluri exact așa:\n\n" +
  "📷 UNGHI & CADRAJ — din ce unghi e făcută poza (înălțime aproximativă, distanță, ce e în " +
  "prim-plan/fundal), orientare portret/landscape.\n" +
  "💡 LUMINĂ — sursă (naturală/artificială), direcție, temperatură de culoare (caldă/rece), oră " +
  "aproximativă a zilei dacă e lumină naturală, intensitate/umbre.\n" +
  "🎨 CULOARE & FILTRU — tonuri dominante, saturație, contrast, orice efect de filtru/editare vizibil " +
  "(ex. tonuri calde de film, desaturat, vignetare).\n" +
  "🪴 STILIZARE & RECUZITĂ — obiecte vizibile puse special pentru poză (flori, cărți, pled, veselă " +
  "etc.) și cum sunt aranjate.\n" +
  "⚙️ SETĂRI TEHNICE (aproximativ) — unghi larg/normal, adâncime de câmp (fundal blur sau tot clar), " +
  "orice sugestie utilă de setări cameră/telefon.\n\n" +
  "Fii concret și acționabil — cineva fără experiență foto trebuie să poată urma pas cu pas. Nu " +
  "descrie generic ce se vede ('o cameră frumoasă'), ci EXACT cum e obținut efectul vizual."

async function uploadDataUrl(apartamentId: string, dataUrl: string, suffix: string): Promise<{ url: string|null; mime: string|null; ext: string|null; error?: string }> {
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
  if (!match) return { url: null, mime: null, ext: null, error: 'Imaginea trebuie încărcată ca fișier (nu link)' }
  const [, mime, b64] = match
  const buffer = Buffer.from(b64, 'base64')
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]
  const path = `${apartamentId}/${Date.now()}-${suffix}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: mime, upsert: true })
  if (error) return { url: null, mime, ext, error: error.message }
  return { url: getStorageUrl(BUCKET, path), mime, ext }
}

async function handleEditare(apartamentId: string, prompt: string, sourceImage: string) {
  if (!prompt || !sourceImage) {
    return NextResponse.json({ error: 'prompt și sourceImage sunt obligatorii' }, { status: 400 })
  }
  const match = String(sourceImage).match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
  if (!match) return NextResponse.json({ error: 'Imaginea trebuie încărcată ca fișier (nu link) pentru editare' }, { status: 400 })
  const [, mime, b64] = match
  const sourceBuffer = Buffer.from(b64, 'base64')
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]

  const form = new FormData()
  form.append('model', 'gpt-image-1')
  form.append('prompt', prompt)
  form.append('image', new Blob([sourceBuffer], { type: mime }), `sursa.${ext}`)

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    body: form,
  })
  const data = await res.json()
  if (data.error) {
    console.error('marketing-imagine (editare) OpenAI error:', res.status, JSON.stringify(data.error))
    return NextResponse.json({ error: data.error.message || 'Eroare la editarea imaginii' }, { status: 500 })
  }
  const resultB64 = data.data?.[0]?.b64_json
  if (!resultB64) return NextResponse.json({ error: 'Răspuns invalid de la model' }, { status: 500 })
  const resultBuffer = Buffer.from(resultB64, 'base64')

  const stamp = Date.now()
  const srcPath = `${apartamentId}/${stamp}-sursa.${ext}`
  const resPath = `${apartamentId}/${stamp}-rezultat.png`
  const [{ error: srcErr }, { error: resErr }] = await Promise.all([
    supabase.storage.from(BUCKET).upload(srcPath, sourceBuffer, { contentType: mime, upsert: true }),
    supabase.storage.from(BUCKET).upload(resPath, resultBuffer, { contentType: 'image/png', upsert: true }),
  ])
  if (srcErr || resErr) {
    return NextResponse.json({ error: (srcErr || resErr)?.message || 'Eroare la salvarea imaginii' }, { status: 500 })
  }

  const { data: saved, error: saveErr } = await supabase.from('marketing_imagini')
    .insert({
      apartament_id: apartamentId, tip: 'editare', prompt,
      imagine_sursa_url: getStorageUrl(BUCKET, srcPath),
      imagine_rezultat_url: getStorageUrl(BUCKET, resPath),
    })
    .select().single()
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 })
  return NextResponse.json({ result: saved })
}

async function handleScript(apartamentId: string, sourceImage: string) {
  if (!sourceImage) return NextResponse.json({ error: 'sourceImage este obligatoriu' }, { status: 400 })

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: SCRIPT_PROMPT },
          { type: 'image_url', image_url: { url: sourceImage } },
        ],
      }],
    }),
  })
  const data = await res.json()
  if (data.error) {
    console.error('marketing-imagine (script) OpenAI error:', res.status, JSON.stringify(data.error))
    return NextResponse.json({ error: data.error.message || 'Eroare la analiza imaginii' }, { status: 500 })
  }
  const scriptText = data.choices?.[0]?.message?.content
  if (!scriptText) return NextResponse.json({ error: 'Răspuns gol de la model' }, { status: 500 })

  const upload = await uploadDataUrl(apartamentId, sourceImage, 'referinta')

  const { data: saved, error: saveErr } = await supabase.from('marketing_imagini')
    .insert({
      apartament_id: apartamentId, tip: 'script',
      imagine_sursa_url: upload.url,
      script_text: scriptText,
    })
    .select().single()
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 })
  return NextResponse.json({ result: saved })
}

export async function POST(req: NextRequest) {
  const { apartamentId, mode, prompt, sourceImage } = await req.json()
  if (!apartamentId) return NextResponse.json({ error: 'apartamentId lipsă' }, { status: 400 })

  if (mode === 'script') return handleScript(apartamentId, sourceImage)
  return handleEditare(apartamentId, prompt, sourceImage)
}

export async function GET(req: NextRequest) {
  const apartamentId = req.nextUrl.searchParams.get('apartamentId')
  if (!apartamentId) return NextResponse.json({ error: 'apartamentId lipsă' }, { status: 400 })
  const { data, error } = await supabase.from('marketing_imagini')
    .select('id,tip,prompt,imagine_sursa_url,imagine_rezultat_url,script_text,created_at')
    .eq('apartament_id', apartamentId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ istoric: data })
}
