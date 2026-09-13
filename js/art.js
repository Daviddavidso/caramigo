/* caramigo.es — versión ASCII
   Fondo WebGL (vídeo → ASCII + fluido), galería sticky, stock y ficha. */
(function () {
  'use strict';

  var CARS = window.CARS || [];
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var motionOn = !reduceMQ.matches;
  var userPaused = false;
  var listeners = [];

  /* ---------------------------------------------------------- utilidades */

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts || false);
    listeners.push([target, type, fn]);
  }

  function euro(n) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }

  function miles(n) {
    return new Intl.NumberFormat('es-ES').format(n);
  }

  var BODY_ES = {
    Cuatro_por_cuatro_suv: 'SUV',
    Berlina: 'Berlina',
    Compacto: 'Compacto',
    Familiar: 'Familiar',
    Coupé: 'Coupé',
    Descapotable: 'Descapotable',
    Monovolumen: 'Monovolumen'
  };

  function bodyEs(c) { return BODY_ES[c.body] || c.body; }
  function carName(c) { return c.brand + ' ' + c.model; }
  function carFull(c) { return carName(c) + ' ' + (c.version || ''); }
  function photo(c, i, big) {
    return 'img/' + (big ? 'cars-lg' : 'cars') + '/' + c.imgs[i || 0];
  }
  function specLine(c) {
    return c.year + ' · ' + miles(c.km) + ' km · ' + c.fuel + ' · ' + c.gear;
  }

  /* ------------------------------------------------------- fondo ASCII */

  var VERT = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var CLEAR_FS = 'precision highp float;\nvoid main(){ gl_FragColor = vec4(0.5, 0.5, 0.0, 1.0); }';

  var FLUID_FS = [
    'precision highp float;',
    'uniform sampler2D uVelocity;',
    'uniform vec2 uResolution;',
    'uniform vec2 uPointer;',
    'uniform vec2 uPointerPrevious;',
    'uniform vec2 uPointerVelocity;',
    'uniform float uPointerActive;',
    'uniform float uDelta;',
    'uniform float uTime;',
    'uniform float uMouseRadius;',
    'uniform float uForce;',
    'uniform float uForceClamp;',
    'uniform float uPressure;',
    'uniform float uDissipation;',
    'uniform float uViscosity;',
    'uniform float uCurlStrength;',
    'varying vec2 vUv;',
    'vec2 dec(vec2 v){ return v * 2.0 - 1.0; }',
    'vec2 enc(vec2 v){ return v * 0.5 + 0.5; }',
    'float segDist(vec2 p, vec2 a, vec2 b){',
    '  vec2 s = b - a;',
    '  float d = max(dot(s, s), 0.000001);',
    '  float t = clamp(dot(p - a, s) / d, 0.0, 1.0);',
    '  return length(p - (a + s * t));',
    '}',
    'void main(){',
    '  vec2 texel = 1.0 / uResolution;',
    '  vec4 cur = texture2D(uVelocity, vUv);',
    '  vec2 curV = dec(cur.xy);',
    '  vec2 back = clamp(vUv - curV * uDelta * 0.46, 0.0, 1.0);',
    '  vec4 adv = texture2D(uVelocity, back);',
    '  vec2 vel = dec(adv.xy);',
    '  float trail = adv.b;',
    '  vec2 vl = dec(texture2D(uVelocity, clamp(vUv - vec2(texel.x, 0.0), 0.0, 1.0)).xy);',
    '  vec2 vr = dec(texture2D(uVelocity, clamp(vUv + vec2(texel.x, 0.0), 0.0, 1.0)).xy);',
    '  vec2 vb = dec(texture2D(uVelocity, clamp(vUv - vec2(0.0, texel.y), 0.0, 1.0)).xy);',
    '  vec2 vt = dec(texture2D(uVelocity, clamp(vUv + vec2(0.0, texel.y), 0.0, 1.0)).xy);',
    '  vec2 blur = (vl + vr + vb + vt) * 0.25;',
    '  float visc = clamp(uViscosity * uDelta * 620.0, 0.0, 0.22);',
    '  vel = mix(vel, blur, visc);',
    '  float vort = (vr.y - vl.y - vt.x + vb.x) * 0.5;',
    '  vel += vec2(vel.y, -vel.x) * vort * uCurlStrength * uDelta * 2.4;',
    '  float speed = length(uPointerVelocity);',
    '  float nf = clamp(speed * uForce, 0.0, uForceClamp) / max(uForceClamp, 0.0001);',
    '  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);',
    '  float radius = uMouseRadius * mix(0.17, 0.38, smoothstep(0.0, 1.0, nf));',
    '  float d = segDist(vUv * aspect, uPointerPrevious * aspect, uPointer * aspect);',
    '  float infl = exp(-d * d / max(radius * radius, 0.00001)) * uPointerActive;',
    '  if (uPointerActive > 0.5 && speed > 0.0001) {',
    '    vec2 dir = normalize(uPointerVelocity);',
    '    vec2 nor = vec2(-dir.y, dir.x);',
    '    float imp = min(speed * uForce, uForceClamp) * 0.0025;',
    '    float wave = sin(dot(vUv - uPointer, nor) * 72.0 + uTime * 4.0);',
    '    vel += dir * imp * infl;',
    '    vel += nor * wave * infl * nf * uCurlStrength * 0.048;',
    '    trail = max(trail, infl * (0.32 + nf * 0.68));',
    '  }',
    '  float pd = pow(uPressure, uDelta * 60.0);',
    '  float td = exp(-uDissipation * uDelta * 720.0);',
    '  vel *= pd * td;',
    '  trail *= td;',
    '  gl_FragColor = vec4(enc(clamp(vel, -1.0, 1.0)), clamp(trail, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  var ASCII_FS = [
    'precision highp float;',
    'uniform sampler2D uVideo;',
    'uniform sampler2D uFluid;',
    'uniform sampler2D uAtlas;',
    'uniform vec2 uResolution;',
    'uniform vec2 uSourceSize;',
    'uniform float uCellSize;',
    'uniform float uCharacterCount;',
    'uniform float uDistortionStrength;',
    'uniform float uBrightnessStrength;',
    'uniform float uVideoZoom;',
    'uniform float uVignetteStrength;',
    'uniform float uVignetteInner;',
    'uniform float uVignetteOuter;',
    'uniform vec3 uTransitionColor;',
    'uniform vec3 uFinalColor;',
    'uniform float uTransitionBand;',
    'uniform float uScroll;',
    'uniform float uFinalScroll;',
    'uniform float uTime;',
    'varying vec2 vUv;',
    'vec2 dec(vec2 v){ return v * 2.0 - 1.0; }',
    'vec2 coverUv(vec2 uv){',
    '  float va = uResolution.x / uResolution.y;',
    '  float sa = uSourceSize.x / uSourceSize.y;',
    '  vec2 s = vec2(1.0);',
    '  if (va > sa) { s.y = sa / va; } else { s.x = va / sa; }',
    '  return ((uv - 0.5) * s) / uVideoZoom + 0.5;',
    '}',
    'float noise(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'void main(){',
    '  vec4 fluid = texture2D(uFluid, vUv);',
    '  vec2 flow = dec(fluid.xy);',
    '  float fi = smoothstep(0.008, 0.68, fluid.b);',
    '  vec2 warped = clamp(vUv - flow * uDistortionStrength * (0.7 + fi * 1.45), 0.0, 1.0);',
    '  vec2 grid = max(floor(uResolution / uCellSize), vec2(1.0));',
    '  vec2 gp = warped * grid;',
    '  vec2 cell = floor(gp);',
    '  vec2 cuv = fract(gp);',
    '  vec2 center = (cell + 0.5) / grid;',
    '  vec2 vuv = clamp(coverUv(center) - flow * uDistortionStrength * fi * 1.25, 0.001, 0.999);',
    '  vec3 src = texture2D(uVideo, vec2(vuv.x, 1.0 - vuv.y)).rgb;',
    '  src = clamp(pow(src, vec3(0.56)) * 1.10, 0.0, 1.0);',
    '  float bright = dot(src, vec3(0.2126, 0.7152, 0.0722));',
    '  float shade = clamp(1.0 - bright * 1.08, 0.0, 0.9999);',
    '  float idx = floor(shade * uCharacterCount);',
    '  vec2 auv = vec2((idx + cuv.x) / uCharacterCount, 1.0 - cuv.y);',
    '  float glyph = texture2D(uAtlas, auv).r;',
    '  glyph = smoothstep(0.22, 0.78, glyph);',
    '  vec3 field = src * 0.40 + vec3(0.016);',
    '  vec3 gcol = src * (1.12 + fi * uBrightnessStrength * 1.35);',
    '  gcol += fi * uBrightnessStrength * vec3(0.16, 0.07, 0.02);',
    '  vec3 color = mix(field, gcol, glyph);',
    '  color += fi * uBrightnessStrength * (src * 0.46 + vec3(0.09, 0.04, 0.01));',
    '  float grain = noise(gl_FragCoord.xy + floor(uTime * 24.0)) - 0.5;',
    '  color += grain * 0.047;',
    '  color *= 0.98 + 0.035 * sin(gl_FragCoord.y * 3.14159 / max(uCellSize, 1.0));',
    '  vec2 vp = (vUv * 2.0 - 1.0) * vec2(0.92, 1.08);',
    '  float vig = smoothstep(uVignetteInner, uVignetteOuter, length(vp));',
    '  color *= 1.0 - vig * uVignetteStrength;',
    '  vec2 tgrid = max(ceil(uResolution / uCellSize), vec2(1.0));',
    '  vec2 tcell = floor(gl_FragCoord.xy / uCellSize);',
    '  float row = (tcell.y + 0.5) / tgrid.y;',
    '  float pr = noise(tcell + vec2(19.17, 73.41));',
    '  float cr = noise(floor(tcell * 0.5) + vec2(117.3, 31.9));',
    '  float off = (mix(pr, cr, 0.32) - 0.5) * uTransitionBand;',
    '  float wave = sin(tcell.x * 0.37 + pr * 6.28318) * 0.025;',
    '  float revealAt = clamp(row + off + wave, 0.01, 0.99);',
    '  float e1 = uScroll * uScroll * (3.0 - 2.0 * uScroll);',
    '  color = mix(color, uTransitionColor, step(revealAt, e1));',
    '  float e2 = uFinalScroll * uFinalScroll * (3.0 - 2.0 * uFinalScroll);',
    '  color = mix(color, uFinalColor, step(revealAt, e2));',
    '  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);',
    '}'
  ].join('\n');

  var CFG = {
    cellSize: 15,
    sim: 128,
    mouseRadius: 0.2,
    force: 20,
    forceClamp: 50,
    pressure: 0.999,
    dissipation: 0.0011,
    viscosity: 0.0011,
    curl: 0.243,
    distortion: 0.02,
    brightness: 0.5,
    zoom: 1.02,
    vignette: 0.72,
    vigInner: 0.55,
    vigOuter: 1.35,
    band: 0.22,
    chars: 'CARAMIGO+-*#=',
    naranja: [248 / 255, 80 / 255, 0],
    blanco: [1, 1, 1]
  };

  /* el color de transición sale de la variable CSS --naranja (temas) */
  function cssColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var m = /^#([0-9a-f]{6})$/i.exec(v);
    if (!m) return fallback;
    var n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  var bg = {
    host: document.getElementById('bg'),
    video: document.getElementById('bg-video'),
    gl: null,
    raf: 0,
    ready: false,
    stop: function () {},
    start: function () {}
  };

  function compile(gl, type, source) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('shader', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  function program(gl, fs) {
    var v = compile(gl, gl.VERTEX_SHADER, VERT);
    var f = compile(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('link', gl.getProgramInfoLog(p));
      return null;
    }
    var u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p: p, u: u };
  }

  function atlasTexture(gl, chars) {
    var tile = 96;
    var cv = document.createElement('canvas');
    cv.width = tile * chars.length;
    cv.height = tile;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#fff';
    ctx.font = '700 ' + Math.round(tile * 0.74) + 'px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], i * tile + tile / 2, tile * 0.52);
    }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function initAscii() {
    var host = bg.host;
    var video = bg.video;
    if (!host || !video) return;

    video.muted = true;
    video.defaultMuted = true;

    var canvas = document.createElement('canvas');
    canvas.className = 'bg__canvas';
    canvas.setAttribute('aria-hidden', 'true');

    var opts = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false };
    var gl = canvas.getContext('webgl2', opts);
    if (!gl) {
      host.dataset.webgl = 'unavailable';
      return;
    }
    host.appendChild(canvas);
    host.dataset.webgl = 'active';
    bg.gl = gl;

    var float16 = !!gl.getExtension('EXT_color_buffer_float');
    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var pClear = program(gl, CLEAR_FS);
    var pFluid = program(gl, FLUID_FS);
    var pAscii = program(gl, ASCII_FS);
    if (!pClear || !pFluid || !pAscii) {
      host.dataset.webgl = 'unavailable';
      canvas.remove();
      return;
    }

    var sim = Math.min(window.innerWidth, window.innerHeight) < 600 || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) ? 64 : CFG.sim;

    function target(w, h) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (float16) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex: tex, fb: fb, w: w, h: h };
    }

    var read = target(sim, sim);
    var write = target(sim, sim);
    var atlas = atlasTexture(gl, CFG.chars);

    var videoTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 20, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    function draw(prog, fb, w, h) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog.p);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    draw(pClear, read.fb, sim, sim);
    draw(pClear, write.fb, sim, sim);

    var acento = cssColor('--naranja', CFG.naranja);
    var res = [1, 1];
    var cell = CFG.cellSize;
    var scroll = 0;
    var finalScroll = 0;
    var pointer = [0.5, 0.5];
    var pointerPrev = [0.5, 0.5];
    var pointerVel = [0, 0];
    var pointerActive = 0;
    var lastPointer = performance.now();
    var last = performance.now();
    var revealed = false;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(host.clientWidth * dpr));
      var h = Math.max(1, Math.round(host.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      res = [w, h];
      cell = CFG.cellSize * dpr;
    }

    function updateScroll() {
      var hero = document.getElementById('top');
      var heroH = Math.max(hero ? hero.offsetHeight : window.innerHeight, 1);
      scroll = Math.min(Math.max(window.scrollY / heroH, 0), 1);
      var white = document.querySelector('.screen--blanco');
      if (!white) { finalScroll = 0; return; }
      var top = white.getBoundingClientRect().top + window.scrollY;
      var start = top - window.innerHeight;
      finalScroll = Math.min(Math.max((window.scrollY - start) / Math.max(window.innerHeight, 1), 0), 1);
    }

    function setPointer(x, y, ts) {
      var b = host.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return;
      var nx = Math.min(Math.max((x - b.left) / b.width, 0), 1);
      var ny = Math.min(Math.max(1 - (y - b.top) / b.height, 0), 1);
      var dt = Math.max((ts - lastPointer) / 1000, 1 / 240);
      var mvx = (nx - pointer[0]) / dt;
      var mvy = (ny - pointer[1]) / dt;
      pointerVel[0] += (mvx - pointerVel[0]) * 0.62;
      pointerVel[1] += (mvy - pointerVel[1]) * 0.62;
      pointer[0] = nx;
      pointer[1] = ny;
      pointerActive = 1;
      lastPointer = ts;
    }

    on(window, 'pointermove', function (e) {
      if (e.pointerType === 'touch' || !motionOn) return;
      setPointer(e.clientX, e.clientY, e.timeStamp || performance.now());
    }, { passive: true });

    on(window, 'resize', resize, { passive: true });
    on(window, 'scroll', updateScroll, { passive: true });
    on(window, 'orientationchange', resize, { passive: true });
    on(canvas, 'webglcontextlost', function (e) { e.preventDefault(); canvas.style.opacity = '0'; });

    function frame(now) {
      bg.raf = requestAnimationFrame(frame);

      var delta = Math.min(Math.max((now - last) / 1000, 1 / 240), 1 / 20);
      last = now;
      var t = now / 1000;

      /* fluido */
      gl.useProgram(pFluid.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(pFluid.u.uVelocity, 0);
      gl.uniform2f(pFluid.u.uResolution, sim, sim);
      gl.uniform2f(pFluid.u.uPointer, pointer[0], pointer[1]);
      gl.uniform2f(pFluid.u.uPointerPrevious, pointerPrev[0], pointerPrev[1]);
      gl.uniform2f(pFluid.u.uPointerVelocity, pointerVel[0], pointerVel[1]);
      gl.uniform1f(pFluid.u.uPointerActive, pointerActive);
      gl.uniform1f(pFluid.u.uDelta, delta);
      gl.uniform1f(pFluid.u.uTime, t);
      gl.uniform1f(pFluid.u.uMouseRadius, CFG.mouseRadius);
      gl.uniform1f(pFluid.u.uForce, CFG.force);
      gl.uniform1f(pFluid.u.uForceClamp, CFG.forceClamp);
      gl.uniform1f(pFluid.u.uPressure, CFG.pressure);
      gl.uniform1f(pFluid.u.uDissipation, CFG.dissipation);
      gl.uniform1f(pFluid.u.uViscosity, CFG.viscosity);
      gl.uniform1f(pFluid.u.uCurlStrength, CFG.curl);
      draw(pFluid, write.fb, sim, sim);

      var tmp = read; read = write; write = tmp;

      if (pointerActive) {
        pointerPrev[0] = pointer[0];
        pointerPrev[1] = pointer[1];
        pointerActive = 0;
      }
      var damp = Math.pow(0.22, delta);
      pointerVel[0] *= damp;
      pointerVel[1] *= damp;

      /* vídeo → textura */
      var hasFrame = bg.video.readyState >= 2;
      if (hasFrame) {
        gl.bindTexture(gl.TEXTURE_2D, videoTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bg.video);
        } catch (err) { hasFrame = false; }
      }

      resize();

      /* ASCII */
      gl.useProgram(pAscii.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTex);
      gl.uniform1i(pAscii.u.uVideo, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(pAscii.u.uFluid, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, atlas);
      gl.uniform1i(pAscii.u.uAtlas, 2);
      gl.uniform2f(pAscii.u.uResolution, res[0], res[1]);
      gl.uniform2f(pAscii.u.uSourceSize, bg.video.videoWidth || 16, bg.video.videoHeight || 9);
      gl.uniform1f(pAscii.u.uCellSize, cell);
      gl.uniform1f(pAscii.u.uCharacterCount, CFG.chars.length);
      gl.uniform1f(pAscii.u.uDistortionStrength, CFG.distortion);
      gl.uniform1f(pAscii.u.uBrightnessStrength, CFG.brightness);
      gl.uniform1f(pAscii.u.uVideoZoom, CFG.zoom);
      gl.uniform1f(pAscii.u.uVignetteStrength, CFG.vignette);
      gl.uniform1f(pAscii.u.uVignetteInner, CFG.vigInner);
      gl.uniform1f(pAscii.u.uVignetteOuter, CFG.vigOuter);
      gl.uniform3f(pAscii.u.uTransitionColor, acento[0], acento[1], acento[2]);
      gl.uniform3f(pAscii.u.uFinalColor, CFG.blanco[0], CFG.blanco[1], CFG.blanco[2]);
      gl.uniform1f(pAscii.u.uTransitionBand, CFG.band);
      gl.uniform1f(pAscii.u.uScroll, scroll);
      gl.uniform1f(pAscii.u.uFinalScroll, finalScroll);
      gl.uniform1f(pAscii.u.uTime, t);
      draw(pAscii, null, res[0], res[1]);

      if (!revealed && hasFrame) {
        revealed = true;
        canvas.style.opacity = '1';
        canvas.dataset.ready = 'true';
      }
    }

    bg.start = function () {
      if (bg.raf) return;
      host.dataset.webgl = 'active';
      last = performance.now();
      bg.raf = requestAnimationFrame(frame);
    };
    bg.stop = function () {
      cancelAnimationFrame(bg.raf);
      bg.raf = 0;
      host.dataset.webgl = 'reduced';
    };

    resize();
    updateScroll();
    if (motionOn) bg.start();
    else host.dataset.webgl = 'reduced';
  }

  /* ---------------------------------------------------------- movimiento */

  function playVideo() {
    var p = bg.video && bg.video.play();
    if (p && p.catch) p.catch(function () {});
  }

  function setMotion(next) {
    motionOn = next;
    document.body.classList.toggle('motion-off', !next);
    var btn = document.getElementById('motion-toggle');
    if (btn) {
      var lbl = btn.querySelector('.lbl');
      if (lbl) lbl.textContent = next ? 'Pausar el movimiento' : 'Reproducir el movimiento';
      var icon = btn.querySelector('svg');
      if (icon) {
        icon.innerHTML = next
          ? '<rect x="0" y="0" width="4" height="14"></rect><rect x="8" y="0" width="4" height="14"></rect>'
          : '<path d="M1 0l11 7-11 7z"></path>';
      }
    }
    if (next) {
      playVideo();
      bg.start();
      startDrift();
      startScramble();
    } else {
      if (bg.video) bg.video.pause();
      bg.stop();
      stopDrift();
      stopScramble();
    }
  }

  function initMotionToggle() {
    var btn = document.getElementById('motion-toggle');
    if (!btn) return;
    setMotion(motionOn);
    on(btn, 'click', function () { setMotion(!motionOn); });
    on(btn, 'click', function () { userPaused = !motionOn; });
    on(reduceMQ, 'change', function () {
      if (reduceMQ.matches) setMotion(false);
      else if (!userPaused) setMotion(true);
    });
  }

  /* ---------------------------------------------------------- parallax */

  var driftRaf = 0;
  var driftEls = [];

  function driftUpdate() {
    driftRaf = 0;
    var root = document.querySelector('[data-drift-root]');
    if (!root) return;
    var p = Math.min(Math.max((window.scrollY - root.offsetTop) / Math.max(root.offsetHeight, 1), 0), 1);
    var eased = p * p * (3 - 2 * p);
    for (var i = 0; i < driftEls.length; i++) {
      var el = driftEls[i];
      var dy = Number(el.dataset.driftY) || 0;
      el.style.translate = '0 ' + (-eased * dy).toFixed(2) + 'px';
    }
  }

  function driftSchedule() {
    if (driftRaf || !motionOn) return;
    driftRaf = requestAnimationFrame(driftUpdate);
  }

  function startDrift() { driftSchedule(); }
  function stopDrift() {
    cancelAnimationFrame(driftRaf);
    driftRaf = 0;
    driftEls.forEach(function (el) { el.style.translate = ''; });
  }

  function initDrift() {
    driftEls = Array.prototype.slice.call(document.querySelectorAll('[data-drift]'));
    on(window, 'scroll', driftSchedule, { passive: true });
    on(window, 'resize', driftSchedule, { passive: true });
    if (motionOn) driftUpdate();
  }

  /* ---------------------------------------------------------- titular */

  var PHRASES = [
    ['DONDE', 'CADA COCHE', 'SE MIRA', 'DOS', 'VECES'],
    ['DONDE', 'TU PRÓXIMO', 'COCHE', 'YA TE', 'ESPERA'],
    ['DONDE', 'COMPRAR', 'ES', 'FÁCIL', 'Y SEGURO']
  ];
  var CYCLE = 6600;
  var STAGGER = 115;
  var EXIT_STEP = 70;
  var EXIT_MS = 470;

  /* de dónde entra cada palabra: izquierda, derecha, arriba, derecha, izquierda */
  var DIRS = [
    { tx: '-72vw', ty: '0', rz: '-4deg' },
    { tx: '74vw', ty: '0', rz: '3deg' },
    { tx: '-7vw', ty: '-58vh', rz: '-6deg' },
    { tx: '58vw', ty: '0', rz: '4deg' },
    { tx: '-64vw', ty: '0', rz: '-3deg' }
  ];

  var cycleTimer = 0;
  var stepTimers = [];
  var phraseIndex = 0;
  var titleSpans = [];
  var titleEl = null;

  function paint(words) {
    for (var i = 0; i < titleSpans.length; i++) {
      if (titleSpans[i].textContent !== words[i]) titleSpans[i].textContent = words[i];
    }
  }

  function clearSteps() {
    for (var i = 0; i < stepTimers.length; i++) window.clearTimeout(stepTimers[i]);
    stepTimers = [];
  }

  function placeDirections() {
    titleSpans.forEach(function (el, i) {
      var d = DIRS[i] || DIRS[0];
      el.style.setProperty('--tx', d.tx);
      el.style.setProperty('--ty', d.ty);
      el.style.setProperty('--rz', d.rz);
    });
  }

  /* El nombre accesible del h1 es estático (el texto oculto del marcado).
     Aquí solo cambia la capa decorativa: nunca añadir aria-live ni aria-label. */
  function setPhrase(i) {
    phraseIndex = i;
    paint(PHRASES[i]);
  }

  function flyIn() {
    if (!titleEl) return;
    clearSteps();
    titleEl.classList.remove('is-exiting');
    titleSpans.forEach(function (el) { el.classList.add('is-out'); });
    void titleEl.offsetWidth;
    titleSpans.forEach(function (el, i) {
      stepTimers.push(window.setTimeout(function () { el.classList.remove('is-out'); }, i * STAGGER));
    });
  }

  function flyOut(done) {
    if (!titleEl) return;
    clearSteps();
    titleEl.classList.add('is-exiting');
    var n = titleSpans.length;
    titleSpans.forEach(function (el, i) {
      stepTimers.push(window.setTimeout(function () { el.classList.add('is-out'); }, (n - 1 - i) * EXIT_STEP));
    });
    stepTimers.push(window.setTimeout(done, EXIT_MS + (n - 1) * EXIT_STEP));
  }

  function startScramble() {
    if (!titleEl || cycleTimer) return;
    flyIn();
    cycleTimer = window.setInterval(function () {
      if (document.hidden) return;
      flyOut(function () {
        setPhrase((phraseIndex + 1) % PHRASES.length);
        flyIn();
      });
    }, CYCLE);
  }

  function stopScramble() {
    window.clearInterval(cycleTimer);
    cycleTimer = 0;
    clearSteps();
    if (titleEl) titleEl.classList.remove('is-exiting');
    titleSpans.forEach(function (el) { el.classList.remove('is-out'); });
  }

  function initScramble() {
    titleEl = document.getElementById('hero-title');
    titleSpans = Array.prototype.slice.call(document.querySelectorAll('[data-w]'));
    if (!titleSpans.length) return;
    placeDirections();
    setPhrase(0);
    if (!motionOn) return;
    titleSpans.forEach(function (el) { el.classList.add('is-out'); });
    var launched = false;
    var launch = function () {
      if (launched) return;
      launched = true;
      startScramble();
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(launch);
      window.setTimeout(launch, 1200);
    } else {
      launch();
    }
  }

  /* ---------------------------------------------------------- galería */

  var FEATURED = [
    'land-rover-range-rover-velar',
    'porsche-boxster',
    'bmw-x7',
    'audi-tts',
    'mercedes-benz-clase-e',
    'cupra-formentor'
  ];

  function byId(id) {
    for (var i = 0; i < CARS.length; i++) if (CARS[i].id === id) return CARS[i];
    return null;
  }

  function initGallery() {
    var stack = document.getElementById('gal-stack');
    var pages = document.getElementById('gal-pages');
    var rail = document.getElementById('gal-rail');
    if (!stack || !pages) return;

    var items = FEATURED.map(byId).filter(Boolean);
    if (!items.length) return;

    items.forEach(function (c, i) {
      var anchor = document.createElement('span');
      anchor.className = 'gal__anchor';
      anchor.id = 'destacado-' + (i + 1);
      anchor.setAttribute('data-gal-anchor', '');
      anchor.setAttribute('aria-hidden', 'true');
      stack.appendChild(anchor);

      var card = document.createElement('article');
      card.className = 'gal__card';
      card.setAttribute('data-gal-card', '');
      card.style.zIndex = String(i + 1);

      card.innerHTML =
        '<div class="gal__visual">' +
          '<div class="gal__frame"><img src="' + photo(c, 0, true) + '" alt="" width="1400" height="1050" loading="' + (i < 2 ? 'eager' : 'lazy') + '"></div>' +
          '<div class="gal__meta">' +
            '<h3 class="gal__name">' + carName(c) + '</h3>' +
            '<p class="gal__price">' + euro(c.price) + '</p>' +
            '<p class="gal__spec">' + bodyEs(c) + ' · ' + specLine(c) + ' · ' + c.cv + ' CV</p>' +
          '</div>' +
        '</div>';
      stack.appendChild(card);
    });

    items.forEach(function (c, i) {
      var li = document.createElement('li');
      li.innerHTML =
        '<a class="gal__page" href="#destacado-' + (i + 1) + '">' +
          '<span class="gal__page-line" aria-hidden="true"></span>' +
          '<span class="gal__page-label"><span class="gal__page-num">' + String(i + 1).padStart(2, '0') + '</span> ' + carName(c) + '</span>' +
        '</a>';
      pages.appendChild(li);
    });

    var section = document.getElementById('destacados');
    var cards = Array.prototype.slice.call(stack.querySelectorAll('[data-gal-card]'));
    var anchors = Array.prototype.slice.call(stack.querySelectorAll('[data-gal-anchor]'));
    var links = Array.prototype.slice.call(pages.querySelectorAll('.gal__page'));
    var raf = 0;
    var active = -1;

    function update() {
      raf = 0;
      var b = section.getBoundingClientRect();
      var sectionTop = b.top + window.scrollY;
      var stickyTop = window.innerHeight * (window.innerWidth <= 760 ? 0.12 : 0.05);
      var next = 0;

      var visible = b.top <= 1 && b.bottom > window.innerHeight + 1;
      rail.dataset.visible = visible ? 'true' : 'false';

      anchors.forEach(function (a, i) {
        var top = a.getBoundingClientRect().top + window.scrollY;
        if (window.scrollY >= Math.max(sectionTop, top) - stickyTop - 1) next = i;
      });

      if (motionOn) {
        cards.forEach(function (card, i) {
          var top = anchors[i].getBoundingClientRect().top + window.scrollY;
          var start = Math.max(sectionTop, top) - stickyTop;
          var p = Math.min(Math.max((window.scrollY - start) / 4500, 0), 1);
          card.style.setProperty('--scale', String(1 - p));
          card.style.setProperty('--rot', (p * 60).toFixed(2) + 'deg');
        });
      } else {
        cards.forEach(function (card) {
          card.style.removeProperty('--scale');
          card.style.removeProperty('--rot');
        });
      }

      if (next !== active) {
        active = next;
        links.forEach(function (a, i) {
          if (i === active) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      }
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(update); }

    on(window, 'scroll', schedule, { passive: true });
    on(window, 'resize', schedule, { passive: true });
    update();
  }

  /* ---------------------------------------------------------- stock */

  function matchFilter(c, f) {
    if (f === 'todos') return true;
    if (f === 'eco') return c.fuel.indexOf('Híbrido') === 0 || c.fuel === 'Eléctrico';
    if (f === 'auto') return c.gear === 'Automático';
    if (f === 'deportivo') return c.body === 'Coupé' || c.body === 'Descapotable';
    return c.body === f;
  }

  function cardHtml(c) {
    return '<li class="card">' +
      '<div class="card__shot">' +
        (c.isNew ? '<p class="card__tag">Nuevo ingreso</p>' : '') +
        '<img class="card__img" src="' + photo(c, 0) + '" alt="" width="760" height="570" loading="lazy" decoding="async">' +
      '</div>' +
      '<div class="card__body">' +
        '<h3 class="card__title"><button type="button" data-car="' + c.id + '" aria-haspopup="dialog">' +
          carName(c) + '<span class="sr-only">, ' + (c.version || '') + ', ' + c.year + ', ' + miles(c.km) + ' kilómetros, ' + euro(c.price) + '. Ver ficha</span>' +
        '</button></h3>' +
        '<p class="card__version">' + (c.version || '') + '</p>' +
        '<p class="card__specs">' + c.year + ' <span aria-hidden="true">·</span> ' + miles(c.km) + ' km <span aria-hidden="true">·</span> ' + c.fuel + '</p>' +
        '<p class="card__foot"><span class="card__price">' + euro(c.price) + '</span>' +
          (c.monthly ? '<span class="card__month">desde ' + euro(c.monthly) + '/mes</span>' : '') +
        '</p>' +
      '</div>' +
    '</li>';
  }

  function initStock() {
    var grid = document.getElementById('grid');
    var status = document.getElementById('resultados');
    var filters = document.getElementById('filters');
    if (!grid) return;

    var current = 'todos';

    function render() {
      var list = CARS.filter(function (c) { return matchFilter(c, current); });
      grid.innerHTML = list.length
        ? list.map(cardHtml).join('')
        : '<li class="empty">Ningún coche coincide con ese filtro.</li>';
      if (status) {
        status.textContent = list.length === 0
          ? 'Ningún coche coincide con los filtros'
          : (list.length === 1 ? '1 coche disponible' : list.length + ' coches disponibles');
      }
    }

    if (filters) {
      on(filters, 'click', function (e) {
        var btn = e.target.closest('button[data-filter]');
        if (!btn) return;
        current = btn.dataset.filter;
        Array.prototype.forEach.call(filters.querySelectorAll('button'), function (b) {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        render();
      });
    }

    render();
  }

  /* ---------------------------------------------------------- ficha */

  function initFicha() {
    var dlg = document.getElementById('ficha');
    if (!dlg || !dlg.showModal) return;

    var photoEl = document.getElementById('ficha-photo');
    var countEl = document.getElementById('ficha-count');
    var titleEl = document.getElementById('ficha-title');
    var versionEl = document.getElementById('ficha-version');
    var priceEl = document.getElementById('ficha-price');
    var monthEl = document.getElementById('ficha-month');
    var specsEl = document.getElementById('ficha-specs');
    var waEl = document.getElementById('ficha-wa');
    var prev = document.getElementById('ficha-prev');
    var next = document.getElementById('ficha-next');

    var car = null;
    var index = 0;
    var opener = null;
    var openerId = '';

    function showPhoto(i) {
      if (!car) return;
      index = (i + car.imgs.length) % car.imgs.length;
      photoEl.src = photo(car, index, true);
      photoEl.alt = carFull(car) + ', foto ' + (index + 1) + ' de ' + car.imgs.length;
      countEl.textContent = 'Foto ' + (index + 1) + ' de ' + car.imgs.length;
    }

    function specRow(dt, dd) {
      return dd ? '<div><dt>' + dt + '</dt><dd>' + dd + '</dd></div>' : '';
    }

    function open(id, trigger) {
      car = byId(id);
      if (!car) return;
      opener = trigger || null;
      openerId = id;

      titleEl.textContent = carName(car);
      versionEl.textContent = car.version || '';
      priceEl.textContent = euro(car.price);
      monthEl.textContent = car.monthly ? 'Financiado desde ' + euro(car.monthly) + ' al mes' : '';
      specsEl.innerHTML =
        specRow('Año', car.year) +
        specRow('Kilómetros', miles(car.km) + ' km') +
        specRow('Combustible', car.fuel) +
        specRow('Cambio', car.gear) +
        specRow('Potencia', car.cv + ' CV') +
        specRow('Carrocería', bodyEs(car)) +
        specRow('Plazas', car.seats) +
        specRow('Puertas', car.doors) +
        specRow('Etiqueta DGT', car.label) +
        specRow('Tracción', car.traction);
      waEl.href = 'https://wa.me/34641516102?text=' + encodeURIComponent('Hola, me interesa el ' + carFull(car) + ' (' + euro(car.price) + ').');

      showPhoto(0);
      dlg.showModal();
      dlg.scrollTop = 0;
      titleEl.focus();
      if (bg.video) bg.video.pause();
    }

    on(document, 'click', function (e) {
      var btn = e.target.closest('button[data-car]');
      if (!btn) return;
      open(btn.dataset.car, btn);
    });

    on(dlg, 'click', function (e) {
      if (e.target.closest('[data-close]')) { dlg.close(); return; }
    });

    var downOutside = false;
    on(dlg, 'mousedown', function (e) { downOutside = e.target === dlg; });
    on(dlg, 'click', function (e) { if (downOutside && e.target === dlg) dlg.close(); downOutside = false; });

    on(prev, 'click', function () { showPhoto(index - 1); });
    on(next, 'click', function () { showPhoto(index + 1); });

    on(dlg, 'keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); showPhoto(index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); showPhoto(index + 1); }
    });

    on(dlg, 'close', function () {
      if (motionOn) playVideo();
      var back = opener && opener.isConnected
        ? opener
        : document.querySelector('button[data-car="' + openerId + '"]');
      if (back) back.focus();
      else {
        var g = document.getElementById('grid');
        if (g) { g.setAttribute('tabindex', '-1'); g.focus(); }
      }
      opener = null;
    });
  }


  /* ---------------------------------------------------------- formulario */

  function initForm() {
    var form = document.getElementById('form');
    if (!form) return;
    var status = document.getElementById('form-status');
    var txt = document.getElementById('form-btn-txt');

    on(form, 'submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        status.textContent = 'Revisa los campos marcados antes de enviar.';
        var bad = form.querySelector(':invalid');
        if (bad) bad.focus();
        return;
      }
      form.reset();
      if (txt) txt.textContent = 'Enviado';
      status.textContent = 'Gracias. Te escribimos en cuanto lo veamos.';
    });
  }

  /* ---------------------------------------------------------- anclas */

  function initAnchors() {
    on(document, 'click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var reduced = reduceMQ.matches || !motionOn;
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    });
  }

  /* ---------------------------------------------------------- arranque */

  function boot() {
    var y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());

    initGallery();
    initStock();
    initFicha();
    initForm();
    initAnchors();
    initDrift();
    initScramble();
    initMotionToggle();
    initAscii();

    if (motionOn) playVideo();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden || !motionOn) return;
      playVideo();
      clearSteps();
      if (titleEl) titleEl.classList.remove('is-exiting');
      titleSpans.forEach(function (el) { el.classList.remove('is-out'); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
