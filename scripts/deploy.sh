#!/usr/bin/env bash
# DentaFlow dağıtımı: web derle → sunucuya senkronla → bağımlılık → migration → servisleri yeniden başlat
set -euo pipefail
HOST="${DEPLOY_HOST:-root@188.132.215.179}"
DIR=/opt/dentaflow
cd "$(dirname "$0")/.."
npm run build
rsync -az --delete --exclude node_modules --exclude .env --exclude 'storage/' --exclude .git --exclude prototype --exclude .claude ./ "$HOST:$DIR/app/"
ssh "$HOST" "set -e; cd $DIR/app; npm ci --omit=dev --no-audit --no-fund --loglevel=error; chown -R dentaflow:dentaflow $DIR;
  sudo -u dentaflow node --env-file=$DIR/.env apps/api/src/migrate.ts;
  systemctl restart dentaflow-api dentaflow-worker; sleep 2; systemctl is-active dentaflow-api dentaflow-worker;
  curl -fsS http://127.0.0.1:4100/api/health"
echo; echo "✓ Dağıtım tamam"
