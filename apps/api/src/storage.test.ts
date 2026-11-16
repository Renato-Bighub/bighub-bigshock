import { S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";
import { StorageService } from "./catalog/storage.service.js";

describe("StorageService (S3/R2)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("gera URL assinado de curta validade, só para o objeto pedido, com nome de ficheiro", async () => {
    process.env.S3_BUCKET = "bigstock-test";
    process.env.S3_ENDPOINT = "https://example.r2.cloudflarestorage.com";
    const client = new S3Client({ region: "auto", endpoint: process.env.S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: "AKIATEST", secretAccessKey: "secret" } });
    const url = await new StorageService(client).signedDownloadUrl("originals/abc.png", { filename: "imagem.png", contentType: "image/png" });
    expect(url).toBeTruthy();
    const u = new URL(url!);
    expect(u.pathname).toBe("/bigstock-test/originals/abc.png");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(u.searchParams.get("response-content-disposition")).toBe('attachment; filename="imagem.png"');
    expect(u.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });

  it("sem S3_BUCKET usa disco local (sem redirecionamento)", async () => {
    delete process.env.S3_BUCKET;
    expect(await new StorageService().signedDownloadUrl("x", { filename: "a", contentType: "image/png" })).toBeNull();
  });

  it("na Vercel exige armazenamento de objetos", async () => {
    delete process.env.S3_BUCKET;
    process.env.VERCEL = "1";
    await expect(new StorageService().put("k", Buffer.from("x"))).rejects.toThrow(/Object storage is required/);
  });
});
