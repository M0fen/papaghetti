"use client";

/**
 * EL EDITOR DEL COMPROBANTE, CON EL PAPEL AL LADO.
 *
 * El dueño no tiene una térmica en la mano cada vez que cambia una línea: aquí ve, en
 * vivo y mientras escribe, la imagen que quema la térmica (58 u 80 mm, la del equipo),
 * lo que sale en la impresora de texto y el mensaje de WhatsApp. Las tres salen del
 * mismo `papelDe` que usa el comprobante de verdad, con un pedido de muestra: lo que se
 * ve aquí es lo que va a salir.
 *
 * Los campos son CONTROLADOS a propósito: React 19 reinicia el formulario después de
 * guardar, y un campo suelto volvía a su valor de antes justo cuando el dueño miraba
 * si se había guardado. Los datos del cliente son botones con un campo oculto "1"/"0"
 * por la misma razón: una casilla volvía a su estado inicial con ese reinicio.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  guardarComprobanteAction,
  guardarLogoComprobanteAction,
  quitarLogoComprobanteAction,
} from "@/app/admin/acciones-comprobante";
import BotonGuardar from "./BotonGuardar";
import { useRollo } from "./useRollo";
import { ROLLOS, type Rollo } from "@/lib/rollo";
import { SITIO_DOMINIO } from "@/lib/sitio";
import {
  CAMPOS_CLIENTE,
  CIERRE_POR_DEFECTO,
  claveCambiaEnTexto,
  LARGO,
  LOGO_DE_LA_CASA,
  LOGO_MAX_CARACTERES,
  TITULO,
  papelDe,
  pedidoDeMuestra,
  tieneEmoji,
  validarComprobante,
  type AjustesPapel,
  type DatosClientePapel,
  type FormularioComprobante,
} from "@/lib/papel";
import { binarizar, cargarImagen, dibujarTiquete, LOGO_GUARDADO, prepararLogo } from "@/lib/tiquete-imagen";
import { comoSaleEnTexto, lineasImpresas, renglonesDePapel } from "@/lib/tiquete-escpos";
import { textoDePapel } from "@/lib/comprobantes";

/** Cuánta tinta deja el paso a blanco y negro: el umbral de `prepararLogo`. */
const TINTA = [
  { id: "menos", label: "Más fino", umbral: 105 },
  { id: "normal", label: "Normal", umbral: 150 },
  { id: "mas", label: "Más grueso", umbral: 200 },
] as const;
type Tinta = (typeof TINTA)[number]["id"];

type Vista = "imagen" | "texto" | "whatsapp";
const VISTAS: { id: Vista; label: string }[] = [
  { id: "imagen", label: "Térmica" },
  { id: "texto", label: "Impresora de texto" },
  { id: "whatsapp", label: "WhatsApp" },
];

const PLACEHOLDER_PIE = ["Wi-Fi: Papaghetti · Clave: pasta2026", "Síguenos: @papaghetti.pereira", SITIO_DOMINIO];

/** *negrita* y _cursiva_ como las pinta WhatsApp (solo para la vista previa). */
function LineaWa({ t }: { t: string }) {
  if (!t) return <br />;
  const partes = t.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).filter(Boolean);
  return (
    <>
      {partes.map((x, i) =>
        x.length > 2 && x.startsWith("*") && x.endsWith("*") ? (
          <b key={i}>{x.slice(1, -1)}</b>
        ) : x.length > 2 && x.startsWith("_") && x.endsWith("_") ? (
          <em key={i}>{x.slice(1, -1)}</em>
        ) : (
          <span key={i}>{x}</span>
        ),
      )}
    </>
  );
}

/** El aviso de debajo de un campo: emojis que no se imprimen. */
function AvisoEmoji({ texto }: { texto: string }) {
  if (!tieneEmoji(texto)) return null;
  return <small className="field__alerta">Los emojis no se imprimen: este texto sale sin ellos.</small>;
}

