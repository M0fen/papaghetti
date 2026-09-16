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
import { ROLLOS, type Rollo } from "@/lib/rollo";
import { useRollo } from "./useRollo";

/* El patrón se dibuja UNA vez por pestaña y rollo, y se sirve como "almacén externo":
   en el servidor no hay canvas (null), en el cliente se crea al primer render y se
   reutiliza. Así no hace falta un setState dentro de un efecto, y React reconcilia la
   hidratación sin avisos. */
const patronCache: Partial<Record<Rollo, HTMLCanvasElement>> = {};
const leerPatron = (rollo: Rollo) => {
  if (typeof document === "undefined") return null;
  return (patronCache[rollo] ??= dibujarCalibracion(rollo));
};
const nadaQueSuscribir = () => () => {};

export default function PruebaImpresora() {
  const [rollo, setRollo] = useRollo();
  const R = ROLLOS[rollo];
  const patron = useSyncExternalStore(nadaQueSuscribir, () => leerPatron(rollo), () => null);

  const trabajos: TrabajosDirectos = {
    texto: () => pruebaTextoEscPos(R.cols),
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
      {/* EL APARATO DEL LOCAL. Todo lo de abajo depende de dos datos: el ancho del
          rollo y por dónde se conecta. Se resuelven aquí, antes del paso 1. */}
      <section className="card impresora__paso">
        <h2>0 · Tu impresora: Star POS TP586</h2>
        <div className="cbte-papel" role="group" aria-label="Ancho del rollo">
          {([58, 80] as const).map((mm) => (
            <button key={mm} type="button" className={rollo === mm ? "is-on" : ""} onClick={() => setRollo(mm)}>
              Rollo {mm} mm
            </button>
          ))}
        </div>
        <p>
          Térmica directa de <b>58&nbsp;mm</b>, 203&nbsp;dpi, comandos <b>ESC/POS</b>. El cabezal
          quema <b>48&nbsp;mm útiles = 384 puntos</b>, o sea <b>32 letras por renglón</b>. Todo en
          este equipo imprime ya a esa medida (queda recordado en este computador; cámbialo
          arriba solo si conectas otra impresora).
        </p>
        <p>
          <b>¿Qué versión es?</b> Mira atrás: la TP586 se vende <b>solo USB</b>,{" "}
          <b>USB + Bluetooth</b> o <b>USB + red (LAN)</b>.
        </p>
        <ul className="impresora__lista">
          <li>
            <b>Solo USB</b> → pasos 1, 2 y 4. Windows la ve como impresora, no como puerto COM,
            así que el paso 3 no aplica.
          </li>
          <li>
            <b>USB + Bluetooth</b> → además, el paso 3 sin driver: empareja en Windows con PIN{" "}
            <b>0000</b> o <b>1234</b>.
          </li>
          <li>
            <b>USB + LAN</b> → el navegador no puede hablarle por red directo: por cable USB con
            los pasos 1 y 2, o instálala en Windows como impresora de red (TCP/IP, puerto 9100).
          </li>
        </ul>
        <p>
          <b>Autotest:</b> impresora apagada, mantén el botón <b>FEED</b> y enciéndela. En este
          tipo de térmicas el papel dice la interfaz, los baudios y —si trae Bluetooth— su
          nombre y PIN. Tenlo a mano para el paso 3.
        </p>
        <p>
          <b>Driver:</b> el genérico <b>POS-58</b> (el que trae el CD o da el vendedor; el{" "}
          &quot;POS58 Printer Driver&quot; de Xprinter también sirve). Al instalar elige el modelo
          POS-58 y el puerto <b>USB001</b> (o el que aparezca). El corte es <b>manual</b>: se rasga
          contra la sierra; el tiquete deja unos milímetros de más para eso.
        </p>
      </section>

      <section className="card impresora__paso">
        <h2>1 · ¿Windows ve la impresora?</h2>
        <p>
          Chrome no tiene lista propia de impresoras: enseña las que Windows tiene
          instaladas. Abre <b>Configuración → Bluetooth y dispositivos → Impresoras y
          escáneres</b>. La térmica tiene que estar en la lista. Si no está, instala el
          driver del paso 0 (<b>POS-58</b>) y vuelve a mirar. Con Windows 10/11 a veces
          aparece sola como &quot;POS58&quot; o &quot;USB Printing Support&quot; sin driver de
          impresora: sin driver no sirve, instálalo igual.
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
            onClick={() => patron && imprimirImagen(patron.toDataURL("image/png"), true, "Patrón de prueba", R.mm)}
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
          En el papel: la <b>regla debe llegar a {R.mm}</b> (si no, el driver recorta), el{" "}
          <b>10 debe medir 10&nbsp;mm</b> con una regla real (si mide más o menos, hay
          reescalado: en Windows → preferencias de impresión de la térmica, papel{" "}
          <b>{R.papelDriver}</b>; en Chrome, escala 100) y el <b>tablero debe salir
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
          <b>saliente</b>; el PIN suele ser 0000 o 1234) y se usa el mismo botón. Si solo aparece bajo
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
