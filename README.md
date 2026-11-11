# PropBets — NFL Prop Lab V2

A mobile-first, **React + Vite** sports analytics website with an active NFL V2 experience for player charts, prop research, Top Looks, model tracking, and upcoming-game analysis. The Games view keeps the existing schedule and adds independent score estimates, player projection research, and a detailed audit of available model inputs. Uses public nflverse data, GitHub Actions, and Cloudflare hosting; it does not require a paid sportsbook feed.

> **Important:** The download initially contains **demo mode with entirely fictional players and results**. Run the data update workflow after pushing the repository to load actual NFL records. The user interface clearly labels sample data. Historical results are not win probabilities.

## What it does

- Player search across **all offensive players present in the downloaded dataset** (QB/RB/FB/WR/TE, plus other players with qualifying stats). A player without a recorded game in that season won't show a hit rate for it.
- Passing yards, rushing yards, receiving yards and receptions.
- Adjustable **Over / Under** line with both slider and numeric input; equality is a **push**, therefore **not** counted as a hit on either side. For 40+ alternate lines, use **over 39.5**.
- Last 5, last 10, full **regular-season** hit rates for the **currently filtered games**. Season and home/away/opponent filters are applied before selecting the last N games.
- Game-by-game bar chart and expandable game log.
- Average, median, last-three hit percentage, recent trend.
- Daily nflverse CSV import with idempotent commits. Supports prior seasons (default current NFL season plus previous two).
- Optimized for mobile screens; horizontally scrollable bar graph and table.
- NFL Games includes upcoming matchups, available schedule-feed prices, an opponent-adjusted score baseline, player opportunity estimates, matchup research, and a model-input audit directly below the game list.
- NFL model validation runs chronological holdouts and reports score, margin, total, moneyline, spread, total-probability, and player-projection baselines when the public historical data supports them.
- Games view clearly withholds game betting probabilities and player-prop hit probabilities unless the underlying method has passed relevant out-of-sample checks. Missing odds and timestamps are labeled rather than inferred.

## Quick start: publish your free website (recommended)

### 1. Create your GitHub repository

1. Sign in at https://github.com and create a **new empty repository** (e.g. `nfl-prop-lab`). It can be public. **Do not** generate a README or .gitignore on GitHub because both are in this project.
2. **Unzip** this project on your computer. If you don't use Git locally, on the new GitHub repo click **uploading an existing file** or **Add file → Upload files** and upload the contents. **Important:** GitHub's browser upload can omit `.github` and other hidden folders depending on how you select files. Confirm that `.github/workflows/update-stats.yml` is in your repository after uploading. Upload folders (not the ZIP file itself) so the repository root contains `package.json`, `src/`, `public/`, `scripts/`, and `.github/`.
3. Commit the files to the repository's `main` branch. Prefer using GitHub Desktop if dragging entire hidden folders into the browser proves difficult.

For terminal users, from inside the unpacked project:

```bash
git init
git add .
git commit -m "Initial NFL Prop Lab website"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nfl-prop-lab.git
git push -u origin main
```

### 2. Import real NFL data

1. Open your repository on GitHub.
2. Go to **Actions → Update NFL Data → Run workflow → Run workflow**.
3. The workflow runs Python unit tests and downloads year-by-year nflverse CSVs, converts them into `public/data/stats.json`, and automatically commits the result. On successful completion, `stats.json` changes from `"status": "pending"` to `"status": "ready"`. This is a **real data import**, not sample stats.
4. If a workflow doesn't appear, confirm `.github/workflows/update-stats.yml` exists on the default branch and **Actions** is enabled under repository settings.
5. If GitHub declines the commit because of repository permissions, check **Settings → Actions → General → Workflow permissions** and allow **Read and write permissions** as your account/repository policy permits, then re-run the workflow. The workflow itself also explicitly requests `contents: write`.

