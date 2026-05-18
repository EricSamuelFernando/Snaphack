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

    // nano-banana-2/edit supports up to 14 images total
    const cappedFurniture = furnitureUrls.slice(0, 13);

    const prompt =
      customPrompt?.trim() ||
      "The first image is a room. The remaining images are furniture items with their backgrounds removed. Place each furniture item from those reference images into the room — position them naturally on the floor with correct scale, perspective, and lighting to match the room. Keep the exact appearance of each piece.";

    const falRes = await fetch("https://fal.run/fal-ai/nano-banana-2/edit", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_urls: [roomImageUrl, ...cappedFurniture],
        prompt,
        num_images: 1,
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
