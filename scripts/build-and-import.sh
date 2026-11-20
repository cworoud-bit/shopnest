#!/usr/bin/env bash
# Builds the 4 images and imports them straight into K3s' containerd (no registry needed).
set -euo pipefail
cd "$(dirname "$0")/.."
TAG=${TAG:-1.0.0}
for c in frontend user-service catalog-service order-service; do
  dir=$([ $c = frontend ] && echo frontend || echo services/$c)
  docker build -t shopnest/$c:$TAG $dir
  docker save shopnest/$c:$TAG | sudo k3s ctr images import -
done
