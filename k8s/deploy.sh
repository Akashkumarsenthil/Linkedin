#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# LinkedIn Platform — Kubernetes Deployment Script
# ──────────────────────────────────────────────────────────────
# Applies all manifests in dependency order.
#
# Prerequisites:
#   1. kubectl configured to point at your EKS cluster
#   2. Backend and frontend images pushed to ECR (or available locally)
#   3. AWS Load Balancer Controller installed (for Ingress)
#
# Usage:
#   ./deploy.sh                    # Deploy everything
#   ./deploy.sh --dry-run=client   # Preview without applying
# ──────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTRA_ARGS="${*:-}"

echo "═══════════════════════════════════════════════════════════"
echo "  LinkedIn Platform — Deploying to Kubernetes"
echo "═══════════════════════════════════════════════════════════"

# 1. Namespace (must exist before anything else)
echo "► Creating namespace..."
kubectl apply -f "$SCRIPT_DIR/namespace.yaml" $EXTRA_ARGS

# 2. Configuration and secrets
echo "► Applying ConfigMap and Secrets..."
kubectl apply -f "$SCRIPT_DIR/configmap.yaml" $EXTRA_ARGS
kubectl apply -f "$SCRIPT_DIR/secrets.yaml" $EXTRA_ARGS

# 3. Data stores (must be ready before the backend starts)
echo "► Deploying data stores (MySQL, MongoDB, Redis, Kafka)..."
kubectl apply -f "$SCRIPT_DIR/mysql.yaml" $EXTRA_ARGS
kubectl apply -f "$SCRIPT_DIR/mongodb.yaml" $EXTRA_ARGS
kubectl apply -f "$SCRIPT_DIR/redis.yaml" $EXTRA_ARGS
kubectl apply -f "$SCRIPT_DIR/kafka.yaml" $EXTRA_ARGS

# 4. Ollama (LLM server — optional, backend falls back to regex parsing)
echo "► Deploying Ollama..."
kubectl apply -f "$SCRIPT_DIR/ollama.yaml" $EXTRA_ARGS

# 5. Wait for data stores to be ready
echo "► Waiting for data stores to become ready..."
kubectl -n linkedin-platform wait --for=condition=available --timeout=120s \
  deployment/mysql deployment/mongodb deployment/redis deployment/kafka 2>/dev/null || \
  echo "  (Some data stores may still be starting — backend has retry logic)"

# 6. Backend
echo "► Deploying backend..."
kubectl apply -f "$SCRIPT_DIR/backend.yaml" $EXTRA_ARGS

# 7. Frontend
echo "► Deploying frontend..."
kubectl apply -f "$SCRIPT_DIR/frontend.yaml" $EXTRA_ARGS

# 8. Ingress (ALB)
echo "► Applying Ingress (ALB)..."
kubectl apply -f "$SCRIPT_DIR/ingress.yaml" $EXTRA_ARGS

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Deployment complete."
echo ""
echo "  Check status:  kubectl -n linkedin-platform get pods"
echo "  Get ALB URL:   kubectl -n linkedin-platform get ingress"
echo "  Backend logs:  kubectl -n linkedin-platform logs deploy/backend"
echo "  Seed data:     kubectl -n linkedin-platform exec deploy/backend -- python seed_data.py --quick --yes"
echo "  Pull LLM:      kubectl -n linkedin-platform exec deploy/ollama -- ollama pull llama3.2"
echo "═══════════════════════════════════════════════════════════"
