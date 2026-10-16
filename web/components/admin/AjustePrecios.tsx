"use client";

/**
 * SUBIR O BAJAR LOS PRECIOS DE UNA VEZ.
 *
 * Cuando sube el queso o el arriendo, el dueño repasaba la carta precio por precio. Aquí
 * elige cuánto y en qué grupos, y ve ANTES de confirmar cada precio: el de ahora y el
 * nuevo, ya redondeado a $100. La cuenta la hace `planAjuste` (lib/precios.ts), la misma
 * función con la que el servidor aplica: la vista previa no puede prometer un precio y la
 * carta quedar con otro.
 *
 * Tres cuidados de operario:
 *  · nada se aplica sin la ventana de confirmación, que repite el resumen;
 *  · después de aplicar, el formulario se vacía: con el porcentaje todavía escrito, la
 *    vista previa mostraría OTRO 8 % sobre los precios nuevos e invitaría a repetirlo;
 *  · si mientras miraba alguien cambió un precio, el servidor no aplica y lo dice aquí,
 *    junto al botón (el aviso de arriba del panel puede quedar fuera de la pantalla).
 */

import { useActionState, useMemo, useState } from "react";
import BotonGuardar from "./BotonGuardar";
import { formatCOP } from "@/lib/menu";
import {
  GRUPOS_AJUSTE,
  PCT_MAX_AJUSTE,
  gruposTexto,
  leerPct,
  pctTexto,
  planAjuste,
  type EstadoAjuste,
  type GrupoAjuste,
  type ListasAjuste,
} from "@/lib/precios";
import { ajustarPreciosAction } from "@/app/admin/acciones-precios";

const INICIO: EstadoAjuste = { vez: 0 };
/** Los de siempre, a un toque. */
const RAPIDOS = [3, 5, 10];
/** De fábrica, la carta entera. Los adicionales (bebidas, empaques) suelen ir por su lado: se eligen a mano. */
const DE_FABRICA: GrupoAjuste[] = ["bases", "proteinas", "acompanantes", "platos"];
/** Lo apagado se dice como lo dice su pantalla: el Menú habla de la carta y los adicionales, de la caja. */
const apagado = (g: GrupoAjuste) => (g === "adicionales" ? "fuera de la caja" : "fuera de la carta");

export default function AjustePrecios({ listas }: { listas: ListasAjuste }) {
  const [estado, accion, enviando] = useActionState(ajustarPreciosAction, INICIO);
  /* El "Listo" se queda a la vista hasta que se empieza otro ajuste. Se guarda A QUÉ
     ajuste ya se le respondió tocando algo, no un booleano: así no hace falta un efecto
     que lo apague cuando llega el siguiente. */
  const [tocadoTras, setTocadoTras] = useState(-1);
  return (
    <section className="card ajp" id="ajustar" aria-labelledby="ajp-titulo">
      <div className="card__h">
        {/* El nombre con el que la Ayuda y la guía de entrega mandan a buscarla. */}
        <h2 id="ajp-titulo">Ajustar precios</h2>
      </div>
      <p className="ajp__sub">
        Para cuando sube el queso o el arriendo: sube o baja de una vez los precios de los
        grupos que elijas, redondeados a $100. Antes de aplicar ves cada uno, el de ahora y
        el nuevo.
      </p>
      {estado.listo && tocadoTras !== estado.vez && (
        <p className="ajp__listo" role="status">
          ✅ {estado.listo}
        </p>
      )}
      {/* `key`: tras cada ajuste que sale bien, el formulario se monta de nuevo, vacío. */}
      <Formulario
        key={estado.vez}
        listas={listas}
        accion={accion}
        enviando={enviando}
        estado={estado}
        onTocar={() => setTocadoTras(estado.vez)}
      />
    </section>
  );
}

