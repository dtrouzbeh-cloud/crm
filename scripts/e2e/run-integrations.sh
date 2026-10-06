#!/usr/bin/env bash
# Entegrasyon testi: test örneği + HTTPS alıcı (kendinden imzalı sertifika, yalnız test örneği güvenir)
set -u
APP=${E2E_APP:-/opt/dentaflow/e2e-app}; ENVF=/opt/dentaflow/e2e.env; LOG=/tmp/df-e2e; C=/opt/dentaflow/e2e-certs
mkdir -p $LOG $C; chown dentaflow $LOG; cd $APP
[ -f $C/cert.pem ] || openssl req -x509 -newkey rsa:2048 -nodes -keyout $C/key.pem -out $C/cert.pem -days 365 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" 2>/dev/null
chown -R dentaflow $C
DBO=$(grep '^DATABASE_OWNER_URL=' $ENVF | cut -d= -f2-); SECRET=$(grep '^META_APP_SECRET=' $ENVF | cut -d= -f2-); VERIFY=$(grep '^META_VERIFY_TOKEN=' $ENVF | cut -d= -f2-)
pkill -f "node --env-file=/opt/dentaflow/e2e[.]env" ; pkill -f "e2e/receive[r].mjs"; sleep 1
sudo -u dentaflow node --env-file=$ENVF apps/api/src/migrate.ts >/dev/null
EXTRA="WEBHOOK_ALLOW_PRIVATE=1 NODE_EXTRA_CA_CERTS=$C/cert.pem"
sudo -u dentaflow nohup node scripts/e2e/receiver.mjs $C/cert.pem $C/key.pem 4299 >$LOG/receiver.log 2>&1 &
sudo -u dentaflow env $EXTRA nohup node --env-file=$ENVF apps/api/src/server.ts >$LOG/api.log 2>&1 &
sudo -u dentaflow env $EXTRA nohup node --env-file=$ENVF apps/api/src/worker.ts >$LOG/worker.log 2>&1 &
for i in $(seq 1 40); do curl -sf http://127.0.0.1:4199/api/health >/dev/null && break; sleep 0.5; done
sudo -u dentaflow env E2E_APP=$APP E2E_BASE=http://127.0.0.1:4199 E2E_META_SECRET=$SECRET E2E_META_VERIFY=$VERIFY E2E_DB_URL=$DBO E2E_RECEIVER=https://127.0.0.1:4299 E2E_OUT=$LOG/integrations.json NODE_EXTRA_CA_CERTS=$C/cert.pem \
  node --env-file=$ENVF scripts/e2e/integrations.ts; RC=$?
pkill -f "node --env-file=/opt/dentaflow/e2e[.]env"; pkill -f "e2e/receive[r].mjs"
echo "--- API hataları ---"; grep -E '"level":50' $LOG/api.log | tail -10 | cut -c1-300
echo "--- worker hataları ---"; grep -iE 'error|yavaş' $LOG/worker.log | grep -v "^\[mail\]" | tail -10 | cut -c1-300
exit $RC
