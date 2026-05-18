import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MODEL = "fal-ai/kling-video/v2.1/standard/image-to-video";

export async function POST(request: NextRequest) {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
  }

  const body = (await request.json()) as { imageUrl?: string };
  if (!body.imageUrl) {
    return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
  }

  const res = await fetch(`https://queue.fal.run/${MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: body.imageUrl,
      prompt:
        "Smooth cinematic dolly push slowly forward into the room, no people, photorealistic real estate photography, steady camera movement",
      duration: "5",
    }),
  });

  const raw = await res.text();
  console.log("[dolly-video/submit] HTTP", res.status, "body:", raw.slice(0, 400));

  let data: { request_id?: string; status_url?: string; response_url?: string; error?: string };
  try { data = JSON.parse(raw); } catch { data = {}; }

  if (!res.ok || !data.request_id) {
    return NextResponse.json(
      { error: data.error ?? `queue submit failed: ${res.status}` },
      { status: res.status }
    );
  }

  return NextResponse.json({
    requestId: data.request_id,
    statusUrl: data.status_url ?? null,
    responseUrl: data.response_url ?? null,
  });
}
