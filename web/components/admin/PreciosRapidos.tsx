"use client";

/**
 * EL LÁPIZ: PRECIOS Y PRODUCTOS SIN SALIR DE PEDIDOS.
 *
 * Los precios no se cambian en un momento tranquilo. Se cambian cuando subió el queso,
 * cuando alguien escribió mal un nombre, cuando hoy hay un plato que no estaba en la
 * carta — y todo eso pasa con gente esperando, en la pantalla de Pedidos. Mandar al
 * operario a /admin/menu, buscar la ficha entre cuarenta y volver era suficiente
 * fricción para que no lo hiciera: el precio viejo se cobraba toda la noche.
 *
 * Por eso esto es una hoja que se abre encima de Pedidos, con una sola cosa dentro:
 * NOMBRE y PRECIO. Ni fotos, ni recetas, ni disponibilidad — para eso está /admin/menu,
 * y aquí borrarlas por accidente sería peor que el problema que se vino a resolver
 * (`precioRapidoAction` toca esos dos campos y ningún otro).
 *
 * El buscador es lo primero que recibe el foco porque con cuarenta productos el gesto
 * real es "papas" + enter, no bajar con el dedo.
 */

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Ingrediente, EnredoInsignia } from "@/lib/menu";
import { precioRapidoAction, productoRapidoAction } from "@/app/admin/actions";

/** Un lápiz de verdad, no un emoji: el panel ya no usa emojis para lo que es acción. */
function Lapiz({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20.5h4.2L20 8.7a2.1 2.1 0 0 0 0-3l-1.7-1.7a2.1 2.1 0 0 0-3 0L3.5 15.8V20a.5.5 0 0 0 .5.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m14.4 5.6 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Guardar({ sucio }: { sucio: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`prq__ok ${sucio ? "is-vivo" : ""}`}
      disabled={!sucio || pending}
      title="Guardar este producto"
    >
      {pending ? "…" : "Guardar"}
    </button>
  );
}

/** Una línea editable. Guarda su propio "sucio" para que el botón no mienta. */
function Fila({
  id,
  tipo,
  nombre,
  precio,
  pista,
}: {
  id: string;
  tipo: "ingrediente" | "plato";
  nombre: string;
  precio: number;
  pista?: string;
}) {
  /* Lo escrito vive aquí, no en el padre: así teclear un precio no repinta la lista
     entera. Cuando el servidor confirma y la página se revalida, el padre le cambia la
     `key` a esta fila y React la monta de nuevo con el valor guardado — que es como se
     resetea estado a partir de props sin un efecto que lo copie a mano. */
  const [n, setN] = useState(nombre);
  const [p, setP] = useState(String(precio));
  const sucio = n.trim() !== nombre || Number(p) !== precio;

  return (
    <form action={precioRapidoAction} className={`prq__fila ${sucio ? "is-sucia" : ""}`}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="tipo" value={tipo} />
      <input
        name="nombre"
        className="prq__nombre"
        value={n}
        onChange={(e) => setN(e.target.value)}
        maxLength={60}
        aria-label={`Nombre de ${nombre}`}
        required
      />
      <label className="prq__precio">
        <span aria-hidden>$</span>
        {/* step="any" y no step=500: con un paso de 500, el navegador considera INVÁLIDO
            cualquier importe que no sea múltiplo —16.900, 4.200, una propina de 2.300— y
            se niega a enviar el formulario sin decir por qué. El botón se pulsaba y no
            pasaba nada. El redondeo lo hace el servidor. */}
        <input
          name="precio"
          type="number"
          inputMode="numeric"
          min={0}
          step="any"
          value={p}
          onChange={(e) => setP(e.target.value)}
          aria-label={`Precio de ${nombre}`}
          required
        />
      </label>
      {pista && <em className="prq__pista">{pista}</em>}
      <Guardar sucio={sucio} />
    </form>
  );
}

function Crear() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btnmini" disabled={pending}>
      <span>{pending ? "Creando…" : "Crear producto"}</span>
    </button>
  );
}

type Grupo = { k: string; titulo: string; filas: { id: string; nombre: string; precio: number; tipo: "ingrediente" | "plato"; pista?: string }[] };

