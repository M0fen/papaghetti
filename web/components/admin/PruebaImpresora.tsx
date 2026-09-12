"use client";

/**
 * LA PÁGINA DE LA IMPRESORA: diagnóstico en orden, para alguien solo delante de ella.
 *
 * Lo que se sabe del caso real: el autotest de la térmica imprime, y desde Chrome
 * nunca ha salido nada; en la captura del diálogo el destino era "Guardar como
 * PDF". Chrome no tiene lista propia de impresoras: enseña las que Windows tiene
 * instaladas y listas. Que solo ofrezca "Guardar como PDF" quiere decir que Windows
 * no le está dando la térmica —no instalada, cola en pausa o "sin conexión",
 * servicio de impresión parado, puerto USB00x cambiado— o que Chrome se quedó con
 * PDF como último destino y nadie abrió "Ver más".
 *
 * Cada paso separa dos mundos. Si la PÁGINA DE PRUEBA DE WINDOWS no sale, el
 * problema es la instalación (driver, puerto, cola) y ningún cambio en la web lo
 * arregla. Si sale, el problema está en Chrome (destino, márgenes) o en el papel, y
 * el patrón lo dice. Y el camino directo (puerto COM / Bluetooth) se salta a
 * Windows del todo: si la impresora recibe los bytes, imprime.
 *
 * Todo lo que se afirma aquí sale de la documentación de Microsoft, Google/Chromium
 * y los fabricantes, no de suposiciones.
 */

