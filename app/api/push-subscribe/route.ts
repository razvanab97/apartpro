import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { subscription } = await req.json()
  if (!subscription) return NextResponse.json({ error: 'No subscription' }, { status: 400 })

  await supabase.from('push_subscriptions').upsert({
    endpoint: subscription.endpoint,
    subscription: JSON.stringify(subscription),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })

  return NextResponse.json({ ok: true })
}
