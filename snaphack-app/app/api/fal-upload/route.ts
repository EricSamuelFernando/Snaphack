import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file instanceof File ? file.name : "upload.jpg";
    const contentType = file.type || "image/jpeg";

    // Step 1: Initiate upload — get a pre-signed URL from fal.ai storage
    const initiateRes = await fetch(
      "https://rest.alpha.fal.ai/storage/upload/initiate",
      {
        method: "POST",
        headers: {
          Authorization: `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file_name: fileName, content_type: contentType }),
      }
    );

    if (!initiateRes.ok) {
      const errText = await initiateRes.text();
      console.error("fal.ai initiate error:", initiateRes.status, errText);
      return NextResponse.json(
        { error: `fal.ai storage initiate failed: ${initiateRes.status}` },
        { status: 502 }
      );
    }

    const initiateData = (await initiateRes.json()) as {
      upload_url: string;
      file_url: string;
    };

    if (!initiateData.upload_url || !initiateData.file_url) {
      return NextResponse.json(
        { error: "fal.ai did not return upload_url / file_url" },
        { status: 502 }
      );
    }

    // Step 2: Upload the actual file bytes to the pre-signed URL
    const arrayBuffer = await file.arrayBuffer();

    const uploadRes = await fetch(initiateData.upload_url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: arrayBuffer,
    });

    if (!uploadRes.ok) {
      console.error("fal.ai PUT error:", uploadRes.status);
      return NextResponse.json(
        { error: `fal.ai file upload failed: ${uploadRes.status}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: initiateData.file_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("fal-upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
