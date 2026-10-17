'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Layout'
import { linkGhid } from '@/lib/ghid'
import { Copy, Check, ExternalLink, Pencil, Plus, Loader2 } from 'lucide-react'

// Lista ghidurilor de check-in pe apartamente: care au ghid, cand a fost modificat, linkul pentru oaspeti.
type Apt = { id: string; nota: string | null; nume: string; status: string }

export default function Ghiduri() {
  const [apts, setApts] = useState<Apt[] | null>(null)
  const [info, setInfo] = useState<Record<string, { pasi: number; poze: number; video: number; actualizat?: string }>>({})
  const [copiat, setCopiat] = useState<string | null>(null)
  useEffect(() => {
    ;(async () => {
      const [{ data: a }, { data: s }] = await Promise.all([
        supabase.from('apartamente').select('id,nota,nume,status').order('nota'),
        supabase.from('setari').select('cheie,valoare').like('cheie', 'ghid_apt_%'),
      ])
      const m: typeof info = {}
      for (const r of s || []) {
        try { const g = JSON.parse(r.valoare); const media = (g.pasi || []).flatMap((p: any) => p.media || [])
          m[r.cheie.replace('ghid_apt_', '')] = { pasi: (g.pasi || []).length, poze: media.filter((x: any) => x.tip === 'img').length, video: media.filter((x: any) => x.tip === 'video').length, actualizat: g.actualizat } } catch {}
      }
      setInfo(m)
      setApts(((a || []) as Apt[]).sort((x, y) => Number(!!m[y.id]) - Number(!!m[x.id]) || Number(x.status === 'inactiv') - Number(y.status === 'inactiv')))
    })()
  }, [])
  return (
    <>
      <PageHeader title="Ghiduri check-in" subtitle="Pagina pentru oaspeți cu pașii de acces, poze și video — câte una pe apartament" />
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12, alignItems: 'start' }}>
        {!apts && <div style={{ color: 'rgba(159,215,255,0.6)', display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Se încarcă…</div>}
        {apts?.map(a => {
          const i = info[a.id], link = linkGhid(a)
          return (
            <div key={a.id} style={{ background: 'rgba(14,27,48,0.6)', border: `1px solid ${i ? 'rgba(255,138,61,0.35)' : 'rgba(159,215,255,0.12)'}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, opacity: a.status === 'inactiv' && !i ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: '#E8F4FF', flex: 1 }}>{a.nume}</span>
                {a.nota && <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#7BC8FF' }}>{a.nota}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(159,215,255,0.6)' }}>
                {i ? `${i.pasi} pași · ${i.poze} poze${i.video ? ` · ${i.video} video` : ''}${i.actualizat ? ' · modificat ' + new Date(i.actualizat).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }) : ''}` : 'Fără ghid încă'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Link href={`/ghiduri/${a.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, background: i ? 'rgba(255,138,61,0.15)' : 'rgba(77,163,255,0.12)', border: `1px solid ${i ? 'rgba(255,138,61,0.45)' : 'rgba(77,163,255,0.35)'}`, color: i ? '#FF8A3D' : '#7BC8FF', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                  {i ? <><Pencil size={13} /> Editează ghidul</> : <><Plus size={13} /> Creează ghid</>}
                </Link>
                {i && <>
                  <button onClick={() => navigator.clipboard.writeText(link).then(() => { setCopiat(a.id); setTimeout(() => setCopiat(null), 1500) }).catch(() => {})} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(159,215,255,0.2)', color: 'rgba(214,228,244,0.8)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copiat === a.id ? <Check size={13} /> : <Copy size={13} />} {copiat === a.id ? 'Copiat' : 'Link'}</button>
                  <a href={link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(159,215,255,0.2)', color: 'rgba(214,228,244,0.8)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}><ExternalLink size={13} /> Deschide</a>
                </>}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