import { useSyncExternalStore } from "react";
import { dibujarCalibracion } from "@/lib/tiquete-imagen";
import { imprimirImagen } from "@/lib/imprimir-imagen";
import { trabajoEscPos } from "@/lib/escpos";
import { pruebaTextoEscPos } from "@/lib/tiquete-escpos";
import ImpresionDirecta, { type TrabajosDirectos } from "./ImpresionDirecta";

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

  const trabajos: TrabajosDirectos = {
    texto: () => pruebaTextoEscPos(),
    imagen: () => {
      if (!patron) return null;
      const ctx = patron.getContext("2d");
      if (!ctx) return null;
      const d = ctx.getImageData(0, 0, patron.width, patron.height);
      return trabajoEscPos({ width: d.width, height: d.height, data: d.data });
    },
  };

  return (
    <div className="impresora">
      <section className="card impresora__paso">
        <h2>1 · ¿Windows ve la impresora?</h2>
        <p>
          Chrome no tiene lista propia de impresoras: enseña las que Windows tiene
          instaladas. Abre <b>Configuración → Bluetooth y dispositivos → Impresoras y
          escáneres</b>. La térmica tiene que estar en la lista. Si no está, instala el
          driver del fabricante (viene en el CD o en su web; para una &quot;POS-80&quot; o
          &quot;XP-80&quot; genérica sirve el de Xprinter) y vuelve a mirar.
        </p>
        <p>
          Entra en ella → <b>Abrir cola de impresión</b>. En el menú <b>Impresora</b>,
          quita las marcas de <b>&quot;Pausar impresión&quot;</b> y <b>&quot;Usar impresora
          sin conexión&quot;</b> y cancela los documentos atascados. Si había varios
          esperando, ahí estaban los tiquetes que nunca salieron.
        </p>
        <p>
          Luego <b>Panel de control → Dispositivos e impresoras</b> → clic derecho en la
          térmica → <b>Propiedades de impresora</b> (no &quot;Propiedades&quot; a secas) →
          pestaña General → <b>Imprimir página de prueba</b>.
        </p>
        <p className="impresora__clave">
          Si esa página <b>no sale</b>, el problema es la instalación y ningún cambio en
          la web lo arregla. En la misma ventana, pestaña <b>Puertos</b>: la casilla
          marcada debe ser el <b>USB00x</b> activo (prueba USB001, USB002 o USB003,
          Aplicar, repite la página). Reinicia el servicio <b>&quot;Administrador de
          trabajos de impresión&quot;</b> (Win+R → <code>services.msc</code> → clic derecho →
          Reiniciar) y vuelve a abrir Chrome. Y si el driver de la cola se llama{" "}
          <b>&quot;Generic / Text Only&quot;</b>, no sirve: solo saca texto plano y el tiquete es
          una imagen; instala el del fabricante. Si <b>sí sale</b>, sigue al paso 2.
        </p>
      </section>

      <section className="card impresora__paso">
        <h2>2 · ¿Chrome le manda a la térmica?</h2>
        <p>
          En el diálogo de imprimir, mira <b>Destino</b>. Si dice <b>&quot;Guardar como
          PDF&quot;</b> o &quot;Microsoft Print to PDF&quot;, no está imprimiendo nada: ábrelo y
          elige la térmica; si no está en la lista corta, pulsa <b>Ver más…</b>. Chrome
          recuerda el último destino que usaste, así que una vez que imprimas a la
          térmica se queda con ella.
        </p>
        <p>
          Prueba cruzada: <b>Ctrl+Shift+P</b> abre el diálogo de Windows en vez del de
          Chrome. Si ahí la térmica sí aparece y sale papel, el problema era la vista
          previa de Chrome (reinicia el servicio del paso 1 y vuelve a abrir Chrome).
        </p>
        <p>
          Para que Windows no la cambie sola: en <b>Impresoras y escáneres</b> apaga
          &quot;Permitir que Windows administre mi impresora predeterminada&quot; y marca la
          térmica como <b>predeterminada</b>. Márgenes en <b>Ninguno</b>, escala <b>100</b>,
          sin encabezados.
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
        <h2>3 · Sin pasar por Windows: puerto COM o Bluetooth</h2>
        <p>
          Abre el <b>Administrador de dispositivos</b> y mira <b>Puertos (COM y LPT)</b>. Si
          la térmica aparece ahí (como &quot;USB-SERIAL CH340&quot;, &quot;Silicon Labs CP210x&quot; o un
          &quot;Virtual COM&quot; del fabricante), se le mandan los datos desde aquí, sin driver
          de impresora ni diálogo. Si es una impresora <b>Bluetooth</b>, emparéjala en
          Windows: queda como un COM &quot;Estándar serie sobre Bluetooth&quot; (elige el{" "}
          <b>saliente</b>) y se usa el mismo botón. Si solo aparece bajo
          &quot;Impresoras&quot; y no en Puertos, este camino no existe en ese PC: vuelve al
          paso 1.
        </p>
        <p>
          Empieza con <b>Texto</b>: son 200 bytes y en un segundo se sabe. Si salen{" "}
          <b>símbolos raros</b>, es el baudio: prueba <b>9600 → 38400 → 115200 → 19200</b>{" "}
          (Epson trae 38400 de fábrica). Si no sale nada, prueba el otro puerto COM del
          par. La primera vez Chrome pide elegir el puerto; después lo recuerda.
        </p>
        <ImpresionDirecta trabajos={trabajos} etiqueta="la prueba" />
        <p className="impresora__nota">
          El botón de <b>Bluetooth de baja energía</b> solo sirve para las impresoras
          portátiles pequeñas (PT-210, Phomemo y parientes): Chrome no ve el Bluetooth
          clásico de las de mostrador, por eso esas van por el puerto COM. Los botones
          solo aparecen en Chrome o Edge.
        </p>
      </section>

      <section className="card impresora__paso">
        <h2>4 · Cuando ya imprima: que no pregunte cada vez</h2>
        <p>
          Con la térmica como predeterminada de Windows (paso 2), un acceso directo de
          Chrome con <code>--kiosk-printing</code> imprime sin diálogo: el propio Chrome
          pulsa &quot;Imprimir&quot; en cuanto la vista previa está lista. Clic derecho en el
          acceso directo → Propiedades → <b>Destino</b>:
        </p>
        <code className="impresora__cmd">
          &quot;C:\Program Files\Google\Chrome\Application\chrome.exe&quot; --kiosk-printing
          https://papaghetti.vercel.app/admin/pedidos
        </code>
        <p className="impresora__nota">
          Hay que cerrar todas las ventanas de Chrome y abrirlo SIEMPRE desde ese acceso
          directo. Solo tiene sentido cuando los pasos 1 y 2 ya funcionan.
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
