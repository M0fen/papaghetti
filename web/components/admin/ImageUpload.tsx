"use client";

import { useState } from "react";

/**
 * Sube una foto desde el dispositivo del operador (galería o cámara), la
 * comprime en el navegador (máx ~640px, JPEG) y la deja en un input oculto
 * `name` como data URL — así viaja con el formulario sin necesitar storage.
 * (Cuando Supabase esté activo, se puede cambiar por Supabase Storage.)
 */
export default function ImageUpload({
  name = "foto",
  value = "",
  round = false,
  emoji = "🖼️",
}: {
  name?: string;
  value?: string;
  round?: boolean;
  emoji?: string;
}) {
  const [foto, setFoto] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      setFoto(await comprimir(file, 640, 0.72));
    } catch {
      setError("No se pudo leer la imagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="imgup">
      <div className={`imgup__preview ${round ? "is-round" : ""}`}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" />
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
            onClick={() => setFoto("")}
          >
            quitar
          </button>
        )}
        {error && <span className="imgup__err">{error}</span>}
      </div>
      <input type="hidden" name={name} value={foto} />
    </div>
  );
}

async function comprimir(file: File, max: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}
