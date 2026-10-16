"use client";

import { useActionState, useState } from "react";
import ImageUpload from "./ImageUpload";
import { BotonesSitio, MensajeSitio, ESTADO_INICIAL, type AccionSitio } from "./SitioFormulario";
import { META_FOTO_SITIO, TOPES, type FotoSitio } from "@/lib/sitio";

/**
 * UNA FOTO DEL SITIO, en su propio formulario: una acción de Next acepta hasta 1 MB por
 * envío y una foto de portada se lleva casi todo. El navegador la recorta a la proporción
 * del diseño (la portada es un retrato 4:5; la de compartir, 1200×630) y la recomprime
 * hasta que quepa. Mientras no haya foto propia se ve la de fábrica.
 */
export default function SitioFoto({
  accion,
  actual,
  fabrica,
  recorte,
  vista,
  conTexto,
  boton,
  quitar,
  nota,
}: {
  accion: AccionSitio;
  /** La foto propia guardada, o null (se ve la de fábrica). */
  actual: FotoSitio | null;
  /** La foto de fábrica, para la vista previa. */
  fabrica: string;
  recorte: { ancho: number; alto: number };
  vista: "retrato" | "apaisada";
  /** ¿Lleva la casilla «qué se ve en la foto»? */
  conTexto?: boolean;
  boton: string;
  quitar: string;
  nota: string;
}) {
  const [estado, enviar] = useActionState(accion, ESTADO_INICIAL);
  const [editado, setEditado] = useState(-1);
  const vuelta = estado.n ?? 0;
  // Se vuelve a armar cuando cambia la foto guardada (o vuelve la original).
  const llave = actual ? `${actual.url.length}-${actual.url.slice(-40)}` : "fabrica";
  return (
    <form action={enviar} className="sitio-form sitio-foto" onInput={() => setEditado(vuelta)}>
      <div className="sitio-foto__fila">
        <ImageUpload
          key={llave}
          name="foto"
          value={actual?.url ?? ""}
          vistaPrevia={fabrica}
          recorte={recorte}
          calidad={0.82}
          limite={META_FOTO_SITIO}
          fondo="#ffffff"
          vista={vista}
          medidas
          ancho={actual?.ancho}
          alto={actual?.alto}
        />
        <div className="sitio-foto__datos">
          <p className="sitio-foto__hoy">
            <b>Hoy se ve:</b> {actual ? "tu foto" : "la foto original"}
          </p>
          {conTexto && (
            <label className="field" key={vuelta}>
              <span>Qué se ve en la foto (para Google y lectores de pantalla)</span>
              <input
                className="admin-input"
                name="alt"
                defaultValue={estado.valores?.alt ?? actual?.alt ?? ""}
                placeholder="Ej.: Caja de enredo con pollo, papa criolla y queso"
                autoComplete="off"
              />
              <small className="field__nota">Hasta {TOPES.fotoAlt} letras. Se guarda con la foto.</small>
            </label>
          )}
          <small className="field__nota">{nota}</small>
        </div>
      </div>
      <BotonesSitio boton={boton} restaurar={actual ? quitar : undefined} />
      <MensajeSitio estado={estado} oculto={editado === vuelta} />
    </form>
  );
}
