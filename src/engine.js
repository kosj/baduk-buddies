// ===== 바둑 엔진 v2 =====
const EMPTY = 0, BLACK = 1, WHITE = 2, EDGE = 3, PASS = -1;
const KOMI = 6.5;

// ---- 3x3 패턴 (MoGo 계열). X = 둘 차례인 쪽, O = 상대, # = 가장자리, x = X 아님, o = O 아님 ----
const PAT = (() => {
  const src = [
    'XOX...???', 'XO....?.?', 'XO?X..x.?', 'XOO...?.?', '.O.X.....',   // 젖힘, 붙임
    'XO?O.o?o?', 'XO?O.X???', '?X?O.Oooo', 'OX?o.O???',                 // 끊음
    'X.?O.?###', 'OX?X.O###', '?X?x.O###', '?XOx.x###', '?OXX.O###'    // 변
  ];
  const T = new Uint8Array(65536);
  const CH = { X: [1], O: [2], '.': [0], '#': [3], x: [0, 2, 3], o: [0, 1, 3], '?': [0, 1, 2, 3] };
  const NB = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]];
  for (const s of src) {
    for (let t = 0; t < 8; t++) {
      const chars = NB.map(([r, c]) => {
        let rr = r - 1, cc = c - 1;
        for (let k = 0; k < (t & 3); k++) { const tmp = rr; rr = cc; cc = -tmp; }
        if (t & 4) cc = -cc;
        return s[(rr + 1) * 3 + (cc + 1)];
      });
      const rec = (i, idx) => {
        if (i === 8) { T[idx] = 1; return; }
        for (const v of CH[chars[i]]) rec(i + 1, idx | (v << (2 * i)));
      };
      rec(0, 0);
    }
  }
  return T;
})();

const _scratch = {};
function getScratch(len) {
  let s = _scratch[len];
  if (!s) {
    s = _scratch[len] = {
      mark: new Int32Array(len), lmark: new Int32Array(len), mark2: new Int32Array(len),
      stack: new Int32Array(len), stack2: new Int32Array(len),
      gen: 0, gen2: 0, lastLib: -1, libBuf: new Int32Array(4)
    };
  }
  return s;
}

