import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  // Test 1: verifica coloanele disponibile
  const { data: sample, error: sampleErr } = await supabase
    .from('rezervari').select('*').limit(1)

  // Test 2: incearca un insert minimal
  const { data: ins, error: insErr } = await supabase.from('rezervari').insert({
    apartament_id: null,
    nume_client: 'TEST_DELETE_ME',
    data_checkin: '2026-01-01',
    data_checkout: '2026-01-02',
    canal: 'intern',
    status_rezervare: 'confirmata',
    status_decont: 'nedecontat',
  }).select().single()

  // Sterge daca a reusit
  if(ins?.id) await supabase.from('rezervari').delete().eq('id', ins.id)

  return NextResponse.json({
    sample_columns: sample?.[0] ? Object.keys(sample[0]) : null,
    sample_error: sampleErr?.message,
    insert_ok: !!ins,
    insert_error: insErr?.message,
    insert_code: insErr?.code,
  })
}
