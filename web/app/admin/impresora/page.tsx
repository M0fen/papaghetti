import PruebaImpresora from "@/components/admin/PruebaImpresora";

export const dynamic = "force-dynamic";

/**
 * LA IMPRESORA, CON PÁGINA PROPIA.
 *
 * El diagnóstico en tres pasos que separa "Windows no ve la impresora" de "Chrome no
 * le manda" de "el papel del driver está mal", más el patrón de prueba y el camino
 * directo por Bluetooth o puerto serie. Escrito para quien esté delante de la
 * térmica sin nadie al lado.
 */
export default function ImpresoraPage() {
  return (
    <section>
      <div className="adminx__pageh">
        <h1>Impresora</h1>
        <p>Tres pasos, en orden. Cada uno descarta una causa antes de pasar al siguiente.</p>
      </div>
      <PruebaImpresora />
    </section>
  );
}
