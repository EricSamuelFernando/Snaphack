import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE = "https://api.worldlabs.ai/marble/v1";

export async function POST(request: NextRequest) {
  const key = process.env.WORLD_LABS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "WORLD_LABS_API_KEY not configured" }, { status: 500 });
  }

  const body = (await request.json()) as { imageUrl?: string; displayName?: string };
  if (!body.imageUrl) {
    return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
  }

  const res = await fetch(`${BASE}/worlds:generate`, {
    method: "POST",
    headers: {
      "WLT-Api-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      world_prompt: {
        type: "image",
        image_prompt: { source: "uri", uri: body.imageUrl },
        is_pano: false,
      },
      model: "marble-1.1",
      display_name: body.displayName?.trim() || "Snaphack listing",
      permission: { public: false },
    }),
  });

  const data = (await res.json()) as {
    operation_id?: string;
    message?: string;
    error?: string;
  };

  if (!res.ok || !data.operation_id) {
    console.error("World Labs marble error:", res.status, data);
    return NextResponse.json(
      { error: data.message ?? data.error ?? `World Labs request failed: ${res.status}` },
      { status: res.status }
    );
  }

  return NextResponse.json({ operationId: data.operation_id });
}
