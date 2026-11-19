#!/usr/bin/env bash
# Provision the public demo server once. Idempotent; safe to re-run.
# Run from the owner's PC:   ssh vps 'bash -s' < infra/server/install.sh
# Needs a login with passwordless sudo. Touches only: the PostgreSQL 18 package (no cluster is created),
# Node under /opt, the `tsa` user, /opt/tsa-platform, /var/lib/tsa, /etc/tsa and the tsa-demo unit.
# It never touches nginx, firewall rules, Docker or any existing site.
set -euo pipefail

NODE_VERSION=24.18.0
NODE_SHA256=55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742
NODE_DIR=/opt/node-v${NODE_VERSION}
# The launcher refuses any PostgreSQL other than this exact version (src/local/postgres.mjs).
PG_PACKAGE_VERSION=18.6-1.pgdg22.04+2
APP_ROOT=/opt/tsa-platform
DATA_ROOT=/var/lib/tsa
CONFIG_ROOT=/etc/tsa

step() { printf '\n== %s\n' "$*"; }
sudo -n true || { echo 'This script needs passwordless sudo.' >&2; exit 1; }
[ "$(uname -m)" = x86_64 ] || { echo 'Only x86_64 is supported (Node tarball and PostgreSQL packages).' >&2; exit 1; }

step "Service user and folders"
getent passwd tsa >/dev/null || sudo useradd --system --home-dir "$DATA_ROOT" --shell /usr/sbin/nologin tsa
sudo install -d -o tsa -g tsa -m 700 "$DATA_ROOT"   # the launcher requires a private parent
sudo install -d -o tsa -g tsa -m 755 "$APP_ROOT" "$APP_ROOT/releases"
sudo install -d -o root -g tsa -m 750 "$CONFIG_ROOT"

step "Node $NODE_VERSION under $NODE_DIR (not on the system PATH)"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  curl -fsSL -o "$work/node.tar.xz" "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
  echo "$NODE_SHA256  $work/node.tar.xz" | sha256sum -c -
  sudo mkdir -p "$NODE_DIR"
  sudo tar -xJf "$work/node.tar.xz" -C "$NODE_DIR" --strip-components=1
fi
sudo ln -sfn "$NODE_DIR" /opt/node
/opt/node/bin/node --version
PATH=/opt/node/bin:$PATH /opt/node/bin/npm --version

step "PostgreSQL 18.6 binaries (official PGDG repository, held; no cluster, no service)"
if ! /usr/lib/postgresql/18/bin/postgres --version 2>/dev/null | grep -q ' 18\.6 '; then
  # No terminal exists on this connection: never let apt or dpkg ask a question.
  apt_get() { sudo env DEBIAN_FRONTEND=noninteractive apt-get -y -qq -o Dpkg::Options::=--force-confold "$@"; }
  apt_get update
  apt_get install ca-certificates curl gnupg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor --yes -o /usr/share/keyrings/postgresql-archive-keyring.gpg
  codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
  echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] https://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  apt_get update
  # Install the shared package first, then forbid the default cluster, so the server package creates none.
  apt_get install postgresql-common
  if ! grep -qs '^create_main_cluster *= *false' /etc/postgresql-common/createcluster.conf; then
    echo 'create_main_cluster = false' | sudo tee -a /etc/postgresql-common/createcluster.conf >/dev/null
  fi
  apt_get install --allow-downgrades "postgresql-18=$PG_PACKAGE_VERSION" "postgresql-client-18=$PG_PACKAGE_VERSION" "postgresql-18-jit=$PG_PACKAGE_VERSION"
fi
# Hold the packages so unattended upgrades cannot move the demo to a version the launcher rejects.
sudo apt-mark hold postgresql-18 postgresql-client-18 postgresql-18-jit >/dev/null
/usr/lib/postgresql/18/bin/postgres --version
if systemctl list-units --all --no-legend 'postgresql@*' | grep -q .; then
  echo 'NOTE: a PostgreSQL cluster unit exists on this host; review it, the demo does not use it.'
fi

step "Environment file (only created when missing)"
if [ ! -e "$CONFIG_ROOT/demo.env" ]; then
  sudo tee "$CONFIG_ROOT/demo.env" >/dev/null <<'EOF'
DEMO_PUBLIC=true
DEMO_PUBLIC_ORIGIN=https://tsa.smartnovi.tech
DEMO_UNI_PORT=4180
DEMO_OFFERING_DAYS=14
TRACK_B_DATA_DIRECTORY=/var/lib/tsa/track-b
TSA_IMAGE_STORE_DIRECTORY=/var/lib/tsa/track-b-images
PG_BIN=/usr/lib/postgresql/18/bin
# Required before the service can start. The text is shown to every student, so set the real wording:
# DEMO_UNI_SOURCE_CREDIT=
EOF
  sudo chown root:tsa "$CONFIG_ROOT/demo.env"
  sudo chmod 640 "$CONFIG_ROOT/demo.env"
fi

step "Done"
echo "Next: bash infra/server/release.sh <git tag or commit>, then infra/server/upload-bank.sh."
