import type { Ajustes } from "@/lib/menu";

/**
 * Ajustes → Comprobante: datos del negocio en el papel, logo propio, mensaje de cierre,
 * líneas al pie y datos del cliente, con vista previa en vivo. (Marcador: lo construye
 * la fase del comprobante.)
 */
export default function AjustesComprobante({ ajustes }: { ajustes: Ajustes }) {
  void ajustes;
  return (
    <div className="settings settings--wide">
      <fieldset className="setgroup">
        <legend>🧾 Comprobante</legend>
        <p className="setgroup__nota">En construcción.</p>
      </fieldset>
    </div>
  );
}
