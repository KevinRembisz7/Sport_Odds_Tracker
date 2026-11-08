/* Edge Lab UI — renders the daily card (data/latest.js) and can rebuild it live in the browser. */
(() => {
  'use strict';
  const E = window.Engine, { toAm, pct, esc } = E;
  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('edge.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('edge.' + k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- state ----------
  let card = pickCard();
  const S = {
    tab: store.get('tab', 'top'), lg: 'ALL', market: 'ALL', q: '', sort: 'ev',
    slip: store.get('slip', []), bankroll: store.get('bankroll', 500), kfrac: store.get('kfrac', 0.25),
    key: store.get('key', ''), budget: store.get('budget2', 8), allBooks: store.get('allBooks', false), region: store.get('region', store.get('allBooks', false) ? 'all' : 'ca'),
    unit: store.get('unit', 0), day: 'ALL', time: 'ALL', team: 'ALL', glType: store.get('glType', 'ALL'),
    myBook: store.get('myBook', 'bet365'), section: store.get('section', 'props'), allPlayers: store.get('allPlayers', false), ladStart: store.get('ladStart', 10), newsSec: store.get('newsSec', 'plays'), injOnly: false, bestOnly: store.get('bestOnly', false), prices: store.get('prices', {}), type: 'ALL', shown: 120,
  };
  // "My sportsbook": any book you type prices in from (bet365 and the Canadian books The Odds API doesn't carry),
  // or 'best' = the best pulled price in your region (US / Canada / all)
  const TYPE_IN = ['bet365', 'Bet99', 'Sports Interaction', 'PROLINE+', 'NorthStar Bets', 'TonyBet', 'PowerPlay', 'Betway', 'Betano', 'LeoVegas', '888sport', 'bwin', 'Mise-o-jeu+', 'Casumo'];
  const B365 = () => S.myBook !== 'best';
  const MYB = () => B365() ? (S.myBook || 'bet365') : 'best price';
  const SB = () => ({ 'Sports Interaction': 'SIA', 'NorthStar Bets': 'NorthStar', 'Mise-o-jeu+': 'MOJ+', bet365: '365' })[MYB()] || MYB();
  const bookMode = () => S.region === 'all' ? true : S.region === 'ca' ? 'ca' : false;
  const EDGE_BUFFER = 0.02; // target price = break-even + 2% EV
  let byId = {};
  const H = window.EDGE_HISTORY || [];
  function pickCard() {
    const daily = window.EDGE_CARD, live = store.get('liveCard', null);
    if (live && (!daily || live.generatedAt > daily.generatedAt)) {
      // a Live refresh re-prices everything, but the picks stay the tracked ones from the daily card
      if (daily) for (const k of ['potd', 'potdSnap', 'potdParlay', 'ladder', 'earlierToday']) live[k] = daily[k];
      return live;
    }
    return daily;
  }
  function index() {
    byId = {};
    if (!card) return;
    for (const x of [...card.lines, ...card.props]) byId[x.id] = x;
    for (const x of card.board || []) if (!byId[x.id]) byId[x.id] = x;
    // locked picks (Pick / Parlay of the Day, ladder bet) stay findable even if their line moved off the board
    for (const x of [card.potdSnap, ...(card.potdParlay?.snaps || []), ...(card.ladder?.snaps || [])]) if (x && !byId[x.id]) byId[x.id] = x;
    for (const x of [...(card.earlierToday?.picks || []), ...(card.earlierToday?.parlays || []).flatMap(p => p.legs)]) if (x && !byId[x.id]) byId[x.id] = x;
    // Hide games that have already started from every list (slip legs, Pick of the Day and the Live tab
    // still find them through byId, so live tracking keeps working).
    const upcoming = x => !x.start || new Date(x.start) > Date.now();
    card.lines = card.lines.filter(upcoming); card.props = card.props.filter(upcoming);
    if (card.board) card.board = card.board.filter(upcoming);
    useRegion();
    applyPrices();
    S.slip = S.slip.filter(id => byId[id]);
  }
  // Price everything for the viewer's region: 🇨🇦 Canadian books (default), 🇺🇸 US books or 🌍 all. The card carries
  // every book's price (lines / props) and the best CA + US price (board), so this needs no extra API calls.
  // Anything that isn't +EV in your region drops off the pick lists.
  function useRegion() {
    if (card._region === S.region) return; card._region = S.region;
    E.applyBooks([...card.lines, ...card.props], bookMode());
    const k = S.region === 'ca' ? ['caDec', 'caBook'] : S.region === 'us' ? ['usDec', 'usBook'] : null;
    if (k) for (const x of card.board || []) if (x[k[0]] !== undefined && !x.prices) { x.dec = x[k[0]] || null; x.book = x[k[1]] || ''; x.ev = x.dec ? x.fairP * x.dec - 1 : null; }
    const keep = x => x.dec && x.ev >= (x.minEdge ?? 0.005);
    card.lines = card.lines.filter(keep); card.props = card.props.filter(keep);
  }
  // Prices the user typed in from their own book (bet365, Bet99, …) override the pulled best price.
  function applyPrices() {
    for (const x of Object.values(byId)) {
      if (!x._orig) x._orig = { dec: x.dec, book: x.book, ev: x.ev };
      const am = S.prices[x.id];
      if (am) { x.dec = E.toDec(am); x.book = MYB(); x.ev = x.fairP * x.dec - 1; x.mine = true; }
      else { Object.assign(x, x._orig); x.mine = false; }
    }
  }
  const targetAm = x => toAm((1 + EDGE_BUFFER) / x.fairP);
  function setPrice(id, raw) {
    const am = parseInt(String(raw).replace(/[^\d+-]/g, ''), 10);
    if (am && Math.abs(am) >= 100) S.prices[id] = am; else delete S.prices[id];
    store.set('prices', S.prices); applyPrices();
    render();
  }
  const priceInput = x => `<input class="pin" inputmode="numeric" data-price="${esc(x.id)}" placeholder="${esc(MYB())} odds" value="${S.prices[x.id] ? (S.prices[x.id] > 0 ? '+' : '') + S.prices[x.id] : ''}">`;

  // ---------- helpers ----------
  const fmtTime = iso => iso ? new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const signPct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
  const vibeCls = v => !v ? 'v-n' : v.score >= 2 ? 'v-g' : v.score <= -2 ? 'v-b' : 'v-n';
  const VIBE_HELP = 'Vibe = matchup score. +1 for each thing backing this bet (injuries, recent hit rate, ESPN model, form, scoring projection), −1 for each thing against it. 🟢 +2 or better · 🟡 mixed · 🔴 −2 or worse.';
  const vibeTxt = v => !v ? '—' : (v.score >= 2 ? '🟢 ' : v.score <= -2 ? '🔴 ' : '🟡 ') + (v.score > 0 ? '+' : '') + v.score;
  // ---------- recommended units (1u = 1% of bankroll unless set in Settings) ----------
  const unitSize = () => S.unit > 0 ? S.unit : Math.max(1, S.bankroll / 100);
  function unitsFor(x) {
    if (!x?.dec || x.ev == null) return null;
    if (x.ev <= 0 || isSus(x)) return 0;
    const b = x.dec - 1, kelly = Math.max(0, (b * x.fairP - (1 - x.fairP)) / b) * S.kfrac;
    let u = kelly * S.bankroll / unitSize();
    const v = x.vibe?.score || 0;
    if (v <= -2) u *= 0.5; else if (v >= 2) u *= 1.15;
    return Math.min(3, Math.max(0.25, Math.round(u * 4) / 4));
  }
  function unitsParlay(legs) {
    const st = E.parlayStats(legs, S.kfrac);
    if (st.ev <= 0) return 0;
    return Math.min(1, Math.max(0.1, Math.round(st.f * S.bankroll / unitSize() * 10) / 10));
  }
  const unitsTxt = (u, short) => u == null ? '' : u === 0 ? '0u · skip' : `${u}u${short ? '' : ` · $${(u * unitSize()).toFixed(2)}`}`;
  const unitsChip = u => u == null ? '' : `<span class="units ${u === 0 ? 'zero' : ''}" title="Recommended stake. 1 unit = $${unitSize().toFixed(2)} (1% of bankroll unless set in Settings)">💰 ${unitsTxt(u, true)}</span>`;
  const isSus = x => x.ev >= (x.type === 'prop' ? E.PROP_STALE : E.STALE);
  const gameOf = x => card.games?.[x.eventId];
  function teamSide(x) {
    const g = gameOf(x); if (!g || !x.team) return null;
    if (x.type === 'prop') return g.home.abbr === x.team ? g.home : g.away;
    return E.norm(x.team) === E.norm(x.home) ? g.home : g.away;
  }
  function avatar(x, cls = '') {
    if (x.type === 'prop' && x.headshot) return `<div class="avatar ${cls}"><img src="${esc(x.headshot)}" alt="" loading="lazy" onerror="this.remove()"></div>`;
    const t = teamSide(x);
    if (t?.logo) return `<div class="avatar logo ${cls}"><img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.remove()"></div>`;
    return `<div class="avatar ${cls}">${x.emoji || '🎲'}</div>`;
  }
  const propLabel = x => x.market === 'player_anytime_td' && x.point < 1 && !x.kalshi ? (x.side === 'Over' ? 'Anytime TD' : 'No TD') : x.kalshi ? (x.market === 'player_anytime_td' && x.point < 1 ? 'Anytime TD · Kalshi' : x.market === 'player_goal_scorer_anytime' ? 'Anytime goal · Kalshi' : `${Math.floor(x.point) + 1}+ ${x.statLabel} · Kalshi`) : x.alt && x.side === 'Over' ? `${Math.floor(x.point) + 1}+ ${x.statLabel} · ladder` : `${x.side} ${x.point} ${x.statLabel}${x.alt ? ' · alt' : ''}`;
  function titleOf(x) {
    if (x.type === 'prop') return { n: x.player, p: propLabel(x), g: `${x.team || ''}${x.opp ? ' vs ' + x.opp : ''} · ${x.game}` };
    if (x.market === 'totals') return { n: x.game, p: x.pick, g: 'Game total' };
    const g = gameOf(x), t = teamSide(x);
    const sub = (x.market === 'h2h' ? 'Moneyline' : `Spread ${x.point > 0 ? '+' : ''}${x.point}`) + (x.alt ? ' · alt line' : '');
    return { n: x.team, p: sub, g: (t && g ? `${t.rec ? t.rec + ' · ' : ''}` : '') + x.game };
  }
  function sparkSVG(hit, line, w = 120, h = 34) {
    if (!hit?.vals?.length) return '';
    const vals = [...hit.vals].reverse(), max = Math.max(line * 1.4, ...vals, 1), bw = w / vals.length;
    const y = v => h - (v / max) * (h - 2);
    const bars = vals.map((v, i) => `<rect x="${i * bw + 1}" y="${y(v)}" width="${bw - 2}" height="${h - y(v)}" rx="2"
      fill="${v > line ? 'var(--edge)' : 'var(--bad)'}" opacity=".85"><title>${v}</title></rect>`).join('');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${bars}
      <line x1="0" x2="${w}" y1="${y(line)}" y2="${y(line)}" stroke="var(--ink)" stroke-dasharray="3 3" stroke-width="1" opacity=".7"/></svg>`;
  }

  // ---------- pick card ----------
  function pickCard_(x, hot = false) {
    const t = titleOf(x), v = x.vibe, inSlip = S.slip.includes(x.id);
    const items = (v?.items || []).filter(i => i.tone !== 'n' || /🎯/.test(i.text)).slice(0, 2);
    const hit = x.vibe?.hit;
    return `<article class="card ${hot ? 'hot' : ''}" data-open="${esc(x.id)}">
      <div class="c-top"><span class="tag">${x.emoji} ${esc(x.lg)}</span><span>${esc(fmtTime(x.start))}</span>
        <span class="spacer"></span><span class="vibe ${vibeCls(v)}" title="${VIBE_HELP}">${vibeTxt(v)}</span></div>
      <div class="c-main">${avatar(x)}
        <div class="c-title"><div class="n">${esc(t.n)}</div><div class="p">${esc(t.p)}</div><div class="g">${esc(t.g)}</div></div>
        <div class="price"><b>${toAm(x.dec)}</b><small>${esc(x.book)}</small></div></div>
      <div>
        <div class="meter"><span>True</span><div class="track"><i style="width:${x.fairP * 100}%;background:var(--edge)"></i></div><b>${pct(x.fairP, 0)}</b></div>
        <div class="meter"><span>Book</span><div class="track"><i style="width:${100 / x.dec}%;background:var(--muted)"></i></div><b>${pct(1 / x.dec, 0)}</b></div>
      </div>
      ${hit ? `<div class="spark">${sparkSVG(hit, x.point)}<div><span class="hitrate">${hit.hits}/${hit.n}</span> ${x.side.toLowerCase()} last ${hit.n}<br>avg ${hit.avg.toFixed(1)} · line ${x.point}</div></div>` : ''}
      ${B365() ? `<div class="b365"><span>🎯 ${esc(MYB())} target <b>${targetAm(x)}</b> or better</span>${priceInput(x)}</div>` : ''}
      ${items.length ? `<ul class="why-mini">${items.map(i => `<li class="${i.tone}">${i.text}</li>`).join('')}</ul>` : ''}
      <div class="c-foot"><span class="edge ${x.ev < 0 ? 'neg' : ''}">${signPct(x.ev)} EV</span>${unitsChip(unitsFor(x))}
        <span class="muted" style="font-size:12px">fair ${toAm(1 / x.fairP)}</span>${isSus(x) ? '<span class="sus">⚠ sus line</span>' : ''}
        <button class="add ${inSlip ? 'in' : ''}" data-add="${esc(x.id)}">${inSlip ? '✓ In slip' : '+ Slip'}</button></div>
    </article>`;
  }

  // ---------- views ----------
  const TABS = [['top', '🔥 Top Picks'], ['live', '🔴 Live'], ['money', '💰 Money Builder'], ['climb', '🧗 12-Day Ladder'], ['board', '🗂️ Bet Board'], ['sheet', '📋 Fair Odds'], ['props', '🎯 Player Props'], ['alts', '🪜 Alt Lines'], ['lines', '📊 Game Lines'], ['parlays', '🧮 Parlays'], ['news', '📰 News'], ['record', '📈 Record'], ['how', '📘 How it works']];
  function renderTabs() {
    $('tabs').innerHTML = TABS.map(([k, l]) => [k, k === 'sheet' && B365() ? `📋 ${MYB()} Sheet` : l]).map(([k, l]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('');
    requestAnimationFrame(() => { $('tabs').querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); tabArrows(); });
  }
  // ◀ ▶ arrows for the tab bar (mice can't swipe sideways); shown only when there are tabs hidden off that edge
  function tabArrows() {
    const t = $('tabs'), w = t?.parentElement; if (!t || !w) return;
    const canL = t.scrollLeft > 4, canR = t.scrollLeft + t.clientWidth < t.scrollWidth - 4;
    $('tabL').hidden = !canL; $('tabR').hidden = !canR;
    w.classList.toggle('canL', canL); w.classList.toggle('canR', canR);
  }
  (function setupTabArrows() {
    const t = $('tabs'); if (!t) return;
    const go = dir => t.scrollBy({ left: dir * Math.max(200, t.clientWidth * 0.7), behavior: 'smooth' });
    $('tabL').addEventListener('click', () => go(-1)); $('tabR').addEventListener('click', () => go(1));
    t.addEventListener('scroll', tabArrows, { passive: true }); window.addEventListener('resize', tabArrows);
    // a normal mouse wheel scrolls the tab bar sideways while the pointer is over it
    t.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && t.scrollWidth > t.clientWidth) { t.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  })();
  function leagues(items) { return ['ALL', ...new Set(items.map(x => x.lg))]; }
  const dayKey = iso => iso ? new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const timeKey = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const teamsOf = x => [x.home, x.away].filter(t => t && t !== 'Draw');
  // sport / stat / type / search only — used to build the day, time and team menus
  function baseFiltered(items) {
    const q = E.norm(S.q);
    return items.filter(x => (S.lg === 'ALL' || x.lg === S.lg) && (S.market === 'ALL' || x.statLabel === S.market)
      && (S.type === 'ALL' || x.type === S.type) && (!q || E.norm(x.pick + ' ' + x.game).includes(q)));
  }
  function filtered(items) {
    return baseFiltered(items).filter(x => (S.day === 'ALL' || dayKey(x.start) === S.day)
      && (S.time === 'ALL' || timeKey(x.start) === S.time)
      && (S.team === 'ALL' || teamsOf(x).includes(S.team)));
  }
  const LG_ORDER = ['NFL', 'NCAAF', 'NBA', 'NCAAB', 'NHL', 'MLB', 'EPL', 'UCL', 'UEL', 'UECL', 'FA Cup', 'EFL Cup', 'LaLiga', 'SerieA', 'Bundesliga', 'Ligue1', 'MLS', 'ATP', 'WTA', 'MMA'];
  const lgRank = x => { const i = LG_ORDER.indexOf(x.lg); return i < 0 ? 99 : i; };
  function sortItems(items) {
    if (S.sort === 'sport') return [...items].sort((a, b) => lgRank(a) - lgRank(b) || (b.ev ?? -9) - (a.ev ?? -9));
    const k = { ev: x => x.ev ?? -9, vibe: x => (x.vibe?.score || 0) + x.ev, hit: x => x.vibe?.hit?.l10 ?? -1, time: x => -new Date(x.start) }[S.sort] || (x => x.ev);
    return [...items].sort((a, b) => k(b) - k(a));
  }
  function whenTeamMenus(items) {
    const base = baseFiltered(items).filter(x => x.start);
    const byStart = [...base].sort((a, b) => a.start.localeCompare(b.start));
    const days = [...new Set(byStart.map(x => dayKey(x.start)))];
    if (S.day !== 'ALL' && !days.includes(S.day)) S.day = 'ALL';
    const inDay = byStart.filter(x => S.day === 'ALL' || dayKey(x.start) === S.day);
    const times = [...new Set(inDay.map(x => (S.day === 'ALL' ? dayKey(x.start) + ' · ' : '') + timeKey(x.start)))];
    const timeVal = t => t.includes(' · ') ? t.split(' · ')[1] : t;
    if (S.time !== 'ALL' && !inDay.some(x => timeKey(x.start) === S.time)) S.time = 'ALL';
    const inTime = inDay.filter(x => S.time === 'ALL' || timeKey(x.start) === S.time);
    const teams = [...new Set(inTime.flatMap(teamsOf))].sort();
    if (S.team !== 'ALL' && !teams.includes(S.team)) S.team = 'ALL';
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
    return `<select id="fDay" title="Day">${opt('ALL', '📅 All days', S.day)}${days.map(d => opt(d, d, S.day)).join('')}</select>
      <select id="fTime" title="Game time">${opt('ALL', '🕐 All times', S.time)}${[...new Map(times.map(t => [timeVal(t), t])).entries()].map(([v, l]) => opt(v, l, S.time)).join('')}</select>
      <select id="fTeam" title="Team">${opt('ALL', '🏟️ All teams', S.team)}${teams.map(t => opt(t, t, S.team)).join('')}</select>`;
  }
  function renderFilters(items, opts = {}) {
    if (!items) { $('filters').innerHTML = ''; return; }
    const lg = leagues(items);
    const markets = opts.markets ? ['ALL', ...new Set(items.filter(x => S.lg === 'ALL' || x.lg === S.lg).map(x => x.statLabel))] : null;
    $('filters').innerHTML = lg.map(l => `<button class="chip ${S.lg === l ? 'on' : ''}" data-lg="${esc(l)}">${l === 'ALL' ? 'All' : esc(l)}</button>`).join('')
      + (markets && markets.length > 2 ? '<span style="width:8px"></span>' + markets.map(m => `<button class="chip ${S.market === m ? 'on' : ''}" data-mk="${esc(m)}">${m === 'ALL' ? 'All stats' : esc(m)}</button>`).join('') : '')
      + `<span class="spacer"></span>${whenTeamMenus(items)}<input id="q" placeholder="Search team or player" value="${esc(S.q)}" size="18">
         ${opts.sheet ? '<select id="type"><option value="ALL">Lines + props</option><option value="line">Game lines</option><option value="prop">Player props</option></select>' : ''}
         <select id="sort"><option value="ev">Sort: Edge</option><option value="vibe">Sort: Vibe</option>${opts.markets ? '<option value="hit">Sort: Hit rate</option>' : ''}<option value="time">Sort: Start time</option><option value="sport">Sort: Sport</option></select>`;
    $('sort').value = S.sort;
    if ($('type')) $('type').value = S.type;
  }

  function viewTop() {
    const all = [...card.lines, ...card.props].filter(x => !isSus(x));
    const best = sortItems(filtered(all).filter(x => (x.vibe?.score || 0) >= 0)).sort((a, b) =>
      (b.ev + (b.vibe?.score || 0) * 0.012) - (a.ev + (a.vibe?.score || 0) * 0.012)).slice(0, 12);
    const fades = filtered(all).filter(x => x.vibe?.score <= -2).sort((a, b) => b.ev - a.ev).slice(0, 3);
    return `${liveBanner()}${heroHTML()}${recordStrip()}
      <div class="sec"><h2>Best bets on the board</h2><span>edge + matchup backing, sus lines removed</span></div>
      ${best.length ? `<div class="grid">${best.map((x, i) => pickCard_(x, i < 3)).join('')}</div>` : empty('No +EV picks match these filters.')}
      ${card.parlays?.length ? `<div class="sec"><h2>Today's parlays</h2><span>auto-built, one leg per game</span></div><div class="pgrid">${card.parlays.map((p, i) => parlayCard(p, i === 1)).join('')}</div>` : ''}
      ${fades.length ? `<div class="sec"><h2>🚩 Price says yes, matchup says no</h2><span>+EV on paper, but the data fades them — tap to see why</span></div><div class="grid">${fades.map(x => pickCard_(x)).join('')}</div>` : ''}`;
  }
  // ---------- pick / parlay of the day + track record ----------
  function heroHTML() {
    const p = byId[card.potd], par = card.potdParlay;
    if (!p && !par) return '';
    // every earlier pick / parlay today stays on the page with its result (they're all on the record)
    const todayH = H.find(h => h.date === (card.generatedAt ? new Date(card.generatedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '') : ''));
    const resB = (r, actual) => `<span class="res ${esc(r || 'pending')}">${r === 'won' ? '✅ Won' : r === 'lost' ? '❌ Lost' : r === 'push' ? '➖ Push' : r === 'void' ? '⚪ Void' : '⏳ Pending'}</span>${actual ? ` <span class="muted">${esc(actual)}</span>` : ''}`;
    const prevPicks = todayH ? (todayH.picks || []).filter(x => x.id !== card.potd).reverse() : [];
    const prevPars = todayH ? (todayH.parlays || []).filter(x => x.legs.map(l => l.id).join() !== (par?.legs || []).join()).reverse() : [];
    const nP = todayH?.picks?.length || 0, nX = todayH?.parlays?.length || 0;
    const earlierHTML = prevPicks.length || prevPars.length ? `<div class="earlier"><div class="sec" style="margin-top:14px"><h2>📌 Earlier picks today</h2><span>replaced by a better pick, but still tracked on the record</span></div>
      ${prevPicks.map(x => `<div class="erow">${avatar(x)}<div class="t"><small class="muted">⭐ Pick #${(todayH.picks.indexOf(x)) + 1} of ${nP}</small><b>${esc(x.pick)}</b><span class="muted">${esc(x.game)} · ${toAm(x.dec)} ${esc(x.book || '')}</span></div><div>${resB(x.result, x.actual)}</div></div>`).join('')}
      ${prevPars.map(x => `<div class="erow"><div class="avatar">🎯</div><div class="t"><small class="muted">🎯 Parlay #${todayH.parlays.indexOf(x) + 1} of ${nX} · ${toAm(x.dec)}</small>${x.legs.map(l => `<span>${l.result === 'won' ? '✅' : l.result === 'lost' ? '❌' : '⏳'} ${esc(l.pick)}${l.actual ? ` <span class="muted">(${esc(l.actual)})</span>` : ''}</span>`).join('')}</div><div>${resB(x.result)}</div></div>`).join('')}</div>` : '';
    const vs = typeof p?.vibe === 'number' ? p.vibe : p?.vibe?.score;
    const why = p ? [p.ev != null ? `<b>${signPct(p.ev)}</b> edge` : '', p.fairP ? `<b>${pct(p.fairP, 0)}</b> to hit` : '', vs != null ? `vibe <b>${vs > 0 ? '+' : ''}${vs}</b>` : '',
      p.vibe?.hit ? `cleared <b>${p.vibe.hit.hits}/${p.vibe.hit.n}</b> recent games` : p.hit ? `cleared <b>${p.hit.hits}/${p.hit.n}</b> recent games` : '', p.dec ? `bet <b>${unitsTxt(unitsFor(p))}</b>` : ''].filter(Boolean).join(' · ') : '';
    return `<div class="hero2">
      ${p ? `<div><div class="ribbon">⭐ PICK OF THE DAY${nP > 1 ? ` · #${nP} (newest)` : ''}</div>${pickCard_(p, true)}<p class="note">Why it's the pick: ${why}</p></div>` : ''}
      ${par ? `<div><div class="ribbon alt">🎯 PARLAY OF THE DAY${nX > 1 ? ` · #${nX} (newest)` : ' · most likely to hit'}</div>${parlayCard({ name: 'Parlay of the Day', emoji: '🎯', blurb: `Every leg ${'≥'}50% to win on its own, all +EV, one per game`, legs: par.legs }, true)}</div>` : ''}
    </div>${earlierHTML}`;
  }
  const dayPicks = h => h.picks || (h.potd ? [h.potd] : []), dayParlays = h => h.parlays || (h.parlay ? [h.parlay] : []);
  function settledRows(kind) {
    return H.flatMap(h => {
      if (kind === 'potd') return dayPicks(h).map(x => ({ date: h.date, dec: x.dec, p: x.fairP, result: x.result, label: x.pick, actual: x.actual, odds: toAm(x.dec) }));
      if (kind === 'parlay') return dayParlays(h).map(x => ({ date: h.date, dec: x.legs.reduce((a, l) => a * (l.result === 'won' ? l.dec : 1), 1), p: x.p, result: x.result, label: x.legs.map(l => l.pick).join(' + '), legs: x.legs, odds: toAm(x.dec) }));
      if (kind === 'ladder' && h.ladder) return [{ date: h.date, dec: h.ladder.dec, p: h.ladder.p, result: h.ladder.result, label: h.ladder.legs.map(l => l.pick).join(' + '), legs: h.ladder.legs, odds: toAm(h.ladder.dec) }];
      return [];
    });
  }
  function recordOf(kind) {
    const rows = settledRows(kind), done = rows.filter(r => ['won', 'lost', 'push', 'void'].includes(r.result));
    const W = done.filter(r => r.result === 'won').length, L = done.filter(r => r.result === 'lost').length, P = done.length - W - L;
    const units = done.reduce((a, r) => a + (r.result === 'won' ? r.dec - 1 : r.result === 'lost' ? -1 : 0), 0);
    const wl = done.filter(r => r.result === 'won' || r.result === 'lost');
    const exp = wl.length ? wl.reduce((a, r) => a + r.p, 0) / wl.length : null;
    return { rows, done, W, L, P, units, exp, act: wl.length ? W / wl.length : null };
  }
  const resDot = r => `<span class="rd ${esc(r.result)}" title="${esc(r.date)} · ${esc(r.label)}${r.actual ? ' · ' + esc(r.actual) : ''}">${r.result === 'won' ? '✓' : r.result === 'lost' ? '✕' : r.result === 'pending' ? '•' : '–'}</span>`;
  function recordStrip() {
    const a = recordOf('potd'), b = recordOf('parlay'), c = recordOf('ladder');
    if (!a.rows.length && !b.rows.length) return '';
    const tile = (title, r) => `<div class="kpi"><div class="l">${title}</div>
      <div class="v">${r.done.length ? `${r.W}-${r.L}${r.P ? '-' + r.P : ''}` : '—'}</div>
      <div class="s">${r.done.length ? `<span style="color:${r.units >= 0 ? 'var(--edge)' : 'var(--bad)'}">${r.units >= 0 ? '+' : ''}${r.units.toFixed(2)}u</span> · hit ${pct(r.act ?? 0, 0)} vs ${pct(r.exp ?? 0, 0)} expected` : 'first result grades tomorrow morning'}</div>
      <div class="dots2">${r.rows.slice(0, 10).map(resDot).join('')}</div></div>`;
    return `<div class="sec"><h2>📈 Track record</h2><span>auto-graded from final box scores · 1 unit flat stakes · <a href="#" data-tab="record">full history →</a></span></div>
      <div class="kpis" style="grid-template-columns:repeat(${c.rows.length ? 3 : 2},minmax(0,1fr))">${tile('⭐ Pick of the Day', a)}${tile('🎯 Parlay of the Day', b)}${c.rows.length ? tile('🧗 Ladder bet', c) : ''}</div>
      <p class="note">🔒 Every Pick and Parlay of the Day the site ever posts is on this record. Posted picks are never changed: when a better one comes along it's added on top as Pick #2, #3…, and the earlier ones stay up and get graded too. Full transparency, every loss counts.</p>`;
  }
  function clvStats() {
    const legs = H.flatMap(h => [...(h.clv || []), ...dayPicks(h).filter(l => l.type === 'line'), ...dayParlays(h).flatMap(p => p.legs).filter(l => l.type === 'line')]);
    const uniq = [...new Map(legs.map(l => [l.id, l])).values()].filter(l => l.close);
    const beat = uniq.filter(l => l.close.beat).length, withPct = uniq.filter(l => l.close.clv != null);
    const avg = withPct.length ? withPct.reduce((a, l) => a + l.close.clv, 0) / withPct.length : null;
    return { n: uniq.length, beat, avg, pending: legs.filter(l => l.close == null).length };
  }
  function clvPanel() {
    const c = clvStats();
    const verdict = c.n < 20 ? `Need ~20+ graded lines for a real read (${c.n} so far${c.pending ? `, ${c.pending} waiting for close` : ''}).`
      : c.beat / c.n >= 0.55 ? '🟢 Beating the close consistently — that’s what a real edge looks like.'
      : c.beat / c.n >= 0.5 ? '🟡 Roughly even with the close — edge is thin.' : '🔴 The market is moving against these picks — treat the edges with suspicion.';
    return `<div class="sec"><h2>📉 Closing line value</h2><span>did we get a better price than the final line at kickoff?</span></div>
      <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="kpi"><div class="l">Beat the close</div><div class="v">${c.n ? `${c.beat}/${c.n}` : '—'}</div><div class="s">${c.n ? pct(c.beat / c.n, 0) + ' of picks' : 'starts after today’s games'}</div></div>
        <div class="kpi"><div class="l">Avg CLV</div><div class="v" style="color:${c.avg == null ? 'inherit' : c.avg >= 0 ? 'var(--edge)' : 'var(--bad)'}">${c.avg == null ? '—' : signPct(c.avg)}</div><div class="s">vs DraftKings closing no-vig</div></div>
        <div class="kpi"><div class="l">Verdict</div><div class="s" style="white-space:normal;font-size:13px;color:var(--ink)">${verdict}</div></div>
      </div>
      <p class="note">CLV is the pro’s scoreboard: wins and losses take hundreds of bets to mean anything, but consistently getting a better price than the closing line shows the edge is real within a few weeks. Tracks every +EV game line on the card (props have no free closing data).</p>`;
  }
  function viewRecord() {
    if (!H.length) return clvPanel() + empty('No history yet. Every morning the Pick and Parlay of the Day get saved, then graded from the final box scores the next morning.');
    const badge = r => `<span class="res ${esc(r)}">${r === 'won' ? '✅ Won' : r === 'lost' ? '❌ Lost' : r === 'push' ? '➖ Push' : r === 'void' ? '⚪ Void' : r === 'ungraded' ? '— n/a' : '⏳ Pending'}</span>`;
    return `${recordStrip()}${clvPanel()}<div class="sec"><h2>Every pick, every result</h2></div>
      <div class="tbl"><div class="scroll"><table><thead><tr><th>Date</th><th>Type</th><th>Pick</th><th>Odds</th><th>Win %</th><th>Result</th><th>Final</th></tr></thead><tbody>
      ${H.map(h => [
        ...dayPicks(h).map((x, i) => `<tr><td>${esc(h.date.replace(/(\d{4})(\d\d)(\d\d)/, '$2/$3'))}</td><td>⭐ Pick${dayPicks(h).length > 1 ? ` #${i + 1}` : ''}</td><td><b>${esc(x.pick)}</b><br><span class="muted">${esc(x.game)}</span></td><td>${toAm(x.dec)} <span class="muted">${esc(x.book)}</span></td><td>${pct(x.fairP, 0)}</td><td>${badge(x.result)}</td><td class="muted">${esc(x.actual || '')}</td></tr>`),
        h.ladder ? `<tr><td>${esc(h.date.replace(/(\d{4})(\d\d)(\d\d)/, '$2/$3'))}</td><td>🧗 Ladder</td><td>${h.ladder.legs.map(l => `${badge(l.result).replace(/ (Won|Lost|Push|Void|Pending|n\/a)/, '')} ${esc(l.pick)} <span class="muted">${esc(l.actual || '')}</span>`).join('<br>')}</td><td>${toAm(h.ladder.dec)}</td><td>${pct(h.ladder.p, 0)}</td><td>${badge(h.ladder.result)}</td><td></td></tr>` : '',
        ...dayParlays(h).map((x, i) => `<tr><td>${esc(h.date.replace(/(\d{4})(\d\d)(\d\d)/, '$2/$3'))}</td><td>🎯 Parlay${dayParlays(h).length > 1 ? ` #${i + 1}` : ''}</td><td>${x.legs.map(l => `${badge(l.result).replace(/ (Won|Lost|Push|Void|Pending|n\/a)/, '')} ${esc(l.pick)} <span class="muted">${esc(l.actual || '')}</span>`).join('<br>')}</td><td>${toAm(x.dec)}</td><td>${pct(x.p, 0)}</td><td>${badge(x.result)}</td><td></td></tr>`),
      ].join('')).join('')}
      </tbody></table></div></div>`;
  }
  // ---------- money builder: bets that (nearly) double your money ----------
  const DBL_MIN = 1.8, DBL_MAX = 2.25;
  function doublers() {
    const pool = E.parlayPool([...card.lines, ...card.props]);
    const singles = pool.filter(x => x.dec >= DBL_MIN && x.dec <= DBL_MAX)
      .sort((a, b) => (b.fairP + (b.vibe?.score || 0) * 0.01) - (a.fairP + (a.vibe?.score || 0) * 0.01)).slice(0, 6);
    const favs = pool.filter(x => x.fairP >= 0.55).sort((a, b) => b.fairP - a.fairP);
    const combos = [], seen = new Set();
    for (const k of [2, 3]) for (const r of E.buildParlays(favs, k, 'hit', S.kfrac)) {
      if (r.s.dec < DBL_MIN || r.s.dec > DBL_MAX) continue;
      const key = r.legs.map(l => l.id).sort().join('|'); if (seen.has(key)) continue;
      seen.add(key); combos.push(r);
    }
    combos.sort((a, b) => b.s.p - a.s.p);
    // keep variety: no leg in more than 2 of the shown doublers
    const used = {}, picked = [];
    for (const c of combos) {
      if (c.legs.some(l => (used[l.id] || 0) >= 2)) continue;
      c.legs.forEach(l => used[l.id] = (used[l.id] || 0) + 1); picked.push(c);
      if (picked.length >= 6) break;
    }
    return { singles, combos: picked };
  }
  function ladderHTML(p, dec) {
    return `<div class="ladder">${[1, 2, 3, 4, 5].map(n => {
      const chance = p ** n, amt = (10 * dec ** n).toFixed(n > 2 ? 0 : 2).replace(/\.00$/, '');
      return `<div class="rung"><div class="amt">$${amt}</div><div class="track" style="height:8px"><i style="width:${chance * 100}%;background:var(--edge)"></i></div>
        <div class="muted" style="font-size:12px">${pct(chance, chance < 0.1 ? 1 : 0)} to get here · ${n} win${n > 1 ? 's' : ''} in a row</div></div>`;
    }).join('')}</div>`;
  }
  // ---------- 🧗 12-Day Ladder: one ~2x bet a day, roll it all over, a loss sends you back to Day 1 ----------
  function viewClimb() {
    const N = E.LADDER_DAYS, st = E.ladderState(H, +S.ladStart || 10), lad = card.ladder;
    const fmt$ = v => v >= 1000 ? '$' + Math.round(v).toLocaleString() : '$' + v.toFixed(2).replace(/\.00$/, '');
    const avgDec = lad?.dec || 1.95, avgP = lad?.p || 0.52;
    // amounts for this attempt: settled wins so far, then projected at today's odds
    const cur = st.log.filter(r => r.result === 'won' || r.result === 'push' || r.result === 'void').slice(0, st.step - 1).reverse();
    const steps = Array.from({ length: N }, (_, i) => {
      const n = i + 1, done = n < st.step, now = n === st.step;
      const amt = done ? null : st.roll * avgDec ** (n - st.step + 1);
      return `<div class="lstep ${done ? 'done' : now ? 'now' : ''}"><small>Day ${n}</small><b>${done ? '✓' : fmt$(amt)}</b></div>`;
    }).join('');
    const finish = avgP ** (N - st.step + 1);
    const todayRow = st.log.find(r => r.date === H.find(h => h.ladder)?.date && r.result === 'pending');
    const lastLoss = st.log.find(r => r.result === 'lost');
    const tiles = [
      ['Current day', `${st.step} / ${N}`, `${fmt$(st.roll)} riding today`],
      ['Ladders completed', st.completed, st.banked ? `${fmt$(st.banked)} banked` : `finish = ${fmt$((+S.ladStart || 10) * avgDec ** N)} from ${fmt$(+S.ladStart || 10)}`],
      ['Attempts', st.attempts, `every loss starts a new one`],
      ['Ladder record', `${st.W}-${st.L}${st.P ? '-' + st.P : ''}`, `best run: <b>${st.best}</b> day${st.best === 1 ? '' : 's'} in a row`],
    ];
    return `<div class="sec"><h2>🧗 12-Day Ladder</h2><span>one bet a day that roughly doubles your money · win 12 in a row to finish · a loss sends you back to Day 1</span></div>
      <div class="howto">🎯 <b>The rules:</b> start with ${fmt$(+S.ladStart || 10)} <span class="muted">(change it: <input id="ladStart" type="number" min="1" step="1" value="${esc(S.ladStart)}" style="width:70px">)</span>. Each day the app picks <b>one bet paying about 2x</b> (-125 to +110), either a single or 2 likely legs stacked. Roll the whole amount onto the next day's bet. 12 wins = ${fmt$((+S.ladStart || 10) * avgDec ** N)}. It's a long shot by design: even at ${pct(avgP, 0)} a day, finishing all 12 from Day 1 is about <b>${pct(avgP ** N, 2)}</b>. Picks lock when posted and are graded from box scores, so every loss counts.</div>
      <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">${tiles.map(([l, v, s2]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s2}</div></div>`).join('')}</div>
      <div class="lsteps">${steps}</div>
      <p class="note">From Day ${st.step}, the chance to finish all ${N} at today's odds is about <b>${pct(finish, finish < 0.01 ? 2 : 1)}</b>.${lastLoss ? ` Last reset: ${esc(lastLoss.date.replace(/(\d{4})(\d\d)(\d\d)/, '$2/$3'))} (lost on Day ${lastLoss.step}).` : ''}</p>
      <div class="sec"><h2>Today's ladder bet · Day ${st.step}</h2><span>${lad ? `${toAm(lad.dec)} · ${fmt$(st.roll)} pays ${fmt$(st.roll * lad.dec)} · ${pct(lad.p, 0)} to hit · ${signPct(lad.ev)} EV` : ''}</span></div>
      ${lad ? `<div class="pgrid">${parlayCard({ name: `Ladder · Day ${st.step}`, emoji: '🧗', blurb: lad.legs.length > 1 ? 'Two likely legs stacked to pay about 2x' : 'One bet paying about 2x', legs: lad.legs }, true)}</div>`
        : empty('No bet in the 2x range with an edge today. The ladder waits: skip today and roll tomorrow (no loss, no reset).')}
      <div class="sec"><h2>Ladder log</h2><span>every day, graded automatically</span></div>
      ${st.log.length ? `<div class="tbl"><div class="scroll"><table><thead><tr><th>Date</th><th>Day</th><th>Bet</th><th>Odds</th><th>Riding</th><th>Result</th><th>After</th></tr></thead><tbody>
        ${st.log.map(r => `<tr><td>${esc(r.date.replace(/(\d{4})(\d\d)(\d\d)/, '$2/$3'))}</td><td><b>${r.step}</b>/${N}</td><td>${r.picks.map(esc).join('<br>')}</td><td>${toAm(r.dec)}</td><td>${fmt$(r.roll)}</td>
          <td><span class="res ${esc(r.result)}">${r.result === 'won' ? '✅ Won' : r.result === 'lost' ? '❌ Lost' : r.result === 'pending' ? '⏳ Pending' : '➖ ' + esc(r.result)}</span></td>
          <td>${r.result === 'won' ? `<b style="color:var(--edge)">${fmt$(r.after)}</b>${r.banked ? ' 🏆 ladder done!' : ''}` : r.result === 'lost' ? '<span style="color:var(--bad)">💥 back to Day 1</span>' : r.result === 'pending' ? '' : fmt$(r.after)}</td></tr>`).join('')}
      </tbody></table></div></div>` : empty('The ladder starts with today\'s bet. Results show up here after the games are graded.')}`;
  }
  function viewMoney() {
    const { singles, combos } = doublers();
    const opts = [...singles.map(x => ({ p: x.fairP, dec: x.dec })), ...combos.map(c => ({ p: c.s.p, dec: c.s.dec }))];
    const best = opts.sort((a, b) => b.p - a.p)[0], bestP = best?.p || 0;
    return `<div class="sec"><h2>💰 Money Builder</h2><span>bets that double your money (or close): $10 → $18–$22.50 · all +EV · ranked by chance to hit</span></div>
      <div class="howto">💡 Even-money bets win about half the time, so the goal isn't a lock. It's getting <b>paid more than the real odds</b>, over and over. Same small stake every time and let the edge do the work.</div>
      ${combos.length ? `<div class="sec"><h2>🔁 Doublers</h2><span>2–3 strong favorites stacked to pay about 2x</span></div>
        <div class="pgrid">${combos.map((c, i) => parlayCard({ name: `Doubler #${i + 1}`, emoji: '💵', blurb: `${toAm(c.s.dec)} · $10 pays $${(10 * c.s.dec).toFixed(2)}`, legs: c.legs.map(l => l.id) }, i === 0)).join('')}</div>`
        : empty('No +EV favorite combos land near 2x today.')}
      ${singles.length ? `<div class="sec"><h2>🎯 Straight doublers</h2><span>single bets already near even money</span></div>
        <div class="grid">${singles.map(x => pickCard_(x)).join('')}</div>` : ''}
      ${bestP ? `<div class="sec"><h2>🪜 Double-up ladder</h2><span>what letting it ride really looks like with today's best doubler (${pct(bestP, 0)} to hit, ${best ? toAm(best.dec) : ''} per step)</span></div>
        <div class="parlay">${ladderHTML(bestP, best.dec)}<p class="note">Each step doubles the pot, but the odds shrink fast. Most people do better banking the win and restarting at $10 than letting it ride.</p></div>` : ''}`;
  }
  // ---------- live tracker (ESPN live scores/box scores — zero Odds API credits) ----------
  const LIVE = {};
  let liveAt = 0, liveBusy = false;
  function trackedGroups() {
    const g = [];
    const slip = slipLegs();
    if (slip.length) g.push({ name: slip.length > 1 ? '🧾 Your slip' : '🧾 Your bet', legs: slip });
    if (card?.potd && byId[card.potd]) g.push({ name: '⭐ Pick of the Day', legs: [byId[card.potd]] });
    if (card?.potdParlay) g.push({ name: '🎯 Parlay of the Day', legs: card.potdParlay.legs.map(id => byId[id]).filter(Boolean) });
    return g;
  }
  async function refreshLive(force) {
    if (liveBusy || !card) return;
    const legs = [...new Map(trackedGroups().flatMap(g => g.legs).map(l => [l.id, l])).values()];
    if (!legs.length) return;
    const anyIn = legs.some(l => LIVE[l.id]?.state === 'in'), soon = legs.some(l => Math.abs(new Date(l.start) - Date.now()) < 5 * 36e5);
    if (!force && liveAt && !anyIn && !(S.tab === 'live' && soon)) return;
    liveBusy = true;
    const cache = {}, getJSON = url => cache[url] ||= fetch(url, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    await Promise.all(legs.map(async l => { try { LIVE[l.id] = await E.liveStatus(l, getJSON); } catch (e) {} }));
    liveAt = Date.now(); liveBusy = false;
    if (S.tab === 'live' || S.tab === 'top') {
      const y = window.scrollY; render(); window.scrollTo(0, y);
    }
  }
  setInterval(() => { if (!document.hidden) refreshLive(); }, 45000);
  // as games kick off, drop them from the lists (every 5 minutes)
  setInterval(() => { if (!document.hidden && card && S.tab !== 'live') { const y = window.scrollY; index(); render(); window.scrollTo(0, y); } }, 300000);
  setInterval(() => { const el = document.getElementById('liveAgo'); if (el && liveAt) el.textContent = Math.round((Date.now() - liveAt) / 1000) + 's ago'; }, 1000);

  function legChip(L) {
    if (!L) return '<span class="lchip">…</span>';
    if (L.result === 'won') return `<span class="lchip won">✅ ${L.state === 'post' ? 'Won' : 'Cashed'}</span>`;
    if (L.result === 'lost') return `<span class="lchip lost">❌ ${L.state === 'post' ? 'Lost' : 'Busted'}</span>`;
    if (L.result === 'push' || L.result === 'void') return `<span class="lchip">➖ ${L.result === 'void' ? 'Void' : 'Push'}</span>`;
    if (L.state === 'pre' || L.state === 'na') return '<span class="lchip">⏳ Not started</span>';
    if (L.winning == null) return '<span class="lchip">🏁 Early</span>';
    return L.winning ? '<span class="lchip on">🟢 On track</span>' : '<span class="lchip behind">🟠 Behind</span>';
  }
  function liveBar(x, L) {
    if (!L || L.state === 'pre' || L.state === 'na') return `<div class="note">Starts ${esc(fmtTime(x.start))}</div>`;
    const color = L.result === 'won' ? 'var(--edge)' : L.result === 'lost' ? 'var(--bad)' : L.winning == null ? 'var(--accent2)' : L.winning ? 'var(--edge)' : 'var(--warn)';
    if (L.kind === 'count') {
      if (L.value == null) return '<div class="note">Did not play</div>';
      const max = Math.max(L.line * 1.35, L.value, L.pace || 0, 1), w = v => Math.min(100, v / max * 100);
      const txt = L.over
        ? (L.value > L.line ? `<b>${L.value}</b> — cleared ${L.line} ✅` : `<b>${L.value}</b> of ${Math.floor(L.line) + 1} needed · <b>${Math.floor(L.line) + 1 - L.value}</b> to go`)
        : (L.value > L.line ? `<b>${L.value}</b> — went over ${L.line}` : `<b>${L.value}</b> · stay under ${L.line} · <b>${(L.line - L.value).toFixed(1).replace('.0', '')}</b> to spare`);
      return `<div class="lbar"><i style="width:${w(L.value)}%;background:${color}"></i>
          <span class="lline" style="left:${w(L.line)}%" title="line ${L.line}"></span>
          ${L.pace && L.state === 'in' ? `<span class="lpace" style="left:${w(L.pace)}%" title="pace"></span>` : ''}</div>
        <div class="lrow"><span>${txt}</span>${L.pace && L.state === 'in' ? `<span class="muted">on pace for <b>${L.pace.toFixed(1)}</b></span>` : ''}</div>`;
    }
    const scale = { bb: 15, fb: 14, hk: 2.5 }[E.SPORTS[x.sport]?.kind] || 5;
    const pos = Math.max(3, Math.min(97, 50 + L.cover / scale * 50));
    const label = x.market === 'h2h'
      ? (L.margin > 0 ? `Up <b>${L.margin}</b>` : L.margin < 0 ? `Down <b>${-L.margin}</b>` : 'Tied')
      : (L.cover > 0 ? `Covering by <b>${L.cover}</b>` : L.cover < 0 ? `Needs <b>${-L.cover}</b> more to cover` : 'Right on the number');
    return `<div class="lbar mid"><span class="lline" style="left:50%"></span><span class="ldot" style="left:${pos}%;background:${color}"></span></div>
      <div class="lrow"><span>${label}</span></div>`;
  }
  function liveGroup(g) {
    const Ls = g.legs.map(l => LIVE[l.id]);
    const lost = Ls.some(L => L?.result === 'lost'), allWon = Ls.length && Ls.every(L => L?.result === 'won' || L?.result === 'push' || L?.result === 'void');
    const on = Ls.filter(L => L && (L.result === 'won' || (L.state === 'in' && L.winning))).length;
    const head = g.legs.length > 1
      ? (lost ? '<span class="lchip lost">❌ Busted</span>' : allWon ? '<span class="lchip won">✅ CASHED</span>' : `<span class="lchip ${on === g.legs.length ? 'on' : ''}">${on}/${g.legs.length} on track</span>`)
      : legChip(Ls[0]);
    const s2 = E.parlayStats(g.legs, S.kfrac);
    return `<div class="parlay livecard"><h3>${g.name} <span class="odds">${toAm(s2.dec)}</span></h3><div>${head}</div>
      ${g.legs.map(x => { const L = LIVE[x.id], t = titleOf(x); return `<div class="lleg" data-open="${esc(x.id)}">
        <div class="lhead">${avatar(x)}<div class="t"><b>${esc(t.n)}</b><span class="muted">${esc(t.p)} · ${toAm(x.dec)}</span></div>${legChip(L)}</div>
        ${L && L.state !== 'pre' && L.state !== 'na' ? `<div class="note">${L.state === 'in' ? '<span class="dotlive"></span>' : ''}${esc(L.detail)} · ${esc(L.score)}</div>` : ''}
        ${liveBar(x, L)}</div>`; }).join('')}
    </div>`;
  }
  function viewLive() {
    const groups = trackedGroups();
    if (!liveAt) refreshLive(true);
    return `<div class="sec"><h2>🔴 Live tracker</h2><span>updated <b id="liveAgo">${liveAt ? Math.round((Date.now() - liveAt) / 1000) + 's ago' : 'now'}</b> · refreshes every 45s during games · <b>0 API credits</b> (ESPN live data)</span>
        <span class="spacer"></span><button class="btn small" id="liveNow">↻ Update now</button></div>
      <div class="howto">📍 Tracks your slip, the Pick of the Day and the Parlay of the Day. Add any bet to your slip with <b>+ Slip</b> to follow it here. The dashed line is the betting line; the thin marker is where the player is <b>on pace</b> to finish.</div>
      ${groups.length ? `<div class="pgrid">${groups.map(liveGroup).join('')}</div>` : empty('Nothing to track yet. Add bets to your slip.')}`;
  }
  function liveBanner() {
    const legs = trackedGroups().flatMap(g => g.legs), Ls = legs.map(l => LIVE[l.id]).filter(L => L?.state === 'in');
    if (!Ls.length) return '';
    const on = Ls.filter(L => L.winning || L.result === 'won').length;
    return `<div class="livebanner" data-tab="live"><span class="dotlive"></span><b>LIVE</b> · ${Ls.length} leg${Ls.length > 1 ? 's' : ''} in play · <b>${on}</b> on track <span class="spacer"></span> Open tracker →</div>`;
  }
  // ---------- bet board: one place for every kind of bet ----------
  const SECTIONS = [
    ['games', '🏟️ All games', x => x.type === 'line' && !x.alt],
    ['totals', '📈 Over/Unders', x => x.type === 'line' && x.market === 'totals' && !x.alt],
    ['sides', '📏 Spreads & ML', x => x.type === 'line' && x.market !== 'totals' && !x.alt],
    ['alts', '🔀 Alt lines', x => x.alt && x.type === 'line'],
    ['ladders', '🪜 Alt lines & TDs', x => x.alt && x.type === 'prop'],
    ['props', '🎯 Prop picks', x => x.type === 'prop' && !x.alt],
    ['players', '🧍 Player picks', x => x.type === 'prop'],
  ];
  function sportSections(items, renderList) {
    // when sorted by sport, show a header per league
    if (S.sort !== 'sport') return renderList(items);
    const by = {};
    for (const x of items) (by[x.lg] ||= []).push(x);
    return Object.keys(by).sort((a, b) => lgRank({ lg: a }) - lgRank({ lg: b }))
      .map(lg => `<div class="sec sub"><h2>${by[lg][0].emoji} ${esc(lg)}</h2><span>${by[lg].length}</span></div>${renderList(by[lg])}`).join('');
  }
  function playerCard(name, ps) {
    const sc = x => x.dec ? (x.ev ?? -1) + (x.vibe?.score || 0) * 0.01 : -2 + x.fairP * 0.01;
    ps = [...ps].sort((a, b) => sc(b) - sc(a));
    const top = ps[0], t = titleOf(top);
    return `<article class="card player">
      <div class="c-top"><span class="tag">${top.emoji} ${esc(top.lg)}</span><span>${esc(fmtTime(top.start))}</span><span class="spacer"></span><span class="tag">${ps.length} ${S.allPlayers ? 'line' : 'play'}${ps.length > 1 ? 's' : ''}</span></div>
      <div class="c-main">${avatar(top)}<div class="c-title"><div class="n">${esc(name)}</div><div class="g">${esc(t.g)}</div></div></div>
      ${top.vibe?.hit?.vals ? `<div class="spark">${sparkSVG(top.vibe.hit, top.point)}<div><span class="hitrate">${top.vibe.hit.hits}/${top.vibe.hit.n}</span> ${esc(top.side.toLowerCase())} ${top.point} ${esc(top.statLabel)}<br>last ${top.vibe.hit.n} · avg ${top.vibe.hit.avg}</div></div>` : ''}
      ${ps.map((x, i) => `<div class="prow ${i === 0 ? 'best' : ''}" data-open="${esc(x.id)}">
        <div class="t"><b>${i === 0 ? '⭐ ' : ''}${esc(propLabel(x))}</b>
          <span class="muted">${x.dec ? `${toAm(x.dec)} ${esc(x.book)}` : `fair ${toAm(1 / x.fairP)} · ${pct(x.fairP, 0)}`}${x.vibe?.hit ? ` · <b class="${x.vibe.hit.l10 >= 0.6 ? 'good' : x.vibe.hit.l10 <= 0.4 ? 'bad' : ''}" style="display:inline">hit ${x.vibe.hit.hits}/${x.vibe.hit.n}</b> · avg ${x.vibe.hit.avg}` : ''}${x.vibe?.score ? ` · vibe ${x.vibe.score > 0 ? '+' : ''}${x.vibe.score}` : ''}${B365() ? ` · ${esc(MYB())} ≥ ${targetAm(x)}` : ''}</span></div>
        ${x.dec && x.ev != null ? `<span class="edge ${x.ev < 0 ? 'neg' : ''}">${signPct(x.ev)}</span>` : '<span class="muted">—</span>'}
        <button class="add ${S.slip.includes(x.id) ? 'in' : ''}" data-add="${esc(x.id)}">${S.slip.includes(x.id) ? '✓' : '+'}</button></div>`).join('')}
    </article>`;
  }
  const allPlayerProps = () => (card.board || []).filter(x => x.type === 'prop').map(x => byId[x.id] || x)
    .concat(card.props.filter(p => !(card.board || []).some(b => b.id === p.id)));
  const playerToggle = () => `<div class="seg small"><button class="${S.allPlayers ? '' : 'on'}" data-allp="0">⭐ +EV only</button><button class="${S.allPlayers ? 'on' : ''}" data-allp="1">🧍 Every player (fair odds)</button><button data-tab="alts">🪜 Alt lines</button></div>`;
  function playersGrid(items) {
    const groups = {};
    for (const x of items) (groups[x.player] ||= []).push(x);
    const best = ps => Math.max(...ps.map(x => x.dec ? (x.ev ?? -1) : -2));
    const list = Object.entries(groups).sort((a, b) => S.sort === 'sport' ? lgRank(a[1][0]) - lgRank(b[1][0]) || best(b[1]) - best(a[1]) : best(b[1]) - best(a[1]));
    const shown = list.slice(0, S.shown);
    return list.length ? `<div class="grid">${shown.map(([n, ps]) => playerCard(n, ps)).join('')}</div>`
      + (list.length > shown.length ? `<div style="text-align:center;margin-top:12px"><button class="btn" id="moreBtn">Show more players (${list.length - shown.length} left)</button></div>` : '')
      : empty('No players match these filters.');
  }
  // sportsbook-style board: every game with spread / total / moneyline for both sides
  // ⭐ pick per game: a sharp +EV side if there is one, else the side the matchup data leans to (vibe, then win chance)
  function bestSide(sides) {
    const ok = sides.filter(Boolean);
    const pos = ok.filter(x => x.dec && x.ev >= 0.01 && !isSus(x) && !x.espnLine).sort((a, b) => (b.ev + (b.vibe?.score || 0) * 0.01) - (a.ev + (a.vibe?.score || 0) * 0.01));
    if (pos.length) return { x: pos[0], kind: 'ev' };
    // leans skip heavy favorites (risk $400 to win $100) and long shots — a lean should be a bet worth making
    const lean = ok.filter(x => (x.vibe?.score || 0) >= 2 && x.fairP >= 0.3 && x.fairP <= 0.78).sort((a, b) => (b.vibe.score - a.vibe.score) || (b.fairP - a.fairP));
    if (lean.length) return { x: lean[0], kind: 'lean' };
    // always show something: the best side on the data at a sane price (vibe, then closest to a coin flip+ at fair)
    const sane = ok.filter(x => x.fairP >= 0.3 && x.fairP <= 0.78);
    const pool = (sane.length ? sane : ok).sort((a, b) => ((b.vibe?.score || 0) - (a.vibe?.score || 0)) || ((b.ev ?? -1) - (a.ev ?? -1)) || (b.fairP - a.fairP));
    return pool.length ? { x: pool[0], kind: 'slight' } : null;
  }
  function gameCell(x, label, star) {
    if (!x) return '<div class="gcell empty">—</div>';
    const pos = x.dec && x.ev >= 0.01 && !isSus(x);
    const vs = x.vibe?.score;
    return `<div class="gcell ${pos ? 'pos' : ''} ${star ? 'star ' + star : ''}" data-open="${esc(x.id)}">
      ${star ? `<span class="gstar" title="${star === 'ev' ? '+EV pick' : star === 'lean' ? 'Data lean (matchup vibe), not a price edge' : 'Slight lean: best side on the data, weak'}">${star === 'slight' ? '☆' : '⭐'}</span>` : ''}
      <b>${esc(label)}</b>
      <span class="ghit">${pct(x.fairP, 0)} to hit${vs != null && vs !== 0 ? ` · <span class="${vs >= 2 ? 'good' : vs <= -2 ? 'bad' : ''}">${vs > 0 ? '+' : ''}${vs}</span>` : ''}</span>
      <span class="gp">${x.dec ? toAm(x.dec) : toAm(1 / x.fairP)}</span>
      <small>${B365() ? `<span class="wide">${x.dec ? `fair${x.espnLine ? '*' : ''} ${toAm(1 / x.fairP)} · ` : ''}</span>${esc(SB())} ≥ ${targetAm(x)}` : x.dec ? `fair${x.espnLine ? '*' : ''} ${toAm(1 / x.fairP)}` : 'fair'}</small>
      ${pos ? `<span class="edge">${signPct(x.ev)}</span>` : ''}
    </div>`;
  }
  function legendHTML(est) {
    const open = store.get('legendOpen', true);
    const row = (sample, text) => `<div class="lgrow"><div class="lgs">${sample}</div><div class="lgt">${text}</div></div>`;
    const cell = (cls, body) => `<div class="gcell ${cls}" style="cursor:default;min-width:88px">${body}</div>`;
    return `<details class="legend" ${open ? 'open' : ''} data-legend>
      <summary>📖 Legend <span class="muted">how to read the game cards</span></summary>
      <div class="lggrid">
        <div>
          <h4>Best bet on each game</h4>
          ${row('<div class="gpick ev" style="cursor:default">⭐ Pick</div>', '<b>Sharp +EV.</b> The price beats the true odds. Your best bets.')}
          ${row('<div class="gpick lean" style="cursor:default">⭐ Lean</div>', '<b>Data lean.</b> No price edge, but the matchup (vibe +2 or better) points this way. Normal stake.')}
          ${row('<div class="gpick slight" style="cursor:default">☆ Slight lean</div>', '<b>Weak signal.</b> Best side on the data, nothing strong. Small stake or skip.')}
          ${row('<span class="units">💰 1.25u</span>', 'Recommended stake. 1u = 1% of bankroll. ⭐ Pick: Kelly-sized (max 3u) · ⭐ Lean: 0.5u · ☆ Slight lean: 0.25u')}
          <h4 style="margin-top:12px">Box outlines</h4>
          ${row(cell('star ev', '<span class="gstar">⭐</span><b>O 6.5</b>'), 'Gold outline = the ⭐ Pick or Lean for this game')}
          ${row(cell('star slight', '<span class="gstar">☆</span><b>+1.5</b>'), 'Grey outline = the ☆ Slight lean')}
          ${row(cell('pos', '<b>ML</b><span class="edge">+4.2%</span>'), 'Green box = +EV right now (with the edge %)')}
        </div>
        <div>
          <h4>Inside each box</h4>
          ${row(cell('', '<b>−3.5</b><span class="ghit">57% to hit · <span class="good">+2</span></span><span class="gp">−110</span><small>fair −125 · 365 ≥ −118</small>'),
            `<b>−3.5</b> the line (spread, total O/U, or ML)<br><b>57% to hit</b> true chance this side wins<br><b>+2</b> vibe (matchup score)<br><b>−110</b> best price found<br><b>fair −125</b> the no-vig price${B365() ? `<br><b>${esc(SB())} ≥ −118</b> bet it at ${esc(MYB())} only at this price or better` : ''}`)}
          <h4 style="margin-top:12px">Vibe (matchup score)</h4>
          ${row('<span class="good" style="font-size:15px">+2</span>&nbsp;<span class="muted">or more</span>', 'Injuries, form, goalies, weather, model and markets back this side')}
          ${row('<span style="font-size:15px">−1 to +1</span>', 'Mixed or no strong signal')}
          ${row('<span class="bad" style="font-size:15px">−2</span>&nbsp;<span class="muted">or less</span>', 'The data argues against this side')}
          ${est ? row('<b>fair*</b>', 'The asterisk means the fair price is estimated from DraftKings (free, via ESPN). Fine for ${esc(MYB())} targets, but it can’t spot edges, so those boxes never turn green.') : ''}
        </div>
      </div>
    </details>`;
  }
  function gamesBoard(items) {
    const games = {};
    for (const x of items) {
      const g = games[x.eventId] ||= { id: x.eventId, game: x.game, home: x.home, away: x.away, start: x.start, lg: x.lg, emoji: x.emoji, sport: x.sport, ml: {}, sp: {}, tot: {} };
      if (x.market === 'h2h') g.ml[x.team] = x;
      else if (x.market === 'spreads') g.sp[x.team] = x;
      else if (x.market === 'totals') g.tot[/^over/i.test(x.pick) ? 'o' : 'u'] = x;
      else if (x.market === 'team_totals' && x.side === 'Over') (g.tt ||= []).push(x);
    }
    let list = Object.values(games);
    const TT = g => { const pick = team => (g.tt || []).filter(x => x.team === team).sort((a, b) => Math.abs(a.fairP - 0.5) - Math.abs(b.fairP - 0.5))[0]; return [pick(g.away), pick(g.home)].filter(Boolean); };
    const sidesOf = g => S.glType === 'spreads' ? Object.values(g.sp) : S.glType === 'h2h' ? Object.values(g.ml) : S.glType === 'totals' ? Object.values(g.tot)
      : S.glType === 'team_totals' ? TT(g) : [...Object.values(g.ml), ...Object.values(g.sp), ...Object.values(g.tot)];
    if (S.glType !== 'ALL') list = list.filter(g => sidesOf(g).length);
    for (const g of list) g.best = bestSide(sidesOf(g));
    const allCount = list.length;
    if (S.bestOnly) list = list.filter(g => g.best && g.best.kind !== 'slight');
    list.sort((a, b) => S.bestOnly ? ((b.best?.kind === 'ev') - (a.best?.kind === 'ev')) || ((b.best?.x.vibe?.score || 0) - (a.best?.x.vibe?.score || 0)) : 0);
    list.sort((a, b) => S.sort === 'sport' ? lgRank(a) - lgRank(b) || a.start.localeCompare(b.start) : a.start.localeCompare(b.start));
    const types = [['ALL', 'All lines'], ['spreads', 'Spread'], ['h2h', 'Moneyline'], ['totals', 'Over/Under'], ['team_totals', 'Team totals']];
    const toggle = `<div class="seg small"><button class="${S.bestOnly ? '' : 'on'}" data-best="0">🏟️ All games (${allCount})</button><button class="${S.bestOnly ? 'on' : ''}" data-best="1">⭐ Strong plays only</button></div>
      <div class="seg small">${types.map(([k, l]) => `<button class="${S.glType === k ? 'on' : ''}" data-gltype="${k}">${l}</button>`).join('')}</div>`;
    if (!list.length) return toggle + empty(S.bestOnly ? 'No ⭐ picks right now: no sharp +EV sides and no strong data leans.' : 'No game lines match these filters.');
    const ptxt = p => (p > 0 ? '+' : '') + p;
    const st = (g, x) => g.best && x && g.best.x.id === x.id ? g.best.kind : '';
    const row = (g, team, logo, totKey) => `<div class="grow">
      <div class="gteam">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<span class="wide">${esc(team)}</span><span class="narrow">${esc(team === 'Draw' ? team : team.split(' ').slice(-1)[0])}</span></div>
      ${gameCell(g.sp[team], g.sp[team] ? ptxt(g.sp[team].point) : '', st(g, g.sp[team]))}
      ${gameCell(g.tot[totKey], g.tot[totKey] ? `${totKey === 'o' ? 'O' : 'U'} ${g.tot[totKey].point}` : '', st(g, g.tot[totKey]))}
      ${gameCell(g.ml[team], 'ML', st(g, g.ml[team]))}
    </div>`;
    // one column for the chosen bet type: each side gets a full-width row
    const oneType = (g, gd) => {
      const lbl = { spreads: 'Spread', h2h: 'Moneyline', totals: 'Over/Under', team_totals: 'Team total' }[S.glType];
      const sides = sidesOf(g), logo = t => t === g.home ? gd?.home.logo : t === g.away ? gd?.away.logo : null;
      return `<div class="ghead one"><span></span><span>${lbl}</span></div>` + sides.map(x => {
        const who = S.glType === 'totals' ? (/^over/i.test(x.pick) ? 'Over' : 'Under') : x.team;
        const label = S.glType === 'spreads' ? ptxt(x.point) : S.glType === 'totals' ? `${/^over/i.test(x.pick) ? 'O' : 'U'} ${x.point}` : S.glType === 'team_totals' ? `o${x.point}` : who === 'Draw' ? 'Draw' : 'ML';
        return `<div class="grow one"><div class="gteam">${logo(who) ? `<img src="${esc(logo(who))}" alt="" loading="lazy" onerror="this.remove()">` : ''}<span>${esc(who)}</span></div>${gameCell(x, label, st(g, x))}</div>`;
      }).join('');
    };
    const card1 = g => {
      const gd = card.games?.[g.id], plus = [...Object.values(g.ml), ...Object.values(g.sp), ...Object.values(g.tot)].filter(x => x.dec && x.ev >= 0.01 && !isSus(x)).length;
      const b = g.best, why = b ? (b.x.vibe?.items || []).filter(i => i.tone === 'g').slice(0, 2) : [];
      if (b?.kind === 'slight' && !why.length) why.push({ text: 'No strong signal either way: small stake or skip' });
      return `<article class="gcard ${b && b.kind !== 'slight' ? 'has-best' : ''}">
        <div class="c-top"><span class="tag">${g.emoji} ${esc(g.lg)}</span><span>${esc(fmtTime(g.start))}</span><span class="spacer"></span>${plus ? `<span class="edge">${plus} +EV</span>` : ''}</div>
        ${b ? `<div class="gpick ${b.kind}" data-open="${esc(b.x.id)}">${b.kind === 'slight' ? '☆ Slight lean' : b.kind === 'ev' ? '⭐ Pick' : '⭐ Lean'}: <b>${esc(b.x.pick.replace(/ \(alt\)$/, ''))}</b> ${b.x.dec ? toAm(b.x.dec) : ''} · ${pct(b.x.fairP, 0)} to hit${b.kind === 'ev' ? ` · <span class="good">${signPct(b.x.ev)}</span>` : ''}${b.x.vibe?.score ? ` · vibe ${b.x.vibe.score > 0 ? '+' : ''}${b.x.vibe.score}` : ''} · ${unitsChip(b.kind === 'ev' ? unitsFor(b.x) : b.kind === 'lean' ? 0.5 : 0.25)}
          ${why.length ? `<div class="gwhy">${why.map(i => i.text).join(' · ')}</div>` : ''}</div>` : ''}
        ${S.glType === 'ALL' ? '<div class="ghead"><span></span><span>Spread</span><span>Total</span><span>ML</span></div>' : ''}
        ${S.glType === 'ALL' ? row(g, g.away, gd?.away.logo, 'o') + row(g, g.home, gd?.home.logo, 'u') : oneType(g, gd)}
        ${S.glType === 'ALL' && g.ml.Draw ? `<div class="grow"><div class="gteam"><span>Draw</span></div><div></div><div></div>${gameCell(g.ml.Draw, 'Draw')}</div>` : ''}
        ${S.glType === 'ALL' && g.tt?.length ? (() => { // team totals (Kalshi): show the rung closest to a coin flip for each team
          const pickTT = team => g.tt.filter(x => x.team === team).sort((a, b) => Math.abs(a.fairP - 0.5) - Math.abs(b.fairP - 0.5))[0];
          const cells = [g.away, g.home].map(pickTT).filter(Boolean);
          return cells.length ? `<div class="gtt">🎯 Team totals · ${cells.map(x => `<span data-open="${esc(x.id)}">${esc(x.team.split(' ').slice(-1)[0])} o${x.point} <b>${pct(x.fairP, 0)}</b>${B365() ? ` · ${esc(SB())} ≥ ${targetAm(x)}` : ''}</span>`).join(' · ')} <span class="muted">(Kalshi)</span></div>` : '';
        })() : ''}
      </article>`;
    };
    const est = items.some(x => x.espnLine);
    return toggle + legendHTML(est)
      + sportSections(list, gs => `<div class="ggrid">${gs.map(card1).join('')}</div>`);
  }
  const altProps = () => allPlayerProps().filter(x => x.alt || x.kalshi || x.market === 'player_anytime_td');
  function viewAlts() {
    const items = filtered(altProps());
    const plus = items.filter(x => x.dec && x.ev >= 0.01 && !isSus(x));
    return `<div class="seg small"><button data-tab="props" data-allp-go="0">⭐ +EV only</button><button data-tab="props" data-allp-go="1">🧍 Every player (fair odds)</button><button class="on">🪜 Alt lines</button></div>
      <div class="sec"><h2>🪜 Alt Lines</h2><span>${items.length} lines · ${new Set(items.map(x => x.player)).size} players · 30+ / 40+ / 50+ yards, anytime TD, 20+ points and more</span></div>
      <div class="howto">Every rung of every player's ladder with its <b>fair odds</b>, how often he's cleared it lately, and your <b>${esc(MYB())} target</b>. <b>Green edge</b> = a sportsbook is paying more than fair right now${plus.length ? ` (<b>${plus.length}</b> on the board)` : ''}. Pick a sport and a stat up top to narrow it down.</div>
      ${playersGrid(items)}`;
  }
  function viewBoard() {
    const all = filtered([...card.lines, ...card.props]).filter(x => !isSus(x));
    const gameLines = filtered((card.board || []).filter(x => x.type === 'line' && (!x.alt || x.market === 'team_totals')).map(x => byId[x.id] || x));
    const altCount = new Set(filtered(allPlayerProps().filter(x => x.alt || x.kalshi || x.market === 'player_anytime_td')).map(x => x.player)).size;
    const counts = Object.fromEntries(SECTIONS.map(([k, , fn]) => [k, k === 'ladders' ? altCount : k === 'games' ? new Set(gameLines.map(x => x.eventId)).size : k === 'players' ? new Set((S.allPlayers ? filtered(allPlayerProps()) : all.filter(fn)).map(x => x.player)).size : all.filter(fn).length]));
    const [key, , fn] = SECTIONS.find(s2 => s2[0] === S.section) || SECTIONS[3];
    const items = sortItems(all.filter(fn));
    let body;
    if (key === 'games') {
      body = gamesBoard(gameLines);
    } else if (key === 'ladders') {
      // every alt line / ladder rung (Kalshi + sportsbook ladders) and anytime TDs, one card per player
      const alts = filtered(allPlayerProps().filter(x => x.alt || x.kalshi || x.market === 'player_anytime_td'));
      body = `<p class="note" style="margin-top:-4px">Alt lines for every player: 30+, 40+, 50+ yards, anytime TD and more. Fair odds + hit rates on each rung; green edge = a sportsbook is paying more than fair right now.</p>` + playersGrid(alts);
    } else if (key === 'players') {
      body = playerToggle() + playersGrid(S.allPlayers ? filtered(allPlayerProps()) : items);
    } else {
      body = items.length ? sportSections(items, xs => `<div class="grid">${xs.map(x => pickCard_(x)).join('')}</div>`)
        : empty(key === 'ladders' ? 'No +EV alt props (ladders like 10+ PTS / 3+ AST) on today\u2019s card. Ladders get pulled for the games we already have props for, when the day\u2019s budget has room, and model-priced rungs need a 5% edge to show.' : key === 'alts' ? 'No +EV alt lines on today’s card. Alt lines cost 2 credits per game, so they only get pulled when the day’s budget has room (mostly weekends on the free plan), and most come out priced fair.' : 'Nothing +EV in this section with these filters.');
    }
    return `<div class="sec"><h2>🗂️ Bet Board</h2><span>every +EV bet on today's card, organized by type</span></div>
      <div class="seg">${SECTIONS.map(([k, l]) => `<button class="${k === key ? 'on' : ''}" data-section="${k}">${l} <span>${counts[k]}</span></button>`).join('')}</div>
      ${body}`;
  }
  function viewProps() {
    if (S.allPlayers) return `<div class="sec"><h2>Player props</h2><span>every priced prop, every sport · fair odds${B365() ? ` + ${esc(MYB())} targets` : ''}</span></div>${playerToggle()}${playersGrid(filtered(allPlayerProps()))}`;
    const items = sortItems(filtered(card.props));
    const morePlayers = new Set(filtered(allPlayerProps()).map(x => x.player)).size - new Set(items.map(x => x.player)).size;
    const moreHint = morePlayers > 0 ? `<div class="howto" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">🧍 <span><b>${morePlayers} more ${S.lg === 'ALL' ? '' : esc(S.lg) + ' '}players</b> have lines with fair odds, hit rates and ${esc(MYB())} targets (no sportsbook edge right now).</span><button class="btn small" data-allp="1">Show every player →</button></div>` : '';
    return `<div class="sec"><h2>Player props</h2><span>${card.props.length} +EV prop sides · bars = last games vs the line</span></div>
      ${playerToggle()}
      ${items.length ? `<div class="grid">${items.map(x => pickCard_(x)).join('')}</div><div style="margin-top:14px">${moreHint}</div>`
        : moreHint + empty(card.props.length ? 'No props match these filters.' : 'No props on today\'s card — props only get pulled for games starting within ~30h, and only if the daily credit budget allows.')}`;
  }
  function viewLines() {
    const pos = sortItems(filtered(card.lines));
    const all = filtered((card.board || []).filter(x => x.type === 'line' && (!x.alt || x.market === 'team_totals')).map(x => byId[x.id] || x));
    const nGames = new Set(all.map(x => x.eventId)).size;
    return `<div class="sec"><h2>📊 Game lines</h2><span>${nGames} games · spread, total and moneyline for every game</span></div>
      ${pos.length ? `<div class="sec sub"><h2>🟢 +EV right now</h2><span>priced vs Pinnacle no-vig</span></div><div class="grid">${pos.slice(0, 9).map(x => pickCard_(x)).join('')}</div>
        <div class="sec sub"><h2>🏟️ Every game</h2></div>` : ''}
      ${all.length ? gamesBoard(all) : empty('No upcoming games with lines yet. The card rebuilds every morning.')}`;
  }
  function viewSheet() {
    if (!card.board?.length) return empty('The full fair-odds sheet arrives with the next daily build (or hit ↻ Live refresh).');
    const all = filtered(card.board.map(x => byId[x.id]));
    const items = S.sort === 'time' || S.sort === 'ev' ? [...all].sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || (S.sort === 'ev' ? (b.ev ?? -9) - (a.ev ?? -9) : 0) || a.start.localeCompare(b.start)) : sortItems(all);
    const rows = items.slice(0, S.shown);
    return `<div class="sec"><h2>${B365() ? `${esc(MYB())} sheet` : 'Fair odds sheet'}</h2><span>${all.length} lines &amp; props · the sharp no-vig price for everything on the board</span></div>
      <div class="howto">📲 Open ${esc(MYB())} → find the bet → if their odds are <b>at or above the target</b>, it's +EV. Type their price in to see your exact edge and add it to the slip.</div>
      <div class="tbl"><div class="scroll"><table><thead><tr><th></th><th>Pick</th><th>Game</th><th>Start</th><th>Fair</th><th>Target</th><th>${esc(MYB())} price</th><th>Edge</th><th></th></tr></thead><tbody>
      ${rows.map(x => `<tr data-open="${esc(x.id)}"><td><span class="tag">${x.emoji} ${esc(x.lg)}</span></td><td><b>${esc(x.pick)}</b></td><td class="muted">${esc(x.game)}</td>
        <td class="muted">${esc(fmtTime(x.start))}</td><td>${toAm(1 / x.fairP)}</td><td><b style="color:var(--edge)">${targetAm(x)}</b></td><td>${priceInput(x)}</td>
        <td>${x.mine ? `<span class="edge ${x.ev < 0 ? 'neg' : ''}">${signPct(x.ev)}</span>` : '<span class="muted">—</span>'}</td>
        <td><button class="add ${S.slip.includes(x.id) ? 'in' : ''}" data-add="${esc(x.id)}">${S.slip.includes(x.id) ? '✓' : '+'}</button></td></tr>`).join('')}
      </tbody></table></div></div>
      ${items.length > rows.length ? `<div style="text-align:center;margin-top:12px"><button class="btn" id="moreBtn">Show more (${items.length - rows.length} left)</button></div>` : ''}`;
  }
  function parlayCard(p, feat) {
    const legs = p.legs.map(id => byId[id]).filter(Boolean);
    if (!legs.length) return '';
    const s = E.parlayStats(legs, S.kfrac);
    return `<div class="parlay ${feat ? 'feat' : ''}">
      <h3>${p.emoji || '🎟️'} ${esc(p.name)} <span class="odds">${toAm(s.dec)}</span></h3>
      ${p.blurb ? `<div class="blurb">${esc(p.blurb)}</div>` : ''}
      ${legs.map(l => { const t = titleOf(l); return `<div class="pleg" data-open="${esc(l.id)}" style="cursor:pointer">${avatar(l)}<div class="t"><b>${esc(t.n)}</b><span class="muted">${esc(t.p)} · ${esc(l.book)}${l.vibe?.hit ? ` · <b style="display:inline;color:var(--edge)">hit ${l.vibe.hit.hits}/${l.vibe.hit.n}</b>` : ''} · ${pct(l.fairP, 0)}</span></div><b>${toAm(l.dec)}</b></div>`; }).join('')}
      <div class="pstats"><div><small>Hit</small><b>${pct(s.p, 1)}</b></div><div><small>EV</small><b style="color:var(--edge)">${signPct(s.ev)}</b></div>
        <div><small>Units</small><b>${unitsTxt(unitsParlay(legs), true)}</b><small style="text-transform:none;letter-spacing:0">$${(unitsParlay(legs) * unitSize()).toFixed(2)}</small></div><div><small>$10 pays</small><b>$${(10 * s.dec).toFixed(0)}</b></div></div>
      <button class="btn small" data-loadparlay="${esc(p.legs.join(','))}">Load into slip</button>
    </div>`;
  }
  let built = null;
  function viewParlays() {
    return `<div class="sec"><h2>Auto-built parlays</h2><span>from today's card</span></div>
      ${card.parlays?.length ? `<div class="pgrid">${card.parlays.map((p, i) => parlayCard(p, i === 1)).join('')}</div>` : empty('Not enough +EV legs to build parlays today.')}
      <div class="sec"><h2>Build your own</h2><span>+EV legs only, max one per game, no 🔴 fades</span></div>
      <div class="builder">
        <label>Legs<select id="bk">${[2, 3, 4, 5].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Rank by<select id="brank"><option value="growth">Bankroll growth</option><option value="ev">Raw EV</option><option value="hit">Hit chance</option><option value="vibe">Matchup vibe</option></select></label>
        <label>Use<select id="bsrc"><option value="all">Props + lines</option><option value="prop">Props only</option><option value="line">Lines only</option></select></label>
        <label>League<select id="blg">${leagues([...card.lines, ...card.props]).map(l => `<option ${S.lg === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <button class="btn primary" id="buildBtn">Build</button>
      </div>
      <div class="pgrid" id="builtOut">${built || ''}</div>`;
  }
  // ---------- 📰 News: headlines + expected lineups / injuries, filtered by sport (chips), day, time, team ----------
  const NEWS = () => card.news || window.EDGE_CARD?.news || {};
  const LINEUPS = () => card.lineups || window.EDGE_CARD?.lineups || {};
  function newsGames() {
    const G = { ...(window.EDGE_CARD?.games || {}), ...(card.games || {}) };
    // the same game can sit under two ids (odds feed + ESPN): keep the one with lineups / the most props
    const nProps = id => (card.board || []).filter(x => x.type === 'prop' && x.eventId === id).length;
    const best = {};
    for (const [id, g] of Object.entries(G)) {
      if (!g.lg || !g.start || new Date(g.start) <= Date.now()) continue;
      const k = g.espnId || id, sc = (LINEUPS()[id] ? 1e4 : 0) + nProps(id), cur = best[k];
      if (!cur || sc > cur.sc) best[k] = { id, g, sc };
    }
    return Object.values(best).map(({ id, g }) => ({ id, g, lg: g.lg, start: g.start, home: g.home.name, away: g.away.name, pick: '', game: `${g.away.name} @ ${g.home.name}` }));
  }
  function newsItems() { return [...newsGames(), ...Object.keys(NEWS()).map(lg => ({ lg, pick: '', game: '' }))]; }
  const ago = iso => { const m = Math.max(0, (Date.now() - new Date(iso)) / 6e4); return m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
  const stTone = st => /^out|injured reserve|suspen/i.test(st || '') ? 'out' : /doubt/i.test(st || '') ? 'doubt' : st ? 'q' : '';
  function lineupSide(t, L, gid) {
    if (!L) return `<div class="lu"><div class="luh">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<b>${esc(t.abbr || t.name)}</b></div><p class="muted" style="font-size:12px">No lineup yet</p></div>`;
    const badge = L.status === 'confirmed' ? '<span class="lub ok">✅ Confirmed</span>' : `<span class="lub">🔮 ${L.kind === 'fb' ? 'Key players' : 'Projected'}${L.from ? ` · last game ${new Date(L.from).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}</span>`;
    return `<div class="lu"><div class="luh">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<b>${esc(t.abbr || t.name)}</b>${L.formation ? `<span class="muted">${esc(L.formation)}</span>` : ''}${badge}</div>
      <ul>${L.players.map(p => `<li class="${stTone(p.st)}"><span class="pos">${esc(p.pos)}</span><span class="n">${esc(p.n)}</span>${p.ln ? `<span class="muted" style="font-size:11px">${esc(p.ln)}</span>` : ''}${p.st ? `<span class="st">${esc(p.st)}${p.why ? ' · ' + esc(p.why) : ''}</span>` : ''}</li>`).join('')}</ul></div>`;
  }
  function injuryBlock(t) {
    const key = (t.injuries || []).filter(p => stTone(p.status));
    if (!key.length) return `<span class="muted">✅ ${esc(t.abbr)}: nothing on the injury report</span>`;
    return `<div class="injrow"><b>${esc(t.abbr)}</b>${key.slice(0, 10).map(p => `<span class="inj ${stTone(p.status)}" title="${esc(p.type)}">${esc(p.name)}${p.pos ? ` <small>${esc(p.pos)}</small>` : ''} · ${esc(p.status)}</span>`).join('')}</div>`;
  }
  function gameNewsCard({ id, g }) {
    const L = LINEUPS()[id] || {};
    const outStarters = ['home', 'away'].flatMap(s => (L[s]?.players || []).filter(p => /out|doubt|injured reserve|suspen/i.test(p.st || '')).map(p => ({ ...p, team: g[s] })));
    const props = (card.board || []).filter(x => x.type === 'prop' && x.eventId === id).length;
    return `<div class="card ncard">
      <div class="c-top"><span class="tag">${esc(g.lg)}</span><span>${esc(fmtTime(g.start))}</span><span class="spacer"></span>${props ? `<button class="btn small" data-newsteam="${esc(g.home.name)}">🎯 ${props} props →</button>` : ''}</div>
      <h3 style="margin:0">${esc(g.away.name)} @ ${esc(g.home.name)}</h3>
      ${outStarters.length ? `<div class="impact">⚠️ <b>Lineup change:</b> ${outStarters.map(p => `${esc(p.n)} (${esc(p.team.abbr)}, ${esc(p.st)})`).join(', ')} started last game but ${outStarters.length > 1 ? 'are' : 'is'} on the report. Teammates pick up minutes and usage, so check their props and the team total. Lines can be slow to move.${IPLAYS().some(x => x.eventId === id) ? ' <button class="btn small" data-newssec="plays">🚑 See the injury plays →</button>' : ''}</div>` : ''}
      ${L.goalies ? `<div class="goalies">🥅 Likely goalies: ${['away', 'home'].map(s => L.goalies[s] ? `<b>${esc(L.goalies[s].n)}</b> <span class="muted">${esc(g[s].abbr)} · ${L.goalies[s].sv?.toFixed(3).replace(/^0/, '')} SV%</span>` : `<span class="muted">${esc(g[s].abbr)} TBD</span>`).join(' vs ')}</div>` : ''}
      ${L.home || L.away ? `<div class="lus">${lineupSide(g.away, L.away, id)}${lineupSide(g.home, L.home, id)}</div>` : ''}
      <div class="injs">🚑 ${injuryBlock(g.away)}${injuryBlock(g.home)}</div>
    </div>`;
  }
  // ---------- 🚑 Injury plays: starter out → backup's with/without split → good / risky / bad bet ----------
  const IPLAYS = () => card.injuryPlays || window.EDGE_CARD?.injuryPlays || [];
  const VERD = { good: ['✅ Good bet', 'v-good'], risky: ['⚠️ Risky', 'v-risky'], bad: ['❌ Bad bet: take the Under', 'v-bad'], avoid: ['🚫 Avoid', 'v-bad'] };
  function underOf(p) { return (card.board || []).find(x => x.type === 'prop' && x.side === 'Under' && x.market === p.market && x.point === p.point && E.normName(x.player || '') === E.normName(p.player)); }
  function playRow(p) {
    const [vl, vc] = VERD[p.verdict];
    const bet = p.verdict === 'bad' ? underOf(p) : p.verdict === 'avoid' ? null : byId[p.id];
    const label = p.verdict === 'bad' ? `Under ${p.point} ${p.statLabel}` : p.own ? `Over ${p.point} ${p.statLabel}` : `Over ${p.point} ${p.statLabel}`;
    const price = bet?.dec ? `<b>${E.toAm(bet.dec)}</b> <span class="muted" style="font-size:11px">${esc(bet.book || '')}</span>` : bet?.fairP ? `<span class="muted" style="font-size:12px">fair ${E.toAm(1 / bet.fairP)}</span>` : p.fairP ? `<span class="muted" style="font-size:12px">fair ${E.toAm(1 / (p.verdict === 'bad' ? 1 - p.fairP : p.fairP))}</span>` : '';
    const mx = Math.max(p.avgW || 0, p.avgWo || 0, p.point || 0) || 1, bar = (v, cls) => v == null ? '' : `<div class="ipbar ${cls}"><i style="width:${Math.min(100, v / mx * 100)}%"></i><span>${v}</span></div>`;
    return `<div class="iprow ${vc}">
      <div class="iphead">${p.headshot ? `<div class="avatar"><img src="${esc(p.headshot)}" alt="" loading="lazy" onerror="this.remove()"></div>` : ''}
        <div style="min-width:0;flex:1"><b>${esc(p.player)}</b> <span>${esc(label)}</span><div><span class="verd ${vc}">${vl}</span></div></div>
        <div style="text-align:right">${price}${bet ? `<div><button class="add ${S.slip.includes(bet.id) ? 'in' : ''}" data-add="${esc(bet.id)}">${S.slip.includes(bet.id) ? '✓' : '+'}</button></div>` : ''}</div></div>
      ${p.avgW != null || p.avgWo != null ? `<div class="ipbars"><div><small>with him</small>${bar(p.avgW, 'w')}</div><div><small>without him${p.nWo ? ` (${p.nWo} g)` : ''}</small>${bar(p.avgWo, 'wo')}</div><div class="ipline">line <b>${p.point}</b></div></div>` : ''}
      <p class="ipwhy">${esc(p.why)}</p></div>`;
  }
  function injuryCard(x) {
    return `<div class="card ipcard">
      <div class="c-top"><span class="tag">${esc(x.lg)}</span><span>${esc(fmtTime(x.start))}</span><span class="spacer"></span><span class="muted" style="font-size:12px">${esc(x.game)}</span></div>
      <div class="ipout">${x.logo ? `<img src="${esc(x.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<div><b>${esc(x.out.n)}</b> <span class="muted">${esc(x.out.pos)} · ${esc(x.team)}</span><div><span class="inj ${stTone(x.out.st)}">${esc(x.out.st)}${x.out.why ? ' · ' + esc(x.out.why) : ''}</span>${x.out.ln ? ` <span class="muted" style="font-size:11.5px">last game: ${esc(x.out.ln)}</span>` : ''}</div></div></div>
      <div class="muted" style="font-size:12.5px">Who picks up his ${/QB/.test(x.out.pos) ? 'snaps' : /RB/.test(x.out.pos) ? 'carries' : /REC|WR|TE/.test(x.out.pos) ? 'targets' : 'shots and minutes'}?</div>
      ${(() => { const strong = x.plays.filter(p => p.verdict !== 'risky'), risky = x.plays.filter(p => p.verdict === 'risky');
        return strong.map(playRow).join('') + risky.slice(0, Math.max(1, 4 - strong.length)).map(playRow).join('')
          + (risky.length > Math.max(1, 4 - strong.length) ? `<details class="ipmore"><summary>${risky.length - Math.max(1, 4 - strong.length)} more risky lines</summary>${risky.slice(Math.max(1, 4 - strong.length)).map(playRow).join('')}</details>` : ''); })()}</div>`;
  }
  function viewInjuryPlays(head, seg) {
    const all = IPLAYS().map(x => ({ ...x, pick: x.plays.map(p => p.player).join(' ') + ' ' + x.out.n }));
    const items = filtered(all).filter(x => new Date(x.start) > Date.now()).sort((a, b) => (b.plays.filter(p => p.verdict === 'good').length - a.plays.filter(p => p.verdict === 'good').length) || a.start.localeCompare(b.start));
    const good = items.flatMap(x => x.plays).filter(p => p.verdict === 'good').length;
    return head + seg + `<div class="howto">🚑 <b>How it works:</b> for every starter who's out, the app splits each teammate's game log into games <b>with</b> and <b>without</b> him. ✅ Good bet = the backup cleared this line in most games without him. ❌ Bad bet = his numbers didn't go up, so take the Under. ⚠️ Risky = small sample or the starter is only questionable. ${good ? `<b>${good} good bets</b> right now.` : ''}</div>`
      + (items.length ? `<div class="ngrid">${items.map(injuryCard).join('')}</div>` : empty('No starters out with props on their teammates for this filter. These show up when a starter is on the report and books have posted props for that game.'));
  }
  function viewNews() {
    const sec = S.newsSec;
    const seg = `<div class="seg"><button class="${sec === 'plays' ? 'on' : ''}" data-newssec="plays">🚑 Injury plays <span>${IPLAYS().filter(x => new Date(x.start) > Date.now()).flatMap(x => x.plays).filter(p => p.verdict === 'good').length}</span></button><button class="${sec === 'lineups' ? 'on' : ''}" data-newssec="lineups">📋 Lineups & injuries</button><button class="${sec === 'headlines' ? 'on' : ''}" data-newssec="headlines">📰 Headlines</button></div>`;
    const stamp = card.newsAt || window.EDGE_CARD?.newsAt;
    const head = `<div class="sec"><h2>📰 Daily News</h2><span>${S.lg === 'ALL' ? 'every sport' : esc(S.lg)} · updated ${stamp ? ago(stamp) : 'with the daily card'} · tap a sport above to filter</span></div>
      <div class="howto">💡 <b>How to use it:</b> if a starter is ruled out after the lines open, the book may not have adjusted yet. Bet his teammates' overs (more shots and minutes) or the opponent before the price moves. The ⚠️ boxes flag those spots.</div>`;
    if (sec === 'plays') return viewInjuryPlays(head, seg);
    if (sec === 'headlines') {
      const q = E.norm(S.q);
      let arts = Object.entries(NEWS()).filter(([lg]) => S.lg === 'ALL' || lg === S.lg).flatMap(([lg, a]) => a.map(x => ({ ...x, lg })));
      if (S.team !== 'ALL') arts = arts.filter(a => a.tags?.includes(S.team) || a.h.includes(S.team.split(' ').slice(-1)[0]));
      if (q) arts = arts.filter(a => E.norm(a.h + ' ' + a.d).includes(q));
      if (S.injOnly) arts = arts.filter(a => a.inj);
      arts.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      return head + seg + `<div class="seg small"><button class="${S.injOnly ? '' : 'on'}" data-injonly="0">All stories</button><button class="${S.injOnly ? 'on' : ''}" data-injonly="1">🚑 Injury news only</button></div>
        ${arts.length ? `<div class="nlist">${arts.map(a => `<a class="nitem" href="${esc(a.url)}" target="_blank" rel="noopener">${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<div><div class="nmeta"><span class="tag">${esc(a.lg)}</span>${a.inj ? '<span class="tag injtag">🚑 Injury</span>' : ''}<span class="muted">${a.at ? ago(a.at) : ''}</span></div><b>${esc(a.h)}</b><p>${esc(a.d)}</p></div></a>`).join('')}</div>`
        : empty('No headlines for this filter yet. News is pulled for every sport on the card each time the card refreshes.')}`;
    }
    const games = filtered(newsGames()).sort((a, b) => a.start.localeCompare(b.start));
    return head + seg + (games.length ? `<div class="ngrid">${games.map(gameNewsCard).join('')}</div>`
      : empty('No upcoming games for this filter.'));
  }
  function viewHow() {
    return `<div class="sec"><h2>How the edge works</h2></div>
      <div class="flow">
        <div class="step">Sharp line<small>Pinnacle: KC -250 / NYJ +210</small></div><span class="arr">→</span>
        <div class="step">Strip the vig<small>power de-vig → NYJ 31.1%</small></div><span class="arr">→</span>
        <div class="step">Shop every book<small>best: +250 @ FanDuel</small></div><span class="arr">→</span>
        <div class="step">Edge<small>0.311 × 3.50 − 1 = <b style="color:var(--edge)">+8.9%</b></small></div><span class="arr">→</span>
        <div class="step">Matchup check<small>injuries · hit rate · model</small></div>
      </div>
      <div class="how">
        <div class="card"><h3>🎯 Why sharp lines?</h3><p>Pinnacle takes giant bets from pros and moves fast, so its price is the closest thing to the real odds. Remove its fee and you get the true win %. When DraftKings or FanDuel pay more than that, you're getting paid more than the bet is worth.</p></div>
        <div class="card"><h3>🧑‍🤝‍🧑 Props: consensus</h3><p>When Pinnacle doesn't hang a prop, the fair line is the median no-vig price across 3+ books. A book that's out of line with everyone else is the edge — the classic prop "line shop".</p></div>
        <div class="card"><h3>📊 Hit-rate bars</h3><p>Each bar is one recent game: green = cleared the line, red = didn't, dashed line = tonight's number. Hit rate backs the price — it never replaces it (small samples lie).</p></div>
        <div class="card"><h3>🧠 Vibe score</h3><p>+1 for each thing backing the pick (ESPN model agrees, opposing starters out, teammate out → more usage, form, scoring projection), −1 for each against. 🟢 +2 or better, 🔴 −2 or worse.</p></div>
        <div class="card"><h3>🧮 Parlays</h3><p>Edges multiply: three +3% legs ≈ +9.3%. Three normal −110 legs ≈ −13%, which is why random parlays bleed money. Only +EV legs, one per game — same-game legs are correlated.</p></div>
        <div class="card"><h3>💰 Units</h3><p>1 unit = 1% of your bankroll (or your own size in ⚙️). +EV bets are sized by ¼ Kelly (bigger edge + higher win chance = more units), rounded to ¼u and capped at 3u; matchup vibe nudges it. ⭐ Leans get 0.5u, ☆ slight leans 0.25u, parlays max 1u, no edge = 0u (skip).</p></div>
        <div class="card"><h3>💰 Kelly stake</h3><p>Stake = (b·p − q)/b of bankroll — the size that grows a bankroll fastest long-run. Default is ¼ Kelly because parlays swing hard. Tiny stakes are a feature, not a bug.</p></div>
        <div class="card"><h3>⏰ Auto-updates</h3><p>A GitHub Action rebuilds this card every morning and spends a slice of your monthly Odds API credits (credits left ÷ days left). Hit <b>↻ Live refresh</b> with your key for fresh lines any time.</p></div>
        <div class="card"><h3>🔌 Free data feeds</h3><p>Odds: The Odds API (your credits). Everything else is free, no keys: <b>ESPN</b> (stats, injuries, live scores, DraftKings lines), <b>NHL API</b> (likely starting goalies + save %), <b>nflverse</b> (NFL target share &amp; usage), <b>Open-Meteo</b> + ESPN (wind, rain, snow, cold at outdoor stadiums), <b>Kalshi</b> + <b>Polymarket</b> (real-money prediction markets as a second opinion), <b>MLB Stats API</b> (probable pitchers, in season).</p></div>
        <div class="card"><h3>⚠️ Real talk</h3><p>Edges are small and variance is huge — a +10% EV parlay at 15% hit chance still loses 85% of the time. Books limit winners. Edges over 15% are usually stale lines and get flagged. Bet what you can lose.</p></div>
      </div>`;
  }
  const empty = msg => `<div class="empty">${msg}</div>`;

  function renderKPIs() {
    if (!card) { $('kpis').innerHTML = ''; return; }
    const all = [...card.lines, ...card.props].filter(x => !isSus(x));
    const bestE = all.reduce((a, b) => !a || b.ev > a.ev ? b : a, null);
    const top = card.parlays?.[1] || card.parlays?.[0];
    const topS = top ? E.parlayStats(top.legs.map(id => byId[id]).filter(Boolean), S.kfrac) : null;
    const games = card.sports.reduce((a, s) => a + s.games, 0);
    $('kpis').innerHTML = [
      ['Games scanned', games, card.sports.map(s => s.emoji + ' ' + s.lg).join(' ')],
      ['+EV picks', all.length, `${card.lines.length} lines · ${card.props.length} props`],
      ['Best edge', bestE ? signPct(bestE.ev) : '—', bestE ? bestE.pick : ''],
      ['Value parlay', topS ? toAm(topS.dec) : '—', topS ? `${pct(topS.p)} hit · ${signPct(topS.ev)} EV` : ''],
    ].map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${esc(v)}</div><div class="s" title="${esc(s)}">${esc(s)}</div></div>`).join('');
  }
  function renderMeta() {
    if (!card) { $('meta').innerHTML = 'No card yet — hit <b>↻ Live refresh</b> or run the daily build.'; return; }
    const d = new Date(card.generatedAt), age = (Date.now() - d) / 36e5;
    $('meta').innerHTML = `Card for <b>${d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</b> · updated ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      + (age > 26 ? ' <span class="sus">· stale, refresh</span>' : '') + (card.credits?.left != null ? ` · ${card.credits.left} API credits left` : '') + (card.creditPlan ? ` (~${card.creditPlan.perDay}/day pace)` : '');
  }

  function render() {
    renderTabs(); renderMeta(); renderKPIs(); renderSlipbar();
    if (!card) {
      $('filters').innerHTML = '';
      $('view').innerHTML = empty(`<div style="font-size:40px">⚡</div><h2 style="color:var(--ink)">No card loaded</h2>
        <p>The daily GitHub Action writes <code>data/latest.js</code>. Or open ⚙️ Settings, paste your Odds API key and hit ↻ Live refresh.</p>`);
      return;
    }
    const v = { top: viewTop, alts: viewAlts, board: viewBoard, live: viewLive, money: viewMoney, climb: viewClimb, record: viewRecord, news: viewNews, sheet: viewSheet, props: viewProps, lines: viewLines, parlays: viewParlays, how: viewHow }[S.tab] || viewTop;
    renderFilters(S.tab === 'board' ? [...card.lines, ...card.props] : S.tab === 'news' ? newsItems() : S.tab === 'how' || S.tab === 'climb' || S.tab === 'parlays' || S.tab === 'record' || S.tab === 'money' || S.tab === 'live' ? null : S.tab === 'sheet' ? (card.board || []) : S.tab === 'props' ? (S.allPlayers ? allPlayerProps() : card.props) : S.tab === 'alts' ? altProps() : S.tab === 'lines' ? (card.board || []).filter(x => x.type === 'line' && !x.alt) : [...card.lines, ...card.props], { markets: S.tab === 'props' || S.tab === 'alts', sheet: S.tab === 'sheet' });
    $('view').innerHTML = v();
  }

  // ---------- modal (details) ----------
  const stBadge = s => /^out/i.test(s) ? '<span class="st o">OUT</span>' : /^doubt/i.test(s) ? '<span class="st d">DBT</span>'
    : /^quest|day/i.test(s) ? '<span class="st q">Q</span>' : /reserve/i.test(s) ? '<span class="st ir">IR</span>' : `<span class="st ir">${esc(s.slice(0, 3))}</span>`;
  function openDetail(id) {
    const x = byId[id]; if (!x) return;
    const t = titleOf(x), g = gameOf(x), v = x.vibe || { items: [] }, hit = v.hit;
    let probs = `<h4>Win chance</h4>
      <div class="meter"><span>True</span><div class="track"><i style="width:${x.fairP * 100}%;background:var(--edge)"></i></div><b>${pct(x.fairP, 0)}</b></div>
      ${x.dec ? '' : '<!--'}<div class="meter"><span>Book</span><div class="track"><i style="width:${100 / x.dec}%;background:var(--muted)"></i></div><b>${pct(1 / x.dec, 0)}</b></div>${x.dec ? '' : '-->'}`;
    if (x.type === 'line' && x.market === 'h2h' && g?.model) {
      const side = teamSide(x), m = side && g.model[side.name];
      if (m != null) probs += `<div class="meter"><span>ESPN</span><div class="track"><i style="width:${m * 100}%;background:var(--accent)"></i></div><b>${pct(m, 0)}</b></div>`;
    }
    const hitBlock = hit ? `<h4 style="margin-top:16px">Last ${hit.n} games vs ${x.point}</h4>${sparkSVG(hit, x.point, 300, 80)}
      <p class="note">${x.side} hit <b>${hit.hits}/${hit.n}</b> (${hit.h5}/${hit.n5} last 5) · average <b>${hit.avg.toFixed(1)}</b> · most recent on the right</p>` : '';
    const priceList = (x.prices || []).slice().sort((a, b) => b.dec - a.dec).slice(0, 6)
      .map(p => `<span class="tag" style="margin:0 4px 4px 0;display:inline-block">${esc(p.title)} ${toAm(p.dec)}</span>`).join('');
    let gameBlock = '';
    if (g) {
      const isNum = s => /^-?[\d.,]+%?$/.test(String(s).trim()), num = s => parseFloat(String(s).replace(/,/g, ''));
      const keys = Object.keys(g.away.stats).filter(k => k in g.home.stats && isNum(g.home.stats[k]) && isNum(g.away.stats[k])).slice(0, 9);
      const rows = keys.map(k => { const a = num(g.away.stats[k]), h = num(g.home.stats[k]), m = Math.max(Math.abs(a), Math.abs(h)) || 1;
        return `<div class="vs"><div class="l">${esc(g.away.stats[k])}<div class="hb" style="width:${Math.abs(a) / m * 100}%"></div></div><div class="lbl">${esc(k)}</div><div class="r"><div class="hb h" style="width:${Math.abs(h) / m * 100}%"></div>${esc(g.home.stats[k])}</div></div>`; }).join('');
      const pj = E.projection(g);
      const col = tm => `<div><h4>${esc(tm.abbr)} ${esc(tm.rec)} · last 5</h4><div class="dots">${tm.l5.map(r => `<span class="${esc(r.r)}" title="${esc(r.at)} ${esc(r.opp)} ${esc(r.sc)}">${esc(r.r)}</span>`).join('') || '<span class="muted">—</span>'}</div>
        <h4 style="margin-top:12px">Leaders</h4>${tm.leaders.map(l => `<div class="inj">${E.isOut(tm, l.id) ? '<span class="st o">OUT</span>' : ''}<b>${esc(l.label)}:</b> ${esc(l.name)} <span class="muted">${esc(l.val)}</span></div>`).join('') || '<span class="muted">—</span>'}
        <h4 style="margin-top:12px">Injuries</h4>${tm.injuries.length ? tm.injuries.map(p => `<div class="inj">${stBadge(p.status)}${esc(p.name)} <span class="muted">${esc(p.pos)} · ${esc(p.type)}</span></div>`).join('') : '<span class="muted">None listed</span>'}</div>`;
      gameBlock = `<div><h4>Season stats · ${esc(g.away.abbr)} vs ${esc(g.home.abbr)}</h4>${rows || '<span class="muted">No team stats</span>'}
        ${pj ? `<p class="note">Projected from season averages: ${esc(g.away.abbr)} ${pj.away.toFixed(1)} – ${esc(g.home.abbr)} ${pj.home.toFixed(1)}</p>` : ''}</div>
        <div class="teamcols">${col(g.away)}${col(g.home)}</div>`;
    }
    $('modal').innerHTML = `<div class="m-head">${avatar(x)}<div class="c-title"><div class="n" style="font-size:19px">${esc(t.n)}</div><div class="p">${esc(t.p)}</div><div class="g">${esc(x.game)} · ${esc(fmtTime(x.start))}</div></div>
        <div class="price"><b>${x.dec ? toAm(x.dec) : toAm(1 / x.fairP)}</b><small>${x.dec ? esc(x.book) : 'fair'}</small></div><button class="x" data-close>✕</button></div>
      <div class="m-body">
        <div><h4>Why this pick <span class="vibe ${vibeCls(x.vibe)}">${vibeTxt(x.vibe)}</span></h4><ul class="why">${v.items.map(i => `<li class="${i.tone}">${i.text}</li>`).join('')}</ul>${hitBlock}</div>
        <div>${probs}
          ${x.dec ? `<div class="unitbox">💰 Recommended: <b>${unitsTxt(unitsFor(x))}</b><span class="muted"> · 1u = $${unitSize().toFixed(2)}</span></div>` : ''}
          <p class="note" style="margin-top:10px">${x.dec ? `<span class="edge ${x.ev < 0 ? 'neg' : ''}">${signPct(x.ev)} EV</span>` : ''} &nbsp;fair ${toAm(1 / x.fairP)} via ${esc(x.src)}${x.nBooks ? ` (${x.nBooks} books)` : ''}</p>
          ${B365() ? `<div class="b365" style="margin-top:12px"><span>🎯 Bet at ${esc(MYB())} if odds are <b>${targetAm(x)}</b> or better</span>${priceInput(x)}</div>` : ''}
          ${isSus(x) ? '<div class="warnbox">⚠ Edge this big usually means a stale or mistaken line. Check news before betting.</div>' : ''}
          ${priceList ? `<h4 style="margin-top:14px">Best prices</h4><div>${priceList}</div>` : ''}
          <div style="margin-top:14px">${x.dec ? '' : '<p class="note">No sportsbook price here: it goes in your slip at the fair price. Type your ${esc(MYB())} odds (above or in the slip) for the real edge.</p>'}<button class="btn primary" data-add="${esc(x.id)}">${S.slip.includes(x.id) ? '✓ In slip — remove' : '+ Add to slip'}</button></div>
        </div>
        ${gameBlock}
      </div>`;
    $('modal').classList.add('show'); $('overlay').classList.add('show');
  }

  // ---------- slip ----------
  // legs without a sportsbook price use the fair price (0% edge) until you type your bet365 odds in the slip
  const slipLegs = () => S.slip.map(id => byId[id]).filter(Boolean).map(x => x.dec ? x : { ...x, dec: 1 / x.fairP, ev: 0, book: 'fair price', fairOnly: true });
  function toggleSlip(id) {
    S.slip = S.slip.includes(id) ? S.slip.filter(x => x !== id) : [...S.slip, id];
    store.set('slip', S.slip); render();
    if ($('drawer').classList.contains('show') && $('drawerTitle').textContent.includes('slip')) openSlip();
    if ($('modal').classList.contains('show')) openDetail(id);
  }
  function renderSlipbar() {
    const ls = slipLegs(), bar = $('slipbar');
    if (!ls.length) { bar.classList.add('hide'); return; }
    bar.classList.remove('hide');
    const s = E.parlayStats(ls, S.kfrac);
    bar.innerHTML = `<div class="cnt">${ls.length}</div><div><b>${ls.length === 1 ? 'Single' : ls.length + '-leg parlay'}</b><br><span style="opacity:.85;font-size:13px">${pct(s.p)} hit · ${signPct(s.ev)} EV</span></div><div class="sb-odds">${toAm(s.dec)}</div>`;
  }
  function openSlip() {
    const ls = slipLegs(), s = ls.length ? E.parlayStats(ls, S.kfrac) : null;
    const same = new Set(ls.map(l => l.eventId)).size < ls.length, reds = ls.filter(l => l.vibe?.score <= -2);
    openDrawer('🧾 Your slip', ls.length ? `
      ${ls.map(l => { const t = titleOf(l); return `<div class="slipleg">${avatar(l)}<div class="t"><b>${esc(t.n)}</b>${esc(t.p)} · ${esc(l.book)} ${l.fairOnly ? '<span class="muted" style="font-size:11px">type your odds →</span>' : `<span class="edge" style="font-size:11px">${signPct(l.ev)}</span>`}</div>${l.fairOnly ? priceInput(l) : `<b>${toAm(l.dec)}</b>`}<button class="x" data-add="${esc(l.id)}" title="Remove">✕</button></div>`; }).join('')}
      <div class="pstats"><div><small>Odds</small><b>${toAm(s.dec)}</b></div><div><small>Hit</small><b>${pct(s.p)}</b></div><div><small>EV</small><b style="color:${s.ev >= 0 ? 'var(--edge)' : 'var(--bad)'}">${signPct(s.ev)}</b></div><div><small>Units</small><b>${unitsTxt(ls.length > 1 ? unitsParlay(ls) : unitsFor(ls[0]), true)}</b><small style="text-transform:none;letter-spacing:0">$${((ls.length > 1 ? unitsParlay(ls) : unitsFor(ls[0]) || 0) * unitSize()).toFixed(2)}</small></div></div>
      <div class="meter"><span>True</span><div class="track"><i style="width:${Math.min(100, s.p * 100)}%;background:var(--edge)"></i></div><b>${pct(s.p, 0)}</b></div>
      <div class="meter"><span>Book</span><div class="track"><i style="width:${Math.min(100, s.implied * 100)}%;background:var(--muted)"></i></div><b>${pct(s.implied, 0)}</b></div>
      <p class="note">$10 pays <b>$${(10 * s.dec).toFixed(2)}</b> · expected profit per $10: <b>${s.ev >= 0 ? '+' : '−'}$${Math.abs(10 * s.ev).toFixed(2)}</b> · stake is ${S.kfrac === 0.25 ? '¼' : S.kfrac} Kelly on a $${S.bankroll} bankroll</p>
      ${s.ev < 0 ? '<div class="warnbox">Negative EV — Kelly says bet $0.</div>' : ''}
      ${same ? '<div class="warnbox">⚠ Two legs from the same game are correlated — the hit % is unreliable and many books will block it.</div>' : ''}
      ${reds.length ? `<div class="warnbox">🔴 Matchup data fades: ${reds.map(l => esc(l.pick)).join(', ')}</div>` : ''}
      <button class="btn" id="clearSlip">Clear slip</button>` : '<div class="empty">Tap <b>+ Slip</b> on any pick.</div>');
  }

  // ---------- settings + live refresh ----------
  function openSettings() {
    openDrawer('⚙️ Settings', `<div class="form">
      <label>The Odds API key <input id="sKey" type="password" value="${esc(S.key)}" placeholder="free at the-odds-api.com"></label>
      <label>Credits per live refresh <input id="sBudget" type="number" min="3" value="${esc(S.budget)}"></label>
      <p class="note">~3 credits per sport with games today, ~3–5 per game for props. Sports with nothing on the schedule cost 0. Free tier = 500/month, shared with the daily build.</p>
      ${card?.creditPlan ? (() => { const cp = card.creditPlan, used = Math.max(0, 500 - cp.left), proj = Math.round(used + cp.perDay * cp.daysLeft + cp.reserve);
        return `<div class="howto">📅 <b>Monthly goal: stay on the free 500.</b> Used <b>${used}</b> of 500 · on pace to finish the month around <b>${Math.min(500, proj)}</b> · the daily build never spends past what's left, and The Odds API free plan simply stops (never bills) at 0.
          <div class="track" style="margin-top:8px;height:8px"><i style="width:${Math.min(100, used / 5)}%;background:var(--edge)"></i></div></div>`; })() : ''}
      ${card?.creditPlan ? `<div class="howto">🪙 <b>${card.creditPlan.left}</b> credits left · <b>${card.creditPlan.daysLeft}</b> days to go · daily pace <b>~${card.creditPlan.perDay}</b> · reserve for your refreshes <b>${card.creditPlan.reserve}</b>. The daily build spends more on big Saturdays and Sundays and less early in the week.</div>` : ''}
      <label>Where I bet <select id="sBooks"><option value="ca">🇨🇦 Canadian books (default)</option><option value="us" ${S.region === 'us' ? 'selected' : ''}>🇺🇸 US books</option><option value="all" ${S.region === 'all' ? 'selected' : ''}>🌍 All books</option></select></label>
      <p class="note" style="margin:-4px 0 4px">🇨🇦 Canadian books = the best price at FanDuel, DraftKings, BetMGM, Caesars, BetRivers, theScore Bet or Pinnacle (no offshore books). Use Bet99, Sports Interaction, PROLINE+ and the rest? Pick it under My sportsbook: you get fair odds and a target price, and you type in their price.</p>
      <label>My sportsbook <select id="sMyBook"><option value="best">Best price at the books above (auto)</option>
        <optgroup label="I type in the price (books the odds feed doesn't carry)">${TYPE_IN.map(b => `<option value="${esc(b)}">${esc(b)}${b === 'bet365' ? '' : ' 🇨🇦'}</option>`).join('')}</optgroup></select></label>
      <label>Bankroll ($) <input id="sBank" type="number" value="${esc(S.bankroll)}"></label>
      <label>Unit size ($) <input id="sUnit" type="number" min="0" step="0.5" value="${S.unit > 0 ? esc(S.unit) : ''}" placeholder="auto: 1% of bankroll ($${Math.max(1, S.bankroll / 100).toFixed(2)})"></label>
      <label>Kelly fraction <select id="sKelly">${[[0.1, '1/10'], [0.25, '1/4'], [0.5, '1/2']].map(([v, l]) => `<option value="${v}" ${S.kfrac === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>If the daily card is from yesterday <select id="sAuto"><option value="1">Rebuild it automatically when I open the site</option><option value="0">Don't (I'll hit ↻ Live refresh)</option></select></label>
      <label>Theme <select id="sTheme"><option value="">Match system</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <button class="btn primary" id="saveSet">Save</button>
      ${store.get('liveCard', null) ? '<button class="btn" id="dropLive">Go back to the daily card</button>' : ''}
      <p class="note">Your key is stored only in this browser.</p></div>`);
    $('sTheme').value = store.get('theme', '');
    $('sMyBook').value = S.myBook;
    $('sAuto').value = store.get('autoRefresh', true) ? '1' : '0';
  }
  async function liveRefresh() {
    if (!S.key) { openSettings(); return; }
    const stale = card && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(card.generatedAt)) !== new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    openDrawer('↻ Live refresh', `${stale ? '<div class="howto">📅 The saved card was from a previous day (GitHub\u2019s daily job didn\u2019t run yet), so this browser is building today\u2019s card.</div>' : ''}<p class="note">Pulling fresh lines + props for games in the next 30h (max ${S.budget} credits; change it in ⚙️ Settings)…</p><div class="log" id="log"></div>`);
    const log = m => { const el = $('log'); if (el) { el.textContent += m + '\n'; el.scrollTop = 1e9; } };
    const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status + ''); return { json: /\.csv(\?|$)/.test(url) ? await r.text() : await r.json(), headers: n => r.headers.get(n) }; };
    try {
      const c = await E.buildCard({ get, key: S.key, budget: S.budget, books: S.region, log });
      card = c; store.set('liveCard', c); index(); render();
      log('✅ Done — card updated.');
    } catch (e) { log('❌ ' + e.message); }
  }

  // ---------- drawer/modal plumbing ----------
  function openDrawer(title, html) { $('drawerTitle').textContent = title; $('drawerBody').innerHTML = html; $('drawer').classList.add('show'); $('overlay').classList.add('show'); }
  function closeAll() { $('drawer').classList.remove('show'); $('modal').classList.remove('show'); $('overlay').classList.remove('show'); }
  function applyTheme() { const t = store.get('theme', ''); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

  document.addEventListener('click', e => {
    if (e.target.closest('input.pin')) return;
    if (e.target.id === 'moreBtn') { S.shown += 150; render(); return; }
    if (e.target.id === 'liveNow') { refreshLive(true); return; }
    const el = e.target.closest('[data-add],[data-open],[data-tab],[data-section],[data-allp],[data-best],[data-gltype],[data-newssec],[data-injonly],[data-newsteam],[data-lg],[data-mk],[data-close],[data-loadparlay],#overlay,#slipbar,#liveBtn,#setBtn,#saveSet,#dropLive,#clearSlip,#buildBtn');
    if (!el) return;
    if (el.dataset.add) { e.stopPropagation(); toggleSlip(el.dataset.add); return; }
    if (el.dataset.open) { openDetail(el.dataset.open); return; }
    if (el.dataset.allpGo) { S.allPlayers = el.dataset.allpGo === '1'; store.set('allPlayers', S.allPlayers); }
    if (el.dataset.tab) { e.preventDefault(); window.scrollTo({ top: 0 }); S.tab = el.dataset.tab; store.set('tab', S.tab); S.market = 'ALL'; render(); return; }
    if (el.dataset.lg) { S.lg = el.dataset.lg; S.market = 'ALL'; S.team = 'ALL'; render(); return; }
    if (el.dataset.mk) { S.market = el.dataset.mk; render(); return; }
    if (el.dataset.newssec) { S.newsSec = el.dataset.newssec; store.set('newsSec', S.newsSec); render(); return; }
    if (el.dataset.injonly) { S.injOnly = el.dataset.injonly === '1'; render(); return; }
    if (el.dataset.newsteam) { S.team = el.dataset.newsteam; S.tab = 'props'; S.allPlayers = true; store.set('allPlayers', true); render(); return; }
    if (el.dataset.gltype) { S.glType = el.dataset.gltype; store.set('glType', S.glType); render(); return; }
    if (el.dataset.best) { S.bestOnly = el.dataset.best === '1'; store.set('bestOnly', S.bestOnly); render(); return; }
    if (el.dataset.allp) { S.allPlayers = el.dataset.allp === '1'; store.set('allPlayers', S.allPlayers); S.shown = 120; render(); return; }
    if (el.dataset.section) { S.section = el.dataset.section; store.set('section', S.section); render(); return; }
    if (el.dataset.loadparlay) { S.slip = el.dataset.loadparlay.split(','); store.set('slip', S.slip); render(); openSlip(); return; }
    if (el.hasAttribute('data-close') || el.id === 'overlay') { closeAll(); return; }
    switch (el.id) {
      case 'slipbar': openSlip(); break;
      case 'liveBtn': liveRefresh(); break;
      case 'setBtn': openSettings(); break;
      case 'clearSlip': S.slip = []; store.set('slip', []); render(); openSlip(); break;
      case 'dropLive': store.set('liveCard', null); try { localStorage.removeItem('edge.liveCard'); } catch (err) {} card = window.EDGE_CARD; index(); render(); closeAll(); break;
      case 'saveSet':
        S.key = $('sKey').value.trim(); S.budget = Math.max(3, +$('sBudget').value || 8); const oldRegion = S.region; S.region = $('sBooks').value; S.allBooks = S.region === 'all'; store.set('region', S.region);
        S.bankroll = +$('sBank').value || 500; S.kfrac = +$('sKelly').value; S.myBook = $('sMyBook').value; S.unit = Math.max(0, +$('sUnit').value || 0); store.set('unit', S.unit);
        ['key', 'allBooks', 'bankroll', 'kfrac', 'myBook'].forEach(k => store.set(k, S[k])); store.set('budget2', S.budget);
        store.set('theme', $('sTheme').value); applyTheme(); store.set('autoRefresh', $('sAuto').value === '1');
        if (S.region !== oldRegion) { location.reload(); break; } // re-price everything cleanly for the new region
        closeAll(); render(); break;
      case 'buildBtn': {
        const src = $('bsrc').value, lg = $('blg').value;
        const pool = E.parlayPool([...card.lines, ...card.props].filter(x => (src === 'all' || x.type === src) && (lg === 'ALL' || x.lg === lg)));
        const res = E.buildParlays(pool, +$('bk').value, $('brank').value, S.kfrac).slice(0, 6);
        built = res.length ? res.map((r, i) => parlayCard({ name: `Option ${i + 1}`, emoji: '🎟️', legs: r.legs.map(l => l.id) }, i === 0)).join('')
          : empty('Not enough +EV legs from different games for that many legs.');
        $('builtOut').innerHTML = built; break;
      }
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') { S.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $('q'); q.focus(); q.setSelectionRange(pos, pos); }
  });
  document.addEventListener('toggle', e => { if (e.target.matches?.('[data-legend]')) store.set('legendOpen', e.target.open); }, true);
  document.addEventListener('change', e => {
    if (e.target.id === 'sort') { S.sort = e.target.value; render(); }
    if (e.target.id === 'type') { S.type = e.target.value; S.shown = 120; render(); }
    if (e.target.id === 'ladStart') { S.ladStart = Math.max(1, +e.target.value || 10); store.set('ladStart', S.ladStart); render(); }
    if (e.target.id === 'fDay') { S.day = e.target.value; S.time = 'ALL'; S.shown = 120; render(); }
    if (e.target.id === 'fTime') { S.time = e.target.value; S.shown = 120; render(); }
    if (e.target.id === 'fTeam') { S.team = e.target.value; S.shown = 120; render(); }
    if (e.target.dataset?.price) { const id = e.target.dataset.price, open = $('modal').classList.contains('show'), slipOpen = $('drawer').classList.contains('show') && $('drawerTitle').textContent.includes('slip'); setPrice(id, e.target.value); if (open) openDetail(id); if (slipOpen) openSlip(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

  applyTheme(); index(); render(); refreshLive(true);
  // Self-heal: if GitHub's scheduler skipped today's build, rebuild in this browser with the saved key (once a day).
  const etDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(d));
  if (card && S.key && store.get('autoRefresh', true) && etDay(card.generatedAt) !== etDay(Date.now()) && store.get('autoDay', '') !== etDay(Date.now())) {
    store.set('autoDay', etDay(Date.now()));
    liveRefresh();
  }
})();
