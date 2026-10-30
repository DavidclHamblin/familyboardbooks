# Family Board Books

Website for www.familyboardbooks.com, hosted on GitHub Pages.

- `assets/`  styles, scripts and book data (`assets/js/data.js` holds prices and book content)
- `src/build.py`  builds the site into `dist/` (`python3 src/build.py`)
- `dist/`  the published site (GitHub Pages serves this via the workflow in `.github/workflows/pages.yml`)

To connect the sign-up and reservation forms, set `formEndpoint` in `assets/js/data.js` and rebuild.
