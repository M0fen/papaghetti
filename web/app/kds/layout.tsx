import type { Metadata } from "next";

/**
 * LA PANTALLA DE COCINA, SOLA.
 *
 * /admin/cocina hereda todo el cromo del panel: barra lateral, botones de deshacer,
 * "Salir", el chatbot flotante. En una tablet de 10" pegada a la pared eso es la
 * mitad del espacio gastado en cosas que el cocinero no puede tocar con las manos
 * sucias — y el botón "Deshacer" ahí es directamente peligroso.
 *
 * Esta ruta es la misma información sin nada alrededor. Se abre una vez en la tablet
 * de la cocina y se deja puesta todo el turno.
 */
export const metadata: Metadata = {
  title: "Cocina · Papaghetti",
  robots: { index: false, follow: false },
};

export default function KdsLayout({ children }: { children: React.ReactNode }) {
  return <div className="kds-solo">{children}</div>;
}
