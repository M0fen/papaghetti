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
import { ALINEACIONES, ROLLOS, type Rollo } from "@/lib/rollo";
import { useAlineacion, useRollo } from "./useRollo";

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
  const [alinear, setAlinear] = useAlineacion();
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
          <b>La del local es solo USB.</b> Por USB Windows la maneja como impresora (no como
          puerto COM), así que el camino es uno: <b>driver instalado → Chrome imprime en
          ella</b>. El paso 3 de abajo (puerto COM / Bluetooth) no aplica a esta versión.
        </p>
        <p>
          <b>Driver:</b> el genérico <b>POS-58</b>: primero el CD o el archivo del vendedor; si
          no hay, el de 58&nbsp;mm de{" "}
          <a href="https://pos-star.com/drivers-impresoras-termicas-2/" target="_blank" rel="noopener noreferrer">
            POS-STAR
          </a>{" "}
          o el &quot;Bill product driver&quot; de{" "}
          <a href="https://www.xprintertech.com/drivers-2.html" target="_blank" rel="noopener noreferrer">
            Xprinter
          </a>
          . Al instalar: modelo <b>POS-58</b> (o XP-58), conexión USB, puerto <b>USB001</b>, con la
          impresora encendida y conectada. El corte es <b>manual</b>: se rasga contra la sierra.
        </p>
        {/* DÓNDE CAE EL TIQUETE. El driver anuncia 58 mm y el cabezal quema 48: cada
            driver pone los 10 que sobran en un lado distinto. En la TP586 del local van a
            la izquierda, así que el tiquete se apoya a la DERECHA. */}
        <div className="impresora__alinear">
          <span>Posición en el papel</span>
          <div className="cbte-papel" role="group" aria-label="Posición del tiquete en el papel">
            {ALINEACIONES.map((o) => (
              <button
                key={o.id}
                type="button"
                className={alinear === o.id ? "is-on" : ""}
                onClick={() => setAlinear(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <small>
            Si el patrón sale cortado de un lado (falta la raya del borde o el último dígito de
            los precios), cambia esto y vuelve a imprimirlo. En la TP586 del local va a la
            <b> derecha</b>. Se recuerda en este computador.
          </small>
        </div>
        <p>
          <b>Autotest:</b> impresora apagada, mantén <b>FEED</b> y enciéndela. Si ese papel no sale,
          el problema es la impresora o el rollo (la cara brillante va hacia el cabezal), no el
          computador.
        </p>
      </section>

      {/* EL KIT. Quien prueba está solo delante del PC de la caja y todas las pruebas
          anteriores fallaron en la instalación de Windows, nunca en la web. En vez de
          otra lista de instrucciones, un archivo que revisa y arregla en orden. */}
      <section className="card impresora__paso impresora__kit">
        <h2>La forma rápida: el kit para el PC de la caja</h2>
        <p>
          Un archivo que se abre con doble clic en el computador donde está conectada la
          térmica. Revisa todo en orden y <b>pregunta antes de cambiar nada</b>: el servicio de
          impresión, si Windows ve la impresora por USB (y si el cable da error), si el driver
          está instalado, el puerto, la pausa y los trabajos atascados, la predeterminada y el
          papel; imprime la página de prueba de Windows y una <b>prueba directa</b> que no pasa
          por el dibujo del driver; y crea el acceso directo <b>Papaghetti Caja</b> que imprime
          sin diálogo.
        </p>
        <div className="impresora__btns">
          <a className="btn btn--primary" href="/admin/impresora/kit" download>
            <span>Descargar el kit (.bat)</span>
          </a>
        </div>
        <ol className="impresora__lista">
          <li>
            Chrome puede avisar que el archivo &quot;puede ser peligroso&quot;: pulsa{" "}
            <b>Conservar</b>. Es un script de texto de Papaghetti.
          </li>
          <li>
            Doble clic. Si sale &quot;Windows protegió su PC&quot;: <b>Más información → Ejecutar de
            todas formas</b>. Acepta el permiso de administrador.
          </li>
          <li>
            Responde <b>S</b> o <b>N</b> a cada pregunta. Si falta el driver, te abre las páginas;
            instálalo y vuelve a abrir el kit.
          </li>
          <li>
            Al final deja un informe en el Escritorio y <b>copiado</b>: pégalo por WhatsApp para
            revisarlo.
          </li>
        </ol>
      </section>

      {/* LA PRUEBA, EN ORDEN. Lo mínimo que hay que hacer y anotar para que, salga o no
          salga, se sepa exactamente en qué paso se quedó. */}
      <section className="card impresora__paso">
        <h2>Lista para el día de la prueba</h2>
        <ol className="impresora__lista">
          <li>
            Térmica <b>encendida</b>, con rollo, cable USB directo al PC (puerto de atrás, sin hub).
            Autotest con FEED: <b>¿sale?</b>
          </li>
          <li>
            Driver POS-58 instalado y el <b>kit</b> ejecutado. <b>¿Salió la página de prueba de
            Windows? ¿Y la prueba directa?</b>
          </li>
          <li>
            Cierra Chrome del todo y ábrelo desde <b>Papaghetti Caja</b>. Entra aquí y pulsa{" "}
            <b>Imprimir el patrón de prueba</b> (paso 2). La primera vez, si aparece el diálogo:
            destino la térmica, márgenes <b>Ninguno</b>, escala <b>100</b>.
          </li>
          <li>
            Mide el patrón: <b>¿la regla llega a 48? ¿el 10 mide 10 mm? ¿el tablero sale nítido?</b>
          </li>
          <li>
            En la caja, cobra un pedido de prueba y pulsa <b>Imprimir</b>. Anota qué salió (o
            foto del papel) y manda el informe del kit.
          </li>
        </ol>
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
            onClick={() =>
              patron && imprimirImagen(patron.toDataURL("image/png"), true, "Patrón de prueba", R.mm, alinear)
            }
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
        <p className="impresora__nota">No aplica a la TP586 solo USB del local: es para térmicas Bluetooth o con cable USB-serie.</p>
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
