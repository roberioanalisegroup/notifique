import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.R2_BUCKET_NAME;

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log("HeadBucket OK:", bucket);
  const key = `test/${Date.now()}.txt`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from("test"),
      ContentType: "text/plain",
    })
  );
  console.log("PutObject OK:", key);
  console.log("Public domain:", process.env.R2_PUBLIC_CUSTOM_DOMAIN);
} catch (e) {
  console.error("ERROR:", e.name, e.message);
  if (e.$metadata) console.error("Metadata:", e.$metadata);
  process.exit(1);
}
