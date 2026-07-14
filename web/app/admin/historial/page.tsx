import { getCatalog } from "@/lib/catalog";
import { deshacerAction, rehacerAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function HistorialPage() {
  const cat = await getCatalog();
  const historial = cat.historial ?? [];
  const puedeDeshacer = (cat.undo?.length ?? 0) > 0;
  const puedeRehacer = (cat.redo?.length ?? 0) > 0;

  return (
    <section>
      <div className="adminx__pageh adminx__pageh--row">
        <div>
          <h1>Historial de cambios</h1>
          <p>Cada acción del panel queda registrada. Puedes deshacer o rehacer los últimos cambios.</p>
        </div>
        <div className="hist-acts">
          <form action={deshacerAction}>
            <button className="btn btn--ghost btnmini" type="submit" disabled={!puedeDeshacer}>
              <span>↩︎ Deshacer</span>
            </button>
          </form>
          <form action={rehacerAction}>
            <button className="btn btn--ghost btnmini" type="submit" disabled={!puedeRehacer}>
              <span>↪︎ Rehacer</span>
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        {historial.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Aún no hay acciones registradas. Cuando edites algo aparecerá aquí.
          </p>
        ) : (
          <ol className="hist">
            {historial.map((h) => (
              <li key={h.id} className={`hist__row ${h.meta ? "is-meta" : ""}`}>
                <span className="hist__dot" aria-hidden />
                <span className="hist__txt">{h.texto}</span>
                <time className="hist__time" suppressHydrationWarning>
                  {new Date(h.fecha).toLocaleString("es-CO", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="muted" style={{ marginTop: 12, fontSize: "0.8rem" }}>
        Se guardan las últimas {historial.length} acciones · deshacer/rehacer cubre los últimos {cat.undo?.length ?? 0} cambios.
      </p>
    </section>
  );
}
