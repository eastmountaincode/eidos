# Eidos repository rules

- Treat `https://github.com/eastmountaincode/eidos` and its `main` branch as the production source of truth.
- Do not deploy or promote Eidos to Vercel with the CLI. Commit and push the complete change, then let the existing Vercel Git integration deploy it.
- Never deploy from a dirty working tree.
- Keep portal and Cloudflare Worker changes in the same Git commit when they depend on one another.
- Before pushing, run the root production build and the tests in `apps/api`.
- Deploy the Cloudflare Worker only from the clean committed revision, then verify `/api/sources`, `/api/future-events`, and that unchanged message snapshots write no conversations or messages.
