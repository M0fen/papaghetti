import Nav from "@/components/Nav";
import PromoBanner from "@/components/PromoBanner";
import ForkCursor from "@/components/ForkCursor";
import ScrollHebra from "@/components/ScrollHebra";
import Hero from "@/components/Hero";
import Configurator from "@/components/Configurator";
import FeaturedMenu from "@/components/FeaturedMenu";
import Story from "@/components/Story";
import Location from "@/components/Location";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import { DividerHebra } from "@/components/Hebra";
import { getCatalog } from "@/lib/catalog";

// Lee del "cerebro" en cada request → los cambios del admin se reflegan en vivo.
export const dynamic = "force-dynamic";

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
  const catalog = await getCatalog();
  const { ajustes } = catalog;
  const hayBanner =
    ajustes.abierto === false ||
    (ajustes.promos ?? []).some((p) => p.activo && p.banner);

  return (
    <>
      <a href="#top" className="skip-link">
        Saltar al contenido
      </a>
      <PromoBanner ajustes={ajustes} />
      <Nav offsetTop={hayBanner ? 38 : 0} />
      <ForkCursor />
      <ScrollHebra />
      <main>
        <Hero />
        <Configurator
          bases={catalog.bases}
          proteinas={catalog.proteinas}
          toppings={catalog.toppings}
          whatsapp={catalog.ajustes.whatsapp}
          numMesas={catalog.ajustes.numMesas}
          impuestoPct={catalog.ajustes.impuestoPct}
        />
        <Divider color="pomodoro" />
        <FeaturedMenu catalog={catalog} />
        <Story />
        <Location ajustes={catalog.ajustes} />
        <Footer />
      </main>
    </>
  );
}
