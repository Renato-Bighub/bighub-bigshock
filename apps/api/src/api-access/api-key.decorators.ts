import { SetMetadata } from "@nestjs/common";
import type { ApiScope } from "@bigstock/contracts";

export const API_KEY_SCOPE = "api_key_scope";
export const API_KEY_ORG = "api_key_org";

/** Rota sem organização na URL disponível a chaves de API com este escopo. */
export const ApiKeyScope = (scope: ApiScope) => SetMetadata(API_KEY_SCOPE, scope);
/** Rota de organização disponível a chaves de API (as permissões são mapeadas para escopos no OrgGuard). */
export const ApiKeyOrgRoute = () => SetMetadata(API_KEY_ORG, true);
