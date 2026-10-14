import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/auth";

/**
 * Issues short-lived tokens so teachers can upload files directly from the
 * browser to Vercel Blob (bypassing the 4.5 MB serverless body limit).
 */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const user = await getCurrentUser();
        if (!user || user.role === "STUDENT") throw new Error("Only teachers and admins can upload files");
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: 500 * 1024 * 1024,
          allowedContentTypes: ["image/*", "video/*", "audio/*", "application/pdf", "application/*", "text/*"],
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
