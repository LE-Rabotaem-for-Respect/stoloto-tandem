#!/usr/bin/env bash
# Убирает остатки прогонов CI на компьютере участника: проекты Docker Compose,
# чьё имя начинается с префикса, — контейнеры, тома, сеть и собранные образы.
# Нужен, если runner оборвался посреди задания и шаг остановки не выполнился.
#
#   compose-cleanup.sh <префикс имени проекта>
#
# Префикс задаёт задание CI и включает имя репозитория, поэтому чужие проекты
# и стенд самого участника скрипт не трогает.
set -euo pipefail

prefix=${1:?Укажите префикс имени проекта}
case "$prefix" in
  stoloto-tandem-ci-*) ;;
  *)
    echo "Префикс должен начинаться с stoloto-tandem-ci-: $prefix" >&2
    exit 2
    ;;
esac

matching() { grep -E "^${prefix}" || true; }

for project in $(docker compose ls --all --quiet | matching); do
  echo "Убираю проект $project"
  docker compose --project-name "$project" down --volumes --rmi local --remove-orphans || true
done

# Тома, сети и образы проектов, у которых контейнеров уже нет
for volume in $(docker volume ls --quiet | matching); do docker volume rm "$volume" || true; done
for network in $(docker network ls --format '{{.Name}}' | matching); do
  docker network rm "$network" || true
done
for image in $(docker images --format '{{.Repository}}:{{.Tag}}' | matching); do
  docker rmi --force "$image" || true
done
