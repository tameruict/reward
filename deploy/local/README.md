# Local dashboard deployment

The local dashboard is a client for the VPS Control API. It does not run the
worker and does not need the account database key.

```powershell
cd local-dashboard
Copy-Item ".env.example" ".env"
notepad ".env"
npm start
```

Set `CONTROL_API_URL` to the VPS Tailscale address and
`CONTROL_API_TOKEN` to the VPS `API_TOKEN`.
