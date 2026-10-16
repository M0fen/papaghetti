import type { Ajustes } from "@/lib/menu";
import { whatsappValido } from "@/lib/menu";
import { sitioDe, SITIO_DOMINIO, TOPES, RECORTE_COMPARTIR, RECORTE_PORTADA } from "@/lib/sitio";
import heroFoto from "@/public/hero-enredo.webp";
import SitioGrupo from "./SitioFormulario";
import SitioFoto from "./SitioFoto";
import SitioResenas from "./SitioResenas";
import {
  guardarContactoAction,
  guardarDomiciliosAction,
  guardarRedesAction,
  guardarPortadaAction,
  guardarFotoPortadaAction,
  guardarHistoriaAction,
  guardarTextosAction,
  guardarBuscadoresAction,
  guardarFotoCompartirAction,
} from "@/app/admin/acciones-sitio";

/**
 * AJUSTES → SITIO: lo que ve el cliente, sin tocar código. Un bloque plegable por tema,
 * cada uno con su propio formulario (y cada foto con el suyo): guardar uno nunca toca
 * los demás. Las casillas muestran lo que el sitio dice HOY, sea el texto de fábrica o
 * el del dueño, y en el título de cada bloque se ve si está cambiado.
 *
 * Lo que es diseño o marca (tipografías, colores, la hebra, el video del logo, los
 * títulos de sección y los botones) no está aquí a propósito.
 */
