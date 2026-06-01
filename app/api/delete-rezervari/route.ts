import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { secret } = await req.json()
  if (secret !== 'delete-all-rez-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Sterge TOATE rezervarile
  const { error, count } = await supabase
    .from('rezervari')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // sterge tot
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
  return NextResponse.json({ ok: true, message: 'Toate rezervarile au fost sterse', count })
}
