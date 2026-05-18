import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.worldlabs.ai/marble/v1";

export async function GET(request: NextRequest) {
  const key = process.env.WORLD_LABS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "WORLD_LABS_API_KEY not configured" }, { status: 500 });
  }

  const worldId = request.nextUrl.searchParams.get("id");
  if (!worldId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const res = await fetch(`${BASE}/worlds/${worldId}`, {
    headers: { "WLT-Api-Key": key },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `World Labs fetch failed: ${res.status}` }, { status: res.status });
  }

  const data = (await res.json()) as {
    world_id: string;
    display_name?: string;
    assets?: {
      splats?: {
        spz_urls?: { "500k"?: string; "150k"?: string; "100k"?: string; full_res?: string };
        semantics_metadata?: { metric_scale_factor?: number; ground_plane_offset?: number };
      };
      mesh?: { collider_mesh_url?: string };
      imagery?: { pano_url?: string };
      thumbnail_url?: string;
    };
  };

  const splats = data.assets?.splats;
  const spzUrls = splats?.spz_urls;
  const meta = splats?.semantics_metadata;

  return NextResponse.json({
    worldId: data.world_id,
    displayName: data.display_name ?? "Untitled",
    panoUrl: data.assets?.imagery?.pano_url ?? null,
    splatUrl: spzUrls?.["500k"] ?? spzUrls?.["150k"] ?? spzUrls?.full_res ?? null,
    glbUrl: data.assets?.mesh?.collider_mesh_url ?? null,
    thumbnailUrl: data.assets?.thumbnail_url ?? null,
    metricScaleFactor: meta?.metric_scale_factor ?? 1,
    groundPlaneOffset: meta?.ground_plane_offset ?? 0,
  });
}
