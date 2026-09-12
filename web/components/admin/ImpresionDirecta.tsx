"use client";

/**
 * IMPRIMIR DIRECTO: los bytes ESC/POS a la impresora, sin driver, sin diálogo.
 *
 * Todo lo que ha fallado hasta ahora ha fallado ENTRE Chrome y el papel: el
 * @media print, el @page, el driver de Windows, la cola, el destino "Guardar como
 * PDF". Este componente se salta esa cadena entera y le manda a la impresora los
 * bytes que entiende, por el canal que tenga:
 *
 *  · PUERTO COM (Web Serial). Es el camino que sirve en la práctica: una térmica
 *    con chip USB-serie (CH340, CP210x) o con el "Virtual COM" del fabricante, y
 *    también una térmica BLUETOOTH CLÁSICA una vez emparejada en Windows (queda
 *    como un COM "Estándar serie sobre Bluetooth"; Chrome 117+ la abre igual).
 *  · BLUETOOTH DE BAJA ENERGÍA (Web Bluetooth). Chrome SOLO habla BLE: las
 *    impresoras de mostrador suelen ser Bluetooth clásico y no aparecen aquí; las
 *    portátiles pequeñas (PT-210, Phomemo y parientes) sí.
 *
 * QUÉ SE MANDA. Por defecto el tiquete en TEXTO ESC/POS (~2 KB): sale en un par de
 * segundos por cualquier canal, con la letra de la impresora. La IMAGEN (igual que
 * la de pantalla, con logo) pesa ~60 KB: por un COM a 9600 baudios tarda cerca de
 * un minuto, así que queda como opción, no como defecto.
 *
 * Reglas del navegador que aquí se respetan: HTTPS y un clic para pedir el aparato;
 * escrituras BLE de como mucho 512 bytes y NUNCA en paralelo (una detrás de otra,
 * con await); si un paquete grande le falla al aparato, se baja a los 20 bytes que
 * el estándar garantiza. Un puerto COM lo puede tener abierto una sola pestaña.
 */

import { useState, useSyncExternalStore } from "react";

/* Las capacidades del navegador no cambian en vivo: no hay nada a lo que suscribirse. */
const nadaQueSuscribir = () => () => {};

/* Los servicios BLE documentados en térmicas de consumo (18F0 = la demo oficial de
   Web Bluetooth y las Goojprt; FF00 = PeriPage/Phomemo; 49535343… = el UART
   "transparente" de los módulos dual-mode y las PT-210/MTP). Se prueban en orden y
   se toma la primera característica que admita escritura. */
const SERVICIOS_BLE = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
];
/* Sin API para saber el MTU negociado, 20 bytes es lo único garantizado; Windows
   suele negociar bastante más. Se empieza en 100 y, si el aparato rechaza uno, se
   baja a 20 para el resto (ver mandarBLE). */
const TROZO_BLE = 100;
const TROZO_BLE_MINIMO = 20;
const PAUSA_BLE_MS = 6;
const TROZO_SERIE = 512;
/* El orden de prueba que sale de la documentación: 9600 es la de fábrica de la
   mayoría, Epson trae 38400, y 115200 la ponen los drivers de "Virtual COM". */
const BAUDIOS = [9600, 38400, 115200, 19200, 57600];

