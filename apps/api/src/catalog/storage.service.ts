import { Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Armazenamento de objetos. Driver local para desenvolvimento; S3/R2 entram
 * atrás desta mesma interface (CLAUDE.md §2). As chaves nunca saem da API.
 */
@Injectable()
export class StorageService {
  private readonly root = resolve(process.env.STORAGE_DIR ?? ".storage");

  private path(key: string) {
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + "/")) throw new Error("invalid storage key");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.path(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }
}
