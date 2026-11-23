// ===== 프로 AI: KataGo 신경망 + PUCT 탐색 =====
const ProAI = (() => {
  const SCORE_W = 0.1, CPUCT = 1.1;

  // ---------- 축 (KataGo searchIsLadderCaptured 와 같은 규칙) ----------
  const LP = {};
  function lpool(n, i) { const a = LP[n] || (LP[n] = []); while (a.length <= i) a.push(new Board(n)); return a[i]; }
  function immLibs(b, p) { let k = 0; for (let d = 0; d < 4; d++) if (b.c[p + b.D[d]] === EMPTY) k++; return k; }
  function adjacent(b, p, q) { const d = p - q; return d === 1 || d === -1 || d === b.W || d === -b.W; }
  function libertyGainingCaptures(b, loc) {
    const att = 3 - b.c[loc], st = b.groupStones(loc), out = [];
    for (const s of st) for (let d = 0; d < 4; d++) {
      const r = s + b.D[d];
      if (b.c[r] === att && b.libs(r, 2) === 1) { const l = b.S.lastLib; if (out.indexOf(l) < 0) out.push(l); }
    }
    return out;
  }
  function lsearch(b, loc, isDef, depth, ctx) {
    if (++ctx.nodes > 3000) { ctx.abort = true; return false; }
    if (depth >= ctx.maxDepth) return true;
    const libs = b.libs(loc, 3);
    if (!isDef) { if (libs <= 1) return true; if (libs >= 3) return false; }
    else { if (libs >= 2) return false; if (b.ko >= 0) return false; }
    const pla = b.c[loc], opp = 3 - pla;
    if (isDef) {
      const lone = b.S.lastLib;
      const moves = libertyGainingCaptures(b, loc); moves.push(lone);
      for (const m of moves) {
        if (!b.isLegal(m, pla)) continue;
        const nb = lpool(b.n, depth); nb.copyFrom(b); nb.play(m, pla);
        const r = lsearch(nb, loc, false, depth + 1, ctx);
        if (ctx.abort) return false;
        if (!r) return false;
      }
      return true;
    }
    const l0 = b.S.libBuf[0], l1 = b.S.libBuf[1];
    let moves = [l0, l1];
    if (!adjacent(b, l0, l1)) {
      const i0 = immLibs(b, l0), i1 = immLibs(b, l1);
      if (i0 >= 3 && i1 >= 3) return false;
      else if (i0 >= 3) moves = [l0];
      else if (i1 >= 3) moves = [l1];
    }
    for (const m of moves) {
      if (!b.isLegal(m, opp)) continue;
      const nb = lpool(b.n, depth); nb.copyFrom(b); nb.play(m, opp);
      if (nb.c[loc] !== pla) return true;
      const r = lsearch(nb, loc, true, depth + 1, ctx);
      if (ctx.abort) return false;
      if (r) return true;
    }
    return false;
  }
  function isLadderCaptured(b, loc, defFirst) {
    const v = b.c[loc]; if (v !== BLACK && v !== WHITE) return false;
    const libs = b.libs(loc, 3);
    if (libs > 2 || (defFirst && libs > 1)) return false;
    const cp = lpool(b.n, 900); cp.copyFrom(b); if (defFirst) cp.ko = -1;
    const ctx = { nodes: 0, abort: false, maxDepth: Math.floor(b.n * b.n * 1.5) };
    const r = lsearch(cp, loc, defFirst, 0, ctx);
    return ctx.abort ? false : r;
  }
  // 축으로 잡히는 돌 평면(st)과, 상대 돌을 축으로 잡는 수(wk). 인덱스는 y*n+x.
  function ladderPlane(b, wantWorking) {
    const n = b.n, st = new Uint8Array(n * n), wk = wantWorking ? new Uint8Array(n * n) : null;
    const pla = b.turn, opp = 3 - pla, seen = new Uint8Array(b.len);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const p = b.pt(x, y), v = b.c[p];
      if ((v !== BLACK && v !== WHITE) || seen[p]) continue;
      const grp = b.groupStones(p);
      for (const s of grp) seen[s] = 1;
      const libs = b.libs(p, 3);
      if (libs !== 1 && libs !== 2) continue;
      let lad = false; const works = [];
      if (libs === 1) lad = isLadderCaptured(b, p, true);
      else {
        b.libs(p, 2); const m0 = b.S.libBuf[0], m1 = b.S.libBuf[1], att = 3 - v;
        for (const m of [m0, m1]) {
          if (!b.isLegal(m, att)) continue;
          const nb = lpool(n, 901); nb.copyFrom(b); nb.play(m, att);
          if (isLadderCaptured(nb, p, true)) works.push(m);
        }
        lad = works.length > 0;
      }
      if (!lad) continue;
      for (const s of grp) st[b.yOf(s) * n + b.xOf(s)] = 1;
      if (wk && v === opp && libs > 1) for (const m of works) wk[b.yOf(m) * n + b.xOf(m)] = 1;
    }
    void pla;
    return { st, wk };
  }

  // ---------- 영역 (Benson 통과-삶 판정, KataGo calculateArea) ----------
  function areaForPla(b, pla, res) {
    const opp = 3 - pla, c = b.c, D = b.D, len = b.len;
    const chain = new Int32Array(len).fill(-1), chains = [];
    for (let p = 0; p < len; p++) if (c[p] === pla && chain[p] < 0) {
      const id = chains.length, st = b.groupStones(p);
      for (const s of st) chain[s] = id; chains.push(st);
    }
    const atLeastOnePla = chains.length > 0;
    const region = new Int32Array(len).fill(-1), regions = [];
    const adjChains = (q) => { const out = []; for (let d = 0; d < 4; d++) { const r = q + D[d]; if (c[r] === pla && out.indexOf(chain[r]) < 0) out.push(chain[r]); } return out; };
    const adjToPla = (q) => { for (let d = 0; d < 4; d++) if (c[q + D[d]] === pla) return true; return false; };
    for (let y = 0; y < b.n; y++) for (let x = 0; x < b.n; x++) {
      const p = b.pt(x, y);
      if (c[p] !== EMPTY || region[p] >= 0) continue;
      const ri = regions.length;
      let vital = adjChains(p);
      const pts = [p]; region[p] = ri; let internal = 0, containsOpp = false;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[i];
        if (vital.length && c[q] === EMPTY) { const a = adjChains(q); vital = vital.filter((v) => a.indexOf(v) >= 0); }
        if (internal < 2 && !adjToPla(q)) internal++;
        if (c[q] === opp) containsOpp = true;
        for (let d = 0; d < 4; d++) {
          const r = q + D[d];
          if ((c[r] === EMPTY || c[r] === opp) && region[r] < 0) { region[r] = ri; pts.push(r); }
        }
      }
      regions.push({ pts, vital, internal, containsOpp, npa: false });
    }
    const vc = new Int32Array(chains.length), killed = new Uint8Array(chains.length);
    for (const rg of regions) for (const v of rg.vital) vc[v]++;
    for (;;) {
      let any = false;
      for (let i = 0; i < chains.length; i++) {
        if (killed[i] || vc[i] >= 2) continue;
        killed[i] = 1; any = true;
        for (const s of chains[i]) for (let d = 0; d < 4; d++) {
          const q = s + D[d], ri = region[q];
          if (ri >= 0 && !regions[ri].npa) { regions[ri].npa = true; for (const v of regions[ri].vital) vc[v]--; }
        }
      }
      if (!any) break;
    }
    for (let i = 0; i < chains.length; i++) if (!killed[i]) for (const s of chains[i]) res[s] = pla;
    for (const rg of regions) {
      const mark = (rg.internal <= 1 && !rg.npa && atLeastOnePla) || (!rg.containsOpp && !rg.npa && atLeastOnePla);
      if (mark) for (const q of rg.pts) res[q] = pla;
      else if (!rg.containsOpp && atLeastOnePla) for (const q of rg.pts) if (res[q] === 0) res[q] = pla;
    }
  }
  function calcArea(b) {
    const res = new Int8Array(b.len);
    areaForPla(b, BLACK, res); areaForPla(b, WHITE, res);
    for (let p = 0; p < b.len; p++) { const v = b.c[p]; if (res[p] === 0 && (v === BLACK || v === WHITE)) res[p] = v; }
    return res;
  }

  // ---------- 신경망 입력 (KataGo 입력 v7) ----------
  function komiWave(selfKomi, area) {
    const even = area % 2 === 0;
    const kf = even ? Math.floor(selfKomi / 2) * 2 : Math.floor((selfKomi - 1) / 2) * 2 + 1;
    const d = Math.min(2, Math.max(0, selfKomi - kf));
    return d < 0.5 ? d : d < 1.5 ? 1 - d : d - 2;
  }
  // hist: 최근 수들(오래된 것 → 최근), PASS 포함. lad: 현재 축 평면, prev1/prev2: 이전 판의 축 평면
  function fillInputs(b, hist, lad, prev1, prev2, komi, inp, glob) {
    const n = b.n, P = n * n, F = 22, pla = b.turn, opp = 3 - pla;
    inp.fill(0); glob.fill(0);
    const libsOf = new Int8Array(b.len), seen = new Uint8Array(b.len);
    for (let p = 0; p < b.len; p++) {
      const v = b.c[p];
      if ((v === BLACK || v === WHITE) && !seen[p]) {
        const st = b.groupStones(p), l = b.libs(p, 4);
        for (const s of st) { seen[s] = 1; libsOf[s] = l; }
      }
    }
    const area = calcArea(b);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const p = b.pt(x, y), o = (y * n + x) * F, v = b.c[p];
      inp[o] = 1;
      if (v === pla) inp[o + 1] = 1; else if (v === opp) inp[o + 2] = 1;
      if (v === pla || v === opp) { const l = libsOf[p]; if (l === 1) inp[o + 3] = 1; else if (l === 2) inp[o + 4] = 1; else if (l === 3) inp[o + 5] = 1; }
      if (lad.st[y * n + x]) inp[o + 14] = 1;
      if (prev1[y * n + x]) inp[o + 15] = 1;
      if (prev2[y * n + x]) inp[o + 16] = 1;
      if (lad.wk && lad.wk[y * n + x]) inp[o + 17] = 1;
      if (area[p] === pla) inp[o + 18] = 1; else if (area[p] === opp) inp[o + 19] = 1;
    }
    if (b.ko >= 0) inp[(b.yOf(b.ko) * n + b.xOf(b.ko)) * F + 6] = 1;
    const h = hist.length;
    for (let i = 0; i < 5 && i < h; i++) {
      const m = hist[h - 1 - i];
      if (m < 0) glob[i] = 1;
      else inp[(b.yOf(m) * n + b.xOf(m)) * F + 9 + i] = 1;
    }
    const selfKomi = pla === WHITE ? komi : -komi;
    glob[5] = selfKomi / 20;
    glob[14] = h > 0 && hist[h - 1] < 0 ? 1 : 0;
    glob[18] = komiWave(selfKomi, P);
  }

  // ---------- 평가기 ----------
  let evaluator = null, concurrency = 1;
  function setEvaluator(fn, conc) { evaluator = fn; concurrency = Math.max(1, conc || 1); }
  function ready() { return !!evaluator; }

  function parseOut(out, b) {
    const n = b.n, P = n * n, toPlay = b.turn;
    const v0 = out[P + 1], v1 = out[P + 2], v2 = out[P + 3], mx = Math.max(v0, v1, v2);
    const e0 = Math.exp(v0 - mx), e1 = Math.exp(v1 - mx), e2 = Math.exp(v2 - mx), s = e0 + e1 + e2;
    const wl = (e0 - e1) / s;
    const lead = out[P + 6] * 20;
    let areaBlack = 0;
    const sgn = toPlay === BLACK ? 1 : -1;
    for (let i = 0; i < P; i++) areaBlack += sgn * Math.tanh(out[P + 8 + i]);
    const u = wl + SCORE_W * (2 / Math.PI) * Math.atan(lead / Math.max(4, Math.sqrt(P) * 0.5));
    return { wl, lead, u, areaBlack, win: e0 / s };
  }
  function expandFrom(node, out, b) {
    const n = b.n, P = n * n, col = b.turn, moves = [], logits = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const p = b.pt(x, y);
      if (b.c[p] !== EMPTY || !b.isLegal(p, col)) continue;
      moves.push(p); logits.push(out[y * n + x]);
    }
    moves.push(PASS); logits.push(out[P]);
    let mx = -1e30; for (const l of logits) if (l > mx) mx = l;
    let s = 0; const pr = logits.map((l) => { const e = Math.exp(l - mx); s += e; return e; });
    node.kids = moves.map((m, i) => new PNode(m, pr[i] / s));
    node.kids.sort((a, c) => c.P - a.P);
  }

  class PNode {
    constructor(move, P) {
      this.move = move; this.P = P; this.N = 0; this.W = 0; this.WL = 0; this.vl = 0;
      this.kids = null; this.pending = false; this.terminal = false; this.tu = 0; this.twl = 0;
      this.ladder = null; this.areaBlack = 0; this.evalWin = 0.5;
    }
  }
  function pick(node, isRoot) {
    const kids = node.kids; let sumN = 0, visitedP = 0;
    for (const k of kids) { const kn = k.N + k.vl; sumN += kn; if (kn > 0) visitedP += k.P; }
    const parentQ = node.N > 0 ? -node.W / node.N : 0;
    const fpu = parentQ - (isRoot ? 0.1 : 0.2) * Math.sqrt(visitedP);
    const sq = Math.sqrt(sumN + 0.01);
    let best = kids[0], bv = -1e9;
    for (const k of kids) {
      const kn = k.N + k.vl;
      const q = kn > 0 ? (k.W - k.vl) / kn : fpu;
      const v = q + CPUCT * k.P * sq / (1 + kn);
      if (v > bv) { bv = v; best = k; }
    }
    return best;
  }
  function backup(path, u, wl) {
    let a = -u, w = -wl;
    for (let i = path.length - 1; i >= 0; i--) { const nd = path[i]; nd.N++; nd.W += a; nd.WL += w; a = -a; w = -w; }
  }
  function replay(n, moves) { const b = new Board(n); for (const m of moves) { if (m < 0) b.pass(); else b.play(m, b.turn); } return b; }

  let tree = null; // { n, moves(list), root }
  // 게임 기록(moves)으로부터 탐색 문맥 만들기 (가능하면 이전 나무 재사용)
  function rootFor(n, moves) {
    if (tree && tree.n === n && moves.length >= tree.moves.length) {
      let same = true;
      for (let i = 0; i < tree.moves.length; i++) if (tree.moves[i] !== moves[i]) { same = false; break; }
      if (same) {
        let node = tree.root;
        for (let i = tree.moves.length; i < moves.length && node; i++) {
          if (!node.kids) { node = null; break; }
          node = node.kids.find((k) => k.move === moves[i]) || null;
        }
        if (node && node.kids && !node.terminal) return node;
      }
    }
    return null;
  }

  async function evalLeaf(b, hist, prev1, prev2, komi, node) {
    const n = b.n, P = n * n;
    const lad = ladderPlane(b, true);
    node.ladder = lad.st;
    const inp = new Float32Array(P * 22), glob = new Float32Array(19);
    fillInputs(b, hist.slice(-5), lad, prev1 || lad.st, prev2 || prev1 || lad.st, komi, inp, glob);
    return evaluator(inp, glob, n);
  }

  // 탐색해서 수를 고른다. moves: 지금까지의 모든 수(PASS=-1)
  async function search(n, moves, opts) {
    const komi = opts.komi, cancel = opts.cancel;
    const rootBoard = replay(n, moves);
    const prevB1 = moves.length >= 1 ? replay(n, moves.slice(0, -1)) : null;
    const prevB2 = moves.length >= 2 ? replay(n, moves.slice(0, -2)) : null;
    const lad1 = prevB1 ? ladderPlane(prevB1, false).st : null;
    const lad2 = prevB2 ? ladderPlane(prevB2, false).st : null;
    let root = rootFor(n, moves);
    if (!root) {
      root = new PNode(moves.length ? moves[moves.length - 1] : PASS, 1);
      const out = await evalLeaf(rootBoard, moves, lad1, lad2, komi, root);
      const r = parseOut(out, rootBoard);
      root.areaBlack = r.areaBlack; root.evalWin = r.win; root.evalLead = r.lead;
      expandFrom(root, out, rootBoard);
      root.N = 1; root.W = -r.u; root.WL = -r.wl;
    }
    tree = { n, moves: moves.slice(), root };
    const rootLast = moves.length ? moves[moves.length - 1] : 0;
    const scratch = new Board(n);
    const startN = root.N, t0 = nowMs();
    let rate = 0;

    function descend() {
      scratch.copyFrom(rootBoard);
      const path = [root], hist = moves.slice(-5);
      let node = root;
      while (node.kids && node.kids.length && !node.terminal) {
        const k = pick(node, node === root);
        const prevMove = node === root ? rootLast : node.move;
        if (k.move === PASS) scratch.pass(); else scratch.play(k.move, scratch.turn);
        hist.push(k.move);
        path.push(k);
        node = k;
        if (!node.kids && !node.terminal && k.move === PASS && prevMove === PASS && hist.length >= 2) {
          // 두 번 연속 패스: 대국 끝. 직전 평가된 판(부모)의 소유권으로 승패 판정
          const parent = path[path.length - 2];
          const margin = (parent.areaBlack - komi) * (scratch.turn === BLACK ? 1 : -1);
          node.terminal = true; node.twl = margin > 0 ? 1 : -1;
          node.tu = node.twl + SCORE_W * (2 / Math.PI) * Math.atan(margin / Math.max(4, n * 0.5));
        }
      }
      if (node.terminal) { backup(path, node.tu, node.twl); return { done: true }; }
      if (node.pending || node === root) return null;
      for (const nd of path) nd.vl++;
      node.pending = true;
      // 부모/조부모 판의 축 평면 (루트보다 위는 실제 대국 기록에서)
      const L = path.length;
      const p1 = path[L - 2].ladder;
      const p2 = L >= 3 ? path[L - 3].ladder : lad1;
      return { path, node, board: scratch.clone(), hist, p1, p2 };
    }

    function stopNow() {
      if (cancel && cancel()) return true;
      const el = nowMs() - t0, used = root.N - startN;
      if (el >= opts.timeMs || used >= opts.maxVisits) return true;
      if (used > 30 && el > 300) {
        rate = used / el;
        const remain = Math.min(opts.maxVisits - used, rate * (opts.timeMs - el));
        let a = 0, b2 = 0;
        for (const k of root.kids) { if (k.N > a) { b2 = a; a = k.N; } else if (k.N > b2) b2 = k.N; }
        if (a - b2 > remain) return true;
      }
      return false;
    }

    await new Promise((resolve) => {
      let inflight = 0, stopped = false, failed = false;
      const pump = () => {
        if (!stopped && stopNow()) stopped = true;
        if (stopped) { if (inflight === 0) resolve(); return; }
        let guard = 0, launched = 0;
        while (inflight < concurrency && guard++ < concurrency * 6) {
          const leaf = descend();
          if (leaf === null) break;
          if (leaf.done) continue;
          inflight++; launched++;
          evalLeaf(leaf.board, leaf.hist, leaf.p1, leaf.p2, komi, leaf.node).then((out) => {
            inflight--;
            for (const nd of leaf.path) nd.vl--;
            leaf.node.pending = false;
            const r = parseOut(out, leaf.board);
            leaf.node.areaBlack = r.areaBlack; leaf.node.evalWin = r.win;
            expandFrom(leaf.node, out, leaf.board);
            backup(leaf.path, r.u, r.wl);
            pump();
          }, (err) => {
            inflight--; failed = true; stopped = true;
            for (const nd of leaf.path) nd.vl--;
            leaf.node.pending = false;
            console.error(err);
            pump();
          });
        }
        if (inflight === 0 && !stopped) setTimeout(pump, 0);
        void launched; void failed;
      };
      pump();
    });

    const kids = root.kids.slice().sort((a, b) => b.N - a.N || b.P - a.P);
    const best = kids[0];
    const wr = best.N > 0 ? (best.WL / best.N + 1) / 2 : root.evalWin;
    return {
      move: best.move, winrate: wr, visits: root.N, sims: root.N,
      top: kids.slice(0, 5).map((k) => ({ move: k.move, n: k.N, wr: k.N ? (k.WL / k.N + 1) / 2 : null, p: k.P }))
    };
  }

  // 한 번 평가한 소유권 (흑 기준, 보드 좌표)
  async function ownership(n, moves, komi) {
    const b = replay(n, moves);
    const prevB1 = moves.length >= 1 ? replay(n, moves.slice(0, -1)) : null;
    const prevB2 = moves.length >= 2 ? replay(n, moves.slice(0, -2)) : null;
    const lad1 = prevB1 ? ladderPlane(prevB1, false).st : null;
    const lad2 = prevB2 ? ladderPlane(prevB2, false).st : null;
    const out = await evalLeaf(b, moves, lad1, lad2, komi, new PNode(0, 1));
    const own = new Float32Array(b.len), P = n * n, sgn = b.turn === BLACK ? 1 : -1;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) own[b.pt(x, y)] = sgn * Math.tanh(out[P + 8 + y * n + x]);
    return own;
  }

  function resetTree() { tree = null; }
  return { setEvaluator, ready, search, ownership, resetTree, ladderPlane, calcArea, fillInputs, _parse: parseOut };
})();
if (typeof module !== 'undefined') module.exports = ProAI;
