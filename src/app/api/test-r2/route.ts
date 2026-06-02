import { NextResponse } from "next/server";
import { getR2Client, getR2BucketName } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export async function GET() {
  try {
    const r2 = getR2Client();
    await r2.send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: "test-api.txt",
        Body: "hello from api",
        ContentType: "text/plain",
      })
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({
      error: "Test failed",
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
}
