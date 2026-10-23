#!/data/data/com.termux/files/usr/bin/bash
set -eu
cd "$HOME/cwd-whatsapp"
test -f auth/creds.json || { echo 'Pair WhatsApp first.'; exit 1; }
test -f worker.mjs || { echo 'Download worker.mjs first.'; exit 1; }
node --check worker.mjs
umask 077
node --input-type=module <<'JS'
import fs from 'node:fs';
import crypto from 'node:crypto';
if(!fs.existsSync('worker-config.json'))fs.writeFileSync('worker-config.json',JSON.stringify({token:crypto.randomBytes(32).toString('hex')}),{mode:0o600});
const cfg=JSON.parse(fs.readFileSync('worker-config.json'));
console.log('ACTIVATION HASH (share this only): '+crypto.createHash('sha256').update(cfg.token).digest('hex'));
JS
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/cwd-whatsapp/run-worker.sh" <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/cwd-whatsapp" || exit 1
exec 9>worker.lock
flock -n 9 || exit 0
termux-wake-lock
while true; do
  node worker.mjs >> worker.log 2>&1
  # Keep diagnostic storage bounded; logs contain no keys or message bodies.
  if [ "$(wc -c < worker.log)" -gt 200000 ]; then tail -n 100 worker.log > worker.log.tmp; mv worker.log.tmp worker.log; fi
  sleep 30
done
SH
cat > "$HOME/.termux/boot/20-cwd-whatsapp" <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
nohup bash "$HOME/cwd-whatsapp/run-worker.sh" >/dev/null 2>&1 &
SH
chmod 700 run-worker.sh "$HOME/.termux/boot/20-cwd-whatsapp"
echo 'Files ready. Install matching GitHub Termux:Boot, open it once, then start worker after activation.'
