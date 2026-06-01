import { NextRequest, NextResponse } from 'next/server'

const T1 = '3cvbat7zgH54347Artesrtyrt466yj57se4lkg4'
const T  = 'Y5paEuVpBBop8pHG1qLVF6ymqCdPkzlncJGK0L50'
const API = 'https://www.5stardesk.ro/apih.php'

export async function POST(req: NextRequest) {
  const { actiune, ...params } = await req.json()

  const body = { t1: T1, t: T, actiune, ...params }

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data)
}
