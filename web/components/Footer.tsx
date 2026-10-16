import Reveal from "./Reveal";
import { FooterSign } from "./Hebra";
import LogoMedia from "./LogoMedia";
import type { SitioPublico } from "@/lib/sitio";

export default function Footer({ sitio }: { sitio: SitioPublico }) {
  const lugar = [sitio.ciudad, sitio.departamento].filter(Boolean).join(", ");
  // Las redes salen solo si el dueño las encendió en Ajustes → Sitio (si no, llegan vacías).
  const redes = [
    { nombre: "Instagram", url: sitio.redes.instagram },
    { nombre: "TikTok", url: sitio.redes.tiktok },
    { nombre: "Facebook", url: sitio.redes.facebook },
  ].filter((r) => r.url);
  return (
    <footer className="footer">
      <div className="container">
        <Reveal>
          <LogoMedia className="footer__logo" />
          <FooterSign />
          <p style={{ opacity: 0.8, maxWidth: "34ch", margin: "0 auto" }}>
            {sitio.textos.pie}
          </p>
          {/* Con clase y no con estilo en línea: los tres enlaces medían 26px de alto
              y sin una clase no había dónde darles área de toque en móvil. */}
          <div className="footer__links">
            <a href="#arma">Arma tu enredo</a>
            <a href="#menu">Menú</a>
            <a href="#ubicacion">Ubicación</a>
          </div>
          {redes.length > 0 && (
            <nav className="footer__redes" aria-label="Nuestras redes">
              {redes.map((r) => (
                <a key={r.nombre} href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.nombre}
                </a>
              ))}
            </nav>
          )}
          {/* El lugar va armado DENTRO de un solo texto: partido en varios nodos, el
              navegador acomoda las letras distinto y la línea se movía medio píxel. */}
          <p className="footer__meta">
            © {new Date().getFullYear()}
            {` Papaghetti · ${lugar} · Hecho con un delicioso enredo.`}
          </p>
        </Reveal>
      </div>
    </footer>
  );
}
