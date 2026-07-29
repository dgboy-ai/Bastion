#!/bin/sh
# Generate CockroachDB TLS certificates for local development.
#
# Usage:  docker compose run --rm certs-init
#
# Output (all written to /certs/):
#   ca.crt          CA certificate
#   node.crt        Node certificate (for cockroachdb host)
#   node.key        Node private key
#   client.root.crt Client certificate for user "root"
#   client.root.key Client private key for user "root"

set -e
CERTS_DIR=${CERTS_DIR:-/certs}
mkdir -p "$CERTS_DIR"

# --- CA ---
if [ ! -f "$CERTS_DIR/ca.crt" ]; then
  echo "==> Generating CA certificate..."
  cockroach cert create-ca --certs-dir="$CERTS_DIR" --ca-key="$CERTS_DIR/ca.key"
else
  echo "==> CA certificate already exists, skipping"
fi

# --- Node certificate (covers all SANs needed for docker-compose) ---
if [ ! -f "$CERTS_DIR/node.crt" ]; then
  echo "==> Generating node certificate..."
  cockroach cert create-node \
    cockroachdb \
    localhost \
    127.0.0.1 \
    --certs-dir="$CERTS_DIR" \
    --ca-key="$CERTS_DIR/ca.key"
else
  echo "==> Node certificate already exists, skipping"
fi

# --- Client certificate for user "root" ---
if [ ! -f "$CERTS_DIR/client.root.crt" ]; then
  echo "==> Generating client certificate for user 'root'..."
  cockroach cert create-client \
    root \
    --certs-dir="$CERTS_DIR" \
    --ca-key="$CERTS_DIR/ca.key"
else
  echo "==> Client certificate for 'root' already exists, skipping"
fi

# Fix permissions
chmod 400 "$CERTS_DIR/ca.key" "$CERTS_DIR/node.key" "$CERTS_DIR/client.root.key" 2>/dev/null || true

echo "==> Certificates ready in $CERTS_DIR"
ls -la "$CERTS_DIR"
