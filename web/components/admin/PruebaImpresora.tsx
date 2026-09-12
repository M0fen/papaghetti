"use client";

/**
 * LA PÁGINA DE LA IMPRESORA: diagnóstico en orden, para alguien solo delante de ella.
 *
 * Lo que se sabe del caso real: el autotest de la térmica imprime, y desde Chrome
 * nunca ha salido nada; en la captura del diálogo el destino era "Guardar como PDF".
 * Eso separa dos mundos. Si la PÁGINA DE PRUEBA DE WINDOWS no sale, el problema es
 * la instalación de la impresora (driver, puerto, cola) y ningún cambio en la web lo
 * arregla. Si sale, el problema está en Chrome (destino, márgenes) o en el papel, y
 * el patrón de prueba lo dice.
 *
 * Y el camino directo (Bluetooth / puerto serie) se salta a Windows del todo.
 */

import { useSyncExternalStore } from "react";
import { dibujarCalibracion } from "@/lib/tiquete-imagen";
import { imprimirImagen } from "@/lib/imprimir-imagen";
import type { Bitmap } from "@/lib/escpos";
import ImpresionDirecta from "./ImpresionDirecta";

/* El patrón se dibuja UNA vez por pestaña y se sirve como "almacén externo": en el
   servidor no hay canvas (null), en el cliente se crea al primer render y se
   reutiliza. Así no hace falta un setState dentro de un efecto, y React reconcilia la
   hidratación sin avisos. */
let patronCache: HTMLCanvasElement | null = null;
const leerPatron = () => {
  if (typeof document === "undefined") return null;
  if (!patronCache) patronCache = dibujarCalibracion();
  return patronCache;
};
const nadaQueSuscribir = () => () => {};

export default function PruebaImpresora() {
  const patron = useSyncExternalStore(nadaQueSuscribir, leerPatron, () => null);

  const getBitmap = (): Bitmap | null => {
    if (!patron) return null;
    const ctx = patron.getContext("2d");
    if (!ctx) return null;
    const d = ctx.getImageData(0, 0, patron.width, patron.height);
    return { width: d.width, height: d.height, data: d.data };
  };

  return (
    <div className="impresora">
      <section className="card impresora__paso">
        <h2>1 · ¿Windows ve la impresora?</h2>
        <p>
          Abre <b>Configuración → Bluetooth y dispositivos → Impresoras y escáneres</b>.
          La térmica tiene que estar en la lista y sin &quot;Sin conexión&quot; ni
          &quot;Error&quot;. Entra en ella → <b>Propiedades de impresora</b> →{" "}
          <b>Imprimir página de prueba</b>.
        </p>
        <p className="impresora__clave">
          Si esa página <b>no sale</b>, el problema es la instalación (driver, cable o
          puerto), no el sistema de Papaghetti: reinstala el driver del fabricante y
          repite. Si <b>sí sale</b>, sigue al paso 2.
        </p>
      </section>

      <section className="card impresora__paso">
        <h2>2 · ¿Chrome le manda a la térmica?</h2>
        <p>
          En el diálogo de imprimir, mira <b>Destino</b>. Si dice <b>&quot;Guardar como
          PDF&quot;</b> o &quot;Microsoft Print to PDF&quot;, no está imprimiendo: cámbialo a
          la térmica (si no aparece, pulsa <b>Ver más…</b>). Chrome recuerda la última
          elección. Márgenes en <b>Ninguno</b>, escala <b>100</b>, sin encabezados.
        </p>
        <div className="impresora__btns">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!patron}
            onClick={() => patron && imprimirImagen(patron.toDataURL("image/png"), true, "Patrón de prueba")}
          >
            <span>Imprimir el patrón de prueba</span>
          </button>
          {patron && (
            <a className="btn btn--ghost" href={patron.toDataURL("image/png")} download="patron-de-prueba.png">
              <span>Descargar el patrón</span>
            </a>
          )}
        </div>
        <p className="impresora__lee">
          En el papel: la <b>regla debe llegar a 72</b> (si no, el driver recorta), el{" "}
          <b>10 debe medir 10&nbsp;mm</b> con una regla real (si mide más, hay reescalado:
          pon el papel del driver en 80 × 3276 o 80 × 297) y el <b>tablero debe salir
          nítido</b>, no gris.
        </p>
      </section>

      <section className="card impresora__paso">
        <h2>3 · Sin pasar por Windows</h2>
        <p>
          Si la térmica tiene <b>Bluetooth</b> o aparece como <b>puerto COM</b>, se le
          pueden mandar los datos directamente desde aquí: sin driver, sin diálogo. La
          primera vez Chrome pide elegir el aparato; después lo recuerda.
        </p>
        <ImpresionDirecta getBitmap={getBitmap} etiqueta="el patrón" />
        <p className="impresora__nota">
          Los botones solo aparecen en Chrome o Edge. Si no aparecen, este navegador no
          tiene esas funciones.
        </p>
      </section>

      {patron && (
        <section className="impresora__vista">
          <p className="impresora__k">ASÍ SE VE EL PATRÓN</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={patron.toDataURL("image/png")} alt="Patrón de prueba" />
        </section>
      )}
    </div>
  );
}
