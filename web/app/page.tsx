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
import { cache } from "react";
import type { Metadata } from "next";
import { getCatalogPublico, getSitioPublico } from "@/lib/catalog";
import { metadatosDe } from "@/lib/sitio";

/* ESTÁTICO + revalidación on-demand (auditoría de optimización): force-dynamic cobraba
   ~700ms de TTFB por visita (función por request, cold starts de hasta 2.5s en Hobby)
   para leer un catálogo que solo cambia cuando NUESTRO admin guarda — y `reflejar()`
   en app/admin/actions.ts ya llama revalidatePath("/") en cada mutación. El landing
   ahora se sirve del CDN (TTFB 20-80ms) y se regenera al editar el admin.
   Por eso aquí no se toca nada que dependa de la visita (cookies, headers,
   searchParams, connection): cualquiera de esas vuelve la página dinámica. */

/* RED DE SEGURIDAD: además de regenerarse al guardar, se rehace sola una vez por hora.
   Hay cambios que no avisan (un agotado que mueve la despensa desde otra pantalla, una
   lectura de hace dos segundos que ganó la carrera contra una escritura, el año del pie
   el 1 de enero) y sin esto se quedaban congelados hasta el siguiente guardado. Una hora
   es lo que recomienda la guía de ISR: el costo es una lectura del cerebro por hora, y
   si esa lectura falla se sigue sirviendo la última página buena. */
export const revalidate = 3600;

/* Una sola lectura por render, compartida por los metadatos y la página (React `cache`:
   el cerebro no se lee con fetch, así que Next no la deduplica solo). */
const leerCatalogo = cache(getCatalogPublico);
const leerSitio = cache(getSitioPublico);

/* Título, descripción y vista previa al compartir, desde Ajustes → Sitio → Buscadores.
   Sin try/catch a propósito: si la lectura falla, la regeneración falla y queda la última
   página buena; atraparlo escribiría los textos de fábrica en la caché. */
export async function generateMetadata(): Promise<Metadata> {
  return metadatosDe(await leerSitio());
}

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
     los pedidos con teléfono del cliente y la contabilidad. Ver getCatalogPublico().
     El sitio (textos, enlaces, fotos, reseñas) llega por su propia puerta y solo a
     componentes de servidor: nada de él viaja como prop de un componente cliente. */
  const [catalog, sitio] = await Promise.all([leerCatalogo(), leerSitio()]);
  const { ajustes } = catalog;
  const hayBanner =
    ajustes.abierto === false ||
    (ajustes.promos ?? []).some((p) => p.activo && p.banner);

  return (
    <>
      <a href="#top" className="skip-link">
        Saltar al contenido
      </a>
      <DatosEstructurados catalog={catalog} sitio={sitio} />
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
          <Hero portada={sitio.portada} />
          <Resenas lista={sitio.resenas} />
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
            basesMax={catalog.ajustes.basesMax}
            cobroBases={catalog.ajustes.cobroBases}
          />
          <Divider color="pomodoro" />
          <FeaturedMenu catalog={catalog} />
          <CartaCompleta
            bases={catalog.bases}
            proteinas={catalog.proteinas}
            toppings={catalog.toppings}
            basesMax={catalog.ajustes.basesMax}
          />
          <Divider />
          <Story historia={sitio.historia} />
          <Location sitio={sitio} />
          <Footer sitio={sitio} />
          <Motion />
          <StickyPedir />
        </main>
      </JuegoProvider>
    </>
  );
}
