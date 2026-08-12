# Microsoft Point on Replit

This entrypoint preserves the existing Node.js worker and runs two local
processes: the Control API on loopback and the dashboard on Replit's public
`PORT`. The internal API token is generated in memory on every start.

Required Replit Secrets:

- `DASHBOARD_USERNAME`
- `DASHBOARD_PASSWORD`

The checked-in Replit profile may instead provide a strong scrypt password
hash and salt, keeping the plaintext password out of source and deployment
configuration. `DASHBOARD_PASSWORD` as a Secret overrides that hash.

Build command:

```sh
npm ci --ignore-scripts && npm run build && npx patchright install chromium
```

Run command:

```sh
npm run replit:start
```

The deployment package must not contain `.env`, `config.json`, account import
files, `data/`, `sessions/`, or `diagnostics/`. Start with an empty database;
accounts are imported only after deployment through the authenticated dashboard.
