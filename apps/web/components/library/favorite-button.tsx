"use client";

import { useT } from "@/components/i18n/provider";
import { Heart } from "lucide-react";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";

/** Coração de favoritos com atualização otimista. `onChange` informa o pai (listas, contagens). */
export function FavoriteButton({ orgId, assetId, favorited, onChange, onError, className = "", label = false }: {
  orgId: string; assetId: string; favorited: boolean; onChange: (next: boolean) => void; onError?: (message: string) => void; className?: string; label?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const t = useT();
  async function toggle() {
    if (busy) return;
    const next = !favorited;
    setBusy(true);
    onChange(next);
    try {
      await api(`/v1/organizations/${orgId}/favorites/${assetId}`, undefined, next ? "PUT" : "DELETE");
    } catch (e) {
      onChange(!next);
      onError?.(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={favorited}
      aria-label={favorited ? t("Remover dos favoritos") : t("Adicionar aos favoritos")}
      className={`flex items-center gap-1.5 rounded-full transition ${className}`}
    >
      <Heart size={18} className={favorited ? "fill-brand text-brand" : ""} />
      {label && <span className="text-sm font-bold">{favorited ? t("Favorito") : t("Favoritar")}</span>}
    </button>
  );
}
