#!/usr/bin/env bash
# One deployment entry point; application configuration lives in the root .env.
set -euo pipefail
APP_DIR=/var/www/html/meggs-site
if [ "$(id -u)" -ne 0 ]; then echo 'Run this installer as root.' >&2; exit 1; fi
cd "$APP_DIR"
for tool in node nginx systemctl runuser; do command -v "$tool" >/dev/null || { echo "Install $tool first." >&2; exit 1; }; done
if [ ! -f .env ]; then echo "Create $APP_DIR/.env from .env.example first." >&2; exit 1; fi
if [ ! -d node_modules/sequelize ]; then echo "Run npm ci in $APP_DIR first." >&2; exit 1; fi
NODE_BIN=$(command -v node)
# Validate settings and generate Nginx without sourcing secrets as shell commands.
NGINX_TEMP=$(mktemp)
SERVICE_TEMP=$(mktemp)
trap 'rm -f "$NGINX_TEMP" "$SERVICE_TEMP"' EXIT
"$NODE_BIN" --input-type=module > "$NGINX_TEMP" <<'JS'
process.loadEnvFile();
const {SITE_URL,PORT='3000',ADMIN_PASSWORD,DATABASE_URL}=process.env;
if(!DATABASE_URL)throw Error('Set DATABASE_URL in .env');
if(!ADMIN_PASSWORD||ADMIN_PASSWORD.length<16)throw Error('ADMIN_PASSWORD must have at least 16 characters');
const origin=new URL(SITE_URL);
if(!['https:','http:'].includes(origin.protocol)||!/^[a-zA-Z0-9.-]+$/.test(origin.hostname)||['localhost','your-domain.com','shop.example.com'].includes(origin.hostname))throw Error('Set SITE_URL to your real public domain');
if(!/^\d+$/.test(PORT)||Number(PORT)<1||Number(PORT)>65535)throw Error('PORT must be a valid port number');
console.log(`server {
    listen 80;
    server_name ${origin.hostname};
    client_max_body_size 8m;
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}`);
JS
if ! id meggs >/dev/null 2>&1; then useradd --system --user-group --home-dir "$APP_DIR" --no-create-home --shell /usr/sbin/nologin meggs; fi
chown root:meggs .env
chmod 640 .env
# The service needs a Node binary accessible outside root's private home directory.
runuser -u meggs -- "$NODE_BIN" --version >/dev/null || { echo 'Install Node system-wide so the meggs user can run it.' >&2; exit 1; }
runuser -u meggs -- "$NODE_BIN" scripts/database.js migrate
"$NODE_BIN" --input-type=module > "$SERVICE_TEMP" <<'JS'
import {readFileSync} from 'node:fs';
const template=readFileSync('deploy/meggs.service','utf8');
console.log(template.replace('/usr/bin/node',process.execPath));
JS
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
NGINX_TARGET=/etc/nginx/sites-available/meggs.conf
# Preserve existing HTTPS configuration created by Certbot on subsequent installs.
if [ -f "$NGINX_TARGET" ] && grep -Eq 'listen .*443|managed by Certbot' "$NGINX_TARGET"; then
 echo "Keeping existing HTTPS configuration: $NGINX_TARGET"
else
 if [ -f "$NGINX_TARGET" ]; then cp "$NGINX_TARGET" "$NGINX_TARGET.bak.$(date +%s)"; fi
 install -m 644 "$NGINX_TEMP" "$NGINX_TARGET"
fi
ln -sfn "$NGINX_TARGET" /etc/nginx/sites-enabled/meggs.conf
nginx -t
install -m 644 "$SERVICE_TEMP" /etc/systemd/system/meggs.service
systemctl daemon-reload
systemctl enable --now meggs
systemctl restart meggs
systemctl reload nginx
echo 'Deployment configuration installed. Check: systemctl status meggs'
echo 'Logs: journalctl -u meggs -f'
echo 'Configure HTTPS for your SITE_URL domain before using production admin login.'
echo 'Example: certbot --nginx -d your-real-domain.com'
echo 'Existing JSON data is not imported automatically. See README before first deployment.'
