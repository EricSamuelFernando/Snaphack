import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
  }

  const body = (await request.json()) as { imageUrl?: string };
  if (!body.imageUrl) {
    return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
  }

  const res = await fetch("https://fal.run/fal-ai/birefnet", {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image_url: body.imageUrl }),
  });

  const data = (await res.json()) as {
    image?: { url: string };
    error?: string;
    detail?: string;
  };

  if (!res.ok || data.error) {
    return NextResponse.json(
      { error: data.error ?? data.detail ?? `birefnet failed: ${res.status}` },
      { status: res.status }
    );
  }

  const imageUrl = data.image?.url;
  if (!imageUrl) {
    return NextResponse.json({ error: "No output from birefnet" }, { status: 500 });
  }

  return NextResponse.json({ imageUrl });
}
