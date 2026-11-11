# NFL Model Upgrade Progress

**Development branch:** `codex/nfl-shared-engine-upgrade`  
**Production/main:** unchanged; no deployment is authorized for this work.  
**Status:** Audit complete; first shared player forecast and probability pipeline is implemented on the review branch. Game-model integration and full validation remain in progress.

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
| Python unit suite | 40 tests passed after implementation | Includes importer, feature engineering, player/team backtests, data validation, and leakage guards. |
| Player-game sample | 7,103 completed games; 44,120 eligible player-game rows | Broad coverage for the opportunity × efficiency benchmark. |
| Player point forecast | Opportunity × efficiency lowered MAE for many volume and yard markets across seasons; touchdown categories were mixed | Retain as a research candidate and validate market-by-market. |
| Player probability benchmark | Rolling empirical residuals beat coin-flip Brier/log loss in tested eligible position-market groups; only select categories consistently beat the prior-rate baseline | This is a model-centered half-point diagnostic (not sportsbook-line performance). Need inspect exact market deltas before promotion. |
| Player probability OOS gate | Five position-markets clear a game-cluster 95% CI for both Brier and log loss versus the prior-rate baseline | FB anytime TD (N=622), QB pass TD (4,512), RB anytime TD (10,838), TE receptions (8,635), WR receptions (17,413). These are centered half-point tests only; alternate lines remain exploratory. |
| Team-score 2026 holdout | N=88; Base score MAE 7.39, margin MAE 9.37, total MAE 11.20, winner accuracy .632, win Brier .2236, log loss .6371 | Statistical candidate trails the closing-market reference. |
| Closing market 2026 reference | N=88; score MAE 6.84, margin MAE 8.98, total MAE 10.32, winner accuracy .701, win Brier .2073, log loss .6059 | Retrospective benchmark only; not used as an independent prediction input. |
| Elo 2026 holdout | N=135; Brier .2211, log loss .6320, winner accuracy .659 | Trails closing moneyline reference (.2152 / .6223 / .681). |
| Candidate spread/total probabilities | 2026 holdout spread Brier .2510; total Brier .2579 | Weak/near no-information. Do not present as validated probabilities. |
| JavaScript suite | 33 tests pass in the bundled Node test runner | The desktop shell lacks `node`/`npm`; branch CI runs `npm test`, the production build, and the Python suite. |
| Forecast profile artifact | Generated from data through 2026 Week 9; 17 position-market residual profiles, 5 pass validation gate; 1.19 MB | The artifact is atomically rebuilt after weekly nflverse refresh. It is not copied into the repo from ignored research data; the workflow will publish it after the review branch is merged by the user. |

## Phases

| Phase | Status | Work |
| --- | --- | --- |
| 1. Audit and baseline | Complete | Prediction dependency map, data gaps, leakage risks, historical baselines, and test coverage recorded. |
| 2. Shared data and features | In progress | Canonical forecast record now carries IDs, model version, pregame cutoff, freshness, role, residual range, and line probabilities. Opponent-adjusted feature definitions still need a common API. |
| 3. Opportunity and efficiency | In progress | Games, Top Looks, Props, and Charts now call the same player projection API. Injury, pace, game script, and teammate-availability adjustments remain to be integrated and validated. |
| 4. Calibrated distributions | In progress | OOS residual profiles build from weekly forecasts; strict market-level validation gate and push accounting are implemented. Only five position-markets pass for centered half-point lines; alternate thresholds still need dedicated evaluation. |
| 5. Game/player simulations | Planned | Improve score/pace/script and TD forecasts only where validated; reconcile team and player outcomes. |
| 6. Top Looks | In progress | Top Looks consumes the shared forecast/probability layer; its ranking remains a heuristic score pending leak-safe historical ranking validation. |
| 7. V2 integration | In progress | Games, Top Looks, Props, Props Board, and Charts use the shared player forecast. The NFL Games analysis panel remains beneath the slate. |
| 8. Tracking and continuous improvement | In progress | V3 locks now save the shared forecast ID, probability provenance, validation state, and data freshness. Model Record includes V2 and V3 records and explains calibration state. The scheduled/manual profile workflow uploads an artifact for review without writing to main; branch CI/build passed. |

## Change Log

- Added `NFL_MODEL_UPGRADE_PROGRESS.md` and created review branch `codex/nfl-shared-engine-upgrade` from current `main`.
- Added `src/lib/nflForecast.js` as the canonical pregame opportunity × efficiency projection record and reusable residual-based line probability API. It filters out the matchup week, preserves push probability, carries model/data identity, and refuses calibrated labels for unsupported markets or non-benchmark lines.
- Migrated Top Looks, NFL Games player rows, Player Props, Props Board, and Player Charts to the shared point forecast and probability source. The NFL Games analysis panel now follows the game slate/list.
- Cached leak-safe league efficiency priors per loaded player dataset and matchup week so page-level forecasts do not rescan every player history for each candidate.
- Extended `scripts/backtest_player_baselines.py` and added `scripts/build_nfl_player_distributions.py` to generate OOS forecast errors, residual quantiles, and validation flags. The scheduled/manual workflow validates the complete profile and uploads it as a review artifact without writing to main.
- Added a dedicated GitHub Actions validation workflow for JavaScript tests, frontend build, and Python tests on the development branch / pull request.
- Updated V3 pick locking to preserve the shared forecast ID, calibrated/exploratory probability metadata, profile freshness, and Model Record visibility. Existing V2 locks remain immutable and visible alongside V3.
- Python suite: 41 tests passed. JavaScript suite: 33 tests passed after compact histogram and prior-cache support. Python modules compile successfully. The empirical distribution builder completed on local nflverse data through 2026 Week 9: 17 position-market profiles generated, five passed the validation gate. The 38 KB public artifact includes exact two-decimal residual histograms only for validated profiles; other profiles retain summary/uncertainty metadata without unsupported probability distributions.
- GitHub Actions run 25 passed dependency installation, the JavaScript suite, the production frontend build, and the Python test suite after the compact histogram asset/package update. A subsequent performance-cache change has local test coverage and its CI run is pending. Changes remain on the review branch only; no merge or deployment has occurred.

## Outstanding Work / Limitations

- Improve independent NFL Game winner/spread/total forecasts; current candidates trail closing-market benchmarks and cannot be promoted as validated probabilities.
- Test residual probabilities at thresholds away from the model-centered half-point before labeling any alternate line calibrated.
- Replace the remaining Top Looks hand-weighted rank score only after a leak-safe selection-ranking backtest; no player-prop odds history exists to validate ROI or CLV.
- Add actual forecast snapshots, grading, team/game consistency checks, and model-version tracking without rewriting existing records.
- Improve and validate opponent adjustments, calibrated prop distributions, game predictions, Top Looks ranking, and anytime TD probabilities.
- The weekly workflow uploads a generated forecast artifact for review; it intentionally does not publish updated data to main automatically. The checked-in review asset is trained through 2026 Week 9 and needs a manual refresh/review before it becomes stale.
- Review other-sport and existing V2 contracts in the draft pull request; collect review feedback before any merge.
- No merge, main-branch write, or production deployment will be made by this work.
