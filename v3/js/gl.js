'use strict';
// A tiny WebGL renderer. Two kinds of thing are drawn:
//   meshes   flat-coloured triangles (track, ground, pillars, cars), fogged with distance
//   sprites  upright pixel-art cut-outs from one texture atlas (trees, signs, smoke)
// A real depth buffer is what lets roads pass over and under each other.
const GLR = (() => {
  let gl, solid, sprite, atlasTex = null;
  const view = new Float32Array(16), proj = new Float32Array(16), vp = new Float32Array(16);
  const eye = [0, 0, 0];
  let camRight = [1, 0, 0];

  const SOLID_VS = `
    attribute vec3 aPos; attribute vec3 aCol;
    uniform mat4 uVP; uniform mat4 uModel; uniform vec3 uEye;
    varying vec3 vCol; varying float vDist;
    void main() {
      vec4 w = uModel * vec4(aPos, 1.0);
      vCol = aCol; vDist = distance(w.xyz, uEye);
      gl_Position = uVP * w;
    }`;
  const SOLID_FS = `
    precision mediump float;
    uniform vec3 uFog; uniform vec2 uFogRange; uniform vec4 uTint;
    varying vec3 vCol; varying float vDist;
    void main() {
      vec3 c = mix(vCol, uTint.rgb, uTint.a);
      float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
      gl_FragColor = vec4(mix(c, uFog, f), 1.0);
    }`;
  const SPRITE_VS = `
    attribute vec3 aCenter; attribute vec2 aOff; attribute vec2 aUV;
    uniform mat4 uVP; uniform vec3 uRight; uniform vec3 uEye;
    varying vec2 vUV; varying float vDist;
    void main() {
      vec3 w = aCenter + uRight * aOff.x + vec3(0.0, aOff.y, 0.0);
      vUV = aUV; vDist = distance(w, uEye);
      gl_Position = uVP * vec4(w, 1.0);
    }`;
  const SPRITE_FS = `
    precision mediump float;
    uniform sampler2D uTex; uniform vec3 uFog; uniform vec2 uFogRange;
    varying vec2 vUV; varying float vDist;
    void main() {
      vec4 t = texture2D(uTex, vUV);
      if (t.a < 0.5) discard;
      float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
      gl_FragColor = vec4(mix(t.rgb, uFog, f), 1.0);
    }`;
  // Shadows and puffs that need real transparency use this variant.
  const SOFT_FS = `
    precision mediump float;
    uniform sampler2D uTex; uniform vec3 uFog; uniform vec2 uFogRange;
    varying vec2 vUV; varying float vDist;
    void main() {
      vec4 t = texture2D(uTex, vUV);
      if (t.a < 0.02) discard;
      float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
      gl_FragColor = vec4(mix(t.rgb, uFog, f), t.a * (1.0 - f));
    }`;
  let soft;

  function compile(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const info = { p, a: {}, u: {} };
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES), nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < na; i++) { const n = gl.getActiveAttrib(p, i).name; info.a[n] = gl.getAttribLocation(p, n); }
    for (let i = 0; i < nu; i++) { const n = gl.getActiveUniform(p, i).name; info.u[n] = gl.getUniformLocation(p, n); }
    return info;
  }

  function init(canvas) {
    gl = canvas.getContext('webgl', { antialias: false, alpha: true, preserveDrawingBuffer: false });
    if (!gl) return false;
    solid = compile(SOLID_VS, SOLID_FS);
    sprite = compile(SPRITE_VS, SPRITE_FS);
    soft = compile(SPRITE_VS, SOFT_FS);
    gl.enable(gl.DEPTH_TEST);
    return true;
  }

  // ---------------------------------------------------------------- matrices
  function perspective(out, fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
  }
  function lookAt(out, e, t, up) {
    let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
    out[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
    out[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
    out[15] = 1;
    camRight = [xx, xy, xz];
  }
  function mul(out, a, b) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      out[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
    return out;
  }
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  // Model matrix from a position and three basis vectors (model x, y, z axes).
  function basis(out, px, py, pz, ax, ay, az) {
    out[0] = ax[0]; out[1] = ax[1]; out[2] = ax[2]; out[3] = 0;
    out[4] = ay[0]; out[5] = ay[1]; out[6] = ay[2]; out[7] = 0;
    out[8] = az[0]; out[9] = az[1]; out[10] = az[2]; out[11] = 0;
    out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
    return out;
  }

  // ---------------------------------------------------------------- frame
  let fog = [0.5, 0.6, 0.7], fogRange = [200, 700];

  function begin(w, h, camEye, camTarget, fovY, fogCol, fogNear, fogFar) {
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    perspective(proj, fovY, w / h, 0.5, fogFar + 50);
    lookAt(view, camEye, camTarget, [0, 1, 0]);
    mul(vp, proj, view);
    eye[0] = camEye[0]; eye[1] = camEye[1]; eye[2] = camEye[2];
    fog = fogCol; fogRange = [fogNear, fogFar];
  }

  // World point to screen pixels, or null when behind the camera.
  function project(x, y, z, w, h) {
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 0.01) return null;
    return [(cx / cw * 0.5 + 0.5) * w, (1 - (cy / cw * 0.5 + 0.5)) * h, cw];
  }

  // ---------------------------------------------------------------- meshes
  // data: Float32Array of [x, y, z, r, g, b] per vertex, three vertices per triangle.
  function mesh(data) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buf, count: data.length / 6 };
  }
  function free(m) { if (m) gl.deleteBuffer(m.buf); }

  const NO_TINT = [0, 0, 0, 0];
  function draw(m, model = IDENT, cull = 0, tint = NO_TINT) {
    if (!m || !m.count) return;
    gl.useProgram(solid.p);
    gl.uniformMatrix4fv(solid.u.uVP, false, vp);
    gl.uniformMatrix4fv(solid.u.uModel, false, model);
    gl.uniform3fv(solid.u.uEye, eye);
    gl.uniform3fv(solid.u.uFog, fog);
    gl.uniform2fv(solid.u.uFogRange, fogRange);
    gl.uniform4fv(solid.u.uTint, tint);
    if (cull) { gl.enable(gl.CULL_FACE); gl.cullFace(cull > 0 ? gl.BACK : gl.FRONT); } else gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    gl.enableVertexAttribArray(solid.a.aPos);
    gl.vertexAttribPointer(solid.a.aPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(solid.a.aCol);
    gl.vertexAttribPointer(solid.a.aCol, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
    gl.disable(gl.CULL_FACE);
  }

  // ---------------------------------------------------------------- sprites
  function setAtlas(cnv) {
    if (atlasTex) gl.deleteTexture(atlasTex);
    atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // Sprite batches hold 6 vertices per sprite of [cx, cy, cz, offX, offY, u, v].
  function spriteBatch(cap) {
    return { data: new Float32Array(cap * 42), n: 0, buf: gl.createBuffer(), cap, dirty: true };
  }
  // r: atlas rect {u0, v0, u1, v1}; w, h in metres; the sprite stands on (x, y, z).
  // lift raises the sprite off its anchor; flip mirrors it.
  function pushSprite(b, x, y, z, w, h, r, flip = false) {
    if (b.n >= b.cap) return;
    const d = b.data, o = b.n * 42, hw = w / 2;
    const u0 = flip ? r.u1 : r.u0, u1 = flip ? r.u0 : r.u1;
    const quad = [[-hw, 0, u0, r.v1], [hw, 0, u1, r.v1], [hw, h, u1, r.v0], [-hw, 0, u0, r.v1], [hw, h, u1, r.v0], [-hw, h, u0, r.v0]];
    for (let k = 0; k < 6; k++) {
      const q = quad[k], p = o + k * 7;
      d[p] = x; d[p + 1] = y; d[p + 2] = z; d[p + 3] = q[0]; d[p + 4] = q[1]; d[p + 5] = q[2]; d[p + 6] = q[3];
    }
    b.n++; b.dirty = true;
  }
  function drawSprites(b, isSoft = false) {
    if (!b.n || !atlasTex) return;
    const pr = isSoft ? soft : sprite;
    gl.useProgram(pr.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
    if (b.dirty) { gl.bufferData(gl.ARRAY_BUFFER, b.data.subarray(0, b.n * 42), gl.DYNAMIC_DRAW); b.dirty = false; }
    gl.uniformMatrix4fv(pr.u.uVP, false, vp);
    gl.uniform3fv(pr.u.uRight, camRight);
    gl.uniform3fv(pr.u.uEye, eye);
    gl.uniform3fv(pr.u.uFog, fog);
    gl.uniform2fv(pr.u.uFogRange, fogRange);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.uniform1i(pr.u.uTex, 0);
    gl.enableVertexAttribArray(pr.a.aCenter);
    gl.vertexAttribPointer(pr.a.aCenter, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(pr.a.aOff);
    gl.vertexAttribPointer(pr.a.aOff, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(pr.a.aUV);
    gl.vertexAttribPointer(pr.a.aUV, 2, gl.FLOAT, false, 28, 20);
    if (isSoft) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    }
    gl.drawArrays(gl.TRIANGLES, 0, b.n * 6);
    if (isSoft) { gl.disable(gl.BLEND); gl.depthMask(true); }
    gl.disableVertexAttribArray(pr.a.aOff);
    gl.disableVertexAttribArray(pr.a.aUV);
  }

  return {
    init, begin, project, mesh, free, draw, basis, setAtlas, spriteBatch, pushSprite, drawSprites,
    get ok() { return !!gl; }, get camRight() { return camRight; },
  };
})();
