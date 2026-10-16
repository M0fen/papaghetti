"use client";

import { useState } from "react";

/**
 * Sube una foto desde el dispositivo del operador (galería o cámara), la
 * comprime en el navegador (máx ~640px, JPEG) y la deja en un input oculto
 * `name` como data URL — así viaja con el formulario sin necesitar storage.
 * (Cuando Supabase esté activo, se puede cambiar por Supabase Storage.)
 *
 * Las props de abajo de `emoji` son OPCIONALES y las usan las fotos del sitio
 * (Ajustes → Sitio): sin ellas, el componente hace exactamente lo de siempre (lo usa
 * el Menú para las fichas).
 */
export default function ImageUpload({
  name = "foto",
  value = "",
  round = false,
  emoji = "🖼️",
  max = 640,
  calidad = 0.72,
  recorte,
  limite,
  fondo,
  vista,
  vistaPrevia,
  medidas = false,
  ancho,
  alto,
}: {
  name?: string;
  value?: string;
  round?: boolean;
  emoji?: string;
  /** Lado mayor, en píxeles (sin `recorte`). */
  max?: number;
  /** Calidad JPEG de partida (0–1). */
  calidad?: number;
  /** Recorta al centro con esta proporción y la deja de este ancho (sin agrandar nunca). */
  recorte?: { ancho: number; alto: number };
  /** Tope del data URL en caracteres: si se pasa, la recomprime hasta quedar debajo. */
  limite?: number;
  /** Color de fondo bajo la imagen: un PNG transparente pasado a JPEG queda negro sin él. */
  fondo?: string;
  /** Forma de la vista previa (la de siempre es un cuadrito de 84 px). */
  vista?: "retrato" | "apaisada";
  /** Lo que se ve mientras no haya foto propia (en vez del emoji): la de fábrica. */
  vistaPrevia?: string;
  /** Manda también el ancho y el alto en `${name}Ancho` / `${name}Alto`. */
  medidas?: boolean;
  /** Medidas de `value`, si se conocen. */
  ancho?: number;
  alto?: number;
}) {
  const [foto, setFoto] = useState(value);
  const [dims, setDims] = useState(value && ancho && alto ? { ancho, alto } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const r = await comprimir(file, { max, calidad, recorte, limite, fondo });
      if (limite && r.url.length > limite) {
        setError("La foto pesa demasiado aun comprimida. Prueba con otra.");
      } else {
        setFoto(r.url);
        setDims({ ancho: r.ancho, alto: r.alto });
      }
    } catch {
      setError("No se pudo leer la imagen.");
    } finally {
      setBusy(false);
    }
  };

  const muestra = foto || vistaPrevia;
  return (
    <div className="imgup">
      <div className={`imgup__preview ${round ? "is-round" : ""} ${vista ? `imgup__preview--${vista}` : ""}`}>
        {muestra ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={muestra} alt="" />
        ) : (
          <span aria-hidden>{emoji}</span>
        )}
      </div>
      <div className="imgup__acts">
        <label className="chipbtn imgup__btn">
          {busy ? "Procesando…" : foto ? "Cambiar foto" : "📷 Subir foto"}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {foto && (
          <button
            type="button"
            className="linkbtn linkbtn--danger"
            onClick={() => {
              setFoto("");
              setDims(null);
            }}
          >
            quitar
          </button>
        )}
        {error && <span className="imgup__err">{error}</span>}
      </div>
      <input type="hidden" name={name} value={foto} />
      {medidas && (
        <>
          <input type="hidden" name={`${name}Ancho`} value={dims?.ancho ?? ""} />
          <input type="hidden" name={`${name}Alto`} value={dims?.alto ?? ""} />
        </>
      )}
    </div>
  );
}

async function comprimir(
  file: File,
  o: {
    max: number;
    calidad: number;
    recorte?: { ancho: number; alto: number };
    limite?: number;
    fondo?: string;
  },
): Promise<{ url: string; ancho: number; alto: number }> {
  const bitmap = await createImageBitmap(file);
  // Lo que se toma de la foto original: entera, o el centro con la proporción pedida.
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (o.recorte) {
    const objetivo = o.recorte.ancho / o.recorte.alto;
    if (sw / sh > objetivo) {
      const nw = sh * objetivo;
      sx = (sw - nw) / 2;
      sw = nw;
    } else {
      const nh = sw / objetivo;
      sy = (sh - nh) / 2;
      sh = nh;
    }
  }
  const scale = o.recorte ? Math.min(1, o.recorte.ancho / sw) : Math.min(1, o.max / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  const dibujar = (escala: number, q: number) => {
    canvas.width = Math.max(1, Math.round(sw * escala));
    canvas.height = Math.max(1, Math.round(sh * escala));
    if (o.fondo) {
      ctx.fillStyle = o.fondo;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", q);
  };
  let escala = scale;
  let q = o.calidad;
  let url = dibujar(escala, q);
  /* Una foto de cámara con mucho detalle puede pasarse del tope aun a buen tamaño:
     primero se baja la calidad (no se nota hasta ~0,55) y luego el tamaño. */
  for (let i = 0; o.limite && url.length > o.limite && i < 12; i++) {
    if (q > 0.56) q = Math.max(0.56, q - 0.08);
    else escala *= 0.85;
    url = dibujar(escala, q);
  }
  bitmap.close?.();
  return { url, ancho: canvas.width, alto: canvas.height };
}
