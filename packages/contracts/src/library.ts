import { z } from "zod";

export const collectionBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});
export type CollectionBody = z.infer<typeof collectionBody>;

export const collectionPatchBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined, { message: "Nothing to update" });
export type CollectionPatchBody = z.infer<typeof collectionPatchBody>;

export const libraryListQuery = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export const LIBRARY_LIMITS = { collectionsPerOrg: 100, itemsPerCollection: 500, favoritesPerUser: 2000 } as const;

export interface LibraryAssetDto {
  id: string;
  title: string;
  kind: "photo" | "vector" | "illustration";
  width: number;
  height: number;
  preview_url: string;
}

export interface CollectionDto {
  id: string;
  name: string;
  description: string | null;
  item_count: number;
  cover_preview_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
