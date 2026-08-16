# karafriends

<img src="https://raw.githubusercontent.com/emmaworley/karafriends/master/icon.png" width="128" />

## Cloning

Do a shallow clone.

## Building

Dependencies

- Yarn
- Rust (desktop build only)

## Running

```sh
yarn install && yarn run-dev
```

## Web app

The web build runs the karaoke display, phone remote, GraphQL API, WebSocket
subscriptions, and downloaded media from one Node.js server. It does not
require Electron or the native Rust audio module.

```sh
yarn install
yarn run-web
```

For verbose server diagnostics with credentials and session tokens redacted:

```sh
yarn debug-web
```

To save the output in PowerShell, run
`yarn debug-web 2>&1 | Tee-Object data/server-debug.log`.

Browser error telemetry is disabled by default. To opt in, set
`KARAFRIENDS_SENTRY_DSN` before building the web clients. Set
`KARAFRIENDS_SENTRY_DEBUG=1` as well only when diagnosing the telemetry client
itself.

Then open:

- Room launcher: `http://localhost:8080/`
- Player: `http://localhost:8080/renderer/`
- Phone remote: `http://localhost:8080/remocon/`
- Health check: `http://localhost:8080/healthz`

The server listens on all network interfaces so phones on the same network can
scan the player QR code. The following environment variables are supported:

- `KARAFRIENDS_REMOCON_PORT`: HTTP port (default `8080`)
- `KARAFRIENDS_HOST`: bind address (default `0.0.0.0`)
- `KARAFRIENDS_PUBLIC_URL`: externally visible base URL used in room links
- `KARAFRIENDS_TRUST_PROXY`: set to `1` behind one trusted reverse proxy
- `KARAFRIENDS_DATA_DIR`: runtime data root (default: `./data`)
- `KARAFRIENDS_CONFIG_DIR`: configuration directory (default: `./data/config`)
- `KARAFRIENDS_MEDIA_DIR`: media and queue directory (default: `./data/media`)
- `KARAFRIENDS_RESOURCE_DIR`: runtime tools directory (default: `./data/resources`)
- `KARAFRIENDS_EXTRA_RESOURCES_DIR`: directory containing `7za`/`7za.exe`
- `KARAFRIENDS_WEB_ROOT`: built client asset directory (default `build/web`)

The first web launch creates `data/config/config.yaml` under the project root.
Add service credentials there before using the corresponding DAM or Joysound
features. The entire `data` directory is ignored by Git. Set
`KARAFRIENDS_DATA_DIR` to move all writable runtime data to a persistent volume,
or use the individual directory overrides when needed.

For an internet deployment, terminate HTTPS at a reverse proxy, set
`KARAFRIENDS_PUBLIC_URL` to the public `https://` origin, and persist the config,
media, and resource directories. New rooms receive a random 128-bit identifier;
their queue, playback state, and live events are isolated from other rooms.

The web player uses Web Audio for playback and microphone pitch detection.
Browser microphone access requires a secure context (`https://`) except on
`localhost`; the player asks for permission only after **Enable microphone** is
pressed. Electron continues to use its native low-latency audio implementation.

### Linux systemd service

After building the web app, install it as a system service from the repository
root:

```sh
yarn install --immutable
yarn build-web
sudo ./scripts/install-systemd.sh
```

The installer runs the service as the user who invoked `sudo`, enables it at
boot, and starts it immediately. It can be run again after moving the project
or changing the Node.js installation. Useful commands:

```sh
sudo systemctl status karafriends
sudo systemctl restart karafriends
journalctl -u karafriends -f
```

Edit `/etc/karafriends/karafriends.env` for the port, public URL, or reverse
proxy settings, then restart the service. Service credentials remain in
`data/config/config.yaml`. To install without immediately starting the server,
pass `--no-start`; see `./scripts/install-systemd.sh --help` for user, Node.js,
and service-name overrides.
