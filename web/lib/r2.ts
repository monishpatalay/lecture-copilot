import { AwsClient } from "aws4fetch";

// Server-side only: signs requests to R2's S3 API with the secret key.
const r2 = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  service: "s3",
  region: "auto",
});

const UPLOAD_URL_SECONDS = 60 * 60; // the upload has to start within the hour; it may run longer

const objectUrl = (key: string) =>
  `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${key}`;

/** A URL the browser can PUT the file to directly. It only accepts this key and this content type. */
export async function presignUpload(key: string, contentType: string): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_URL_SECONDS));
  const signed = await r2.sign(new Request(url, { method: "PUT", headers: { "Content-Type": contentType } }), {
    // allHeaders: Content-Type is left out of the signature by default.
    aws: { signQuery: true, allHeaders: true },
  });
  return signed.url;
}

/** Size in bytes, or null when the object doesn't exist. */
export async function objectSize(key: string): Promise<number | null> {
  const res = await r2.fetch(objectUrl(key), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD ${key} failed with ${res.status}`);
  return Number(res.headers.get("content-length"));
}

export async function deleteObject(key: string): Promise<void> {
  const res = await r2.fetch(objectUrl(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${key} failed with ${res.status}`);
}

/** Deletes every object under a prefix, e.g. all of one lecture's files ("lectures/<id>/"). */
export async function deletePrefix(prefix: string): Promise<void> {
  const bucketUrl = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`;
  // A listing returns at most 1,000 keys; the deleted ones are gone from the next listing, so loop until empty.
  for (;;) {
    const res = await r2.fetch(`${bucketUrl}?list-type=2&prefix=${encodeURIComponent(prefix)}`);
    if (!res.ok) throw new Error(`R2 LIST ${prefix} failed with ${res.status}`);
    const keys = [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1]);
    if (keys.length === 0) return;
    await Promise.all(keys.map(deleteObject));
  }
}
