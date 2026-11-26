/**
 * WebGL refraction for the lifted lens on engines without SVG backdrop
 * filters (iOS Safari, Telegram WKWebView).
 *
 * The TabBar's own foreground (icons, labels, badges, rim lines) is
 * rasterized into one texture. A full-track canvas draws it 1:1 everywhere
 * except inside the lens, where a fragment shader applies a convex Snell
 * bend at the rim, a gentle core magnification and RGB dispersion.
 */

export type GlLensParams = {
  /** Lens center in track CSS coordinates. */
  centerX: number;
  centerY: number;
  /** Half extents of the unscaled lens capsule, CSS px. */
  halfW: number;
  halfH: number;
  /** Jelly deformation applied around the center. */
  scaleX: number;
  scaleY: number;
  /** 0 at rest (identity), 1 fully lifted. */
  lift: number;
  magnification: number;
  /** Width of the refracting glass wall, CSS px. */
  bevel: number;
  /** Maximum outward sample shift at the rim, CSS px. */
  strength: number;
  /** Relative R/B channel spread at the rim. */
  chroma: number;
};

const VERTEX = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_center;
uniform vec2 u_half;
uniform vec2 u_scale;
uniform float u_lift;
uniform float u_mag;
uniform float u_bevel;
uniform float u_strength;
uniform float u_chroma;

float sdCapsule(vec2 p, vec2 h) {
  float r = min(h.x, h.y);
  vec2 q = abs(p) - (h - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec4 sampleAt(vec2 p) {
  return texture2D(u_tex, p / u_res);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec4 base = sampleAt(p);
  if (u_lift < 0.004) {
    gl_FragColor = base;
    return;
  }

  vec2 q = (p - u_center) / u_scale;
  float d = sdCapsule(q, u_half);
  if (d > 0.0) {
    gl_FragColor = base;
    return;
  }

  float depth = -d;
  vec2 e = vec2(0.75, 0.0);
  vec2 n = vec2(
    sdCapsule(q + e.xy, u_half) - sdCapsule(q - e.xy, u_half),
    sdCapsule(q + e.yx, u_half) - sdCapsule(q - e.yx, u_half)
  );
  n /= max(length(n), 0.0001);

  float t = clamp(depth / u_bevel, 0.0, 1.0);
  float u = 1.0 - t;
  // Outward sampling keeps the mapping monotonic: rim lines are pulled into
  // the glass wall instead of being skipped.
  float bend = u_strength * pow(u, 1.6) * u_lift;
  float mag = 1.0 + (u_mag - 1.0) * u_lift;
  vec2 core = q / mag;
  float c = u_chroma * u * u_lift;

  vec4 cR = sampleAt(u_center + (core + n * bend * (1.0 - c)) * u_scale);
  vec4 cG = sampleAt(u_center + (core + n * bend) * u_scale);
  vec4 cB = sampleAt(u_center + (core + n * bend * (1.0 + c)) * u_scale);
  vec4 refracted = vec4(cR.r, cG.g, cB.b, max(cR.a, max(cG.a, cB.a)));

  float edge = smoothstep(0.0, 1.25, depth);
  gl_FragColor = mix(base, refracted, edge);
}
`;

type Gl = WebGLRenderingContext | WebGL2RenderingContext;

const UNIFORMS = [
  "u_tex",
  "u_res",
  "u_center",
  "u_half",
  "u_scale",
  "u_lift",
  "u_mag",
  "u_bevel",
  "u_strength",
  "u_chroma",
] as const;

function compile(gl: Gl, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Shader allocation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log ?? ""}`);
  }
  return shader;
}

export class GlLensRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: Gl;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly texture: WebGLTexture;
  private readonly uniforms: Record<
    (typeof UNIFORMS)[number],
    WebGLUniformLocation | null
  >;
  private dpr = 1;
  private offsetX = 0;
  private offsetY = 0;
  private hasTexture = false;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    const options: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    };
    const gl = (canvas.getContext("webgl2", options) ??
      canvas.getContext("webgl", options)) as Gl | null;
    if (!gl) throw new Error("WebGL unavailable");
    if (gl.isContextLost()) throw new Error("WebGL context lost");
    this.canvas = canvas;
    this.gl = gl;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!program) throw new Error("Program allocation failed");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link failed: ${log ?? ""}`);
    }
    this.program = program;

    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Buffer allocation failed");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    this.buffer = buffer;

    const texture = gl.createTexture();
    if (!texture) throw new Error("Texture allocation failed");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texture = texture;

    this.uniforms = Object.fromEntries(
      UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as GlLensRenderer["uniforms"];
  }

  /** Sizes the drawing buffer to the texture frame (track plus margins). */
  setFrame(
    cssWidth: number,
    cssHeight: number,
    dpr: number,
    offsetX: number,
    offsetY: number,
  ) {
    this.dpr = dpr;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /** Uploads the composed foreground; throws on tainted sources. */
  upload(source: HTMLCanvasElement) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.hasTexture = true;
  }

  render(params: GlLensParams | null) {
    if (this.destroyed || !this.hasTexture) return;
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const dpr = this.dpr;
    const u = this.uniforms;

    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL API call, not a React hook.
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const position = gl.getAttribLocation(this.program, "a_pos");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_res, this.canvas.width, this.canvas.height);

    const p = params;
    gl.uniform1f(u.u_lift, p ? p.lift : 0);
    if (p) {
      gl.uniform2f(
        u.u_center,
        (p.centerX + this.offsetX) * dpr,
        (p.centerY + this.offsetY) * dpr,
      );
      gl.uniform2f(u.u_half, p.halfW * dpr, p.halfH * dpr);
      gl.uniform2f(u.u_scale, p.scaleX, p.scaleY);
      gl.uniform1f(u.u_mag, p.magnification);
      gl.uniform1f(u.u_bevel, Math.max(1, p.bevel * dpr));
      gl.uniform1f(u.u_strength, p.strength * dpr);
      gl.uniform1f(u.u_chroma, p.chroma);
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;
    if (gl.isContextLost()) return;
    gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
  }
}
