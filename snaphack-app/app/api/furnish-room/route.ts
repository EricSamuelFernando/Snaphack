import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
    }

    const body = await request.json() as {
      roomImageUrl?: string;
      furnitureUrls?: string[];
      customPrompt?: string;
    };

    const { roomImageUrl, furnitureUrls, customPrompt } = body;

    if (!roomImageUrl) {
      return NextResponse.json({ error: "roomImageUrl is required" }, { status: 400 });
    }

    if (!furnitureUrls || furnitureUrls.length === 0) {
      return NextResponse.json({ error: "At least one furnitureUrl is required" }, { status: 400 });
    }

    // Model accepts max 4 images total (1 room + up to 3 furniture)
    const cappedFurniture = furnitureUrls.slice(0, 3);

    const prompt =
      customPrompt?.trim() ||
      "Arrange the furniture and decor pieces from the reference images naturally in the room. Maintain realistic proportions, natural lighting, and coherent interior design style.";

    const falRes = await fetch("https://fal.run/fal-ai/flux-pro/kontext/multi", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_urls: [roomImageUrl, ...cappedFurniture],
        prompt,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        output_format: "jpeg",
      }),
    });

    const data = (await falRes.json()) as {
      images?: { url: string }[];
      error?: string;
      detail?: unknown;
    };

    if (!falRes.ok || data.error) {
      console.error("fal.ai furnish-room error:", falRes.status, data);
      const errMsg = typeof data.error === "string"
        ? data.error
        : typeof data.detail === "string"
          ? data.detail
          : `fal.ai request failed: ${falRes.status}`;
      return NextResponse.json({ error: errMsg }, { status: falRes.status });
    }

    const resultImageUrl = data.images?.[0]?.url;
    if (!resultImageUrl) {
      return NextResponse.json({ error: "No output image from fal.ai" }, { status: 500 });
    }

    return NextResponse.json({ resultImageUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("furnish-room error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
