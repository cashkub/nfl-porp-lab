# NFL Model Upgrade Progress

**Development branch:** `codex/nfl-shared-engine-upgrade`  
**Production/main:** unchanged; no deployment is authorized for this work.  
**Status:** Phase 1 baseline audited; shared-engine implementation in progress.

## Objective

Build one versioned, leak-safe NFL forecasting system for game outcomes, player opportunity and production, player props, Top Looks, charts, matchup analysis, and anytime touchdowns. Preserve the existing V2 experience and other leagues. Keep research candidates separate from production forecasts until chronological held-out evaluation supports promotion.

## Repository and Data Audit

The project is a Vite/React site with Python data-import, feature, rating, training, and backtest scripts. Local historical research data is under ignored `data/nfl-model/`; production web data is served from `public/data/`. The source workspace is a GitHub-synced snapshot without `.git`, so changes are developed and validated locally, then committed to the dedicated GitHub branch through the connected GitHub repository. No data or secrets from the ignored local research directory are copied into the website.

### Current prediction dependency map

| Feature | Current source | Notes / mismatch |
| --- | --- | --- |
| NFL Games score, winner, spread, total | `src/lib/projection.js`, team ratings in `scripts/nfl_ratings.py` and `scripts/train_nfl.py`, consumed by `src/components/NflGames.jsx` | Score projection blends statistical ratings and available market context. Probability and spread/total probability candidates have separate training/calibration paths. |
| NFL Games player forecasts | `src/lib/playerProjection.js`, shared efficiency priors and opportunity × efficiency calculation | Top Looks currently calls this same point-projection helper for most player props. Role/availability and player-specific context still vary by caller. |
| Top Looks | `src/lib/topLooksModel.js` and `src/lib/stats.js` | Uses shared point projection for ordinary props, but also manually assembled rank weights, contextual adjustments, and a distinct TD fallback. Some selected history windows differ from chart/list views. |
| Player Props / chart hit rates | `src/lib/stats.js:estimateModelHitRate`, consumed by `NflPropList.jsx`, `PropsBoard.jsx`, and `NflCharts.jsx` | One helper, but its estimate blends historical rate, a linear projection-distance heuristic, market probability, and hand-set context coefficients. Callers can pass different histories and market inputs, so displayed probabilities can differ. |
| Player Charts point forecast | `src/lib/playerProjection.js` through Game/Top Looks flows; chart probability uses `stats.js` | Historical chart values are clear, but the next-game forecast and line probability are not yet a single versioned forecast record shared with the originating Top Look. |
| Matchup analysis / defensive ranks | `src/lib/matchup.js`, consumed by `Matchup.jsx`, charts and Top Looks | Position/market allowed values are largely raw team game-log aggregates; not opponent-adjusted, and small samples are not consistently shrunk. |
| Anytime TD | `topLooksModel.js` scoring usage plus historical `estimateModelHitRate` | Uses red-zone indicators as ranking signals; there is no validated player scoring distribution reconciled to team expected touchdowns. |
| Model Record | `public/data/model-record.json`, `scripts/record_nfl.mjs`, `track_picks.mjs`, `replay_nfl_week.mjs` | Current record snapshots/pick tracking are separate from a reproducible, immutable forecast-generation ledger for every model output. |
| Data ingestion and automation | `scripts/update_data.py`, `update-stats.yml`, `.github/workflows/*` | Public nflverse stats/PBP/schedule data are available. Historical pregame injury snapshots, weather forecasts, and player-prop odds are not reliably archived; observed/retrospective context cannot be treated as pregame data. |

### Leakage and data-quality risks identified

- The Python team-model benchmark explicitly excludes observed historical weather and retrospective starter information where archived pregame snapshots are unavailable; those features must remain unavailable in historical prediction tests.
- Closing game markets exist for some periods and are useful retrospective references only. They are not valid inputs to claims about independent prediction or value at an earlier timestamp.
- No historical sportsbook player-prop thresholds/prices are present in the audited data; player prop ROI, EV, and closing-line value cannot be claimed from current backtests.
- A player’s games within the same NFL week must be forecast before any same-week outcome is added. The existing player benchmark does this in weekly batches.
- Current browser callers sometimes use different filtered histories; this can create different model hit rates for the same player, game, market, and line.
- Injuries, depth charts, weather, and current odds are live-context data without equivalent multi-season pregame archives. They can be shown as sourced live context but cannot be used to overstate historical validation.

