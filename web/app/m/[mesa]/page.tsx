import { redirect } from "next/navigation";

/**
 * Los QR viejos (/m/1, /m/2…) siguen funcionando: llevan al menú único.
 *
 * Aquí ya no se asignan mesas, así que un menú por número era una ficción que
 * obligaba a imprimir un código distinto para cada mesa. Ahora hay UNA dirección
 * —/pedir— y el cliente escribe dónde está al pedir.
 */
export default function MesaLegacy() {
  redirect("/pedir");
}
