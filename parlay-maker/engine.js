/* Edge Lab engine — shared by the browser UI and the daily Node build (scripts/build.js).
 * Pure logic + a buildCard() pipeline that takes an injected `get(url)` so it runs anywhere. */
(function (root) {
  'use strict';

  // ---------------- config ----------------
  const SPORTS = {
    americanfootball_nfl: { lg: 'NFL', emoji: '🏈', espn: 'football/nfl', kind: 'fb', lines: 'h2h,spreads,totals', pri: 1,
      props: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds', 'player_receptions'] },
    basketball_nba: { lg: 'NBA', emoji: '🏀', espn: 'basketball/nba', kind: 'bb', lines: 'h2h,spreads,totals', pri: 1,
      props: ['player_points', 'player_rebounds', 'player_assists', 'player_threes', 'player_points_rebounds_assists'] },
    icehockey_nhl: { lg: 'NHL', emoji: '🏒', espn: 'hockey/nhl', kind: 'hk', lines: 'h2h,spreads,totals', pri: 2,
      props: ['player_shots_on_goal', 'player_points', 'player_assists'] },
    americanfootball_ncaaf: { lg: 'NCAAF', emoji: '🏈', espn: 'football/college-football', q: '&groups=80&limit=300', kind: 'fb', lines: 'h2h,spreads,totals', pri: 2,
      props: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds'] },
    basketball_ncaab: { lg: 'NCAAB', emoji: '🏀', espn: 'basketball/mens-college-basketball', q: '&groups=50&limit=400', kind: 'bb', lines: 'h2h,spreads,totals', pri: 3,
      props: ['player_points', 'player_rebounds', 'player_assists'] },
    baseball_mlb: { lg: 'MLB', emoji: '⚾', espn: 'baseball/mlb', kind: 'other', lines: 'h2h,spreads,totals', pri: 2,
      props: ['batter_hits', 'batter_total_bases', 'pitcher_strikeouts'] },
    soccer_epl: { lg: 'EPL', emoji: '⚽', espn: 'soccer/eng.1', kind: 'other', lines: 'h2h,spreads,totals', pri: 3, oneSided: true,
      props: ['player_goal_scorer_anytime', 'player_shots_on_target', 'player_shots', 'player_assists'] },
    soccer_uefa_champs_league: { lg: 'UCL', emoji: '⚽', espn: 'soccer/uefa.champions', kind: 'other', lines: 'h2h,spreads,totals', pri: 3, oneSided: true,
      props: ['player_goal_scorer_anytime', 'player_shots_on_target', 'player_shots', 'player_assists'] },
    mma_mixed_martial_arts: { lg: 'MMA', emoji: '🥊', kind: 'other', lines: 'h2h', pri: 4 },
    // Europa League: sharp lines when the budget has room (lowest priority); US books don't post its player props
    soccer_uefa_europa_league: { lg: 'UEL', emoji: '⚽', espn: 'soccer/uefa.europa', kind: 'other', lines: 'h2h,spreads,totals', pri: 4 },
    // ESPN-only leagues: free DraftKings lines via ESPN, no Odds API credits
    espn_uecl: { lg: 'UECL', emoji: '⚽', espn: 'soccer/uefa.europa.conf', kind: 'other', lines: 'h2h,spreads,totals', espnOnly: true, pri: 9 },
    espn_facup: { lg: 'FA Cup', emoji: '🏴', espn: 'soccer/eng.fa', kind: 'other', lines: 'h2h,spreads,totals', espnOnly: true, pri: 9 },
    espn_eflcup: { lg: 'EFL Cup', emoji: '🏴', espn: 'soccer/eng.league_cup', kind: 'other', lines: 'h2h,spreads,totals', espnOnly: true, pri: 9 },
    // Big European leagues + MLS: props (goalscorer / shots on target at 4-5 US books) in the round-robin at the lowest
    // priority; lines are bought only with leftover budget, otherwise they come free from ESPN
    soccer_spain_la_liga: { lg: 'LaLiga', emoji: '⚽', espn: 'soccer/esp.1', kind: 'other', lines: 'h2h,spreads,totals', pri: 4, oneSided: true, props: ['player_goal_scorer_anytime', 'player_shots_on_target', 'player_shots', 'player_assists'] },
    soccer_italy_serie_a: { lg: 'SerieA', emoji: '⚽', espn: 'soccer/ita.1', kind: 'other', lines: 'h2h,spreads,totals', pri: 4, oneSided: true, props: ['player_goal_scorer_anytime', 'player_shots_on_target', 'player_shots', 'player_assists'] },
    soccer_germany_bundesliga: { lg: 'Bundesliga', emoji: '⚽', espn: 'soccer/ger.1', kind: 'other', lines: 'h2h,spreads,totals', pri: 4, oneSided: true, props: ['player_goal_scorer_anytime', 'player_shots_on_target', 'player_shots', 'player_assists'] },
    soccer_france_ligue_one: { lg: 'Ligue1', emoji: '⚽', espn: 'soccer/fra.1', kind: 'other', lines: 'h2h,spreads,totals', pri: 4, oneSided: true, props: ['player_goal_scorer_anytime', 'player_shots_on_target', 'player_shots', 'player_assists'] },
    soccer_usa_mls: { lg: 'MLS', emoji: '⚽', espn: 'soccer/usa.1', kind: 'other', lines: 'h2h,spreads,totals', pri: 4, oneSided: true, props: ['player_goal_scorer_anytime', 'player_shots_on_target', 'player_shots', 'player_assists'] },
  };
  // Pinnacle + 9 US books = one "region" worth of credits on The Odds API.
  const BOOKS = 'pinnacle,draftkings,fanduel,betmgm,williamhill_us,espnbet,betrivers,fanatics,betonlineag,bovada';
  const US_BOOKS = /^(draftkings|fanduel|betmgm|williamhill_us|espnbet|betrivers|fanatics|ballybet|hardrockbet|betonlineag|bovada|mybookieag|lowvig|betus|betparx|fliff|rebet|betanysports)/;
  const STALE = 0.15;           // edges above this are almost always bad/stale lines
  const PROP_STALE = 0.20;

  const PROP_STATS = {
    player_points: { label: 'PTS', keys: ['PTS', 'points'] },
    player_rebounds: { label: 'REB', keys: ['REB', 'totalRebounds', 'rebounds'] },
    player_assists: { label: 'AST', keys: ['AST', 'assists', 'goalAssists'] },
    player_threes: { label: '3PM', keys: ['3PT', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'], made: true },
    player_points_rebounds_assists: { label: 'PRA', sum: ['player_points', 'player_rebounds', 'player_assists'] },
    player_pass_yds: { label: 'Pass Yds', keys: ['passingYards'] },
    player_rush_yds: { label: 'Rush Yds', keys: ['rushingYards'] },
    player_reception_yds: { label: 'Rec Yds', keys: ['receivingYards'] },
    player_receptions: { label: 'Receptions', keys: ['receptions'] },
    player_shots_on_goal: { label: 'Shots', keys: ['shotsTotal', 'shots'] },
    batter_hits: { label: 'Hits', keys: ['hits', 'H'] },
    batter_total_bases: { label: 'Total Bases', keys: ['totalBases', 'TB'] },
    pitcher_strikeouts: { label: 'Ks', keys: ['strikeouts', 'K'] },
    player_goal_scorer_anytime: { label: 'Goals', keys: ['totalGoals', 'goals', 'G'] },
    player_shots_on_target: { label: 'SOT', keys: ['shotsOnTarget', 'SOT', 'ST'] },
    player_shots: { label: 'Shots', keys: ['totalShots', 'shots', 'SH'] },
  };

  // ---------------- math ----------------
  const toDec = a => a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
  const toAm = d => d >= 2 ? '+' + Math.round((d - 1) * 100) : String(Math.round(-100 / (d - 1)));
  const pct = (x, dp = 1) => (x * 100).toFixed(dp) + '%';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // power de-vig: find k with sum(implied^k) = 1 — doesn't overrate longshots like proportional does
  function devig(decs) {
    const inv = decs.map(d => 1 / d);
    let lo = 1, hi = 3;
    for (let n = 0; n < 60; n++) { const k = (lo + hi) / 2; inv.reduce((a, x) => a + x ** k, 0) > 1 ? lo = k : hi = k; }
    return inv.map(x => x ** lo);
  }
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z ]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();

  async function mapLimit(arr, n, fn) {
    const out = new Array(arr.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, arr.length) }, async () => {
      while (i < arr.length) { const k = i++; try { out[k] = await fn(arr[k], k); } catch (e) { out[k] = null; } }
    }));
    return out;
  }

  // ---------------- game lines ----------------
  function legsFromEvents(events, sport, fairML, sharpKey = 'pinnacle') {
    const out = [], S = SPORTS[sport] || {};
    for (const ev of events) {
      const sharp = ev.bookmakers.find(b => b.key === sharpKey);
      if (!sharp || new Date(ev.commence_time) < Date.now()) continue;
      for (const sm of sharp.markets) {
        const fair = devig(sm.outcomes.map(o => toDec(o.price)));
        if (sm.key === 'h2h') { fairML[ev.id] = {}; sm.outcomes.forEach((o, i) => fairML[ev.id][o.name] = fair[i]); }
        sm.outcomes.forEach((so, i) => {
          const key = so.name + '|' + (so.point ?? '');
          const prices = [];
          for (const b of ev.bookmakers) {
            if (b.key === sharpKey) continue;
            const m = b.markets.find(m => m.key === sm.key); if (!m) continue;
            const o = m.outcomes.find(o => o.name + '|' + (o.point ?? '') === key); if (!o) continue;
            prices.push({ key: b.key, title: b.title, dec: toDec(o.price) });
          }
          if (!prices.length) return;
          const pick = sm.key === 'h2h' ? `${so.name} ML`
            : sm.key === 'spreads' ? `${so.name} ${so.point > 0 ? '+' : ''}${so.point}` : `${so.name} ${so.point}`;
          out.push({ type: 'line', id: ev.id + sm.key + key, eventId: ev.id, sport, lg: S.lg || sport, emoji: S.emoji || '🎲',
            game: `${ev.away_team} @ ${ev.home_team}`, home: ev.home_team, away: ev.away_team,
            team: sm.key === 'totals' ? null : so.name, market: sm.key, point: so.point,
            pick, prices, fairP: fair[i], src: 'Pinnacle', start: ev.commence_time });
        });
      }
    }
    return out;
  }

  // ---------------- player props ----------------
  // Fair = Pinnacle's no-vig line when it has the same player/line, else the median no-vig across ≥3 books.
  function propsFromEvent(ev, sport) {
    const S = SPORTS[sport] || {}, out = [];
    const groups = {}; // market|player|point -> {book: {Over, Under, title}}
    for (const b of ev.bookmakers || []) for (const m of b.markets || []) for (const o of m.outcomes || []) {
      if (o.point == null || !o.description || !/^(over|under)$/i.test(o.name) || m.key.endsWith('_alternate')) continue;
      const k = `${m.key}|${o.description}|${o.point}`;
      const g = groups[k] ||= {};
      (g[b.key] ||= { title: b.title })[o.name.toLowerCase()] = toDec(o.price);
    }
    for (const [k, books] of Object.entries(groups)) {
      const [market, player, point] = k.split('|');
      const pairs = Object.entries(books).filter(([, v]) => v.over && v.under);
      let fairOver, src;
      if (books.pinnacle?.over && books.pinnacle?.under) { fairOver = devig([books.pinnacle.over, books.pinnacle.under])[0]; src = 'Pinnacle'; }
      else if (pairs.length >= 3) { fairOver = median(pairs.map(([, v]) => devig([v.over, v.under])[0])); src = `Consensus of ${pairs.length}`; }
      else continue;
      for (const side of ['over', 'under']) {
        const prices = Object.entries(books).filter(([bk, v]) => bk !== 'pinnacle' && v[side]).map(([bk, v]) => ({ key: bk, title: v.title, dec: v[side] }));
        if (!prices.length) continue;
        const fairP = side === 'over' ? fairOver : 1 - fairOver, label = PROP_STATS[market]?.label || market;
        const Side = side === 'over' ? 'Over' : 'Under';
        out.push({ type: 'prop', id: `${ev.id}|${k}|${side}`, eventId: ev.id, sport, lg: S.lg || sport, emoji: S.emoji || '🎲',
          game: `${ev.away_team} @ ${ev.home_team}`, home: ev.home_team, away: ev.away_team, start: ev.commence_time,
          player, market, point: +point, side: Side, statLabel: label, pick: `${player} ${Side} ${point} ${label}`,
          prices, fairP, src, nBooks: pairs.length });
      }
    }
    return out;
  }

  // ---------------- one-sided props (soccer goalscorer / shots): line-shop vs the market ----------------
  // Books post only "Yes"/"Over" here and Pinnacle doesn't post them, so there's no pair to de-vig. Fair = median implied
  // across 4+ books, shaded power-style (p^1.1): books pad longshots harder than favorites, so a flat cut overrates them.
  // Longshots under 12% are skipped (too noisy across books). Needs a 5% edge — really "one book is way off the market".
  const ONE_WAY_HOLD = { player_goal_scorer_anytime: 1.1, player_shots_on_target: 1.1, player_shots: 1.1, player_assists: 1.1 };
  const ONE_WAY_MIN_BOOKS = { player_goal_scorer_anytime: 4 }; // others: 3
  function oneSidedFromEvent(ev, sport) {
    const S = SPORTS[sport] || {}, out = [], groups = {};
    for (const b of ev.bookmakers || []) for (const m of b.markets || []) {
      if (!ONE_WAY_HOLD[m.key]) continue;
      for (const o of m.outcomes || []) {
        if (!o.description) continue;
        if (o.name !== 'Yes' && o.name !== 'Over') continue;
        const point = o.point ?? 0.5, g = groups[`${m.key}|${o.description}|${point}`] ||= {}, d = toDec(o.price);
        if (!g[b.key] || d > g[b.key].dec) g[b.key] = { title: b.title, dec: d };
      }
    }
    for (const [k, books] of Object.entries(groups)) {
      const [market, player, pt] = k.split('|'), point = +pt, list = Object.entries(books);
      if (list.length < (ONE_WAY_MIN_BOOKS[market] || 3)) continue;
      if (sport.startsWith('soccer') === false && market === 'player_assists') continue; // NBA/NHL assists are two-sided props
      const fairP = Math.min(0.97, Math.pow(median(list.map(([, v]) => 1 / v.dec)), ONE_WAY_HOLD[market]));
      if (fairP < 0.12) continue;
      const label = PROP_STATS[market]?.label || market;
      out.push({ type: 'prop', oneSided: true, id: `${ev.id}|1s|${k}`, eventId: ev.id, sport, lg: S.lg || sport, emoji: S.emoji || '🎲',
        game: `${ev.away_team} @ ${ev.home_team}`, home: ev.home_team, away: ev.away_team, start: ev.commence_time,
        player, market, point, side: 'Over', statLabel: label,
        pick: market === 'player_goal_scorer_anytime' ? `${player} anytime goal` : `${player} ${Math.floor(point) + 1}+ ${label}`,
        prices: list.filter(([bk]) => bk !== 'pinnacle').map(([bk, v]) => ({ key: bk, title: v.title, dec: v.dec })),
        fairP, src: `Market median of ${list.length} books (est.)`, nBooks: list.length, minEdge: 0.05 });
    }
    return out;
  }

  // ---------------- alt player props (ladders: 10+ pts, 3+ ast, 7+ reb …) ----------------
  const ALT_PROP = {
    player_points: 'player_points_alternate', player_rebounds: 'player_rebounds_alternate', player_assists: 'player_assists_alternate',
    player_threes: 'player_threes_alternate', player_points_rebounds_assists: 'player_points_rebounds_assists_alternate',
    player_pass_yds: 'player_pass_yds_alternate', player_rush_yds: 'player_rush_yds_alternate',
    player_reception_yds: 'player_reception_yds_alternate', player_receptions: 'player_receptions_alternate',
    player_shots_on_goal: 'player_shots_on_goal_alternate',
  };
  // Big, smooth stats → normal; small counts → negative binomial (streakier than Poisson, r = 8).
  const NORMAL_SD = {
    // spread grows with the mean but slower than it: ~±5 for a 12-pt bench guy, ~±8 for a 31-pt star
    player_points: m => 2.5 + 0.18 * m, player_points_rebounds_assists: m => 3 + 0.17 * m,
    player_pass_yds: m => 25 + 0.2 * m, player_rush_yds: m => 8 + 0.35 * m, player_reception_yds: m => 8 + 0.45 * m,
  };
  const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
  const normTail = (mu, sd, L) => 0.5 * (1 - erf((L - mu) / (sd * Math.SQRT2)));
  function nbTail(mu, L, r = 8) { // P(X > L), X ~ NegBin(mean mu, size r)
    const k = Math.floor(L) + 1, q = mu / (r + mu);
    let pmf = Math.pow(r / (r + mu), r), cdf = 0;
    for (let i = 0; i < k; i++) { cdf += pmf; pmf *= (i + r) / (i + 1) * q; }
    return Math.max(0, 1 - cdf);
  }
  function ladderModel(market, mainPoint, fairOver) {
    const sdf = NORMAL_SD[market];
    const tail = (mu, L) => sdf ? normTail(mu, sdf(mu), L) : nbTail(mu, L);
    let lo = 0.01, hi = Math.max(5, mainPoint * 4);
    for (let n = 0; n < 60; n++) { const mid = (lo + hi) / 2; tail(mid, mainPoint) < fairOver ? lo = mid : hi = mid; }
    const mu = (lo + hi) / 2;
    return L => tail(mu, L);
  }
  function altPropsFromEvent(ev, sport, mainProps) {
    const S = SPORTS[sport] || {}, out = [], main = {}, groups = {};
    for (const p of mainProps) if (p.side === 'Over') main[`${p.market}|${p.player}`] = { point: p.point, fairOver: p.fairP };
    const base = Object.fromEntries(Object.entries(ALT_PROP).map(([b, a]) => [a, b]));
    for (const b of ev.bookmakers || []) for (const m of b.markets || []) {
      const bm = base[m.key]; if (!bm) continue;
      for (const o of m.outcomes || []) {
        if (o.point == null || !o.description || !/^(over|under)$/i.test(o.name)) continue;
        const g = groups[`${bm}|${o.description}|${o.point}`] ||= {}, side = o.name.toLowerCase(), d = toDec(o.price);
        const bk = g[b.key] ||= { title: b.title };
        if (!bk[side] || d > bk[side]) bk[side] = d; // some books list a rung twice — keep the better price
      }
    }
    const models = {};
    for (const [k, books] of Object.entries(groups)) {
      const [market, player, pt] = k.split('|'), point = +pt, mk = main[`${market}|${player}`];
      if (mk && mk.point === point) continue; // that's just the main line
      const pairs = Object.entries(books).filter(([, v]) => v.over && v.under);
      let fairOver, src;
      if (pairs.length >= 3) { fairOver = median(pairs.map(([, v]) => devig([v.over, v.under])[0])); src = `Consensus of ${pairs.length}`; }
      else if (mk) {
        const model = (models[market + player] ||= ladderModel(market, mk.point, mk.fairOver))(point);
        const overs = Object.values(books).filter(v => v.over).map(v => 1 / v.over);
        if (overs.length >= 3) { fairOver = (model + Math.min(0.99, median(overs) / 1.07)) / 2; src = `Model + ${overs.length}-book ladder`; }
        else { fairOver = model; src = 'Model from main line'; }
      } else continue;
      if (fairOver < 0.05 || fairOver > 0.97) continue;
      // model-only rungs (no other book posts that number): stay in the 10–85% zone where small model errors don't blow up EV
      if (src === 'Model from main line' && (fairOver < 0.1 || fairOver > 0.85)) continue;
      const label = PROP_STATS[market]?.label || market;
      for (const side of ['over', 'under']) {
        const prices = Object.entries(books).filter(([, v]) => v[side]).map(([bk, v]) => ({ key: bk, title: v.title, dec: v[side] }));
        if (!prices.length) continue;
        const Side = side === 'over' ? 'Over' : 'Under';
        out.push({ type: 'prop', alt: true, model: !src.startsWith('Consensus'), id: `${ev.id}|alt|${k}|${side}`, eventId: ev.id, sport, lg: S.lg || sport, emoji: S.emoji || '🎲',
          game: `${ev.away_team} @ ${ev.home_team}`, home: ev.home_team, away: ev.away_team, start: ev.commence_time,
          player, market, point, side: Side, statLabel: label,
          pick: side === 'over' ? `${player} ${Math.floor(point) + 1}+ ${label}` : `${player} Under ${point} ${label} (alt)`,
          prices, fairP: side === 'over' ? fairOver : 1 - fairOver, src, nBooks: Object.keys(books).length, minEdge: src === 'Model from main line' ? 0.05 : src.startsWith('Model') ? 0.03 : 0.01 });
      }
    }
    return out;
  }

  // ---------------- alt lines ----------------
  // Alternate spreads/totals priced the same way as props: Pinnacle's no-vig pair at that exact number, else the
  // median no-vig across 3+ books. Items look like normal spread/total legs (alt: true) so grading + live tracking work.
  function altsFromEvent(ev, sport) {
    const S = SPORTS[sport] || {}, out = [], groups = {};
    for (const b of ev.bookmakers || []) for (const m of b.markets || []) {
      if (m.key !== 'alternate_spreads' && m.key !== 'alternate_totals') continue;
      for (const o of m.outcomes || []) {
        if (o.point == null) continue;
        let k, side;
        if (m.key === 'alternate_totals') { if (!/^(over|under)$/i.test(o.name)) continue; k = `totals|${o.point}`; side = o.name.toLowerCase() === 'over' ? 'a' : 'b'; }
        else { const homePt = o.name === ev.home_team ? o.point : -o.point; k = `spreads|${homePt}`; side = o.name === ev.home_team ? 'a' : 'b'; }
        const g = groups[k] ||= {};
        (g[b.key] ||= { title: b.title })[side] = toDec(o.price);
      }
    }
    for (const [k, books] of Object.entries(groups)) {
      const [market, pt] = k.split('|'), point = +pt;
      const pairs = Object.entries(books).filter(([, v]) => v.a && v.b);
      let fairA, src;
      if (books.pinnacle?.a && books.pinnacle?.b) { fairA = devig([books.pinnacle.a, books.pinnacle.b])[0]; src = 'Pinnacle'; }
      else if (pairs.length >= 3) { fairA = median(pairs.map(([, v]) => devig([v.a, v.b])[0])); src = `Consensus of ${pairs.length}`; }
      else continue;
      for (const side of ['a', 'b']) {
        const prices = Object.entries(books).filter(([bk, v]) => bk !== 'pinnacle' && v[side]).map(([bk, v]) => ({ key: bk, title: v.title, dec: v[side] }));
        if (!prices.length) continue;
        const fairP = side === 'a' ? fairA : 1 - fairA;
        let team = null, p = point, pick;
        if (market === 'totals') pick = `${side === 'a' ? 'Over' : 'Under'} ${point}`;
        else { team = side === 'a' ? ev.home_team : ev.away_team; p = side === 'a' ? point : -point; pick = `${team} ${p > 0 ? '+' : ''}${p}`; }
        out.push({ type: 'line', alt: true, id: `${ev.id}|alt|${k}|${side}`, eventId: ev.id, sport, lg: S.lg || sport, emoji: S.emoji || '🎲',
          game: `${ev.away_team} @ ${ev.home_team}`, home: ev.home_team, away: ev.away_team, team, market, point: p,
          pick: `${pick} (alt)`, prices, fairP, src, start: ev.commence_time });
      }
    }
    return out;
  }

  function applyBooks(items, allowAll) {
    for (const l of items) {
      if (!l.prices) continue;
      const best = l.prices.filter(p => allowAll || US_BOOKS.test(p.key)).sort((a, b) => b.dec - a.dec)[0];
      l.dec = best?.dec ?? null; l.book = best?.title ?? ''; l.ev = best ? l.fairP * best.dec - 1 : -1;
    }
    return items;
  }

  // ---------------- ESPN ----------------
  const etDate = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso)).replaceAll('-', '');
  function teamMatches(t, name) {
    const n = norm(name), d = norm(t.displayName);
    if (n === d) return 3;
    const nick = norm(t.name), loc = norm(t.location);
    if (nick && loc && n.includes(nick) && n.includes(loc.split(' ')[0])) return 2;
    if (nick && n.endsWith(nick)) return 1;
    return 0;
  }

  function makeEspn(getJSON) {
    const bdCache = {}, rosterCache = {}, logCache = {};
    function breakdown(leg) {
      return bdCache[leg.eventId] ||= (async () => {
        const S = SPORTS[leg.sport];
        if (!S?.espn || !leg.start) return null;
        const base = `https://site.api.espn.com/apis/site/v2/sports/${S.espn}`;
        const sb = await getJSON(`${base}/scoreboard?dates=${etDate(leg.start)}${S.q || ''}`);
        let best = null, bestScore = 0;
        for (const e of sb?.events || []) {
          const cs = e.competitions[0].competitors;
          const h = cs.find(c => c.homeAway === 'home'), a = cs.find(c => c.homeAway === 'away');
          if (!h || !a) continue;
          const sc = Math.min(teamMatches(h.team, leg.home), teamMatches(a.team, leg.away));
          if (sc > bestScore) { bestScore = sc; best = { e, h, a }; }
        }
        if (!best) return null;
        const sum = await getJSON(`${base}/summary?event=${best.e.id}`) || {};
        const side = c => {
          const id = c.team.id, stats = {};
          for (const t of sum.boxscore?.teams || []) if (t.team.id === id)
            for (const s of t.statistics || []) stats[s.label || s.name] = s.displayValue;
          const injuries = ((sum.injuries || []).find(t => t.team?.id === id)?.injuries || []).map(p => ({
            id: p.athlete?.id, name: p.athlete?.displayName, pos: p.athlete?.position?.abbreviation || '',
            status: p.status || '', type: p.details?.type || '' }));
          const leaders = [];
          for (const c2 of (sum.leaders || []).find(t => t.team?.id === id)?.leaders || []) {
            const x = c2.leaders?.[0]; if (!x) continue;
            leaders.push({ cat: c2.name, label: c2.displayName, id: x.athlete?.id, name: x.athlete?.displayName,
              pos: x.athlete?.position?.abbreviation || '', val: x.displayValue });
          }
          const l5 = ((sum.lastFiveGames || []).find(t => t.team?.id === id)?.events || []).map(g => ({
            r: g.gameResult, opp: g.opponent?.abbreviation, sc: g.score, at: g.atVs }));
          return { id, abbr: c.team.abbreviation, name: c.team.displayName, logo: c.team.logo,
            rec: c.records?.find(r => r.type === 'total' || r.name === 'overall')?.summary || '', stats, injuries, leaders, l5 };
        };
        const home = side(best.h), away = side(best.a), pr = sum.predictor;
        const model = pr?.homeTeam?.gameProjection
          ? { [home.name]: +pr.homeTeam.gameProjection / 100, [away.name]: +pr.awayTeam.gameProjection / 100 } : null;
        const ven = best.e.competitions[0].venue || {}, w = sum.gameInfo?.weather;
        const venue = { name: ven.fullName || sum.gameInfo?.venue?.fullName || '', city: ven.address?.city || '', state: ven.address?.state || '',
          country: ven.address?.country || '', indoor: ven.indoor === true };
        const weather = w ? { temp: w.temperature ?? w.highTemperature, gust: w.gust, precipChance: w.precipitation } : null;
        return { home, away, model, kind: S.kind, espnId: best.e.id, venue, weather, start: best.e.date };
      })().catch(() => null);
    }
    function roster(sport, teamId) {
      return rosterCache[sport + teamId] ||= (async () => {
        const r = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/${SPORTS[sport].espn}/teams/${teamId}/roster`);
        const list = (r?.athletes || []).flatMap(a => a.items || [a]);
        const map = {};
        for (const a of list) map[normName(a.displayName || a.fullName)] = { id: a.id, name: a.displayName, pos: a.position?.abbreviation || '', headshot: a.headshot?.href || '' };
        return map;
      })().catch(() => ({}));
    }
    function gamelog(sport, id) {
      return logCache[sport + id] ||= (async () => {
        const g = await getJSON(`https://site.web.api.espn.com/apis/common/v3/sports/${SPORTS[sport].espn}/athletes/${id}/gamelog`);
        if (!g?.seasonTypes) return [];
        const names = g.names || [], labels = g.labels || [], rows = [];
        for (const st of g.seasonTypes) {
          if (/preseason/i.test(st.displayName || '')) continue;
          for (const c of st.categories || []) for (const e of c.events || []) {
            if (!e.stats) continue;
            const row = {};
            e.stats.forEach((v, i) => { if (names[i]) row[names[i]] = v; if (labels[i]) row[labels[i]] = v; });
            const meta = g.events?.[e.eventId] || {};
            rows.push({ date: meta.gameDate || '', opp: meta.opponent?.abbreviation || '', at: meta.atVs || '', row });
          }
          if (rows.length) break; // only the most recent season type with games
        }
        return rows.sort((a, b) => b.date.localeCompare(a.date));
      })().catch(() => []);
    }
    return { breakdown, roster, gamelog };
  }

  function statVal(row, market) {
    const def = PROP_STATS[market]; if (!def) return null;
    if (def.sum) { let t = 0; for (const m of def.sum) { const v = statVal(row, m); if (v == null) return null; t += v; } return t; }
    for (const k of def.keys) {
      const raw = row[k]; if (raw == null || raw === '-') continue;
      const s = String(raw);
      if (s.includes('-') && !s.startsWith('-')) { if (def.made) return parseFloat(s.split('-')[0]); continue; }
      const v = parseFloat(s); if (!isNaN(v)) return v;
    }
    return null;
  }

  // ---------------- the "why" engine ----------------
  const MISSING = s => /^(out|doubtful|injured reserve|suspension)/i.test(s);
  const FRESH = s => /^(out|doubtful)/i.test(s);
  const POS = {
    db: new Set(['CB', 'S', 'FS', 'SS', 'DB', 'NB']),
    front: new Set(['DE', 'DT', 'NT', 'LB', 'OLB', 'ILB', 'MLB', 'EDGE', 'DL']),
    ol: new Set(['OT', 'OG', 'C', 'G', 'T', 'OL', 'LT', 'RT', 'LG', 'RG']),
  };
  const missingOf = t => t.injuries.filter(p => MISSING(p.status));
  const isOut = (t, id) => !!id && t.injuries.some(p => p.id === id && MISSING(p.status));
  const names = ps => ps.slice(0, 3).map(p => `${p.name} (${p.pos}${FRESH(p.status) ? '' : ', IR'})`).join(', ') + (ps.length > 3 ? ` +${ps.length - 3} more` : '');
  // leaders who are out, merged per player ("Points/Assists leader")
  const outLeaders = t => {
    const m = new Map();
    for (const l of t.leaders) if (isOut(t, l.id)) {
      if (m.has(l.id)) m.get(l.id).label += '/' + l.label; else m.set(l.id, { ...l });
    }
    return [...m.values()];
  };
  const leader = (t, re) => t.leaders.find(l => re.test(l.cat) && !isOut(t, l.id));
  const statNum = (t, re) => { for (const k in t.stats) if (re.test(k)) { const v = parseFloat(t.stats[k]); if (!isNaN(v)) return v; } return null; };

  function attackNotes(A, D, kind) {
    const out = [], miss = missingOf(D);
    if (kind === 'fb') {
      const db = miss.filter(p => POS.db.has(p.pos)), fr = miss.filter(p => POS.front.has(p.pos)), ol = miss.filter(p => POS.ol.has(p.pos));
      if (db.length) { const r = leader(A, /receiv/i); out.push(`🔥 ${r ? `<b>${esc(r.name)}</b> (${esc(r.val)})` : esc(A.abbr) + "'s passing game"} should cook a ${esc(D.abbr)} secondary missing ${esc(names(db))}`); }
      if (fr.length) { const r = leader(A, /rush/i); out.push(`🔥 ${r ? `<b>${esc(r.name)}</b> (${esc(r.val)})` : esc(A.abbr) + "'s run game"} runs at a ${esc(D.abbr)} front missing ${esc(names(fr))}`); }
      if (ol.length) { const r = leader(A, /sack/i); out.push(`💥 ${r ? `<b>${esc(r.name)}</b> (${esc(r.val)} sacks)` : esc(A.abbr) + "'s pass rush"} gets a ${esc(D.abbr)} O-line missing ${esc(names(ol))}`); }
      for (const l of outLeaders(D)) out.push(`🚨 ${esc(D.abbr)} is without its ${esc(l.label.toLowerCase())} leader <b>${esc(l.name)}</b> (${esc(l.pos)}, ${esc(l.val)})`);
      const qb = miss.find(p => p.pos === 'QB' && FRESH(p.status));
      if (qb && !D.leaders.some(l => l.id === qb.id)) out.push(`⚠️ ${esc(D.abbr)} QB ${esc(qb.name)} is ${esc(qb.status.toLowerCase())}`);
    } else if (kind === 'bb') {
      const outD = outLeaders(D);
      for (const l of outD) { const mine = leader(A, /point/i); out.push(`📉 ${esc(D.abbr)} without <b>${esc(l.name)}</b> (${esc(l.label)} leader, ${esc(l.val)}) — easier night for ${mine ? `<b>${esc(mine.name)}</b>` : esc(A.abbr)}`); }
      const bigs = miss.filter(p => /C/.test(p.pos) && !outD.some(l => l.id === p.id));
      if (bigs.length) { const r = leader(A, /rebound/i); if (r) out.push(`🔥 <b>${esc(r.name)}</b> (${esc(r.val)} reb) should feast on the glass — ${esc(D.abbr)} missing ${esc(names(bigs))}`); }
      const guards = miss.filter(p => /G/.test(p.pos) && !outD.some(l => l.id === p.id));
      if (guards.length) { const r = leader(A, /assist|point/i); if (r) out.push(`🔥 <b>${esc(r.name)}</b> gets a thinner ${esc(D.abbr)} backcourt — missing ${esc(names(guards))}`); }
    } else if (kind === 'hk') {
      const g = miss.find(p => p.pos === 'G' && FRESH(p.status)); // IR goalies are usually backups already priced in
      if (g) out.push(`🥅 ${esc(D.abbr)} goalie <b>${esc(g.name)}</b> is ${esc(g.status.toLowerCase())} — ${esc(A.abbr)} may face a backup`);
      for (const l of outLeaders(D)) out.push(`🚨 ${esc(D.abbr)} without ${esc(l.label.toLowerCase())} leader <b>${esc(l.name)}</b> (${esc(l.val)})`);
    }
    return out;
  }

  function usageNotes(T, kind) {
    const out = [];
    for (const l of outLeaders(T)) {
      const next = T.leaders.find(x => x.id !== l.id && !isOut(T, x.id));
      if (next && kind !== 'fb') out.push(`📈 With <b>${esc(l.name)}</b> out, <b>${esc(next.name)}</b> (${esc(next.label)} ${esc(next.val)}) should get more of the load for ${esc(T.abbr)}`);
      if (kind === 'fb' && /pass/i.test(l.cat)) out.push(`📈 ${esc(T.abbr)} likely leans on the run game without <b>${esc(l.name)}</b>`);
    }
    return out;
  }

  function projection(bd) {
    const off = /points per game|goals for per game/i, def = /points against|points allowed|goals against average/i;
    const hO = statNum(bd.home, off), hD = statNum(bd.home, def), aO = statNum(bd.away, off), aD = statNum(bd.away, def);
    if ([hO, hD, aO, aD].some(v => v == null)) return null;
    const home = (hO + aD) / 2, away = (aO + hD) / 2;
    return { home, away, total: home + away };
  }

  function scoreOf(items) { return items.reduce((a, i) => a + (i.tone === 'g' ? 1 : i.tone === 'b' ? -1 : 0), 0); }

  function analyzeLine(leg, bd, fairML) {
    const items = [], add = (tone, text) => items.push({ tone, text });
    const P = leg.team ? (norm(leg.team) === norm(leg.home) ? bd.home : bd.away) : null;
    const O = P ? (P === bd.home ? bd.away : bd.home) : null;
    if (P && bd.model) {
      const m = bd.model[P.name], f = fairML[leg.eventId]?.[leg.team];
      if (m != null && f != null) {
        const d = m - f;
        if (d >= 0.03) add('g', `🤖 ESPN's model gives ${esc(P.abbr)} <b>${pct(m)}</b> to win vs market ${pct(f)} — model likes them even more`);
        else if (d <= -0.05) add('b', `🤖 ESPN's model only gives ${esc(P.abbr)} <b>${pct(m)}</b> vs market ${pct(f)} — model disagrees`);
        else add('n', `🤖 ESPN's model (${pct(m)}) roughly agrees with the market (${pct(f)})`);
      }
    }
    if (P) {
      attackNotes(P, O, bd.kind).forEach(t => add('g', t));
      attackNotes(O, P, bd.kind).forEach(t => add('b', t));
      [...usageNotes(P, bd.kind), ...usageNotes(O, bd.kind)].forEach(t => add('n', t));
    } else {
      const over = /^over/i.test(leg.pick);
      [...attackNotes(bd.home, bd.away, bd.kind), ...attackNotes(bd.away, bd.home, bd.kind)]
        .forEach(t => add(/🚨|⚠️/.test(t) ? (over ? 'b' : 'g') : (over ? 'g' : 'b'), t));
    }
    const pj = projection(bd);
    if (pj) {
      if (leg.market === 'totals') {
        const diff = pj.total - leg.point, over = /^over/i.test(leg.pick);
        add(Math.abs(diff) < 1 ? 'n' : (diff > 0) === over ? 'g' : 'b', `📊 Season scoring averages project <b>${pj.total.toFixed(1)}</b> total vs line ${leg.point}`);
      } else if (P) {
        const mine = P === bd.home ? pj.home : pj.away, theirs = P === bd.home ? pj.away : pj.home;
        const margin = mine - theirs, need = leg.market === 'spreads' ? -leg.point : 0;
        add(Math.abs(margin - need) < 1.5 ? 'n' : margin > need ? 'g' : 'b',
          `📊 Season averages project ${esc(P.abbr)} ${mine.toFixed(1)} – ${theirs.toFixed(1)} ${esc(O.abbr)}`);
      }
    }
    if (P && P.l5.length && O.l5.length) {
      const w = t => t.l5.filter(g => g.r === 'W').length, d = w(P) - w(O);
      add(d >= 2 ? 'g' : d <= -2 ? 'b' : 'n', `📈 Form: ${esc(P.abbr)} ${w(P)}-${P.l5.length - w(P)} last ${P.l5.length}, ${esc(O.abbr)} ${w(O)}-${O.l5.length - w(O)}`);
    }
    if (!items.length) add('n', 'Not much matchup data for this one — the edge is pure price.');
    return { score: scoreOf(items), items };
  }

  function analyzeProp(p, games, bd, teamSide) {
    const items = [], add = (tone, text) => items.push({ tone, text });
    const over = p.side === 'Over', flip = t => over ? t : (t === 'g' ? 'b' : t === 'b' ? 'g' : t);
    const vals = games.map(g => statVal(g.row, p.market)).filter(v => v != null);
    const last = vals.slice(0, 10);
    let hit = null;
    if (last.length >= 3) {
      const hits = last.filter(v => over ? v > p.point : v < p.point).length, rate = hits / last.length;
      const avg = last.reduce((a, b) => a + b, 0) / last.length;
      const h5 = last.slice(0, 5).filter(v => over ? v > p.point : v < p.point).length;
      hit = { l10: rate, n: last.length, hits, h5, n5: Math.min(5, last.length), avg, vals: last };
      add(rate >= 0.6 ? 'g' : rate <= 0.4 ? 'b' : 'n', `🎯 ${over ? 'Over' : 'Under'} hit <b>${hits}/${last.length}</b> recent games (${h5}/${Math.min(5, last.length)} last 5) — avg <b>${avg.toFixed(1)}</b> vs line ${p.point}`);
    } else add('n', '🎯 Not enough game logs yet for a hit rate.');
    if (bd && teamSide) {
      const T = bd[teamSide], O = bd[teamSide === 'home' ? 'away' : 'home'], kind = bd.kind, me = normName(p.player);
      const self = T.injuries.find(i => normName(i.name) === me);
      if (self) add('b', `⚠️ ${esc(p.player)} is listed <b>${esc(self.status)}</b> (${esc(self.type)}) — confirm he plays`);
      for (const l of outLeaders(T)) if (normName(l.name) !== me) {
        if (kind !== 'fb') add(flip('g'), `📈 <b>${esc(l.name)}</b> (${esc(l.label)} leader) is OUT — more usage for ${esc(p.player)}`);
        else if (/receiv/i.test(l.cat) && /reception/.test(p.market)) add(flip('g'), `📈 ${esc(T.abbr)}'s top receiver <b>${esc(l.name)}</b> is OUT — more targets to go around`);
        else if (/pass/i.test(l.cat) && /reception|pass/.test(p.market)) add(flip('b'), `🚨 ${esc(T.abbr)} QB <b>${esc(l.name)}</b> is OUT — passing game takes a hit`);
        else if (/pass/i.test(l.cat) && /rush/.test(p.market)) add(flip('g'), `📈 QB <b>${esc(l.name)}</b> OUT — ${esc(T.abbr)} likely runs more`);
      }
      const miss = missingOf(O);
      if (kind === 'fb') {
        const db = miss.filter(x => POS.db.has(x.pos)), fr = miss.filter(x => POS.front.has(x.pos));
        if (db.length && /reception|pass/.test(p.market)) add(flip('g'), `🔥 ${esc(O.abbr)} secondary missing ${esc(names(db))}`);
        if (fr.length && /rush/.test(p.market)) add(flip('g'), `🔥 ${esc(O.abbr)} front missing ${esc(names(fr))}`);
      } else if (kind === 'bb') {
        const bigs = miss.filter(x => /C/.test(x.pos)), guards = miss.filter(x => /G/.test(x.pos));
        if (bigs.length && /rebound|points_rebounds/.test(p.market)) add(flip('g'), `🔥 ${esc(O.abbr)} missing bigs ${esc(names(bigs))} — more boards available`);
        if (guards.length && /points|assists|threes/.test(p.market)) add(flip('g'), `🔥 ${esc(O.abbr)} backcourt thinned: ${esc(names(guards))}`);
      } else if (kind === 'hk') {
        const g = miss.find(x => x.pos === 'G');
        if (g && /points|goals|assists/.test(p.market)) add(flip('g'), `🥅 ${esc(O.abbr)} goalie ${esc(g.name)} ${esc(g.status.toLowerCase())}`);
      }
    }
    return { score: scoreOf(items), items, hit };
  }

  // ---------------- parlays ----------------
  function parlayStats(ls, kfrac = 0.25) {
    const dec = ls.reduce((a, l) => a * l.dec, 1), p = ls.reduce((a, l) => a * l.fairP, 1);
    const ev = p * dec - 1, b = dec - 1, kelly = Math.max(0, (b * p - (1 - p)) / b), f = kelly * kfrac;
    const growth = f > 0 ? p * Math.log(1 + f * b) + (1 - p) * Math.log(1 - f) : 0;
    const vibe = ls.reduce((a, l) => a + (l.vibe?.score || 0), 0);
    return { dec, p, ev, kelly, f, growth, vibe, implied: 1 / dec };
  }
  function buildParlays(pool, k, rank = 'growth', kfrac = 0.25, minP = 0) {
    pool = pool.slice(0, 18);
    const out = [];
    (function rec(start, cur) {
      if (out.length > 30000) return;
      if (cur.length === k) { const s = parlayStats(cur, kfrac); if (s.p >= minP) out.push({ legs: cur.slice(), s }); return; }
      for (let i = start; i < pool.length; i++) {
        if (cur.some(c => c.eventId === pool[i].eventId)) continue;
        cur.push(pool[i]); rec(i + 1, cur); cur.pop();
      }
    })(0, []);
    const key = { growth: s => s.growth, ev: s => s.ev, hit: s => s.p, vibe: s => s.vibe * 0.02 + s.ev }[rank];
    return out.sort((a, b) => key(b.s) - key(a.s));
  }
  const parlayPool = items => items.filter(l => l.dec && l.ev >= 0.01 && l.ev < (l.type === 'prop' ? PROP_STALE : STALE) && !(l.vibe?.score <= -2))
    .sort((a, b) => (b.ev + (b.vibe?.score || 0) * 0.01) - (a.ev + (a.vibe?.score || 0) * 0.01));

  // ---------------- daily pipeline ----------------
  async function buildCard(opts) {
    const { get, key, budget = 'auto', log = () => {}, propWindowH = 30, lineWindowH = 30, allowAll = false, maxProps = 80, maxLines = 60 } = opts;
    const odds = q => get(`https://api.the-odds-api.com/v4${q}${q.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(key)}`);
    let left = null, used = 0;
    const track = h => { const l = parseInt(h('x-requests-remaining')); if (!isNaN(l)) left = l; used += parseInt(h('x-requests-last')) || 0; };

    const sp = await odds('/sports'); track(sp.headers);
    const active = new Map(sp.json.filter(s => s.active && !s.has_outrights).map(s => [s.key, s]));
    const sports = Object.keys(SPORTS).filter(k => active.has(k) && !SPORTS[k].espnOnly);
    // tennis tournaments come and go — add whatever is live
    for (const s of active.values()) if (s.group === 'Tennis' && !sports.includes(s.key) && sports.filter(k => k.startsWith('tennis')).length < 2) {
      SPORTS[s.key] = { lg: /wta/i.test(s.key) ? 'WTA' : 'ATP', emoji: '🎾', kind: 'other', lines: 'h2h', pri: 3, title: s.title };
      sports.push(s.key);
    }
    sports.sort((a, b) => SPORTS[a].pri - SPORTS[b].pri);

    // Budget: spread what's left over the rest of the month, keep a reserve for manual Live refreshes,
    // and lean into the big slates (Sat college football, Sun NFL) while going light early in the week.
    const now = new Date(), daysLeft = Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - now) / 864e5));
    const DAY_WEIGHT = [1.4, 0.8, 0.7, 0.8, 1.0, 0.9, 1.4]; // Sun..Sat, averages 1.0
    const dow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
    const reserve = Math.min(40, Math.floor((left ?? 0) * 0.08));
    const perDay = Math.max(0, ((left ?? 0) - reserve) / daysLeft);
    let B = budget === 'auto' ? Math.floor(perDay * DAY_WEIGHT[dow]) : +budget;
    if (left != null) B = Math.max(0, Math.min(B, left - (budget === 'auto' ? reserve : 0)));
    log(`credits left ${left}, ${daysLeft} days left, reserve ${reserve} → ~${perDay.toFixed(1)}/day pace, today x${DAY_WEIGHT[dow]} → budget ${B}`);

    const fairML = {}, events = {}, card = { generatedAt: now.toISOString(), budget: B, sports: [], games: {}, fairML };
    card.creditPlan = { left, daysLeft, reserve, perDay: +perDay.toFixed(1), today: B };

    // Free schedule check (the /events endpoint costs 0 credits): only buy odds for sports with games soon.
    const soonCount = {}, schedule = {};
    for (const s of sports) {
      try {
        const r = await odds(`/sports/${s}/events`); track(r.headers);
        schedule[s] = r.json.filter(e => { const t = new Date(e.commence_time) - now; return t > 0 && t < lineWindowH * 36e5; })
          .sort((a, b) => a.commence_time.localeCompare(b.commence_time));
        soonCount[s] = schedule[s].length;
      } catch (e) { soonCount[s] = 0; schedule[s] = []; }
    }
    const withGames = sports.filter(s => soonCount[s] > 0);
    log(`games in next ${lineWindowH}h: ${withGames.map(s => SPORTS[s].lg + ' ' + soonCount[s]).join(', ') || 'none'} (skipping ${sports.length - withGames.length} sports with nothing soon)`);

    let lines = [];
    // props are where the edge lives, so lines get ~35% (at least one sport's worth)
    const linesBudget = Math.max(Math.min(B, 3), Math.floor(B * 0.35));
    for (const s of withGames) {
      const cost = SPORTS[s].lines.split(',').length;
      if (used + cost > linesBudget) continue;
      try {
        const r = await odds(`/sports/${s}/odds/?bookmakers=${BOOKS}&markets=${SPORTS[s].lines}&oddsFormat=american`); track(r.headers);
        const evs = r.json.filter(e => { const t = new Date(e.commence_time) - now; return t > 0 && t < lineWindowH * 36e5; });
        evs.forEach(e => events[e.id] = { ...e, sport: s });
        lines.push(...legsFromEvents(evs, s, fairML));
        card.sports.push({ key: s, lg: SPORTS[s].lg, emoji: SPORTS[s].emoji, games: evs.length });
        log(`${SPORTS[s].lg}: ${evs.length} games`);
      } catch (e) { log(`${s} lines failed: ${e.message}`); }
    }

    // props for games starting soon, soonest first, until the budget runs out
    let props = [];
    const propGames = [];
    // Round-robin across sports (one game per sport per pass, soonest first) so the budget covers NFL, NHL and
    // college props too instead of NBA eating it all. Uses the free schedule, so it doesn't depend on which lines we bought.
    // Core 3 markets per game (most popular first); 2 minimum.
    const queues = {};
    for (const s of withGames) if (SPORTS[s].props) queues[s] = schedule[s].filter(e => new Date(e.commence_time) - now < propWindowH * 36e5).map(e => ({ ...e, sport: s }));
    const rr = Object.keys(queues);
    for (let fetched = true; fetched;) {
      fetched = false;
      for (const s of rr) {
        const e = queues[s].shift(); if (!e) continue;
        const mk = SPORTS[s].props.slice(0, Math.min(3, Math.max(0, B - used)));
        if (mk.length < 2) continue;
        try {
          const r = await odds(`/sports/${s}/events/${e.id}/odds?bookmakers=${BOOKS}&markets=${mk.join(',')}&oddsFormat=american`); track(r.headers);
          const got = [...propsFromEvent(r.json, s), ...(SPORTS[s].oneSided ? oneSidedFromEvent(r.json, s) : [])];
          props.push(...got); if (got.length) propGames.push(e);
          fetched = true;
        } catch (err) { log(`props ${e.id} failed: ${err.message}`); }
      }
    }
    log(`props by sport: ${rr.map(s => SPORTS[s].lg + ' ' + new Set(props.filter(p => p.sport === s).map(p => p.eventId)).size).join(', ')}`);
    // alt player props (ladders) for games we have main lines for — the main line calibrates the model
    let ladderGames = 0;
    for (const e of propGames) {
      if (ladderGames >= 3) break;
      const mk = SPORTS[e.sport].props.map(m => ALT_PROP[m]).filter(Boolean).slice(0, Math.max(0, B - used));
      if (!mk.length) break;
      try {
        const r = await odds(`/sports/${e.sport}/events/${e.id}/odds?bookmakers=${BOOKS}&markets=${mk.join(',')}&oddsFormat=american`); track(r.headers);
        props.push(...altPropsFromEvent(r.json, e.sport, props.filter(p => p.eventId === e.id && !p.alt))); ladderGames++;
      } catch (err) { log(`ladders ${e.id} failed: ${err.message}`); }
    }
    if (ladderGames) log(`alt player props (ladders) for ${ladderGames} games`);
    log(`props pulled for ${new Set(props.map(p => p.eventId)).size} games, ${props.length} prop sides`);
    // alt spreads/totals for the soonest big-league games if there's room (2 credits per game)
    let altGames = 0;
    const altCands = Object.values(events).filter(e => ['fb', 'bb', 'hk'].includes(SPORTS[e.sport].kind) && new Date(e.commence_time) - now < propWindowH * 36e5)
      .sort((a, b) => SPORTS[a.sport].pri - SPORTS[b.sport].pri || a.commence_time.localeCompare(b.commence_time));
    for (const e of altCands) {
      if (altGames >= 4 || used + 2 > B) break;
      try {
        const r = await odds(`/sports/${e.sport}/events/${e.id}/odds?bookmakers=${BOOKS}&markets=alternate_spreads,alternate_totals&oddsFormat=american`); track(r.headers);
        lines.push(...altsFromEvent(r.json, e.sport)); altGames++;
      } catch (err) { log(`alts ${e.id} failed: ${err.message}`); }
    }
    if (altGames) log(`alt lines pulled for ${altGames} games`);
    // leftover budget (no props today, e.g.) goes to lines for the next-busiest sports we skipped
    for (const s of withGames) {
      if (card.sports.some(x => x.key === s)) continue;
      const cost = SPORTS[s].lines.split(',').length;
      if (used + cost > B) continue;
      try {
        const r = await odds(`/sports/${s}/odds/?bookmakers=${BOOKS}&markets=${SPORTS[s].lines}&oddsFormat=american`); track(r.headers);
        const evs = r.json.filter(e => { const t = new Date(e.commence_time) - now; return t > 0 && t < lineWindowH * 36e5; });
        evs.forEach(e => events[e.id] = { ...e, sport: s });
        lines.push(...legsFromEvents(evs, s, fairML));
        card.sports.push({ key: s, lg: SPORTS[s].lg, emoji: SPORTS[s].emoji, games: evs.length });
        log(`${SPORTS[s].lg}: ${evs.length} games (leftover budget)`);
      } catch (e) { log(`${s} lines failed: ${e.message}`); }
    }

    applyBooks(lines, allowAll); applyBooks(props, allowAll);
    // Full fair-odds board (every line + prop, +EV or not) for people pricing a book we can't pull, e.g. bet365.
    const keep = ['id', 'type', 'eventId', 'sport', 'lg', 'emoji', 'game', 'home', 'away', 'team', 'market', 'point', 'pick',
      'player', 'side', 'statLabel', 'fairP', 'src', 'start', 'alt', 'oneSided', 'dec', 'book', 'ev'];
    card.board = [...lines, ...props].map(x => Object.fromEntries(keep.filter(k => x[k] != null).map(k => [k, x[k]])));
    lines = lines.filter(l => l.dec && l.ev >= 0.005).sort((a, b) => b.ev - a.ev).slice(0, maxLines);
    props = props.filter(p => p.dec && p.ev >= (p.minEdge ?? 0.01)).sort((a, b) => b.ev - a.ev).slice(0, maxProps);

    card.lines = lines; card.props = props;
    card.credits = { left, used };
    await analyzeCard(card, get, log, { apiFootballKey: opts.apiFootballKey });
    log(`done: ${lines.length} +EV lines, ${props.length} +EV props, ${used} credits used, ${left} left`);
    return card;
  }

  // Free game lines from ESPN's scoreboard (DraftKings' ML / spread / total) for every game we didn't buy lines for.
  // Fair = DraftKings' own no-vig price, labeled as an estimate — it fills the board and bet365 targets, not EV hunting.
  async function espnBoardLines(card, getJSON, now, windowH = 30) {
    // same game if both nicknames match and it starts within 4h ("Los Angeles Clippers" vs ESPN's "LA Clippers")
    const pairs = (card.board || []).filter(x => x.type === 'line' && !x.espnLine).map(x => [x.home, x.away, new Date(x.start)]);
    const covered = (h, a, t) => pairs.some(([ph, pa, pt]) => teamMatches(h, ph) >= 1 && teamMatches(a, pa) >= 1 && Math.abs(pt - t) < 4 * 36e5);
    // ESPN's date-range query comes back empty, so ask for each ET day in the window
    const days = [...new Set([0, 12, 24, windowH].map(h => etDate(new Date(+now + h * 36e5).toISOString())))];
    const px = v => { if (v == null) return null; const t = String(v).trim().toUpperCase(); if (t === 'EVEN' || t === 'EV') return 100; const n = parseInt(t.replace('+', ''), 10); return isNaN(n) || Math.abs(n) < 100 ? null : n; };
    const pt = v => v == null ? null : parseFloat(String(v).replace(/^[ou]/i, ''));
    const cur = side => side?.close || side?.current || side?.open || null;
    const out = [];
    for (const [sport, S] of Object.entries(SPORTS)) {
      if (!S.espn || !S.lines) continue;
      const sbs = await Promise.all(days.map(d => getJSON(`https://site.api.espn.com/apis/site/v2/sports/${S.espn}/scoreboard?dates=${d}${S.q || '&limit=300'}`)));
      const seen = new Set();
      for (const e of sbs.flatMap(sb => sb?.events || [])) {
        if (seen.has(e.id)) continue; seen.add(e.id);
        const comp = e.competitions?.[0], t = new Date(e.date) - now;
        if (!comp || comp.status?.type?.state !== 'pre' || t <= 0 || t > windowH * 36e5) continue;
        const h = comp.competitors.find(c => c.homeAway === 'home'), a = comp.competitors.find(c => c.homeAway === 'away'), o = comp.odds?.[0];
        if (!h || !a || !o || covered(h.team, a.team, new Date(e.date))) continue;
        const home = h.team.displayName, away = a.team.displayName, eventId = 'espn' + e.id;
        const base = { type: 'line', espnLine: true, eventId, sport, lg: S.lg, emoji: S.emoji, game: `${away} @ ${home}`, home, away,
          start: new Date(e.date).toISOString(), book: 'DraftKings', src: 'DraftKings no-vig (est.)' };
        const add = (market, sides) => {
          const ok = sides.filter(x => x.am != null);
          if (ok.length < 2 || ok.length !== sides.length) return;
          const fair = devig(ok.map(x => toDec(x.am)));
          ok.forEach((x, i) => { const dec = toDec(x.am); out.push({ ...base, id: `${eventId}${market}${x.key}`, market, team: x.team, point: x.point, pick: x.pick, dec, fairP: fair[i], ev: fair[i] * dec - 1 }); });
        };
        const ml = o.moneyline || {}, ps = o.pointSpread || {}, tot = o.total || {};
        add('h2h', [{ key: 'a', team: away, am: px(cur(ml.away)?.odds), pick: `${away} ML` }, { key: 'h', team: home, am: px(cur(ml.home)?.odds), pick: `${home} ML` },
          ...(ml.draw ? [{ key: 'd', team: 'Draw', am: px(cur(ml.draw)?.odds), pick: 'Draw ML' }] : [])]);
        const sa = pt(cur(ps.away)?.line), sh = pt(cur(ps.home)?.line);
        if (sa != null && sh != null) add('spreads', [{ key: 'a', team: away, point: sa, am: px(cur(ps.away)?.odds), pick: `${away} ${sa > 0 ? '+' : ''}${sa}` },
          { key: 'h', team: home, point: sh, am: px(cur(ps.home)?.odds), pick: `${home} ${sh > 0 ? '+' : ''}${sh}` }]);
        const tl = pt(cur(tot.over)?.line);
        if (tl != null) add('totals', [{ key: 'o', point: tl, am: px(cur(tot.over)?.odds), pick: `Over ${tl}` }, { key: 'u', point: tl, am: px(cur(tot.under)?.odds), pick: `Under ${tl}` }]);
      }
    }
    return out;
  }

  // ESPN matchup + player analysis and prebuilt parlays. Free (no odds credits), so it can be re-run on a saved card.
  async function analyzeCard(card, get, log = () => {}, opts = {}) {
    const af = makeApiFootball(opts.apiFootballKey, get);
    // drop anything that has already started (matters when re-running on a saved card)
    const nowD = new Date(), future = x => !x.start || new Date(x.start) > nowD;
    card.lines = card.lines.filter(future); card.props = card.props.filter(future);
    card.board = (card.board || []).filter(x => future(x) && !x.espnLine);
    const { lines, props, fairML } = card;
    card.games = {};
    const cache = {};
    const getJSON = url => cache[url] ||= get(url).then(r => r.json).catch(() => null);
    const espnLines = await espnBoardLines(card, getJSON, nowD).catch(() => []);
    card.board.push(...espnLines);
    log(`free ESPN/DraftKings lines added for ${new Set(espnLines.map(x => x.eventId)).size} more games`);
    const espn = makeEspn(getJSON);
    await mapLimit(lines, 6, async l => {
      const bd = await espn.breakdown(l);
      if (bd) card.games[l.eventId] = bd;
      l.vibe = bd ? analyzeLine(l, bd, fairML) : { score: 0, items: [{ tone: 'n', text: 'No ESPN matchup data for this game — the edge is pure price.' }] };
      const ex = await extraNotes(l, bd, { getJSON, get, fairML, af }).catch(() => []);
      if (ex.length) { l.vibe.items.push(...ex); l.vibe.score = scoreOf(l.vibe.items); }
    });
    await mapLimit(props, 6, async p => {
      const bd = await espn.breakdown(p);
      let side = null, ath = null;
      if (bd) {
        card.games[p.eventId] = bd;
        for (const s of ['home', 'away']) {
          const ro = await espn.roster(p.sport, bd[s].id);
          if (ro[normName(p.player)]) { side = s; ath = ro[normName(p.player)]; break; }
        }
      }
      const logs = ath ? await espn.gamelog(p.sport, ath.id) : [];
      p.headshot = ath?.headshot || ''; p.team = side ? bd[side].abbr : '';
      if (side) p.opp = bd[side === 'home' ? 'away' : 'home'].abbr;
      p.vibe = analyzeProp(p, logs, bd, side);
      const ex = await extraNotes(p, bd, { getJSON, get, fairML, af }).catch(() => []);
      if (ex.length) { p.vibe.items.push(...ex); p.vibe.score = scoreOf(p.vibe.items); }
    });
    // vibe + extras for every board game line (not just +EV), compact, so every game shows a lean
    const boardLines = card.board.filter(x => x.type === 'line' && !x.alt && !x.vibe);
    await mapLimit(boardLines, 6, async x => {
      const done = lines.find(l => l.id === x.id); if (done?.vibe) { x.vibe = { score: done.vibe.score, items: done.vibe.items.slice(0, 6) }; return; }
      const bd = await espn.breakdown(x);
      if (bd) card.games[x.eventId] ||= bd;
      const v = bd ? analyzeLine(x, bd, fairML) : { score: 0, items: [] };
      const ex = await extraNotes(x, bd, { getJSON, get, fairML, af }).catch(() => []);
      v.items.push(...ex); v.score = scoreOf(v.items);
      x.vibe = { score: v.score, items: v.items.slice(0, 6) };
    });
    for (const g of Object.values(card.games)) for (const t of [g.home, g.away]) t.injuries = t.injuries.slice(0, 14);

    const pool = parlayPool([...lines, ...props]);
    const pick = (k, rank, minP) => buildParlays(pool, k, rank, 0.25, minP)[0];
    card.parlays = [
      { name: 'Safe-ish', emoji: '🛡️', blurb: '2 legs, highest hit chance that still has an edge', ...pick(2, 'growth', 0.35) },
      { name: 'Value', emoji: '💎', blurb: '3 legs, best long-run bankroll growth', ...pick(3, 'growth', 0) },
      { name: 'Lotto', emoji: '🚀', blurb: '4 legs, biggest EV — small stake, big sweat', ...pick(4, 'ev', 0.03) },
    ].filter(p => p.legs).map(p => ({ ...p, legs: p.legs.map(l => l.id) }));
    const potd = pickOfDay([...lines, ...props]);
    card.potd = potd ? potd.id : null;
    card.potdParlay = parlayOfDay([...lines, ...props]);
    log(`analyzed ${Object.keys(card.games).length} games${af ? ` · API-Football calls ${af.calls()}` : ''}`);
    return card;
  }

  // ---------------- pick / parlay of the day ----------------
  // Best single: edge × sqrt(win chance), boosted by matchup vibe and recent hit rate. Needs a real but believable
  // edge (1.5–12%: bigger edges are usually stale lines) and matchup backing.
  function pickOfDay(items) {
    const ok = (x, minVibe, minP) => x.dec && x.ev >= 0.015 && x.ev < 0.12 && (x.vibe?.score || 0) >= minVibe && x.fairP >= minP;
    let c = items.filter(x => ok(x, 1, 0.4));
    if (!c.length) c = items.filter(x => ok(x, 0, 0.3));
    const score = x => x.ev * Math.sqrt(x.fairP) * (1 + 0.25 * (x.vibe?.score || 0)) + (x.vibe?.hit ? (x.vibe.hit.l10 - 0.5) * 0.02 : 0);
    return c.sort((a, b) => score(b) - score(a))[0] || null;
  }
  // Most likely +EV parlay to cash: likely legs only (≥50% each), one per game, ranked by hit chance.
  function parlayOfDay(items) {
    const pool = parlayPool(items).filter(x => x.fairP >= 0.5 && (x.vibe?.score || 0) >= 0);
    for (const k of [3, 2]) {
      const best = buildParlays(pool, k, 'hit')[0];
      if (best) return { legs: best.legs.map(l => l.id), dec: best.s.dec, p: best.s.p, ev: best.s.ev };
    }
    return null;
  }

  // ---------------- extra free data: weather, prediction markets, NHL goalies, nflverse, MLB probables ----------------
  // All keyless + free. Every source fails soft (no note) if it's down or blocked.
  const labelMatch = (team, label) => { const n = norm(team), l = norm(label); return !!l && (n === l || n.startsWith(l) || n.endsWith(l) || n.includes(' ' + l + ' ')); };
  const nickname = t => String(t || '').split(' ').slice(-1)[0];

  async function weatherFor(bd, getJSON) {
    if (!bd?.venue) return null;
    if (bd.venue.indoor) return { indoor: true, venue: bd.venue.name };
    const out = { venue: bd.venue.name, temp: bd.weather?.temp, gust: bd.weather?.gust, precipChance: bd.weather?.precipChance, src: 'ESPN' };
    try { // Open-Meteo adds sustained wind + snow (free, no key)
      if (bd.venue.city && bd.start) {
        const geo = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(bd.venue.city)}&count=5&language=en`);
        const hit = (geo?.results || []).find(r => !bd.venue.state || (r.admin1 || '').toLowerCase().startsWith(bd.venue.state.toLowerCase().slice(0, 2)) || r.country_code === 'US') || geo?.results?.[0];
        if (hit) {
          const fc = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&hourly=temperature_2m,precipitation_probability,precipitation,snowfall,wind_speed_10m,wind_gusts_10m&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=UTC&forecast_days=7`);
          const times = fc?.hourly?.time || [], k = new Date(bd.start).toISOString().slice(0, 13);
          const i = times.findIndex(t => t.slice(0, 13) === k);
          if (i >= 0) Object.assign(out, { wind: fc.hourly.wind_speed_10m[i], gust: Math.max(out.gust || 0, fc.hourly.wind_gusts_10m[i] || 0),
            temp: fc.hourly.temperature_2m[i], precipChance: fc.hourly.precipitation_probability?.[i] ?? out.precipChance, snow: fc.hourly.snowfall?.[i], src: 'Open-Meteo' });
        }
      }
    } catch (e) {}
    return out;
  }
  function weatherNotes(w, x) {
    if (!w || w.indoor) return x.market === 'totals' && w?.indoor ? [{ tone: 'n', text: `🏟️ Indoors at ${esc(w.venue)} — weather won't matter` }] : [];
    const bad = [], windy = (w.wind ?? 0) >= 15 || (w.gust ?? 0) >= 25, wet = (w.precipChance ?? 0) >= 60, snow = (w.snow ?? 0) > 0.1, cold = w.temp != null && w.temp <= 25;
    if (windy) bad.push(`💨 Wind ${w.wind != null ? Math.round(w.wind) + ' mph' : ''}${w.gust ? ` (gusts ${Math.round(w.gust)})` : ''} — tough for passing &amp; kicking`);
    if (snow) bad.push('❄️ Snow in the forecast');
    else if (wet) bad.push(`🌧️ Rain likely (${Math.round(w.precipChance)}%)`);
    if (cold) bad.push(`🥶 ${Math.round(w.temp)}°F at kickoff`);
    if (!bad.length) return [];
    const over = /^over/i.test(x.pick) || x.side === 'Over';
    if (x.type === 'line' && x.market === 'totals') return bad.map(t => ({ tone: over ? 'b' : 'g', text: t + ' — leans under' }));
    if (x.type === 'prop' && /pass|reception/.test(x.market)) return bad.map(t => ({ tone: over ? 'b' : 'g', text: t }));
    if (x.type === 'prop' && /rush/.test(x.market) && windy) return [{ tone: over ? 'g' : 'b', text: '💨 Windy — teams tend to run more' }];
    return bad.map(t => ({ tone: 'n', text: t }));
  }

  const KALSHI = { NFL: 'KXNFLGAME', NBA: 'KXNBAGAME', NHL: 'KXNHLGAME', NCAAF: 'KXNCAAFGAME', NCAAB: 'KXNCAAMBGAME', EPL: 'KXEPLGAME', MLB: 'KXMLBGAME' };
  const POLY = { NFL: 'nfl', NBA: 'nba', NHL: 'nhl' };
  async function marketsFor(x, getJSON) {
    if (x.type !== 'line' || !x.team || x.market === 'totals') return [];
    const out = [], t0 = new Date(x.start);
    try {
      const ser = KALSHI[x.lg];
      if (ser) {
        const d = await getJSON(`https://api.elections.kalshi.com/trade-api/v2/markets?limit=1000&status=open&series_ticker=${ser}`);
        const evs = {};
        for (const m of d?.markets || []) (evs[m.event_ticker] ||= []).push(m);
        for (const ms of Object.values(evs)) {
          const when = new Date(ms[0].occurrence_datetime || ms[0].expected_expiration_time);
          if (Math.abs(when - t0) > 36 * 36e5) continue;
          const home = ms.find(m => labelMatch(x.home, m.yes_sub_title)), away = ms.find(m => labelMatch(x.away, m.yes_sub_title));
          if (!home || !away) continue;
          const mid = m => { const b = +m.yes_bid_dollars, a = +m.yes_ask_dollars; return b > 0 && a > 0 && a - b <= 0.06 ? (a + b) / 2 : null; };
          const mids = ms.map(mid);
          if (mids.some(v => v == null)) break; // too thin to trust
          const tot = mids.reduce((a, b) => a + b, 0), mine = ms.find(m => labelMatch(x.team, m.yes_sub_title));
          if (mine) out.push({ src: 'Kalshi', p: mid(mine) / tot });
          break;
        }
      }
      const tag = POLY[x.lg];
      if (tag) {
        const evs = await getJSON(`https://gamma-api.polymarket.com/events?limit=200&closed=false&tag_slug=${tag}&order=startDate&ascending=false`);
        for (const e of evs || []) {
          const m = (e.markets || []).find(mm => mm.sportsMarketType === 'moneyline') || e.markets?.[0];
          if (!m?.gameStartTime || Math.abs(new Date(m.gameStartTime.replace(' ', 'T').replace('+00', 'Z')) - t0) > 12 * 36e5) continue;
          const outs = JSON.parse(m.outcomes || '[]'), prices = JSON.parse(m.outcomePrices || '[]').map(Number);
          if (outs.length !== 2 || !outs.some(o => labelMatch(x.home, o)) || !outs.some(o => labelMatch(x.away, o))) continue;
          if (!(m.bestAsk - m.bestBid <= 0.04)) break; // thin
          const i = outs.findIndex(o => labelMatch(x.team, o));
          if (i >= 0) out.push({ src: 'Polymarket', p: prices[i] });
          break;
        }
      }
    } catch (e) {}
    return out;
  }
  function marketNotes(ms, x, fair) {
    if (!ms.length || fair == null) return [];
    const p = ms.reduce((a, m) => a + m.p, 0) / ms.length, d = p - fair, who = ms.map(m => m.src).join(' + ');
    const t = x.market === 'h2h' ? x.team : `${x.team} to win`;
    if (d >= 0.04) return [{ tone: 'g', text: `📈 ${who} traders give ${esc(t)} <b>${pct(p, 0)}</b> vs ${pct(fair, 0)} fair — real-money markets agree` }];
    if (d <= -0.04) return [{ tone: 'b', text: `📉 ${who} traders only give ${esc(t)} <b>${pct(p, 0)}</b> vs ${pct(fair, 0)} fair` }];
    return [{ tone: 'n', text: `📊 ${who}: ${esc(t)} ${pct(p, 0)} — in line with fair (${pct(fair, 0)})` }];
  }

  async function nhlGoalies(x, bd, getJSON) {
    try {
      const day = new Date(new Date(x.start).toLocaleString('en-US', { timeZone: 'America/New_York' })), ds = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const sch = await getJSON(`https://api-web.nhle.com/v1/schedule/${ds}`);
      const nm = t => `${t.placeName?.default || ''} ${t.commonName?.default || ''}`;
      const g = (sch?.gameWeek || []).flatMap(w => w.games || []).find(gg => labelMatch(x.home, gg.homeTeam?.commonName?.default) && labelMatch(x.away, gg.awayTeam?.commonName?.default));
      if (!g) return null;
      const lp = await getJSON(`https://api-web.nhle.com/v1/gamecenter/${g.id}/landing`), gc = lp?.matchup?.goalieComparison;
      if (!gc) return null;
      const pickG = (side, team) => {
        const inj = new Set((team?.injuries || []).filter(p => MISSING(p.status)).map(p => normName(p.name)));
        const L = [...(gc[side]?.leaders || [])].filter(l => l.savePctg != null).sort((a, b) => (b.gamesPlayed || 0) - (a.gamesPlayed || 0))
          .filter(l => ![...inj].some(n => n.endsWith(normName(String(l.name?.default || '').split(' ').slice(-1)[0]))));
        return L[0] ? { name: L[0].name?.default, sv: L[0].savePctg, gaa: L[0].gaa, gp: L[0].gamesPlayed, team: nm(lp[side]) } : null;
      };
      return { home: pickG('homeTeam', bd?.home), away: pickG('awayTeam', bd?.away) };
    } catch (e) { return null; }
  }
  function goalieNotes(G, x, bd) {
    if (!G?.home || !G?.away) return [];
    const f = g => `${esc(g.name)} (${g.sv.toFixed(3).replace(/^0/, '')}, ${g.gaa?.toFixed(2)} GAA)`;
    if (x.type === 'line' && x.team) {
      const mine = norm(x.team) === norm(x.home) ? G.home : G.away, theirs = mine === G.home ? G.away : G.home, d = mine.sv - theirs.sv;
      const tone = d >= 0.015 ? 'g' : d <= -0.015 ? 'b' : 'n';
      return [{ tone, text: `🥅 Likely goalies: ${f(mine)} vs ${f(theirs)}${tone === 'g' ? ' — goalie edge' : tone === 'b' ? ' — goalie disadvantage' : ''}` }];
    }
    if (x.type === 'line' && x.market === 'totals') {
      const avg = (G.home.sv + G.away.sv) / 2, over = /^over/i.test(x.pick);
      if (avg <= 0.895) return [{ tone: over ? 'g' : 'b', text: `🥅 Leaky goalies: ${f(G.away)} / ${f(G.home)}` }];
      if (avg >= 0.915) return [{ tone: over ? 'b' : 'g', text: `🧱 Hot goalies: ${f(G.away)} / ${f(G.home)}` }];
      return [];
    }
    // goalie quality moves goals/points/assists, not shot volume
    if (x.type === 'prop' && /^player_(points|assists|goals)/.test(x.market) && x.team && bd) {
      const og = x.team === bd.home?.abbr ? G.away : x.team === bd.away?.abbr ? G.home : null; // the goalie he shoots on
      if (!og) return [];
      const over = x.side === 'Over';
      if (og.sv <= 0.89) return [{ tone: over ? 'g' : 'b', text: `🥅 Faces a leaky goalie: ${f(og)}` }];
      if (og.sv >= 0.92) return [{ tone: over ? 'b' : 'g', text: `🧱 Faces a hot goalie: ${f(og)}` }];
    }
    return [];
  }

  let nflverseP = null;
  function nflverse(get) {
    return nflverseP ||= (async () => {
      const now = new Date(), season = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
      const r = await get(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`);
      const text = typeof r.json === 'string' ? r.json : '';
      const lines = text.trim().split(/\r?\n/), head = lines.shift().split(',').map(h => h.replace(/"/g, ''));
      const ix = n => head.indexOf(n), by = {};
      const c = { name: ix('player_display_name'), wk: ix('week'), st: ix('season_type'), tgt: ix('targets'), ts: ix('target_share'), car: ix('carries'), att: ix('attempts'), wopr: ix('wopr'), ry: ix('receiving_yards') };
      // quote-aware split (the headshot URL column has commas inside quotes)
      const split = ln => { const out = []; let cur = '', q = false; for (const ch of ln) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
      for (const ln of lines) {
        const v = split(ln);
        if (c.st >= 0 && v[c.st] && v[c.st] !== 'REG') continue;
        const k = normName(v[c.name]); if (!k) continue;
        (by[k] ||= []).push({ wk: +v[c.wk], tgt: +v[c.tgt] || 0, ts: v[c.ts] === '' ? null : +v[c.ts], car: +v[c.car] || 0, att: +v[c.att] || 0 });
      }
      for (const k in by) by[k].sort((a, b) => b.wk - a.wk);
      return by;
    })().catch(() => ({}));
  }
  function nflverseNotes(rows, x) {
    if (!rows?.length) return [];
    const last = rows.slice(0, 4), avg = (a, f) => a.reduce((s2, r) => s2 + f(r), 0) / a.length;
    const over = x.side === 'Over', T = t => over ? t : t === 'g' ? 'b' : t === 'b' ? 'g' : t, out = [];
    if (/reception/.test(x.market)) {
      const ts = avg(last.filter(r => r.ts != null), r => r.ts), tg = avg(last, r => r.tgt), tsAll = avg(rows.filter(r => r.ts != null), r => r.ts);
      if (!isNaN(ts)) out.push({ tone: T(ts >= 0.24 ? 'g' : ts <= 0.12 ? 'b' : 'n'), text: `🎯 Target share <b>${pct(ts, 0)}</b> last ${last.length} games (${tg.toFixed(1)} targets/game)` });
      if (!isNaN(ts) && !isNaN(tsAll) && rows.length > 4 && Math.abs(ts - tsAll) >= 0.05) out.push({ tone: T(ts > tsAll ? 'g' : 'b'), text: `${ts > tsAll ? '📈 Role growing' : '📉 Role shrinking'}: ${pct(ts, 0)} lately vs ${pct(tsAll, 0)} on the season` });
    } else if (/rush/.test(x.market)) {
      const car = avg(last, r => r.car);
      out.push({ tone: T(car >= 16 ? 'g' : car <= 8 ? 'b' : 'n'), text: `🏃 ${car.toFixed(1)} carries/game last ${last.length}` });
    } else if (/pass/.test(x.market)) {
      const att = avg(last, r => r.att);
      out.push({ tone: T(att >= 36 ? 'g' : att <= 26 ? 'b' : 'n'), text: `🏈 ${att.toFixed(1)} pass attempts/game last ${last.length}` });
    }
    return out;
  }

  async function mlbProbables(x, getJSON) {
    try {
      const d = new Date(new Date(x.start).toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const sch = await getJSON(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${ds}&hydrate=probablePitcher`);
      const g = (sch?.dates || []).flatMap(dd => dd.games || []).find(gg => labelMatch(x.home, gg.teams?.home?.team?.name) || labelMatch(gg.teams?.home?.team?.name || '', nickname(x.home)));
      const hp = g?.teams?.home?.probablePitcher?.fullName, ap = g?.teams?.away?.probablePitcher?.fullName;
      return hp || ap ? [{ tone: 'n', text: `⚾ Probable pitchers: ${esc(ap || 'TBD')} vs ${esc(hp || 'TBD')}` }] : [];
    } catch (e) { return []; }
  }

  // ---------------- API-Football (free key, 100 calls/day): soccer player season stats + injuries ----------------
  // Only runs when an API_FOOTBALL_KEY is configured. Calls are capped per run to stay inside the free daily quota.
  const AF_LEAGUE = { soccer_epl: 39, soccer_uefa_champs_league: 2 };
  function makeApiFootball(key, get, cap = 60) {
    if (!key) return null;
    let calls = 0, blocked = false; const cache = {};
    const af = path => cache[path] ||= (async () => {
      if (calls >= cap || blocked) return null;
      calls++;
      const r = await get(`https://v3.football.api-sports.io${path}`, { 'x-apisports-key': key });
      // free plans can't read the current season ("try from 2022 to 2024") — stop instead of burning the daily quota
      if (r.json?.errors && !Array.isArray(r.json.errors) && Object.keys(r.json.errors).length) { blocked = true; return null; }
      return r.json?.response ?? null;
    })().catch(() => null);
    const season = () => { const n = new Date(); return n.getUTCMonth() >= 6 ? n.getUTCFullYear() : n.getUTCFullYear() - 1; };
    return {
      calls: () => calls,
      async player(sport, name) {
        const lg = AF_LEAGUE[sport]; if (!lg) return null;
        const last = String(name).split(' ').slice(-1)[0];
        if (last.length < 4) return null; // API needs 4+ chars to search
        const res = await af(`/players?search=${encodeURIComponent(last)}&league=${lg}&season=${season()}`);
        const hit = (res || []).find(p => normName(`${p.player?.firstname} ${p.player?.lastname}`) === normName(name) || normName(p.player?.name) === normName(name))
          || ((res || []).length === 1 ? res[0] : null);
        if (!hit) return null;
        const st = (hit.statistics || []).find(z => z.league?.id === lg) || hit.statistics?.[0] || {};
        const apps = st.games?.appearences || 0;
        return { apps, minutes: st.games?.minutes || 0, goals: st.goals?.total || 0, assists: st.goals?.assists || 0,
          shots: st.shots?.total || 0, sot: st.shots?.on || 0, injured: hit.player?.injured };
      },
      async injuries(sport, home, away, start) {
        const lg = AF_LEAGUE[sport]; if (!lg) return [];
        const d = new Date(start).toISOString().slice(0, 10);
        const fx = await af(`/fixtures?date=${d}&league=${lg}&season=${season()}`);
        const g = (fx || []).find(z => labelMatch(home, z.teams?.home?.name) || labelMatch(z.teams?.home?.name || '', nickname(home)));
        if (!g) return [];
        const inj = await af(`/injuries?fixture=${g.fixture?.id}`);
        return (inj || []).map(z => ({ name: z.player?.name, team: z.team?.name, type: z.player?.type, reason: z.player?.reason }));
      },
    };
  }
  async function apiFootballNotes(x, af) {
    if (!af || !x.sport?.startsWith('soccer')) return [];
    const out = [];
    try {
      const inj = await af.injuries(x.sport, x.home, x.away, x.start);
      if (x.type === 'prop') {
        const me = inj.find(i => normName(i.name).endsWith(normName(String(x.player).split(' ').slice(-1)[0])));
        if (me) out.push({ tone: 'b', text: `🚑 ${esc(x.player)} on the injury list (${esc(me.reason || me.type || 'injury')}) — confirm he plays` });
        const p = await af.player(x.sport, x.player);
        if (p && p.apps >= 3) {
          const per = v => v / p.apps, over = x.side === 'Over', T = t => over ? t : t === 'g' ? 'b' : t === 'b' ? 'g' : t;
          if (x.market === 'player_goal_scorer_anytime') {
            const g = per(p.goals);
            out.push({ tone: T(g >= 0.45 ? 'g' : g <= 0.15 ? 'b' : 'n'), text: `⚽ ${p.goals} goals in ${p.apps} apps this season (${g.toFixed(2)}/game, ${p.sot} shots on target)` });
          } else if (x.market === 'player_shots_on_target' || x.market === 'player_shots') {
            const v = per(x.market === 'player_shots' ? p.shots : p.sot), need = Math.floor(x.point) + 1, lbl = x.market === 'player_shots' ? 'shots' : 'shots on target';
            out.push({ tone: T(v >= need * 1.25 ? 'g' : v <= need * 0.6 ? 'b' : 'n'), text: `🎯 ${v.toFixed(1)} ${lbl}/game this season (needs ${need}+)` });
          } else if (x.market === 'player_assists') {
            const a = per(p.assists);
            out.push({ tone: T(a >= 0.3 ? 'g' : a <= 0.08 ? 'b' : 'n'), text: `🅰️ ${p.assists} assists in ${p.apps} apps (${a.toFixed(2)}/game)` });
          }
        }
      } else if (x.type === 'line' && x.team && x.team !== 'Draw') {
        const out2 = inj.filter(i => /missing/i.test(i.type || '')); // ruled out, not just questionable
        const mine = out2.filter(i => labelMatch(x.team, i.team) || labelMatch(i.team || '', nickname(x.team)));
        const theirs = out2.filter(i => !mine.includes(i));
        if (mine.length >= 2) out.push({ tone: 'b', text: `🚑 ${esc(x.team)} missing ${mine.length}: ${esc(mine.slice(0, 3).map(i => i.name).join(', '))}${mine.length > 3 ? '…' : ''}` });
        if (theirs.length >= 2) out.push({ tone: 'g', text: `🚑 Opponent missing ${theirs.length}: ${esc(theirs.slice(0, 3).map(i => i.name).join(', '))}${theirs.length > 3 ? '…' : ''}` });
      }
    } catch (e) {}
    return out;
  }

  async function extraNotes(x, bd, ctx) {
    const { getJSON, get, fairML } = ctx, out = [];
    if (bd && (bd.kind === 'fb' || x.sport === 'baseball_mlb')) out.push(...weatherNotes(await weatherFor(bd, getJSON), x));
    if (x.type === 'line') out.push(...marketNotes(await marketsFor(x, getJSON), x, fairML?.[x.eventId]?.[x.team] ?? (x.market === 'h2h' ? x.fairP : null)));
    if (x.sport === 'icehockey_nhl') out.push(...goalieNotes(await nhlGoalies(x, bd, getJSON), x, bd));
    if (x.sport === 'americanfootball_nfl' && x.type === 'prop') out.push(...nflverseNotes((await nflverse(get))[normName(x.player)], x));
    if (x.sport === 'baseball_mlb' && x.type === 'line') out.push(...await mlbProbables(x, getJSON));
    if (ctx.af) out.push(...await apiFootballNotes(x, ctx.af));
    return out;
  }

  // ---------------- grading (results from ESPN finals) ----------------
  function boxRows(sum) {
    const rows = {};
    for (const t of sum?.boxscore?.players || []) for (const cat of t.statistics || []) {
      const names = cat.names || cat.keys || [], labels = cat.labels || [];
      for (const a of cat.athletes || []) {
        const key = normName(a.athlete?.displayName); if (!key) continue;
        const row = rows[key] ||= { _dnp: true };
        if (a.stats?.length) row._dnp = false;
        (a.stats || []).forEach((v, i) => { if (names[i] && row[names[i]] == null) row[names[i]] = v; if (labels[i] && row[labels[i]] == null) row[labels[i]] = v; });
      }
    }
    // soccer: summary.rosters[].roster[].stats = [{ name, value }]
    for (const team of sum?.rosters || []) for (const p of team.roster || []) {
      const key = normName(p.athlete?.displayName); if (!key || !p.stats?.length) continue;
      const row = rows[key] ||= { _dnp: true };
      for (const st of p.stats) if (row[st.name] == null) row[st.name] = String(st.value);
      row._dnp = !(+row.appearances > 0 || p.starter || p.subbedIn);
    }
    for (const r of Object.values(rows)) if (r.points == null && r.goals != null && r.assists != null) r.points = String(+r.goals + +r.assists);
    return rows;
  }
  async function gradeLeg(leg, getJSON) {
    const S = SPORTS[leg.sport];
    if (!S?.espn || !leg.start) return { result: 'ungraded' };
    const base = `https://site.api.espn.com/apis/site/v2/sports/${S.espn}`;
    const sb = await getJSON(`${base}/scoreboard?dates=${etDate(leg.start)}${S.q || ''}`);
    let ev = null;
    for (const e of sb?.events || []) {
      const cs = e.competitions[0].competitors, h = cs.find(c => c.homeAway === 'home'), a = cs.find(c => c.homeAway === 'away');
      if (h && a && teamMatches(h.team, leg.home) && teamMatches(a.team, leg.away)) { ev = { e, h, a }; break; }
    }
    if (!ev) return { result: 'pending' };
    const st = ev.e.competitions[0].status?.type || {};
    if (/postpon|cancel/i.test(st.name || '')) return { result: 'void' };
    if (!st.completed) return { result: 'pending' };
    const hs = +ev.h.score, as = +ev.a.score;
    const cmp = (v, line) => v > line ? 'won' : v < line ? 'lost' : 'push';
    if (leg.type === 'line') {
      if (leg.market === 'totals') { const r = cmp(hs + as, leg.point); return { result: /^over/i.test(leg.pick) ? r : r === 'won' ? 'lost' : r === 'lost' ? 'won' : r, actual: `${hs + as} total` }; }
      const final = `${ev.a.team.abbreviation} ${as} – ${ev.h.team.abbreviation} ${hs}`;
      if (leg.team === 'Draw') return { result: hs === as ? 'won' : 'lost', actual: final };
      const isHome = norm(leg.team) === norm(leg.home), mine = isHome ? hs : as, theirs = isHome ? as : hs;
      return { result: cmp(mine - theirs + (leg.market === 'spreads' ? leg.point : 0), 0), actual: final };
    }
    const sum = await getJSON(`${base}/summary?event=${ev.e.id}`);
    const row = boxRows(sum)[normName(leg.player)];
    if (!row || row._dnp) return { result: 'void', actual: 'did not play' };
    const v = statVal(row, leg.market);
    if (v == null) return { result: 'ungraded' };
    const r = cmp(v, leg.point);
    return { result: leg.side === 'Over' ? r : r === 'won' ? 'lost' : r === 'lost' ? 'won' : r, actual: `${v} ${PROP_STATS[leg.market]?.label || ''}`.trim() };
  }
  // ---------------- live tracking (ESPN only — costs zero Odds API credits) ----------------
  const GAME_LEN = { fb: [4, 900], bb: [4, 720], hk: [3, 1200] }; // periods, seconds per period
  async function liveStatus(leg, getJSON) {
    const S = SPORTS[leg.sport];
    if (!S?.espn || !leg.start) return { state: 'na' };
    const base = `https://site.api.espn.com/apis/site/v2/sports/${S.espn}`;
    const sb = await getJSON(`${base}/scoreboard?dates=${etDate(leg.start)}${S.q || ''}`);
    let ev = null;
    for (const e of sb?.events || []) {
      const cs = e.competitions[0].competitors, h = cs.find(c => c.homeAway === 'home'), a = cs.find(c => c.homeAway === 'away');
      if (h && a && teamMatches(h.team, leg.home) && teamMatches(a.team, leg.away)) { ev = { e, h, a }; break; }
    }
    if (!ev) return { state: 'pre', detail: '' };
    const comp = ev.e.competitions[0], st = comp.status || {}, state = st.type?.state || 'pre';
    let [per, len] = GAME_LEN[S.kind] || [0, 0];
    if (leg.sport === 'basketball_ncaab') { per = 2; len = 1200; }
    let frac = state === 'post' ? 1 : state === 'pre' ? 0 : per ? Math.min(1, ((st.period - 1) * len + (len - (st.clock || 0))) / (per * len)) : null;
    if (state === 'in' && st.period > per) frac = 1;
    const hs = +ev.h.score || 0, as = +ev.a.score || 0;
    const out = { state, detail: st.type?.shortDetail || '', frac, score: `${ev.a.team.abbreviation} ${as} – ${ev.h.team.abbreviation} ${hs}` };
    if (state === 'pre') return out;
    if (leg.type === 'line') {
      if (leg.market === 'totals') Object.assign(out, { kind: 'count', value: hs + as, line: leg.point, over: /^over/i.test(leg.pick) });
      else {
        const isHome = norm(leg.team) === norm(leg.home), mine = isHome ? hs : as, theirs = isHome ? as : hs;
        Object.assign(out, { kind: 'margin', margin: mine - theirs, cover: mine - theirs + (leg.market === 'spreads' ? leg.point : 0), draw: leg.team === 'Draw' });
        if (out.draw) out.cover = hs === as ? 0.5 : -Math.abs(hs - as);
      }
    } else {
      const row = boxRows(await getJSON(`${base}/summary?event=${ev.e.id}`))[normName(leg.player)];
      const v = row && !row._dnp ? statVal(row, leg.market) : (state === 'post' ? null : 0);
      Object.assign(out, { kind: 'count', value: v, line: leg.point, over: leg.side === 'Over', dnp: state === 'post' && (!row || row._dnp) });
    }
    if (out.kind === 'count' && out.value != null && frac > 0.15 && frac < 1) out.pace = out.value / frac;
    if (state === 'post') {
      if (out.dnp) out.result = 'void';
      else if (out.kind === 'count') { const r = out.value > out.line ? 'won' : out.value < out.line ? 'lost' : 'push'; out.result = out.over ? r : r === 'won' ? 'lost' : r === 'lost' ? 'won' : r; }
      else out.result = out.cover > 0 ? 'won' : out.cover < 0 ? 'lost' : 'push';
    } else if (out.kind === 'count') {
      // Overs can cash early; unders can bust early
      if (out.over && out.value > out.line) out.result = 'won';
      if (!out.over && out.value > out.line) out.result = 'lost';
      // too early to judge until ~15% of the game is played (no pace yet)
      out.winning = out.pace == null && frac < 0.15 ? null : out.over ? (out.pace ?? out.value) > out.line : (out.pace ?? out.value) < out.line;
    } else out.winning = out.cover > 0;
    return out;
  }
  // CLV: compare the price we logged to DraftKings' closing line (ESPN summary pickcenter keeps open/close after kickoff).
  // Same number → CLV% = our decimal × closing no-vig chance − 1. Different number → did the line move our way?
  async function closingFor(leg, getJSON) {
    const S = SPORTS[leg.sport];
    if (leg.type !== 'line' || !S?.espn || !leg.start) return null;
    const base = `https://site.api.espn.com/apis/site/v2/sports/${S.espn}`;
    const sb = await getJSON(`${base}/scoreboard?dates=${etDate(leg.start)}${S.q || ''}`);
    const e = (sb?.events || []).find(ev => { const cs = ev.competitions[0].competitors, h = cs.find(c => c.homeAway === 'home'), a = cs.find(c => c.homeAway === 'away');
      return h && a && teamMatches(h.team, leg.home) && teamMatches(a.team, leg.away); });
    if (!e || e.competitions[0].status?.type?.state === 'pre') return null; // not closed yet
    const pc = (await getJSON(`${base}/summary?event=${e.id}`))?.pickcenter?.[0];
    if (!pc) return null;
    const am = v => { const t = String(v ?? '').toUpperCase(); if (t === 'EVEN') return 100; const n = parseInt(t.replace('+', ''), 10); return isNaN(n) ? null : n; };
    const ln = v => v == null ? null : parseFloat(String(v).replace(/^[ou]/i, ''));
    const c = side => side?.close || null;
    const isHome = leg.team && norm(leg.team) === norm(leg.home);
    let mine, other, point = null;
    if (leg.market === 'h2h') {
      if (leg.team === 'Draw') return null;
      mine = c(pc.moneyline?.[isHome ? 'home' : 'away']); other = c(pc.moneyline?.[isHome ? 'away' : 'home']);
    } else if (leg.market === 'spreads') {
      mine = c(pc.pointSpread?.[isHome ? 'home' : 'away']); other = c(pc.pointSpread?.[isHome ? 'away' : 'home']); point = ln(mine?.line);
    } else {
      const over = /^over/i.test(leg.pick);
      mine = c(pc.total?.[over ? 'over' : 'under']); other = c(pc.total?.[over ? 'under' : 'over']); point = ln(mine?.line);
    }
    const a1 = am(mine?.odds), a2 = am(other?.odds);
    if (a1 == null || a2 == null) return null;
    const closeP = devig([toDec(a1), toDec(a2)])[0];
    const out = { closeAm: a1, closePoint: point, closeP };
    if (leg.market === 'h2h' || point === leg.point) { out.clv = leg.dec * closeP - 1; out.beat = out.clv > 0; }
    else if (point != null) { // number moved: better number for us = beat
      const better = leg.market === 'spreads' ? leg.point > point : /^over/i.test(leg.pick) ? leg.point < point : leg.point > point;
      out.beat = better; out.moved = +(leg.point - point).toFixed(1);
    }
    return out;
  }

  function parlayResult(legs) {
    const rs = legs.map(l => l.result || 'pending');
    if (rs.includes('lost')) return 'lost';
    if (rs.some(r => r === 'pending' || r === 'ungraded')) return 'pending';
    return rs.includes('won') ? 'won' : 'push';
  }
  const SNAP = ['id', 'type', 'sport', 'lg', 'emoji', 'eventId', 'game', 'home', 'away', 'team', 'market', 'point', 'pick', 'player', 'side',
    'statLabel', 'dec', 'book', 'fairP', 'ev', 'start', 'headshot'];
  const snap = x => ({ ...Object.fromEntries(SNAP.filter(k => x[k] != null).map(k => [k, x[k]])), vibe: x.vibe?.score ?? 0,
    hit: x.vibe?.hit ? { hits: x.vibe.hit.hits, n: x.vibe.hit.n } : undefined, result: 'pending' });

  // Grade finished picks, then record today's Pick/Parlay of the Day (replaced on re-runs until its first game starts).
  async function updateHistory(history, card, get, log = () => {}) {
    const cache = {}, getJSON = url => cache[url] ||= get(url).then(r => r.json).catch(() => null), now = Date.now();
    for (const h of history) {
      const legs = [h.potd, ...(h.parlay?.legs || [])].filter(Boolean);
      for (const l of legs) if ((l.result === 'pending' || !l.result) && new Date(l.start) < now - 3.5 * 36e5) {
        Object.assign(l, await gradeLeg(l, getJSON).catch(() => ({ result: 'pending' })));
        if (l.result === 'pending' && now - new Date(l.start) > 4 * 864e5) l.result = 'ungraded';
      }
      if (h.parlay) h.parlay.result = parlayResult(h.parlay.legs);
      for (const l of [...legs, ...(h.clv || [])]) if (l.type === 'line' && l.close == null && new Date(l.start) < now) {
        const cl = await closingFor(l, getJSON).catch(() => null);
        if (cl) l.close = cl; else if (now - new Date(l.start) > 3 * 864e5) l.close = false;
      }
    }
    const byId = Object.fromEntries([...card.lines, ...card.props].map(x => [x.id, x]));
    const potd = byId[card.potd], par = card.potdParlay;
    if (potd || par) {
      const date = etDate(card.generatedAt);
      const clvLegs = card.lines.filter(x => x.dec && !x.alt && !x.espnLine && x.ev >= 0.01 && x.ev < STALE).slice(0, 25).map(snap);
      const entry = { date, clv: clvLegs, potd: potd ? snap(potd) : null,
        parlay: par ? { legs: par.legs.map(id => snap(byId[id])), dec: par.dec, p: par.p, ev: par.ev, result: 'pending' } : null };
      const i = history.findIndex(h => h.date === date);
      const started = h => [h.potd, ...(h.parlay?.legs || [])].some(l => l && new Date(l.start) < now);
      if (i < 0) history.push(entry);
      else if (!started(history[i])) history[i] = entry;
    }
    history.sort((a, b) => b.date.localeCompare(a.date));
    log(`history: ${history.length} days`);
    return history;
  }

  const Engine = { SPORTS, PROP_STATS, STALE, PROP_STALE, toDec, toAm, pct, esc, devig, norm, normName,
    legsFromEvents, propsFromEvent, oneSidedFromEvent, altsFromEvent, altPropsFromEvent, ladderModel, applyBooks, makeEspn, statVal, analyzeLine, analyzeProp, projection, isOut,
    parlayStats, buildParlays, parlayPool, buildCard, analyzeCard,
    pickOfDay, parlayOfDay, gradeLeg, updateHistory, parlayResult, liveStatus, closingFor, boxRows,
    extraNotes, weatherFor, marketsFor, nhlGoalies, nflverse, makeApiFootball, apiFootballNotes };
  root.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
