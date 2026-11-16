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

// ---------------------------------------------------------------------------
// IA (Fase 4)
// ---------------------------------------------------------------------------
export const aiSizes = ["1024x1024", "1536x1024", "1024x1536"] as const;
export const aiQualities = ["standard", "high"] as const;

export const aiModes = ["image", "logo"] as const;
export const logoStyles = ["minimalista", "moderno", "classico", "geometrico", "manuscrito", "mascote", "emblema"] as const;
export const logoTypes = ["simbolo_e_nome", "monograma", "so_nome", "so_simbolo"] as const;

/** Briefing de marca (modo logo). Validado no backend; o prompt final é montado no servidor. */
export const logoBrief = z.object({
  brandName: z.string().trim().min(1).max(40),
  tagline: z.string().trim().max(80).optional(),
  sector: z.string().trim().min(2).max(80),
  style: z.enum(logoStyles).default("minimalista"),
  type: z.enum(logoTypes).default("simbolo_e_nome"),
  /** Cores preferidas em hex (#RRGGBB), até 3. Vazio = livre escolha do modelo. */
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(3).default([]),
});
export type LogoBrief = z.infer<typeof logoBrief>;

export const aiRequestBody = z
  .object({
    mode: z.enum(aiModes).default("image"),
    /** Imagem: descrição livre. Logo: ideias adicionais (opcional). */
    prompt: z.string().trim().max(2000).default(""),
    size: z.enum(aiSizes).default("1024x1024"),
    quality: z.enum(aiQualities).default("standard"),
    /** Edição: ativo licenciado pela organização e com allows_ai_transform. */
    referenceAssetId: z.uuid().optional(),
    brief: logoBrief.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "image" && v.prompt.length < 3) ctx.addIssue({ code: "custom", path: ["prompt"], message: "Prompt must have at least 3 characters" });
    if (v.mode === "logo" && !v.brief) ctx.addIssue({ code: "custom", path: ["brief"], message: "Logo brief is required" });
    if (v.mode === "logo" && v.referenceAssetId) ctx.addIssue({ code: "custom", path: ["referenceAssetId"], message: "Logo mode does not accept a reference asset" });
  });
export type AiRequestBody = z.infer<typeof aiRequestBody>;

export const aiJobBody = aiRequestBody.extend({
  /** Custo que o utilizador viu antes de confirmar. O backend recalcula e recusa se divergir. */
  expectedCostCredits: z.number().int().positive(),
});
export type AiJobBody = z.infer<typeof aiJobBody>;

export interface AiJobDto {
  id: string;
  kind: "generate" | "edit" | "logo";
  prompt: string;
  /** Briefing de marca quando kind = logo. */
  brief: LogoBrief | null;
  size: string;
  quality: string;
  status: "queued" | "running" | "succeeded" | "failed";
  cost_credits: number;
  error_code: string | null;
  /** Conteúdo sintético: sinalizado na interface (AI Act art. 50). */
  ai_generated: true;
  provider: string | null;
  model: string | null;
  output_url: string | null;
  created_at: string;
  finished_at: string | null;
}
