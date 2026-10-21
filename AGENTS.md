# Agent rules – SKDR Indonesia
- No crawling/scraping/NLP in this project. Data comes only from the case report form.
- No hardcoded config: use `.env` (see `.env.example`) and DB tables/migrations (`database/init`).
- Never commit `.env` or print secrets.
- Every change: add a row in `docs/CHANGE_LOG_MATRIX.md` and a file in `docs/PR/`.
- UI text in English.
- Local git only until a remote is decided by Yosua.
