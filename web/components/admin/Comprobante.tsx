"use client";

/**
 * EL COMPROBANTE QUE SE LE ENTREGA AL CLIENTE.
 *
 * OJO, y esto no es un detalle de estilo: Papaghetti **no emite factura electrónica
 * ni documento equivalente P.O.S.** de la DIAN. Un comprobante interno NO reemplaza
 * esa obligación. Por eso este papel se llama COMPROBANTE DE CONSUMO y tiene
 * prohibido llevar las palabras "Factura", "Documento equivalente", "CUFE", "CUDE"
 * o una resolución de numeración: imitar un documento fiscal sin serlo es peor que
 * no entregar nada. El consecutivo es interno y así lo dice. (El dueño personaliza
 * el papel en Ajustes → Comprobante, pero el título y la nota legal son fijos y esas
 * palabras se rechazan al guardar: ver lib/papel.ts.)
 *
 * IMPRIMIR SALÍA EN BLANCO, y por partida doble.
 *
 * Primero: hay un `@media print` global que apaga TODO el body
 * (`body * { visibility: hidden }`) y solo devuelve la visibilidad a lo que lleva la
 * clase `printable`. El comprobante no la llevaba — 38 de sus 38 elementos salían en
 * `visibility: hidden`.
 *
 * Y aun con la clase puesta, ese patrón es frágil: depende de que el navegador
 * respete la excepción a través de toda la cadena de ancestros apagados, y basta un
 * `transform`, un `contain` o un Safari para que se caiga. Siguió saliendo en blanco.
 *
 * Por eso ya no se imprime ESTA página. Se imprime un IFRAME que contiene únicamente
 * el comprobante: sin cromo que ocultar, no hay excepción que pueda fallar. Ningún
 * navegador puede sacar en blanco un documento en el que solo está el tiquete.
 *
 * TRES PAPELES, porque hay tres realidades: la térmica de 58mm del local (Star POS
 * TP586), una de 80mm si algún día se cambia, y la hoja normal de una impresora de
 * oficina. El rollo se recuerda POR EQUIPO (es cosa del aparato conectado), y el
 * selector cambia el dibujo, el texto ESC/POS y la regla `@page` de verdad.
 *
 * Y UN SOLO CONTENIDO: lo que dice este artículo, la imagen, el texto ESC/POS y el
 * WhatsApp sale de `papelDe` (lib/papel.ts). Antes cada uno armaba el suyo y no
 * decían lo mismo.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { formatCOP, whatsappValido, type Pedido } from "@/lib/menu";
import { papelDe, trozosNombre, type AjustesPapel } from "@/lib/papel";
import { dibujarTiquete, cargarImagen, binarizar, dibujarCalibracion } from "@/lib/tiquete-imagen";
import { textoDePapel, waHref as enlaceWa } from "@/lib/comprobantes";
import { imprimirImagen } from "@/lib/imprimir-imagen";
import ImpresionDirecta, { type TrabajosDirectos } from "@/components/admin/ImpresionDirecta";
import { trabajoEscPos, type Bitmap } from "@/lib/escpos";
import { codificarRenglones, renglonesDePapel } from "@/lib/tiquete-escpos";
import { ROLLOS } from "@/lib/rollo";
import { useAlineacion, useRollo } from "@/components/admin/useRollo";

/**
 * LA HEBRA: el mismo fideo que recorre el sitio, aquí como separador.
 *
 * Es la única "textura" que se permite el papel. Una línea punteada es ruido de
 * formulario; esta ondita dice Papaghetti sin gritar, y una térmica la imprime
 * perfecta porque es un trazo negro de 1px, no una trama de grises.
 */
function Hebra({ corta }: { corta?: boolean }) {
  return (
    <svg
      className={`cbte__hebra ${corta ? "cbte__hebra--corta" : ""}`}
      viewBox="0 0 130 8"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M1 4 Q 17 0.5 33 4 T 65 4 T 97 4 T 129 4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.1}
        strokeLinecap="round"
      />
    </svg>
  );
}

type Hoja = "termica" | "hoja";

