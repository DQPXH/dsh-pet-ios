/* dsh-pet iOS - animation + interaction layer.
   Frames are pre-baked animated WebP, so nothing here depends on video codecs:
   playback length comes from pet-data.js, which the build step generated. */
(function () {
  'use strict';

  var D = window.PET_DATA || {};
  var CL = D.clips || {};
  var W = D.weights || { idle: 10, turn: 5, move: 5 };
  var CATS = D.categories || [];

  var FRAME_W = 640;
  var FRAME_H = 360;
  var FEET_X = 320;   /* anchor of the pet's feet inside the source frame */
  var FEET_Y = 348;
  var BODY_H = 292;   /* visible pet size inside the frame, for hit testing */
  var BODY_W = 232;

  var wrap = document.getElementById('petWrap');
  var shadow = document.getElementById('shadow');
  var layerA = document.getElementById('layerA');
  var layerB = document.getElementById('layerB');

  var front = layerA;
  var back = layerB;

  var vw = 0, vh = 0, scale = 1, ground = 0, minX = 0, maxX = 0, safeBottom = 0;

  var st = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: Math.random() < 0.5 ? -1 : 1,
    dragging: false,
    dragId: null,
    grabDx: 0,
    grabDy: 0,
    targetX: 0,
    targetY: 0,
    mode: 'chain',
    paused: false,
    animToken: 0,
    endTimer: null,
    walk: null,
    airborne: false
  };

  var raf = null;
  var lastFrame = 0;
  var lastRandom = '';

  /* ---------------- helpers ---------------- */

  function bridge(msg) {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pet) {
        window.webkit.messageHandlers.pet.postMessage(msg);
      }
    } catch (e) {}
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function pick(list) {
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function pickDifferent(list, last) {
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];
    var v = pick(list);
    for (var i = 0; i < 6 && v === last; i++) v = pick(list);
    return v;
  }

  function metaOf(clip) { return clip ? CL[clip] : null; }

  function measureSafeArea() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:0;padding-bottom:env(safe-area-inset-bottom,0px);';
    document.body.appendChild(probe);
    safeBottom = probe.getBoundingClientRect().height || 0;
    probe.remove();
  }

  function layout() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    scale = (vh * 0.46) / FRAME_H;
    ground = vh - safeBottom - 10;
    minX = Math.max(BODY_W * scale * 0.22, 56);
    maxX = vw - minX;
    if (st.x === 0 && st.y === 0) {
      st.x = vw * 0.5;
      st.y = ground;
    }
    st.x = clamp(st.x, minX, maxX);
    if (!st.airborne && !st.dragging) st.y = ground;
    render();
  }

  function render() {
    var w = FRAME_W * scale;
    var h = FRAME_H * scale;
    var left = st.x - FEET_X * scale;
    var top = st.y - FEET_Y * scale;
    var flip = st.facing > 0 ? -1 : 1;
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    wrap.style.transform = 'translate3d(' + left.toFixed(1) + 'px,' + top.toFixed(1) +
      'px,0) scaleX(' + flip + ')';
    var airborne = st.y < ground - 4 || st.dragging;
    shadow.style.width = (BODY_W * 0.55 * scale) + 'px';
    shadow.style.height = (BODY_H * 0.08 * scale) + 'px';
    shadow.style.transform = 'translate3d(' + (st.x - BODY_W * 0.275 * scale).toFixed(1) + 'px,' +
      (ground - BODY_H * 0.04 * scale).toFixed(1) + 'px,0)';
    shadow.style.opacity = airborne ? '0.12' : '0.5';
  }

  /* ---------------- animation playback ---------------- */

  function play(clip, opts) {
    opts = opts || {};
    var meta = metaOf(clip);
    if (!meta) { return false; }
    var token = ++st.animToken;

    if (st.endTimer) { clearTimeout(st.endTimer); st.endTimer = null; }

    var next = back;
    if (next.getAttribute('src') !== meta.src) {
      next.setAttribute('src', meta.src);
    }

    var reveal = function () {
      if (token !== st.animToken) return;
      var old = front;
      next.classList.add('show');
      front = next;
      back = old;
      setTimeout(function () {
        if (token === st.animToken) old.classList.remove('show');
      }, 170);
    };

    if (next.complete && next.naturalWidth) {
      reveal();
    } else if (next.decode) {
      next.decode().then(reveal, reveal);
    } else {
      next.onload = reveal;
    }

    if (!opts.loop) {
      var ms = Math.max(280, (meta.dur || 10) * 1000 - 60);
      st.endTimer = setTimeout(function () {
        st.endTimer = null;
        if (token === st.animToken) onAnimEnd();
      }, ms);
    }
    return true;
  }

  function onAnimEnd() {
    if (st.dragging || st.mode === 'hold') return;
    if (st.walk) { st.walk = null; }
    st.airborne = false;
    st.mode = 'chain';
    scheduleNext(90 + Math.random() * 160);
  }

  function scheduleNext(ms) {
    if (st.endTimer) { clearTimeout(st.endTimer); st.endTimer = null; }
    st.endTimer = setTimeout(function () {
      st.endTimer = null;
      if (st.paused || st.dragging) return;
      if (st.mode !== 'chain') { st.mode = 'chain'; }
      nextAction();
    }, ms || 120);
  }

  /* ---------------- action chain ---------------- */

  function totalWeight() {
    var t = (W.idle || 0) + (W.turn || 0) + (W.move || 0);
    for (var i = 0; i < CATS.length; i++) t += (CATS[i].weight || 0);
    return t;
  }

  function pickKind() {
    var total = totalWeight();
    if (total <= 0) return 'idle';
    var r = Math.random() * total;
    if (r < (W.idle || 0)) return 'idle';
    r -= (W.idle || 0);
    if (r < (W.turn || 0)) return 'turn';
    r -= (W.turn || 0);
    if (r < (W.move || 0)) return 'move';
    return 'category';
  }

  function pickCategory() {
    var total = 0, i;
    for (i = 0; i < CATS.length; i++) total += (CATS[i].weight || 0);
    if (total <= 0) return null;
    var r = Math.random() * total;
    for (i = 0; i < CATS.length; i++) {
      r -= (CATS[i].weight || 0);
      if (r < 0) return CATS[i];
    }
    return CATS[CATS.length - 1] || null;
  }

  function nextAction() {
    if (st.dragging || st.mode === 'hold') return;
    var kind = pickKind();
    if (kind === 'idle') {
      var idle = pick(D.idle || []);
      if (idle && play(idle, {})) return;
      scheduleNext(1400);
      return;
    }
    if (kind === 'turn') {
      var turn = pick(D.turn || []);
      st.facing = -st.facing;
      render();
      if (turn && play(turn, {})) return;
      scheduleNext(600);
      return;
    }
    if (kind === 'move') {
      startMove();
      return;
    }
    var cat = pickCategory();
    if (!cat || !cat.actions || !cat.actions.length) { scheduleNext(400); return; }
    var act = pickDifferent(cat.actions, lastRandom);
    if (!act) { scheduleNext(400); return; }
    lastRandom = act.clip;
    st.mode = 'once';
    if (!play(act.clip, {})) { st.mode = 'chain'; scheduleNext(400); }
  }

  function startMove() {
    var moves = D.moves || [];
    if (!moves.length) { scheduleNext(400); return; }
    var m = pick(moves);
    var dirX = Math.random() < 0.5 ? -1 : 1;
    var dist = m.minDist + Math.random() * Math.max(0, m.maxDist - m.minDist);
    var from = st.x;
    var to = clamp(st.x + dirX * dist, minX, maxX);
    if (Math.abs(to - from) < 12) {
      dirX = -dirX;
      to = clamp(st.x + dirX * dist, minX, maxX);
    }
    st.facing = dirX;
    render();
    var meta = metaOf(m.clip);
    if (!meta) { scheduleNext(400); return; }
    var dur = Math.max(1.2, Math.min(12, meta.dur || 4));
    st.walk = {
      t0: performance.now(),
      from: from,
      to: to,
      lead: (m.leadSec || 2) * 1000,
      tail: (m.tailSec || 2) * 1000,
      dur: dur * 1000
    };
    st.mode = 'move';
    if (!play(m.clip, { loop: true })) {
      st.walk = null;
      st.mode = 'chain';
      scheduleNext(400);
      return;
    }
    /* looped clips never fire an end event, so the walk clock ends them */
    var token = st.animToken;
    st.endTimer = setTimeout(function () {
      st.endTimer = null;
      if (token !== st.animToken) return;
      st.walk = null;
      st.mode = 'chain';
      onAnimEnd();
    }, st.walk.dur);
    ensureTick();
  }

  function advanceWalk(now) {
    var w = st.walk;
    if (!w) return;
    var t = now - w.t0;
    var span = Math.max(200, w.dur - w.lead - w.tail);
    var p = clamp((t - w.lead) / span, 0, 1);
    var e = p * p * (3 - 2 * p);
    st.x = w.from + (w.to - w.from) * e;
  }

  /* ---------------- physics / drag ---------------- */

  function ensureTick() {
    if (raf) return;
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    raf = null;
    var dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    var busy = false;

    if (st.dragging) {
      st.x += (st.targetX - st.x) * Math.min(1, dt * 22);
      st.y += (st.targetY - st.y) * Math.min(1, dt * 22);
      busy = true;
    } else if (st.walk) {
      advanceWalk(now);
      busy = true;
    } else if (st.airborne) {
      st.vy += 1500 * dt;
      st.x += st.vx * dt;
      st.y += st.vy * dt;
      if (st.x < minX) { st.x = minX; st.vx = Math.abs(st.vx) * 0.4; }
      if (st.x > maxX) { st.x = maxX; st.vx = -Math.abs(st.vx) * 0.4; }
      if (st.y >= ground) {
        st.y = ground;
        st.vy = -st.vy * 0.62;
        st.vx *= 0.72;
        if (Math.abs(st.vy) < 130) {
          st.vy = 0;
          st.vx = 0;
          st.airborne = false;
          onLand();
        }
      }
      busy = true;
    }

    render();
    if (busy) raf = requestAnimationFrame(tick);
  }

  function onLand() {
    st.mode = 'chain';
    scheduleNext(120 + Math.random() * 200);
  }

  function hitTest(px, py) {
    var halfW = BODY_W * 0.5 * scale;
    return px >= st.x - halfW && px <= st.x + halfW &&
      py >= st.y - BODY_H * scale && py <= st.y + 6;
  }

  function onDown(e) {
    if (!sheet.hidden) return;
    if (e.target && e.target.closest && e.target.closest('#menuBtn')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!hitTest(e.clientX, e.clientY)) return;
    e.preventDefault();
    st.dragId = e.pointerId;
    st.dragging = true;
    st.mode = 'hold';
    st.airborne = false;
    st.walk = null;
    st.grabDx = e.clientX - st.x;
    st.grabDy = e.clientY - st.y;
    st.targetX = st.x;
    st.targetY = st.y;
    st.downAt = performance.now();
    st.downX = e.clientX;
    st.downY = e.clientY;
    st.moved = 0;
    st.vel = { t: performance.now(), x: e.clientX, y: e.clientY, vx: 0, vy: 0 };
    if (st.endTimer) { clearTimeout(st.endTimer); st.endTimer = null; }
    var dragClip = pick(D.drag || []);
    if (dragClip) play(dragClip, { loop: true });
    bridge('light');
    ensureTick();
  }

  function onMove(e) {
    if (!st.dragging || e.pointerId !== st.dragId) return;
    e.preventDefault();
    st.targetX = clamp(e.clientX - st.grabDx, minX, maxX);
    st.targetY = clamp(e.clientY - st.grabDy, 90, ground);
    st.moved = Math.max(st.moved, Math.hypot(e.clientX - st.downX, e.clientY - st.downY));
    var now = performance.now();
    var dt = (now - st.vel.t) / 1000;
    if (dt > 0.008) {
      st.vel.vx = (e.clientX - st.vel.x) / dt;
      st.vel.vy = (e.clientY - st.vel.y) / dt;
      st.vel.t = now;
      st.vel.x = e.clientX;
      st.vel.y = e.clientY;
    }
    ensureTick();
  }

  function onUp(e) {
    if (!st.dragging || (st.dragId !== null && e.pointerId !== st.dragId)) return;
    st.dragging = false;
    st.dragId = null;
    var quick = performance.now() - st.downAt < 260 && st.moved < 10;
    if (quick) {
      st.mode = 'once';
      var hit = pick(D.clicks || []);
      if (hit) play(hit, {});
      bridge('medium');
      st.x = clamp(st.x, minX, maxX);
      st.y = ground;
      render();
      return;
    }
    st.vx = clamp((st.vel && st.vel.vx) || 0, -2600, 2600) * 0.55;
    st.vy = clamp((st.vel && st.vel.vy) || 0, -2600, 2600) * 0.55;
    st.airborne = true;
    st.y = Math.min(st.y, ground);
    st.mode = 'chain';
    ensureTick();
  }

  /* ---------------- picker sheet ---------------- */

  var sheet = document.getElementById('sheet');
  var sheetList = document.getElementById('sheetList');
  var sheetCount = document.getElementById('sheetCount');
  var menuBtn = document.getElementById('menuBtn');

  function buildSheet() {
    var entries = D.order || [];
    sheetCount.textContent = entries.length + ' 个动作';
    sheetList.innerHTML = '';
    entries.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = item.name;
      b.addEventListener('click', function () {
        sheet.hidden = true;
        st.paused = false;
        st.mode = 'once';
        st.walk = null;
        if (!play(item.clip, {})) scheduleNext(200);
      });
      sheetList.appendChild(b);
    });
  }

  menuBtn.addEventListener('click', function () {
    if (sheet.hidden) {
      st.paused = true;
      sheet.hidden = false;
      sheetList.scrollTop = 0;
    } else {
      sheet.hidden = true;
      st.paused = false;
      scheduleNext(200);
    }
  });

  document.getElementById('sheetClose').addEventListener('click', function () {
    sheet.hidden = true;
    st.paused = false;
    scheduleNext(200);
  });

  /* ---------------- boot ---------------- */

  document.addEventListener('pointerdown', onDown, { passive: false });
  document.addEventListener('pointermove', onMove, { passive: false });
  document.addEventListener('pointerup', onUp, { passive: false });
  document.addEventListener('pointercancel', onUp, { passive: false });

  window.addEventListener('resize', function () { measureSafeArea(); layout(); });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { measureSafeArea(); layout(); }, 260);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      st.paused = true;
      if (st.endTimer) { clearTimeout(st.endTimer); st.endTimer = null; }
    } else {
      if (!sheet.hidden) return;
      st.paused = false;
      st.mode = 'chain';
      scheduleNext(320);
    }
  });

  window.PetApp = {
    trimCaches: function () {
      try { back.removeAttribute('src'); } catch (e) {}
    },
    play: function (clip) { st.mode = 'once'; return play(clip, {}); },
    state: st
  };

  measureSafeArea();
  layout();
  buildSheet();
  setTimeout(function () {
    var first = pick(D.idle || []);
    if (!first || !play(first, {})) scheduleNext(600);
  }, 60);
})();
