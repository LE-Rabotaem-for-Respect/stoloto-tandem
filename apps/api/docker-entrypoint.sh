#!/bin/sh
set -e

# Секрет сессий у каждого стенда свой и в репозитории не хранится. Если он не задан
# в окружении, создаётся при первом старте и живёт в томе стенда — сессии переживают
# перезапуск контейнера.
if [ -z "$SESSION_SECRET" ]; then
  secret_file=/var/lib/tandem/session-secret
  if [ ! -s "$secret_file" ]; then
    umask 077
    node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" > "$secret_file"
  fi
  SESSION_SECRET=$(cat "$secret_file")
  export SESSION_SECRET
fi

# Перед запуском применяются миграции; при ошибке api не стартует
/app/node_modules/.bin/prisma migrate deploy
# Новый демо-стенд с пустой базой сразу готов к быстрому входу; базу с данными сид не трогает
node dist/seed.js
exec node dist/main.js