class Board {
  constructor(n) {
    this.n = n; const W = n + 2; this.W = W; this.len = W * W;
    this.c = new Uint8Array(this.len);
    this.empties = new Int32Array(n * n);
    this.eIdx = new Int32Array(this.len).fill(-1);
    this.nE = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (x === 0 || y === 0 || x === W - 1 || y === W - 1) this.c[p] = EDGE;
      else { this.eIdx[p] = this.nE; this.empties[this.nE++] = p; }
    }
    this.D = [-1, 1, -W, W];
    this.X = [-W - 1, -W + 1, W - 1, W + 1];
    this.N8 = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
    this.S = getScratch(this.len);
    this.buf = new Int32Array(16);
    this.ko = -1; this.turn = BLACK; this.passes = 0; this.last = PASS;
    this.caps = [0, 0, 0]; this.moveNum = 0;
  }
  copyFrom(b) {
    this.c.set(b.c); this.empties.set(b.empties); this.eIdx.set(b.eIdx);
    this.nE = b.nE; this.ko = b.ko; this.turn = b.turn; this.passes = b.passes;
    this.last = b.last; this.caps[1] = b.caps[1]; this.caps[2] = b.caps[2];
    this.moveNum = b.moveNum;
    return this;
  }
  clone() { return new Board(this.n).copyFrom(this); }
  toState() {
    return { n: this.n, c: Array.from(this.c), ko: this.ko, turn: this.turn, passes: this.passes, last: this.last, caps: [0, this.caps[1], this.caps[2]], moveNum: this.moveNum };
  }
  static fromState(st) {
    const b = new Board(st.n);
    b.c.set(st.c); b.nE = 0; b.eIdx.fill(-1);
    for (let p = 0; p < b.len; p++) if (b.c[p] === EMPTY) { b.eIdx[p] = b.nE; b.empties[b.nE++] = p; }
    b.ko = st.ko; b.turn = st.turn; b.passes = st.passes; b.last = st.last;
    b.caps[1] = st.caps[1]; b.caps[2] = st.caps[2]; b.moveNum = st.moveNum;
    return b;
  }
  pt(x, y) { return (y + 1) * this.W + (x + 1); }
  xOf(p) { return (p % this.W) - 1; }
  yOf(p) { return ((p / this.W) | 0) - 1; }

  addE(p) { this.eIdx[p] = this.nE; this.empties[this.nE++] = p; }
  remE(p) {
    const i = this.eIdx[p], lastP = this.empties[--this.nE];
    this.empties[i] = lastP; this.eIdx[lastP] = i; this.eIdx[p] = -1;
  }

  // 그룹의 활로 수 (max에서 멈춤). 찾은 활로는 S.libBuf, 마지막 활로는 S.lastLib.
  libs(p, max) {
    const S = this.S, c = this.c, D = this.D, mark = S.mark, lmark = S.lmark, st = S.stack, lb = S.libBuf;
    let g = ++S.gen;
    if (g > 2000000000) { mark.fill(0); lmark.fill(0); S.gen = g = 1; }
    const col = c[p]; let sp = 0, n = 0;
    st[sp++] = p; mark[p] = g;
    while (sp > 0) {
      const q = st[--sp];
      for (let d = 0; d < 4; d++) {
        const r = q + D[d], v = c[r];
        if (v === EMPTY) {
          if (lmark[r] !== g) { lmark[r] = g; if (n < 4) lb[n] = r; n++; S.lastLib = r; if (n >= max) return n; }
        } else if (v === col && mark[r] !== g) { mark[r] = g; st[sp++] = r; }
      }
    }
    return n;
  }
  groupSize(p) {
    const S = this.S, c = this.c, D = this.D, mark = S.mark, st = S.stack;
    const g = ++S.gen, col = c[p]; let sp = 0, n = 0;
    st[sp++] = p; mark[p] = g;
    while (sp > 0) {
      const q = st[--sp]; n++;
      for (let d = 0; d < 4; d++) {
        const r = q + D[d];
        if (c[r] === col && mark[r] !== g) { mark[r] = g; st[sp++] = r; }
      }
    }
    return n;
  }
  groupStones(p) {
    const c = this.c, D = this.D, col = c[p], seen = new Uint8Array(this.len), out = [p];
    seen[p] = 1;
    for (let i = 0; i < out.length; i++) {
      const q = out[i];
      for (let d = 0; d < 4; d++) { const r = q + D[d]; if (c[r] === col && !seen[r]) { seen[r] = 1; out.push(r); } }
    }
    return out;
  }
  removeGroup(p) {
    const c = this.c, D = this.D, st = this.S.stack2, col = c[p];
    let sp = 0, k = 1;
    c[p] = EMPTY; this.addE(p); st[sp++] = p;
    while (sp > 0) {
      const q = st[--sp];
      for (let d = 0; d < 4; d++) {
        const r = q + D[d];
        if (c[r] === col) { c[r] = EMPTY; this.addE(r); st[sp++] = r; k++; }
      }
    }
    return k;
  }
  // 단수인 그룹 p와 맞닿은 상대(o) 그룹 중 단수인 것이 있으면 그 활로(따내는 자리)
  counterCapture(p, o) {
    const S = this.S, c = this.c, D = this.D, m2 = S.mark2, st = S.stack2;
    let g = ++S.gen2;
    if (g > 2000000000) { m2.fill(0); S.gen2 = g = 1; }
    const col = c[p]; let sp = 0;
    st[sp++] = p; m2[p] = g;
    while (sp > 0) {
      const q = st[--sp];
      for (let d = 0; d < 4; d++) {
        const r = q + D[d], v = c[r];
        if (v === col) { if (m2[r] !== g) { m2[r] = g; st[sp++] = r; } }
        else if (v === o && m2[r] !== g) { m2[r] = g; if (this.libs(r, 2) === 1) return S.lastLib; }
      }
    }
    return -1;
  }

  // 0: 가능, 1: 이미 돌, 2: 패, 3: 자충(착수금지)
  legality(p, col) {
    if (this.c[p] !== EMPTY) return 1;
    if (p === this.ko) return 2;
    return this.suicide(p, col) ? 3 : 0;
  }
  suicide(p, col) {
    const c = this.c, D = this.D, o = 3 - col;
    for (let d = 0; d < 4; d++) if (c[p + D[d]] === EMPTY) return false;
    for (let d = 0; d < 4; d++) {
      const r = p + D[d], v = c[r];
      if (v === col) { if (this.libs(r, 2) >= 2) return false; }
      else if (v === o) { if (this.libs(r, 2) === 1) return false; }
    }
    return true;
  }
  isLegal(p, col) {
    return this.c[p] === EMPTY && p !== this.ko && !this.suicide(p, col);
  }
  isEye(p, col) {
    const c = this.c, D = this.D, X = this.X;
    for (let d = 0; d < 4; d++) { const v = c[p + D[d]]; if (v !== col && v !== EDGE) return false; }
    let bad = 0, edge = 0; const o = 3 - col;
    for (let d = 0; d < 4; d++) { const v = c[p + X[d]]; if (v === EDGE) edge = 1; else if (v === o) bad++; }
    return bad + edge < 2;
  }
  libsAfter(p, col, max) {
    this.c[p] = col; const n = this.libs(p, max); this.c[p] = EMPTY; return n;
  }
  // 두면 바로 단수가 되고 아무것도 못 따내는 수
  selfAtari(p, col) {
    const c = this.c, D = this.D, o = 3 - col;
    let e = 0;
    for (let d = 0; d < 4; d++) if (c[p + D[d]] === EMPTY) e++;
    if (e >= 2) return false;
    for (let d = 0; d < 4; d++) { const r = p + D[d]; if (c[r] === o && this.libs(r, 2) === 1) return false; }
    return this.libsAfter(p, col, 2) < 2;
  }
  hasFriend(p, col) {
    const c = this.c, D = this.D;
    for (let d = 0; d < 4; d++) if (c[p + D[d]] === col) return true;
    return false;
  }
  patIndex(p, col) {
    const c = this.c, N8 = this.N8; let idx = 0;
    for (let i = 0; i < 8; i++) {
      let v = c[p + N8[i]];
      if (v === BLACK || v === WHITE) v = v === col ? 1 : 2;
      idx |= v << (2 * i);
    }
    return idx;
  }
  captureSizeAt(p, col) {
    const c = this.c, D = this.D, o = 3 - col; let total = 0; const roots = [];
    for (let d = 0; d < 4; d++) {
      const r = p + D[d];
      if (c[r] === o && this.libs(r, 2) === 1) {
        let dup = false;
        for (const s of roots) if (this.groupStones(s).indexOf(r) >= 0) { dup = true; break; }
        if (!dup) { roots.push(r); total += this.groupSize(r); }
      }
    }
    return total;
  }

  play(p, col) {
    const c = this.c, D = this.D, o = 3 - col;
    c[p] = col; this.remE(p);
    let captured = 0, capPos = -1;
    for (let d = 0; d < 4; d++) {
      const r = p + D[d];
      if (c[r] === o && this.libs(r, 1) === 0) { captured += this.removeGroup(r); capPos = r; }
    }
    this.ko = -1;
    if (captured === 1) {
      let single = true;
      for (let d = 0; d < 4; d++) if (c[p + D[d]] === col) { single = false; break; }
      if (single && this.libs(p, 2) === 1) this.ko = capPos;
    }
    this.caps[col] += captured;
    this.last = p; this.turn = o; this.passes = 0; this.moveNum++;
    return captured;
  }
  pass() {
    this.ko = -1; this.last = PASS; this.turn = 3 - this.turn; this.passes++; this.moveNum++;
  }

  // ---- 플레이아웃 정책 ----
  // 직전 수 주변의 단수: 따내기 / 내 돌 살리기(되따내기, 뻗기)
  atariMove(col, L) {
    const c = this.c, D = this.D, o = 3 - col, S = this.S, buf = this.buf; let k = 0;
    if (c[L] === o && this.libs(L, 2) === 1) {
      const lib = S.lastLib;
      if (this.isLegal(lib, col)) return lib;
    }
    for (let d = 0; d < 4; d++) {
      const r = L + D[d];
      if (c[r] !== col || this.libs(r, 2) !== 1) continue;
      const lib = S.lastLib;
      const cc = this.counterCapture(r, o);
      if (cc >= 0 && this.isLegal(cc, col)) buf[k++] = cc;
      if (this.isLegal(lib, col)) {
        const la = this.libsAfter(lib, col, 3);
        if (la >= 3 || (la === 2 && Math.random() < 0.35)) buf[k++] = lib;
      }
    }
    return k ? buf[(Math.random() * k) | 0] : -1;
  }
  patternMove(col, L) {
    const c = this.c, N8 = this.N8, buf = this.buf; let k = 0;
    for (let i = 0; i < 8; i++) {
      const p = L + N8[i];
      if (c[p] !== EMPTY || !PAT[this.patIndex(p, col)]) continue;
      if (this.isEye(p, col) || !this.isLegal(p, col) || this.selfAtari(p, col)) continue;
      buf[k++] = p;
    }
    return k ? buf[(Math.random() * k) | 0] : -1;
  }
  randomMove(col) {
    const n = this.nE; if (n === 0) return -1;
    const E = this.empties; let i = (Math.random() * n) | 0, fallback = -1;
    for (let k = 0; k < n; k++) {
      const p = E[i]; if (++i === n) i = 0;
      if (this.isEye(p, col) || !this.isLegal(p, col)) continue;
      if (this.selfAtari(p, col)) {
        if (fallback < 0 && !this.hasFriend(p, col)) fallback = p;
        continue;
      }
      return p;
    }
    return fallback >= 0 && Math.random() < 0.5 ? fallback : -1;
  }
  playoutMove(col) {
    const L = this.last;
    if (L >= 0) {
      let m = this.atariMove(col, L);
      if (m >= 0) return m;
      if (Math.random() < 0.9) { m = this.patternMove(col, L); if (m >= 0) return m; }
    }
    return this.randomMove(col);
  }
  playout(amaf, maxMoves) {
    let moves = 0;
    while (moves < maxMoves) {
      const col = this.turn;
      const m = this.playoutMove(col);
      if (m < 0) { this.pass(); if (this.passes >= 2) break; }
      else { this.play(m, col); if (amaf !== null && amaf[m] === 0) amaf[m] = col; }
      moves++;
    }
  }
  areaScore() {
    const c = this.c, D = this.D, n = this.n, W = this.W; let s = 0;
    for (let y = 1; y <= n; y++) for (let x = 1; x <= n; x++) {
      const p = y * W + x, v = c[p];
      if (v === BLACK) s++; else if (v === WHITE) s--;
      else {
        let b = 0, w = 0;
        for (let d = 0; d < 4; d++) { const v2 = c[p + D[d]]; if (v2 === BLACK) b = 1; else if (v2 === WHITE) w = 1; }
        if (b && !w) s++; else if (w && !b) s--;
      }
    }
    return s;
  }
  addOwnership(acc) {
    const c = this.c, D = this.D, n = this.n, W = this.W;
    for (let y = 1; y <= n; y++) for (let x = 1; x <= n; x++) {
      const p = y * W + x, v = c[p];
      if (v === BLACK) acc[p] += 1; else if (v === WHITE) acc[p] -= 1;
      else {
        let b = 0, w = 0;
        for (let d = 0; d < 4; d++) { const v2 = c[p + D[d]]; if (v2 === BLACK) b = 1; else if (v2 === WHITE) w = 1; }
        if (b && !w) acc[p] += 1; else if (w && !b) acc[p] -= 1;
      }
    }
  }
  lineOf(p) { const x = this.xOf(p), y = this.yOf(p), m = this.n - 1; return Math.min(x, y, m - x, m - y); }
  nearStones(p, dist) {
    const x0 = this.xOf(p), y0 = this.yOf(p), n = this.n;
    for (let y = Math.max(0, y0 - dist); y <= Math.min(n - 1, y0 + dist); y++)
      for (let x = Math.max(0, x0 - dist); x <= Math.min(n - 1, x0 + dist); x++) {
        const v = this.c[this.pt(x, y)]; if (v === BLACK || v === WHITE) return true;
      }
    return false;
  }
}

