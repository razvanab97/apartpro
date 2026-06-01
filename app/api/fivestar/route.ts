import { NextRequest, NextResponse } from 'next/server'

const T1 = '3cvbat7zgH54347Artesrtyrt466yj57se4lkg4'
const T  = 'Y5paEuVpBBop8pHG1qLVF6ymqCdPkzlncJGK0L50'
const API = 'https://www.5stardesk.ro/apih.php'

export async function POST(req: NextRequest) {
  const { actiune, ...params } = await req.json()

  const body = { t1: T1, t: T, actiune, ...params }

  // Trimite cu headere care imita un browser - 5starDesk are whitelist pe host
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://www.5stardesk.ro',
      'Referer': 'https://www.5stardesk.ro/',
      'Accept': 'application/json, text/plain, */*',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data)
}
