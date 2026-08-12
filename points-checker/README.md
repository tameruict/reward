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

## Concurrency

Checks run in parallel, one lane per proxy. A "route" is a distinct proxy, identified by its egress IP when known and otherwise by its proxy identity — so proxies whose egress IP is still blank (e.g. auto-provisioned ones) are each treated as their own lane rather than collapsing onto one. Every route runs up to that proxy's `max_concurrency` (default `1`), and accounts beyond that limit on the same proxy are checked sequentially.

With `MAX_CONCURRENCY=auto` (the default), the worker pool scales to the sum of every in-use proxy's `max_concurrency` — i.e. full proxy-based concurrency. For example, 20 accounts spread across 6 proxies run 6 checks at a time. Set `MAX_CONCURRENCY` to a number to cap the pool (useful if launching that many headless browsers at once strains the machine).

The default database path is `../data/accounts.db`. Keep `ACCOUNTS_DB_KEY` identical to the value used by the parent bot when database credentials are encrypted.

## Safety model

- Each account uses its assigned proxy; there is no direct-network fallback.
- Accounts sharing a proxy are checked sequentially.
- The browser runs headless according to the parent `config.json`.
- Passwords, cookies, TOTP secrets, and proxy credentials are never returned by the API.
- Stopping a run cancels pending checks and lets an active browser check close normally.
