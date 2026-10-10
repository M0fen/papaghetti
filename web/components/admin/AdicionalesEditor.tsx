"use client";

/**
 * LOS ADICIONALES DE UN TOQUE.
 *
 * Lo que se cobra y no es un plato de la carta: una limonada de coco, un empaque, los
 * almuerzos que un grupo paga aparte. Antes no había dónde ponerlo y se cobraba por
 * fuera del sistema, que es justo como se descuadra una caja.
 *
 * Lo que se guarda aquí sale como botón en la caja (al tomar una comanda y en cada
 * cuenta abierta) y en el comprobante con su nombre. Lo que no esté aquí se puede
 * escribir a mano al cobrar: esta lista es para no teclear lo de todos los días.
 */

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { AdicionalConfig } from "@/lib/menu";
import { adicionalConfigAction, borrarAdicionalConfigAction } from "@/app/admin/actions";

const soloDigitos = (s: string) => s.replace(/\D/g, "");
/** "9000" → "9.000" mientras se escribe: un cero de más se ve antes de guardar. */
const conPuntos = (s: string) => {
  const d = soloDigitos(s).slice(0, 9);
  return d ? Number(d).toLocaleString("es-CO") : "";
};

function Guardar({ sucio }: { sucio: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`prq__ok ${sucio ? "is-vivo" : ""}`}
      disabled={!sucio || pending}
      title="Guardar este adicional"
    >
      {pending ? "…" : "Guardar"}
    </button>
  );
}

function Crear({ listo }: { listo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary btnmini" disabled={!listo || pending}>
      <span>{pending ? "Agregando…" : "+ Agregar"}</span>
    </button>
  );
}

/** Una fila editable. Guarda su propio "sucio" para que el botón no mienta. */
function Fila({ a }: { a: AdicionalConfig }) {
  const [n, setN] = useState(a.nombre);
  const [p, setP] = useState(conPuntos(String(a.precio)));
  const [cocina, setCocina] = useState(Boolean(a.cocina));
  const [activo, setActivo] = useState(a.activo !== false);
  const sucio =
    n.trim() !== a.nombre ||
    Number(soloDigitos(p)) !== a.precio ||
    cocina !== Boolean(a.cocina) ||
    activo !== (a.activo !== false);

  return (
    <div className={`adic__fila ${sucio ? "is-sucia" : ""} ${activo ? "" : "is-off"}`}>
      <form action={adicionalConfigAction} className="adic__form">
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="_edicion" value="1" />
        <input
          name="nombre"
          className="prq__nombre"
          value={n}
          onChange={(e) => setN(e.target.value)}
          maxLength={60}
          aria-label={`Nombre de ${a.nombre}`}
          required
        />
        <label className="prq__precio">
          <span aria-hidden>$</span>
          <input
            name="precio"
            inputMode="numeric"
            value={p}
            onChange={(e) => setP(conPuntos(e.target.value))}
            aria-label={`Precio de ${a.nombre}`}
            required
          />
        </label>
        <label className="adic__check adic__check--cocina" title="Sale en la pantalla de cocina">
          <input type="checkbox" name="cocina" checked={cocina} onChange={(e) => setCocina(e.target.checked)} />
          Cocina
        </label>
        <label className="adic__check adic__check--caja" title="Aparece como botón en la caja">
          <input type="checkbox" name="activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          En la caja
        </label>
        <Guardar sucio={sucio} />
      </form>
      <form
        action={borrarAdicionalConfigAction}
        onSubmit={(e) => {
          if (!window.confirm(`¿Borrar "${a.nombre}"? Las cuentas que ya lo llevan no cambian.`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={a.id} />
        <button className="adic__borrar" type="submit" aria-label={`Borrar ${a.nombre}`} title="Borrar">
          ×
        </button>
      </form>
    </div>
  );
}

function Nuevo() {
  const [n, setN] = useState("");
  const [p, setP] = useState("");
  const [cocina, setCocina] = useState(false);
  return (
    <form
      action={adicionalConfigAction}
      className="adic__nuevo"
      /* Se limpia DESPUÉS de que el envío salió: limpiarlo en el clic vaciaba el
         formulario antes de mandarlo y el adicional nunca se creaba. */
      onSubmit={() =>
        setTimeout(() => {
          setN("");
          setP("");
          setCocina(false);
        }, 400)
      }
    >
      <input
        name="nombre"
        className="adic__concepto"
        placeholder="Concepto · ej. Limonada de coco"
        value={n}
        onChange={(e) => setN(e.target.value)}
        maxLength={60}
        aria-label="Concepto del adicional nuevo"
        required
      />
      <label className="prq__precio">
        <span aria-hidden>$</span>
        <input
          name="precio"
          inputMode="numeric"
          placeholder="9.000"
          value={p}
          onChange={(e) => setP(conPuntos(e.target.value))}
          aria-label="Precio del adicional nuevo"
          required
        />
      </label>
      <label className="adic__check">
        <input type="checkbox" name="cocina" checked={cocina} onChange={(e) => setCocina(e.target.checked)} />
        Se prepara en cocina
      </label>
      <Crear listo={Boolean(n.trim() && Number(soloDigitos(p)) > 0)} />
    </form>
  );
}

export default function AdicionalesEditor({ adicionales }: { adicionales: AdicionalConfig[] }) {
  return (
    <section className="card adic" id="adicionales">
      <div className="card__h">
        <h2>Adicionales</h2>
      </div>
      <p className="adic__sub">
        Lo que se cobra y no es un plato de la carta: bebidas, empaques, almuerzos que se
        pagan aparte. Cada uno sale como botón en la caja y en el comprobante con su nombre.
        Lo que no esté aquí se puede escribir a mano al cobrar.
      </p>
      <Nuevo />
      {adicionales.length === 0 ? (
        <p className="adic__vacio">Todavía no hay ninguno guardado.</p>
      ) : (
        <div className="adic__lista">
          {adicionales.map((a) => (
            /* La key lleva todo lo editable: cuando el guardado vuelve del servidor, la
               fila se remonta limpia sobre el valor confirmado. */
            <Fila key={`${a.id}:${a.nombre}:${a.precio}:${a.cocina}:${a.activo}`} a={a} />
          ))}
        </div>
      )}
      <p className="adic__nota">
        <b>Cocina</b>: sale en la pantalla de cocina (una limonada sí; &quot;almuerzos&quot; no).{" "}
        <b>En la caja</b>: aparece como botón; apágalo para esconderlo sin borrarlo.
      </p>
    </section>
  );
}