## Baseline Validation (pre-change)

Data: local nflverse-derived `games.csv`, play-by-play `.gz`, and weekly player stats for 2019–2026. Current 2026 season is incomplete. The reports are research baselines and do not change `scripts/nfl_weights.json` or production web assets.

| Evaluation | Result | Interpretation |
| --- | --- | --- |
| Python unit suite | 38 tests passed | Includes importer, feature engineering, player/team backtests, data validation, and leakage guards. |
| Player-game sample | 7,103 completed games; 44,120 eligible player-game rows | Broad coverage for the opportunity × efficiency benchmark. |
| Player point forecast | Opportunity × efficiency lowered MAE for many volume and yard markets across seasons; touchdown categories were mixed | Retain as a research candidate and validate market-by-market. |
| Player probability benchmark | Rolling empirical residuals beat coin-flip Brier/log loss in tested eligible position-market groups; only select categories consistently beat the prior-rate baseline | This is a model-centered half-point diagnostic (not sportsbook-line performance). Need inspect exact market deltas before promotion. |
| Team-score 2026 holdout | N=88; Base score MAE 7.39, margin MAE 9.37, total MAE 11.20, winner accuracy .632, win Brier .2236, log loss .6371 | Statistical candidate trails the closing-market reference. |
| Closing market 2026 reference | N=88; score MAE 6.84, margin MAE 8.98, total MAE 10.32, winner accuracy .701, win Brier .2073, log loss .6059 | Retrospective benchmark only; not used as an independent prediction input. |
| Elo 2026 holdout | N=135; Brier .2211, log loss .6320, winner accuracy .659 | Trails closing moneyline reference (.2152 / .6223 / .681). |
| Candidate spread/total probabilities | 2026 holdout spread Brier .2510; total Brier .2579 | Weak/near no-information. Do not present as validated probabilities. |
| JavaScript suite/build | Not yet run in this desktop shell: `node` and `npm` executables are absent although `node_modules` exists | Checking the available bundled JavaScript runtime as a safe way to run equivalent tests/build. |

## Phases

| Phase | Status | Work |
| --- | --- | --- |
| 1. Audit and baseline | In progress | Dependency map and baseline recorded. Capture exact player-probability output and complete JS verification route. |
| 2. Shared data and features | Planned | Canonical input/output contracts, opponent-adjusted features, freshness and missing-data semantics. |
| 3. Opportunity and efficiency | Planned | Consolidate player forecast generation and use one pregame workload/efficiency record. |
| 4. Calibrated distributions | Planned | Reuse leak-safe historical residual distributions for adjustable lines; validate by market and threshold. |
| 5. Game/player simulations | Planned | Improve score/pace/script and TD forecasts only where validated; reconcile team and player outcomes. |
| 6. Top Looks | Planned | Rank on validated probabilities/price/value/uncertainty; clearly separate ranking scores from hit probabilities. |
| 7. V2 integration | Planned | Keep Games list and place analysis below it; make shared forecast identity visible in relevant NFL screens. |
| 8. Tracking and continuous improvement | Planned | Immutable pregame snapshots, grading, automation, freshness/error handling, and model comparison. |

## Change Log

- Initial audit and baseline capture. No model code changed yet.

## Outstanding Work / Limitations

- Complete the repository audit with exact available feature schemas and automation behavior.
- Capture player probability baseline values by market and compare empirical residual model against the prior-rate baseline, with game-cluster confidence intervals.
- Build a single canonical forecast record and migrate all applicable NFL pages to it without changing CFB/CBB/NBA logic.
- Improve and validate opponent adjustments, calibrated prop distributions, game predictions, Top Looks ranking, and anytime TD probabilities.
- Add reliable forecast snapshot/grading automation without using missing historical injuries, weather, or player prop prices as if archived.
- Run all Python tests, JavaScript tests, and production frontend build in a JavaScript-capable runtime. Review other-sport and existing V2 contracts before proposing a pull request.
- No merge, main-branch write, or production deployment will be made by this work.
