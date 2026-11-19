#!/usr/bin/env bash
# Install one release on the server and switch the service to it. Runs ON the server.
# Normally started by release.sh:   ssh vps 'bash -s' -- <release> <archive> < infra/server/deploy.sh
set -euo pipefail

RELEASE=${1:?release name}
ARCHIVE=${2:?path to the release tar.gz}
APP_ROOT=/opt/tsa-platform
TARGET=$APP_ROOT/releases/$RELEASE
cd /
export PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin

[[ $RELEASE =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Release names may use letters, digits, dot, dash and underscore only.' >&2; exit 1; }
[ -x /opt/node/bin/node ] || { echo 'Run install.sh first.' >&2; exit 1; }
[ -f "$ARCHIVE" ] || { echo "Missing archive $ARCHIVE" >&2; exit 1; }

as_tsa() { sudo -n -u tsa env HOME=/var/lib/tsa PATH="$PATH" "$@"; }

if [ -e "$TARGET" ]; then
  echo "Release $RELEASE already exists; reusing it."
else
  sudo -n install -d -o tsa -g tsa "$TARGET"
  # The archive is read by deploy and unpacked as tsa.
  sudo -n -u tsa tar -xzf - -C "$TARGET" < "$ARCHIVE"
  cd "$TARGET"
  as_tsa npm ci --ignore-scripts --no-audit --no-fund
  as_tsa npm run build
  as_tsa npm --prefix apps/candidate-web ci --ignore-scripts --no-audit --no-fund
  as_tsa npm run build:student
fi

previous=$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)
sudo -n ln -sfn "$TARGET" "$APP_ROOT/current"
echo "current -> $TARGET (previous: ${previous:-none})"

if [ -f /etc/systemd/system/tsa-demo.service ]; then
  sudo -n systemctl restart tsa-demo
  echo 'Service restarted.'
else
  echo 'tsa-demo.service is not installed yet; see the runbook.'
fi

# Keep the three newest releases plus the one in use.
cd "$APP_ROOT/releases"
ls -1t | tail -n +4 | while read -r old; do
  [ "$(readlink -f "$old")" = "$(readlink -f "$APP_ROOT/current")" ] || sudo -n rm -rf -- "$old"
done
rm -f "$ARCHIVE"
