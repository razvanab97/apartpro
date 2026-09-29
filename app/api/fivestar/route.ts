import { NextRequest, NextResponse } from 'next/server'

const T1 = '3cvbat7zgH54347Artesrtyrt466yj57se4lkg4'
const T  = 'Y5paEuVpBBop8pHG1qLVF6ymqCdPkzlncJGK0L50'
const API = 'https://www.5stardesk.ro/apih.php'

export async function POST(req: NextRequest) {
  const { actiune, ...params } = await req.json()

  const body = { t1: T1, t: T, actiune, ...params }

  let res: Response
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'Nu am putut contacta 5starDesk', detaliu: String(e?.message || e) }, { status: 502 })
  }

  const raw = await res.text()
  try {
    const data = JSON.parse(raw)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({
      error: '5starDesk nu a răspuns cu JSON valid',
      statusHttp: res.status,
      lungimeRaspuns: raw.length,
      raspunsBrut: raw.slice(0, 1000),
    }, { status: 502 })
  }
}
