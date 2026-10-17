'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

// Scurtatura ceruta direct: la linkul ghidului adaugi /admin (ex. apartpro.work/ghid/GS08/admin) si ajungi in editor
export default function GhidAdmin() {
  const { cod } = useParams<{ cod: string }>()
  const router = useRouter()
  useEffect(() => { router.replace(`/ghiduri/${encodeURIComponent(String(cod || ''))}`) }, [cod, router])
  return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#120d0a', color: '#a9a89f', fontFamily: 'system-ui,sans-serif' }}>Deschid editorul ghidului…</div>
}
