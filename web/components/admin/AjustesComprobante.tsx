import type { Ajustes } from "@/lib/menu";
import { comprobanteDe, LARGO, lineaLimpia, MAX_LINEAS_PIE, type FormularioComprobante } from "@/lib/papel";
import EditorComprobante from "./EditorComprobante";

/**
 * AJUSTES → COMPROBANTE: datos del negocio en el papel, logo propio, mensaje de cierre,
 * líneas al pie y datos del cliente, con la vista previa en vivo de las tres salidas.
 *
 * Aquí (en el servidor) se arma lo GUARDADO tal como lo escribió el dueño —con el
 * cierre vacío si nunca puso uno, para que el campo muestre el de fábrica como
 * ejemplo— y el editor del navegador hace el resto.
 */
export default function AjustesComprobante({ ajustes }: { ajustes: Ajustes }) {
  const c = comprobanteDe(ajustes);
  const crudo = ajustes.comprobante ?? {};
  const pie = (Array.isArray(crudo.lineasPie) ? crudo.lineasPie : [])
    .map((l) => lineaLimpia(l, LARGO.lineaPie))
    .filter(Boolean)
    .slice(0, MAX_LINEAS_PIE);
  const inicial: FormularioComprobante = {
    negocio: lineaLimpia(ajustes.negocio, LARGO.negocio),
    razonSocial: lineaLimpia(ajustes.razonSocial, LARGO.razonSocial),
    nit: lineaLimpia(ajustes.nit, LARGO.nit),
    direccion: lineaLimpia(ajustes.direccion, LARGO.direccion),
    telefonoLocal: lineaLimpia(ajustes.telefonoLocal, LARGO.telefonoLocal),
    mensajeCierre: lineaLimpia(crudo.mensajeCierre, LARGO.cierre),
    // Siempre las tres casillas, llenas o no.
    lineasPie: Array.from({ length: MAX_LINEAS_PIE }, (_, i) => pie[i] ?? ""),
    datosCliente: c.datosCliente,
  };
  return (
    <EditorComprobante
      inicial={inicial}
      logo={c.logoPropio ? c.logo : ""}
      whatsapp={ajustes.whatsapp ?? ""}
      impuestoPct={ajustes.impuestoPct ?? 0}
    />
  );
}
