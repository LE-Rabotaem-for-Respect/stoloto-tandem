#!/usr/bin/env bash
# Убирает остатки прогонов CI на компьютере участника: проекты Docker Compose,
# чьё имя начинается с префикса, — контейнеры, тома, сеть и собранные образы.
# Нужен, если runner оборвался посреди задания и шаг остановки не выполнился.
#
#   compose-cleanup.sh stoloto-tandem-ci-<задание>-
#
# Префикс включает имя репозитория и задания, поэтому чужие проекты, другое
# задание и стенд самого участника скрипт не трогает.
set -euo pipefail

prefix=${1:?Укажите префикс имени проекта}
# Префикс — буквальная строка заданного вида, а не шаблон
if [[ ! $prefix =~ ^stoloto-tandem-ci-[a-z0-9]+-$ ]]; then
  echo "Префикс должен иметь вид stoloto-tandem-ci-<задание>-: $prefix" >&2
  exit 2
fi

# Имена из списка, которые начинаются с префикса; сравнение строк, без регулярных выражений
matching() {
  local name
  while IFS= read -r name; do
    if [[ $name == "$prefix"* ]]; then printf '%s\n' "$name"; fi
  done
}

# Списки берутся отдельно, чтобы сбой docker не прошёл молча внутри for
projects=$(docker compose ls --all --quiet)
for project in $(matching <<< "$projects"); do
  echo "Убираю проект $project"
  docker compose --project-name "$project" down --volumes --rmi local --remove-orphans || true
done

# Тома, сети и образы проектов, у которых контейнеров уже нет
volumes=$(docker volume ls --quiet)
for volume in $(matching <<< "$volumes"); do docker volume rm "$volume" || true; done
networks=$(docker network ls --format '{{.Name}}')
for network in $(matching <<< "$networks"); do docker network rm "$network" || true; done
images=$(docker images --format '{{.Repository}}:{{.Tag}}')
for image in $(matching <<< "$images"); do docker rmi --force "$image" || true; done
