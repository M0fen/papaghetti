"use client";

/**
 * IMPRIMIR DIRECTO: los bytes ESC/POS a la impresora, sin driver, sin diálogo.
 *
 * Todo lo que ha fallado hasta ahora ha fallado ENTRE Chrome y el papel: el
 * @media print, el @page, el driver de Windows, la cola, el destino "Guardar como
 * PDF". Este componente se salta esa cadena entera: convierte el tiquete (ya
 * binarizado, 576 puntos) en el raster ESC/POS que la impresora entiende y se lo
 * manda por el canal que tenga:
 *
 *  · BLUETOOTH (Web Bluetooth): la mayoría de térmicas baratas de 58/80mm lo traen.
 *    Chrome pide elegir el aparato una vez; después se recuerda en la sesión.
 *  · CABLE, PUERTO SERIE (Web Serial): si la térmica aparece en Windows como puerto
 *    COM (chips CH340/CP210x o el "Virtual COM" del fabricante).
 *
 * Ninguno de los dos necesita el driver de impresora de Windows ni el diálogo de
 * imprimir. Si la impresora recibe los bytes, imprime: no hay nadie más en la
 * conversación. Los botones solo aparecen si el navegador tiene la API.
 *
 * Solo funciona en Chrome/Edge sobre HTTPS y tras un clic (así lo exige el navegador).
 */

import { useState, useSyncExternalStore } from "react";
import { trabajoEscPos, trocear, type Bitmap } from "@/lib/escpos";

/* Las capacidades del navegador no cambian en vivo: no hay nada a lo que suscribirse. */
const nadaQueSuscribir = () => () => {};

/* Los servicios BLE que usan las térmicas de consumo. Se prueban en orden y se toma
   la primera característica que admita escritura. */
const SERVICIOS_BLE = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
];
/* Sin negociar MTU, Chrome garantiza 20 bytes por escritura; la mayoría acepta más.
   100 es el punto en que las Xprinter/Goojprt no pierden bytes y no tarda un minuto. */
const TROZO_BLE = 100;
const PAUSA_BLE_MS = 6;
const BAUDIOS = [9600, 19200, 38400, 57600, 115200];

/* Tipos mínimos: las APIs no están en el lib de TypeScript sin paquetes extra. */
interface Caracteristica {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValueWithoutResponse?: (v: BufferSource) => Promise<void>;
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

type Estado = { fase: "idle" | "trabajando" | "ok" | "error"; msg?: string };

/* Se recuerdan en la sesión para no volver a pedir el aparato en cada tiquete. */
let dispositivoBLE: Dispositivo | null = null;
let caracteristicaBLE: Caracteristica | null = null;
let puertoSerie: Puerto | null = null;

export default function ImpresionDirecta({
  getBitmap,
  etiqueta = "el tiquete",
}: {
  /** El bitmap binarizado a imprimir (null si aún no está dibujado). */
  getBitmap: () => Bitmap | null;
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
  const [baud, setBaud] = useState(() => {
    if (typeof window === "undefined") return 9600;
    try {
      const b = Number(localStorage.getItem("pg_baud"));
      return BAUDIOS.includes(b) ? b : 9600;
    } catch {
      return 9600;
    }
  });
  const [estado, setEstado] = useState<Estado>({ fase: "idle" });

  const bytesDelTiquete = (): Uint8Array | null => {
    const bmp = getBitmap();
    return bmp ? trabajoEscPos(bmp) : null;
  };

  /* ── Bluetooth ── */
  const porBluetooth = async () => {
    const n = navigator as Navigator & { bluetooth?: Bluetooth };
    if (!n.bluetooth) return;
    const bytes = bytesDelTiquete();
    if (!bytes) return;
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
          throw new Error("Este aparato no expone un canal de impresión conocido.");
        }
      }
      setEstado({ fase: "trabajando", msg: `Enviando ${etiqueta} a ${dispositivoBLE.name || "la impresora"}…` });
      const c = caracteristicaBLE;
      for (const trozo of trocear(bytes, TROZO_BLE)) {
        if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) {
          await c.writeValueWithoutResponse(trozo);
        } else {
          await c.writeValue(trozo);
        }
        await new Promise((r) => setTimeout(r, PAUSA_BLE_MS));
      }
      setEstado({ fase: "ok", msg: `Enviado a ${dispositivoBLE.name || "la impresora"}.` });
    } catch (e) {
      dispositivoBLE = null;
      caracteristicaBLE = null;
      const m = e instanceof Error ? e.message : String(e);
      setEstado({
        fase: "error",
        msg: /cancel/i.test(m) ? "No se eligió ninguna impresora." : `Bluetooth: ${m}`,
      });
    }
  };

  /* ── Puerto serie ── */
  const porSerie = async () => {
    const n = navigator as Navigator & { serial?: Serial };
    if (!n.serial) return;
    const bytes = bytesDelTiquete();
    if (!bytes) return;
    setEstado({ fase: "trabajando", msg: "Abriendo el puerto…" });
    try {
      if (!puertoSerie) {
        // Si ya se autorizó antes, se reutiliza sin volver a preguntar.
        const previos = await n.serial.getPorts();
        puertoSerie = previos[0] ?? (await n.serial.requestPort());
      }
      try {
        await puertoSerie.open({ baudRate: baud });
      } catch (e) {
        // "already open" es normal si el tiquete anterior dejó el puerto abierto.
        if (!/already open/i.test(e instanceof Error ? e.message : "")) throw e;
      }
      const w = puertoSerie.writable?.getWriter();
      if (!w) throw new Error("El puerto no admite escritura.");
      setEstado({ fase: "trabajando", msg: `Enviando ${etiqueta} por el cable…` });
      try {
        for (const trozo of trocear(bytes, 1024)) await w.write(trozo);
      } finally {
        w.releaseLock();
      }
      setEstado({ fase: "ok", msg: "Enviado por el puerto serie." });
    } catch (e) {
      puertoSerie = null;
      const m = e instanceof Error ? e.message : String(e);
      setEstado({
        fase: "error",
        msg: /No port selected/i.test(m) ? "No se eligió ningún puerto." : `Puerto serie: ${m}`,
      });
    }
  };

  if (!hayBT && !haySerie) return null;

  return (
    <div className="idirecta">
      <p className="idirecta__t">
        <b>Imprimir directo</b> · sin driver ni diálogo de Windows
      </p>
      <div className="idirecta__btns">
        {hayBT && (
          <button type="button" className="btn btn--ghost btnmini" onClick={porBluetooth} disabled={estado.fase === "trabajando"}>
            <span>Por Bluetooth</span>
          </button>
        )}
        {haySerie && (
          <>
            <button type="button" className="btn btn--ghost btnmini" onClick={porSerie} disabled={estado.fase === "trabajando"}>
              <span>Por cable (puerto serie)</span>
            </button>
            <label className="idirecta__baud">
              <span>baudios</span>
              <select
                value={baud}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setBaud(v);
                  try {
                    localStorage.setItem("pg_baud", String(v));
                  } catch {
                    /* sin almacenamiento */
                  }
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
      </div>
      {estado.msg && (
        <p className={`idirecta__msg is-${estado.fase}`} role="status">
          {estado.msg}
        </p>
      )}
    </div>
  );
}
