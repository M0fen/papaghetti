import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  getCatalog,
  abastecerInsumo,
  abastecerTodoAPar,
  crearGasto,
} from "@/lib/catalog";
import {
  formatCOP,
  formatCantidad,
  insumoBajo,
  costoReceta,
  enPeriodo,
  GASTO_CATEGORIAS,
  gastoCatLabel,
  type Catalog,
  type Insumo,
  type Pedido,
  type Periodo,
  type GastoCategoria,
} from "@/lib/menu";

export const dynamic = "force-dynamic";

const SISTEMA = `Eres "Ghett-IA", el asistente de negocio de "Papaghetti", un restaurante premium de "arma tu bowl" en Pereira, Colombia.
Actúas como el ASESOR CONTABLE Y FINANCIERO del local (estilo contador de confianza) y además OPERAS el panel por el operador.
Reglas:
- Responde en español, claro, cálido y accionable. Usa **negrita** para cifras clave y TABLAS markdown ("|") cuando ayuden.
- Básate SOLO en el ESTADO ACTUAL entregado. No inventes cifras.
- Tienes VENTAS, DESPENSA (insumos con costo), RECETAS (costo/margen por plato), COMPRAS y GASTOS, y el P&L por período. Puedes hablar de utilidad, margen y flujo de caja.
- EJECUTAS ACCIONES con tus herramientas cuando el operador informa un hecho:
  · "compré/llegaron/entraron X de Y" → abastecer_insumo (suma al stock y registra la compra).
  · "pagué/gasté X en Z" → registrar_gasto.
  · "abastece todo / apertura" → abastecer_todo_estandar.
  Ejecuta directo (sin pedir confirmación) para acciones simples y confirma en UNA frase con la cifra y el nuevo stock. Si el insumo es ambiguo o no existe, pregunta o dilo; no inventes.
- REGLA CRÍTICA: NUNCA afirmes que registraste, abasteciste o pagaste algo si NO llamaste la herramienta correspondiente en este turno. Para registrar una compra/gasto/apertura DEBES usar la función; jamás lo describas solo en texto.
- Montos en pesos colombianos (COP).`;

