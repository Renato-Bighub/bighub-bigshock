import { describe, expect, it } from "vitest";
import { assignableRoles, can, scopeForPermission } from "./permissions";

describe("permissões por papel", () => {
  it("owner pode tudo", () => {
    expect(can("owner", "members:change_role")).toBe(true);
    expect(can("owner", "billing:manage")).toBe(true);
  });
  it("admin gere membros mas não altera papéis nem faturação", () => {
    expect(can("admin", "members:invite")).toBe(true);
    expect(can("admin", "members:change_role")).toBe(false);
    expect(can("admin", "billing:manage")).toBe(false);
  });
  it("member só lê; billing só faturação", () => {
    expect(can("member", "members:invite")).toBe(false);
    expect(can("billing", "billing:manage")).toBe(true);
    expect(can("billing", "members:remove")).toBe(false);
  });
  it("ninguém convida como owner e admin não cria admins", () => {
    expect(assignableRoles("owner")).not.toContain("owner");
    expect(assignableRoles("admin")).toEqual(["member", "billing"]);
    expect(assignableRoles("member")).toEqual([]);
  });
  it("biblioteca: billing só lê; member escreve; nunca por chave de API", () => {
    expect(can("member", "library:write")).toBe(true);
    expect(can("billing", "library:read")).toBe(true);
    expect(can("billing", "library:write")).toBe(false);
    expect(scopeForPermission("library:read")).toBeUndefined();
    expect(scopeForPermission("library:write")).toBeUndefined();
  });
});
