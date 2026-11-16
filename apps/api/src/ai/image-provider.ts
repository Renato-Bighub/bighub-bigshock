import type { AiQuality, AiSize } from "@bigstock/billing";

export const IMAGE_PROVIDER = Symbol("IMAGE_PROVIDER");

export interface GenerateInput {
  prompt: string;
  size: AiSize;
  quality: AiQuality;
  /** Edição: imagem de referência (já autorizada: licenciada e com allows_ai_transform). */
  reference?: { bytes: Buffer; contentType: string };
}

export interface GenerateOutput {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
  providerRequestId?: string;
}

/** Classifica falhas para decidir entre repetir, falhar e devolver créditos. */
export class ProviderError extends Error {
  constructor(
    readonly kind: "content_rejected" | "transient" | "permanent",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Adaptador por fornecedor (CLAUDE.md §2): o domínio nunca fica acoplado a um fornecedor.
 * Trocar ou acrescentar fornecedores implica apenas uma nova implementação desta interface.
 */
export interface ImageProvider {
  readonly name: string;
  readonly model: string;
  readonly enabled: boolean;
  generate(input: GenerateInput): Promise<GenerateOutput>;
}

export class DisabledImageProvider implements ImageProvider {
  readonly name = "disabled";
  readonly model = "none";
  readonly enabled = false;
  generate(): Promise<GenerateOutput> {
    throw new ProviderError("permanent", "AI provider is not configured");
  }
}