export default function AjustesSitio({ ajustes }: { ajustes: Ajustes }) {
  const s = sitioDe(ajustes);
  const guardado = ajustes.sitio ?? {};
  const cambiado = (g: object | undefined, claves: string[]) =>
    claves.some((k) => (g as Record<string, unknown> | undefined)?.[k] !== undefined);
  const waOk = whatsappValido(ajustes.whatsapp);
  const enlaces = [ajustes.rappi ? "Rappi" : "", s.domicilios.didi ? "DiDi" : "", s.ubicacion.mapa ? "Maps" : ""].filter(Boolean);
  const portadaTexto = cambiado(guardado.portada, ["antetitulo", "frase", "pasos"]);

  return (
    <div className="sitio-ajustes">
      <div className="adminx__pageh">
        <h2 className="ins-cat__title">🌐 Sitio web</h2>
        <p>
          Lo que ve el cliente en{" "}
          <a href="/" target="_blank" rel="noopener noreferrer" className="sitio-ver">
            {SITIO_DOMINIO} ↗
          </a>
          . Cada bloque se guarda por separado y se ve en el sitio enseguida. Un texto en blanco vuelve
          al original, y «Deshacer» (arriba) revierte cualquier cambio de texto.
        </p>
      </div>

      <Grupo
        id="sitio-contacto"
        titulo="📞 Contacto y horarios"
        sub="WhatsApp, horario, dirección, teléfono e Instagram"
        chip={waOk ? undefined : "falta el WhatsApp real"}
        alerta
      >
        <p className="setgroup__nota">
          La dirección y el teléfono del local son los MISMOS que salen en el comprobante: cambiarlos
          aquí los cambia en los dos.
        </p>
        <SitioGrupo
          accion={guardarContactoAction}
          boton="Guardar contacto"
          campos={[
            {
              nombre: "whatsapp",
              etiqueta: "WhatsApp (con el 57 delante)",
              valor: ajustes.whatsapp ?? "",
              teclado: "tel",
              placeholder: "57 300 123 4567",
              alerta: waOk
                ? undefined
                : "Este es el número de ejemplo (o no hay número). Mientras siga así, el sitio esconde los botones de WhatsApp para no mandar clientes a un chat que no existe.",
              nota: "A este número llegan los pedidos de los botones de WhatsApp del sitio.",
            },
            {
              nombre: "horarios",
              etiqueta: "Horarios",
              valor: ajustes.horarios ?? "",
              tope: TOPES.horarios,
              requerido: true,
              placeholder: "Lun a Dom · 12:00 m – 10:00 pm",
              nota: "Tal como quieres que se lea. Sale en «Dónde estamos» y en el aviso de «Cerrado ahora».",
            },
            {
              nombre: "direccion",
              etiqueta: "Dirección del local",
              valor: ajustes.direccion ?? "",
              tope: TOPES.direccion,
              requerido: true,
              completo: true,
              placeholder: "Calle 00 # 00-00, barrio",
              nota: "Con calle y número: una zona («Zona Circunvalar») no le sirve a Google para medir cercanía, y eso decide si apareces cuando alguien busca comida cerca.",
            },
            {
              nombre: "ciudad",
              etiqueta: "Ciudad",
              valor: s.ubicacion.ciudad,
              tope: TOPES.ciudad,
              nota: "Sale en el pie y en los datos para Google.",
            },
            {
              nombre: "departamento",
              etiqueta: "Departamento",
              valor: s.ubicacion.departamento,
              tope: TOPES.departamento,
            },
            {
              nombre: "telefonoLocal",
              etiqueta: "Teléfono del local",
              valor: ajustes.telefonoLocal ?? "",
              teclado: "tel",
              placeholder: "606 333 4455",
              nota: "El que sale en el comprobante.",
            },
            {
              nombre: "mostrarTelefono",
              etiqueta: "Teléfono en el sitio",
              valor: "",
              tipo: "casilla",
              marcado: s.contacto.mostrarTelefono,
              nota: "Mostrarlo en «Dónde estamos» (se puede tocar para llamar). Apagado, solo sale en el comprobante.",
            },
            {
              nombre: "instagram",
              etiqueta: "Instagram",
              valor: ajustes.instagram ?? "",
              placeholder: "papaghetti.pereira",
              completo: true,
              nota: "El usuario o el enlace de tu perfil. Google lo usa para unir tu ficha con tu cuenta; para que se vea en el pie del sitio, enciende «Redes».",
            },
          ]}
        />
      </Grupo>

      <Grupo
        id="sitio-domicilios"
        titulo="🛵 Domicilios y mapa"
        sub="Rappi, DiDi y tu enlace de Google Maps"
        chip={enlaces.length ? enlaces.join(" · ") : "sin enlaces"}
      >
        <SitioGrupo
          accion={guardarDomiciliosAction}
          boton="Guardar enlaces"
          campos={[
            {
              nombre: "rappi",
              etiqueta: "Enlace de Rappi",
              valor: ajustes.rappi ?? "",
              teclado: "url",
              completo: true,
              placeholder: "https://www.rappi.com.co/restaurantes/…",
              nota: "Vacío = el sitio no muestra el botón de Rappi.",
            },
            {
              nombre: "didi",
              etiqueta: "Enlace de DiDi Food",
              valor: s.domicilios.didi,
              teclado: "url",
              completo: true,
              placeholder: "https://…",
              nota: "Vacío = sin botón de DiDi. Sale al lado del de Rappi.",
            },
            {
              nombre: "mapa",
              etiqueta: "Enlace de tu local en Google Maps",
              valor: s.ubicacion.mapa,
              teclado: "url",
              completo: true,
              placeholder: "https://maps.app.goo.gl/…",
              nota: "En Google Maps: tu local → Compartir → Copiar enlace. Así «Cómo llegar» abre tu ficha (con tus reseñas). Vacío = busca la dirección.",
            },
          ]}
        />
      </Grupo>

      <Grupo
        id="sitio-redes"
        titulo="📱 Redes"
        sub="TikTok, Facebook y mostrarlas en el pie"
        chip={s.redes.mostrar ? "se ven en el pie" : "no se muestran"}
      >
        <SitioGrupo
          accion={guardarRedesAction}
          boton="Guardar redes"
          campos={[
            {
              nombre: "mostrarRedes",
              etiqueta: "Redes en el sitio",
              valor: "",
              tipo: "casilla",
              marcado: s.redes.mostrar,
              completo: true,
              nota: "Mostrar Instagram, TikTok y Facebook en el pie (las que estén escritas). Instagram se escribe en «Contacto y horarios».",
            },
            {
              nombre: "tiktok",
              etiqueta: "TikTok",
              valor: s.redes.tiktok,
              placeholder: "@papaghetti o el enlace del perfil",
            },
            {
              nombre: "facebook",
              etiqueta: "Facebook",
              valor: s.redes.facebook,
              teclado: "url",
              placeholder: "facebook.com/tu-pagina",
            },
          ]}
        />
      </Grupo>

      <Grupo
        id="sitio-resenas"
        titulo="⭐ Reseñas reales"
        sub="Copiadas de Google o Instagram, nunca inventadas"
        chip={
          s.resenas.lista.length
            ? `${s.resenas.lista.length} · ${s.resenas.mostrar ? "se ven" : "borrador"}`
            : "ninguna"
        }
      >
        <p className="setgroup__nota">
          Solo reseñas que alguien escribió de verdad en una página pública. Publicar reseñas inventadas
          es publicidad engañosa (y Google castiga a quien lo hace). Máximo {TOPES.resenas}.
        </p>
        <SitioResenas lista={s.resenas.lista} mostrar={s.resenas.mostrar} />
      </Grupo>

      <Grupo
        id="sitio-portada"
        titulo="🏠 Portada"
        sub="Lo primero que se ve: frases, los 3 pasos y la foto"
        chip={[portadaTexto ? "texto propio" : "", s.portada.foto ? "foto propia" : ""].filter(Boolean).join(" · ") || "original"}
      >
        <SitioGrupo
          accion={guardarPortadaAction}
          boton="Guardar portada"
          restaurar="Restaurar el texto original"
          campos={[
            {
              nombre: "antetitulo",
              etiqueta: "Línea de arriba",
              valor: s.portada.antetitulo,
              tope: TOPES.antetitulo,
              nota: "La línea pequeña sobre el logo (sale en mayúsculas).",
            },
            {
              nombre: "frase",
              etiqueta: "Frase principal",
              valor: s.portada.frase,
              tope: TOPES.frase,
              tipo: "area",
              filas: 2,
              nota: "La frase grande bajo el logo.",
            },
            {
              nombre: "paso1",
              etiqueta: "Paso 1 · Base",
              valor: s.portada.pasos[0],
              tope: TOPES.paso,
            },
            {
              nombre: "paso2",
              etiqueta: "Paso 2 · Proteína",
              valor: s.portada.pasos[1],
              tope: TOPES.paso,
            },
            {
              nombre: "paso3",
              etiqueta: "Paso 3 · Toppings",
              valor: s.portada.pasos[2],
              tope: TOPES.paso,
              nota: "La línea pequeña bajo cada paso: qué hay para elegir.",
            },
          ]}
        />
        <h4 className="sitio-sub">Foto de la portada</h4>
        <SitioFoto
          accion={guardarFotoPortadaAction}
          actual={s.portada.foto}
          fabrica={heroFoto.src}
          recorte={RECORTE_PORTADA}
          vista="retrato"
          conTexto
          boton="Guardar foto"
          quitar="Volver a la foto original"
          nota="Se recorta sola en vertical (como la de hoy) y se comprime para que cargue rápido. Usa una foto de comida real, con buena luz. La foto no se deshace con «Deshacer»: para volver a la de siempre, usa «Volver a la foto original»."
        />
      </Grupo>

      <Grupo
        id="sitio-historia"
        titulo="📖 Historia"
        sub="«Nuestra historia»: título, párrafos y la frase final"
        chip={cambiado(guardado.historia, ["titulo", "parrafos", "cierre"]) ? "cambiada" : "original"}
      >
        <SitioGrupo
          accion={guardarHistoriaAction}
          boton="Guardar historia"
          restaurar="Restaurar el texto original"
          campos={[
            { nombre: "titulo", etiqueta: "Título", valor: s.historia.titulo, tope: TOPES.titulo },
            {
              nombre: "cierre",
              etiqueta: "Frase final (en rojo)",
              valor: s.historia.cierre,
              tope: TOPES.cierre,
            },
            {
              nombre: "parrafos",
              etiqueta: "Párrafos",
              valor: s.historia.parrafos.join("\n\n"),
              tipo: "area",
              filas: 9,
              completo: true,
              nota: `Separa los párrafos con una línea en blanco. Hasta ${TOPES.parrafos} párrafos de ${TOPES.parrafo} letras.`,
            },
          ]}
        />
      </Grupo>

      <Grupo
        id="sitio-textos"
        titulo="✏️ Textos sueltos"
        sub="La línea de domicilio y la frase del pie"
        chip={cambiado(guardado.textos, ["domicilio", "pie"]) ? "cambiados" : "originales"}
      >
        <SitioGrupo
          accion={guardarTextosAction}
          boton="Guardar textos"
          restaurar="Restaurar el texto original"
          campos={[
            {
              nombre: "domicilio",
              etiqueta: "Texto de domicilio",
              valor: s.textos.domicilio,
              tope: TOPES.domicilio,
              completo: true,
              nota: "En la tarjeta «Pide a domicilio».",
            },
            {
              nombre: "pie",
              etiqueta: "Frase del pie de página",
              valor: s.textos.pie,
              tope: TOPES.pie,
              tipo: "area",
              filas: 2,
              completo: true,
            },
          ]}
        />
      </Grupo>

      <Grupo
        id="sitio-buscadores"
        titulo="🔎 Buscadores y compartir"
        sub="Lo que muestran Google y WhatsApp al compartir el enlace"
        chip={
          [
            cambiado(guardado.seo, ["titulo", "descripcion", "descripcionCompartir", "descripcionGoogle", "horarioGoogle"])
              ? "texto propio"
              : "",
            s.seo.fotoCompartirPropia ? "foto propia" : "",
          ]
            .filter(Boolean)
            .join(" · ") || "original"
        }
      >
        <SitioGrupo
          accion={guardarBuscadoresAction}
          boton="Guardar"
          restaurar="Restaurar el texto original"
          campos={[
            {
              nombre: "titulo",
              etiqueta: "Título",
              valor: s.seo.titulo,
              tope: TOPES.seoTitulo,
              completo: true,
              nota: "El título azul en Google y el de la pestaña del navegador.",
            },
            {
              nombre: "descripcion",
              etiqueta: "Descripción en Google",
              valor: s.seo.descripcion,
              tope: TOPES.seoDescripcion,
              tipo: "area",
              filas: 3,
              completo: true,
              nota: "El texto bajo el título en los resultados de Google.",
            },
            {
              nombre: "descripcionCompartir",
              etiqueta: "Texto al compartir el enlace",
              valor: s.seo.descripcionCompartir,
              tope: TOPES.seoCompartir,
              tipo: "area",
              filas: 2,
              completo: true,
              nota: "El que acompaña la foto cuando alguien manda el enlace por WhatsApp o redes.",
            },
            {
              nombre: "descripcionGoogle",
              etiqueta: "Descripción del restaurante (ficha de Google)",
              valor: s.seo.descripcionGoogle,
              tope: TOPES.seoGoogle,
              tipo: "area",
              filas: 3,
              completo: true,
            },
            {
              nombre: "horarioGoogle",
              etiqueta: "Horario para Google (opcional)",
              valor: guardado.seo?.horarioGoogle ?? "",
              tipo: "area",
              filas: 3,
              completo: true,
              placeholder: "Lun a Dom 12:00-22:00",
              nota: "En horas de 0 a 24, un renglón por horario (p. ej. «Lun a Vie 12:00-21:00» y «Sáb, Dom 12:00-23:00»). Vacío = Google recibe el horario de «Contacto» tal cual.",
            },
          ]}
        />
        <h4 className="sitio-sub">Foto al compartir el enlace</h4>
        <SitioFoto
          accion={guardarFotoCompartirAction}
          actual={s.seo.fotoCompartirPropia ? s.seo.fotoCompartir : null}
          fabrica="/og.jpg"
          recorte={RECORTE_COMPARTIR}
          vista="apaisada"
          boton="Guardar foto"
          quitar="Volver a la foto original"
          nota="La que sale en WhatsApp, Facebook y X junto al enlace. Se recorta sola en horizontal (1200×630). No se deshace con «Deshacer»."
        />
      </Grupo>
    </div>
  );
}

/** Un bloque plegable: cerrado se ve qué es y cómo está; abierto, su formulario. */
function Grupo({
  id,
  titulo,
  sub,
  chip,
  alerta,
  children,
}: {
  id: string;
  titulo: string;
  sub: string;
  chip?: string;
  /** El chip pide acción (va en rojo). */
  alerta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="setgroup setgroup--details sitio-grupo" id={id}>
      <summary>
        <span className="sitio-grupo__tit">{titulo}</span>
        <span className="sitio-grupo__sub">{sub}</span>
        {chip && <span className={`sitio-chip ${alerta ? "is-alerta" : ""}`}>{chip}</span>}
      </summary>
      <div className="sitio-grupo__cuerpo">{children}</div>
    </details>
  );
}
