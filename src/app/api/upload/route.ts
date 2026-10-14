import { NextResponse } from "next/server";
import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { blobMode } from "@/lib/blob";
import { authorizeUpload } from "@/lib/upload-rules";

/**
 * Lets users upload files directly from the browser to Vercel Blob (bypassing
 * the 4.5 MB serverless body limit). Who may upload what is decided per folder
 * in src/lib/upload-rules.ts. Supports both store types: read-write token
 * stores (client tokens) and OIDC stores (presigned URLs).
 */
export async function POST(req: Request) {
  const body = await req.json();
  try {
    if (blobMode() === "token") {
      const json = await handleUpload({
        body: body as HandleUploadBody,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          const { rule } = await authorizeUpload(pathname);
          return { addRandomSuffix: true, maximumSizeInBytes: rule.maxBytes, allowedContentTypes: rule.allowedContentTypes };
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
          const { rule } = await authorizeUpload(pathname);
          const token = await issueSignedToken({
            pathname,
            operations: ["put"],
            maximumSizeInBytes: rule.maxBytes,
            allowedContentTypes: rule.allowedContentTypes,
            validUntil: Date.now() + 60 * 60 * 1000,
          });
          return { token, urlOptions: { maximumSizeInBytes: rule.maxBytes, allowedContentTypes: rule.allowedContentTypes } };
        },
      });
      return NextResponse.json(json);
    }
    return NextResponse.json({ error: "File storage isn't configured. Connect a Vercel Blob store and redeploy." }, { status: 501 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
