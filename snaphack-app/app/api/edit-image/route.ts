import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const imageUrl: string = body.imageUrl ?? "";
    const prompt: string = body.prompt ?? "";

    if (!imageUrl || !prompt) {
      return NextResponse.json({ error: "imageUrl and prompt are required" }, { status: 400 });
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
    }

    const falRes = await fetch("https://fal.run/fal-ai/flux-pro/kontext", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt,
        output_format: "jpeg",
      }),
    });

    const data = await falRes.json() as {
      images?: { url: string }[];
      error?: string;
      detail?: string;
    };

    if (!falRes.ok || data.error) {
      console.error("fal.ai error:", falRes.status, data);
      return NextResponse.json(
        { error: data.error ?? data.detail ?? `fal.ai request failed: ${falRes.status}` },
        { status: falRes.status }
      );
    }

    const resultUrl = data.images?.[0]?.url;
    if (!resultUrl) {
      return NextResponse.json({ error: "No output image from fal.ai" }, { status: 500 });
    }

    return NextResponse.json({ editedImageUrl: resultUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Edit-image error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
