import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error: e1 } = await supabase.from('curatenie_status').select('id').limit(1)
  const { error: e2 } = await supabase.from('notificari').select('id').limit(1)

  return NextResponse.json({
    curatenie_status: e1 ? 'missing: ' + e1.message : 'ok',
    notificari: e2 ? 'missing: ' + e2.message : 'ok'
  })
}
