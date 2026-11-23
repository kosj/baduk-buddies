// ===== 장기 화면 =====
(() => {
  'use strict';
  const JE = JanggiEngine;
  const { CHO, HAN, PASS, K, A, E, H, R, C, P } = JE;
  const { Sound, toast, store, avatarSVG, openScrim, closeScrim, iga, pick, sleep } = window.Buddies;
  const $ = (s) => document.querySelector(s);
  const JCS = 100, JM = 70;
  const SAVE_KEY = 'buddies-janggi-game-v1', STATS_KEY = 'buddies-janggi-stats-v1', PREF_KEY = 'buddies-janggi-prefs-v1';
  const LV = [{ timeMs: 300, maxDepth: 2, noise: 200 }, { timeMs: 800, maxDepth: 4, noise: 40 }, { timeMs: 2500 }];
  const LV_KEY = ['easy', 'mid', 'hard'];
  const SETUP_NAMES = Object.keys(JE.SETUPS);
  const MAX_MOVES = 200;

  const JCHAR = [
    {
      name: '콩이', lv: '하', title: '입문', desc: '장기 배운 지 사흘. 잡을 수 있으면 일단 잡아요.',
      greet: ['장기도 재밌어요! 살살 해 주세요.', '제가 차를 좋아하거든요. 시작해요!'],
      move: ['여기로 갈래요!', '헤헤, 움직였어요.', '이거 좋은 수 맞죠?', '음, 이쪽으로!'],
      capAI: ['냠! 잡았다!', '앗싸, 하나 먹었어요!'],
      capUser: ['어, 내 기물이!', '으앙, 잡혔다…'],
      check: ['장군!', '장군이에요! 맞죠?'], escape: ['멍군!', '휴, 멍군이에요.'],
      pass: ['둘 게 없어서 한 수 쉴게요.'], hint: ['힌트 봤죠? 괜찮아요.'], undo: ['무르기? 좋아요!'],
      resign: ['항복이에요… 너무 잘해요!'], aiWin: ['제가 이겼어요? 우와!'], aiLose: ['역시 잘하시네요! 한 판 더 해요.'],
      draw: ['빅장이에요! 비겼네요.']
    },
    {
      name: '몽이', lv: '중', title: '중급', desc: '공원 장기판 단골. 몇 수 앞까지 읽어요.',
      greet: ['장기 한 판 해 볼까요?', '오늘은 외통으로 이겨 볼게요.'],
      move: ['이 정도면 괜찮죠.', '흐음, 이렇게 받을게요.', '좋은 승부네요.', '이 수는 어때요?'],
      capAI: ['이건 제가 가져갈게요.', '빈틈이 보였어요!'],
      capUser: ['앗, 놓쳤다.', '제법인데요?'],
      check: ['장군!', '장군 받으세요!'], escape: ['멍군!', '멍군이요. 쉽지 않죠?'],
      pass: ['한 수 쉴게요.'], hint: ['힌트 썼죠? 다 봤어요.'], undo: ['한 번 봐 드릴게요.'],
      resign: ['졌어요. 기권할게요!'], aiWin: ['좋은 판이었어요. 또 해요.'], aiLose: ['분하다… 다음엔 안 질 거예요!'],
      draw: ['빅장이네요. 이번엔 비겼어요.']
    },
    {
      name: '돌왕', lv: '상', title: '고수', desc: '수읽기의 왕. 외통수를 노려요.',
      greet: ['봐주지 않을 거예요.', '준비됐나요? 시작하죠.'],
      move: ['계산대로예요.', '흐름은 제 쪽이네요.', '여기가 급소예요.', '흠, 그렇게 오셨군요.'],
      capAI: ['욕심이 과했네요.', '그 기물은 이미 끝났어요.'],
      capUser: ['오, 날카롭네요.', '그걸 보다니!'],
      check: ['장군.', '장군입니다.'], escape: ['멍군.', '그 정도로는 안 잡혀요.'],
      pass: ['한 수 쉬겠습니다.'], hint: ['힌트로는 저를 못 이겨요.'], undo: ['무르기라… 이번만이에요.'],
      resign: ['제 패배예요. 대단해요.'], aiWin: ['다음엔 더 날카롭게 와 주세요.'], aiLose: ['완벽하게 졌어요. 존경합니다.'],
      draw: ['빅장… 비긴 걸로 하죠.']
    }
  ];
  const HANJA = { [CHO]: ['', '楚', '士', '象', '馬', '車', '包', '卒'], [HAN]: ['', '漢', '士', '象', '馬', '車', '包', '兵'] };
  const HANGUL = { [CHO]: ['', '초', '사', '상', '마', '차', '포', '졸'], [HAN]: ['', '한', '사', '상', '마', '차', '포', '병'] };
  const SIZE = [0, 46, 32, 39, 39, 39, 39, 32];
  const sideName = (s) => (s === CHO ? '초' : '한');

  const prefs = Object.assign({ level: 1, side: 'cho', setup: '마상상마', labels: 'hanja' }, store.get(PREF_KEY) || {});
  let stats = store.get(STATS_KEY) || {};
  const J = {
    user: CHO, ai: HAN, level: 1, choSetup: '마상상마', hanSetup: '마상상마', labels: 'hanja',
    board: JE.initialBoard('마상상마', '마상상마'), ids: new Array(90).fill(0), moves: [],
    phase: 'setup', busy: false, thinking: false, token: 0, sel: -1, targets: [], passes: 0,
    result: null, hints: 0, hint: null, nextId: 1
  };

  const el = {
    svg: $('#jSvg'), grid: $('#jGrid'), marks: $('#jMarks'), pieces: $('#jPieces'), targets: $('#jTargets'), board: $('#jBoard'),
    oppBar: $('#jOppBar'), meBar: $('#jMeBar'), oppAvatar: $('#jOppAvatar'), oppName: $('#jOppName'), oppLv: $('#jOppLv'),
    oppSide: $('#jOppSide'), meSide: $('#jMeSide'), meIcon: $('#jMeIcon'), meSub: $('#jMeSub'), bubble: $('#jOppBubble'),
    oppPts: $('#jOppPts'), mePts: $('#jMePts'), status: $('#jStatus'), meta: $('#jMeta'), tip: $('#jTip'), score: $('#jScore'),
    actPlay: $('#jActPlay'), actOver: $('#jActOver'), btnUndo: $('#jBtnUndo'), btnHint: $('#jBtnHint'), btnPass: $('#jBtnPass'), btnResign: $('#jBtnResign')
  };

  // ---- AI 워커 ----
  const W_MAIN = `self.onmessage = (e) => { const m = e.data; const r = JanggiEngine.search(m.board, m.side, m.opts); self.postMessage(Object.assign({ id: m.id }, r)); };`;
  const AIW = {
    w: null, failed: false, seq: 0, pending: null,
    get() {
      if (this.w || this.failed) return this.w;
      try {
        const src = document.getElementById('janggi-src').textContent + '\n' + W_MAIN;
        this.w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        this.w.onmessage = (e) => { const p = this.pending; if (p && e.data.id === p.id) { this.pending = null; p.resolve(e.data); } };
        this.w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); this.failed = true; this.w = null; const p = this.pending; this.pending = null; if (p) p.resolve(this.local(p.args)); };
      } catch (e) { this.failed = true; this.w = null; }
      return this.w;
    },
    local(args) { return JE.search(args.board, args.side, args.opts); },
    search(board, side, opts) {
      const args = { board: board.slice(), side, opts };
      const w = this.get();
      if (!w) return new Promise((res) => setTimeout(() => res(this.local(args)), 30));
      return new Promise((resolve) => {
        const id = ++this.seq;
        this.pending = { id, resolve, args };
        w.postMessage({ id, board: args.board, side, opts });
      });
    },
    cancel() {
      if (this.pending && this.w) { this.w.terminate(); this.w = null; this.pending = null; }
    }
  };

  // ---- 그리기 ----
  const flip = () => J.user === HAN;
  const pos = (s) => { let x = s % 9, y = (s / 9) | 0; if (flip()) { x = 8 - x; y = 9 - y; } return [JM + x * JCS, JM + y * JCS]; };
  const oct = (r) => { const pts = []; for (let k = 0; k < 8; k++) { const a = (Math.PI / 8) + k * Math.PI / 4; pts.push((r * Math.cos(a)).toFixed(1) + ',' + (r * Math.sin(a)).toFixed(1)); } return pts.join(' '); };
  function drawGrid() {
    let h = '';
    const L = (x1, y1, x2, y2, cls) => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    for (let x = 0; x < 9; x++) h += L(JM + x * JCS, JM, JM + x * JCS, JM + 9 * JCS, x === 0 || x === 8 ? 'gl edge' : 'gl');
    for (let y = 0; y < 10; y++) h += L(JM, JM + y * JCS, JM + 8 * JCS, JM + y * JCS, y === 0 || y === 9 ? 'gl edge' : 'gl');
    for (const top of [0, 7]) {
      h += L(JM + 3 * JCS, JM + top * JCS, JM + 5 * JCS, JM + (top + 2) * JCS, 'gl');
      h += L(JM + 5 * JCS, JM + top * JCS, JM + 3 * JCS, JM + (top + 2) * JCS, 'gl');
    }
    // 포·졸 자리 표시
    const spots = [[1, 2], [7, 2], [1, 7], [7, 7]];
    for (const x of [0, 2, 4, 6, 8]) spots.push([x, 3], [x, 6]);
    for (const [x, y] of spots) {
      const cx = JM + x * JCS, cy = JM + y * JCS, g = 9, l = 16;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        if ((x === 0 && sx < 0) || (x === 8 && sx > 0)) continue;
        h += `<path class="spot" d="M${cx + sx * (g + l)} ${cy + sy * g} H${cx + sx * g} V${cy + sy * (g + l)}"/>`;
      }
    }
    el.grid.innerHTML = h;
  }
  function pieceInner(p) {
    const side = p > 0 ? CHO : HAN, t = Math.abs(p), r = SIZE[t];
    const label = (J.labels === 'hangul' ? HANGUL : HANJA)[side][t];
    const cls = side === CHO ? 'cho' : 'han';
    const fs = J.labels === 'hangul' ? r * 0.95 : r * 1.12;
    return `<g class="jp-in"><polygon class="jp-sh" points="${oct(r)}" transform="translate(4 6)"/>` +
      `<polygon class="jp-body" points="${oct(r)}"/><polygon class="jp-ring ${cls}" points="${oct(r * 0.8)}"/>` +
      `<text class="jp-t ${cls}${J.labels === 'hangul' ? ' hg' : ''}" font-size="${fs.toFixed(0)}" text-anchor="middle" dominant-baseline="central" y="${J.labels === 'hangul' ? 2 : 1}">${label}</text></g>`;
  }
  const pieceEls = new Map();
  function clearPieces() { pieceEls.clear(); el.pieces.innerHTML = ''; }
  function renderPieces() {
    const live = new Set();
    for (let s = 0; s < 90; s++) {
      const p = J.board[s]; if (!p) continue;
      const id = J.ids[s]; live.add(id);
      let g = pieceEls.get(id);
      const [x, y] = pos(s);
      if (!g || g._p !== p) {
        if (g) g.remove();
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'jp');
        g._p = p;
        g.innerHTML = pieceInner(p);
        g.style.transform = `translate(${x}px, ${y}px)`;
        el.pieces.appendChild(g);
        pieceEls.set(id, g);
      } else g.style.transform = `translate(${x}px, ${y}px)`;
      g.classList.toggle('sel', s === J.sel);
    }
    for (const [id, g] of pieceEls) {
      if (live.has(id)) continue;
      pieceEls.delete(id);
      g.classList.add('jpop');
      setTimeout(() => g.remove(), 420);
    }
    // 선택된 기물을 맨 위로
    if (J.sel >= 0) { const g = pieceEls.get(J.ids[J.sel]); if (g) el.pieces.appendChild(g); }
  }
  function renderMarks() {
    let h = '';
    const last = lastRealMove();
    if (last != null) {
      const f = (last / 90) | 0, t = last % 90, [fx, fy] = pos(f), [tx, ty] = pos(t);
      h += `<circle class="jfrom" cx="${fx}" cy="${fy}" r="14"/><circle class="jto" cx="${tx}" cy="${ty}" r="50"/>`;
    }
    if (J.phase === 'play') {
      const side = sideToMove();
      if (JE.inCheck(J.board, side)) { const k = JE.findKing(J.board, side); if (k >= 0) { const [x, y] = pos(k); h += `<g transform="translate(${x} ${y})"><circle class="jcheck" r="56"/></g>`; } }
    }
    if (J.hint) {
      for (const s of [J.hint.f, J.hint.t]) { const [x, y] = pos(s); h += `<g transform="translate(${x} ${y})"><circle class="hintring" r="48"/></g>`; }
    }
    el.marks.innerHTML = h;
    let t = '';
    for (const s of J.targets) {
      const [x, y] = pos(s);
      t += J.board[s] ? `<circle class="jtcap" cx="${x}" cy="${y}" r="48"/>` : `<circle class="jtdot" cx="${x}" cy="${y}" r="15"/>`;
    }
    el.targets.innerHTML = t;
  }
  function renderAll() { renderPieces(); renderMarks(); updateHUD(); }

  // ---- 상태 ----
  const sideToMove = () => (J.moves.length % 2 === 0 ? CHO : HAN);
  function lastRealMove() { for (let i = J.moves.length - 1; i >= 0; i--) if (J.moves[i] !== PASS) return J.moves[i]; return null; }
  function captured(side) {
    // side가 잡은 점수
    const start = JE.initialBoard(J.choSetup, J.hanSetup);
    let full = 0, now = 0;
    for (let s = 0; s < 90; s++) { const p = start[s]; if (p * side < 0) full += JE.PTS[Math.abs(p)]; const q = J.board[s]; if (q * side < 0) now += JE.PTS[Math.abs(q)]; }
    return full - now;
  }
  function say(text) { el.bubble.textContent = text; el.bubble.classList.remove('fresh'); void el.bubble.offsetWidth; el.bubble.classList.add('fresh'); }
  function sayThinking() { el.bubble.innerHTML = '<span class="dots" aria-label="생각 중"><i></i><i></i><i></i></span>'; }
  const userCanPlay = () => J.phase === 'play' && !J.busy && sideToMove() === J.user;

  function sideChip(node, side) { node.textContent = sideName(side); node.className = `side-chip ${side === CHO ? 'cho' : 'han'}`; }
  function renderPlayers() {
    const ch = JCHAR[J.level];
    el.oppAvatar.innerHTML = avatarSVG(J.level, 2);
    el.oppName.textContent = ch.name;
    el.oppLv.textContent = `${ch.lv} · ${ch.title}`; el.oppLv.className = `lvchip lv${J.level}`;
    sideChip(el.oppSide, J.ai); sideChip(el.meSide, J.user);
    el.meIcon.innerHTML = `<svg viewBox="-50 -50 100 100" aria-hidden="true">${pieceInner(J.user === CHO ? K : -K)}</svg>`;
    el.meSub.textContent = J.user === CHO ? '초 · 내가 먼저 둬요' : '한 · 덤 1.5점을 받아요';
  }
  function updateHUD() {
    const ch = JCHAR[J.level], side = sideToMove(), playing = J.phase === 'play';
    el.oppBar.classList.toggle('active', playing && side === J.ai);
    el.meBar.classList.toggle('active', playing && side === J.user);
    el.oppPts.textContent = captured(J.ai); el.mePts.textContent = captured(J.user);
    el.board.classList.toggle('locked', J.busy);
    let status = '', tip = '';
    const inChk = playing && JE.inCheck(J.board, side);
    if (J.phase === 'setup') { status = '새 게임을 골라 주세요'; tip = '상대와 진영을 고르면 바로 시작해요.'; }
    else if (playing) {
      if (J.thinking) status = `${iga(ch.name)} 생각 중…`;
      else if (J.hinting) status = '좋은 수를 찾는 중…';
      else if (side === J.user) status = inChk ? '장군이에요! 궁을 지키세요' : '내 차례예요';
      else status = `${ch.name} 차례`;
      if (J.sel >= 0) tip = '점이 찍힌 곳으로 옮길 수 있어요. 빨간 테두리는 잡을 수 있는 기물이에요.';
      else if (J.moves.length < 2) tip = '내 기물을 탭하면 갈 수 있는 곳이 보여요. 상대 궁을 외통으로 몰면 이겨요.';
      else tip = '궁끼리 마주 보면(빅장) 비겨요. 200수가 넘으면 점수로 가려요.';
    } else if (J.phase === 'over' && J.result) {
      status = J.result.winner === 0 ? '비겼어요' : J.result.winner === J.user ? '이겼어요!' : '졌어요';
      tip = '판을 둘러보고 한 판 더 해 보세요.';
    }
    el.status.textContent = status; el.tip.textContent = tip;
    const pts = JE.points(J.board);
    el.meta.textContent = `${J.moves.length}수째 · 초 ${pts.cho}점 : 한 ${pts.han}점${J.hints ? ` · 힌트 ${J.hints}번` : ''}`;
    el.actPlay.hidden = J.phase === 'over';
    el.actOver.hidden = J.phase !== 'over';
    const can = userCanPlay();
    el.btnHint.disabled = !can; el.btnPass.disabled = !can || inChk;
    el.btnResign.disabled = J.phase !== 'play';
    el.btnUndo.disabled = !(J.phase === 'play' && hasUserMove() && !J.hinting);
  }
  function hasUserMove() { for (let i = 0; i < J.moves.length; i++) if ((i % 2 === 0 ? CHO : HAN) === J.user) return true; return false; }

  // ---- 저장 ----
  function snapshot() {
    if (J.phase !== 'play') return {};
    return { v: 1, user: J.user, level: J.level, choSetup: J.choSetup, hanSetup: J.hanSetup, labels: J.labels, moves: J.moves.slice(), hints: J.hints };
  }
  function save() { const s = snapshot(); if (s.moves) store.set(SAVE_KEY, s); else store.del(SAVE_KEY); }

  // ---- 흐름 ----
  function rebuild() {
    J.board = JE.initialBoard(J.choSetup, J.hanSetup);
    J.ids = J.board.map((p) => (p ? J.nextId++ : 0));
    let side = CHO;
    for (const m of J.moves) {
      if (m !== PASS) { const f = (m / 90) | 0, t = m % 90; J.board[t] = J.board[f]; J.board[f] = 0; J.ids[t] = J.ids[f]; J.ids[f] = 0; }
      side = -side;
    }
    clearPieces();
  }
  function newGame(cfg) {
    AIW.cancel(); J.token++;
    J.level = cfg.level; J.labels = cfg.labels;
    J.user = cfg.side === 'random' ? (Math.random() < 0.5 ? CHO : HAN) : cfg.side === 'han' ? HAN : CHO;
    J.ai = -J.user;
    const aiSetup = SETUP_NAMES[(Math.random() * SETUP_NAMES.length) | 0];
    if (J.user === CHO) { J.choSetup = cfg.setup; J.hanSetup = aiSetup; } else { J.hanSetup = cfg.setup; J.choSetup = aiSetup; }
    J.moves = []; Object.assign(J, { phase: 'play', busy: false, thinking: false, hinting: false, sel: -1, targets: [], passes: 0, result: null, hints: 0, hint: null });
    rebuild(); renderPlayers(); renderAll();
    say(pick(JCHAR[J.level].greet));
    if (cfg.side === 'random') toast(J.user === CHO ? '나는 초예요. 먼저 두세요!' : '나는 한이에요. 상대가 먼저 둬요.');
    save();
    if (sideToMove() === J.ai) aiTurn();
  }
  // 수를 두고 결과를 처리. 반환: 끝났으면 true
  function applyMove(m, mover) {
    const f = (m / 90) | 0, t = m % 90, cap = J.board[t];
    J.board[t] = J.board[f]; J.board[f] = 0; J.ids[t] = J.ids[f]; J.ids[f] = 0;
    J.moves.push(m); J.passes = 0; J.sel = -1; J.targets = []; J.hint = null;
    Sound.stone(); if (cap) setTimeout(() => Sound.capture(1), 90);
    renderAll();
    if (JE.kingsFacing(J.board)) { finish({ winner: 0, by: 'bikjang' }); return true; }
    const opp = -mover;
    const legal = JE.legalMoves(J.board, opp);
    if (!legal.length) {
      if (JE.inCheck(J.board, opp)) { finish({ winner: mover, by: 'mate' }); return true; }
      // 둘 수가 없으면 자동으로 한 수 쉰다
      J.moves.push(PASS); J.passes = 1;
      toast(`${opp === J.user ? '내가' : JCHAR[J.level].name + '가'} 둘 수 있는 수가 없어 한 수 쉬어요.`);
    }
    if (J.moves.length >= MAX_MOVES) { finishByPoints('limit'); return true; }
    if (JE.inCheck(J.board, sideToMove())) Sound.tone([880, 1175], 0.09, 'square', 0.06);
    return false;
  }
  function finishByPoints(by) {
    const p = JE.points(J.board);
    finish({ winner: p.cho > p.han ? CHO : HAN, by });
  }

  function onTap(s) {
    if (J.phase === 'setup') { openSetup(); return; }
    if (s < 0 || J.phase !== 'play') return;
    if (J.busy) { if (J.thinking) toast(`${iga(JCHAR[J.level].name)} 생각 중이에요. 잠깐만요!`); return; }
    if (sideToMove() !== J.user) return;
    if (J.sel >= 0 && J.targets.includes(s)) { userMove(J.sel * 90 + s); return; }
    const p = J.board[s];
    if (p && (p > 0) === (J.user > 0)) {
      if (J.sel === s) { J.sel = -1; J.targets = []; renderPieces(); renderMarks(); updateHUD(); return; }
      const ms = JE.legalMoves(J.board, J.user).filter((m) => ((m / 90) | 0) === s);
      J.sel = s; J.targets = ms.map((m) => m % 90);
      Sound.stone(0.25);
      if (!ms.length) toast(JE.inCheck(J.board, J.user) ? '장군을 막을 수 있는 수가 아니에요.' : '이 기물은 지금 움직일 곳이 없어요.');
    } else { J.sel = -1; J.targets = []; }
    renderPieces(); renderMarks(); updateHUD();
  }
  function userMove(m) {
    const cap = J.board[m % 90];
    const ended = applyMove(m, J.user);
    save();
    if (ended) return;
    const ch = JCHAR[J.level];
    if (JE.inCheck(J.board, J.ai)) say('앗, 장군이네요!');
    else if (cap) say(pick(ch.capUser));
    if (sideToMove() === J.ai) aiTurn(); else updateHUD();
  }
  function userPass() {
    if (!userCanPlay() || JE.inCheck(J.board, J.user)) return;
    J.moves.push(PASS); J.passes++; J.sel = -1; J.targets = []; J.hint = null;
    Sound.pass(); toast('한 수 쉬었어요');
    if (J.passes >= 2) { finishByPoints('pass'); return; }
    renderAll(); save(); aiTurn();
  }
  async function aiTurn() {
    const token = J.token, ch = JCHAR[J.level];
    const wasInCheck = JE.inCheck(J.board, J.ai);
    J.busy = true; J.thinking = true; sayThinking(); updateHUD();
    await sleep(60);
    if (token !== J.token) return;
    const t0 = performance.now();
    const r = await AIW.search(J.board, J.ai, LV[J.level]);
    const wait = 450 - (performance.now() - t0);
    if (wait > 0) await sleep(wait);
    if (token !== J.token) return;
    J.busy = false; J.thinking = false;
    if (r.move === PASS || r.move == null) {
      J.moves.push(PASS); J.passes++; Sound.pass(); say(pick(ch.pass));
      if (J.passes >= 2) { finishByPoints('pass'); return; }
      renderAll(); save(); return;
    }
    // 가망이 없으면 기권
    if (J.level > 0 && r.score < -2600 && r.score > -20000 && J.moves.length > 30) {
      say(pick(ch.resign)); finish({ winner: J.user, by: 'resign', resigner: J.ai }); return;
    }
    const cap = J.board[r.move % 90];
    const ended = applyMove(r.move, J.ai);
    save();
    if (ended) return;
    if (JE.inCheck(J.board, J.user)) say(pick(ch.check));
    else if (wasInCheck) say(pick(ch.escape));
    else if (cap) say(pick(ch.capAI));
    else say(pick(ch.move));
    updateHUD();
    if (sideToMove() === J.ai) aiTurn();   // 내가 둘 수가 없어 자동으로 쉰 경우
  }
  function undo() {
    if (J.phase !== 'play' || !hasUserMove() || J.hinting) return;
    AIW.cancel(); J.token++; J.busy = false; J.thinking = false;
    while (J.moves.length) {
      const col = (J.moves.length - 1) % 2 === 0 ? CHO : HAN;
      const m = J.moves.pop();
      if (col === J.user && m !== PASS) break;
    }
    // 내 차례가 될 때까지
    while (J.moves.length && sideToMove() !== J.user) J.moves.pop();
    J.sel = -1; J.targets = []; J.hint = null; J.passes = 0;
    rebuild(); renderAll(); save();
    say(pick(JCHAR[J.level].undo));
    if (sideToMove() === J.ai) aiTurn();
  }
  async function showHint() {
    if (!userCanPlay()) return;
    const token = J.token;
    J.busy = true; J.hinting = true; updateHUD();
    const r = await AIW.search(J.board, J.user, { timeMs: 1000, maxDepth: 5 });
    if (token !== J.token) return;
    J.busy = false; J.hinting = false;
    if (r.move === PASS || r.move == null) { toast('둘 수 있는 수가 없어요. 한 수 쉬세요.'); updateHUD(); return; }
    J.hint = { f: (r.move / 90) | 0, t: r.move % 90 }; J.hints++;
    say(pick(JCHAR[J.level].hint));
    renderMarks(); updateHUD(); save();
  }
  function finish(res) {
    AIW.cancel(); J.token++;
    Object.assign(J, { phase: 'over', busy: false, thinking: false, hinting: false, result: res, sel: -1, targets: [], hint: null });
    const key = LV_KEY[J.level], rec = stats[key] || { w: 0, l: 0, d: 0 };
    if (res.winner === 0) rec.d = (rec.d || 0) + 1; else if (res.winner === J.user) rec.w++; else rec.l++;
    stats[key] = rec; store.set(STATS_KEY, stats); store.del(SAVE_KEY);
    const ch = JCHAR[J.level];
    if (res.winner === 0) say(pick(ch.draw));
    else if (res.by !== 'resign') say(res.winner === J.user ? pick(ch.aiLose) : pick(ch.aiWin));
    if (res.winner === J.user) Sound.win(); else if (res.winner !== 0) Sound.lose(); else Sound.pass();
    renderAll();
    setTimeout(openResult, 350);
  }
  function openResult() {
    const r = J.result; if (!r) return;
    const ch = JCHAR[J.level], won = r.winner === J.user, draw = r.winner === 0;
    $('#jResAvatar').innerHTML = avatarSVG(J.level, 2);
    const title = $('#jResultTitle');
    title.textContent = draw ? '비겼어요' : won ? '이겼어요!' : '아쉽게 졌어요';
    title.classList.toggle('win', won);
    const reason = {
      mate: won ? '외통으로 이겼어요' : '외통수에 걸렸어요',
      resign: r.resigner === J.ai ? `${iga(ch.name)} 기권했어요` : '내가 기권했어요',
      bikjang: '궁이 마주 봐서(빅장) 비겼어요',
      limit: `${MAX_MOVES}수가 넘어 점수로 가렸어요`,
      pass: '둘 다 한 수 쉬어서 점수로 가렸어요'
    }[r.by];
    $('#jResultSub').textContent = reason;
    const p = JE.points(J.board), who = (s) => (s === J.user ? '나' : ch.name);
    const rec = stats[LV_KEY[J.level]] || { w: 0, l: 0, d: 0 };
    $('#jResultBody').innerHTML =
      `<table class="rtable"><thead><tr><th></th><th>남은 기물 점수</th><th>덤</th><th>합계</th></tr></thead><tbody>` +
      `<tr><td><span class="side-chip cho">초</span> ${who(CHO)}</td><td>${p.cho}</td><td>–</td><td class="sum">${p.cho}</td></tr>` +
      `<tr><td><span class="side-chip han">한</span> ${who(HAN)}</td><td>${p.han - 1.5}</td><td>1.5</td><td class="sum">${p.han}</td></tr></tbody></table>` +
      `<p class="result-sub" style="margin:10px 0 0">${ch.name} 상대 장기 전적 ${rec.w}승 ${rec.l}패${rec.d ? ` ${rec.d}무` : ''} · ${J.moves.length}수${J.hints ? ` · 힌트 ${J.hints}번` : ''}</p>`;
    const line = draw ? pick(ch.draw) : r.by === 'resign' && r.resigner === J.ai ? pick(ch.resign) : won ? pick(ch.aiLose) : pick(ch.aiWin);
    $('#jResultQuote').textContent = `${ch.name}: “${line}”`;
    openScrim('jResultScrim');
  }

  // ---- 설정 시트 ----
  function buildSetup() {
    let h = '';
    JCHAR.forEach((ch, i) => {
      const rec = stats[LV_KEY[i]];
      h += `<input class="sr" type="radio" name="jopp" id="jopp${i}" value="${i}"${i === prefs.level ? ' checked' : ''}>` +
        `<label class="opp" for="jopp${i}"><span class="avatar">${avatarSVG(i, 2)}</span><span class="otext">` +
        `<span class="oname">${ch.name}<span class="lvchip lv${i}">${ch.lv} · ${ch.title}</span></span>` +
        `<span class="odesc">${ch.desc}</span>` +
        `<span class="orec">${rec ? `장기 전적 ${rec.w}승 ${rec.l}패${rec.d ? ` ${rec.d}무` : ''}` : '아직 장기 기록이 없어요'}</span></span></label>`;
    });
    $('#jOppList').innerHTML = h;
  }
  function openSetup() {
    const pickRadio = (name, val) => { const r = document.querySelector(`input[name="${name}"][value="${val}"]`); if (r) r.checked = true; };
    pickRadio('jside', prefs.side); pickRadio('jsetup', prefs.setup); pickRadio('jlabels', prefs.labels);
    buildSetup();
    $('#jSetupClose').hidden = false;
    $('#jBtnStart').textContent = J.phase === 'play' ? '이 판 접고 새로 시작' : '대국 시작';
    openScrim('jSetupScrim');
  }
  function startFromSetup() {
    const val = (name, d) => (document.querySelector(`input[name="${name}"]:checked`) || { value: d }).value;
    const cfg = { level: +val('jopp', 1), side: val('jside', 'cho'), setup: val('jsetup', '마상상마'), labels: val('jlabels', 'hanja') };
    Object.assign(prefs, cfg); store.set(PREF_KEY, prefs);
    closeScrim('jSetupScrim');
    newGame(cfg);
  }

  // ---- 입력 ----
  function evPoint(e) {
    const r = el.svg.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * 940, vy = ((e.clientY - r.top) / r.height) * 1040;
    let x = Math.round((vx - JM) / JCS), y = Math.round((vy - JM) / JCS);
    if (x < 0 || y < 0 || x > 8 || y > 9) return -1;
    if (flip()) { x = 8 - x; y = 9 - y; }
    return y * 9 + x;
  }
  el.svg.addEventListener('pointerdown', () => Sound.ensure());
  el.svg.addEventListener('click', (e) => onTap(evPoint(e)));
  el.btnUndo.addEventListener('click', undo);
  el.btnHint.addEventListener('click', showHint);
  el.btnPass.addEventListener('click', userPass);
  el.btnResign.addEventListener('click', () => { if (J.phase === 'play') openScrim('jConfirmScrim'); });
  $('#jConfirmNo').addEventListener('click', () => closeScrim('jConfirmScrim'));
  $('#jConfirmYes').addEventListener('click', () => {
    closeScrim('jConfirmScrim');
    if (J.phase !== 'play') return;
    say(pick(JCHAR[J.level].aiWin));
    finish({ winner: J.ai, by: 'resign', resigner: J.user });
  });
  $('#jSetupClose').addEventListener('click', () => closeScrim('jSetupScrim'));
  $('#jBtnStart').addEventListener('click', startFromSetup);
  $('#jBtnAgain').addEventListener('click', () => newGame(prefs));
  $('#jBtnShowResult').addEventListener('click', openResult);
  $('#jResultClose').addEventListener('click', () => closeScrim('jResultScrim'));
  $('#jResAgain').addEventListener('click', () => { closeScrim('jResultScrim'); newGame(prefs); });
  $('#jResSetup').addEventListener('click', () => { closeScrim('jResultScrim'); openSetup(); });
  ['jSetupScrim', 'jResultScrim', 'jConfirmScrim'].map((id) => document.getElementById(id)).forEach((s) => s.addEventListener('click', (e) => {
    if (e.target !== s) return;
    if (s.id === 'jSetupScrim' && $('#jSetupClose').hidden) return;
    closeScrim(s.id);
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('#jConfirmScrim').classList.contains('open')) closeScrim('jConfirmScrim');
    else if ($('#jResultScrim').classList.contains('open')) closeScrim('jResultScrim');
    else if ($('#jSetupScrim').classList.contains('open') && !$('#jSetupClose').hidden) closeScrim('jSetupScrim');
  });

  // ---- 시작 ----
  function restore(s) {
    if (!s || ![CHO, HAN].includes(s.user) || ![0, 1, 2].includes(s.level) || !Array.isArray(s.moves) || !JE.SETUPS[s.choSetup] || !JE.SETUPS[s.hanSetup]) return false;
    Object.assign(J, { user: s.user, ai: -s.user, level: s.level, choSetup: s.choSetup, hanSetup: s.hanSetup, labels: s.labels === 'hangul' ? 'hangul' : 'hanja', hints: s.hints || 0 });
    J.moves = s.moves.filter((m) => Number.isInteger(m));
    rebuild(); J.phase = 'play';
    renderPlayers(); renderAll();
    say('이어서 둬요!');
    if (sideToMove() === J.ai) aiTurn();
    return true;
  }
  function start(data) {
    drawGrid();
    const saved = data && data.moves ? data : store.get(SAVE_KEY);
    let ok = false;
    if (saved) { try { ok = restore(saved); } catch (e) { console.error(e); ok = false; } }
    if (!ok) {
      J.level = prefs.level; J.labels = prefs.labels; J.user = prefs.side === 'han' ? HAN : CHO; J.ai = -J.user;
      rebuild(); J.phase = 'setup';
      renderPlayers(); renderAll();
      say(pick(JCHAR[J.level].greet));
    }
  }
  window.JanggiApp = { start, snapshot, openSetup, onShow() { if (J.phase === 'setup' && !this.shown) { this.shown = true; openSetup(); } } };
})();
