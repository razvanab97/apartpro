import { supabase } from '@/lib/supabase'
import { ghidNou, type Ghid } from '@/lib/ghid'
// ce e marcat „ascuns” in editor nu pleaca deloc spre oaspete (nici in datele paginii, nu doar neafisat)
import { doarVizibile } from '@/lib/ghidCoduri'

// Citirea unui ghid public pe server (pagina /ghid/<COD> si ruta /api/ghid/<COD>) - doar ghidul acela.
export async function incarcaGhidPublic(codBrut: string): Promise<{ apt: { id: string; nota: string | null; nume: string }; ghid: Ghid } | null> {
  const cod = decodeURIComponent(codBrut || '').trim()
  if (!cod || cod.length > 60) return null
  const { data: apts } = await supabase.from('apartamente').select('id,nota,nume')
  let apt = (apts || []).find((a: any) => a.id === cod) || (apts || []).find((a: any) => (a.nota || '').toUpperCase() === cod.toUpperCase())
  // linkul scurt al ghidului (ex. Cherry3), fara diferenta intre litere mari / mici
  if (!apt) {
    const { data: ghiduri } = await supabase.from('setari').select('cheie,valoare').like('cheie', 'ghid_apt_%')
    const g = (ghiduri || []).find((s: any) => { try { return String(JSON.parse(s.valoare)?.link_scurt || '').trim().toUpperCase() === cod.toUpperCase() } catch { return false } })
    if (g) apt = (apts || []).find((a: any) => a.id === String(g.cheie).slice('ghid_apt_'.length))
  }
  if (!apt) return null
  const { data } = await supabase.from('setari').select('valoare').eq('cheie', 'ghid_apt_' + apt.id).maybeSingle()
  if (!data?.valoare) return null
  try { return { apt: { id: apt.id, nota: apt.nota, nume: apt.nume }, ghid: doarVizibile({ ...ghidNou(), ...JSON.parse(data.valoare) }) } } catch { return null }
}