// ---- 축(사다리) 읽기 ----
const _lpool = {};
function lpool(n, i) {
  const a = _lpool[n] || (_lpool[n] = []);
  while (a.length <= i) a.push(new Board(n));
  return a[i];
}
// 단수 상태인 그룹 p (그 쪽이 둘 차례)가 도망칠 수 있는지
function ladderEscapes(b, p, depth, ctr) {
  if (--ctr.n < 0 || depth > 60) return true;
  const def = b.c[p], att = 3 - def;
  if (b.libs(p, 2) !== 1) return true;
  const lib = b.S.lastLib;
  const cc = b.counterCapture(p, att);
  if (cc >= 0 && b.isLegal(cc, def)) return true;
  if (!b.isLegal(lib, def)) return false;
  const nb = lpool(b.n, depth * 2); nb.copyFrom(b); nb.play(lib, def);
  const l = nb.libs(lib, 3);
  if (l >= 3) return true;
  if (l <= 1) return false;
  const a1 = nb.S.libBuf[0], a2 = nb.S.libBuf[1];
  const ab = lpool(b.n, depth * 2 + 1);
  for (const a of [a1, a2]) {
    if (!nb.isLegal(a, att)) continue;
    ab.copyFrom(nb); ab.play(a, att);
    if (ab.c[lib] !== def || ab.libs(lib, 2) !== 1) continue;
    if (!ladderEscapes(ab, lib, depth + 1, ctr)) return false;
  }
  return true;
}
// p에 두어 상대 그룹 g를 단수치면 축으로 잡히는가
function ladderCaptures(b, p, col, g) {
  const nb = lpool(b.n, 0); nb.copyFrom(b); nb.play(p, col);
  if (nb.c[g] !== 3 - col || nb.libs(g, 2) !== 1) return false;
  if (nb.libs(p, 2) < 2) return false;
  return !ladderEscapes(nb, g, 1, { n: 160 });
}
// 단수 걸린 내 돌을 p로 뻗어도 축으로 잡히는가
function ladderAfterExtend(b, p, col) {
  const o = 3 - col;
  const nb = lpool(b.n, 0); nb.copyFrom(b); nb.play(p, col);
  const l = nb.libs(p, 3);
  if (l >= 3) return false;
  if (l <= 1) return true;
  const a1 = nb.S.libBuf[0], a2 = nb.S.libBuf[1];
  const ab = lpool(b.n, 1);
  for (const a of [a1, a2]) {
    if (!nb.isLegal(a, o)) continue;
    ab.copyFrom(nb); ab.play(a, o);
    if (ab.c[p] !== col || ab.libs(p, 2) !== 1) continue;
    if (!ladderEscapes(ab, p, 1, { n: 160 })) return true;
  }
  return false;
}

