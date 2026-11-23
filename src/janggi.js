// ===== 장기 엔진 =====
// 판: 길이 90 배열, 칸 = y*9 + x (y 0 = 위쪽 한 진영, y 9 = 아래쪽 초 진영)
// 기물: 초는 양수, 한은 음수. 1 궁, 2 사, 3 상, 4 마, 5 차, 6 포, 7 졸(병)
const JanggiEngine = (() => {
  const K = 1, A = 2, E = 3, H = 4, R = 5, C = 6, P = 7;
  const CHO = 1, HAN = -1, PASS = -1;
  const VAL = [0, 0, 300, 300, 500, 1300, 700, 200];
  const PTS = [0, 0, 3, 3, 5, 13, 7, 2];
  const MATE = 30000;
  const sq = (x, y) => y * 9 + x;
  const inB = (x, y) => x >= 0 && x < 9 && y >= 0 && y < 10;
  const inPalace = (x, y, side) => x >= 3 && x <= 5 && (side === HAN ? y >= 0 && y <= 2 : y >= 7 && y <= 9);
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

  // 궁성 대각선
  const DIAG = Array.from({ length: 90 }, () => []);
  const LINES_OF = Array.from({ length: 90 }, () => []);
  for (const top of [0, 7]) {
    const c = sq(4, top + 1);
    for (const k of [sq(3, top), sq(5, top), sq(3, top + 2), sq(5, top + 2)]) { DIAG[k].push(c); DIAG[c].push(k); }
    for (const L of [[sq(3, top), c, sq(5, top + 2)], [sq(5, top), c, sq(3, top + 2)]])
      for (let i = 0; i < 3; i++) LINES_OF[L[i]].push({ L, i });
  }

  // 상차림: 왼쪽부터 (x1, x2, x6, x7) — 자기 쪽에서 본 왼쪽→오른쪽
  const SETUPS = { '마상마상': [H, E, H, E], '상마상마': [E, H, E, H], '마상상마': [H, E, E, H], '상마마상': [E, H, H, E] };
  function initialBoard(choSetup, hanSetup) {
    const b = new Array(90).fill(0);
    const place = (side, arr) => {
      // 아래쪽(초) 기준 좌표를 만들고, 한은 위아래·좌우를 뒤집는다
      const put = (x, y, t) => { if (side === CHO) b[sq(x, y)] = t; else b[sq(8 - x, 9 - y)] = -t; };
      put(0, 9, R); put(8, 9, R); put(3, 9, A); put(5, 9, A); put(4, 8, K);
      put(1, 9, arr[0]); put(2, 9, arr[1]); put(6, 9, arr[2]); put(7, 9, arr[3]);
      put(1, 7, C); put(7, 7, C);
      for (const x of [0, 2, 4, 6, 8]) put(x, 6, P);
    };
    place(CHO, SETUPS[choSetup] || SETUPS['마상상마']);
    place(HAN, SETUPS[hanSetup] || SETUPS['마상상마']);
    return b;
  }

  // 의사 합법수 생성 (자기 궁이 장군에 걸리는지는 확인하지 않음)
  function gen(b, side, out, capsOnly) {
    let n = 0;
    const own = (q) => q !== 0 && (q > 0) === (side > 0);
    const push = (f, to) => {
      const q = b[to];
      if (q !== 0 && (q > 0) === (side > 0)) return;
      if (capsOnly && q === 0) return;
      out[n++] = f * 90 + to;
    };
    for (let s = 0; s < 90; s++) {
      const p = b[s];
      if (p === 0 || (p > 0) !== (side > 0)) continue;
      const t = p > 0 ? p : -p, x = s % 9, y = (s / 9) | 0;
      if (t === K || t === A) {
        for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (inPalace(nx, ny, side)) push(s, sq(nx, ny)); }
        for (const to of DIAG[s]) push(s, to);
      } else if (t === R) {
        for (let d = 0; d < 4; d++) {
          let nx = x + DX[d], ny = y + DY[d];
          while (inB(nx, ny)) { const to = sq(nx, ny); if (b[to] === 0) push(s, to); else { if (!own(b[to])) push(s, to); break; } nx += DX[d]; ny += DY[d]; }
        }
        for (const { L, i } of LINES_OF[s]) for (const dir of [-1, 1]) {
          for (let j = i + dir; j >= 0 && j <= 2; j += dir) { const to = L[j]; if (b[to] === 0) push(s, to); else { if (!own(b[to])) push(s, to); break; } }
        }
      } else if (t === C) {
        for (let d = 0; d < 4; d++) {
          let nx = x + DX[d], ny = y + DY[d], screen = false;
          while (inB(nx, ny)) {
            const to = sq(nx, ny), q = b[to];
            if (!screen) { if (q !== 0) { if (q === C || q === -C) break; screen = true; } }
            else if (q === 0) push(s, to);
            else { if (!own(q) && q !== C && q !== -C) push(s, to); break; }
            nx += DX[d]; ny += DY[d];
          }
        }
        for (const { L, i } of LINES_OF[s]) {
          if (i === 1) continue;
          const mid = b[L[1]], to = L[2 - i], q = b[to];
          if (mid === 0 || mid === C || mid === -C) continue;
          if (q === 0 || (!own(q) && q !== C && q !== -C)) push(s, to);
        }
      } else if (t === H) {
        for (let d = 0; d < 4; d++) {
          const mx = x + DX[d], my = y + DY[d];
          if (!inB(mx, my) || b[sq(mx, my)] !== 0) continue;
          for (const sgn of [-1, 1]) {
            const nx = DX[d] ? x + 2 * DX[d] : x + sgn, ny = DY[d] ? y + 2 * DY[d] : y + sgn;
            if (inB(nx, ny)) push(s, sq(nx, ny));
          }
        }
      } else if (t === E) {
        for (let d = 0; d < 4; d++) {
          const mx = x + DX[d], my = y + DY[d];
          if (!inB(mx, my) || b[sq(mx, my)] !== 0) continue;
          for (const sgn of [-1, 1]) {
            const ddx = DX[d] ? DX[d] : sgn, ddy = DY[d] ? DY[d] : sgn;
            const m2x = mx + ddx, m2y = my + ddy;
            if (!inB(m2x, m2y) || b[sq(m2x, m2y)] !== 0) continue;
            const nx = m2x + ddx, ny = m2y + ddy;
            if (inB(nx, ny)) push(s, sq(nx, ny));
          }
        }
      } else if (t === P) {
        const dy = side === CHO ? -1 : 1;
        if (inB(x, y + dy)) push(s, sq(x, y + dy));
        if (x > 0) push(s, sq(x - 1, y));
        if (x < 8) push(s, sq(x + 1, y));
        for (const to of DIAG[s]) if (((to / 9) | 0) === y + dy) push(s, to);
      }
    }
    return n;
  }

  function findKing(b, side) { const k = side === CHO ? K : -K; for (let s = 0; s < 90; s++) if (b[s] === k) return s; return -1; }
  const _att = new Int32Array(256);
  function attacked(b, target, bySide) {
    const n = gen(b, bySide, _att, true);
    for (let i = 0; i < n; i++) if (_att[i] % 90 === target) return true;
    return false;
  }
  function inCheck(b, side) { const k = findKing(b, side); return k >= 0 && attacked(b, k, -side); }
  function kingsFacing(b) {
    const a = findKing(b, CHO), h = findKing(b, HAN);
    if (a < 0 || h < 0 || a % 9 !== h % 9) return false;
    for (let s = h + 9; s < a; s += 9) if (b[s] !== 0) return false;
    return true;
  }
  const _lg = new Int32Array(256);
  function legalMoves(b, side) {
    const n = gen(b, side, _lg, false), out = [];
    for (let i = 0; i < n; i++) {
      const m = _lg[i], f = (m / 90) | 0, to = m % 90, cap = b[to];
      b[to] = b[f]; b[f] = 0;
      const bad = inCheck(b, side);
      b[f] = b[to]; b[to] = cap;
      if (!bad) out.push(m);
    }
    return out;
  }
  function points(b) {
    let cho = 0, han = 1.5;
    for (let s = 0; s < 90; s++) { const p = b[s]; if (p > 0) cho += PTS[p]; else if (p < 0) han += PTS[-p]; }
    return { cho, han };
  }

  // ---- 평가 ----
  // 초(아래쪽) 기준 위치 점수. 한은 y를 뒤집어 쓴다.
  function pst(t, x, y) {
    if (t === P) {
      const adv = 6 - y;
      let v = [0, 12, 26, 36, 44, 40, 24][Math.max(0, Math.min(6, adv))];
      if (x >= 3 && x <= 5) v += 8;
      if (y <= 2 && x >= 3 && x <= 5) v += 14;
      return v;
    }
    if (t === H) return (x >= 2 && x <= 6 && y >= 2 && y <= 8 ? 14 : 0) - (x === 0 || x === 8 ? 14 : 0);
    if (t === E) return x >= 2 && x <= 6 ? 6 : 0;
    if (t === K) return x === 4 && y === 8 ? 10 : y === 7 ? -8 : 0;
    if (t === R) return y <= 3 ? 10 : 0;
    if (t === C) return y >= 7 ? 8 : 0;
    return 0;
  }
  const PST = Array.from({ length: 8 }, (_, t) => {
    const a = new Int16Array(90);
    for (let s = 0; s < 90; s++) a[s] = pst(t, s % 9, (s / 9) | 0);
    return a;
  });
  function evaluate(b, side) {
    let v = 0, choA = 0, hanA = 0;
    for (let s = 0; s < 90; s++) {
      const p = b[s];
      if (p > 0) { v += VAL[p] + PST[p][s]; if (p === A) choA++; }
      else if (p < 0) { const t = -p; v -= VAL[t] + PST[t][(9 - ((s / 9) | 0)) * 9 + (s % 9)]; if (t === A) hanA++; }
    }
    v += (choA - hanA) * 25;   // 사가 없으면 궁이 약해진다
    v -= 15;                    // 한의 덤 1.5 를 조금 반영
    return v * side;
  }

  // ---- 탐색 ----
  const TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const ttK = new Int32Array(TT_SIZE), ttM = new Int32Array(TT_SIZE), ttS = new Int32Array(TT_SIZE);
  const ttD = new Int8Array(TT_SIZE), ttF = new Uint8Array(TT_SIZE);
  let seed = 0x2545F491;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const Z1 = Array.from({ length: 15 }, () => Int32Array.from({ length: 90 }, rnd));
  const Z2 = Array.from({ length: 15 }, () => Int32Array.from({ length: 90 }, rnd));
  const ZS1 = rnd(), ZS2 = rnd();
  const zi = (p) => p + 7;

  function search(board, side, opts) {
    const b = board.slice();
    const timeMs = opts.timeMs || 1000, maxDepth = opts.maxDepth || 64, noise = opts.noise || 0;
    // 빅장(비김)은 AI에게 조금 손해로 친다. 지고 있을 때만 비기기를 노린다.
    const rootSide = side, contempt = opts.contempt == null ? 120 : opts.contempt;
    const drawFor = (s) => (s === rootSide ? -contempt : contempt);
    const t0 = Date.now(), deadline = t0 + timeMs;
    let nodes = 0, abort = false;
    let h1 = 0, h2 = 0;
    for (let s = 0; s < 90; s++) if (b[s]) { h1 ^= Z1[zi(b[s])][s]; h2 ^= Z2[zi(b[s])][s]; }
    if (side === HAN) { h1 ^= ZS1; h2 ^= ZS2; }
    const MAXPLY = 64;
    const moveBuf = Array.from({ length: MAXPLY + 8 }, () => new Int32Array(256));
    const scoreBuf = Array.from({ length: MAXPLY + 8 }, () => new Int32Array(256));
    const killers = Array.from({ length: MAXPLY + 8 }, () => [0, 0]);
    const hist = new Int32Array(90 * 90);

    function make(m) {
      const f = (m / 90) | 0, to = m % 90, p = b[f], cap = b[to];
      h1 ^= Z1[zi(p)][f] ^ Z1[zi(p)][to] ^ ZS1; h2 ^= Z2[zi(p)][f] ^ Z2[zi(p)][to] ^ ZS2;
      if (cap) { h1 ^= Z1[zi(cap)][to]; h2 ^= Z2[zi(cap)][to]; }
      b[to] = p; b[f] = 0;
      return cap;
    }
    function unmake(m, cap) {
      const f = (m / 90) | 0, to = m % 90, p = b[to];
      b[f] = p; b[to] = cap;
      h1 ^= Z1[zi(p)][f] ^ Z1[zi(p)][to] ^ ZS1; h2 ^= Z2[zi(p)][f] ^ Z2[zi(p)][to] ^ ZS2;
      if (cap) { h1 ^= Z1[zi(cap)][to]; h2 ^= Z2[zi(cap)][to]; }
    }
    function order(ply, n, ttMove) {
      const mv = moveBuf[ply], sc = scoreBuf[ply], k = killers[ply];
      for (let i = 0; i < n; i++) {
        const m = mv[i], cap = b[m % 90];
        let s;
        if (m === ttMove) s = 1 << 29;
        else if (cap) s = (1 << 27) + VAL[cap > 0 ? cap : -cap] * 16 - VAL[Math.abs(b[(m / 90) | 0])];
        else if (m === k[0]) s = 1 << 26;
        else if (m === k[1]) s = (1 << 26) - 1;
        else s = hist[m];
        sc[i] = s;
      }
    }
    function pickNext(ply, i, n) {
      const mv = moveBuf[ply], sc = scoreBuf[ply];
      let bi = i;
      for (let j = i + 1; j < n; j++) if (sc[j] > sc[bi]) bi = j;
      if (bi !== i) { let t = mv[i]; mv[i] = mv[bi]; mv[bi] = t; t = sc[i]; sc[i] = sc[bi]; sc[bi] = t; }
      return mv[i];
    }
    function qs(alpha, beta, ply, s) {
      nodes++;
      if ((nodes & 2047) === 0 && Date.now() > deadline) abort = true;
      if (abort) return 0;
      const stand = evaluate(b, s);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply >= MAXPLY) return stand;
      const n = gen(b, s, moveBuf[ply], true);
      order(ply, n, 0);
      for (let i = 0; i < n; i++) {
        const m = pickNext(ply, i, n);
        const cap = make(m);
        if (cap === K || cap === -K) { unmake(m, cap); return MATE - ply; }
        if (inCheck(b, s)) { unmake(m, cap); continue; }
        const v = -qs(-beta, -alpha, ply + 1, -s);
        unmake(m, cap);
        if (abort) return 0;
        if (v >= beta) return v;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }
    function nonPawn(s) { for (let q = 0; q < 90; q++) { const p = b[q] * s; if (p === R || p === C || p === H || p === E) return true; } return false; }
    function negamax(depth, alpha, beta, ply, s, allowNull) {
      if (abort) return 0;
      const chk = inCheck(b, s);
      if (chk && ply < 40) depth++;
      if (depth <= 0) return qs(alpha, beta, ply, s);
      nodes++;
      if ((nodes & 2047) === 0 && Date.now() > deadline) { abort = true; return 0; }
      const idx = h1 & TT_MASK;
      let ttMove = 0;
      if (ttK[idx] === h2) {
        ttMove = ttM[idx];
        if (ttD[idx] >= depth && ply > 0) {
          const v = ttS[idx], f = ttF[idx];
          if (f === 0) return v;
          if (f === 1 && v >= beta) return v;
          if (f === 2 && v <= alpha) return v;
        }
      }
      if (allowNull && !chk && depth >= 3 && ply > 0 && nonPawn(s)) {
        h1 ^= ZS1; h2 ^= ZS2;
        const v = -negamax(depth - 3, -beta, -beta + 1, ply + 1, -s, false);
        h1 ^= ZS1; h2 ^= ZS2;
        if (abort) return 0;
        if (v >= beta) return v;
      }
      const n = gen(b, s, moveBuf[ply], false);
      order(ply, n, ttMove);
      let best = -MATE, bestMove = 0, legal = 0;
      const a0 = alpha;
      for (let i = 0; i < n; i++) {
        const m = pickNext(ply, i, n);
        const cap = make(m);
        if (cap === K || cap === -K) { unmake(m, cap); return MATE - ply; }
        if (inCheck(b, s)) { unmake(m, cap); continue; }
        legal++;
        let v;
        if (kingsFacing(b)) v = drawFor(s);   // 빅장: 비김
        else if (legal === 1) v = -negamax(depth - 1, -beta, -alpha, ply + 1, -s, true);
        else {
          v = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1, -s, true);
          if (v > alpha && v < beta) v = -negamax(depth - 1, -beta, -alpha, ply + 1, -s, true);
        }
        unmake(m, cap);
        if (abort) return 0;
        if (v > best) { best = v; bestMove = m; }
        if (v > alpha) alpha = v;
        if (alpha >= beta) {
          if (!cap) { const kk = killers[ply]; if (kk[0] !== m) { kk[1] = kk[0]; kk[0] = m; } hist[m] += depth * depth; }
          break;
        }
      }
      if (legal === 0) {
        if (chk) return -MATE + ply;
        // 둘 수 없으면 한 수 쉰다
        h1 ^= ZS1; h2 ^= ZS2;
        const v = -negamax(depth - 1, -beta, -alpha, ply + 1, -s, false);
        h1 ^= ZS1; h2 ^= ZS2;
        return v;
      }
      ttK[idx] = h2; ttM[idx] = bestMove; ttS[idx] = best; ttD[idx] = depth;
      ttF[idx] = best <= a0 ? 2 : best >= beta ? 1 : 0;
      return best;
    }

    // 루트
    const rootMoves = legalMoves(b, side);
    if (rootMoves.length === 0) return { move: PASS, score: 0, depth: 0, nodes: 0 };
    let bestMove = rootMoves[0], bestScore = 0, doneDepth = 0;
    if (noise > 0) {
      // 수마다 정확한 점수를 구하고 잡음을 섞어 고른다 (하·중)
      const scored = rootMoves.map((m) => ({ m, v: 0 }));
      for (let d = 1; d <= maxDepth; d++) {
        let ok = true;
        for (const r of scored) {
          const cap = make(r.m);
          const v = kingsFacing(b) ? drawFor(side) : -negamax(d - 1, -MATE, MATE, 1, -side, true);
          unmake(r.m, cap);
          if (abort) { ok = false; break; }
          r.v = v;
        }
        if (!ok) break;
        doneDepth = d;
        if (Date.now() - t0 > timeMs * 0.5) break;
      }
      let bv = -1e9;
      for (const r of scored) {
        const v = r.v + (Math.random() * 2 - 1) * noise;
        if (v > bv) { bv = v; bestMove = r.m; bestScore = r.v; }
      }
      return { move: bestMove, score: bestScore, depth: doneDepth, nodes };
    }
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -MATE - 1, iterBest = 0, iterScore = -MATE - 1;
      // 이전 최선수를 먼저
      rootMoves.sort((a, c) => (a === bestMove ? -1 : c === bestMove ? 1 : 0));
      for (const m of rootMoves) {
        const cap = make(m);
        let v;
        if (kingsFacing(b)) v = drawFor(side);
        else if (iterBest === 0) v = -negamax(d - 1, -MATE - 1, -alpha, 1, -side, true);
        else {
          v = -negamax(d - 1, -alpha - 1, -alpha, 1, -side, true);
          if (v > alpha) v = -negamax(d - 1, -MATE - 1, -alpha, 1, -side, true);
        }
        unmake(m, cap);
        if (abort) break;
        if (v > iterScore) { iterScore = v; iterBest = m; }
        if (v > alpha) alpha = v;
      }
      if (abort) break;
      bestMove = iterBest; bestScore = iterScore; doneDepth = d;
      if (Math.abs(bestScore) > MATE - 100) break;
      if (Date.now() - t0 > timeMs * 0.55) break;
    }
    return { move: bestMove, score: bestScore, depth: doneDepth, nodes };
  }

  return { K, A, E, H, R, C, P, CHO, HAN, PASS, PTS, SETUPS, initialBoard, gen, legalMoves, inCheck, kingsFacing, points, evaluate, search, findKing };
})();
if (typeof module !== 'undefined') module.exports = JanggiEngine;
