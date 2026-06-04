import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { title, body, url, tag } = await req.json()

  const webpush = (await import('web-push')).default
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@abhomes.ro',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: subs } = await supabase.from('push_subscriptions').select('endpoint,subscription')
  if (!subs?.length) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const row of subs) {
    try {
      await webpush.sendNotification(
        JSON.parse(row.subscription),
        JSON.stringify({ title, body, url: url||'/taskuri', tag: tag||'task' })
      )
      sent++
    } catch (e: any) {
      if (e.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
      }
    }
  }
  return NextResponse.json({ sent })
}
