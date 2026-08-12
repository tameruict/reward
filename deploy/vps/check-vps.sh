#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/reward}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

echo "== service =="
systemctl is-active reward-api || true
systemctl status reward-api --no-pager -l | sed -n '1,18p'

echo
echo "== health =="
curl -fsS --max-time 10 \
  -H "Authorization: Bearer ${API_TOKEN}" \
  "http://${API_HOST}:${API_PORT:-3010}/health"
echo

echo
echo "== account API route checks =="
for endpoint in accounts proxies; do
    code="$(curl -sS -o /tmp/reward-api-check.out -w '%{http_code}' \
      -H "Authorization: Bearer ${API_TOKEN}" \
      "http://${API_HOST}:${API_PORT:-3010}/${endpoint}")"
    echo "/${endpoint}: HTTP ${code}"
done

import_code="$(curl -sS -o /tmp/reward-api-import-check.out -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"accounts":[]}' \
  "http://${API_HOST}:${API_PORT:-3010}/accounts/import")"
echo "/accounts/import probe: HTTP ${import_code} (400 is expected for an empty payload)"
[[ "$import_code" != "404" ]] || { echo "Missing /accounts/import route" >&2; exit 1; }

echo
echo "== database summary =="
DB_PATH="${ACCOUNTS_DB_PATH:-$APP_DIR/data/accounts.db}"
if [[ ! -f "$DB_PATH" ]]; then
    echo "Database not created yet: $DB_PATH"
    exit 0
fi

DB_PATH="$DB_PATH" /usr/bin/node --input-type=module -e '
import { DatabaseSync } from "node:sqlite"
const db = new DatabaseSync(process.env.DB_PATH, { readOnly: true })
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = '\''table'\'' ORDER BY name").all()
console.log("DB:", process.env.DB_PATH)
console.log("Tables:", tables.map(row => row.name).join(", ") || "none")
try {
  console.table(db.prepare("SELECT status, COUNT(*) AS total FROM accounts GROUP BY status ORDER BY status").all())
  console.log("Total:", db.prepare("SELECT COUNT(*) AS total FROM accounts").get().total)
} catch (error) {
  console.log("Accounts table not available:", error.message)
}
db.close()
'
