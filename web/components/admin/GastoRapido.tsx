"use client";

/**
 * GASTOS DE UN TOQUE.
 *
 * Registrar el arriendo o el recibo de la luz obligaba a escribir el concepto, elegir
 * la categoría en un desplegable y teclear el monto: tres decisiones para algo que se
 * repite igual cada semana. Estos atajos rellenan concepto y categoría, y dejan el
 * cursor donde importa — en el monto, que es lo único que de verdad cambia.
 *
 * No sustituyen al formulario completo: lo alimentan.
 */

import { useState } from "react";
import { gastoCatEmoji, type GastoCategoria } from "@/lib/menu";

const ATAJOS: { txt: string; cat: GastoCategoria }[] = [
  { txt: "Arriendo", cat: "arriendo" },
  { txt: "Nómina", cat: "nomina" },
  { txt: "Luz", cat: "servicios" },
  { txt: "Agua", cat: "servicios" },
  { txt: "Gas", cat: "servicios" },
  { txt: "Internet", cat: "servicios" },
  { txt: "Aseo", cat: "otro" },
  { txt: "Empaques", cat: "otro" },
  { txt: "Transporte", cat: "otro" },
  { txt: "Publicidad", cat: "marketing" },
];

export default function GastoRapido() {
  const [usado, setUsado] = useState<string | null>(null);

  const rellenar = (a: (typeof ATAJOS)[number]) => {
    const form = document.querySelector<HTMLFormElement>(".gasto-form");
    if (!form) return;
    const concepto = form.querySelector<HTMLInputElement>('input[name="concepto"]');
    const categoria = form.querySelector<HTMLSelectElement>('select[name="categoria"]');
    const monto = form.querySelector<HTMLInputElement>('input[name="monto"]');
    if (concepto) concepto.value = a.txt;
    if (categoria) categoria.value = a.cat;
    setUsado(a.txt);
    monto?.focus();
    monto?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <div className="gasto-rapido">
      <span className="gasto-rapido__k">De un toque</span>
      <div className="gasto-rapido__chips">
        {ATAJOS.map((a) => (
          <button
            key={a.txt}
            type="button"
            className={`gasto-rapido__chip ${usado === a.txt ? "is-on" : ""}`}
            onClick={() => rellenar(a)}
          >
            <span aria-hidden>{gastoCatEmoji[a.cat]}</span> {a.txt}
          </button>
        ))}
      </div>
      <p className="gasto-rapido__nota">
        Rellena el concepto y la categoría; solo tienes que escribir cuánto.
      </p>
    </div>
  );
}
