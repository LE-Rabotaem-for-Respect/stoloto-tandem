#!/bin/sh
# Обновление демо-стендов на сервере команды (DECISION-004).
# Запускается на компьютере, с которого есть вход на сервер по SSH-ключу:
#
#   sh scripts/deploy.sh                    свежий origin/prod на все стенды
#   DEPLOY_REF=<коммит> sh scripts/deploy.sh   нужный коммит (откат)
#
# Код попадает на сервер архивом `git archive` — только отслеживаемые файлы, без .env
# и .git. Сборка и запуск — `scripts/stands.sh up` на сервере; тома стендов (базы,
# секреты сессий) сохраняются. После запуска проверяется /api/health и /api/clock.
set -eu

cd "$(dirname "$0")/.."

host=${DEPLOY_HOST:-team-09@109.196.167.209}
address=${host#*@}
ref=${DEPLOY_REF:-origin/prod}
# Сколько выпусков хранить на сервере
keep=3

git fetch --quiet origin
commit=$(git rev-parse --short=12 "$ref^{commit}")
echo "Выпуск $commit ($ref) → $host"

# Аргументы удалённых команд — только коммит из rev-parse (шестнадцатеричный) и число.
# 1) архив распаковывается в ~/tandem/releases/<коммит> (уже распакованный не трогается)
git archive --format=tar "$commit" |
  ssh -o BatchMode=yes "$host" "set -eu
    release=\$HOME/tandem/releases/$commit
    if [ -d \"\$release\" ]; then cat >/dev/null; exit 0; fi
    rm -rf \"\$release.tmp\" && mkdir -p \"\$release.tmp\"
    tar -x -C \"\$release.tmp\"
    mv \"\$release.tmp\" \"\$release\""

# 2) ссылка current — на этот выпуск, запуск стендов, уборка старых выпусков
ssh -o BatchMode=yes "$host" sh -s -- "$commit" "$keep" <<'REMOTE'
set -eu
commit=$1
keep=$2
base=$HOME/tandem
ln -sfn "$base/releases/$commit" "$base/current.tmp"
mv -T "$base/current.tmp" "$base/current"
cd "$base/current"
sh scripts/stands.sh up
# Старые выпуски — кроме последних $keep и текущего
ls -1t "$base/releases" | tail -n +"$((keep + 1))" | while read -r old; do
  [ "$old" = "$commit" ] || rm -rf "${base:?}/releases/$old"
done
REMOTE

# Каждый стенд отвечает и отдаёт свой номер
failed=0
for file in stands/*.env; do
  stand=$(sed -n 's/^STAND_ID=//p' "$file")
  port=$(sed -n 's/^WEB_PORT=//p' "$file")
  url="http://$address:$port"
  ok=0
  # До 2 минут: api ждёт базу, затем миграции
  for _ in $(seq 1 24); do
    if curl -fsS --max-time 5 "$url/api/health" >/dev/null 2>&1 &&
      curl -fsS --max-time 5 "$url/api/clock" | grep -q "\"standId\":\"$stand\""; then
      ok=1
      break
    fi
    sleep 5
  done
  if [ "$ok" = 1 ]; then
    echo "$stand — $url — работает"
  else
    echo "$stand — $url — не отвечает" >&2
    ssh -o BatchMode=yes "$host" "cd ~/tandem/current && sh scripts/stands.sh ps $stand && sh scripts/stands.sh logs $stand" >&2 || true
    failed=1
  fi
done
exit "$failed"
