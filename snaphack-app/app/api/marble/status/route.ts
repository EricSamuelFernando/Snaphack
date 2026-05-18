import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.worldlabs.ai/marble/v1";

export async function GET(request: NextRequest) {
  const key = process.env.WORLD_LABS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "WORLD_LABS_API_KEY not configured" }, { status: 500 });
  }

  const operationId = request.nextUrl.searchParams.get("id");
  if (!operationId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const res = await fetch(`${BASE}/operations/${operationId}`, {
    headers: { "WLT-Api-Key": key },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: `Status check failed: ${res.status}` },
      { status: res.status }
    );
  }

  const data = (await res.json()) as {
    done: boolean;
    response?: {
      assets?: {
        splats?: {
          spz_urls?: { "500k"?: string; "150k"?: string; full_res?: string };
          semantics_metadata?: { metric_scale_factor?: number; ground_plane_offset?: number };
        };
        imagery?: { pano_url?: string };
        mesh?: { collider_mesh_url?: string };
      };
    };
    error?: { message?: string } | string;
  };

  if (data.error) {
    const msg =
      typeof data.error === "string" ? data.error : (data.error.message ?? "Generation failed");
    return NextResponse.json({ status: "FAILED", error: msg });
  }

  if (data.done) {
    const splats = data.response?.assets?.splats;
    const spzUrls = splats?.spz_urls;
    const meta = splats?.semantics_metadata;
    return NextResponse.json({
      status: "COMPLETED",
      splatUrl: spzUrls?.["500k"] ?? spzUrls?.["150k"] ?? spzUrls?.full_res ?? null,
      panoUrl: data.response?.assets?.imagery?.pano_url ?? null,
      glbUrl: data.response?.assets?.mesh?.collider_mesh_url ?? null,
      metricScaleFactor: meta?.metric_scale_factor ?? 1,
      groundPlaneOffset: meta?.ground_plane_offset ?? 0,
    });
  }

  return NextResponse.json({ status: "IN_PROGRESS" });
}
