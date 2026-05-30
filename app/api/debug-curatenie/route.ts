import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('rezervari')
    .select('id,nume_client,nr_persoane,data_checkin,data_checkout')
    .or(`data_checkin.eq.${today},data_checkout.eq.${today}`)
  return NextResponse.json({ today, error: error?.message, data })
}
