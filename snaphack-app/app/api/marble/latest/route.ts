import { NextResponse } from "next/server";

const BASE = "https://api.worldlabs.ai/marble/v1";

export async function GET() {
  const key = process.env.WORLD_LABS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "WORLD_LABS_API_KEY not configured" }, { status: 500 });
  }

  // Fetch the most recently created world using the correct list endpoint
  const res = await fetch(`${BASE}/worlds:list`, {
    method: "POST",
    headers: {
      "WLT-Api-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_size: 1 }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `World Labs list failed: ${res.status}` }, { status: res.status });
  }

  const data = (await res.json()) as {
    worlds?: {
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
    }[];
  };

  const world = data.worlds?.[0];
  if (!world) {
    return NextResponse.json({ error: "No worlds found" }, { status: 404 });
  }

  const splats = world.assets?.splats;
  const spzUrls = splats?.spz_urls;
  const meta = splats?.semantics_metadata;

  return NextResponse.json({
    worldId: world.world_id,
    displayName: world.display_name ?? "Untitled world",
    panoUrl: world.assets?.imagery?.pano_url ?? null,
    splatUrl: spzUrls?.["500k"] ?? spzUrls?.["150k"] ?? spzUrls?.full_res ?? null,
    glbUrl: world.assets?.mesh?.collider_mesh_url ?? null,
    thumbnailUrl: world.assets?.thumbnail_url ?? null,
    metricScaleFactor: meta?.metric_scale_factor ?? 1,
    groundPlaneOffset: meta?.ground_plane_offset ?? 0,
  });
}
