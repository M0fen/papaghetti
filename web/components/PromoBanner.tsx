"use client";

import { useEffect, useState } from "react";
import type { Ajustes, Promo } from "@/lib/menu";

const tonoBg: Record<string, string> = {
  oro: "var(--pg-oro)",
  pomodoro: "var(--pg-pomodoro)",
  perejil: "var(--pg-perejil)",
};

export default function PromoBanner({ ajustes }: { ajustes: Ajustes }) {
  const banners: Promo[] = (ajustes.promos ?? []).filter((p) => p.activo && p.banner);
  const cerrado = ajustes.abierto === false;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % banners.length), 4500);
    return () => clearInterval(t);
  }, [banners.length]);

  if (!cerrado && banners.length === 0) return null;

  const actual = banners[i % Math.max(1, banners.length)];
  const bg = cerrado ? "var(--pg-espresso)" : tonoBg[actual?.tono ?? "oro"] ?? "var(--pg-oro)";
  const dark = !cerrado && (actual?.tono === "oro");

  return (
    <div className="promobar" style={{ background: bg, color: dark ? "var(--pg-espresso)" : "#fff" }}>
      {cerrado ? (
        <span className="promobar__txt">
          ⏸ Cerrado ahora · {ajustes.horarios}
        </span>
      ) : (
        <span className="promobar__txt" key={actual?.id}>
          {actual?.emoji ? `${actual.emoji} ` : ""}
          {actual?.texto}
        </span>
      )}
      {!cerrado && banners.length > 1 && (
        <span className="promobar__dots" aria-hidden>
          {banners.map((_, n) => (
            <i key={n} className={n === i ? "is-on" : ""} />
          ))}
        </span>
      )}
    </div>
  );
}
