/* Gutter Capital — shared behaviour (extracted from the home storyboard).
   Reveal/doodle gate, count-ups, menu overlay, portfolio rail, logo-decode sanity.
   Load with `defer` before </body>. The tiny pre-paint QA-flag script stays INLINE in each page's <head>. */
(function(){
  "use strict";
  var doc = document.documentElement;
  var isStatic = doc.classList.contains('static');
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = mq.matches;

  /* ---------- reveal + doodle machinery FIRST (fragility discipline) ---------- */
  function revealAllNow(){
    document.querySelectorAll('.rv').forEach(function(el){ el.classList.add('in'); });
    document.querySelectorAll('.doodle').forEach(function(el){ el.classList.add('drawn'); });
  }
  window.addEventListener('error', revealAllNow);

  var hasInput = false;
  function onFirst(){ hasInput = true;
    ['pointermove','scroll','keydown','touchstart','wheel'].forEach(function(t){ window.removeEventListener(t, onFirst); });
  }
  ['pointermove','scroll','keydown','touchstart','wheel'].forEach(function(t){ window.addEventListener(t, onFirst, {passive:true, once:false}); });

  if(!isStatic && !reduce){
    requestAnimationFrame(function(){
      doc.classList.add('anim');               /* hidden states apply before first paint */
      requestAnimationFrame(function(){ arm(); });  /* transitions armed next frame */
    });
  }else{
    revealAllNow();
  }

  function arm(){
    /* hero: draw + reveal immediately */
    document.querySelectorAll('.hero .rv, .nav').forEach(function(el){ el.classList.add('in'); });
    var hd = document.getElementById('heroDoodle');
    if(hd) hd.classList.add('drawn');
    document.querySelectorAll('.hero .doodle').forEach(function(d){ d.classList.add('drawn'); });

    var pending = Array.prototype.slice.call(document.querySelectorAll('.rv:not(.in), .doodle:not(.drawn)'));
    function mark(el){
      el.classList.add(el.classList.contains('doodle') ? 'drawn' : 'in');
      if(el.classList.contains('doodle')) el.classList.add('in');
      var i = pending.indexOf(el); if(i>-1) pending.splice(i,1);
    }
    var io = null;
    if('IntersectionObserver' in window){
      io = new IntersectionObserver(function(entries){
        entries.forEach(function(en){ if(en.isIntersecting){ mark(en.target); io.unobserve(en.target); } });
      }, {rootMargin:'0px 0px -8% 0px', threshold:0.05});
      pending.slice().forEach(function(el){ io.observe(el); });
    }
    function sweep(){ /* IO fallback for preview/headless (recurring gotcha) */
      pending.slice().forEach(function(el){
        var r = el.getBoundingClientRect();
        if(r.top < window.innerHeight*0.94 && r.bottom > 0) mark(el);
      });
    }
    window.addEventListener('scroll', sweep, {passive:true});
    window.addEventListener('resize', sweep, {passive:true});
    sweep();

    countUps();
  }

  /* ---------- count-ups (verified numbers only; clamped) ---------- */
  function countUps(){
    var els = document.querySelectorAll('.cnt');
    if(!('IntersectionObserver' in window)) return; /* markup already shows finals */
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting) return;
        io.unobserve(en.target);
        if(!hasInput) return;                 /* headless captures see finals */
        var el = en.target, to = parseInt(el.getAttribute('data-to'),10);
        var t0 = null, dur = 1300;
        function step(ts){
          if(t0===null) t0 = ts;
          var p = Math.min((ts-t0)/dur, 1);   /* CLAMPED — stops at 100% */
          var e = 1 - Math.pow(1-p, 3);
          el.textContent = Math.round(to*e);
          if(p<1) requestAnimationFrame(step); else el.textContent = to;
        }
        requestAnimationFrame(step);
      });
    }, {threshold:0.6});
    els.forEach(function(el){ io.observe(el); });
  }

  /* ---------- menu overlay ---------- */
  var overlay = document.getElementById('overlay');
  var btn = document.getElementById('menuBtn');
  var closeBtn = document.getElementById('menuClose');
  function setMenu(open){
    overlay.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if(open) closeBtn.focus(); else btn.focus();
  }
  btn.addEventListener('click', function(){ setMenu(true); });
  closeBtn.addEventListener('click', function(){ setMenu(false); });
  overlay.addEventListener('click', function(e){ if(e.target.classList.contains('ol-link')) setMenu(false); });
  window.addEventListener('keydown', function(e){ if(e.key==='Escape' && overlay.classList.contains('open')) setMenu(false); });

  /* ---------- masthead: the big centered GUTTER pins + shrinks into a compact bar ----------
     Plain passive scroll listener writing ONE CSS var (--navp, 1→0 over ~260px) — no rAF
     loop, no ticking flag, nothing to wedge. Reduced-motion / ?static=1 get a discrete
     state swap at the halfway point instead of scroll-linked scaling. */
  (function(){
    var nav = document.querySelector('.nav');
    if(!nav) return;
    var RANGE = 260, last = -1;
    function apply(){
      var y = window.scrollY || doc.scrollTop || 0;
      var t = y / RANGE; if(t < 0) t = 0; if(t > 1) t = 1;
      if(reduce || isStatic){ t = t > 0.5 ? 1 : 0; }   /* discrete — no scroll-linked motion */
      else { t = t*t*(3 - 2*t); }                      /* smoothstep ease */
      var p = 1 - t;
      if(p === last) return;
      if(Math.abs(p - last) < 0.003 && p !== 0 && p !== 1) return;
      last = p;
      doc.style.setProperty('--navp', p.toFixed(4));
      doc.classList.toggle('nav-pinned', p < 0.5);
    }
    window.addEventListener('scroll', apply, {passive:true});
    window.addEventListener('resize', apply, {passive:true});
    apply();
  })();

  /* ---------- portfolio rail: drag + inertia + gated drift + counter ---------- */
  (function(){
    var rail = document.getElementById('rail');
    var track = document.getElementById('railTrack');
    var counter = document.getElementById('railCounter');
    if(!rail || !track) return;
    var N = track.children.length;                       /* before duplication */
    if(isStatic){ return; }                              /* native overflow scroll under ?static=1 */
    track.innerHTML += track.innerHTML;                  /* seamless loop set (dupes aria-hidden below) */
    Array.prototype.slice.call(track.children, N).forEach(function(el){
      el.setAttribute('aria-hidden','true'); el.setAttribute('tabindex','-1');
    });
    var x = 0, vel = 0, dragging = false, px = 0, half = 0, hover = false, raf = null;
    function measure(){ half = track.scrollWidth/2; }
    measure(); window.addEventListener('resize', measure, {passive:true});
    function norm(v){ v %= half; if(v<0) v += half; return v; }
    function apply(){
      x = norm(x);
      track.style.transform = 'translate3d(' + (-x) + 'px,0,0)';
      if(counter){
        var idx = Math.floor((x/half)*N) + 1; if(idx>N) idx = N;
        counter.textContent = (idx<10?'0':'') + idx + ' / ' + N;
      }
    }
    function frame(){
      if(!dragging){
        if(Math.abs(vel) > 0.05){ x += vel; vel *= 0.94; }
        else if(hasInput && !hover && !reduce){ x += 0.45; }  /* auto-drift: first-input-gated */
        apply();
      }
      raf = requestAnimationFrame(frame);
    }
    rail.addEventListener('pointerdown', function(e){
      dragging = true; px = e.clientX; vel = 0; rail.classList.add('dragging');
      rail.setPointerCapture(e.pointerId);
    });
    rail.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var dx = e.clientX - px; px = e.clientX; x -= dx; vel = -dx*0.6; apply();
    });
    function endDrag(){ dragging = false; rail.classList.remove('dragging'); }
    rail.addEventListener('pointerup', endDrag);
    rail.addEventListener('pointercancel', endDrag);
    rail.addEventListener('mouseenter', function(){ hover = true; });
    rail.addEventListener('mouseleave', function(){ hover = false; });
    rail.addEventListener('focusin', function(e){
      hover = true;
      var t = e.target.closest('.co'); if(!t) return;
      x = norm(t.offsetLeft - 40); apply();
    });
    rail.addEventListener('focusout', function(){ hover = false; });
    /* keep clicks distinct from drags */
    var downX = 0;
    rail.addEventListener('pointerdown', function(e){ downX = e.clientX; }, true);
    rail.addEventListener('click', function(e){
      if(Math.abs(e.clientX - downX) > 8){ e.preventDefault(); e.stopPropagation(); }
    }, true);
    apply();
    if(!reduce) raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', function(){
      if(document.hidden && raf){ cancelAnimationFrame(raf); raf = null; }
      else if(!document.hidden && !raf && !reduce){ raf = requestAnimationFrame(frame); }
    });
  })();

  /* ---------- logo sanity: every chip img must decode (real bytes shipped) ---------- */
  window.addEventListener('load', function(){
    document.querySelectorAll('.chip img').forEach(function(img){
      if(img.complete && img.naturalWidth === 0){ img.closest('.chip').style.display = 'none'; }
    });
  });
})();