export default function Comprobante({
  pedido: p,
  ajustes: a,
  auto,
  wa,
  volver = "pedidos",
}: {
  pedido: Pedido;
  /** Solo lo que el papel necesita (`ajustesPapelDe`), con el logo. */
  ajustes: AjustesPapel;
  /** Abre el diálogo de impresión al entrar (se llega desde el botón de la caja). */
  auto?: boolean;
  /** Llega desde "WhatsApp" de un pedido sin teléfono: arranca pidiendo el número. */
  wa?: boolean;
  /** De dónde se vino, para que "Volver" devuelva ahí (la caja o el archivo). */
  volver?: "pedidos" | "comprobantes";
}) {
  const [papel, setPapel] = useState<Hoja>("termica");
  const [rollo, setRollo] = useRollo();
  const [alinear] = useAlineacion();
  const R = ROLLOS[rollo];
  const [tel, setTel] = useState(p.telefono ?? "");
  const [pidiendoTel, setPidiendoTel] = useState(Boolean(wa) && !p.telefono);
  const hoja = useRef<HTMLElement>(null);

  /* El comprobante, decidido UNA vez: de aquí salen el artículo, la imagen, el texto
     ESC/POS y el WhatsApp. La tarifa es la del PEDIDO, no la de Ajustes: un
     comprobante archivado dice el porcentaje con el que se cobró. */
  const c = useMemo(() => papelDe(p, a), [p, a]);

  /* Si el logo propio no se deja pintar en el artículo, se escribe el nombre. */
  const [logoRoto, setLogoRoto] = useState(false);

  /* La imagen del tiquete, ya dibujada. Se hace una vez al montar y cada vez que
     cambia el pedido: sirve para imprimir, descargar y ver en pantalla, así que lo
     que se ve es EXACTAMENTE lo que sale. */
  const [png, setPng] = useState<string | null>(null);
  /* La misma imagen en blanco y negro PUROS: es la que va a la térmica y al archivo.
     El cabezal no sabe de grises; el antialias de pantalla le sale como texto
     "peludo". En pantalla se ve la suave, que es más bonita. */
  const [pngTermica, setPngTermica] = useState<string | null>(null);
  /* El canvas binarizado en sí: es lo que se convierte a ESC/POS para el camino
     directo (Bluetooth / serie), sin pasar por PNG. */
  const [canvasTermica, setCanvasTermica] = useState<HTMLCanvasElement | null>(null);
  /* Si el navegador no pudo dibujar ni la versión sin logo, se imprime el artículo. */
  const [sinImagen, setSinImagen] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
      } catch {
        /* sin API de fuentes: se dibuja con las del sistema */
      }
      const logo = await cargarImagen(c.cabecera.logo);
      if (!vivo) return;
      const pintar = (l: HTMLImageElement | null) => {
        const lienzo = dibujarTiquete({ papel: c, logo: l, rollo });
        const bin = binarizar(lienzo);
        return { suave: lienzo.toDataURL("image/png"), termica: bin.toDataURL("image/png"), bin };
      };
      /* UN LOGO QUE ENSUCIA EL LIENZO NO PUEDE DEJAR LA CAJA SIN PAPEL. Si dibujarlo
         falla (una imagen de otro origen hace fallar getImageData y toDataURL), se
         vuelve a dibujar con el nombre escrito: el botón no se queda en
         "Preparando…" para siempre. */
      let hecho: ReturnType<typeof pintar> | null = null;
      try {
        hecho = pintar(logo);
      } catch {
        try {
          hecho = pintar(null);
        } catch {
          hecho = null;
        }
      }
      if (!vivo) return;
      if (hecho) {
        setPng(hecho.suave);
        setPngTermica(hecho.termica);
        setCanvasTermica(hecho.bin);
        setSinImagen(false);
      } else {
        setSinImagen(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [c, rollo]);

  /**
   * IMPRIMIR LA IMAGEN, Y NADA MÁS.
   *
   * Tres versiones anteriores imprimían HTML+CSS —la página, luego un iframe con
   * las hojas de estilo copiadas— y las tres acabaron en el mismo sitio: papel en
   * blanco o solo el logo. Entre un documento HTML y una térmica hay demasiadas
   * manos (el @media print global, la regla @page, el driver de Windows y sus
   * papeles declarados, "gráficos en segundo plano") y cada una puede dejar caer el
   * texto sin avisar. El logo llegaba porque es una IMAGEN.
   *
   * Así que se manda un documento que solo contiene una imagen a todo lo ancho. Un
   * driver imprime un bitmap igual que imprime su autotest. Y se abre en una
   * PESTAÑA visible, no en un iframe escondido: si el diálogo fallara, el operario
   * tiene el tiquete delante y puede imprimirlo con Ctrl+P o guardarlo con clic
   * derecho. Nada queda oculto donde no se pueda rescatar.
   */
  /** El bitmap binarizado como píxeles crudos, para el codificador ESC/POS. */
  const getBitmap = (): Bitmap | null => {
    if (!canvasTermica) return null;
    const ctx = canvasTermica.getContext("2d");
    if (!ctx) return null;
    const d = ctx.getImageData(0, 0, canvasTermica.width, canvasTermica.height);
    return { width: d.width, height: d.height, data: d.data };
  };

  /* Los dos trabajos del camino directo: el tiquete en TEXTO ESC/POS (2 KB, el
     rápido y el que menos puede fallar) y el mismo bitmap de arriba como raster. */
  const trabajos: TrabajosDirectos = {
    texto: () => codificarRenglones(renglonesDePapel(c, R.cols), R.cols),
    imagen: () => {
      const bmp = getBitmap();
      return bmp ? trabajoEscPos(bmp) : null;
    },
  };

  const imprimir = () => {
    /* El último recurso: sin imagen, el artículo (que lleva `printable` y su propia
       hoja de impresión) sale por el diálogo de siempre. */
    if (sinImagen) {
      window.print();
      return;
    }
    if (!png || !pngTermica) return;
    const termica = papel === "termica";
    imprimirImagen(termica ? pngTermica : png, termica, `Comprobante ${c.numero}`, R.mm, alinear);
  };

  /* El patrón de calibración: una regla en milímetros y un tablero de 1 px. En un
     solo papel se ve si el driver recorta los bordes (la regla no llega a 72) o si
     está reescalando (el tablero sale gris o con bandas en vez de nítido). Es la
     prueba que puede hacer quien esté delante de la impresora, sin nadie más. */
  const calibrar = () => {
    imprimirImagen(dibujarCalibracion(rollo).toDataURL("image/png"), true, "Patrón de calibración", R.mm, alinear);
  };

  useEffect(() => {
    if (auto && png) {
      const t = setTimeout(imprimir, 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, png]);

  /* El texto para WhatsApp y el portapapeles: el mismo papel, en texto (con los avisos
     de anulado/devuelto, los datos del negocio y la misma nota legal). */
  const texto = useMemo(() => textoDePapel(c), [c]);

  const waHref = enlaceWa(tel, texto);
  const telOk = whatsappValido(tel);
  const listo = Boolean(png && pngTermica) || sinImagen;

  return (
    <>
      {/* El tamaño de papel se escribe de verdad en la regla @page: es lo único que
          hace que el navegador saque una tira de 80mm en vez de una carta. La altura
          exacta la fija `imprimir()` justo antes de abrir el diálogo. */}
      <style id="pg-page">{
        papel === "termica"
          ? `@page { size: ${rollo}mm 297mm; margin: 0; }`
          : "@page { size: auto; margin: 12mm; }"
      }</style>

      <div className="cbte-acciones no-print">
        <div className="cbte-papel" role="group" aria-label="Tamaño de papel">
          {([58, 80] as const).map((mm) => (
            <button
              key={mm}
              type="button"
              className={papel === "termica" && rollo === mm ? "is-on" : ""}
              onClick={() => {
                setPapel("termica");
                setRollo(mm);
              }}
            >
              Térmica {mm}mm
            </button>
          ))}
          <button
            type="button"
            className={papel === "hoja" ? "is-on" : ""}
            onClick={() => setPapel("hoja")}
          >
            Hoja normal
          </button>
        </div>
        <button className="btn btn--primary" type="button" onClick={imprimir} disabled={!listo}>
          <span>{listo ? "Imprimir" : "Preparando…"}</span>
        </button>
        {/* La misma imagen, como archivo. Es el salvavidas que no depende de NADA
            del navegador: Windows imprime una foto en cualquier impresora con
            "ajustar al marco", y si la térmica se niega desde Chrome, desde el visor
            de fotos sale. */}
        {pngTermica && (
          <a
            className="btn btn--ghost"
            href={pngTermica}
            download={`comprobante-${p.consecutivo ?? p.id}.png`}
          >
            <span>Descargar imagen</span>
          </a>
        )}
        {/* La instrucción del caso real: vista previa bien + papel que no sale =
            el DRIVER no tiene el papel del rollo configurado. Se dice aquí, donde
            está el que sufre el problema, no en un manual que nadie abre. */}
        {papel === "termica" && (
          <small className="cbte-ayuda">
            Se imprime como una sola imagen de {R.mm}&nbsp;mm. En el diálogo de Chrome:
            márgenes <b>Ninguno</b>, escala 100, sin encabezados. En Windows, en las
            preferencias de la térmica, papel <b>{R.papelDriver}</b>. Con la impresora
            delante,{" "}
            <button type="button" className="cbte-link" onClick={calibrar}>
              imprime el patrón de prueba
            </button>
            : la regla debe llegar a {R.mm} y el tablero salir nítido. Si nada sale desde el
            navegador: <b>Descargar imagen</b> y abrirla en Fotos de Windows, o prueba el
            camino directo de aquí abajo.
          </small>
        )}
        {papel === "termica" && <ImpresionDirecta trabajos={trabajos} />}
        {/* WhatsApp SIEMPRE. Antes el botón solo existía si el pedido traía teléfono,
            o sea casi nunca: en el mostrador nadie lo pide. Si no hay número, se
            escribe aquí y ya. */}
        {p.telefono ? (
          <a className="btn btn--gold" href={waHref} target="_blank" rel="noopener noreferrer">
            <span>Enviar por WhatsApp</span>
          </a>
        ) : !pidiendoTel ? (
          <button className="btn btn--gold" type="button" onClick={() => setPidiendoTel(true)}>
            <span>Enviar por WhatsApp</span>
          </button>
        ) : (
          <span className="cbte-wa">
            <input
              type="tel"
              inputMode="numeric"
              autoFocus
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder="Número de WhatsApp"
              aria-label="Número de WhatsApp del cliente"
            />
            <a
              className={`btn btn--gold ${telOk ? "" : "is-off"}`}
              href={telOk ? waHref : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!telOk}
            >
              <span>Enviar</span>
            </a>
          </span>
        )}
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => navigator.clipboard?.writeText(texto)}
        >
          <span>Copiar texto</span>
        </button>
        {/* Desde el archivo, "Volver" devuelve a LA MISMA VISTA (búsqueda y filtros
            intactos) si se llegó navegando; en una pestaña nueva no hay a dónde
            volver y se va a la portada del archivo. */}
        <a
          className="btn btn--ghost"
          href={volver === "comprobantes" ? "/admin/comprobantes" : "/admin/pedidos"}
          onClick={(e) => {
            if (volver === "comprobantes" && window.history.length > 1 && document.referrer.includes("/admin/comprobantes")) {
              e.preventDefault();
              window.history.back();
            }
          }}
        >
          <span>{volver === "comprobantes" ? "← Volver a comprobantes" : "← Volver a la caja"}</span>
        </a>
      </div>

      {/* `printable` es lo que lo hace visible al imprimir: sin esa clase el papel
          salía en blanco (ver la cabecera de este archivo). */}
      {/* En pantalla se muestra LA IMAGEN: es la misma que se imprime, se descarga y
          se manda, así que lo que se ve es exactamente lo que sale. El artículo de
          abajo queda para lectores de pantalla, copiar texto y Ctrl+P. */}
      {png && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cbte-imagen" src={png} alt={`Comprobante ${c.numero}`} />
      )}
      <article
        ref={hoja}
        className={`cbte printable cbte--${papel} cbte--r${rollo} ${c.anulado ? "cbte--anulado" : ""} ${png ? "cbte--respaldo" : ""}`}
      >
        {/* UN PEDIDO CANCELADO NO PUEDE IMPRIMIR UN PAPEL QUE PAREZCA UN CONSUMO VÁLIDO.
            Se cancelaba un pedido, se abría su comprobante y salía idéntico a los demás:
            mismo número, mismo total, ni una palabra de que estaba anulado. En una caja
            eso es un papel que se puede entregar, reclamar o cuadrar por error. */}
        {c.sello && (
          <div className="cbte__anulado" role="alert">
            {c.sello.titulo}
            <em>{c.sello.detalle}</em>
          </div>
        )}

        <header className="cbte__h">
          {logoRoto ? (
            <p className="cbte__nombre">{c.cabecera.nombre}</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="cbte__logo" src={c.cabecera.logo} alt={c.cabecera.nombre} onError={() => setLogoRoto(true)} />
          )}
          {c.cabecera.datos.length > 0 && (
            <p className="cbte__datos">
              {c.cabecera.datos.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </p>
          )}
        </header>

        <Hebra />

        <div className="cbte__tit">
          {c.titulo}
          <b>{c.numero}</b>
        </div>

        <dl className="cbte__meta">
          <div>
            <dt>Fecha</dt>
            <dd>{c.fecha}</dd>
          </div>
          <div>
            <dt>Servicio</dt>
            <dd>{c.servicio}</dd>
          </div>
          {c.cliente.map((d) => (
            <div key={d.k}>
              <dt>{d.k}</dt>
              <dd>{d.v}</dd>
            </div>
          ))}
        </dl>

        <Hebra corta />

        {/* Renglón a renglón. Antes el papel ponía el nombre de la base con el subtotal
            ENTERO al lado y los extras debajo sin precio: el cliente leía "$34.400"
            como si fuera el precio de la papa criolla. */}
        <ul className="cbte__items">
          {c.cuenta.lineas.map((l, i) => (
            <li key={i}>
              <span className="cbte__cant">{l.cantidad > 1 ? `${l.cantidad}×` : ""}</span>
              <span className="cbte__nom">
                {/* Un plato de dos bases se parte en la barra, no dentro de una base
                    (como en la imagen y en el texto ESC/POS). */}
                <span>
                  {trozosNombre(l.nombre).map((t, j) => (
                    <Fragment key={j}>
                      {j > 0 && " "}
                      <span className="cbte__trozo">{t}</span>
                    </Fragment>
                  ))}
                </span>
                {l.detalle && <em>{l.detalle}</em>}
              </span>
              <span className="cbte__val">{formatCOP(l.importe)}</span>
            </li>
          ))}
        </ul>
        {c.nota && <p className="cbte__nota">Nota: {c.nota}</p>}

        <Hebra corta />

        <div className="cbte__sumas">
          {c.cuenta.sumas.map(([k, v]) => (
            <div className="cbte__linea" key={k}>
              <span>{k}</span>
              <b>{formatCOP(v)}</b>
            </div>
          ))}
        </div>

        <div className="cbte__total">
          <span>TOTAL</span>
          <b>{formatCOP(c.cuenta.total)}</b>
        </div>
        {c.cuenta.nota && <p className="cbte__incluye">{c.cuenta.nota}</p>}

        <div className="cbte__pago">
          <span>Pago</span>
          <b>{c.pago}</b>
        </div>

        <Hebra />

        <footer className="cbte__pie">
          <p className="cbte__aviso">{c.pie.legal}</p>
          {c.pie.extra.map((e, i) => (
            <p className="cbte__extra" key={i}>
              {e}
            </p>
          ))}
          <p className="cbte__gracias">{c.pie.cierre}</p>
        </footer>
      </article>
    </>
  );
}
