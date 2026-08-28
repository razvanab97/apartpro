import { NextRequest, NextResponse } from 'next/server'
import { supabase, getStorageUrl } from '@/lib/supabase'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''
const BUCKET = 'marketing'

export async function POST(req: NextRequest) {
  const { apartamentId, prompt, sourceImage } = await req.json()
  if (!apartamentId || !prompt || !sourceImage) {
    return NextResponse.json({ error: 'apartamentId, prompt și sourceImage sunt obligatorii' }, { status: 400 })
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
    console.error('marketing-imagine OpenAI error:', res.status, JSON.stringify(data.error))
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

  const imagine_sursa_url = getStorageUrl(BUCKET, srcPath)
  const imagine_rezultat_url = getStorageUrl(BUCKET, resPath)

  const { data: saved, error: saveErr } = await supabase.from('marketing_imagini')
    .insert({ apartament_id: apartamentId, prompt, imagine_sursa_url, imagine_rezultat_url })
    .select().single()
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 })

  return NextResponse.json({ result: saved })
}

export async function GET(req: NextRequest) {
  const apartamentId = req.nextUrl.searchParams.get('apartamentId')
  if (!apartamentId) return NextResponse.json({ error: 'apartamentId lipsă' }, { status: 400 })
  const { data, error } = await supabase.from('marketing_imagini')
    .select('id,prompt,imagine_sursa_url,imagine_rezultat_url,created_at')
    .eq('apartament_id', apartamentId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ istoric: data })
}