// ---- 계가 ----
function deadFromOwnership(b, own) {
  const dead = new Uint8Array(b.len), seen = new Uint8Array(b.len);
  for (let i = 0; i < b.len; i++) {
    const v = b.c[i];
    if ((v === BLACK || v === WHITE) && !seen[i]) {
      const st = b.groupStones(i); let sum = 0;
      for (const s of st) { seen[s] = 1; sum += own[s]; }
      const avg = (sum / st.length) * (v === BLACK ? 1 : -1);
      if (avg < -0.3) for (const s of st) dead[s] = 1;
    }
  }
  return dead;
}
function finalScore(b, dead, komi) {
  const c = b.c, D = b.D, len = b.len;
  const terr = new Uint8Array(len), seen = new Uint8Array(len);
  let bS = 0, wS = 0, bT = 0, wT = 0;
  const alive = (p) => { const v = c[p]; return (v === BLACK || v === WHITE) && !dead[p] ? v : 0; };
  for (let p = 0; p < len; p++) {
    if (c[p] === EDGE) continue;
    const a = alive(p);
    if (a === BLACK) { bS++; continue; }
    if (a === WHITE) { wS++; continue; }
    if (seen[p]) continue;
    const region = [p]; seen[p] = 1; let tb = 0, tw = 0;
    for (let i = 0; i < region.length; i++) {
      const q = region[i];
      for (let d = 0; d < 4; d++) {
        const r = q + D[d];
        if (c[r] === EDGE) continue;
        const ar = alive(r);
        if (ar === BLACK) tb = 1; else if (ar === WHITE) tw = 1;
        else if (!seen[r]) { seen[r] = 1; region.push(r); }
      }
    }
    const owner = tb && !tw ? BLACK : (tw && !tb ? WHITE : 0);
    for (const q of region) terr[q] = owner;
    if (owner === BLACK) bT += region.length; else if (owner === WHITE) wT += region.length;
  }
  const black = bS + bT, white = wS + wT + komi;
  return { bS, wS, bT, wT, black, white, komi, diff: black - white, terr };
}

