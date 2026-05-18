import { NextRequest, NextResponse } from "next/server";

const MODEL = "fal-ai/kling-video/v2.1/standard/image-to-video";

export async function GET(request: NextRequest) {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
  }

  const requestId = request.nextUrl.searchParams.get("id");
  if (!requestId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Use fal.ai-provided status_url if available, otherwise try result URL directly
  const statusUrl = request.nextUrl.searchParams.get("statusUrl");
  const pollUrl = statusUrl
    ?? `https://queue.fal.run/${MODEL}/requests/${requestId}`;

  const statusRes = await fetch(pollUrl, {
    headers: { Authorization: `Key ${falKey}`, Accept: "application/json" },
  });

  const statusText = await statusRes.text();
  console.log("[dolly-video/status] HTTP", statusRes.status, "body:", statusText.slice(0, 300));

  if (!statusText.trim()) {
    // fal.ai sometimes returns empty on non-200 — treat as failed
    if (!statusRes.ok) return NextResponse.json({ status: "FAILED", error: `fal.ai status ${statusRes.status}` });
    return NextResponse.json({ status: "IN_PROGRESS" });
  }

  let statusData: { status?: string; error?: string; response_url?: string; video?: { url: string } };
  try {
    statusData = JSON.parse(statusText);
  } catch {
    return NextResponse.json({ status: "IN_PROGRESS" });
  }

  if (statusData.status === "COMPLETED") {
    // Use response_url from status body if available — avoids wrong model path
    const responseUrl = statusData.response_url
      ?? `https://queue.fal.run/${MODEL}/requests/${requestId}`;
    const resultRes = await fetch(responseUrl, {
      headers: { Authorization: `Key ${falKey}` },
    });
    const resultText = await resultRes.text();
    console.log("[dolly-video/result] HTTP", resultRes.status, "body:", resultText.slice(0, 300));
    let result: { video?: { url: string }; outputs?: { video?: { url: string } }; error?: string } = {};
    try { result = JSON.parse(resultText); } catch { /* empty */ }
    const videoUrl = result.video?.url ?? (result.outputs as any)?.video?.url ?? null;
    return NextResponse.json({ status: "COMPLETED", videoUrl });
  }

  if (statusData.status === "FAILED") {
    return NextResponse.json({
      status: "FAILED",
      error: statusData.error ?? "Generation failed",
    });
  }

  return NextResponse.json({ status: statusData.status });
}
