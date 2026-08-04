/* PRUEBA SOCIAL — el hueco de conversión #1 según la auditoría (el 61% de los
 * comensales mira reseñas antes de decidir).
 *
 * ⚠️ IMPORTANTE: aquí van reseñas REALES (copiadas de Google Maps / Instagram con
 * nombre de pila). No publicamos reseñas inventadas: la infraestructura queda lista
 * y el bloque aparece solo cuando MOSTRAR = true y hay contenido tuyo.
 *
 * Cómo activarlo:
 *  1. Copia 3-6 reseñas reales (texto + nombre + estrellas).
 *  2. Pégalas en RESENAS siguiendo el formato.
 *  3. Cambia MOSTRAR a true. Listo: el bloque aparece entre el hero y el armador.
 */
export type Resena = { nombre: string; texto: string; estrellas: 1 | 2 | 3 | 4 | 5 };

export const MOSTRAR = false;

export const RESENAS: Resena[] = [
  // { nombre: "Nombre", texto: "La reseña real va aquí.", estrellas: 5 },
];