// ---- 비동기 도우미 ----
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const yieldUI = () => new Promise(r => setTimeout(r, 0));

async function estimateOwnership(board, sims, timeMs, cancel) {
  const n = board.n, own = new Float32Array(board.len), sim = new Board(n);
  const t0 = nowMs(); let k = 0; const maxMoves = n * n * 3;
  while (k < sims) {
    const tc = nowMs();
    while (k < sims && nowMs() - tc < 24) {
      sim.copyFrom(board); sim.playout(null, maxMoves); sim.addOwnership(own); k++;
    }
    if (nowMs() - t0 > timeMs || (cancel && cancel())) break;
    await yieldUI();
  }
  if (k > 0) for (let i = 0; i < own.length; i++) own[i] /= k;
  return own;
}
function countUnsettled(b, own, th) {
  let u = 0;
  for (let i = 0; i < b.nE; i++) if (Math.abs(own[b.empties[i]]) < th) u++;
  return u;
}

// ---- 하: 휴리스틱 ----
function easyMove(b) {
  const col = b.turn, n = b.n, L = b.last;
  const cands = [], saves = [], weights = [];
  let bestCap = -1, bestCapSize = 0, total = 0;
  const empty = b.nE === n * n;
  for (let i = 0; i < b.nE; i++) {
    const p = b.empties[i];
    if (b.isEye(p, col) || !b.isLegal(p, col)) continue;
    const cap = b.captureSizeAt(p, col);
    if (cap > bestCapSize) { bestCapSize = cap; bestCap = p; }
    let inAtari = false;
    for (let d = 0; d < 4; d++) { const r = p + b.D[d]; if (b.c[r] === col && b.libs(r, 2) === 1) inAtari = true; }
    const la = b.libsAfter(p, col, 3);
    if (inAtari && la >= 2) saves.push(p);
    const line = b.lineOf(p), near = b.nearStones(p, 2);
    let w = 1;
    if (near) w = 5;
    else if (line === 0) w = 0.1;
    else if (line === 1) w = 0.4;
    else if (empty || line <= 3) w = 2.5;
    if (L >= 0 && Math.abs(b.xOf(p) - b.xOf(L)) <= 1 && Math.abs(b.yOf(p) - b.yOf(L)) <= 1 && PAT[b.patIndex(p, col)]) w *= 3;
    if (cap === 0 && b.selfAtari(p, col)) w *= 0.05;
    cands.push(p); weights.push(w); total += w;
  }
  if (cands.length === 0) return PASS;
  if (bestCap >= 0 && Math.random() < 0.7) return bestCap;
  if (saves.length && Math.random() < 0.6) return saves[(Math.random() * saves.length) | 0];
  let r = Math.random() * total;
  for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r <= 0) return cands[i]; }
  return cands[cands.length - 1];
}

