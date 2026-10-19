-- Ограничения, которые не выражаются в schema.prisma (ТЗ 4.1, DECISION-003).
-- Prisma не сравнивает CHECK со схемой, поэтому следующие migrate dev их не удалят.

-- Организатор мероприятия и серии — ровно один: человек или организация
ALTER TABLE "events"
  ADD CONSTRAINT "events_one_organizer_check"
  CHECK (("organizer_user_id" IS NULL) <> ("organizer_org_id" IS NULL));

ALTER TABLE "event_series"
  ADD CONSTRAINT "event_series_one_organizer_check"
  CHECK (("organizer_user_id" IS NULL) <> ("organizer_org_id" IS NULL));

ALTER TABLE "events"
  ADD CONSTRAINT "events_ends_after_start_check" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "events_capacity_positive_check" CHECK ("capacity" IS NULL OR "capacity" > 0),
  ADD CONSTRAINT "events_price_non_negative_check" CHECK ("price" >= 0);

-- Почта хранится нормализованной (нижний регистр, без пробельных символов),
-- поэтому уникальность email равна уникальности lower(email)
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalized_check"
  CHECK ("email" = lower("email") AND "email" !~ '[[:space:]]');

-- Prisma создаёт столбцы-массивы без NOT NULL, а клиент считает их всегда заданными
ALTER TABLE "sports" ADD CONSTRAINT "sports_aliases_not_null_check" CHECK ("aliases" IS NOT NULL);
ALTER TABLE "events" ADD CONSTRAINT "events_bring_not_null_check" CHECK ("bring" IS NOT NULL);
ALTER TABLE "event_series"
  ADD CONSTRAINT "event_series_weekdays_not_null_check" CHECK ("weekdays" IS NOT NULL);

-- Настройки стенда — одна строка, она есть с первой миграции
ALTER TABLE "app_state"
  ADD CONSTRAINT "app_state_single_row_check" CHECK ("id");

INSERT INTO "app_state" ("id") VALUES (true) ON CONFLICT DO NOTHING;
