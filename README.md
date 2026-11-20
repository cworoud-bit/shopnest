# ShopNest — microservices demo on K3s

A small online shop: **1 frontend + 3 microservices + 2 databases (SQL & NoSQL)**, containerized with Docker and deployed on a **K3s** cluster following Kubernetes best practices.

```
                        ┌────────────── K3s cluster (namespace: shopnest) ───────────────┐
  Browser ──► Traefik ──┤  /            → frontend (nginx)         x2                    │
  (Ingress)             │  /api/users   → user-service    ──────┐                        │
                        │  /api/products→ catalog-service ──┐   ├──► PostgreSQL (SQL)    │
                        │  /api/orders  → order-service ────┼───┘     usersdb | ordersdb │
                        │                       └── HTTP ───┘   └──► MongoDB (NoSQL)     │
                        └─────────────────────────────────────────────────────────────────┘
```

| Component | Tech | Storage | Role |
|---|---|---|---|
| frontend | nginx-unprivileged + vanilla JS | – | SPA: browse, register/login, cart, orders |
| user-service | Node/Express | PostgreSQL `usersdb` | register / login, issues JWT |
| catalog-service | Node/Express | **MongoDB** `catalog` | product catalogue (seeded on first start) |
| order-service | Node/Express | PostgreSQL `ordersdb` | validates JWT, fetches prices from catalog-service, stores orders |

Database-per-service: each SQL service has its own logical database (separate DBs in one Postgres instance for this small cluster).

## Run locally (Docker Compose)
```bash
docker compose up --build      # http://localhost:8080
```

## Deploy on K3s
```bash
# 1. Install K3s (ships Traefik, metrics-server, local-path storage)
curl -sfL https://get.k3s.io | sh -
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# 2. Build images and import into K3s (or use the GHCR images built by CI, see k8s/kustomization.yaml)
./scripts/build-and-import.sh

# 3. Create secrets + apply manifests
./scripts/deploy.sh

# 4. Open http://<node-ip>/
```
Quick API check: `curl http://<node-ip>/api/products`

## Kubernetes best practices applied
- **Namespace isolation** + `ResourceQuota` + `LimitRange`; Pod Security labels (`baseline` enforced, `restricted` warned).
- **Secrets kept out of Git** – created by `scripts/create-secrets.sh`; non-sensitive config in a `ConfigMap`.
- **StatefulSets + PVC** (`local-path`) for Postgres and MongoDB; headless services; DB auth enabled.
- **Health probes**: startup, readiness (checks DB connectivity) and liveness on every workload.
- **Resource requests & limits** on every container.
- **Hardened pods**: non-root, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, all capabilities dropped, `seccomp: RuntimeDefault`, dedicated ServiceAccounts with token automount disabled.
- **High availability**: 2 replicas, zero-downtime `RollingUpdate` (`maxUnavailable: 0`), `preStop` + graceful SIGTERM handling, topology spread, `PodDisruptionBudget`.
- **Autoscaling**: `HorizontalPodAutoscaler` (CPU 70 %) on all stateless services.
- **Zero-trust networking**: default-deny `NetworkPolicy`; only Traefik → app pods, only the SQL services → Postgres, only catalog → Mongo, only order → catalog.
- **Ingress** path-based routing through K3s' built-in Traefik; **Kustomize** for declarative deploys.
- **Images**: multi-stage builds, alpine bases, non-root user, pinned tags (no `:latest` in manifests), `.dockerignore`, container HEALTHCHECK.
- **CI** (GitHub Actions): builds/pushes the 4 images to GHCR and renders the manifests.

## Possible next steps
TLS via cert-manager, Postgres/Mongo replication or operators, backups (CronJob + `pg_dump`/`mongodump`), Prometheus/Grafana, Sealed Secrets or External Secrets, image signing/scanning.