export default function EditorComprobante({
  inicial,
  logo,
  whatsapp,
  impuestoPct,
}: {
  /** Lo guardado (las tres líneas al pie siempre presentes, vacías o no). */
  inicial: FormularioComprobante;
  /** El logo propio guardado, o "" si sale el de la casa. */
  logo: string;
  /** Para la vista previa del teléfono (sale si no hay teléfono del local). */
  whatsapp: string;
  impuestoPct: number;
}) {
  const [textos, setTextos] = useState(inicial);
  /* Cuando el servidor devuelve lo guardado (ya limpio: espacios de más, topes), el
     editor lo toma. Se compara por contenido: cada guardado trae un objeto nuevo
     aunque nada haya cambiado, y así no se pisa lo que se esté escribiendo. Los textos
     y el logo van por separado: guardar uno no borra lo pendiente del otro. */
  const firma = JSON.stringify(inicial);
  const [firmaVista, setFirmaVista] = useState(firma);
  if (firma !== firmaVista) {
    setFirmaVista(firma);
    setTextos(inicial);
  }
  const [logoNuevo, setLogoNuevo] = useState<string | null>(null);
  const [logoVisto, setLogoVisto] = useState(logo);
  if (logo !== logoVisto) {
    setLogoVisto(logo);
    setLogoNuevo(null);
  }

  const poner = <K extends keyof FormularioComprobante>(k: K, v: FormularioComprobante[K]) =>
    setTextos((t) => ({ ...t, [k]: v }));
  const ponerPie = (i: number, v: string) =>
    setTextos((t) => ({ ...t, lineasPie: t.lineasPie.map((l, j) => (j === i ? v : l)) }));
  const alternar = (k: keyof DatosClientePapel) =>
    setTextos((t) => ({ ...t, datosCliente: { ...t.datosCliente, [k]: !t.datosCliente[k] } }));

  const validacion = useMemo(() => validarComprobante(textos), [textos]);
  const sinGuardar = JSON.stringify(textos) !== firma;

  /* ── El logo propio: se prepara AQUÍ, en el navegador, antes de subir nada ── */
  const archivo = useRef<HTMLInputElement>(null);
  const fuente = useRef<{ img: HTMLImageElement; url: string } | null>(null);
  const [tinta, setTinta] = useState<Tinta>("normal");
  const [procesando, setProcesando] = useState(false);
  const [errorLogo, setErrorLogo] = useState("");
  useEffect(
    () => () => {
      if (fuente.current) URL.revokeObjectURL(fuente.current.url);
    },
    [],
  );

  /* Nunca lanza: un error aquí (una imagen que el navegador no deja leer, como algunos
     SVG) se vuelve un aviso, también al tocar "Más fino" o "Más grueso". */
  const preparar = (img: HTMLImageElement, t: Tinta) => {
    const umbral = TINTA.find((x) => x.id === t)?.umbral ?? 150;
    try {
      /* Si un logo con mucho detalle pesa de más, se encoge hasta que quepa: el papel lo
         dibuja a la mitad de este tamaño de todos modos. */
      for (const f of [1, 0.75, 0.5]) {
        const r = prepararLogo(img, img.naturalWidth, img.naturalHeight, umbral, {
          ancho: Math.round(LOGO_GUARDADO.ancho * f),
          alto: Math.round(LOGO_GUARDADO.alto * f),
        });
        if (!r) {
          setErrorLogo("No encontramos un dibujo en esa imagen. Prueba con el logo sobre un fondo liso.");
          return;
        }
        if (r.dataUrl.length <= LOGO_MAX_CARACTERES) {
          setErrorLogo("");
          setLogoNuevo(r.dataUrl);
          return;
        }
      }
      setErrorLogo("Ese logo tiene demasiado detalle para el papel. Prueba con una versión más sencilla.");
    } catch {
      setLogoNuevo(null);
      setErrorLogo("No se pudo preparar ese logo en este equipo. Prueba con un PNG o un JPG.");
    }
  };

  const onArchivo = async (file?: File) => {
    if (!file) return;
    setErrorLogo("");
    if (!file.type.startsWith("image/")) {
      setErrorLogo("Eso no es una imagen. Elige un PNG o un JPG.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorLogo("La imagen pesa demasiado (máximo 10 MB).");
      return;
    }
    setProcesando(true);
    /* Un archivo nuevo reemplaza al que estaba pendiente: si este falla, no queda a la
       vista (con su botón de guardar) el logo de antes como si fuera el nuevo. */
    setLogoNuevo(null);
    const url = URL.createObjectURL(file);
    try {
      const img = await cargarImagen(url, 10000);
      if (!img || !img.naturalWidth) {
        URL.revokeObjectURL(url);
        setErrorLogo("No se pudo abrir esa imagen. Prueba con un PNG o un JPG.");
        return;
      }
      if (fuente.current) URL.revokeObjectURL(fuente.current.url);
      fuente.current = { img, url };
      preparar(img, tinta);
    } catch {
      setErrorLogo("No se pudo preparar el logo en este equipo.");
    } finally {
      setProcesando(false);
      if (archivo.current) archivo.current.value = "";
    }
  };

  const cambiarTinta = (t: Tinta) => {
    setTinta(t);
    if (fuente.current) preparar(fuente.current.img, t);
  };

  /* ── La vista previa: el mismo papel que sale de verdad, con un pedido de muestra ── */
  /* Arranca en el rollo de ESTE equipo, pero cambiarlo aquí es solo para mirar: el rollo
     del equipo lo usa la impresión de verdad, y un vistazo a 80 mm desde Ajustes no puede
     dejar la caja imprimiendo a otra medida. */
  const [rolloEquipo] = useRollo();
  const [rolloVista, setRollo] = useState<Rollo | null>(null);
  const rollo = rolloVista ?? rolloEquipo;
  const cols = ROLLOS[rollo].cols;
  const [vista, setVista] = useState<Vista>("imagen");
  const [muestra, setMuestra] = useState<"local" | "domicilio">("local");
  const borrador = useMemo<AjustesPapel>(
    () => ({
      negocio: textos.negocio,
      razonSocial: textos.razonSocial,
      nit: textos.nit,
      direccion: textos.direccion,
      telefonoLocal: textos.telefonoLocal,
      whatsapp,
      impuestoPct,
      comprobante: {
        logo: logoNuevo ?? (logo || undefined),
        mensajeCierre: textos.mensajeCierre,
        lineasPie: textos.lineasPie,
        datosCliente: textos.datosCliente,
      },
    }),
    [textos, logoNuevo, logo, whatsapp, impuestoPct],
  );
  /* Con la tarifa de Ajustes tal cual: con 0 % la muestra no dice "Incluye impuesto…",
     igual que los pedidos de verdad. */
  const pedido = useMemo(() => pedidoDeMuestra(muestra, impuestoPct), [muestra, impuestoPct]);
  const papel = useMemo(() => papelDe(pedido, borrador), [pedido, borrador]);
  const lineasTexto = useMemo(() => lineasImpresas(renglonesDePapel(papel, cols), cols), [papel, cols]);
  const textoWa = useMemo(() => textoDePapel(papel), [papel]);

  /* La imagen se redibuja un momento después de la última tecla (no en cada una) y en
     blanco y negro puros: es exactamente lo que quema el cabezal. */
  const [png, setPng] = useState<string | null>(null);
  const logos = useRef(new Map<string, HTMLImageElement | null>());
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
      } catch {
        /* sin API de fuentes: las del sistema */
      }
      const src = papel.cabecera.logo;
      if (!logos.current.has(src)) logos.current.set(src, await cargarImagen(src));
      if (!vivo) return;
      try {
        const lienzo = dibujarTiquete({ papel, logo: logos.current.get(src) ?? null, rollo });
        setPng(binarizar(lienzo).toDataURL("image/png"));
      } catch {
        setPng(null);
      }
    }, 160);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [papel, rollo]);

  const logoVisible = logoNuevo ?? (logo || LOGO_DE_LA_CASA);

  return (
    <div className="cbte-editor">
      <div className="cbte-editor__cabeza">
        <h2 className="ins-cat__title">🧾 Comprobante</h2>
        <p className="setgroup__nota">
          El papel que se le entrega al cliente. La imagen de la térmica, la impresora de texto y el
          WhatsApp salen de aquí, y dicen lo mismo.{" "}
          <a className="cbte-editor__ir" href="#cbte-vista">
            Ver cómo queda ↓
          </a>
        </p>
      </div>

      <div className="cbte-editor__cuerpo">
        <div className="cbte-editor__col">
          {/* ── Logo: va arriba porque arriba sale. Tiene sus propios botones. ── */}
          <section className="setgroup cbte-editor__logo" aria-labelledby="cbte-logo-t">
            <h3 id="cbte-logo-t" className="cbte-editor__h">
              Logo del papel
            </h3>
            <div className="cbte-editor__logocaja">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoVisible} alt={logoNuevo ? "Logo nuevo, en blanco y negro" : "Logo actual del comprobante"} />
            </div>
            <p className="field__nota">
              {logoNuevo
                ? "Así queda en blanco y negro, como lo quema la térmica. Todavía no está guardado."
                : logo
                  ? "Tu logo, en blanco y negro."
                  : "Hoy sale el logo de la casa."}
            </p>
            {logoNuevo && (
              <div className="cbte-editor__tinta" role="group" aria-label="Grosor del trazo">
                {TINTA.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className={`chipbtn cbte-editor__chip ${tinta === x.id ? "is-on" : ""}`}
                    aria-pressed={tinta === x.id}
                    onClick={() => cambiarTinta(x.id)}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            )}
            <div className="cbte-editor__acciones">
              <input
                ref={archivo}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                hidden
                onChange={(e) => onArchivo(e.target.files?.[0])}
              />
              <button
                type="button"
                className="btn btn--ghost btnmini"
                onClick={() => archivo.current?.click()}
                disabled={procesando}
              >
                <span>{procesando ? "Preparando…" : logo || logoNuevo ? "📷 Elegir otro logo" : "📷 Subir mi logo"}</span>
              </button>
              {logoNuevo && (
                <form action={guardarLogoComprobanteAction}>
                  <input type="hidden" name="logo" value={logoNuevo} />
                  <BotonGuardar className="btn btn--primary btnmini">Guardar este logo</BotonGuardar>
                </form>
              )}
              {logoNuevo && (
                <button type="button" className="btn btn--ghost btnmini" onClick={() => setLogoNuevo(null)}>
                  <span>Descartar</span>
                </button>
              )}
              {!logoNuevo && logo && (
                <form
                  action={quitarLogoComprobanteAction}
                  onSubmit={(e) => {
                    if (
                      !window.confirm(
                        "¿Quitar tu logo? El comprobante vuelve a llevar el de la casa.\n\nDeshacer no lo trae de vuelta: tendrías que subirlo otra vez.",
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <BotonGuardar className="btn btn--ghost btnmini" enviando="Quitando…">
                    Quitar logo (vuelve el de la casa)
                  </BotonGuardar>
                </form>
              )}
            </div>
            {errorLogo && (
              <p className="field__alerta" role="alert">
                {errorLogo}
              </p>
            )}
            <small className="field__nota">
              Funciona mejor un logo oscuro sobre fondo claro (PNG o JPG). Se pasa solo a blanco y negro
              puro, se le recortan los bordes vacíos y se encaja en el papel.
            </small>
          </section>

          <form action={guardarComprobanteAction} className="settings settings--wide cbte-editor__form">
            {/* ── Datos del negocio: los campos de siempre ── */}
            <fieldset className="setgroup">
              <legend>Datos del negocio</legend>
              <div className="setgrid">
                <label className="field">
                  <span>Nombre comercial</span>
                  <input
                    className="admin-input"
                    name="negocio"
                    value={textos.negocio}
                    onChange={(e) => poner("negocio", e.target.value)}
                    maxLength={LARGO.negocio}
                    required
                    autoComplete="organization"
                  />
                  <AvisoEmoji texto={textos.negocio} />
                </label>
                <label className="field">
                  <span>Razón social</span>
                  <input
                    className="admin-input"
                    name="razonSocial"
                    value={textos.razonSocial}
                    onChange={(e) => poner("razonSocial", e.target.value)}
                    maxLength={LARGO.razonSocial}
                    placeholder="Ej.: Enredos de Pereira S.A.S."
                  />
                  <AvisoEmoji texto={textos.razonSocial} />
                </label>
                <label className="field">
                  <span>NIT</span>
                  <input
                    className="admin-input"
                    name="nit"
                    value={textos.nit}
                    onChange={(e) => poner("nit", e.target.value)}
                    maxLength={LARGO.nit}
                    placeholder="Ej.: 901.234.567-8"
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span>Teléfono del local</span>
                  <input
                    className="admin-input"
                    name="telefonoLocal"
                    type="tel"
                    inputMode="tel"
                    value={textos.telefonoLocal}
                    onChange={(e) => poner("telefonoLocal", e.target.value)}
                    maxLength={LARGO.telefonoLocal}
                    placeholder="Ej.: 606 333 4455"
                  />
                  <small className="field__nota">Vacío: sale el WhatsApp del negocio, si ya está puesto.</small>
                </label>
                <label className="field field--full">
                  <span>Dirección</span>
                  <input
                    className="admin-input"
                    name="direccion"
                    value={textos.direccion}
                    onChange={(e) => poner("direccion", e.target.value)}
                    maxLength={LARGO.direccion}
                    placeholder="Ej.: Calle 19 # 8-32, Pereira"
                  />
                  <AvisoEmoji texto={textos.direccion} />
                </label>
              </div>
              <small className="field__nota cbte-editor__sitio">
                🌐 El nombre, la dirección y el teléfono también salen en el sitio web.
              </small>
            </fieldset>

            {/* ── El pie: lo que se lleva el cliente además de la cuenta ── */}
            <fieldset className="setgroup">
              <legend>Pie del papel</legend>
              <label className="field">
                <span>Mensaje de cierre (la última línea)</span>
                <input
                  className="admin-input"
                  name="mensajeCierre"
                  value={textos.mensajeCierre}
                  onChange={(e) => poner("mensajeCierre", e.target.value)}
                  maxLength={LARGO.cierre}
                  placeholder={CIERRE_POR_DEFECTO}
                />
                <small className="field__nota">Vacío: «{CIERRE_POR_DEFECTO}».</small>
                <AvisoEmoji texto={textos.mensajeCierre} />
              </label>
              <div className="cbte-editor__pie">
                {textos.lineasPie.map((l, i) => {
                  const enTexto = comoSaleEnTexto(l);
                  const cambia = l.trim() !== "" && enTexto !== l.replace(/\s+/g, " ").trim();
                  /* Una clave del Wi-Fi que la impresora de texto cambia sí importa: el
                     cliente teclearía una clave equivocada. El resto solo se informa. */
                  const clave = claveCambiaEnTexto(l);
                  return (
                    <label className="field" key={i}>
                      <span>Línea {i + 1} al pie (opcional)</span>
                      <input
                        className="admin-input"
                        name="lineaPie"
                        value={l}
                        onChange={(e) => ponerPie(i, e.target.value)}
                        maxLength={LARGO.lineaPie}
                        placeholder={`Ej.: ${PLACEHOLDER_PIE[i] ?? ""}`}
                      />
                      <AvisoEmoji texto={l} />
                      {cambia && (
                        <small className={clave ? "field__alerta" : "field__nota"}>
                          En la impresora de texto sale: «{enTexto}»
                          {clave ? ". La clave cambia: escríbela sin tildes, eñes ni signos." : "."}
                        </small>
                      )}
                    </label>
                  );
                })}
              </div>
              <small className="field__nota">
                Para la clave del Wi-Fi, tu Instagram o la página web. Las vacías no salen.
              </small>
            </fieldset>

            {/* ── Datos del cliente: botones, no casillas (ver la cabecera) ── */}
            <fieldset className="setgroup">
              <legend>Datos del cliente en el papel</legend>
              <div className="cbte-editor__chips" role="group" aria-label="Datos del cliente que salen en el papel">
                {CAMPOS_CLIENTE.map((x) => {
                  const on = textos.datosCliente[x.id];
                  return (
                    <span key={x.id}>
                      <button
                        type="button"
                        className={`chipbtn cbte-editor__chip ${on ? "is-on" : ""}`}
                        aria-pressed={on}
                        onClick={() => alternar(x.id)}
                      >
                        {on ? "✓ " : ""}
                        {x.label}
                      </button>
                      <input type="hidden" name={`dc_${x.id}`} value={on ? "1" : "0"} />
                    </span>
                  );
                })}
              </div>
              <small className="field__nota">
                Solo salen si el pedido los trae. El teléfono y la dirección son del cliente: salen en el
                papel que se le entrega a él.
              </small>
            </fieldset>

            {/* ── Lo que no se cambia, y por qué ── */}
            <div className="cbte-editor__fijo">
              <b>Esto no se cambia</b>
              <p>
                <span>Título</span>
                {TITULO}
              </p>
              <small className="field__nota">
                Va fijo porque este papel es un comprobante de consumo, no un documento de la DIAN. Por
                eso tampoco se aceptan, en ningún texto de aquí, las palabras de esos documentos.
              </small>
            </div>

            {!validacion.ok && (
              <p className="field__alerta cbte-editor__error" role="alert">
                {validacion.error}
              </p>
            )}
            {/* La vista previa cambia con cada tecla, y por eso mismo parece guardado
                cuando todavía no lo está. */}
            {validacion.ok && sinGuardar && (
              <p className="field__nota cbte-editor__pendiente">
                Hay cambios sin guardar: la vista previa ya los muestra, el comprobante de verdad todavía no.
              </p>
            )}
            <BotonGuardar disabled={!validacion.ok}>Guardar comprobante</BotonGuardar>
          </form>
        </div>

        {/* ── La vista previa ── */}
        <aside id="cbte-vista" className="cbte-editor__vista" aria-label="Vista previa del comprobante">
          <div className="cbte-papel cbte-editor__seg" role="group" aria-label="Qué salida ver">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={vista === v.id ? "is-on" : ""}
                aria-pressed={vista === v.id}
                onClick={() => setVista(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="cbte-editor__opciones">
            {vista !== "whatsapp" && (
              <div className="cbte-papel cbte-editor__seg" role="group" aria-label="Rollo de la térmica">
                {([58, 80] as const).map((mm) => (
                  <button
                    key={mm}
                    type="button"
                    className={rollo === mm ? "is-on" : ""}
                    aria-pressed={rollo === mm}
                    onClick={() => setRollo(mm)}
                  >
                    {mm} mm
                  </button>
                ))}
              </div>
            )}
            <div className="cbte-papel cbte-editor__seg" role="group" aria-label="Pedido de muestra">
              {(
                [
                  ["local", "En el local"],
                  ["domicilio", "Domicilio"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={muestra === id ? "is-on" : ""}
                  aria-pressed={muestra === id}
                  onClick={() => setMuestra(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {vista === "imagen" &&
            (png ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="cbte-imagen cbte-editor__img"
                src={png}
                alt={`Vista previa: el comprobante en la térmica de ${rollo} mm`}
              />
            ) : (
              <p className="field__nota cbte-editor__cargando">Dibujando el papel…</p>
            ))}
          {vista === "texto" && (
            <div
              className={`cbte-editor__esc cbte-editor__esc--${cols}`}
              aria-label={`Así sale en la impresora de texto, a ${cols} columnas`}
            >
              {lineasTexto.map((l, i) => (
                <div
                  key={i}
                  className={`cbte-editor__escl is-${l.alinear}${l.negrita ? " is-b" : ""}${l.tamano === 2 ? " is-doble" : l.tamano === "alto" ? " is-alto" : ""}`}
                >
                  {l.texto || " "}
                </div>
              ))}
            </div>
          )}
          {vista === "whatsapp" && (
            <div className="cbte-editor__wa" aria-label="Así llega por WhatsApp">
              {textoWa.split("\n").map((t, i) => (
                <div key={i}>
                  <LineaWa t={t} />
                </div>
              ))}
            </div>
          )}
          <small className="field__nota">
            Con un pedido de muestra. {vista === "texto" && "La impresora de texto (Bluetooth o COM) no lleva logo ni tildes. "}
            Lo que no guardes no cambia el papel de verdad.
          </small>
        </aside>
      </div>
    </div>
  );
}
