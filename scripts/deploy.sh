#!/bin/sh
# Обновление демо-стендов на сервере команды (DECISION-004).
# Запускается на компьютере, с которого есть вход на сервер по SSH-ключу:
#
#   sh scripts/deploy.sh                    свежий origin/prod на все стенды
#   DEPLOY_REF=<коммит> sh scripts/deploy.sh   нужный коммит из истории prod (откат)
#   DEPLOY_RESET=1 sh scripts/deploy.sh     ещё и сбросить демо-данные стендов — перед
#                                           передачей экспертам; во время проверки нельзя
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
# На открытые стенды — только код, прошедший ревью и слитый в prod
if ! git merge-base --is-ancestor "$commit" origin/prod; then
  echo "Коммит $commit не из истории origin/prod — выкатывать нельзя" >&2
  exit 1
fi
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

# Каждый стенд отвечает и отдаёт свой номер; список стендов — из выкатываемого коммита
failed=0
for file in $(git ls-tree --name-only "$commit" stands/ | grep '\.env$'); do
  # Имя стенда — по имени файла, как у stands.sh; на сервер уходит только stand-<число>
  name=${file#stands/}
  name=${name%.env}
  case "$name" in
    stand-[0-9] | stand-[0-9][0-9]) ;;
    *)
      echo "Пропускаю $file: имя стенда — stand-<номер>" >&2
      failed=1
      continue
      ;;
  esac
  settings=$(git show "$commit:$file")
  stand=$(printf '%s\n' "$settings" | sed -n 's/^STAND_ID=//p')
  port=$(printf '%s\n' "$settings" | sed -n 's/^WEB_PORT=//p')
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
  if [ "$ok" = 1 ] && [ "${DEPLOY_RESET:-}" = 1 ]; then
    curl -fsS --max-time 30 -X POST "$url/api/demo/reset" >/dev/null || ok=0
  fi
  if [ "$ok" = 1 ]; then
    echo "$stand — $url — работает"
  else
    echo "$stand — $url — не отвечает" >&2
    # Имя (уже проверенное stand-<число>) — аргументом фиксированной команды
    ssh -o BatchMode=yes "$host" sh -s -- "$name" >&2 <<'REMOTE' || true
cd "$HOME/tandem/current"
sh scripts/stands.sh ps "$1"
sh scripts/stands.sh logs "$1"
REMOTE
    failed=1
  fi
done
exit "$failed"
