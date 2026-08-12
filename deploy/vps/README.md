# VPS deployment

This folder contains only deployment templates for the worker and Control API.
Account secrets and database files stay on the VPS and are never committed.

## One-command install

VPS là Linux nên dùng Bash, không dùng Windows `.cmd`. Trên VPS mới, đăng nhập
Tailscale trước (`tailscale up`), sau đó chạy:

```bash
sudo -i
APP_DIR=/opt/reward REPO_URL=https://github.com/tameruict/reward.git \
  bash deploy/vps/setup-vps.sh
```

Nếu muốn giữ đúng thư mục hiện tại của anh:

```bash
APP_DIR=/root/Microsoft-Rewards-Script \
  RUN_USER=root \
  bash deploy/vps/setup-vps.sh
```

Script tự cài Node.js 24, xử lý xung đột `libnode-dev` của Node 12, clone/cập
nhật code, đồng bộ bộ file account API phụ thuộc lẫn nhau, tạo `API_TOKEN` và
`ACCOUNTS_DB_KEY` nếu chưa có, cài dependency, build worker, tạo systemd
service, kiểm tra `/health`, `/accounts`, `/proxies` và `/accounts/import`.
Control API cũng tự dựng biến `ACCOUNT_N_*` từ database khi nhận lệnh chạy từ
dashboard, nên worker trên VPS dùng đúng các account đã lưu trong Account Manager.

## Check sau này

```bash
APP_DIR=/opt/reward bash deploy/vps/check-vps.sh
```

Script kiểm tra service, health API, các route account/proxy và thống kê SQLite
ở chế độ chỉ đọc. Không in password account.

## First install thủ công

```bash
git clone https://github.com/tameruict/reward.git /opt/reward
cd /opt/reward
npm ci
npx patchright install chromium
cp deploy/vps/.env.example .env
npm run accounts -- keygen
nano .env
cp config.example.json config.json
npm run build
npm run api
```

Set `API_HOST` to the VPS Tailscale IP, `API_TOKEN` to a long random value and
`ACCOUNTS_DB_KEY` to the generated database key. The local dashboard uses the
same `API_TOKEN` but never needs `ACCOUNTS_DB_KEY`.

## Update an existing VPS checkout

```bash
cd /opt/reward
git pull --ff-only origin main
npm ci
npm run build
sudo systemctl restart reward-api
```

Do not run `git clean` on the VPS because it
can remove the local database, sessions or configuration.

## systemd

Copy `systemd/reward-api.service` to `/etc/systemd/system/`, adjust `User` and
`WorkingDirectory` if necessary, then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now reward-api
sudo systemctl status reward-api
```

The Account Manager's Microsoft Rewards point column uses the VPS Control API
route `POST /accounts/:email/points-check`. It runs against the VPS database,
proxy and encrypted credentials, so a separate local points-checker service is
not required. Rebuild and restart `reward-api` after updating the API code.
