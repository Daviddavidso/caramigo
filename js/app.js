/* ============================================================
   CarAmigo — lógica de la página (vanilla JS, sin dependencias)
   ============================================================ */
(function () {
  'use strict';

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var deskMQ   = window.matchMedia('(min-width: 821px) and (min-aspect-ratio: 11/10)');
  var CARS     = window.CARS || [];
  var PAGE     = 12;

  // Formato español fijo (miles con punto). No dependemos de la configuración
  // regional del navegador: en algunos entornos devuelve "7861" en vez de "7.861".
  var miles = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var euro  = function (n) { return miles(n) + '\u00a0€'; };
  var km    = function (n) { return miles(n) + '\u00a0km'; };
  var el   = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------------
     1. Vídeo de fondo — SC 2.2.2 Pause, Stop, Hide
     --------------------------------------------------------- */
  (function video() {
    var v = document.querySelector('.stage-video');
    var t = el('vid-toggle');
    if (!v || !t) return;
    var label = t.querySelector('.vid-label');

    // El nombre accesible describe la acción siguiente; sin aria-pressed,
    // que sonaría contradictorio junto al cambio de etiqueta.
    function paint() {
      var playing = !v.paused;
      t.dataset.state = playing ? 'playing' : 'paused';
      label.textContent = playing ? 'Pausar vídeo de fondo' : 'Reproducir vídeo de fondo';
    }
    function play()  { var p = v.play(); if (p && p.catch) p.catch(function () { paint(); }); }

    v.addEventListener('play', paint);
    v.addEventListener('pause', paint);
    t.addEventListener('click', function () { v.paused ? play() : v.pause(); paint(); });
    reduceMQ.addEventListener('change', function (e) { e.matches ? v.pause() : play(); paint(); });

    v.muted = true;
    if (!reduceMQ.matches) play(); else v.pause();
    paint();
  })();

  /* ---------------------------------------------------------
     2. Coreografía de entrada: se desmonta al terminar
     --------------------------------------------------------- */
  (function intro() {
    var root = document.documentElement;
    var done = false;
    function teardown() {
      if (done) return;
      done = true;
      root.classList.remove('anim');
    }
    if (reduceMQ.matches) { teardown(); return; }

    window.addEventListener('load', function () {
      var anims = (document.getAnimations ? document.getAnimations() : []).filter(function (a) {
        return a.animationName && a.animationName.indexOf('ent-') === 0;
      });
      if (!anims.length) { teardown(); return; }
      Promise.all(anims.map(function (a) { return a.finished; })).then(teardown, teardown);
    });
    // seguros: nunca dejar la página a medio animar
    setTimeout(teardown, 6000);
    document.addEventListener('keydown', function (e) { if (e.key === 'Tab') teardown(); }, true);
    document.addEventListener('focusin', teardown, { once: true });
  })();

  /* ---------------------------------------------------------
     3. Menú móvil (diálogo modal a mano: trampa de foco + Esc)
     --------------------------------------------------------- */
  (function menu() {
    var btn  = el('menu-toggle');
    var menu = el('site-menu');
    var xBtn = el('menu-close');
    if (!btn || !menu) return;
    var outside = [document.getElementById('contenido'), document.querySelector('.foot'), document.querySelector('.wa')];
    var FOCUS = 'a[href],button:not([disabled]),input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    var open = false;

    function items() {
      return Array.prototype.slice.call(menu.querySelectorAll(FOCUS));
    }
    function setInert(on) {
      outside.forEach(function (n) { if (n) n.inert = on; });
    }
    function openMenu() {
      open = true;
      menu.hidden = false;
      document.documentElement.classList.add('nav-open');
      btn.setAttribute('aria-expanded', 'true');
      btn.querySelector('.sr-only').textContent = 'Cerrar menú';
      setInert(true);
      (xBtn || menu.querySelector(FOCUS)).focus();
    }
    function closeMenu(restore) {
      if (!open) return;
      open = false;
      document.documentElement.classList.remove('nav-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.querySelector('.sr-only').textContent = 'Abrir menú';
      setInert(false);
      setTimeout(function () { if (!open) menu.hidden = true; }, 340);
      if (restore !== false) btn.focus();
    }

    btn.addEventListener('click', function () { open ? closeMenu() : openMenu(); });
    if (xBtn) xBtn.addEventListener('click', function () { closeMenu(); });

    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
      if (e.key !== 'Tab') return;
      var list = items();
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    menu.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      closeMenu(false);
      var target = document.querySelector(a.getAttribute('href'));
      if (target) {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        setTimeout(function () { target.focus({ preventScroll: true }); }, 60);
      }
    });

    deskMQ.addEventListener('change', function (e) { if (e.matches) closeMenu(false); });
  })();

  /* ---------------------------------------------------------
     4. Catálogo: filtros + rejilla
     --------------------------------------------------------- */
  var grid = el('grid');
  var view = CARS.slice();
  var shown = PAGE;

  function uniq(key) {
    var seen = {};
    CARS.forEach(function (c) { if (c[key]) seen[c[key]] = 1; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }

  function fillSelect(id, values) {
    var s = el(id);
    if (!s) return;
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      s.appendChild(o);
    });
  }

  function cardHTML(c) {
    var name  = c.brand + ' ' + c.model;
    var tags  = '';
    if (c.isNew) tags += '<span class="tag is-new">Nuevo</span>';
    if (c.status === 'Reservado') tags += '<span class="tag is-booked">Reservado</span>';
    else if (c.status === 'En preparación') tags += '<span class="tag">En preparación</span>';
    if (c.label === '0' || c.label === 'ECO') tags += '<span class="tag is-eco">Etiqueta ' + c.label + '</span>';

    var fin = c.monthly
      ? '<p class="card-fin">Financiado desde ' + euro(c.monthly) + ' al mes</p>'
      : (c.financed ? '<p class="card-fin">Precio financiado ' + euro(c.financed) + '</p>' : '<p class="card-fin">Financiación disponible</p>');

    return '' +
      '<li><article class="card">' +
        '<div class="card-media">' +
          '<img src="img/cars/' + c.imgs[0] + '" alt="" width="760" height="570" loading="lazy" decoding="async">' +
          (tags ? '<div class="tags">' + tags + '</div>' : '') +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + name + '</h3>' +
          '<p class="card-ver">' + c.version + '</p>' +
          '<p class="card-price"><span class="price">' + euro(c.price) + '</span><span class="price-lbl">al contado</span></p>' +
          fin +
          '<ul class="card-specs">' +
            '<li>' + c.year + '</li>' +
            '<li>' + km(c.km) + '</li>' +
            '<li>' + c.gear + '</li>' +
            '<li>' + c.fuel + '</li>' +
          '</ul>' +
          '<button type="button" class="card-open" data-id="' + c.id + '" ' +
            'aria-label="Ver ficha de ' + name + ' ' + c.version + ', ' + euro(c.price) + '">Ver ficha</button>' +
        '</div>' +
      '</article></li>';
  }

  function render() {
    if (!grid) return;
    grid.innerHTML = view.slice(0, shown).map(cardHTML).join('');
    var n = view.length;
    el('results').textContent = n === 0
      ? 'Ningún coche coincide con los filtros'
      : (n === 1 ? '1 coche disponible' : n + ' coches disponibles') +
        (shown < n ? ' — mostrando ' + shown : '');
    el('more').parentNode.hidden = shown >= n;
    el('empty').hidden = n !== 0;
  }

  function apply() {
    var q     = (el('f-q').value || '').trim().toLowerCase();
    var brand = el('f-brand').value;
    var fuel  = el('f-fuel').value;
    var gear  = el('f-gear').value;
    var max   = parseInt(el('f-max').value, 10);
    var sort  = el('f-sort').value;

    view = CARS.filter(function (c) {
      if (brand && c.brand !== brand) return false;
      if (fuel && c.fuel !== fuel) return false;
      if (gear && c.gear !== gear) return false;
      if (max && c.price > max) return false;
      if (q) {
        var hay = (c.brand + ' ' + c.model + ' ' + c.version + ' ' + c.fuel + ' ' + c.gear + ' ' + (c.body || '') + ' ' + c.year).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (sort === 'p-asc')  view.sort(function (a, b) { return a.price - b.price; });
    if (sort === 'p-desc') view.sort(function (a, b) { return b.price - a.price; });
    if (sort === 'km')     view.sort(function (a, b) { return a.km - b.km; });
    if (sort === 'year')   view.sort(function (a, b) { return b.year - a.year; });

    shown = PAGE;
    render();
  }

  if (grid) {
    fillSelect('f-brand', uniq('brand'));
    fillSelect('f-fuel', uniq('fuel'));
    ['f-q', 'f-brand', 'f-fuel', 'f-gear', 'f-max', 'f-sort'].forEach(function (id) {
      var n = el(id);
      n.addEventListener(id === 'f-q' ? 'input' : 'change', apply);
    });
    el('filters').addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    el('more').addEventListener('click', function () {
      var firstNew = shown;
      shown += PAGE;
      render();
      var cards = grid.querySelectorAll('.card-open');
      if (cards[firstNew]) cards[firstNew].focus();
    });
    function reset() {
      el('filters').reset();
      apply();
      el('f-q').focus();
    }
    el('f-reset').addEventListener('click', reset);
    el('empty-reset').addEventListener('click', reset);
    render();
  }

  /* ---------------------------------------------------------
     5. Ficha del vehículo (diálogo modal + galería)
     --------------------------------------------------------- */
  (function ficha() {
    var wrap = el('ficha');
    if (!wrap) return;
    var box  = wrap.querySelector('.ficha-box');
    var body = el('ficha-body');
    var FOCUS = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
    var last = null, car = null, idx = 0, open = false;
    var outside = [document.getElementById('contenido'), document.querySelector('.foot'), document.querySelector('.wa'), document.querySelector('.stage')];

    function specRow(dt, dd) {
      return dd ? '<div><dt>' + dt + '</dt><dd>' + dd + '</dd></div>' : '';
    }

    function galleryHTML() {
      var thumbs = car.imgs.map(function (src, i) {
        return '<button type="button" data-i="' + i + '" aria-current="' + (i === idx) + '">' +
               '<img src="img/cars/' + src + '" alt="" width="74" height="56" loading="lazy">' +
               '<span class="sr-only">Foto ' + (i + 1) + ' de ' + car.imgs.length + '</span></button>';
      }).join('');
      return '' +
        '<div class="gal">' +
          '<div class="gal-main">' +
            '<img id="gal-img" src="img/cars-lg/' + car.imgs[idx] + '" alt="' + car.brand + ' ' + car.model + ' ' + car.version + ', foto ' + (idx + 1) + '" width="1400" height="1050">' +
            (car.imgs.length > 1 ?
              '<button type="button" class="gal-nav gal-prev"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 2 4 8l6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr-only">Foto anterior</span></button>' +
              '<button type="button" class="gal-nav gal-next"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr-only">Foto siguiente</span></button>' +
              '<p class="gal-count" id="gal-count">' + (idx + 1) + ' / ' + car.imgs.length + '</p>' : '') +
          '</div>' +
          (car.imgs.length > 1 ? '<div class="thumbs">' + thumbs + '</div>' : '') +
        '</div>';
    }

    function html() {
      var name = car.brand + ' ' + car.model;
      var msg = encodeURIComponent('Hola, me interesa el ' + name + ' ' + car.version + ' (' + euro(car.price) + '). ¿Sigue disponible?');
      var fin = car.monthly
        ? 'Financiado desde ' + euro(car.monthly) + ' al mes' + (car.financed ? ' · precio financiado ' + euro(car.financed) : '')
        : (car.financed ? 'Precio financiado ' + euro(car.financed) : 'Financiación disponible, consúltanos sin compromiso');

      return '' +
        '<div class="ficha-grid">' +
          galleryHTML() +
          '<div class="ficha-info">' +
            '<h2 id="ficha-title">' + name + '</h2>' +
            '<p class="ficha-ver">' + car.version + ' · ' + car.status + ' · ' + car.city + '</p>' +
            '<p class="ficha-price"><span class="price">' + euro(car.price) + '</span><span class="price-lbl">al contado</span></p>' +
            '<p class="ficha-fin">' + fin + '</p>' +
            '<dl class="specs">' +
              specRow('Año', car.year) +
              specRow('Kilómetros', km(car.km)) +
              specRow('Combustible', car.fuel) +
              specRow('Cambio', car.gear) +
              specRow('Potencia', car.cv ? car.cv + ' CV' : '') +
              specRow('Carrocería', car.body) +
              specRow('Plazas', car.seats) +
              specRow('Puertas', car.doors) +
              specRow('Tracción', car.traction) +
              specRow('Etiqueta DGT', car.label) +
              specRow('Emisiones CO₂', car.co2 ? car.co2 + ' g/km' : '') +
              specRow('0–100 km/h', car.accel ? car.accel + ' s' : '') +
            '</dl>' +
            '<div class="ficha-cta">' +
              '<a class="btn" href="https://wa.me/34641516102?text=' + msg + '" target="_blank" rel="noopener"><span>Preguntar por este coche<span class="sr-only"> (se abre WhatsApp en una ventana nueva)</span></span></a>' +
              '<a class="btn-ghost" href="tel:+34641516102">Llamar al 641 51 61 02</a>' +
            '</div>' +
            '<p class="ficha-legal">Precio de venta al público. Financiación sujeta a estudio y aprobación de la entidad financiera. Vehículo en València, con entrega en toda España.</p>' +
          '</div>' +
        '</div>';
    }

    function paintPhoto() {
      var img = el('gal-img');
      if (!img) return;
      img.src = 'img/cars-lg/' + car.imgs[idx];
      img.alt = car.brand + ' ' + car.model + ' ' + car.version + ', foto ' + (idx + 1);
      var c = el('gal-count');
      if (c) c.textContent = (idx + 1) + ' / ' + car.imgs.length;
      body.querySelectorAll('.thumbs button').forEach(function (b, i) {
        b.setAttribute('aria-current', String(i === idx));
      });
    }
    function go(step) {
      idx = (idx + step + car.imgs.length) % car.imgs.length;
      paintPhoto();
    }

    function openFicha(id) {
      car = CARS.filter(function (c) { return c.id === id; })[0];
      if (!car) return;
      idx = 0;
      last = document.activeElement;
      if (!last || last === document.body) last = document.querySelector('.card-open[data-id="' + id + '"]');
      body.innerHTML = html();
      wrap.hidden = false;
      document.documentElement.classList.add('modal-open');
      outside.forEach(function (n) { if (n) n.inert = true; });
      open = true;
      box.focus();
    }
    function closeFicha() {
      if (!open) return;
      open = false;
      wrap.hidden = true;
      document.documentElement.classList.remove('modal-open');
      outside.forEach(function (n) { if (n) n.inert = false; });
      var back = (last && last.focus && last.isConnected) ? last
               : document.querySelector('.card-open[data-id="' + (car ? car.id : '') + '"]');
      body.innerHTML = '';
      if (back && back.focus) back.focus();
    }

    document.addEventListener('click', function (e) {
      var opener = e.target.closest('.card-open');
      if (opener) { openFicha(opener.dataset.id); return; }
      if (!open) return;
      if (e.target.closest('[data-close]')) { closeFicha(); return; }
      if (e.target.closest('.gal-prev')) { go(-1); return; }
      if (e.target.closest('.gal-next')) { go(1); return; }
      var th = e.target.closest('.thumbs button');
      if (th) { idx = parseInt(th.dataset.i, 10); paintPhoto(); }
    });

    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); closeFicha(); return; }
      if (e.key === 'ArrowLeft' && car.imgs.length > 1)  { go(-1); return; }
      if (e.key === 'ArrowRight' && car.imgs.length > 1) { go(1); return; }
      if (e.key !== 'Tab') return;
      var list = Array.prototype.slice.call(box.querySelectorAll(FOCUS));
      if (!list.length) return;
      var first = list[0], lastEl = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) {
        e.preventDefault(); lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); first.focus();
      }
    });
  })();

  /* ---------------------------------------------------------
     5b. Entrada de las secciones al hacer scroll
     El estado visible es el de base en CSS: si esto no corre, se ve todo.
     --------------------------------------------------------- */
  (function reveal() {
    if (reduceMQ.matches || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('js');
    var targets = document.querySelectorAll('.sec-head, .filters, .feats li, .split-txt, .split-img, .revs li, .faq-side, .faq-list, .foot-grid');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    Array.prototype.forEach.call(targets, function (t, i) {
      t.classList.add('reveal');
      t.style.transitionDelay = Math.min(i % 4, 3) * 70 + 'ms';
      io.observe(t);
    });
    // nada puede quedarse invisible: red de seguridad
    setTimeout(function () {
      document.querySelectorAll('.reveal:not(.is-in)').forEach(function (n) {
        var r = n.getBoundingClientRect();
        if (r.top < window.innerHeight) n.classList.add('is-in');
      });
    }, 1200);
  })();

  /* ---------------------------------------------------------
     6. Detalles finales
     --------------------------------------------------------- */
  var y = el('year');
  if (y) y.textContent = new Date().getFullYear();

  // enlaces internos: llevar también el foco a la sección destino
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]:not(.skip):not([href="#"])');
    if (!a || a.closest('#site-menu')) return;
    var target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    setTimeout(function () { target.focus({ preventScroll: true }); }, 80);
  });
})();
