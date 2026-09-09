import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'

// Browserul incarca video-ul DIRECT in Vercel Blob (nu trece prin functia noastra serverless -
// Vercel limiteaza body-ul unui request catre o functie la 4.5MB, mult sub un reel/tiktok real).
// Acest endpoint doar autorizeaza upload-ul (genereaza un token temporar) - fisierul in sine
// nu trece niciodata pe aici.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
        // 25MB = limita OpenAI pentru transcriere audio (whisper) - nu are rost sa acceptam mai mult
        maximumSizeInBytes: 25 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
