# paraggupta103.github.io

Personal portfolio of Parag Gupta, hosted on GitHub Pages.

## What's on the site

- **Hero:** a three.js scene of a data pipeline (sources → ETL → checks → warehouse). Send a bad batch to watch the checks quarantine it.
- **Journey:** a three.js globe that flies between each role as you scroll.
- **Demos:** simple, playable mockups of my projects: MotoLens (beat the model), the stock market data warehouse (run and break an Airflow DAG), and NYC taxi analytics (pickups by hour and the 12 s → 0.8 s query).
- **Playground:** side projects in an 8-bit style, plus a live feed of recent pushes from the GitHub API.
- **Terminal:** press `` ` `` anywhere (or the `>_` button) and type `help`.

## Structure

```
index.html                 page markup
assets/css/site.css        styles (light and dark themes via prefers-color-scheme)
assets/js/site.js          three.js scenes, demos, terminal
assets/img/                images
resume.pdf                 linked from the hero and contact section
```

No build step. three.js (r128) loads from cdnjs and fonts from Google Fonts.

## Run locally

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Editing content

- Roles on the globe: the `STOPS` array (coordinates) in `site.js` and the matching `.stop` cards in `index.html`.
- Side projects: the `SIDE` array in `site.js`.
- Terminal text: the `FILES` object in `site.js`.
