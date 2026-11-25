/* Belentani Design - mejoras progresivas. v1.1
   Todo es opcional: sin JavaScript la pagina se lee, se navega y se enlaza.
   Nada de dependencias, nada de red propia. */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  /* --- revelado al hacer scroll ---------------------------------------- */
  var reveal = document.querySelectorAll('.b-reveal');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    each(reveal, function (el, i) {
      el.style.setProperty('--reveal-delay', (i % 6) * 70 + 'ms');
      io.observe(el);
    });
  } else {
    each(reveal, function (el) { el.classList.add('is-in'); });
  }

  /* --- sombra del nav --------------------------------------------------- */
  var nav = document.querySelector('.b-nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }

  /* --- menu movil ------------------------------------------------------- */
  var navToggle = document.querySelector('[data-nav-toggle]');
  if (navToggle && nav) {
    var menu = document.getElementById(navToggle.getAttribute('aria-controls'));
    var wide = matchMedia('(min-width: 44.01rem)');
    var setOpen = function (open) {
      nav.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      if (open && menu) {
        var first = menu.querySelector('a');
        if (first) first.focus();
      }
    };
    navToggle.addEventListener('click', function () {
      setOpen(navToggle.getAttribute('aria-expanded') !== 'true');
    });
    if (menu) {
      each(menu.querySelectorAll('a'), function (link) {
        link.addEventListener('click', function () { setOpen(false); });
      });
    }
    addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || navToggle.getAttribute('aria-expanded') !== 'true') return;
      setOpen(false);
      navToggle.focus();
    });
    var onWide = function (event) { if (event.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else wide.addListener(onWide);
  }

  /* --- esquema claro / oscuro ------------------------------------------ */
  var STORAGE_KEY = 'b-scheme';
  var schemeButtons = document.querySelectorAll('[data-toggle-scheme]');
  var currentScheme = function () {
    return root.dataset.scheme === 'light' ? 'light' : 'dark';
  };
  var syncScheme = function () {
    var light = currentScheme() === 'light';
    var next = light ? 'oscuro' : 'claro';
    each(schemeButtons, function (btn) {
      btn.setAttribute('aria-pressed', String(light));
      btn.setAttribute('aria-label', 'Cambiar al tema ' + next);
    });
  };
  each(schemeButtons, function (btn) {
    btn.addEventListener('click', function () {
      root.dataset.scheme = currentScheme() === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(STORAGE_KEY, root.dataset.scheme); } catch (e) {}
      syncScheme();
    });
  });
  syncScheme();

  /* --- ano del pie ------------------------------------------------------ */
  each(document.querySelectorAll('[data-year]'), function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* --- copiar el ejemplo de adopcion ----------------------------------- */
  each(document.querySelectorAll('[data-copy]'), function (btn) {
    var label = btn.textContent;
    var status = document.querySelector('[data-copy-status]');
    var announce = function (message) {
      if (status) status.textContent = message;
    };
    btn.addEventListener('click', function () {
      var source = document.getElementById(btn.getAttribute('data-copy'));
      if (!source) return;
      var text = source.textContent;
      var done = function (ok) {
        btn.textContent = ok ? 'Copiado' : 'No se pudo';
        announce(ok ? 'Codigo de adopcion copiado al portapapeles.' : 'El navegador bloqueo el portapapeles; selecciona el codigo a mano.');
        setTimeout(function () { btn.textContent = label; }, 2200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        return;
      }
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.className = 'b-visually-hidden';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(area);
      done(ok);
    });
  });

  /* --- formulario de demo: valida de verdad y no envia nada ------------- */
  each(document.querySelectorAll('[data-demo-form]'), function (form) {
    var status = form.querySelector('[data-form-status]');
    var fields = form.querySelectorAll('input, select, textarea');
    var describe = function (field) {
      var label = form.querySelector('label[for="' + field.id + '"]');
      return label ? label.textContent : 'El campo';
    };
    each(fields, function (field) {
      field.addEventListener('input', function () {
        if (field.getAttribute('aria-invalid') !== 'true') return;
        if (field.checkValidity()) field.removeAttribute('aria-invalid');
      });
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var firstInvalid = null;
      each(fields, function (field) {
        var valid = field.checkValidity();
        if (valid) field.removeAttribute('aria-invalid');
        else {
          field.setAttribute('aria-invalid', 'true');
          if (!firstInvalid) firstInvalid = field;
        }
      });
      if (firstInvalid) {
        firstInvalid.focus();
        if (status) {
          status.textContent = describe(firstInvalid) + ': revisa el valor antes de guardar.';
          status.classList.add('is-bad');
          status.classList.remove('is-ok');
        }
        return;
      }
      if (status) {
        status.textContent = 'Validado en el navegador. La demo no envia datos a ningun servidor.';
        status.classList.add('is-ok');
        status.classList.remove('is-bad');
      }
    });
  });
})();
