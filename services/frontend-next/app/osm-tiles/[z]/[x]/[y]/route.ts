import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await context.params
  const cleanY = y.endsWith('.png') ? y.slice(0, -4) : y
  const tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${cleanY}.png`

  try {
    const res = await fetch(tileUrl, {
      headers: {
        'User-Agent': 'ASEAN-Disease-Surveillance-Portal/1.0 (health-surveillance@kemkes.go.id)',
      },
    })

    if (!res.ok) {
      return new NextResponse(null, { status: res.status })
    }

    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    return new NextResponse(null, { status: 502 })
  }
}
