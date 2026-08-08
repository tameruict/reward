# Account Manager

Local web app for managing the accounts used by
[microsoft-rewards-script](https://github.com/thenetsky/microsoft-rewards-script).
The dashboard is a local control plane. Account storage, browser sessions,
secrets and the worker process remain on the VPS Control API.

## Architecture

```text
Browser -> local dashboard (127.0.0.1:8890) -> VPS Control API (:3010) -> worker
```

The browser never receives `CONTROL_API_TOKEN`. Account passwords, TOTP
secrets and proxy passwords are forwarded to the VPS and are never returned by
the account list endpoint.

## Start the worker on the VPS

In the repository on the VPS, set `.env`:

```dotenv
API_HOST=0.0.0.0
API_PORT=3010
API_TOKEN=replace-with-a-long-random-token
```

Build and start the Control API:

```bash
npm run build
npm run api
```

Protect port `3010` with a firewall, VPN or TLS reverse proxy. Do not expose it
openly to the internet.

## Start the local dashboard

On the local machine:

```powershell
cd local-dashboard
Copy-Item '.env.example' '.env'
```

Edit `.env` and set the VPS address and the same token as the VPS:

```dotenv
CONTROL_API_URL=http://YOUR_VPS_HOST:3010
CONTROL_API_TOKEN=the-same-value-as-vps-api-token
PORT=8890
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=replace-with-a-strong-password
```

Start the dashboard:

```powershell
npm start
```

Open `http://127.0.0.1:8890`. Clicking **Chạy worker** starts the worker on the
VPS; nothing is executed on the local machine.

## Features

- Account table with search, status filter, pagination and selection
- Microsoft Rewards point column with a per-account check button (executed by the VPS Control API)
- Add one account or bulk import JSON / pipe-separated text
- Assign or detach VPS proxy records, enable/disable accounts, and delete rows
- Start/stop the VPS worker and view its remote log
- No local account database and no local worker process

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `CONTROL_API_URL` | `http://YOUR_VPS_HOST:3010` | VPS Control API URL |
| `CONTROL_API_TOKEN` | empty | Must match the VPS `API_TOKEN` |
| `DASHBOARD_USERNAME` | empty | Optional browser login username |
| `DASHBOARD_PASSWORD` | empty | Optional browser login password |
| `PORT` | `8890` | Local dashboard port |
| `TZ` | `Asia/Ho_Chi_Minh` | Local display timezone |

## Bulk input format

JSON is accepted directly. For text input, use one account per line:

```text
email@example.com | password | recovery@example.com | TOTP_SECRET | proxy-vn-01
```

The dashboard also accepts comma-separated lines. A blank proxy label means the
account uses direct traffic; configure a proxy when the VPS policy requires it.
