# GTI NAV
Flat-folder build: no folder is nested inside another folder beyond the four top-level folders shown below.

- src/
- public/
- server/
- workflows/

Run in Codespaces:
```bash
npm install
npm run dev
```
Open port 5173 for the app and 3001 for the convoy server.

Note: GitHub Actions only recognizes workflow files under `.github/workflows/`. This package keeps `pages.yml` in `/workflows` to honor the no-nested-folders requirement, so use GitHub Pages branch/root deployment or move that file later if you want Actions.
