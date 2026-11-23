// ===== 공통 연출 =====
window.FX = (() => {
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };

  // 통통 튀기 (점수 그릇 등)
  function bump(el) {
    if (!el) return;
    el.classList.remove('fx-bump'); void el.offsetWidth; el.classList.add('fx-bump');
  }
  // 화면 좌표 (x, y)에서 target 요소까지 포물선으로 날아가기
  function fly(html, x, y, size, target, delay = 0, onLand) {
    if (!target || reduce() || !document.body.animate) { if (onLand) onLand(); return; }
    const t = center(target);
    const d = document.createElement('div');
    d.className = 'fx-fly';
    d.style.cssText = `width:${size}px;height:${size}px;left:${x - size / 2}px;top:${y - size / 2}px`;
    d.innerHTML = html;
    document.body.appendChild(d);
    const dx = t.x - x, dy = t.y - y, lift = Math.min(170, Math.abs(dx) * 0.25 + Math.abs(dy) * 0.15 + 70);
    const anim = d.animate([
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(1.05) rotate(${dx > 0 ? 25 : -25}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.38) rotate(${dx > 0 ? 50 : -50}deg)`, opacity: 0.95 }
    ], { duration: 640, delay, easing: 'cubic-bezier(.4, .1, .5, 1)', fill: 'both' });
    anim.onfinish = () => { d.remove(); bump(target); if (onLand) onLand(); };
  }
  // 위로 떠오르는 글자 (+13 같은)
  function floatText(target, text, cls = '') {
    if (!target || reduce()) return;
    const t = center(target);
    const d = document.createElement('div');
    d.className = 'fx-float ' + cls;
    d.textContent = text;
    d.style.left = t.x + 'px'; d.style.top = (t.y - t.h / 2) + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }
  // 판 가운데 찍히는 도장 배너
  function stamp(container, text, cls = '') {
    if (!container) return;
    container.querySelectorAll('.fx-stamp').forEach((s) => s.remove());
    const s = document.createElement('div');
    s.className = 'fx-stamp ' + cls;
    s.textContent = text;
    container.appendChild(s);
    setTimeout(() => s.remove(), reduce() ? 900 : 1500);
  }
  // 바둑판 위 착수 물결
  function ripple(svgLayer, x, y, r) {
    if (!svgLayer || reduce()) return;
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r);
    c.setAttribute('class', 'fx-ripple');
    svgLayer.appendChild(c);
    setTimeout(() => c.remove(), 650);
  }
  // 캐릭터 반응: happy, sad, cheer / think(on/off)
  function react(avatar, kind, on) {
    if (!avatar) return;
    if (kind === 'think') { avatar.classList.toggle('r-think', !!on); return; }
    avatar.classList.remove('r-think', 'r-happy', 'r-sad', 'r-cheer');
    void avatar.offsetWidth;
    avatar.classList.add('r-' + kind);
    clearTimeout(avatar._rt);
    avatar._rt = setTimeout(() => avatar.classList.remove('r-' + kind), kind === 'cheer' ? 2400 : 900);
  }
  // 짧은 진동 (지원하는 휴대폰만)
  function haptic(ms = 12) {
    try { if (window.Buddies && window.Buddies.Sound && !window.Buddies.Sound.on) return; if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 무시 */ }
  }
  // 꽃가루
  function confetti() {
    if (reduce()) return;
    const cv = document.createElement('canvas');
    cv.className = 'fx-confetti';
    document.body.appendChild(cv);
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const colors = ['#2b52dc', '#ffb020', '#e0483c', '#16a36a', '#8a5cf6', '#ff7ab8', '#f2cd8c'];
    const parts = [];
    for (let i = 0; i < 160; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : W + 10, y: H * (0.55 + Math.random() * 0.25),
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7), vy: -(9 + Math.random() * 9),
        w: 6 + Math.random() * 6, h: 9 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35,
        c: colors[i % colors.length], shape: i % 5 === 0 ? 'circle' : 'rect'
      });
    }
    const t0 = performance.now();
    const step = (now) => {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 2200) / 800);
        ctx.fillStyle = p.c;
        if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.7)) + 2);
        ctx.restore();
      }
      if (t < 3000) requestAnimationFrame(step); else cv.remove();
    };
    requestAnimationFrame(step);
  }
  // 숫자 올라가는 애니메이션
  function countUp(el, to, ms = 700, fmt = (v) => String(v)) {
    if (!el) return;
    if (reduce()) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      const v = to * e;
      el.textContent = fmt(Number.isInteger(to) ? Math.round(v) : Math.round(v * 2) / 2);
      if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
    };
    requestAnimationFrame(step);
  }
  // 화면 전환 효과
  function enter(el) { if (!el || reduce()) return; el.classList.remove('fx-enter'); void el.offsetWidth; el.classList.add('fx-enter'); }
  return { bump, fly, floatText, stamp, ripple, react, haptic, confetti, countUp, enter, center };
})();
