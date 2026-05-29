import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://lsmraxevzkmupaidianv.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_ACJ1clv28hJ1hXJAAxvbUA_kBlNHH0y',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  },
}

export default nextConfig
