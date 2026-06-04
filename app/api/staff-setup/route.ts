import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.rpc('exec_sql', { sql: `
    CREATE TABLE IF NOT EXISTS curatenie_status (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      apartament_id UUID,
      data DATE NOT NULL,
      status TEXT DEFAULT 'liber',
      ora_inceput TEXT,
      ora_gata TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(apartament_id, data)
    );
    CREATE TABLE IF NOT EXISTS notificari (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      mesaj TEXT, tip TEXT, citit BOOLEAN DEFAULT FALSE,
      data TIMESTAMPTZ DEFAULT NOW()
    );
  `}).catch(() => {})

  // Try direct approach
  const { error: e1 } = await supabase.from('curatenie_status').select('id').limit(1)
  const { error: e2 } = await supabase.from('notificari').select('id').limit(1)

  return NextResponse.json({
    curatenie_status: e1 ? 'missing: ' + e1.message : 'ok',
    notificari: e2 ? 'missing: ' + e2.message : 'ok'
  })
}
