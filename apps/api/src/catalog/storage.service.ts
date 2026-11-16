import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface SignedDownloadOptions {
  filename: string;
  contentType: string;
  ttlSeconds?: number;
}

/**
 * Armazenamento de objetos atrás de uma interface única (CLAUDE.md §2).
 * - S3/R2 quando S3_BUCKET está definido (obrigatório na Vercel: o disco é só de leitura).
 * - Disco local em desenvolvimento.
 * As chaves de armazenamento nunca saem da API.
 */
@Injectable()
export class StorageService {
  private readonly root = resolve(process.env.STORAGE_DIR ?? ".storage");
  private readonly bucket = process.env.S3_BUCKET;
  private s3?: S3Client;

  /** Permite injetar um cliente S3 (testes). */
  constructor(@Optional() @Inject("S3_CLIENT") s3?: S3Client) {
    this.s3 = s3;
  }

  get usesObjectStorage(): boolean {
    return Boolean(this.bucket);
  }

  private client(): S3Client {
    this.s3 ??= new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
    return this.s3;
  }

  private assertConfigured() {
    if (!this.bucket && process.env.VERCEL) {
      throw new Error("Object storage is required on Vercel (filesystem is read-only): set S3_BUCKET and credentials");
    }
  }

  private path(key: string) {
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + "/")) throw new Error("invalid storage key");
    return full;
  }

  async put(key: string, data: Buffer, contentType = "application/octet-stream"): Promise<void> {
    this.assertConfigured();
    if (this.bucket) {
      await this.client().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
      return;
    }
    const full = this.path(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    this.assertConfigured();
    if (this.bucket) {
      const res = await this.client().send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    }
    return readFile(this.path(key));
  }

  /**
   * URL assinado de curta validade direto para o armazenamento (evita o limite de
   * resposta das funções serverless). Devolve null no driver local: a API faz stream.
   */
  async signedDownloadUrl(key: string, opts: SignedDownloadOptions): Promise<string | null> {
    if (!this.bucket) return null;
    return getSignedUrl(
      this.client(),
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: opts.contentType,
        ResponseContentDisposition: `attachment; filename="${opts.filename}"`,
      }),
      { expiresIn: opts.ttlSeconds ?? 60 },
    );
  }
}
