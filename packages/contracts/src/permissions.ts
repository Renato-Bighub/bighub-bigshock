import { z } from "zod";

export const roles = ["owner", "admin", "member", "billing"] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  "org:update",
  "members:read",
  "members:invite",
  "members:remove",
  "members:change_role",
  "billing:manage",
  "credits:read",
  "licenses:read",
  "licenses:create",
  "ai:generate",
  "ai:read",
  "api_keys:manage",
  "usage:read",
] as const;
export type Permission = (typeof permissions)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: permissions,
  admin: ["org:update", "members:read", "members:invite", "members:remove", "credits:read", "licenses:read", "licenses:create", "ai:generate", "ai:read", "api_keys:manage", "usage:read"],
  billing: ["members:read", "billing:manage", "credits:read", "licenses:read", "usage:read"],
  member: ["members:read", "credits:read", "licenses:read", "licenses:create", "ai:generate", "ai:read"],
};

export const can = (role: Role, permission: Permission): boolean => ROLE_PERMISSIONS[role].includes(permission);

/** Papéis que `actor` pode atribuir num convite. Nunca "owner" por convite. */
export function assignableRoles(actor: Role): readonly Exclude<Role, "owner">[] {
  if (actor === "owner") return ["admin", "member", "billing"];
  if (actor === "admin") return ["member", "billing"];
  return [];
}

export const inviteBody = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  role: z.enum(["admin", "member", "billing"]),
});
export type InviteBody = z.infer<typeof inviteBody>;

export const acceptInviteBody = z.object({ token: z.string().min(20).max(200) });

export const changeRoleBody = z.object({ role: z.enum(roles) });

/** Escopos de chaves de API. Chaves nunca gerem membros, faturação nem outras chaves. */
export const apiScopes = ["assets:read", "licenses:read", "licenses:write", "credits:read", "ai:read", "ai:generate", "usage:read"] as const;
export type ApiScope = (typeof apiScopes)[number];

const PERMISSION_SCOPE: Partial<Record<Permission, ApiScope>> = {
  "licenses:read": "licenses:read",
  "licenses:create": "licenses:write",
  "credits:read": "credits:read",
  "ai:read": "ai:read",
  "ai:generate": "ai:generate",
  "usage:read": "usage:read",
};
/** Escopo exigido a uma chave para exercer a permissão; undefined = não disponível por API. */
export const scopeForPermission = (p: Permission): ApiScope | undefined => PERMISSION_SCOPE[p];

export const createApiKeyBody = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(apiScopes)).min(1).max(apiScopes.length),
  expiresInDays: z.number().int().min(1).max(730).optional(),
});
export type CreateApiKeyBody = z.infer<typeof createApiKeyBody>;

export const emailSchema = z.email().max(254).transform((e) => e.toLowerCase());
export const newPasswordSchema = z.string().min(12).max(128);
export const forgotPasswordBody = z.object({ email: emailSchema });
export const resetPasswordBody = z.object({ token: z.string().min(20).max(200), password: newPasswordSchema });
export const verifyEmailBody = z.object({ token: z.string().min(20).max(200) });
export const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: newPasswordSchema });
