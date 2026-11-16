import { z } from "zod";

export const assetKinds = ["photo", "vector", "illustration"] as const;

export const assetListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().max(60).optional(),
  kind: z.enum(assetKinds).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type AssetListQuery = z.infer<typeof assetListQuery>;

/** Representação pública de um ativo. Nunca inclui chaves de armazenamento nem direitos internos. */
export interface AssetDto {
  id: string;
  title: string;
  description: string | null;
  kind: (typeof assetKinds)[number];
  category: string;
  tags: string[];
  width: number;
  height: number;
  allows_ai_transform: boolean;
  preview_url: string;
  published_at: string | null;
}

export interface AssetListResponse {
  data: AssetDto[];
  pagination: { next_cursor: string | null; has_more: boolean };
  request_id: string;
}

export const createAssetBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  kind: z.enum(assetKinds).default("photo"),
  category: z.string().min(1).max(60),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  width: z.number().int().min(1).max(100000),
  height: z.number().int().min(1).max(100000),
  allowsAiTransform: z.boolean().default(false),
});
export type CreateAssetBody = z.infer<typeof createAssetBody>;

export const rightsBody = z.object({
  rightsHolder: z.string().trim().min(1).max(200),
  licenseBasis: z.string().trim().min(1).max(200),
  modelRelease: z.boolean().default(false),
  propertyRelease: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
  /** true = marca os direitos como verificados (só administradores da plataforma). */
  verified: z.boolean().default(false),
});
export type RightsBody = z.infer<typeof rightsBody>;

export const licenseBody = z.object({ assetId: z.uuid() });
export type LicenseBody = z.infer<typeof licenseBody>;

export const licenseListQuery = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export interface LicenseDto {
  id: string;
  created_at: string;
  license_type: string;
  terms_version: string;
  asset: Pick<AssetDto, "id" | "title" | "kind" | "width" | "height" | "preview_url">;
}
