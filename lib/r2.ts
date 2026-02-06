import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// ----- Env validation -----

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

function getR2Config() {
  return {
    accountId: requireEnv("R2_ACCOUNT_ID"),
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucket: requireEnv("R2_BUCKET"),
  };
}

// ----- S3 Client (lazy singleton) -----

let _client: S3Client | null = null;

export function r2Client(): S3Client {
  if (_client) return _client;
  const cfg = getR2Config();
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return _client;
}

function bucket(): string {
  return requireEnv("R2_BUCKET");
}

// ----- Operations -----

export async function putObject({
  key,
  contentType,
  body,
}: {
  key: string;
  contentType: string;
  body: Buffer | Uint8Array;
}): Promise<void> {
  await r2Client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: contentType,
      Body: body,
    }),
  );
}

export async function getObject({
  key,
}: {
  key: string;
}): Promise<{ body: ReadableStream; contentType: string; contentLength: number }> {
  const res = await r2Client().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );

  if (!res.Body) {
    throw new Error(`Empty body for key: ${key}`);
  }

  return {
    body: res.Body.transformToWebStream(),
    contentType: res.ContentType ?? "application/octet-stream",
    contentLength: res.ContentLength ?? 0,
  };
}

export async function deleteObject({ key }: { key: string }): Promise<void> {
  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );
}

export async function headObject({
  key,
}: {
  key: string;
}): Promise<{ contentType: string; contentLength: number } | null> {
  try {
    const res = await r2Client().send(
      new HeadObjectCommand({
        Bucket: bucket(),
        Key: key,
      }),
    );
    return {
      contentType: res.ContentType ?? "application/octet-stream",
      contentLength: res.ContentLength ?? 0,
    };
  } catch (err: any) {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}
