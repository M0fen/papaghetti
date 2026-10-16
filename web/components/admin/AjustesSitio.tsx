import type { Ajustes } from "@/lib/menu";

/**
 * Ajustes → Sitio: textos de portada e historia, horarios, dirección, teléfono, WhatsApp,
 * redes, enlaces de domicilio y mapa, y fotos. (Marcador: lo construye la fase del sitio.)
 */
export default function AjustesSitio({ ajustes }: { ajustes: Ajustes }) {
  void ajustes;
  return (
    <div className="settings settings--wide">
      <fieldset className="setgroup">
        <legend>🌐 Sitio web</legend>
        <p className="setgroup__nota">En construcción.</p>
      </fieldset>
    </div>
  );
}