function Formulario({
  listas,
  accion,
  enviando,
  estado,
  onTocar,
}: {
  listas: ListasAjuste;
  accion: (fd: FormData) => void;
  enviando: boolean;
  estado: EstadoAjuste;
  onTocar: () => void;
}) {
  const [sentido, setSentido] = useState<"subir" | "bajar">("subir");
  const [pctTxt, setPctTxt] = useState("");
  const [grupos, setGrupos] = useState<GrupoAjuste[]>(DE_FABRICA);
  /* Cada cambio sube la marca. El error que devuelve el servidor trae la marca con la que
     se mandó: si ya no es la de ahora, el error es de otra versión y se esconde. */
  const [marca, setMarca] = useState(0);
  const tocar = () => {
    setMarca((m) => m + 1);
    onTocar();
  };

  const magnitud = leerPct(pctTxt);
  const valido = Number.isFinite(magnitud) && magnitud > 0 && magnitud <= PCT_MAX_AJUSTE;
  const pct = valido ? (sentido === "bajar" ? -magnitud : magnitud) : NaN;
  const plan = useMemo(() => planAjuste(listas, pct, grupos), [listas, pct, grupos]);

  const cuantos: Record<GrupoAjuste, number> = useMemo(
    () => ({
      bases: listas.bases.length,
      proteinas: listas.proteinas.length,
      acompanantes: listas.toppings.filter((t) => t.categoria !== "salsa").length,
      platos: listas.enredos.length,
      adicionales: listas.adicionales.length,
    }),
    [listas],
  );
  const salsas = listas.toppings.length - cuantos.acompanantes;
  const error = estado.error && estado.marca === String(marca) ? estado.error : "";

  const n = plan.cambios.length;
  const verbo = sentido === "subir" ? "Subir" : "Bajar";
  const avisosOjo = plan.avisos.filter((a) => a.tipo !== "cuentas");
  const notaCuentas = plan.avisos.find((a) => a.tipo === "cuentas");
  const fuera = plan.cambios.filter((c) => c.fueraDeCarta).length;

  const alternarGrupo = (g: GrupoAjuste) => {
    setGrupos((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]));
    tocar();
  };

  return (
    <form
      action={accion}
      className="ajp__form"
      onSubmit={(e) => {
        // Enter en el porcentaje también envía: sin cambios no hay nada que confirmar.
        if (!n || enviando) {
          e.preventDefault();
          return;
        }
        const resumen = [
          `¿${verbo} ${pctTexto(pct)} los precios de ${gruposTexto(plan.cambios)}?`,
          "",
          `Cambian ${n} ${n === 1 ? "precio" : "precios"}, redondeados a $100.`,
          notaCuentas?.texto ?? "",
          avisosOjo.length
            ? `Ojo: ${avisosOjo.length === 1 ? "hay 1 aviso" : `hay ${avisosOjo.length} avisos`} en la vista previa.`
            : "",
          "",
          "Si no era eso, después puedes tocar Deshacer.",
        ]
          .filter((l, i, ls) => l || (i > 0 && ls[i - 1]))
          .join("\n");
        if (!window.confirm(resumen)) e.preventDefault();
      }}
    >
      <input type="hidden" name="firma" value={plan.firma} />
      <input type="hidden" name="marca" value={String(marca)} />

      <fieldset className="ajp__campos" disabled={enviando}>
        <legend className="visually-hidden">Cuánto y en qué grupos</legend>
        <div className="ajp__cuanto">
          <div className="ajp__sentido" role="radiogroup" aria-label="¿Suben o bajan?">
            {(["subir", "bajar"] as const).map((s) => (
              <label key={s} className={`chipbtn ${sentido === s ? "is-on" : ""}`}>
                <input
                  type="radio"
                  name="sentido"
                  value={s}
                  checked={sentido === s}
                  onChange={() => {
                    setSentido(s);
                    tocar();
                  }}
                  className="visually-hidden"
                />
                {s === "subir" ? "▲ Subir" : "▼ Bajar"}
              </label>
            ))}
          </div>
          <label className="ajp__pct">
            <span className="visually-hidden">Porcentaje</span>
            <input
              name="pct"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={pctTxt}
              maxLength={5}
              onChange={(e) => {
                setPctTxt(e.target.value);
                tocar();
              }}
              aria-describedby="ajp-pct-nota"
            />
            <span aria-hidden>%</span>
          </label>
          <div className="ajp__rapidos" aria-label="Porcentajes de siempre">
            {RAPIDOS.map((r) => (
              <button
                key={r}
                type="button"
                className={`chipbtn ${magnitud === r ? "is-on" : ""}`}
                onClick={() => {
                  setPctTxt(String(r));
                  tocar();
                }}
              >
                {r} %
              </button>
            ))}
          </div>
        </div>
        <small id="ajp-pct-nota" className="field__nota">
          Hasta {PCT_MAX_AJUSTE} % de una vez; acepta un decimal (8,5).
        </small>

        <fieldset className="ajp__grupos">
          <legend>¿Qué precios?</legend>
          <div className="ajp__chips">
            {GRUPOS_AJUSTE.map((g) => {
              const hay = cuantos[g.id] > 0;
              return (
                <label
                  key={g.id}
                  className={`chipbtn ${grupos.includes(g.id) && hay ? "is-on" : ""} ${hay ? "" : "is-vacio"}`}
                  title={hay ? g.detalle : "No hay ninguno guardado"}
                >
                  <input
                    type="checkbox"
                    name="grupo"
                    value={g.id}
                    checked={grupos.includes(g.id) && hay}
                    disabled={!hay}
                    onChange={() => alternarGrupo(g.id)}
                    className="visually-hidden"
                  />
                  {g.etiqueta} <small>{cuantos[g.id]}</small>
                </label>
              );
            })}
          </div>
          <small className="field__nota">
            {salsas > 0
              ? `Las salsas (${salsas}) no se tocan nunca: van con el plato.`
              : "Las salsas no se tocan nunca: van con el plato."}{" "}
            Lo que hoy no se vende (fuera de la carta o de la caja) también se ajusta, para que vuelva
            con el precio de ahora.
          </small>
        </fieldset>
      </fieldset>

      {pctTxt.trim() !== "" && !valido && (
        <p className="field__alerta ajp__falta">
          {Number.isFinite(magnitud) && magnitud > PCT_MAX_AJUSTE
            ? `De a ${PCT_MAX_AJUSTE} % como mucho: más que eso casi siempre es un cero de más.`
            : `Escribe un número entre 0,1 y ${PCT_MAX_AJUSTE}.`}
        </p>
      )}
      {valido && grupos.length === 0 && (
        <p className="field__alerta ajp__falta">Elige al menos un grupo de precios.</p>
      )}

      {valido && grupos.length > 0 && (
        <div className="ajp__previa">
          <p className="ajp__resumen" aria-live="polite">
            {n
              ? `${verbo} ${pctTexto(pct)}: cambian ${n} ${n === 1 ? "precio" : "precios"}`
              : "Con ese porcentaje no cambia ningún precio."}
            {plan.sinCambio.length > 0 && (
              <span> · {plan.sinCambio.length} {plan.sinCambio.length === 1 ? "se queda igual" : "se quedan igual"}</span>
            )}
            {fuera > 0 && (
              <span>
                {" "}
                · {fuera} {fuera === 1 ? "que hoy no se vende" : "que hoy no se venden"}
              </span>
            )}
          </p>
          {/* Acotada y con su propio scroll: con la carta entera son cuarenta renglones, y
              el botón de aplicar tiene que quedar a la vista justo debajo. */}
          <div className="ajp__lista" role="region" tabIndex={0} aria-label="Vista previa, precio por precio">
            {GRUPOS_AJUSTE.map((g) => {
              const cambian = plan.cambios.filter((c) => c.grupo === g.id);
              const iguales = plan.sinCambio.filter((c) => c.grupo === g.id);
              if (!cambian.length && !iguales.length) return null;
              return (
                <section key={g.id} className="ajp__grupo">
                  <h3>
                    {g.etiqueta} <span>{cambian.length}</span>
                  </h3>
                  <ul>
                    {cambian.map((c) => (
                      <li key={c.id} className="ajp__item">
                        <span className="ajp__nombre">
                          {c.nombre}
                          {c.fueraDeCarta && <em className="ajp__off">{apagado(c.grupo)}</em>}
                        </span>
                        <span className="ajp__precios">
                          <span className="visually-hidden">pasa de</span>
                          <s>{formatCOP(c.antes)}</s>
                          <span aria-hidden>→</span>
                          <span className="visually-hidden">a</span>
                          <b>{formatCOP(c.despues)}</b>
                          <small className="ajp__dif">
                            {c.despues > c.antes ? "+" : ""}
                            {formatCOP(c.despues - c.antes)}
                          </small>
                        </span>
                      </li>
                    ))}
                    {iguales.map((c) => (
                      <li key={c.id} className="ajp__item is-igual">
                        <span className="ajp__nombre">
                          {c.nombre}
                          {c.fueraDeCarta && <em className="ajp__off">{apagado(c.grupo)}</em>}
                        </span>
                        <span className="ajp__precios">
                          <b>{formatCOP(c.precio)}</b>
                          <small>se queda igual: {c.porque}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          {avisosOjo.length > 0 && (
            <div className="ajp__avisos" role="note">
              <b>Antes de aplicar, mira esto:</b>
              <ul>
                {avisosOjo.map((a, i) => (
                  <li key={i}>{a.texto}</li>
                ))}
              </ul>
            </div>
          )}
          {notaCuentas && <p className="field__nota ajp__cuentas">{notaCuentas.texto}</p>}
        </div>
      )}

      <div className="ajp__pie">
        {error && (
          <p className="field__alerta ajp__error" role="alert">
            {error}
          </p>
        )}
        <BotonGuardar className="btn btn--primary ajp__aplicar" enviando="Aplicando…" disabled={!valido || !n}>
          {valido && n ? `${verbo} ${pctTexto(pct)} a ${n} ${n === 1 ? "precio" : "precios"}` : "Aplicar"}
        </BotonGuardar>
      </div>
    </form>
  );
}
