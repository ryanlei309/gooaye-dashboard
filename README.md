# Stocks mentioned on the Gooaye podcast: did they beat the market?
# 謝孟恭提到的股票，後來贏過大盤嗎？

Site: https://ryanlei309.github.io/gooaye-dashboard/ (English: https://ryanlei309.github.io/gooaye-dashboard/en/)

Unofficial. Not affiliated with the show or its host. Not investment advice.
非官方網站，與節目及主持人無關，內容不構成投資建議。

## What is in this repo

- `site/`: the static site (no tracking, no forms, no requests to other sites).
- `config/site_config.json`: fixed inputs exported from a private research project: each stock's first mention
  (episode, date, entry day), a one- or two-sentence quote, its AI translation, and the stocks counted as −100%
  in the worst case. Transcripts and the research database are not published.
- `build/update.py`: fetches adjusted daily prices (Yahoo Finance; Nasdaq for WOLF), checks them, recomputes every
  price-based number, and writes the site.
- `.github/workflows/update.yml`: runs the build Monday to Saturday (Taipei time) and deploys to GitHub Pages.
  Daily price data is deployed, not committed. If anything looks wrong, the build stops and the previous version stays up.

How the stocks were found, and the method and its limits, are explained on the site ("How I built this", "Method").
