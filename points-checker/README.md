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

By default, each active proxy route gets one concurrent check worker. Accounts sharing the same proxy are still checked sequentially. Set `MAX_CONCURRENCY` to a number to cap the number of workers, or leave it as `auto` for full proxy-based concurrency.

The default database path is `../data/accounts.db`. Keep `ACCOUNTS_DB_KEY` identical to the value used by the parent bot when database credentials are encrypted.

## Safety model

- Each account uses its assigned proxy; there is no direct-network fallback.
- Accounts sharing a proxy are checked sequentially.
- The browser runs headless according to the parent `config.json`.
- Passwords, cookies, TOTP secrets, and proxy credentials are never returned by the API.
- Stopping a run cancels pending checks and lets an active browser check close normally.
