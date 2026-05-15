import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const listingId: number | undefined = body.listing_id;

    if (!listingId) {
      return NextResponse.json({ error: "listing_id is required" }, { status: 400 });
    }

    const apiKey = process.env.REALESTATE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "REALESTATE_API_KEY not configured" }, { status: 500 });
    }

    const res = await fetch("https://api.realestateapi.com/v2/MLSDetail", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ listing_id: listingId }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("MLSDetail error:", res.status, text);
      return NextResponse.json(
        { error: `MLS detail failed: ${res.status} — ${text}` },
        { status: res.status }
      );
    }

    const json = await res.json();
    const data = json?.data ?? {};

    const photos: string[] = [];
    const media = data?.media ?? {};

    const addPhoto = (p: unknown) => {
      if (typeof p === "string" && p.startsWith("http") && !photos.includes(p)) {
        photos.push(p);
      } else if (typeof p === "object" && p !== null) {
        const o = p as Record<string, unknown>;
        // MLS response uses highRes/midRes/lowRes — prefer highest quality
        const url = (o.highRes ?? o.midRes ?? o.lowRes ?? o.uri ?? o.url ?? o.href) as string | undefined;
        if (url && url.startsWith("http") && !photos.includes(url)) photos.push(url);
      }
    };

    addPhoto(media.primaryListingImageUrl);
    (media.photosList ?? media.photos ?? []).forEach(addPhoto);

    return NextResponse.json({ photos, raw: data });
  } catch (err) {
    console.error("Detail route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
