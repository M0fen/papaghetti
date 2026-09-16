/**
 * MANDAR UNA IMAGEN A LA IMPRESORA DEL SISTEMA, por el diálogo del navegador.
 *
 * Se abre una PESTAÑA con un documento que solo contiene la imagen y se llama a
 * print(). Sin cromo que ocultar, no hay CSS que pueda dejar el papel en blanco. Si
 * el diálogo fallara, el operario tiene el tiquete delante para Ctrl+P o clic
 * derecho → guardar. Con los popups bloqueados se cae a un iframe con el mismo
 * documento (con tamaño real, aparcado fuera de pantalla; nunca display:none, que
 * deja el documento sin maquetar y Blink imprime en blanco).
 *
 * Vive aparte del componente del comprobante para que el patrón de calibración y la
 * página de diagnóstico impriman EXACTAMENTE por el mismo camino.
 */
export function imprimirImagen(src: string, termica: boolean, titulo: string, anchoMm = 72): void {
  /* SIN `size` EN LA TÉRMICA. Epson y Bixolon declaran "80 × 297" y "80 × 3276", no
     arrancan en el mismo, y Chrome encoge o centra la página cuando el @page no
     coincide con el papel del driver. Sin size manda el papel del driver. */
  const page = termica ? "@page { margin: 0; }" : "@page { size: auto; margin: 10mm; }";
  /* El ancho útil del cabezal (72mm en 80, 48mm en 58): los píxeles del canvas caen
     uno a uno sobre sus puntos. max-width:100% para que, si cambian los márgenes del
     diálogo, se encoja en vez de perder el borde derecho. */
  const ancho = termica ? `width:${anchoMm}mm;max-width:100%;margin:0 auto` : "width:100%";
  const html =
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<title>${titulo}</title>` +
    `<style>${page}
      html,body{margin:0;padding:0;background:#fff}
      img{display:block;${ancho};height:auto}
      @media print{ body,img{visibility:visible !important;display:block !important} }
    </style></head><body><img src="${src}" alt="${titulo}"></body></html>`;

  /* ESPERAR A LA IMAGEN. En un popup rellenado con document.write, print() no espera
     a que una <img data:> esté decodificada. Se decodifica explícitamente y se dejan
     pasar dos cuadros. */
  const cuando = async (w: Window, img: HTMLImageElement | null) => {
    try {
      if (img) await img.decode();
    } catch {
      /* imagen ya lista o navegador sin decode(): seguimos */
    }
    await new Promise<void>((r) => w.requestAnimationFrame(() => w.requestAnimationFrame(() => r())));
  };

  const ventana = window.open("", "_blank");
  if (ventana && ventana.document) {
    ventana.document.open();
    ventana.document.write(html);
    ventana.document.close();
    cuando(ventana, ventana.document.querySelector("img")).then(() => {
      /* Con el acceso directo "Papaghetti Caja" (--kiosk-printing) no hay diálogo: sin
         esto, cada comprobante dejaba una pestaña abierta y a media tarde eran decenas.
         Sin kiosko, afterprint llega al cerrar el diálogo (imprima o cancele). */
      ventana.addEventListener("afterprint", () => setTimeout(() => ventana.close(), 1500));
      try {
        ventana.focus();
        ventana.print();
      } catch {
        /* el tiquete queda a la vista en la pestaña: Ctrl+P */
      }
    });
    return;
  }

  const marco = document.createElement("iframe");
  marco.className = "cbte-print-frame";
  marco.setAttribute("aria-hidden", "true");
  marco.style.cssText =
    "position:fixed;left:-10000px;top:0;width:400px;height:800px;border:0;pointer-events:none";
  document.body.appendChild(marco);
  const doc = marco.contentDocument;
  const w = marco.contentWindow;
  if (!doc || !w) {
    marco.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  cuando(w, doc.querySelector("img")).then(() => {
    try {
      w.focus();
      w.print();
    } finally {
      setTimeout(() => marco.remove(), 2000);
    }
  });
}
