import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { endpoint, categorii } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'No endpoint' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.from('push_subscriptions').update({ categorii }).eq('endpoint', endpoint)

  return NextResponse.json({ ok: true })
}
