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
] as const;
export type Permission = (typeof permissions)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: permissions,
  admin: ["org:update", "members:read", "members:invite", "members:remove", "credits:read", "licenses:read", "licenses:create"],
  billing: ["members:read", "billing:manage", "credits:read", "licenses:read"],
  member: ["members:read", "credits:read", "licenses:read", "licenses:create"],
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
