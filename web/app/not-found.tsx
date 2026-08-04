import Link from "next/link";
import { DividerHebra } from "@/components/Hebra";

/* La 404 con voz de la casa (los premiados diseñan los estados invisibles —
 * Crav Burgers ganó SOTD con loader, 404 y footer diseñados). */
export default function NotFound() {
  return (
    <main className="nf">
      <div className="nf__card">
        <p className="eyebrow">Error 404</p>
        <h1>Este enredo no existe</h1>
        <p className="nf__txt">
          La hebra que buscabas se soltó del tenedor. Tranqui: el sabor sigue
          donde siempre.
        </p>
        <div className="nf__hebra" aria-hidden>
          <DividerHebra color="pomodoro" />
        </div>
        <Link href="/" className="btn btn--primary">
          <span>Volver a Papaghetti</span>
        </Link>
      </div>
    </main>
  );
}
