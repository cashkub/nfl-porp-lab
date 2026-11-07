# 5-step launch checklist

- [ ] Unzip `nfl-prop-lab.zip` on your computer.
- [ ] Create a new, empty GitHub repository; upload the *contents* of the folder (including `.github/workflows/update-stats.yml`) or use GitHub Desktop.
- [ ] In your GitHub repository, choose **Actions → Update NFL Data → Run workflow**. Confirm it finishes and commits `public/data/stats.json` with `"status": "ready"`.
- [ ] Connect the repo to **Cloudflare Pages**; build command `npm run build`, output `dist`, root `/`, Node 22 if needed.
- [ ] Open the free Cloudflare URL. Search an NFL player and adjust the line; confirm the demo banner is gone.

Trouble? Read README.md for screenshots-free, detailed instructions and troubleshooting.