// ---- 중/상: MCTS + RAVE ----
class Node {
  constructor(move, color) {
    this.move = move; this.color = color;
    this.n = 0; this.w = 0; this.v = 0; this.rn = 0; this.rw = 0; this.kids = null;
  }
}
function setPrior(b, p, col, k) {
  const c = b.c, D = b.D, o = 3 - col, n = b.n;
  let pn = 8, pw = 4;
  let capture = 0, saveAtari = false; const ataris = [];
  for (let d = 0; d < 4; d++) {
    const r = p + D[d], v = c[r];
    if (v === o) {
      const l = b.libs(r, 3);
      if (l === 1) capture += b.groupSize(r);
      else if (l === 2 && ataris.length < 2) ataris.push(r);
    } else if (v === col) {
      if (b.libs(r, 2) === 1) saveAtari = true;
    }
  }
  const selfAt = capture === 0 && b.selfAtari(p, col);
  if (capture > 0) { const bonus = 10 + Math.min(capture, 8) * 3; pn += bonus; pw += bonus; }
  if (saveAtari && !selfAt) {
    if (ladderAfterExtend(b, p, col)) pn += 20;   // 뻗어도 축으로 잡힘
    else { pn += 12; pw += 11; }
  }
  if (selfAt) pn += b.hasFriend(p, col) ? 30 : 12;
  else if (ataris.length) {
    let lad = false;
    for (const g of ataris) if (ladderCaptures(b, p, col, g)) { lad = true; break; }
    if (lad) { pn += 14; pw += 13; } else { pn += 3; pw += 2; }
  }
  const L = b.last;
  if (L >= 0) {
    const dx = Math.abs(b.xOf(p) - b.xOf(L)), dy = Math.abs(b.yOf(p) - b.yOf(L));
    if (dx <= 1 && dy <= 1 && PAT[b.patIndex(p, col)] && !selfAt) { pn += 6; pw += 5; }
    else if (dx <= 2 && dy <= 2) { pn += 4; pw += 3; }
  }
  const line = b.lineOf(p);
  if (!b.nearStones(p, 2)) {
    if (line === 0) pn += 14;
    else if (line === 1) { pn += 8; pw += 1; }
    else if (line <= 3) { pn += 6; pw += 5.5; }
    else if (n >= 19) { pn += 4; pw += 2.5; }
    else { pn += 4; pw += 3.5; }
  } else if (line === 0 && !b.nearStones(p, 1)) { pn += 4; pw += 1; }
  k.n = pn; k.w = pw;
}
function expand(node, b) {
  const col = b.turn, kids = [];
  for (let i = 0; i < b.nE; i++) {
    const p = b.empties[i];
    if (b.isEye(p, col) || !b.isLegal(p, col)) continue;
    const k = new Node(p, col);
    setPrior(b, p, col, k);
    kids.push(k);
  }
  node.kids = kids;
}
function selectChild(node, Kr, C) {
  const kids = node.kids; let best = kids[0], bv = -1e9;
  const logN = Math.log(node.v + 1);
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    let val = k.w / k.n;
    if (k.rn > 0) { const beta = k.rn / (k.rn + k.n + k.rn * k.n / Kr); val = (1 - beta) * val + beta * (k.rw / k.rn); }
    if (C > 0) val += C * Math.sqrt(logN / (k.v + 1));
    if (val > bv) { bv = val; best = k; }
  }
  return best;
}
// 한 번의 탐색. 합치기 쉬운 원자료(뿌리 자식 통계, 소유권 합계)를 돌려준다.
async function mcts(rootBoard, opts) {
  const { timeMs = 1000, maxSims = 1e9, komi = KOMI, cancel = null, Kr = 2000, C = 0.1, expandAt = 2 } = opts;
  const n = rootBoard.n, len = rootBoard.len;
  const root = new Node(PASS, 3 - rootBoard.turn);
  expand(root, rootBoard);
  const own = new Float32Array(len);
  if (root.kids.length === 0) return { sims: 0, kids: [], own };
  const sim = new Board(n), amaf = new Uint8Array(len);
  const path = new Array(n * n * 4);
  const maxMoves = n * n * 3;
  const t0 = nowMs(); let sims = 0;
  outer:
  while (true) {
    const tc = nowMs();
    while (nowMs() - tc < 30) {
      sim.copyFrom(rootBoard); amaf.fill(0);
      let node = root, depth = 0; path[depth++] = root;
      while (node.kids !== null && node.kids.length > 0) {
        const k = selectChild(node, Kr, C);
        sim.play(k.move, k.color);
        if (amaf[k.move] === 0) amaf[k.move] = k.color;
        node = k; path[depth++] = k;
      }
      if (node.kids === null && node.v >= expandAt) {
        expand(node, sim);
        if (node.kids.length > 0) {
          const k = selectChild(node, Kr, C);
          sim.play(k.move, k.color);
          if (amaf[k.move] === 0) amaf[k.move] = k.color;
          node = k; path[depth++] = k;
        }
      }
      sim.playout(amaf, maxMoves);
      const winner = sim.areaScore() - komi > 0 ? BLACK : WHITE;
      sim.addOwnership(own);
      for (let i = 0; i < depth; i++) {
        const nd = path[i];
        nd.v++; nd.n++; if (nd.color === winner) nd.w++;
        const kids = nd.kids;
        if (kids !== null) for (let j = 0; j < kids.length; j++) {
          const k = kids[j];
          if (amaf[k.move] === k.color) { k.rn++; if (k.color === winner) k.rw++; }
        }
      }
      sims++;
      if (sims >= maxSims) break outer;
    }
    const el = nowMs() - t0;
    if (el >= timeMs || (cancel && cancel())) break;
    if (sims > 800) {
      const remain = (sims / el) * (timeMs - el);
      let a = 0, b2 = 0;
      for (const k of root.kids) { if (k.v > a) { b2 = a; a = k.v; } else if (k.v > b2) b2 = k.v; }
      if (a - b2 > remain * 1.2) break;
    }
    await yieldUI();
  }
  return { sims, kids: root.kids.map(k => ({ move: k.move, v: k.v, w: k.w, n: k.n })), own };
}
// 여러 탐색 결과(병렬 워커)를 합쳐 최종 수를 고른다
function finalizeSearch(results, len) {
  const map = new Map(); let sims = 0; const own = new Float32Array(len);
  for (const r of results) {
    sims += r.sims;
    const o = r.own; for (let i = 0; i < len; i++) own[i] += o[i];
    for (const k of r.kids) {
      const e = map.get(k.move);
      if (e) { e.v += k.v; e.w += k.w; e.n += k.n; } else map.set(k.move, { move: k.move, v: k.v, w: k.w, n: k.n });
    }
  }
  if (map.size === 0) return { move: PASS, winrate: 0.5, sims, own: null, top: [] };
  if (sims > 0) for (let i = 0; i < len; i++) own[i] /= sims;
  const kids = [...map.values()].sort((a, b) => b.v - a.v || b.w / b.n - a.w / a.n);
  return { move: kids[0].move, winrate: kids[0].w / kids[0].n, sims, own, top: kids.slice(0, 5).map(k => ({ move: k.move, v: k.v, wr: k.w / k.n })) };
}
async function localSearch(board, opts) {
  const r = await mcts(board, opts);
  return finalizeSearch([r], board.len);
}

