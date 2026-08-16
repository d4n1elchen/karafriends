#!/usr/bin/env bash

set -euo pipefail

SERVICE_NAME="karafriends"
SERVICE_USER="${SUDO_USER:-}"
NODE_BIN=""
START_SERVICE=1

usage() {
  cat <<'EOF'
Install the Karafriends web server as a systemd service.

Usage:
  sudo ./scripts/install-systemd.sh [options]

Options:
  --user USER          Account that will run the service (default: sudo user)
  --node PATH          Node.js executable (default: node found in PATH)
  --service-name NAME  systemd unit name (default: karafriends)
  --no-start           Install and enable the unit without starting it
  -h, --help           Show this help

Run `yarn build-web` before this installer.
EOF
}

while (($#)); do
  case "$1" in
    --user)
      [[ $# -ge 2 ]] || { echo "--user requires a value" >&2; exit 2; }
      SERVICE_USER="$2"
      shift 2
      ;;
    --node)
      [[ $# -ge 2 ]] || { echo "--node requires a value" >&2; exit 2; }
      NODE_BIN="$2"
      shift 2
      ;;
    --service-name)
      [[ $# -ge 2 ]] || { echo "--service-name requires a value" >&2; exit 2; }
      SERVICE_NAME="$2"
      shift 2
      ;;
    --no-start)
      START_SERVICE=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer only supports Linux." >&2
  exit 1
fi

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer with sudo: sudo ./scripts/install-systemd.sh" >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl was not found; this machine does not appear to use systemd." >&2
  exit 1
fi

if [[ -z "$SERVICE_USER" || "$SERVICE_USER" == "root" ]]; then
  echo "Refusing to run Karafriends as root. Pass --user with a non-root account." >&2
  exit 1
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Service user does not exist: $SERVICE_USER" >&2
  exit 1
fi

if [[ ! "$SERVICE_NAME" =~ ^[A-Za-z0-9_.@-]+$ ]]; then
  echo "Invalid service name: $SERVICE_NAME" >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
SERVER_ENTRY="$PROJECT_ROOT/build/web/web-server/index.js"
PNP_LOADER="$PROJECT_ROOT/.pnp.cjs"
PNP_ESM_LOADER="$PROJECT_ROOT/.pnp.loader.mjs"
DATA_DIR="$PROJECT_ROOT/data"

if [[ ! -f "$SERVER_ENTRY" ]]; then
  echo "The web server has not been built: $SERVER_ENTRY" >&2
  echo "Run 'yarn install --immutable && yarn build-web' as your normal user first." >&2
  exit 1
fi

if [[ ! -f "$PNP_LOADER" || ! -f "$PNP_ESM_LOADER" ]]; then
  echo "Yarn's dependency loaders were not found under $PROJECT_ROOT" >&2
  echo "Run 'yarn install --immutable' as your normal user first." >&2
  exit 1
fi

if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "A Node.js executable was not found. Install Node.js or pass --node PATH." >&2
  exit 1
fi
NODE_BIN="$(readlink -f -- "$NODE_BIN")"

SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
UNIT_PATH="/etc/systemd/system/$SERVICE_NAME.service"
ENV_DIR="/etc/$SERVICE_NAME"
ENV_PATH="$ENV_DIR/$SERVICE_NAME.env"

# Escape a filesystem path as an unquoted systemd directive value. Some older
# systemd releases treat quotes literally for path-only directives such as
# WorkingDirectory=, so use C-style escapes instead of surrounding quotes.
systemd_path() {
  local value="$1"
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    echo "Paths containing newlines are not supported: $value" >&2
    exit 1
  fi
  value="${value//\\/\\\\}"
  value="${value//%/%%}"
  value="${value// /\\x20}"
  value="${value//$'\t'/\\x09}"
  value="${value//\"/\\x22}"
  value="${value//\'/\\x27}"
  printf '%s' "$value"
}

PROJECT_ROOT_Q="$(systemd_path "$PROJECT_ROOT")"
SERVER_ENTRY_Q="$(systemd_path "$SERVER_ENTRY")"
PNP_LOADER_Q="$(systemd_path "$PNP_LOADER")"
PNP_ESM_LOADER_Q="$(systemd_path "$PNP_ESM_LOADER")"
DATA_DIR_Q="$(systemd_path "$DATA_DIR")"
NODE_BIN_Q="$(systemd_path "$NODE_BIN")"
ENV_PATH_Q="$(systemd_path "$ENV_PATH")"

install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0750 "$DATA_DIR"
install -d -o root -g "$SERVICE_GROUP" -m 0750 "$ENV_DIR"

if [[ ! -e "$ENV_PATH" ]]; then
  cat >"$ENV_PATH" <<EOF
# Environment overrides for Karafriends. Edit this file, then run:
#   sudo systemctl restart $SERVICE_NAME
KARAFRIENDS_HOST=0.0.0.0
KARAFRIENDS_REMOCON_PORT=8080
# KARAFRIENDS_ADMIN_PASSWORD=replace-with-a-long-password
# KARAFRIENDS_PUBLIC_URL=https://karaoke.example.com
# KARAFRIENDS_TRUST_PROXY=1
EOF
  chown root:"$SERVICE_GROUP" "$ENV_PATH"
  chmod 0640 "$ENV_PATH"
fi

UNIT_TMP="$(mktemp)"
trap 'rm -f -- "$UNIT_TMP"' EXIT
cat >"$UNIT_TMP" <<EOF
[Unit]
Description=Karafriends web karaoke server
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$PROJECT_ROOT_Q
Environment=NODE_ENV=production
Environment=KARAFRIENDS_DATA_DIR=$DATA_DIR_Q
EnvironmentFile=-$ENV_PATH_Q
ExecStart=$NODE_BIN_Q --require $PNP_LOADER_Q --experimental-loader $PNP_ESM_LOADER_Q $SERVER_ENTRY_Q
Restart=on-failure
RestartSec=5s
TimeoutStopSec=20s
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$DATA_DIR_Q

[Install]
WantedBy=multi-user.target
EOF

install -o root -g root -m 0644 "$UNIT_TMP" "$UNIT_PATH"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME.service"

if ((START_SERVICE)); then
  systemctl restart "$SERVICE_NAME.service"
  echo
  systemctl --no-pager --full status "$SERVICE_NAME.service" || true
else
  echo "Installed and enabled $SERVICE_NAME.service without starting it."
fi

echo
echo "Unit:        $UNIT_PATH"
echo "Environment: $ENV_PATH"
echo "Data:        $DATA_DIR"
echo "Logs:        journalctl -u $SERVICE_NAME -f"
