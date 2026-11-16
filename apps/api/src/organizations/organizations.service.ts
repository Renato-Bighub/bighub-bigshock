import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import {
  and,
  auditEvents,
  eq,
  enterTenant,
  gt,
  invitations,
  isNull,
  creditEntries,
  organizationMembers,
  organizations,
  users,
  withTenant,
  withUser,
  type Database,
} from "@bigstock/database";
import { availableBalance, type CreditEntry } from "@bigstock/billing";
import { assignableRoles, type InviteBody, type Role } from "@bigstock/contracts";
import { DB } from "../database.module.js";
import { EmailService } from "../mail/email.service.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export interface Actor {
  id: string;
  role: Role;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly email: EmailService,
  ) {}

  listMembers(orgId: string) {
    return withTenant(this.db, orgId, (tx) =>
      tx
        .select({
          user_id: users.id,
          email: users.email,
          display_name: users.displayName,
          role: organizationMembers.role,
        })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(eq(organizationMembers.organizationId, orgId)),
    );
  }

  /** Saldo disponível = soma do livro de movimentos (nunca uma coluna). */
  async creditBalance(orgId: string): Promise<number> {
    const rows = await withTenant(this.db, orgId, (tx) =>
      tx.select().from(creditEntries).where(eq(creditEntries.organizationId, orgId)),
    );
    return availableBalance(rows as CreditEntry[], new Date());
  }

  async invite(orgId: string, actor: Actor, body: InviteBody, requestId: string) {
    if (!(assignableRoles(actor.role) as readonly string[]).includes(body.role)) {
      throw new ForbiddenException({ code: "forbidden", message: `Role ${actor.role} cannot invite as ${body.role}` });
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const created = await withTenant(this.db, orgId, async (tx) => {
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .innerJoin(organizationMembers, eq(organizationMembers.userId, users.id))
        .where(and(eq(users.email, body.email), eq(organizationMembers.organizationId, orgId)));
      if (existing.length > 0) throw new ConflictException({ code: "already_member", message: "User is already a member" });
      // Um convite pendente por email: os anteriores são revogados.
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.email, body.email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
      const [inv] = await tx
        .insert(invitations)
        .values({ organizationId: orgId, email: body.email, role: body.role, tokenHash: sha256(token), invitedBy: actor.id, expiresAt })
        .returning();
      await tx.insert(auditEvents).values({
        organizationId: orgId,
        actorUserId: actor.id,
        action: "invitation.create",
        resourceType: "invitation",
        resourceId: inv!.id,
        requestId,
        metadata: { email: body.email, role: body.role },
      });
      return { id: inv!.id, email: inv!.email, role: inv!.role, expires_at: expiresAt.toISOString() };
    });

    // Com fornecedor de e-mail real o token vai só para o convidado; sem ele (dev) devolve-se a quem convida.
    const [inviter] = await this.db.select({ name: users.displayName, email: users.email }).from(users).where(eq(users.id, actor.id));
    const orgName = await withTenant(this.db, orgId, async (tx) => (await tx.select({ n: organizations.name }).from(organizations).where(eq(organizations.id, orgId)))[0]?.n ?? "BIGstock");
    const delivered = await this.email.sendInvitation(body.email, inviter?.name ?? inviter?.email ?? "Um colega", orgName, token).catch(() => false);
    if (delivered) {
      await withTenant(this.db, orgId, (tx) => tx.update(invitations).set({ emailedAt: new Date() }).where(eq(invitations.id, created.id)));
      return { ...created, emailed: true as const };
    }
    return { ...created, emailed: false as const, token };
  }

  listInvitations(orgId: string) {
    return withTenant(this.db, orgId, (tx) =>
      tx
        .select({ id: invitations.id, email: invitations.email, role: invitations.role, expires_at: invitations.expiresAt })
        .from(invitations)
        .where(and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date()))),
    );
  }

  async revokeInvitation(orgId: string, actor: Actor, invitationId: string, requestId: string) {
    await withTenant(this.db, orgId, async (tx) => {
      const rows = await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .returning({ id: invitations.id });
      if (rows.length === 0) throw new NotFoundException({ code: "not_found", message: "Invitation not found" });
      await tx.insert(auditEvents).values({
        organizationId: orgId, actorUserId: actor.id, action: "invitation.revoke",
        resourceType: "invitation", resourceId: invitationId, requestId,
      });
    });
  }

  async acceptInvitation(user: { id: string; email: string }, token: string, requestId: string) {
    const invalid = () => new BadRequestException({ code: "invalid_invitation", message: "Invitation is invalid or expired" });
    return withUser(
      this.db,
      user.id,
      async (tx) => {
        const [inv] = await tx.select().from(invitations).where(eq(invitations.tokenHash, sha256(token)));
        if (!inv || inv.email !== user.email || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= new Date()) throw invalid();
        // E-mail verificado: o convite enviado por e-mail prova a posse do endereço; sem isso, exige-se verificação
        // quando existe entrega real de e-mail (em dev sem fornecedor não há como verificar).
        const [acct] = await tx.select({ verified: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id));
        if (!acct?.verified) {
          if (inv.emailedAt) await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
          else if (this.email.delivers) throw new ForbiddenException({ code: "email_not_verified", message: "Verify your e-mail address before accepting invitations" });
        }
        await enterTenant(tx, inv.organizationId);
        const [already] = await tx
          .select({ id: organizationMembers.id })
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, inv.organizationId), eq(organizationMembers.userId, user.id)));
        if (already) throw new ConflictException({ code: "already_member", message: "Already a member" });
        await tx.insert(organizationMembers).values({ organizationId: inv.organizationId, userId: user.id, role: inv.role });
        await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
        await tx.insert(auditEvents).values({
          organizationId: inv.organizationId, actorUserId: user.id, action: "invitation.accept",
          resourceType: "invitation", resourceId: inv.id, requestId,
        });
        return { organization_id: inv.organizationId, role: inv.role };
      },
      { email: user.email },
    );
  }

  async changeRole(orgId: string, actor: Actor, targetUserId: string, role: Role, requestId: string) {
    await withTenant(this.db, orgId, async (tx) => {
      const [target] = await tx
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, targetUserId)));
      if (!target) throw new NotFoundException({ code: "not_found", message: "Member not found" });
      if (target.role === "owner" && role !== "owner") await this.assertAnotherOwner(tx, orgId, targetUserId);
      await tx
        .update(organizationMembers)
        .set({ role })
        .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, targetUserId)));
      await tx.insert(auditEvents).values({
        organizationId: orgId, actorUserId: actor.id, action: "member.change_role",
        resourceType: "user", resourceId: targetUserId, requestId, metadata: { from: target.role, to: role },
      });
    });
  }

  async removeMember(orgId: string, actor: Actor, targetUserId: string, requestId: string) {
    await withTenant(this.db, orgId, async (tx) => {
      const [target] = await tx
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, targetUserId)));
      if (!target) throw new NotFoundException({ code: "not_found", message: "Member not found" });
      // Só owners removem owners ou admins.
      if ((target.role === "owner" || target.role === "admin") && actor.role !== "owner") {
        throw new ForbiddenException({ code: "forbidden", message: "Only owners can remove owners or admins" });
      }
      if (target.role === "owner") await this.assertAnotherOwner(tx, orgId, targetUserId);
      await tx
        .delete(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, targetUserId)));
      await tx.insert(auditEvents).values({
        organizationId: orgId, actorUserId: actor.id, action: "member.remove",
        resourceType: "user", resourceId: targetUserId, requestId, metadata: { role: target.role },
      });
    });
  }

  private async assertAnotherOwner(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], orgId: string, excludeUserId: string) {
    const owners = await tx
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.role, "owner")));
    if (!owners.some((o) => o.userId !== excludeUserId)) {
      throw new ConflictException({ code: "last_owner", message: "An organization must keep at least one owner" });
    }
  }
}