export default function PreciosRapidos({
  bases,
  proteinas,
  toppings,
  platos,
  inline = false,
}: {
  bases: Ingrediente[];
  proteinas: Ingrediente[];
  toppings: Ingrediente[];
  platos: EnredoInsignia[];
  /**
   * Como PÁGINA en vez de como hoja flotante: sin fondo oscuro, sin botón de cerrar
   * y siempre abierta. Es lo que usa /admin/precios. La hoja flotante que sale del
   * lápiz de Pedidos sigue existiendo para corregir un precio sin dejar la caja;
   * esta es para sentarse a repasar la carta entera.
   */
  inline?: boolean;
}) {
  const [abierto, setAbierto] = useState(inline);
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto]);

  const grupos: Grupo[] = useMemo(() => {
    const ing = (l: Ingrediente[], pista?: (i: Ingrediente) => string | undefined) =>
      l.map((i) => ({
        id: i.id,
        nombre: i.nombre,
        precio: i.precio,
        tipo: "ingrediente" as const,
        pista: pista?.(i),
      }));
    return [
      { k: "base", titulo: "Bases", filas: ing(bases) },
      { k: "proteina", titulo: "Proteínas", filas: ing(proteinas) },
      {
        k: "topping",
        titulo: "Acompañantes",
        filas: ing(toppings.filter((t) => t.categoria !== "salsa")),
      },
      {
        k: "salsa",
        titulo: "Salsas",
        // Una salsa a $0 es la carta, no un descuido: se dice para que nadie la "arregle".
        filas: ing(
          toppings.filter((t) => t.categoria === "salsa"),
          (t) => (t.precio === 0 ? "va con el plato" : undefined),
        ),
      },
      {
        k: "plato",
        titulo: "Platos de precio cerrado",
        filas: platos.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          precio: e.precio,
          tipo: "plato" as const,
        })),
      },
    ];
  }, [bases, proteinas, toppings, platos]);

  /* Sin tildes: "acompanantes" y "jalapeno" tienen que encontrar lo suyo. */
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const busca = norm(q.trim());
  const visibles = grupos
    .map((g) => ({ ...g, filas: busca ? g.filas.filter((f) => norm(f.nombre).includes(busca)) : g.filas }))
    .filter((g) => g.filas.length);
  const cuantos = visibles.reduce((s, g) => s + g.filas.length, 0);

  if (!abierto && !inline) {
    return (
      <button type="button" className="btn btn--ghost prq__abrir" onClick={() => setAbierto(true)}>
        <Lapiz />
        <span>Precios y productos</span>
      </button>
    );
  }

  return (
    <div
      className={inline ? "prq prq--inline" : "prq"}
      role={inline ? undefined : "dialog"}
      aria-modal={inline ? undefined : "true"}
      aria-label="Precios y productos"
    >
      {!inline && <div className="prq__fondo" onClick={() => setAbierto(false)} />}
      <div className="prq__panel">
        <header className="prq__h">
          <div>
            <p className="prq__k">EDICIÓN RÁPIDA</p>
            <h2>
              <Lapiz size={20} /> Precios y productos
            </h2>
            <p className="prq__sub">
              Cambia el nombre o el precio y guarda. El precio es el que paga el cliente,
              con el impuesto adentro. Se aplica al instante en el menú interactivo del QR,
              en la página web y en los pedidos nuevos; los pedidos ya tomados conservan su
              precio.
            </p>
          </div>
          {!inline && (
            <button type="button" className="prq__x" onClick={() => setAbierto(false)} aria-label="Cerrar">
              ×
            </button>
          )}
        </header>

        <div className="prq__buscar">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto…"
            aria-label="Buscar producto"
          />
          <button type="button" className="prq__nuevo" onClick={() => setNuevo((v) => !v)}>
            {nuevo ? "Cancelar" : "+ Nuevo producto"}
          </button>
        </div>

        {nuevo && (
          <form
            action={productoRapidoAction}
            className="prq__crear"
            /* Se cierra DESPUÉS de que el submit salió: cerrarlo en el onClick del botón
               desmonta el formulario antes de tiempo y el producto nunca se crea. */
            onSubmit={() => setTimeout(() => setNuevo(false), 400)}
          >
            <input name="nombre" placeholder="Nombre" maxLength={60} required aria-label="Nombre nuevo" />
            <label className="prq__precio">
              <span aria-hidden>$</span>
              <input name="precio" type="number" min={0} step="any" defaultValue={0} aria-label="Precio nuevo" />
            </label>
            <select name="donde" defaultValue="topping" aria-label="Dónde va">
              <option value="base">Base</option>
              <option value="proteina">Proteína</option>
              <option value="topping">Acompañante</option>
              <option value="salsa">Salsa</option>
              <option value="plato">Plato de precio cerrado</option>
            </select>
            <Crear />
            <em className="prq__aviso">
              Un plato creado aquí se vende ya, pero no descuenta despensa hasta que le
              hagas la ficha en Recetas.
            </em>
          </form>
        )}

        <div className="prq__lista">
          {visibles.map((g) => (
            <section key={g.k}>
              <h3>{g.titulo}</h3>
              {g.filas.map((f) => (
                /* La key lleva nombre y precio a propósito: cuando el guardado vuelve
                   del servidor, la fila se remonta limpia sobre el valor confirmado. */
                <Fila key={`${f.id}:${f.nombre}:${f.precio}`} {...f} />
              ))}
            </section>
          ))}
          {!cuantos && <p className="prq__vacio">Nada se llama así.</p>}
        </div>

        <footer className="prq__pie">
          <span>
            {cuantos} producto{cuantos === 1 ? "" : "s"}
            {busca ? " encontrados" : " en la carta"}
          </span>
          <a href="/admin/menu">Fotos, disponibilidad y más →</a>
        </footer>
      </div>
    </div>
  );
}
