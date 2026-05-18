import { NextResponse } from "next/server";

const BASE = "https://api.worldlabs.ai/marble/v1";

export async function GET() {
  const key = process.env.WORLD_LABS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "WORLD_LABS_API_KEY not configured" }, { status: 500 });
  }

  const res = await fetch(`${BASE}/worlds:list`, {
    method: "POST",
    headers: { "WLT-Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ page_size: 50 }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `World Labs list failed: ${res.status}` }, { status: res.status });
  }

  const data = (await res.json()) as {
    worlds?: {
      world_id: string;
      display_name?: string;
      created_at?: string;
      assets?: {
        thumbnail_url?: string;
        imagery?: { pano_url?: string };
        splats?: { spz_urls?: { "500k"?: string; "150k"?: string; full_res?: string } };
        mesh?: { collider_mesh_url?: string };
        splats_semantics_metadata?: { metric_scale_factor?: number; ground_plane_offset?: number };
      };
    }[];
  };

  const worlds = (data.worlds ?? []).map((w) => ({
    worldId: w.world_id,
    displayName: w.display_name ?? "Untitled",
    createdAt: w.created_at ?? null,
    thumbnailUrl: w.assets?.thumbnail_url ?? null,
  }));

  return NextResponse.json({ worlds });
}
