#!/usr/bin/env bash
# Replace the server's private Bank with the owner's local one. Runs on the owner's PC.
#   bash infra/server/upload-bank.sh            (SSH_TARGET defaults to `vps`)
# The server keeps the previous Bank in /var/lib/tsa/*.previous for rollback. The local Bank is only read.
set -euo pipefail

SSH_TARGET=${SSH_TARGET:-vps}
cd "$(git rev-parse --show-toplevel)"
BANK=.local/track-b
IMAGES=.local/track-b-images
STAGE=/var/tmp/tsa-incoming

[ -f "$BANK/.tsa-track-b-cluster" ] || { echo "No private Bank at $BANK" >&2; exit 1; }
[ -d "$IMAGES" ] || { echo "No image store at $IMAGES" >&2; exit 1; }
[ ! -e "$BANK/postmaster.pid" ] || { echo "The local Bank is open ($BANK/postmaster.pid). Stop demo:uni and the Bank server first." >&2; exit 1; }

stamp=$(date +%y%m%d-%H%M%S)
echo "Local safety copy: .local/track-b-backups/pre-upload-$stamp"
cp -a "$BANK" ".local/track-b-backups/pre-upload-$stamp"

echo "Uploading to $SSH_TARGET:$STAGE"
ssh "$SSH_TARGET" "mkdir -p $STAGE"
rsync -a --delete --exclude postmaster.pid "$BANK/" "$SSH_TARGET:$STAGE/track-b/"
rsync -a --delete "$IMAGES/" "$SSH_TARGET:$STAGE/track-b-images/"

ssh "$SSH_TARGET" 'bash -s' -- "$STAGE" "$stamp" <<'REMOTE'
set -euo pipefail
stage=$1 stamp=$2 root=/var/lib/tsa
running=false
if systemctl is-active --quiet tsa-demo; then running=true; sudo -n systemctl stop tsa-demo; fi
for name in track-b track-b-images; do
  if [ -e "$root/$name" ]; then
    sudo -n rm -rf "$root/$name.previous"
    sudo -n mv "$root/$name" "$root/$name.previous"
  fi
  sudo -n mv "$stage/$name" "$root/$name"
  sudo -n chown -R tsa:tsa "$root/$name"
done
sudo -n chmod 700 "$root/track-b"
sudo -n rm -rf "$stage"
if $running || [ -f /etc/systemd/system/tsa-demo.service ]; then sudo -n systemctl start tsa-demo; fi
echo "Bank installed at $stamp. Previous copy kept in $root/*.previous"
REMOTE
