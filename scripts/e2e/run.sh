#!/usr/bin/env bash
# VPS'te yalıtılmış test örneği (ayrı veritabanı, port 4199) başlatır, uçtan uca yolculuğu çalıştırır, durdurur.
# Kullanım (sunucuda, root): bash /opt/dentaflow/app/scripts/e2e/run.sh /tmp/opg.jpg
set -u
APP=${E2E_APP:-/opt/dentaflow/app}; ENVF=/opt/dentaflow/e2e.env; OPG=${1:-}; LOG=/tmp/df-e2e
mkdir -p $LOG; chown dentaflow $LOG; cd $APP
DBO=$(grep '^DATABASE_OWNER_URL=' $ENVF | cut -d= -f2-)
SECRET=$(grep '^META_APP_SECRET=' $ENVF | cut -d= -f2-)
sudo -u dentaflow node --env-file=$ENVF apps/api/src/migrate.ts >/dev/null
sudo -u dentaflow nohup node --env-file=$ENVF apps/api/src/server.ts >$LOG/api.log 2>&1 & API=$!
sudo -u dentaflow nohup node --env-file=$ENVF apps/api/src/worker.ts >$LOG/worker.log 2>&1 & WRK=$!
for i in $(seq 1 40); do curl -sf http://127.0.0.1:4199/api/health >/dev/null && break; sleep 0.5; done
E2E_BASE=http://127.0.0.1:4199 E2E_META_SECRET=$SECRET E2E_OPG=$OPG E2E_DB_URL=$DBO E2E_REAL_AI=1 E2E_OUT=$LOG/report.json E2E_CREDS=$LOG/creds.json \
  sudo -E -u dentaflow node scripts/e2e/journey.ts; RC=$?
if [ "${E2E_KEEP:-0}" != "1" ]; then pkill -f "e2e.env apps/api/src" 2>/dev/null; else echo "test örneği açık: 127.0.0.1:4199"; fi
echo "--- API hataları ---"; grep -E '"level":50' $LOG/api.log | tail -15 | cut -c1-400
echo "--- worker hataları ---"; grep -iE 'error|fail' $LOG/worker.log | tail -15 | cut -c1-400
exit $RC