/* ---- Herramientas que Ghett-IA puede ejecutar ---- */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "abastecer_insumo",
      description:
        "Registra que se compró/abasteció cierta cantidad de un insumo. Suma al stock y registra la compra como salida de caja. Usar cuando el operador diga que compró o le llegó mercado.",
      parameters: {
        type: "object",
        properties: {
          insumo: { type: "string", description: "Nombre del insumo, p.ej. 'carne de res', 'papa criolla', 'spaghetti'." },
          cantidad: { type: "number", description: "Cantidad comprada en la unidad del insumo (lb, paquete, und, g, l...)." },
        },
        required: ["insumo", "cantidad"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_gasto",
      description: "Registra un gasto operativo (arriendo, nómina, servicios, domicilios, etc.).",
      parameters: {
        type: "object",
        properties: {
          concepto: { type: "string", description: "Descripción del gasto, p.ej. 'recibo de luz'." },
          monto: { type: "number", description: "Monto en pesos colombianos (número)." },
          categoria: {
            type: "string",
            enum: GASTO_CATEGORIAS,
            description: "Categoría del gasto.",
          },
        },
        required: ["concepto", "monto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "abastecer_todo_estandar",
      description: "Deja TODA la despensa en su nivel estándar (apertura de turno) y registra las compras.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function findInsumo(insumos: Insumo[], q: string): Insumo | undefined {
  const nq = norm(q);
  if (!nq) return undefined;
  return (
    insumos.find((i) => norm(i.nombre) === nq) ||
    insumos.find((i) => norm(i.nombre).includes(nq) || nq.includes(norm(i.nombre))) ||
    insumos.find((i) => norm(i.nombre).split(/\s+/).some((w) => w.length > 2 && nq.includes(w)))
  );
}

type Args = Record<string, unknown>;

async function ejecutar(name: string, args: Args): Promise<{ msg: string; changed: boolean }> {
  if (name === "abastecer_insumo") {
    const cat = await getCatalog();
    const ins = findInsumo(cat.insumos, String(args.insumo ?? ""));
    if (!ins)
      return {
        changed: false,
        msg: `No encontré el insumo "${String(args.insumo ?? "")}". Insumos disponibles: ${cat.insumos.map((i) => i.nombre).join(", ")}.`,
      };
    const cant = Math.max(0, Number(args.cantidad) || 0);
    if (!cant) return { changed: false, msg: "La cantidad no es válida." };
    await abastecerInsumo(ins.id, cant);
    const c2 = await getCatalog();
    const ni = c2.insumos.find((i) => i.id === ins.id)!;
    const compra = ins.costo ? ` Compra registrada: ${formatCOP(Math.round(cant * ins.costo))}.` : "";
    return {
      changed: true,
      msg: `Hecho: abastecí ${cant} ${ni.unidad} de ${ni.nombre}.${compra} Stock ahora: ${formatCantidad(ni.stock, ni.unidad)}.`,
    };
  }

  if (name === "registrar_gasto") {
    const monto = Math.max(0, Number(args.monto) || 0);
    if (!monto) return { changed: false, msg: "El monto no es válido." };
    let categoria = String(args.categoria ?? "otro") as GastoCategoria;
    if (!GASTO_CATEGORIAS.includes(categoria)) categoria = "otro";
    const concepto = String(args.concepto ?? "Gasto");
    await crearGasto({ concepto, monto, categoria });
    return {
      changed: true,
      msg: `Hecho: registré el gasto "${concepto}" por ${formatCOP(monto)} en ${gastoCatLabel[categoria]}.`,
    };
  }

  if (name === "abastecer_todo_estandar") {
    await abastecerTodoAPar();
    return { changed: true, msg: "Hecho: dejé toda la despensa en su nivel estándar y registré las compras." };
  }

  return { changed: false, msg: `Herramienta desconocida: ${name}.` };
}

// Límite de tasa simple por instancia (best-effort).
let llamadas: number[] = [];

function top(arr: string[]): string {
  const m = new Map<string, number>();
  arr.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}

function resumen(cat: Catalog): string {
  const hoy = new Date().toDateString();
  const ped = cat.pedidos;
  const hoyPed = ped.filter(
    (p) => new Date(p.creadoEn).toDateString() === hoy && p.estado !== "cancelado"
  );
  const sum = (arr: typeof ped, f: (p: (typeof ped)[number]) => number) =>
    arr.reduce((s, p) => s + f(p), 0);
  const ventasHoy = sum(hoyPed, (p) => p.total);
  const ticket = hoyPed.length ? Math.round(ventasHoy / hoyPed.length) : 0;
  const activos = ped.filter((p) => p.estado !== "entregado" && p.estado !== "cancelado");
  const porCobrar = activos.filter((p) => p.pago === "pendiente");
  const mesasOcup = new Set(activos.filter((p) => p.tipo === "mesa").map((p) => p.mesa)).size;
  const leadsNuevos = cat.leads.filter((l) => l.estado === "nuevo").length;

  const movs = cat.movimientos ?? [];
  const pnl = (periodo: Periodo): string => {
    const pp = ped.filter((p) => p.estado !== "cancelado" && enPeriodo(p.creadoEn, periodo));
    const s = (a: Pedido[], f: (p: Pedido) => number) => a.reduce((x, p) => x + f(p), 0);
    const v = s(pp, (p) => p.total);
    const cob = s(pp.filter((p) => p.pago === "pagado"), (p) => p.total);
    const cogs = s(pp, (p) => p.costo ?? 0);
    const mp = movs.filter((m) => enPeriodo(m.fecha, periodo));
    const compras = mp.filter((m) => m.tipo === "compra").reduce((x, m) => x + m.monto, 0);
    const gastos = mp.filter((m) => m.tipo === "gasto").reduce((x, m) => x + m.monto, 0);
    const margen = v > 0 ? Math.round(((v - cogs) / v) * 100) : 0;
    return `${formatCOP(v)} ventas · ${formatCOP(cogs)} costo · ${margen}% margen · ${formatCOP(compras)} compras · ${formatCOP(gastos)} gastos · utilidad ${formatCOP(v - cogs - gastos)}`;
  };

  const insumos: Insumo[] = cat.insumos ?? [];
  const byId = new Map(insumos.map((i) => [i.id, i]));
  const valorDespensa = insumos.reduce((s, i) => s + i.stock * (i.costo ?? 0), 0);
  const despensa = insumos
    .map((i) => {
      const faltan = Math.max(0, Number((i.parStock - i.stock).toFixed(3)));
      const flags = [
        i.stock <= 0 ? " (AGOTADO)" : insumoBajo(i) ? " (BAJO)" : "",
        faltan > 0 ? ` → reponer ${faltan} ${i.unidad}` : "",
      ].join("");
      return `- ${i.nombre}: ${formatCantidad(i.stock, i.unidad)} / estándar ${i.parStock} ${i.unidad}${
        i.costo ? ` (costo ${formatCOP(i.costo)}/${i.unidad})` : ""
      }${flags}`;
    })
    .join("\n");

  const items = [...cat.bases, ...cat.proteinas, ...cat.toppings];
  const platos = items
    .map((i) => {
      const costo = costoReceta(i.receta, byId);
      const margen = i.precio - costo;
      const pct = i.precio > 0 ? Math.round((margen / i.precio) * 100) : 0;
      return `- ${i.nombre} [${i.categoria}] precio ${formatCOP(i.precio)}: costo ${formatCOP(
        Math.round(costo)
      )} → margen ${formatCOP(Math.round(margen))} (${pct}%)${i.agotado ? " — NO DISPONIBLE" : ""}`;
    })
    .join("\n");

  return [
    `NEGOCIO: ${cat.ajustes.negocio} (Pereira). Impuesto ${cat.ajustes.impuestoPct}%. Estado: ${cat.ajustes.abierto === false ? "CERRADO" : "abierto"}.`,
    ``,
    `HOY: ${hoyPed.length} pedidos válidos, ventas ${formatCOP(ventasHoy)}, ticket ${formatCOP(ticket)}. Por cobrar: ${porCobrar.length} = ${formatCOP(sum(porCobrar, (p) => p.total))}. Activos: ${activos.length}. Mesas ocupadas: ${mesasOcup}/${cat.ajustes.numMesas}.`,
    ``,
    `P&L (ventas · costo · margen · compras · gastos · utilidad):`,
    `- Hoy: ${pnl("hoy")}`,
    `- Semana: ${pnl("semana")}`,
    `- Mes: ${pnl("mes")}`,
    ``,
    `DESPENSA (actual / estándar). Valor: ${formatCOP(Math.round(valorDespensa))}:`,
    despensa,
    ``,
    `PLATOS (costo receta y margen):`,
    platos,
    ``,
    `Más pedido — base: ${top(ped.map((p) => p.base))}; proteína: ${top(ped.map((p) => p.proteina))}. Leads nuevos: ${leadsNuevos}.`,
  ].join("\n");
}

/* ---- Llamada a DeepSeek (OpenAI-compatible, con tools) ---- */
type ToolCall = { id: string; type: string; function: { name: string; arguments: string } };
type ChatMsg = {
  role: string;
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

async function chatDeepSeek(key: string, messages: ChatMsg[], forzarTool = false): Promise<ChatMsg> {
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.2,
      max_tokens: 800,
      tools: TOOLS,
      tool_choice: forzarTool ? "required" : "auto",
      messages,
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`IA ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return data?.choices?.[0]?.message ?? { role: "assistant", content: "No pude generar respuesta." };
}

export async function POST(req: Request) {
  const authed = (await cookies()).get("pg_admin")?.value === "1";
  if (!authed) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const key = process.env.DEEPSEEK_API_KEY?.replace(/[^\x20-\x7E]/g, "").trim();
  if (!key)
    return NextResponse.json({ error: "IA no configurada (falta DEEPSEEK_API_KEY)." }, { status: 503 });

  const now = Date.now();
  llamadas = llamadas.filter((t) => now - t < 5 * 60_000);
  if (llamadas.length >= 30)
    return NextResponse.json({ error: "Demasiadas consultas seguidas. Intenta en un momento." }, { status: 429 });
  llamadas.push(now);

  const body = await req.json().catch(() => ({}));
  const userMsgs: ChatMsg[] = Array.isArray(body.messages)
    ? body.messages.slice(-10).map((m: ChatMsg) => ({ role: m.role, content: m.content }))
    : [];

  const cat = await getCatalog();
  const convo: ChatMsg[] = [
    { role: "system", content: SISTEMA + "\n\nESTADO ACTUAL:\n" + resumen(cat) },
    ...userMsgs,
  ];

  // Si el último mensaje del operador describe un hecho (compra/gasto/apertura),
  // forzamos el uso de herramienta para que se EJECUTE (no que lo alucine en texto).
  const ultimo = [...userMsgs].reverse().find((m) => m.role === "user")?.content ?? "";
  const esAccion = /\b(compr|pagu|pagué|gast|abastec|repon|surt|lleg[oó]|entr[oó]|merc[aá]|apertur)/i.test(
    String(ultimo)
  );

  let changed = false;
  try {
    for (let round = 0; round < 3; round++) {
      const msg = await chatDeepSeek(key, convo, round === 0 && esAccion);
      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        if (changed) {
          revalidatePath("/admin", "layout");
          revalidatePath("/");
        }
        return NextResponse.json({ reply: msg.content || "Listo.", changed });
      }
      // Ejecuta las herramientas y devuelve resultados al modelo
      convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      for (const tc of calls) {
        let args: Args = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* args inválidos */
        }
        const res = await ejecutar(tc.function.name, args);
        if (res.changed) changed = true;
        convo.push({ role: "tool", tool_call_id: tc.id, content: res.msg });
      }
    }
    if (changed) {
      revalidatePath("/admin", "layout");
      revalidatePath("/");
    }
    return NextResponse.json({ reply: "Hecho.", changed });
  } catch (e) {
    return NextResponse.json(
      { error: "No pude conectar con la IA.", detail: (e as Error)?.message ?? String(e) },
      { status: 502 }
    );
  }
}
