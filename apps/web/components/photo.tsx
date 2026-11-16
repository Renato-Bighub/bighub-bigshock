"use client";

import { useState } from "react";

/** Imagem com fundo em gradiente: se o ficheiro não existir (imagens não versionadas), mantém o gradiente. */
export function Photo({ file, alt, className = "" }: { file: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-[#2b3440] to-[#11161d] ${className}`}>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/images/${file}`} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      )}
    </div>
  );
}
