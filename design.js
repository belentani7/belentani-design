/* Belentani Design - mejoras progresivas. v1.0 */
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = document.querySelectorAll('.b-reveal');
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el, i) { el.style.transitionDelay = (i % 6) * 70 + 'ms'; io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('is-in'); });
  }
  var nav = document.querySelector('.b-nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-scrolled', scrollY > 8); };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }
  var KEY = 'b-scheme';
  try { var saved = localStorage.getItem(KEY); if (saved) root.dataset.scheme = saved; } catch (e) {}
  Array.prototype.forEach.call(document.querySelectorAll('[data-toggle-scheme]'), function (btn) {
    var sync = function () { btn.setAttribute('aria-pressed', String(root.dataset.scheme === 'light')); };
    sync();
    btn.addEventListener('click', function () {
      var next = root.dataset.scheme === 'light' ? 'dark' : 'light';
      root.dataset.scheme = next;
      try { localStorage.setItem(KEY, next); } catch (e) {}
      sync();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
