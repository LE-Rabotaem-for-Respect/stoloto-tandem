#!/bin/sh
# Демо-стенды stand-1…3 из одного docker-compose.yml (ТЗ 4.6, «Изоляция демо-стендов»).
# Каждый стенд — отдельный проект Compose: своя база, свой секрет сессий, свои порты
# (stands/stand-N.env). Сброс и перемотка демо-часов на одном стенде другие не трогают.
#
#   sh scripts/stands.sh up [stand-1 …]     собрать и поднять стенды
#   sh scripts/stands.sh down [stand-1 …]   остановить (данные стендов сохраняются)
#   sh scripts/stands.sh ps [stand-1 …]     состояние контейнеров
#   sh scripts/stands.sh logs stand-2       журнал стенда
#
# Без имён — все стенды из каталога stands/.
set -eu

cd "$(dirname "$0")/.."

action=${1:-}
[ $# -gt 0 ] && shift

case "$action" in
  up | down | ps | logs) ;;
  *)
    echo "Использование: sh scripts/stands.sh up|down|ps|logs [stand-1 …]" >&2
    exit 2
    ;;
esac

if [ $# -eq 0 ]; then
  for file in stands/*.env; do
    [ -f "$file" ] || continue
    name=${file#stands/}
    set -- "$@" "${name%.env}"
  done
  if [ $# -eq 0 ]; then
    echo "Нет ни одного стенда: в каталоге stands/ нет файлов *.env" >&2
    exit 2
  fi
fi

for stand in "$@"; do
  if [ ! -f "stands/$stand.env" ]; then
    echo "Нет стенда $stand: файла stands/$stand.env нет" >&2
    exit 2
  fi
done

# Compose для стенда: имя проекта и переменные — из stands/<стенд>.env. Переменные
# стенда из окружения shell сбрасываются: иначе они перекрыли бы файл у всех стендов
compose() {
  stand=$1
  shift
  env -u STAND_ID -u WEB_PORT -u API_PORT -u DEMO_MODE -u SESSION_SECRET \
    docker compose -p "$stand" --env-file "stands/$stand.env" "$@"
}

for stand in "$@"; do
  case "$action" in
    # Слои образов общие в кэше сборки: второй и третий стенд собираются быстро
    up)
      compose "$stand" up -d --build
      echo "$stand — порт $(sed -n 's/^WEB_PORT=//p' "stands/$stand.env")"
      ;;
    down) compose "$stand" down ;;
    ps) compose "$stand" ps ;;
    logs) compose "$stand" logs --tail 200 ;;
  esac
done
