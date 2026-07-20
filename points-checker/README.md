# Microsoft Rewards Points Checker

Local, Node.js-only dashboard for reading Microsoft Rewards balances. It uses the existing `data/accounts.db`, assigned proxies, saved browser sessions, and login implementation from the parent bot. It does not run searches, claims, activities, punch cards, or other point-earning tasks.

## Start

Build the parent project once, then start this dashboard:

```powershell
cd "E:\Tài Liệu Học Tập - Kiếm Tiền"
npm run build
cd points-checker
Copy-Item .env.example .env
npm start
```

Open <http://127.0.0.1:8891>.

The default database path is `../data/accounts.db`. Keep `ACCOUNTS_DB_KEY` identical to the value used by the parent bot when database credentials are encrypted.

When a valid mobile session is already saved, a point check reads `/api/getuserinfo` directly and skips Chromium/login/bootstrap. Set `MAX_CONCURRENCY` to the number of proxy routes your machine can handle; accounts sharing one proxy remain serialized automatically. The default is 6.

## Safety model

- Each account uses its assigned proxy; there is no direct-network fallback.
- Accounts sharing a proxy are checked sequentially.
- The browser runs headless according to the parent `config.json`.
- Passwords, cookies, TOTP secrets, and proxy credentials are never returned by the API.
- Stopping a run cancels pending checks and lets an active browser check close normally.
