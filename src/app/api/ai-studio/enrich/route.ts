import { NextRequest, NextResponse } from 'next/server';

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, images, audio, documents } = body;

    await new Promise(resolve => setTimeout(resolve, 1500));

    let enrichedPrompt = prompt || "";
    const originalPrompt = prompt || "";
    
    const contextParts = [];
    
    if (images && images.length > 0) {
        contextParts.push(`${images.length} visual reference${images.length > 1 ? 's' : ''}`);
    }
    
    if (audio) {
        contextParts.push("audio context");
    }
    
    if (documents && documents.length > 0) {
        contextParts.push(`${documents.length} document${documents.length > 1 ? 's' : ''}`);
    }

    if (contextParts.length > 0) {
        enrichedPrompt = `${originalPrompt}\n\n[Analysis of ${contextParts.join(', ')}]\nBased on the provided context, the prompt has been optimized for clarity and detail.`;
    } else {
        enrichedPrompt = `${originalPrompt} [Enhanced]`;
    }

    return NextResponse.json({ enrichedPrompt });
  } catch (error) {
    console.error("Enrichment failed:", error);
    return NextResponse.json({ error: "Failed to enrich prompt" }, { status: 500 });
  }
}
