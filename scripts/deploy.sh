#!/usr/bin/env bash
# DentaFlow dağıtımı: web derle → sunucuya senkronla → bağımlılık → migration → servisleri yeniden başlat
set -euo pipefail
HOST="${DEPLOY_HOST:-root@188.132.215.179}"
DIR=/opt/dentaflow
cd "$(dirname "$0")/.."
npm run build
rsync -az --delete --exclude node_modules --exclude .env --exclude 'storage/' --exclude .git --exclude prototype --exclude .claude --exclude 'apps/web/dist/assets/' ./ "$HOST:$DIR/app/"
# eski JS/CSS parçaları silinmez (açık sekmeler kırılmasın); 14 günden eskiler temizlenir
rsync -az apps/web/dist/assets/ "$HOST:$DIR/app/apps/web/dist/assets/"
ssh "$HOST" "find $DIR/app/apps/web/dist/assets -type f -mtime +14 -delete"
ssh "$HOST" "set -e; cd $DIR/app; npm ci --omit=dev --no-audit --no-fund --loglevel=error; chown -R dentaflow:dentaflow $DIR;
  sudo -u dentaflow node --env-file=$DIR/.env apps/api/src/migrate.ts;
  systemctl restart dentaflow-api dentaflow-worker; sleep 2; systemctl is-active dentaflow-api dentaflow-worker;
  curl -fsS http://127.0.0.1:4100/api/health"
echo; echo "✓ Dağıtım tamam"
