/**
 * (Esqueleto: lo llena su fase.) Se corre con:  node --import ./qa-ts.mjs qa-sitio.mjs
 */
let ok = 0;
let mal = 0;
console.log(`\n═══ ${ok} ✅  ·  ${mal} ❌ ═══`);
process.exit(mal ? 1 : 0);
