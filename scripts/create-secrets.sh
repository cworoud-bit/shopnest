#!/usr/bin/env bash
# Idempotent: never overwrites an existing secret (DB passwords are fixed at first DB init).
set -euo pipefail
NS=shopnest
kubectl get ns $NS >/dev/null 2>&1 || kubectl create ns $NS
exists() { kubectl -n $NS get secret "$1" >/dev/null 2>&1; }

if ! exists postgres-credentials; then
  kubectl -n $NS create secret generic postgres-credentials \
    --from-literal=username=shop --from-literal=password="$(openssl rand -hex 16)"
fi
if ! exists mongo-credentials; then
  P=$(openssl rand -hex 16)
  kubectl -n $NS create secret generic mongo-credentials \
    --from-literal=username=shop --from-literal=password="$P" \
    --from-literal=url="mongodb://shop:${P}@mongo:27017/?authSource=admin"
fi
if ! exists jwt-secret; then
  kubectl -n $NS create secret generic jwt-secret --from-literal=secret="$(openssl rand -hex 32)"
fi
echo "Secrets OK in namespace $NS"
