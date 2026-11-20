#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/create-secrets.sh
kubectl apply -k k8s
kubectl -n shopnest rollout status statefulset/postgres statefulset/mongo --timeout=180s || true
for d in user-service catalog-service order-service frontend; do
  kubectl -n shopnest rollout status deploy/$d --timeout=180s
done
kubectl -n shopnest get pods,svc,ingress,hpa