const LEVELS = [
  { key: 'easy' },
  { key: 'mid', time: { 9: 800, 13: 1000, 19: 1200 }, sims: { 9: 1200, 13: 1000, 19: 800 } },
  { key: 'hard', time: { 9: 3000, 13: 3500, 19: 4000 }, sims: { 9: 400000, 13: 300000, 19: 200000 } },
  { key: 'pro' }
];

// AI 결정. userPassed: 상대가 방금 패스했는지. search: 병렬 탐색 함수(없으면 이 스레드에서)
async function decideAI(board, level, userPassed, cancel, search) {
  const b = board.clone(), n = b.n, me = b.turn;
  const run = search || localSearch;
  const passSims = n === 9 ? 300 : n === 13 ? 220 : 160;
  if (userPassed) {
    const own = await estimateOwnership(b, passSims, 1500, cancel);
    const sc = finalScore(b, deadFromOwnership(b, own), KOMI);
    const myMargin = me === BLACK ? sc.diff : -sc.diff;
    if (myMargin > 0) return { move: PASS, reason: 'win' };
    if (countUnsettled(b, own, 0.6) === 0) return { move: PASS, reason: 'settled' };
    if (level === 0 && myMargin < -8) return { move: PASS, reason: 'giveup' };
  }
  if (level === 0) {
    const m = easyMove(b);
    if (m === PASS) return { move: PASS, reason: 'nomove' };
    if (b.moveNum > n * n * 0.5) {
      const own = await estimateOwnership(b, Math.round(passSims * 0.6), 600, cancel);
      if (countUnsettled(b, own, 0.7) === 0) return { move: PASS, reason: 'settled' };
    }
    return { move: m };
  }
  const L = LEVELS[level];
  const res = await run(b, { timeMs: L.time[n], maxSims: L.sims[n], komi: KOMI, cancel });
  if (res.move === PASS) return { move: PASS, reason: 'nomove' };
  if (res.winrate < 0.04 && res.sims >= 300 && b.moveNum > n * n * 0.35) return { resign: true, winrate: res.winrate };
  if (res.own && countUnsettled(b, res.own, 0.7) === 0 && Math.abs(res.own[res.move]) > 0.85) return { move: PASS, reason: 'settled' };
  return { move: res.move, winrate: res.winrate, sims: res.sims };
}

if (typeof module !== 'undefined') module.exports = { nowMs, Board, EMPTY, BLACK, WHITE, EDGE, PASS, KOMI, PAT, mcts, localSearch, finalizeSearch, easyMove, decideAI, estimateOwnership, deadFromOwnership, finalScore, countUnsettled, ladderCaptures, ladderAfterExtend, LEVELS };