The importer downloads `stats_player_week_<year>.csv` from the [nflverse Player Summary Stats release](https://github.com/nflverse/nflverse-data/releases/tag/stats_player), and uses each row's `game_id` to identify home/away. No scheduled runs are required to preview the app, but live data depends on completing the first import.

### 3. Deploy on Cloudflare Pages

1. Sign in at https://dash.cloudflare.com, then choose **Workers & Pages → Create → Pages → Import an existing Git repository** (wording can vary with the UI).
2. Connect your GitHub account and choose the `nfl-prop-lab` repository.
3. Set these build settings:

   | Setting | Value |
   | --- | --- |
   | Framework preset | Vite / React (or None with manual settings) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `/` (repository root) |
   | Environment variables | None required |
   | Node.js | Node 22 (if configurable, `NODE_VERSION=22`) |

4. Click **Save and Deploy**. Cloudflare assigns your app a free `*.pages.dev` URL.
5. Every later commit to the connected `main` branch triggers a Cloudflare rebuild. When the GitHub workflow commits refreshed `stats.json`, Cloudflare should publish that change. Verify both the latest workflow run and Cloudflare deployment status if stats seem old.

This is the **Git integration** route, not Direct Upload. They are distinct deployment configurations.

### 4. Daily updates

The GitHub workflow `.github/workflows/update-stats.yml` runs at **11:25 UTC daily** and also supports manual runs. A successful import creates a commit **only if the stats actually changed**, so idle runs don't spam deployments. Upstream nflverse data generally updates after completed games overnight, **not live during a game**. Corrections may appear in later refreshes. GitHub scheduled jobs can be delayed; they run only on the default branch and may be automatically disabled after prolonged inactivity in public repositories. If needed, rerun the workflow manually.

### 5. Open on your phone

Open your `*.pages.dev` URL in Safari and use **Share → Add to Home Screen**. This is a mobile website shortcut, not a separately packaged App Store application.

## Running locally on a computer

Install **Node.js 22** from https://nodejs.org, unzip the project, then open a terminal in the directory:

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The project intentionally starts in demo mode until the data import runs. For a local real-data import, also install **Python 3.10+** and run:

```bash
python3 scripts/update_data.py
```

Then refresh your browser. For quality checks:

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py' -v
npm run build
```

## Data methodology

The data import reads the last three NFL seasons (default), regular season only. Each row contains a player's weekly official-style box-score stats and game opponent. Individual player game records are deduplicated by `season + game_id`. `game_id` encodes season, week, away team and home team; that provides venue without another API. Players who have multiple games against the same opponent can filter by opponent. We do not artificially fill missing player games with zeros; a game appears only when the upstream player game row exists. Missing games and players without recorded stats can bias descriptive hit rates; participation/injuries are not tracked. It excludes postseason games by design.

The UI uses **strict** comparisons: over a line means observed stat **>** line; under means **<** line. Equality is not a hit. Use half-point lines to avoid pushes and interpret `X+` as **over `X-0.5`**. Historic hit rate = winning historical games ÷ recorded relevant games. It is *not* an estimated probability for the next matchup.

The source files are `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv` for 2026, with the same naming convention for other years. If nflverse changes its release layout or CSV schema, the importer fails rather than silently publishing the wrong records. See the GitHub Actions run logs.

## Current limitations

- The NFL Games score estimate is a research baseline, not a validated betting-probability model. Historical holdouts have not shown a consistent independent advantage over closing-market score forecasts.
- Historical sportsbook player-prop lines and prices are unavailable in the free data. The player opportunity estimator is a point-projection experiment; it does not establish prop-market value or ROI. Its experimental residual probabilities are evaluated in CI and are not promoted to the interface.
- Schedule-feed moneylines and totals may lack a per-game timestamp. They are displayed as a schedule snapshot, not represented as verified live odds. Player prop lines are shown only when the data includes the market and timestamp.
- Injury and weather sources are incomplete. Weather forecasts are fetched only for supported outdoor venues and near-term games; player availability is limited to the available report and recent depth-chart data.
- Play-by-play efficiency, red-zone, and matchup details are historical context unless explicitly stated as model inputs. The score baseline does not use every displayed detail.
- Nightly refresh depends on GitHub scheduled runs and available upstream data; it is **not guaranteed to update daily** if a source or workflow is unavailable.
- The app has no login, subscriptions, analytics tracking, or database.
- Review applicable source terms and intellectual-property rights before commercial reuse or redistribution. Credit nflverse when presenting or redistributing derived data as its license requires.

## Repository structure

```text
nfl-prop-lab/
├── .github/workflows/update-stats.yml    # manual + daily data refresh
├── index.html
├── package.json
├── vite.config.js
├── public/
│   ├── _headers                       # Cloudflare cache/security headers
│   ├── favicon.svg
│   └── data/stats.json                # starts as pending; workflow replaces it
├── scripts/update_data.py            # standard-library CSV importer
├── src/
│   ├── App.jsx                       # complete React dashboard
│   ├── styles.css                    # responsive styles
│   ├── main.jsx
│   ├── components/PropChart.jsx
│   └── lib/{stats.js,demoData.js}
└── tests/
    ├── stats.test.js                 # hit-rate/filter unit tests
    └── test_update_data.py           # CSV importer unit tests
```

## Sources and credits

- Stats: [nflverse-data](https://github.com/nflverse/nflverse-data) and [nflreadr docs](https://nflreadr.nflverse.com/reference/load_player_stats.html).
- NFL schedules and play-by-play used for model research: [nflverse-data](https://github.com/nflverse/nflverse-data), licensed CC BY 4.0. Credit nflverse when redistributing derived data or presenting these model results.
- Automatic scheduling: [GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
- Hosting: [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/).
- React, Vite, Lucide icons.

### NFL model validation

Run `python scripts/download_nfl_model_data.py --output-dir data/nfl-model` to download the public schedule and play-by-play inputs, then run `python scripts/train_nfl.py data/nfl-model` to fit a candidate. The candidate is written to `scripts/nfl_weights.candidate.json`; it never overwrites production weights. The GitHub Actions workflow also runs the offline tests and creates a short-lived candidate artifact for review.

Evaluation is chronological: features are trained on prior seasons, the market blend is calibrated on the next season, and metrics are reported on a later holdout. Historical closing lines are labeled as reference benchmarks because the data does not include a pregame timestamp for those prices. Historical observed weather and retrospectively listed starting quarterbacks are excluded from training until timestamped pregame snapshots are available. The candidate report is research output; production weights require a separate reviewed promotion.

The player projection diagnostic compares season-average, recent-average, and opportunity-times-efficiency point baselines using only earlier completed games. Its probability experiment estimates Over probability from past out-of-sample projection errors and compares that result with a smoothed prior Over-rate baseline. Thresholds are model-centered half-points because historical player-prop prices are unavailable. Results are research-only: beating a generic prior-rate benchmark does not establish accuracy at sportsbook lines or profitable betting value.

**Disclaimer:** Use for historical research, not guaranteed gambling outcomes or financial decisions.
