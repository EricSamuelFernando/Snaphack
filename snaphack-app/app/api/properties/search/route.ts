import { NextRequest, NextResponse } from "next/server";
import { Property } from "@/types";

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};

function parseQuery(query: string): Record<string, unknown> {
  const q = query.trim();

  // 5-digit zip
  if (/^\d{5}$/.test(q)) return { zip: q };

  // 2-letter state code
  if (/^[A-Za-z]{2}$/.test(q)) return { state: q.toUpperCase() };

  // "City, ST" format
  const cityState = q.match(/^(.+),\s*([A-Za-z]{2})$/);
  if (cityState) return { city: cityState[1].trim(), state: cityState[2].toUpperCase() };

  // Full state name
  const stateCode = STATE_NAMES[q.toLowerCase()];
  if (stateCode) return { state: stateCode };

  // Fallback: treat as city (works better with a state but try anyway)
  return { city: q };
}

interface MlsSearchItem {
  listingId?: string | number;
  listing?: {
    address?: {
      unparsedAddress?: string;
      city?: string;
      stateOrProvince?: string;
      zipCode?: string;
    };
    listPriceLow?: number;
    leadTypes?: { mlsListingPrice?: number };
    property?: {
      bedroomsTotal?: number;
      bathroomsTotal?: number;
      livingArea?: number;
    };
    media?: {
      primaryListingImageUrl?: string;
      photosList?: (string | { uri?: string; url?: string; href?: string })[];
      photos?: (string | { uri?: string; url?: string; href?: string })[];
      photosCount?: string;
    };
  };
}

function normalizeProperty(raw: MlsSearchItem, index: number): Property {
  const listing = raw.listing ?? {};
  const addr = listing.address ?? {};
  const prop = listing.property ?? {};
  const media = listing.media ?? {};

  const photos: string[] = [];

  const addPhoto = (p: unknown) => {
    if (typeof p === "string" && p.startsWith("http") && !photos.includes(p)) {
      photos.push(p);
    } else if (typeof p === "object" && p !== null) {
      const o = p as Record<string, unknown>;
      const url = (o.uri ?? o.url ?? o.href) as string | undefined;
      if (url && url.startsWith("http") && !photos.includes(url)) photos.push(url);
    }
  };

  if (media.primaryListingImageUrl) addPhoto(media.primaryListingImageUrl);
  (media.photosList ?? media.photos ?? []).forEach(addPhoto);

  return {
    id: String(raw.listingId ?? `prop-${index}`),
    listingId: raw.listingId ? Number(raw.listingId) : null,
    address: addr.unparsedAddress ?? "Unknown Address",
    city: addr.city ?? "",
    state: addr.stateOrProvince ?? "",
    zip: addr.zipCode ?? "",
    price: listing.listPriceLow ?? listing.leadTypes?.mlsListingPrice ?? null,
    bedrooms: prop.bedroomsTotal ?? null,
    bathrooms: prop.bathroomsTotal ?? null,
    sqft: prop.livingArea ?? null,
    photos,
    primaryPhoto: photos[0] ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query: string = body.query ?? "";

    if (!query.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const apiKey = process.env.REALESTATE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "REALESTATE_API_KEY not configured" }, { status: 500 });
    }

    const locationParams = parseQuery(query);
    const searchBody = {
      ...locationParams,
      active: true,
      has_photos: true,
      include_photos: true,
      size: 12,
    };

    const res = await fetch("https://api.realestateapi.com/v2/MLSSearch", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(searchBody),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("MLSSearch error:", res.status, text);
      return NextResponse.json(
        { error: `MLS search failed: ${res.status} — ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rawItems: MlsSearchItem[] = Array.isArray(data?.data) ? data.data : [];

    const properties: Property[] = rawItems
      .map((p, i) => normalizeProperty(p, i))
      .filter((p) => p.primaryPhoto !== null);

    return NextResponse.json({ properties });
  } catch (err) {
    console.error("Search route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
