import { NextResponse } from "next/server";
import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth";
import { blobMode } from "@/lib/blob";

const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED_TYPES = ["image/*", "video/*", "audio/*", "application/pdf", "application/*", "text/*"];
/** Browser uploads may only write under these folders. */
const ALLOWED_PREFIXES = ["uploads/", "scorm-uploads/", "cert-evidence/"];

async function requireUploader() {
  const user = await getCurrentUser();
  if (!user || user.role === "STUDENT") throw new Error("Only teachers and admins can upload files");
}

/**
 * Lets teachers upload files directly from the browser to Vercel Blob
 * (bypassing the 4.5 MB serverless body limit). Supports both store types:
 * read-write token stores (client tokens) and OIDC stores (presigned URLs).
 */
export async function POST(req: Request) {
  const body = await req.json();
  try {
    if (blobMode() === "token") {
      const json = await handleUpload({
        body: body as HandleUploadBody,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          await requireUploader();
          if (!ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) throw new Error("Invalid upload path");
          return { addRandomSuffix: true, maximumSizeInBytes: MAX_BYTES, allowedContentTypes: ALLOWED_TYPES };
        },
        onUploadCompleted: async () => {},
      });
      return NextResponse.json(json);
    }
    if (blobMode() === "oidc") {
      const json = await handleUploadPresigned({
        body: body as HandleUploadPresignedBody,
        request: req,
        getSignedToken: async (pathname) => {
          await requireUploader();
          if (!ALLOWED_PREFIXES.some((p) => pathname.startsWith(p)) || pathname.includes("..")) throw new Error("Invalid upload path");
          const token = await issueSignedToken({
            pathname,
            operations: ["put"],
            maximumSizeInBytes: MAX_BYTES,
            allowedContentTypes: ALLOWED_TYPES,
            validUntil: Date.now() + 60 * 60 * 1000,
          });
          return { token, urlOptions: { maximumSizeInBytes: MAX_BYTES, allowedContentTypes: ALLOWED_TYPES } };
        },
      });
      return NextResponse.json(json);
    }
    return NextResponse.json({ error: "File storage isn't configured. Connect a Vercel Blob store and redeploy." }, { status: 501 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
