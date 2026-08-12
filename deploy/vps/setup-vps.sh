#!/usr/bin/env bash
set -Eeuo pipefail

# One-shot VPS bootstrap for the Reward Control API.
# Run as root on a fresh Ubuntu/Debian VPS:
#   APP_DIR=/opt/reward REPO_URL=https://github.com/tameruict/reward.git bash deploy/vps/setup-vps.sh

APP_DIR="${APP_DIR:-/opt/reward}"
REPO_URL="${REPO_URL:-https://github.com/tameruict/reward.git}"
BRANCH="${BRANCH:-main}"
RUN_USER="${RUN_USER:-reward}"
API_PORT="${API_PORT:-3010}"
ENV_FILE="$APP_DIR/.env"
UNIT_FILE="/etc/systemd/system/reward-api.service"

# A project below /root cannot be reached by the unprivileged service user
# because /root is normally mode 0700. Use /opt/reward for production; this
# fallback keeps the existing /root/Microsoft-Rewards-Script layout usable.
if [[ "$APP_DIR" == /root/* && "$RUN_USER" == "reward" ]]; then
    RUN_USER=root
fi

die() {
    echo "[setup] ERROR: $*" >&2
    exit 1
}

log() {
    echo "[setup] $*"
}

[[ "${EUID}" -eq 0 ]] || die "Run this script as root (sudo -i first)."

if [[ ! -f /etc/os-release ]]; then
    die "This script expects a Debian/Ubuntu-style Linux VPS."
fi

log "Installing base packages"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git gnupg openssl

if dpkg-query -W -f='${Status}' libnode-dev 2>/dev/null | grep -q 'install ok installed'; then
    log "Removing the old Ubuntu libnode-dev package to avoid the Node.js 12/24 file conflict"
    DEBIAN_FRONTEND=noninteractive apt-get remove -y libnode-dev
fi

NODE_MAJOR=0
if [[ -x /usr/bin/node ]]; then
    NODE_MAJOR="$(/usr/bin/node -p 'process.versions.node.split(".")[0]')"
fi
if (( NODE_MAJOR < 24 )); then
    log "Installing Node.js 24"
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

[[ -x /usr/bin/node ]] || die "/usr/bin/node was not installed"
(( $(/usr/bin/node -p 'process.versions.node.split(".")[0]') >= 24 )) || die "Node.js 24 or newer is required"

if ! command -v tailscale >/dev/null 2>&1; then
    log "Installing Tailscale"
    curl -fsSL https://tailscale.com/install.sh | sh
fi

TAILSCALE_IP="${VPS_TAILSCALE_IP:-}"
if [[ -z "$TAILSCALE_IP" ]]; then
    TAILSCALE_IP="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
fi
[[ -n "$TAILSCALE_IP" ]] || die "Tailscale is not logged in. Run 'tailscale up', then rerun this script, or set VPS_TAILSCALE_IP."

if [[ -e "$APP_DIR" && ! -d "$APP_DIR/.git" ]]; then
    die "$APP_DIR exists but is not a Git checkout. Choose another APP_DIR."
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
    log "Cloning $REPO_URL into $APP_DIR"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
    if [[ -n "$(git -C "$APP_DIR" status --porcelain)" ]]; then
        log "$APP_DIR has local changes; preserving them and skipping the normal git pull"
    else
        log "Updating existing checkout"
        git -C "$APP_DIR" fetch origin "$BRANCH"
        git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
    fi
fi

log "Writing VPS environment"
mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

read_env() {
    local key="$1"
    sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1
}

API_TOKEN="$(read_env API_TOKEN)"
ACCOUNTS_DB_KEY="$(read_env ACCOUNTS_DB_KEY)"
[[ -n "$API_TOKEN" ]] || API_TOKEN="$(openssl rand -hex 32)"
[[ -n "$ACCOUNTS_DB_KEY" ]] || ACCOUNTS_DB_KEY="$(openssl rand -hex 32)"

set_env() {
    local key="$1"
    local value="$2"
    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
    else
        printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    fi
}

set_env API_HOST "$TAILSCALE_IP"
set_env API_PORT "$API_PORT"
set_env API_TOKEN "$API_TOKEN"
set_env ACCOUNTS_DB_KEY "$ACCOUNTS_DB_KEY"
set_env ACCOUNTS_SOURCE "database"
set_env TZ "Asia/Ho_Chi_Minh"
set_env NODE_ENV "production"
set_env API_ALLOW_CONFIG_WRITE "false"
set_env API_ALLOW_CONFIG_REVEAL "false"
set_env API_ALLOW_SCHEDULE_WRITE "false"

if ! id -u "$RUN_USER" >/dev/null 2>&1; then
    useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin "$RUN_USER"
fi

log "Installing Node dependencies and building the worker"
cd "$APP_DIR"
if [[ -e "$APP_DIR/config.json" && -d "$APP_DIR/config.json" ]]; then
    die "$APP_DIR/config.json is a directory; remove it and create a JSON config file"
fi
if [[ ! -f "$APP_DIR/config.json" ]]; then
    [[ -f "$APP_DIR/config.example.json" ]] || die "Missing $APP_DIR/config.example.json"
    install -m 600 "$APP_DIR/config.example.json" "$APP_DIR/config.json"
    log "Created config.json from config.example.json"
fi
/usr/bin/npm ci
/usr/bin/npm run build

chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"
chmod 600 "$ENV_FILE"

log "Installing systemd service"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Reward worker Control API
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $APP_DIR/scripts/api/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now reward-api
sleep 2

if ! systemctl is-active --quiet reward-api; then
    systemctl status reward-api -l --no-pager || true
    journalctl -u reward-api -n 80 -l --no-pager || true
    die "reward-api did not start"
fi

log "Checking API health"
if ! curl -fsS --max-time 10 \
    -H "Authorization: Bearer $API_TOKEN" \
    "http://${TAILSCALE_IP}:${API_PORT}/health"; then
    echo
    journalctl -u reward-api -n 80 -l --no-pager || true
    die "The API is running but health check failed"
fi
echo

log "Checking account-management routes"
for endpoint in accounts proxies; do
    route_code="$(curl -sS -o /tmp/reward-api-${endpoint}.out -w '%{http_code}' \
        -H "Authorization: Bearer $API_TOKEN" \
        "http://${TAILSCALE_IP}:${API_PORT}/${endpoint}")"
    [[ "$route_code" != "404" ]] || die "API route /${endpoint} is missing (HTTP 404)"
    echo "/${endpoint}: HTTP ${route_code}"
done

import_probe_code="$(curl -sS -o /tmp/reward-api-import.out -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer $API_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"accounts":[]}' \
    "http://${TAILSCALE_IP}:${API_PORT}/accounts/import")"
[[ "$import_probe_code" != "404" ]] || die "API route /accounts/import is missing (HTTP 404)"
echo "/accounts/import probe: HTTP ${import_probe_code} (expected 400 for an empty payload)"

log "VPS setup completed"
echo "API URL: http://${TAILSCALE_IP}:${API_PORT}"
echo "Environment file: $ENV_FILE"
echo "For the local dashboard, set CONTROL_API_URL to the API URL and CONTROL_API_TOKEN to the API_TOKEN from $ENV_FILE."
