/* POST-FX (Fase 3, sin dependencias): UN pase final WebGL sobre el canvas del juego —
 * BLOOM cálido a ¼ de resolución, aberración cromática en los bordes y grano animado.
 * El juego no cambia nada: su canvas queda debajo intacto; este canvas overlay lo
 * muestrea por frame (texImage2D — el costo dominante) y pinta el resultado.
 * FILOSOFÍA DE RIESGO: overlay con pointer-events:none + kill-switch del llamador —
 * si el frame real se pasa de presupuesto sostenido, off() quita el canvas y el juego
 * vuelve a verse directo. Cero acoplamiento, 100% reversible en runtime. */

export type PostFx = {
  frame: (tMs: number) => void;
  off: () => void;
  dispose: () => void;
  activo: () => boolean;
};

const VS = `attribute vec2 p;varying vec2 v;void main(){v=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}`;

// pase 1: extracción de brillos (a ¼ res) — solo lo que ya casi quema, tintado cálido
const FS_BRIGHT = `precision mediump float;varying vec2 v;uniform sampler2D t;
void main(){vec3 c=texture2D(t,v).rgb;float l=dot(c,vec3(.299,.587,.114));
float k=max(0.,l-.72)*2.6;gl_FragColor=vec4(c*k*vec3(1.06,1.,.9),1.);}`;

// pase 2/3: blur gaussiano separable (5 taps, a ¼ res)
const FS_BLUR = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 d;
void main(){vec3 s=texture2D(t,v).rgb*.294;
s+=texture2D(t,v+d*1.407).rgb*.353;s+=texture2D(t,v-d*1.407).rgb*.353;
gl_FragColor=vec4(s,1.);}`;

// pase final: base + cromática de borde + bloom aditivo + grano animado
const FS_FINAL = `precision mediump float;varying vec2 v;
uniform sampler2D t;uniform sampler2D b;uniform float ti;
void main(){
vec2 c=v-0.5;float r2=dot(c,c);
vec2 off=c*r2*0.007;
float cr=texture2D(t,v+off).r;
vec4 g0=texture2D(t,v);
float cb=texture2D(t,v-off).b;
vec3 col=vec3(cr,g0.g,cb);
col+=texture2D(b,v).rgb*0.5;
float gr=fract(sin(dot(gl_FragCoord.xy+mod(ti,97.0),vec2(12.9898,78.233)))*43758.5453);
col+=(gr-0.5)*0.032;
gl_FragColor=vec4(col,1.);}`;

export function creaPostFx(game: HTMLCanvasElement, animado: boolean): PostFx | null {
  const cv = document.createElement("canvas");
  cv.className = game.className; // hereda posición/tamaño CSS del canvas del juego
  cv.style.pointerEvents = "none";
  cv.setAttribute("aria-hidden", "true");
  const gl = cv.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  game.insertAdjacentElement("afterend", cv);

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = (fs: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    return p;
  };
  const pBright = prog(FS_BRIGHT);
  const pBlur = prog(FS_BLUR);
  const pFinal = prog(FS_FINAL);
  if (!gl.getProgramParameter(pFinal, gl.LINK_STATUS)) {
    cv.remove();
    return null;
  }

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // el canvas 2D sube con Y arriba; GL la quiere abajo

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const bindQuad = (p: WebGLProgram) => {
    const loc = gl.getAttribLocation(p, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  };

  const mkTex = () => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const texGame = mkTex();
  const mkFbo = () => {
    const t = mkTex();
    const f = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f, w: 2, h: 2 };
  };
  const fboA = mkFbo();
  const fboB = mkFbo();

  let W = 0;
  let H = 0;
  const resize = () => {
    W = game.width;
    H = game.height;
    cv.width = W;
    cv.height = H;
    const bw = Math.max(2, Math.round(W / 4));
    const bh = Math.max(2, Math.round(H / 4));
    for (const fb of [fboA, fboB]) {
      fb.w = bw;
      fb.h = bh;
      gl.bindTexture(gl.TEXTURE_2D, fb.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  };

  let vivo = true;
  const frame = (tMs: number) => {
    if (!vivo || game.width === 0) return;
    if (game.width !== W || game.height !== H) resize();
    // subir el juego (el costo dominante del pase)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texGame);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, game);
    // brillos a ¼
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA.f);
    gl.viewport(0, 0, fboA.w, fboA.h);
    gl.useProgram(pBright);
    bindQuad(pBright);
    gl.uniform1i(gl.getUniformLocation(pBright, "t"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // blur H y V
    gl.useProgram(pBlur);
    bindQuad(pBlur);
    gl.uniform1i(gl.getUniformLocation(pBlur, "t"), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.f);
    gl.bindTexture(gl.TEXTURE_2D, fboA.t);
    gl.uniform2f(gl.getUniformLocation(pBlur, "d"), 1 / fboA.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA.f);
    gl.bindTexture(gl.TEXTURE_2D, fboB.t);
    gl.uniform2f(gl.getUniformLocation(pBlur, "d"), 0, 1 / fboB.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // composición final a pantalla
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(pFinal);
    bindQuad(pFinal);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texGame);
    gl.uniform1i(gl.getUniformLocation(pFinal, "t"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fboA.t);
    gl.uniform1i(gl.getUniformLocation(pFinal, "b"), 1);
    gl.uniform1f(gl.getUniformLocation(pFinal, "ti"), animado ? tMs * 0.06 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const off = () => {
    vivo = false;
    cv.remove();
  };
  return {
    frame,
    off,
    dispose: () => {
      off();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
    activo: () => vivo,
  };
}
