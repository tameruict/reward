# Rewards Dashboard

A local web dashboard for
[microsoft-rewards-script](https://github.com/thenetsky/microsoft-rewards-script).
It connects to the bot's Control API over HTTP and shows account status, point
totals, trends, logs, run history, schedules, configuration, and diagnostics.

## Requirements

- Node.js 22.13 or newer
- A local or reachable `microsoft-rewards-script` checkout
- The bot built at least once with `npm run build`

The dashboard uses only Node.js built-ins and has no package dependencies.

## Start the bot Control API

In the `microsoft-rewards-script` directory, add these values to its `.env`:

```dotenv
API_HOST=127.0.0.1
API_PORT=3010
API_TOKEN=replace-with-a-long-random-token
API_ALLOW_CONFIG_WRITE=true
API_ALLOW_CONFIG_REVEAL=false
```

Generate a strong token with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Build and start the API:

```bash
npm run build
npm run api
```

The API is available at `http://127.0.0.1:3010` by default.

## Start the dashboard

From this repository:

```bash
cd rewards-dashboard
cp ../.env.example .env
```

On Windows PowerShell, use:

```powershell
cd rewards-dashboard
Copy-Item '..\.env.example' '.env'
```

Edit `.env` and set `CONTROL_API_TOKEN` to the same value as the bot's
`API_TOKEN`, then start the dashboard:

```bash
npm start
```

Open `http://127.0.0.1:8890`.

## Authentication

`CONTROL_API_TOKEN` protects communication between the dashboard and the bot.
It must exactly match the bot's `API_TOKEN`.

Browser login protection is separate. Set both values to enable it:

```dotenv
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=replace-with-a-strong-password
```

If either value is empty, the browser login prompt is disabled.

## Features

- **Overview** — balances, run status, errors, schedule, and recent activity
- **Accounts** — per-account balance, gains, streaks, and history
- **Logs** — live SSE log viewer with filters, search, and download
- **Runs** — point history and process exits
- **Schedule** — local cron scheduling with missed-run recovery
- **Config** — safe partial edits to the bot's `config.json`
- **Diagnostics** — error details, screenshots, and captured HTML

The scheduler runs inside the dashboard process. Keep the dashboard running for
scheduled jobs. Its state and history are stored in `data/dashboard.sqlite`.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `CONTROL_API_URL` | `http://127.0.0.1:3010` | Bot Control API URL |
| `CONTROL_API_TOKEN` | empty | Must match the bot's `API_TOKEN` |
| `DASHBOARD_USERNAME` | empty | Optional browser login username |
| `DASHBOARD_PASSWORD` | empty | Optional browser login password |
| `PORT` | `8890` | Dashboard HTTP port |
| `TZ` | `UTC` | Timezone for daily point buckets and schedules |
| `DASHBOARD_TITLE` | `Microsoft Rewards` | Header title |
| `POLL_MS` | `5000` | Status polling interval in milliseconds |
| `LOG_REPLAY` | `300` | Past log lines loaded when the stream connects |
| `DATA_DIR` | `./data` | SQLite history and schedule directory |

## Troubleshooting

**Control API unreachable** — confirm `npm run api` is still running and that
`CONTROL_API_URL` points to the correct host and port.

**Control API rejected our token** — make `CONTROL_API_TOKEN` exactly match
`API_TOKEN` and restart both processes.

**Saving config returns 403** — set `API_ALLOW_CONFIG_WRITE=true` on the bot and
restart its Control API.

**Daily bars roll over at the wrong time** — set `TZ`, for example
`Asia/Ho_Chi_Minh`.

**A scheduled run did not fire** — the dashboard process must remain running.
Check the Schedule tab's missed-run policy and last result.
