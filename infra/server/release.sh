#!/usr/bin/env bash
# Build a release archive from a committed ref and deploy it. Runs on the owner's PC.
#   bash infra/server/release.sh <git tag or commit>      (SSH_TARGET defaults to `vps`)
set -euo pipefail

REF=${1:?git tag or commit to deploy}
SSH_TARGET=${SSH_TARGET:-vps}
cd "$(git rev-parse --show-toplevel)"
commit=$(git rev-parse --verify "$REF^{commit}")
release=$(git describe --tags --always "$commit" | tr '/' '-')
archive=$(mktemp --suffix=.tar.gz)
trap 'rm -f "$archive"' EXIT

echo "Packing $release ($commit)"
git archive --format=tar.gz -o "$archive" "$commit"
remote=/var/tmp/tsa-release-$release.tar.gz
scp -q "$archive" "$SSH_TARGET:$remote"
ssh "$SSH_TARGET" 'bash -s' -- "$release" "$remote" < infra/server/deploy.sh
