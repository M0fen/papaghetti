import Reveal from "./Reveal";
import { FooterSign } from "./Hebra";
import LogoMedia from "./LogoMedia";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <Reveal>
          <LogoMedia className="footer__logo" />
          <FooterSign />
          <p style={{ opacity: 0.8, maxWidth: "34ch", margin: "0 auto" }}>
            Enrédate rico. Comfort food premium para armar a tu gusto, en Pereira.
          </p>
          <div
            style={{
              display: "flex",
              gap: 18,
              justifyContent: "center",
              marginTop: 22,
              fontWeight: 600,
            }}
          >
            <a href="#arma">Arma tu enredo</a>
            <a href="#menu">Menú</a>
            <a href="#ubicacion">Ubicación</a>
          </div>
          <p className="footer__meta">
            © {new Date().getFullYear()} Papaghetti · Pereira, Risaralda ·
            Hecho con un delicioso enredo.
          </p>
        </Reveal>
      </div>
    </footer>
  );
}
