// ===== 홈 화면과 게임 방법 =====
window.HomeApp = (() => {
  const { avatarSVG, openScrim, closeScrim, pick, CHAR } = window.Buddies;
  const $ = (s) => document.querySelector(s);
  const hasB = (s) => { const c = s.charCodeAt(s.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; };
  const wa = (s) => s + (hasB(s) ? '과' : '와');

  // ---- 그림 ----
  function badukArt() {
    const sp = 15, m = 15, n = 7, end = m + (n - 1) * sp;
    let g = '';
    for (let i = 0; i < n; i++) { const c = m + i * sp; g += `<line x1="${m}" y1="${c}" x2="${end}" y2="${c}"/><line x1="${c}" y1="${m}" x2="${c}" y2="${end}"/>`; }
    const stones = [[2, 2, 1], [3, 2, 2], [4, 3, 1], [3, 3, 2], [2, 4, 2], [4, 4, 1], [3, 4, 1], [1, 3, 2], [5, 2, 1]];
    let st = '';
    for (const [x, y, c] of stones) st += `<circle cx="${m + x * sp + 1}" cy="${m + y * sp + 1.5}" r="6.6" fill="rgba(60,30,0,.3)"/><circle cx="${m + x * sp}" cy="${m + y * sp}" r="6.6" fill="url(#ha${c})"${c === 2 ? ' stroke="rgba(0,0,0,.2)" stroke-width=".6"' : ''}/>`;
    return `<svg viewBox="0 0 120 120" aria-hidden="true"><defs>
      <linearGradient id="hwood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2cd8c"/><stop offset="1" stop-color="#cf9748"/></linearGradient>
      <radialGradient id="ha1" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#737a90"/><stop offset=".45" stop-color="#262a35"/><stop offset="1" stop-color="#090a0e"/></radialGradient>
      <radialGradient id="ha2" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#efebe2"/><stop offset="1" stop-color="#c6c0b2"/></radialGradient></defs>
      <rect x="2" y="2" width="116" height="116" rx="12" fill="url(#hwood)"/>
      <g stroke="#4a2e10" stroke-width=".9" opacity=".8">${g}</g>
      <circle cx="${m + 3 * sp}" cy="${m + 3 * sp}" r="1.6" fill="#4a2e10"/>${st}</svg>`;
  }
  const oct = (r) => { const p = []; for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; p.push((r * Math.cos(a)).toFixed(2) + ',' + (r * Math.sin(a)).toFixed(2)); } return p.join(' '); };
  const piece = (x, y, ch, side, r) => `<g transform="translate(${x} ${y})"><polygon points="${oct(r)}" transform="translate(.8 1.2)" fill="rgba(60,30,0,.3)"/><polygon points="${oct(r)}" fill="url(#hpb)" stroke="#9c7339" stroke-width=".7"/>` +
    `<text text-anchor="middle" dominant-baseline="central" font-size="${(r * 1.15).toFixed(1)}" font-family="Noto Serif KR, serif" font-weight="700" fill="${side === 'cho' ? '#12744a' : '#c3262e'}">${ch}</text></g>`;
  function janggiArt() {
    const sp = 12.5, mx = 10, my = 9, W = mx * 2 + 8 * sp, H = my * 2 + 9 * sp;
    let g = '';
    for (let x = 0; x < 9; x++) g += `<line x1="${mx + x * sp}" y1="${my}" x2="${mx + x * sp}" y2="${my + 9 * sp}"/>`;
    for (let y = 0; y < 10; y++) g += `<line x1="${mx}" y1="${my + y * sp}" x2="${mx + 8 * sp}" y2="${my + y * sp}"/>`;
    for (const t of [0, 7]) g += `<line x1="${mx + 3 * sp}" y1="${my + t * sp}" x2="${mx + 5 * sp}" y2="${my + (t + 2) * sp}"/><line x1="${mx + 5 * sp}" y1="${my + t * sp}" x2="${mx + 3 * sp}" y2="${my + (t + 2) * sp}"/>`;
    const P = (x, y, c, s, r = 7.2) => piece(mx + x * sp, my + y * sp, c, s, r);
    const pcs = P(4, 1, '漢', 'han', 8.4) + P(6, 2, '馬', 'han') + P(2, 3, '兵', 'han', 6) + P(7, 0, '車', 'han') +
      P(4, 8, '楚', 'cho', 8.4) + P(1, 4, '車', 'cho') + P(4, 5, '包', 'cho') + P(6, 6, '卒', 'cho', 6) + P(3, 9, '士', 'cho', 6);
    return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs>
      <linearGradient id="hwood2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2cd8c"/><stop offset="1" stop-color="#cf9748"/></linearGradient>
      <radialGradient id="hpb" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#f3e3bf"/><stop offset="1" stop-color="#dcc08a"/></radialGradient></defs>
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="url(#hwood2)"/>
      <g stroke="#4a2e10" stroke-width=".7" opacity=".75">${g}</g>${pcs}</svg>`;
  }

  // ---- 홈 ----
  const CAST = [[0, 2, '하'], [1, 1, '중'], [2, 2, '상'], [3, 1, '프로']];
  function renderCast() {
    const box = $('#homeCast');
    box.innerHTML = CAST.map(([lv, stone, tag], i) =>
      `<button type="button" data-i="${i}" aria-label="${CHAR[lv].name} (${tag})"><span class="avatar">${avatarSVG(lv, stone)}</span><span class="nm">${CHAR[lv].name}</span><span class="lv">${tag}</span></button>`).join('');
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const lv = CAST[+b.dataset.i][0];
      window.FX.react(b.querySelector('.avatar'), 'happy');
      box.querySelectorAll('.say').forEach((s) => s.remove());
      const s = document.createElement('span'); s.className = 'say'; s.textContent = pick(CHAR[lv].greet);
      b.appendChild(s); clearTimeout(b._t); b._t = setTimeout(() => s.remove(), 2200);
      window.Buddies.Sound.ensure(); window.Buddies.Sound.stone(0.4);
    }));
  }
  function recText(r) {
    if (!r.w && !r.l && !r.d) return '아직 기록이 없어요. 첫 판을 둬 보세요!';
    return `내 전적 ${r.w}승 ${r.l}패${r.d ? ` ${r.d}무` : ''}`;
  }
  function refresh() {
    for (const [key, app, sfx] of [['Baduk', window.BadukApp, 'Baduk'], ['Janggi', window.JanggiApp, 'Janggi']]) {
      const sm = app.summary();
      const prog = $('#prog' + sfx), go = $('#home' + sfx + 'Go'), nw = $('#home' + sfx + 'New');
      prog.hidden = !sm.inProgress;
      prog.textContent = sm.inProgress ? `${wa(sm.opponent)} 두는 중 · ${sm.detail}` : '';
      go.textContent = sm.inProgress ? '이어서 두기' : '시작하기';
      nw.hidden = !sm.inProgress;
      $('#rec' + sfx).textContent = recText(sm.rec);
      void key;
    }
  }
  function openGame(view, fresh) {
    const app = view === 'baduk' ? window.BadukApp : window.JanggiApp;
    window.Router.show(view);
    if (fresh || !app.summary().inProgress) app.openSetup();
  }
  $('#homeBadukGo').addEventListener('click', () => openGame('baduk', false));
  $('#homeBadukNew').addEventListener('click', () => openGame('baduk', true));
  $('#homeJanggiGo').addEventListener('click', () => openGame('janggi', false));
  $('#homeJanggiNew').addEventListener('click', () => openGame('janggi', true));

  // ---- 게임 방법 ----
  const W = 20, M = 12;
  function grid(cols, rows, palace) {
    let g = '';
    for (let x = 0; x < cols; x++) g += `<line x1="${M + x * W}" y1="${M}" x2="${M + x * W}" y2="${M + (rows - 1) * W}"/>`;
    for (let y = 0; y < rows; y++) g += `<line x1="${M}" y1="${M + y * W}" x2="${M + (cols - 1) * W}" y2="${M + y * W}"/>`;
    if (palace) { const [x0, y0] = palace; g += `<line x1="${M + x0 * W}" y1="${M + y0 * W}" x2="${M + (x0 + 2) * W}" y2="${M + (y0 + 2) * W}"/><line x1="${M + (x0 + 2) * W}" y1="${M + y0 * W}" x2="${M + x0 * W}" y2="${M + (y0 + 2) * W}"/>`; }
    return g;
  }
  function diagram(cols, rows, inner, palace) {
    const w = M * 2 + (cols - 1) * W, h = M * 2 + (rows - 1) * W;
    return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><rect width="${w}" height="${h}" fill="url(#hwood)"/><g stroke="#4a2e10" stroke-width="1" opacity=".75">${grid(cols, rows, palace)}</g>${inner}</svg>`;
  }
  const at = (x) => M + x * W;
  const stoneD = (x, y, c, ghost) => `<circle cx="${at(x)}" cy="${at(y)}" r="9" fill="url(#ha${c})"${c === 2 ? ' stroke="rgba(0,0,0,.25)" stroke-width=".8"' : ''}${ghost ? ' opacity=".45"' : ''}/>`;
  const dot = (x, y) => `<circle class="mini-dot" cx="${at(x)}" cy="${at(y)}" r="3.6"/>`;
  const xm = (x, y) => `<path class="mini-x" d="M${at(x) - 4} ${at(y) - 4}l8 8M${at(x) + 4} ${at(y) - 4}l-8 8"/>`;
  const pc = (x, y, ch, side, r = 8.6) => piece(at(x), at(y), ch, side, r);
  const terr = (x, y) => `<rect x="${at(x) - 3.5}" y="${at(y) - 3.5}" width="7" height="7" rx="1.5" fill="#17181f"/>`;

  function badukHelp() {
    const cap = diagram(5, 5, stoneD(2, 2, 2) + stoneD(1, 2, 1) + stoneD(3, 2, 1) + stoneD(2, 1, 1) + stoneD(2, 3, 1, true) + dot(2, 3));
    const area = diagram(5, 5, [[0, 2], [1, 2], [2, 2], [2, 1], [2, 0]].map(([x, y]) => stoneD(x, y, 1)).join('') + [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => terr(x, y)).join('') + stoneD(3, 3, 2) + stoneD(4, 2, 2));
    const ko = diagram(4, 3, stoneD(1, 0, 1) + stoneD(0, 1, 1) + stoneD(1, 2, 1) + stoneD(2, 0, 2) + stoneD(1, 1, 2) + stoneD(3, 1, 2) + stoneD(2, 2, 2) + dot(2, 1));
    const end = diagram(4, 4, stoneD(1, 1, 1) + stoneD(2, 2, 2) + `<rect x="${at(0.15)}" y="${at(1.05)}" width="${W * 2.7}" height="${W * 0.9}" rx="8" fill="#2b52dc"/><text x="${at(1.5)}" y="${at(1.5)}" text-anchor="middle" dominant-baseline="central" font-family="Jua, sans-serif" font-size="15" fill="#fff">패스</text>`);
    return [
      ['집이 많으면 이겨요', '돌로 둘러싼 빈 곳이 집이에요. 끝났을 때 내 돌과 집을 더한 점수가 더 많으면 이겨요. 백은 덤 6.5점을 받아요.', area],
      ['둘러싸면 따내요', '상대 돌이 숨 쉴 곳(바로 옆 빈 점)을 모두 막으면 그 돌을 따내요. 내 돌도 똑같이 잡힐 수 있어요.', cap],
      ['패는 바로 못 되따요', '한 점을 서로 계속 따낼 수 있는 모양을 패라고 해요. 방금 따낸 자리는 다른 곳에 한 수 둔 다음에 따낼 수 있어요.', ko],
      ['끝내기는 패스로', '더 둘 곳이 없으면 패스하세요. 둘 다 패스하면 계가해요. 죽은 돌 판정이 틀리면 돌을 탭해서 바꿀 수 있어요.', end]
    ].map(([h, p, svg]) => `<section class="hsec">${svg}<div><h3>${h}</h3><p>${p}</p></div></section>`).join('');
  }
  function janggiHelp() {
    const cells = [
      ['궁 · 사', '궁성 밖으로 못 나가요. 선을 따라 한 칸씩, 대각선 선 위에선 대각선으로도.', diagram(3, 3, pc(1, 1, '楚', 'cho', 9.5) + [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]].map(([x, y]) => dot(x, y)).join(''), [0, 0])],
      ['차 (13점)', '가로·세로로 막힐 때까지 쭉. 궁성 안에선 대각선 선도 따라가요.', diagram(5, 5, pc(2, 2, '車', 'cho') + [[2, 0], [2, 1], [2, 3], [2, 4], [0, 2], [1, 2], [3, 2], [4, 2]].map(([x, y]) => dot(x, y)).join(''))],
      ['포 (7점)', '기물 하나를 꼭 넘어서 움직여요. 포끼리는 넘을 수도 잡을 수도 없어요.', diagram(3, 5, pc(1, 4, '包', 'cho') + pc(1, 2, '卒', 'cho', 7) + dot(1, 1) + dot(1, 0))],
      ['마 (5점)', '한 칸 곧게 간 뒤 대각선 한 칸. 첫 칸이 막히면 그쪽으론 못 가요.', diagram(5, 5, pc(2, 2, '馬', 'cho') + pc(2, 1, '兵', 'han', 7) + [[0, 1], [0, 3], [4, 1], [4, 3], [1, 4], [3, 4]].map(([x, y]) => dot(x, y)).join('') + xm(1, 0) + xm(3, 0))],
      ['상 (3점)', '한 칸 곧게 간 뒤 대각선 두 칸. 지나가는 칸이 막히면 못 가요.', diagram(7, 7, pc(3, 3, '象', 'cho') + [[1, 0], [5, 0], [1, 6], [5, 6], [0, 1], [6, 1], [0, 5], [6, 5]].map(([x, y]) => dot(x, y)).join(''))],
      ['졸 · 병 (2점)', '앞이나 옆으로 한 칸. 뒤로는 못 가요. 상대 궁성에선 대각선 앞으로도.', diagram(3, 3, pc(1, 1, '卒', 'cho', 7.5) + dot(1, 0) + dot(0, 1) + dot(2, 1))]
    ];
    const grid6 = `<div class="pgrid">${cells.map(([b, t, svg]) => `<div class="pcell">${svg}<b>${b}</b><span>${t}</span></div>`).join('')}</div>`;
    const check = diagram(3, 3, pc(1, 0, '漢', 'han', 9.5) + `<circle cx="${at(1)}" cy="${at(0)}" r="13" fill="none" stroke="#e03434" stroke-width="2"/>` + pc(1, 2, '車', 'cho'), [0, 0]);
    const rules = [
      ['장군을 부르고 외통으로', '상대 궁을 바로 잡을 수 있는 수가 장군, 그걸 피하는 게 멍군이에요. 어떻게 해도 장군을 못 피하면 외통, 그대로 이겨요.', check]
    ].map(([h, p, svg]) => `<section class="hsec">${svg}<div><h3>${h}</h3><p>${p}</p></div></section>`).join('');
    return rules + grid6 +
      `<p class="tip" style="margin:0">궁끼리 같은 줄에서 사이에 아무것도 없이 마주 보면 <b>빅장</b>으로 비겨요. 200수가 넘거나 둘 다 한 수 쉬면 남은 기물 점수로 가려요(한은 덤 1.5점). 장군이 아닐 땐 <b>한수쉼</b>도 할 수 있어요.</p>`;
  }
  function renderHelp(which) {
    $('#helpBody').innerHTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      <linearGradient id="hwood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2cd8c"/><stop offset="1" stop-color="#cf9748"/></linearGradient>
      <radialGradient id="ha1" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#737a90"/><stop offset=".45" stop-color="#262a35"/><stop offset="1" stop-color="#090a0e"/></radialGradient>
      <radialGradient id="ha2" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#efebe2"/><stop offset="1" stop-color="#c6c0b2"/></radialGradient>
      <radialGradient id="hpb" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#f3e3bf"/><stop offset="1" stop-color="#dcc08a"/></radialGradient></defs></svg>` +
      (which === 'janggi' ? janggiHelp() : badukHelp());
  }
  function openHelp() {
    const which = window.Router && window.Router.view === 'janggi' ? 'janggi' : 'baduk';
    document.getElementById(which === 'janggi' ? 'helpJ' : 'helpB').checked = true;
    renderHelp(which);
    openScrim('helpScrim');
  }
  document.querySelectorAll('input[name="helpg"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) renderHelp(r.value); }));
  $('#btnHelp').addEventListener('click', openHelp);
  $('#helpClose').addEventListener('click', () => closeScrim('helpScrim'));
  $('#helpScrim').addEventListener('click', (e) => { if (e.target.id === 'helpScrim') closeScrim('helpScrim'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#helpScrim').classList.contains('open')) closeScrim('helpScrim'); });

  function start() {
    $('#artBaduk').innerHTML = badukArt();
    $('#artJanggi').innerHTML = janggiArt();
    renderCast();
  }
  return { start, onShow: refresh, refresh, badukArt, janggiArt };
})();