/* Tipos mínimos: las APIs no están en el lib de TypeScript sin paquetes extra. */
interface Caracteristica {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValueWithoutResponse?: (v: BufferSource) => Promise<void>;
  writeValueWithResponse?: (v: BufferSource) => Promise<void>;
  writeValue: (v: BufferSource) => Promise<void>;
}
interface Servicio {
  getCharacteristics: () => Promise<Caracteristica[]>;
}
interface Gatt {
  connected: boolean;
  connect: () => Promise<Gatt>;
  disconnect: () => void;
  getPrimaryService: (uuid: string) => Promise<Servicio>;
}
interface Dispositivo {
  name?: string;
  gatt?: Gatt;
}
interface Bluetooth {
  requestDevice: (o: { acceptAllDevices?: boolean; filters?: { services: string[] }[]; optionalServices: string[] }) => Promise<Dispositivo>;
}
interface Puerto {
  open: (o: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  writable: WritableStream<Uint8Array> | null;
}
interface Serial {
  requestPort: () => Promise<Puerto>;
  getPorts: () => Promise<Puerto[]>;
}

export interface TrabajosDirectos {
  /** El tiquete en TEXTO ESC/POS (~2 KB): el rápido. */
  texto?: () => Uint8Array | null;
  /** El tiquete como IMAGEN raster (~60 KB): idéntico al de pantalla. null si aún no está dibujado. */
  imagen: () => Uint8Array | null;
}
type Modo = "texto" | "imagen";
type Estado = { fase: "idle" | "trabajando" | "ok" | "error"; msg?: string };

/* Se recuerdan en la pestaña para no volver a pedir el aparato en cada tiquete. */
let dispositivoBLE: Dispositivo | null = null;
let caracteristicaBLE: Caracteristica | null = null;
let puertoSerie: Puerto | null = null;

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));
const nombreDe = (e: unknown) => (e instanceof DOMException ? e.name : "");

function leerGuardado<T extends string>(clave: string, validos: readonly T[], porDefecto: T): T {
  if (typeof window === "undefined") return porDefecto;
  try {
    const v = localStorage.getItem(clave) as T | null;
    return v && validos.includes(v) ? v : porDefecto;
  } catch {
    return porDefecto;
  }
}
function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento */
  }
}

