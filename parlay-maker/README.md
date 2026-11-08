# ⚡ Edge Lab

Daily +EV sports picks, **player props** and parlays. Every price is checked against the sharp no-vig line and backed by injuries, hit rates and matchup stats. A GitHub Action rebuilds the card every morning and publishes it to GitHub Pages.

## What's on the card
- **Game lines** (ML, spreads, totals): NFL, NBA, NHL, NCAAF, NCAAB, MLB, EPL, Champions League, Europa League, MMA, plus any live ATP/WTA tournament. La Liga, Serie A, Bundesliga, Ligue 1 and MLS also get player props (anytime goalscorer, shots on target, shots, assists) when the budget allows. Free lines via ESPN also cover the Conference League, the FA Cup and the EFL Cup. The fair price is Pinnacle's line with the vig removed (power de-vig).
- **Player props**: points, rebounds, assists, threes and PRA in basketball; passing, rushing and receiving yards plus receptions in football; shots, points and assists in hockey. The fair price is Pinnacle's no-vig line when Pinnacle offers the prop, otherwise the median no-vig line across 3+ books.
- **Hit rates**: each player's recent ESPN game log compared to tonight's line.
- **Vibe score**: ESPN's win model vs the market, injuries (whose absence opens up whose matchup), teammates out (who picks up the extra usage), form and a scoring projection.
- **Auto-built parlays**: Safe-ish, Value and Lotto, max one leg per game, no 🔴 fades. There's also a build-your-own tab.
- **⭐ Pick of the Day**: the single best bet. It needs a 1.5–12% edge and matchup backing, and is ranked by edge × √(win chance), boosted by vibe and hit rate.
- **🎯 Parlay of the Day**: the +EV parlay most likely to hit. Every leg is ≥50% to win on its own, with one leg per game.
- **📈 Track record**: both picks are saved to `data/history.js` and graded from the ESPN final box scores on the next morning's run. The record shows W-L, units (1u flat) and actual vs expected hit rate.
- **🪜 Alt props (ladders)**: rungs like 10+ PTS, 3+ AST and 7+ REB. Books post these Over-only, so each rung is priced from the player's main line (no-vig) through a fitted distribution: normal for points and yards, negative binomial for small counts. When 3+ books post the same rung, that's blended with their vig-adjusted median. Model-only rungs must be 10–85% to hit and need a 5% edge; blended rungs need 3%. Checked against 107 multi-book rungs, the model sits within ~3 points of the market and leans slightly conservative.
- **📰 News**: filter by sport with the chips (plus day, time, team and search). It has two views.
  - **📋 Lineups & injuries** (one card per game): confirmed soccer XIs once posted (about an hour before kickoff), otherwise projected starters from each team's last game (NBA, soccer), likely NHL goalies and the full injury report. When a projected starter is on the report as out or doubtful, a ⚠️ box flags it: teammates' props and the team total are where the books can lag.
  - **📰 Headlines**: ESPN stories for every sport on the card, with an 🚑 injury-only toggle.
  - **Cost and freshness**: all free. It updates every time the card refreshes, 7 times a day.
- **📋 bet365 sheet**: The Odds API doesn't carry bet365, so the card ships fair odds for every line and prop. You type in bet365's price and the app computes your edge.

## Files
| File | What it does |
|---|---|
| `index.html` + `app.js` | The UI. Works on GitHub Pages or straight from disk. |
| `engine.js` | Shared odds math, ESPN analysis and the `buildCard` pipeline (runs in Node and the browser). |
| `scripts/build.js` | Daily build → `data/latest.js` |
| `data/latest.js` | Today's card (committed by the daily job) |
| `data/history.js` | Every Pick/Parlay of the Day and its graded result |
| `../.github/workflows/daily-card.yml` | Every morning at 8:23 AM ET: build, commit, deploy to Pages |

## Setup (one time)
1. **Add the key:** repo **Settings → Secrets and variables → Actions → New repository secret**, name `ODDS_API_KEY`.
2. **Turn on Pages:** **Settings → Pages → Source: GitHub Actions**.
3. Merge to `main`. GitHub only runs scheduled workflows from the default branch.
4. Optional: run it now from **Actions → Daily Edge Card → Run workflow**.
5. Optional: set a repo variable `DAILY_BUDGET` to fix the credits spent per day.
6. Optional: `API_FOOTBALL_KEY` (from api-football.com) adds soccer injury lists. **The free plan only covers seasons 2022–2024**, so it does nothing for the current season and switches itself off on the first plan error. It's only worth adding with a paid plan. Soccer hit rates (goals, assists, shots, shots on target) already come free from ESPN game logs.

## Credit budget (built to last the whole month)
| Step | What it does |
|---|---|
| **Free schedule check first** | The Odds API's `/events` endpoint costs **0 credits**, so each run checks which sports actually have games in the next 30h and only buys odds for those. |
| **Pace** | `(credits left − reserve) ÷ days left in the month`, re-calculated every run, so unused credits roll forward automatically. |
| **Weekday weighting** | Sun ×1.4 (NFL) · Sat ×1.4 (college football) · Thu ×1.0 · Fri ×0.9 · Mon/Wed ×0.8 · Tue ×0.7. It averages out to the pace. |
| **Reserve** | About 8% (max 40) is held back for your manual ↻ Live refreshes, so the daily build never takes the last credits. |
| **Props fit the budget** | If a game's full prop menu doesn't fit, it buys the most popular markets first (points, rebounds, assists…). |
| **Evening top-up for late games** | The first run after 5 PM ET buys props (2–3 credits per game, about half a day's pace in total) only for games tipping in the next 7 hours that have none yet. Latest tips go first, so 10 PM ET NBA and West Coast NHL games get covered. It runs once per day. |
| **Leftovers** | Any credits left after props go to lines for the next sports with games. |

| Cost | |
|---|---|
| Lines, per sport | ~3 credits (Pinnacle + 9 US books = one region) |
| Props, per game | ~2–5 credits |
| Live tracker | **0** (ESPN) |
| Grading | **0** (ESPN) |

**Free tier (500/mo):** about 13 credits a day. Weekdays get lines for 2 sports plus props for a game; NFL Sundays get more.

**$30/mo tier (20K):** everything, every day.

The ↻ Live refresh budget defaults to 8 credits; you can change it in ⚙️ Settings.

## Local
```bash
ODDS_API_KEY=xxx node scripts/build.js --budget 40   # spend 40 credits
node scripts/build.js --reanalyze                    # refresh ESPN analysis only (free)
open index.html
```
The in-app **↻ Live refresh** runs the same pipeline in your browser with your key, saved only in that browser.

Not betting advice. Edges are small, variance is huge, and books limit winners. 1-800-GAMBLER.
