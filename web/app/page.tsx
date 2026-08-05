import Nav from "@/components/Nav";
import PromoBanner from "@/components/PromoBanner";
import Hero from "@/components/Hero";
import EnredaTuPlato from "@/components/EnredaTuPlato";
import JuegoProvider from "@/components/JuegoProvider";
import CartaCompleta from "@/components/CartaCompleta";
import DatosEstructurados from "@/components/DatosEstructurados";
import FeaturedMenu from "@/components/FeaturedMenu";
import Story from "@/components/Story";
import Location from "@/components/Location";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import Motion from "@/components/Motion";
import Resenas from "@/components/Resenas";
import StickyPedir from "@/components/StickyPedir";
import { DividerHebra } from "@/components/Hebra";
import { getCatalogPublico } from "@/lib/catalog";

/* ESTÁTICO + revalidación on-demand (auditoría de optimización): force-dynamic cobraba
   ~700ms de TTFB por visita (función por request, cold starts de hasta 2.5s en Hobby)
   para leer un catálogo que solo cambia cuando NUESTRO admin guarda — y `reflejar()`
   en app/admin/actions.ts ya llama revalidatePath("/") en cada mutación. El landing
   ahora se sirve del CDN (TTFB 20-80ms) y se regenera al editar el admin. */

function Divider({ color }: { color?: "oro" | "pomodoro" }) {
  return (
    <div className="container" style={{ paddingBlock: 8 }}>
      <Reveal>
        <DividerHebra color={color} />
      </Reveal>
    </div>
  );
}

export default async function Home() {
  /* SOLO lo que puede ver un desconocido (auditoría de seguridad): antes esto era
     `getCatalog()`, el documento entero, y se lo pasábamos a componentes "use client".
     Next serializa las props de un componente cliente DENTRO del HTML, así que en el
     código fuente del sitio viajaban los costos de cada insumo, las recetas, el stock,
     los pedidos con teléfono del cliente y la contabilidad. Ver getCatalogPublico(). */
  const catalog = await getCatalogPublico();
  const { ajustes } = catalog;
  const hayBanner =
    ajustes.abierto === false ||
    (ajustes.promos ?? []).some((p) => p.activo && p.banner);

  return (
    <>
      <a href="#top" className="skip-link">
        Saltar al contenido
      </a>
      <DatosEstructurados catalog={catalog} />
      {/* El cursor-tenedor y la hebra-progreso lateral murieron en la auditoría:
          el cursor custom rompe accesibilidad y no existe en móvil (80%+ del tráfico);
          la hebra lateral se leía como artefacto. El fideo vive ahora DENTRO del
          layout (conector de pasos, divisores que se dibujan), no flotando encima. */}
      <PromoBanner ajustes={ajustes} />
      <Nav offsetTop={hayBanner ? 38 : 0} />
      {/* El juego lo posee el proveedor: lo abren tanto la bifurcación como la ficha
          de un enredo insignia (ahí, ya emplatado). Una sola experiencia. */}
      <JuegoProvider
        bases={catalog.bases}
        proteinas={catalog.proteinas}
        toppings={catalog.toppings}
        ajustes={catalog.ajustes}
      >
        <main>
          <Hero />
          <Resenas />
          <EnredaTuPlato
            bases={catalog.bases}
            proteinas={catalog.proteinas}
            toppings={catalog.toppings}
            whatsapp={catalog.ajustes.whatsapp}
            numMesas={catalog.ajustes.numMesas}
            impuestoPct={catalog.ajustes.impuestoPct}
            costoDomicilio={catalog.ajustes.costoDomicilio}
            pedidoMinimo={catalog.ajustes.pedidoMinimo}
            abierto={catalog.ajustes.abierto !== false}
          />
          <Divider color="pomodoro" />
          <FeaturedMenu catalog={catalog} />
          <CartaCompleta
            bases={catalog.bases}
            proteinas={catalog.proteinas}
            toppings={catalog.toppings}
          />
          <Divider />
          <Story />
          <Location ajustes={catalog.ajustes} />
          <Footer />
          <Motion />
          <StickyPedir />
        </main>
      </JuegoProvider>
    </>
  );
}