export default function ImpresionDirecta({
  trabajos,
  etiqueta = "el tiquete",
}: {
  trabajos: TrabajosDirectos;
  etiqueta?: string;
}) {
  /* Las capacidades del navegador se leen con useSyncExternalStore, no con un
     setState dentro de un efecto: en el servidor valen `false` (no hay navigator),
     en el cliente lo que haya, y React reconcilia sin avisos de hidratación. */
  const hayBT = useSyncExternalStore(
    nadaQueSuscribir,
    () => Boolean((navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth),
    () => false,
  );
  const haySerie = useSyncExternalStore(
    nadaQueSuscribir,
    () => Boolean((navigator as Navigator & { serial?: Serial }).serial),
    () => false,
  );
  const hayTexto = Boolean(trabajos.texto);
  const [modo, setModo] = useState<Modo>(() =>
    hayTexto ? leerGuardado("pg_modo_directo", ["texto", "imagen"] as const, "texto") : "imagen",
  );
  const [baud, setBaud] = useState(() => Number(leerGuardado("pg_baud", BAUDIOS.map(String), "9600")));
  const [estado, setEstado] = useState<Estado>({ fase: "idle" });

  const elegirModo = (m: Modo) => {
    setModo(m);
    guardar("pg_modo_directo", m);
  };

  const bytesAMandar = (): Uint8Array | null =>
    modo === "texto" && trabajos.texto ? trabajos.texto() : trabajos.imagen();

  const progreso = (hecho: number, total: number, canal: string) => {
    const pct = Math.floor((hecho / total) * 100);
    setEstado({ fase: "trabajando", msg: `Enviando ${etiqueta} ${canal}… ${pct}%` });
  };

  /* ── Bluetooth de baja energía ── */
  const mandarBLE = async (c: Caracteristica, bytes: Uint8Array, canal: string) => {
    let tam = TROZO_BLE;
    let offset = 0;
    let ultimoPct = -1;
    while (offset < bytes.length) {
      const trozo = bytes.slice(offset, Math.min(offset + tam, bytes.length));
      try {
        if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) await c.writeValueWithoutResponse(trozo);
        else if (c.writeValueWithResponse) await c.writeValueWithResponse(trozo);
        else await c.writeValue(trozo);
      } catch (e) {
        /* El paquete grande no le vale a este aparato: se baja al tamaño que el
           estándar garantiza y se repite ESTE tramo. Si ya íbamos al mínimo, es
           otra cosa (se desconectó, se apagó) y se informa. */
        if (tam <= TROZO_BLE_MINIMO) throw e;
        tam = TROZO_BLE_MINIMO;
        continue;
      }
      offset += trozo.length;
      await pausa(PAUSA_BLE_MS);
      const pct = Math.floor((offset / bytes.length) * 100);
      if (pct !== ultimoPct && pct % 5 === 0) {
        ultimoPct = pct;
        progreso(offset, bytes.length, canal);
      }
    }
  };

  const porBluetooth = async (forzarElegir = false) => {
    const n = navigator as Navigator & { bluetooth?: Bluetooth };
    if (!n.bluetooth) return;
    const bytes = bytesAMandar();
    if (!bytes) return;
    if (forzarElegir) {
      try {
        dispositivoBLE?.gatt?.disconnect();
      } catch {
        /* ya estaba suelto */
      }
      dispositivoBLE = null;
      caracteristicaBLE = null;
    }
    setEstado({ fase: "trabajando", msg: "Buscando la impresora por Bluetooth…" });
    try {
      if (!dispositivoBLE || !caracteristicaBLE || !dispositivoBLE.gatt?.connected) {
        dispositivoBLE =
          dispositivoBLE ??
          (await n.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: SERVICIOS_BLE,
          }));
        const gatt = await dispositivoBLE.gatt!.connect();
        caracteristicaBLE = null;
        for (const uuid of SERVICIOS_BLE) {
          try {
            const srv = await gatt.getPrimaryService(uuid);
            const cs = await srv.getCharacteristics();
            const c = cs.find((x) => x.properties.writeWithoutResponse || x.properties.write);
            if (c) {
              caracteristicaBLE = c;
              break;
            }
          } catch {
            /* ese servicio no está en este aparato: siguiente */
          }
        }
        if (!caracteristicaBLE) {
          throw new Error(
            "Este aparato no expone un canal de impresión conocido. Si es una impresora de mostrador, seguramente es Bluetooth clásico: emparéjala en Windows y usa el botón de puerto COM.",
          );
        }
      }
      const nombre = dispositivoBLE.name || "la impresora";
      setEstado({ fase: "trabajando", msg: `Enviando ${etiqueta} a ${nombre}… 0%` });
      await mandarBLE(caracteristicaBLE, bytes, `a ${nombre}`);
      setEstado({ fase: "ok", msg: `Enviado a ${nombre}.` });
    } catch (e) {
      dispositivoBLE = null;
      caracteristicaBLE = null;
      const m = mensajeDe(e);
      setEstado({
        fase: "error",
        msg: /cancel/i.test(m)
          ? "No se eligió ninguna impresora. Si la tuya no salía en la lista, es Bluetooth clásico (no BLE): emparéjala en Windows y usa el puerto COM."
          : `Bluetooth: ${m}`,
      });
    }
  };

  /* ── Puerto COM (cable USB-serie o Bluetooth clásico emparejado) ── */
  const cerrarPuerto = async () => {
    try {
      await puertoSerie?.close();
    } catch {
      /* ya estaba cerrado */
    }
    puertoSerie = null;
  };

  const porSerie = async (forzarElegir = false) => {
    const n = navigator as Navigator & { serial?: Serial };
    if (!n.serial) return;
    const bytes = bytesAMandar();
    if (!bytes) return;
    setEstado({ fase: "trabajando", msg: "Abriendo el puerto…" });
    try {
      if (forzarElegir) {
        await cerrarPuerto();
        puertoSerie = await n.serial.requestPort();
      }
      if (!puertoSerie) {
        /* Si ya se autorizó UN puerto antes, se reutiliza sin preguntar. Con varios
           autorizados (p. ej. el par que crea Bluetooth) no se adivina: se pregunta. */
        const previos = await n.serial.getPorts();
        puertoSerie = previos.length === 1 ? previos[0] : await n.serial.requestPort();
      }
      try {
        await puertoSerie.open({ baudRate: baud });
      } catch (e) {
        // "already open" es normal si el tiquete anterior dejó el puerto abierto.
        if (!/already open/i.test(mensajeDe(e))) {
          if (nombreDe(e) === "NetworkError" || /Failed to open/i.test(mensajeDe(e))) {
            throw new Error(
              "no se pudo abrir el puerto: está ocupado (otra pestaña o el programa del fabricante) o la impresora está apagada o desconectada.",
            );
          }
          throw e;
        }
      }
      const w = puertoSerie.writable?.getWriter();
      if (!w) throw new Error("el puerto no admite escritura.");
      setEstado({ fase: "trabajando", msg: `Enviando ${etiqueta} por el puerto COM… 0%` });
      try {
        for (let offset = 0; offset < bytes.length; offset += TROZO_SERIE) {
          await w.write(bytes.slice(offset, Math.min(offset + TROZO_SERIE, bytes.length)));
          progreso(Math.min(offset + TROZO_SERIE, bytes.length), bytes.length, "por el puerto COM");
        }
      } finally {
        w.releaseLock();
      }
      setEstado({
        fase: "ok",
        msg: `Enviado por el puerto COM a ${baud} baudios. Si salieron símbolos raros, cambia los baudios y repite.`,
      });
    } catch (e) {
      await cerrarPuerto();
      const m = mensajeDe(e);
      setEstado({
        fase: "error",
        msg: /No port selected/i.test(m)
          ? "No se eligió ningún puerto. Si no aparecía ninguno, la impresora no está como puerto COM en este PC (mira el paso 3 de la página Impresora)."
          : `Puerto COM: ${m}`,
      });
    }
  };

  if (!hayBT && !haySerie) return null;

  const ocupado = estado.fase === "trabajando";

  return (
    <div className="idirecta">
      <p className="idirecta__t">
        <b>Imprimir directo</b> · sin driver ni diálogo de Windows
      </p>
      {hayTexto && (
        <div className="idirecta__modo" role="group" aria-label="Qué se manda a la impresora">
          <button type="button" className={modo === "texto" ? "is-on" : ""} onClick={() => elegirModo("texto")}>
            Texto (rápido)
          </button>
          <button type="button" className={modo === "imagen" ? "is-on" : ""} onClick={() => elegirModo("imagen")}>
            Imagen (con logo)
          </button>
        </div>
      )}
      <p className="idirecta__pista">
        {modo === "texto"
          ? "Unos 2 KB con la letra de la impresora: sale en segundos por cualquier canal. Sin logo."
          : "Igual que el de pantalla, con logo, pero pesa unos 60 KB: por cable a 9600 baudios tarda cerca de un minuto y por Bluetooth más. Si se corta o sale a trozos, vuelve a Texto."}
      </p>
      <div className="idirecta__btns">
        {haySerie && (
          <>
            <button type="button" className="btn btn--ghost btnmini" onClick={() => porSerie()} disabled={ocupado}>
              <span>Por puerto COM (USB o Bluetooth emparejado)</span>
            </button>
            <label className="idirecta__baud">
              <span>baudios</span>
              <select
                value={baud}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setBaud(v);
                  guardar("pg_baud", String(v));
                  /* Con otro baudio hay que reabrir el puerto: se suelta el actual. */
                  void cerrarPuerto();
                }}
              >
                {BAUDIOS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {hayBT && (
          <button type="button" className="btn btn--ghost btnmini" onClick={() => porBluetooth()} disabled={ocupado}>
            <span>Por Bluetooth de baja energía (BLE)</span>
          </button>
        )}
      </div>
      <p className="idirecta__pista">
        {haySerie && (
          <button type="button" className="idirecta__link" onClick={() => porSerie(true)} disabled={ocupado}>
            Elegir otro puerto
          </button>
        )}
        {haySerie && hayBT && " · "}
        {hayBT && (
          <button type="button" className="idirecta__link" onClick={() => porBluetooth(true)} disabled={ocupado}>
            Elegir otro aparato Bluetooth
          </button>
        )}
      </p>
      {estado.msg && (
        <p className={`idirecta__msg is-${estado.fase}`} role="status">
          {estado.msg}
        </p>
      )}
    </div>
  );
}
