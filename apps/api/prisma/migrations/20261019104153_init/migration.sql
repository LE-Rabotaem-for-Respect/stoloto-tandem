-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'org', 'admin');

-- CreateEnum
CREATE TYPE "skill_level" AS ENUM ('beginner', 'amateur', 'advanced');

-- CreateEnum
CREATE TYPE "event_level" AS ENUM ('beginner', 'amateur', 'advanced', 'any');

-- CreateEnum
CREATE TYPE "sport_category" AS ENUM ('team', 'endurance', 'intellectual', 'martial', 'fitness', 'water', 'winter', 'other');

-- CreateEnum
CREATE TYPE "sport_status" AS ENUM ('active', 'hidden');

-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('draft', 'pending', 'approved', 'rejected', 'needs_changes');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('published', 'cancelled', 'unpublished', 'deleted');

-- CreateEnum
CREATE TYPE "event_mode" AS ENUM ('free', 'approval');

-- CreateEnum
CREATE TYPE "participation_status" AS ENUM ('pending', 'confirmed', 'waitlist', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('visible', 'hidden_by_moderator', 'deleted_by_moderator', 'deleted_by_author');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'user',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "city" TEXT,
    "bio" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sports" (
    "user_id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,
    "level" "skill_level" NOT NULL,

    CONSTRAINT "user_sports_pkey" PRIMARY KEY ("user_id","sport_id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "contacts" TEXT NOT NULL,
    "website" TEXT,
    "representative_name" TEXT NOT NULL,
    "representative_role" TEXT NOT NULL,
    "status" "organization_status" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ,
    "decision_reason" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_sports" (
    "organization_id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,

    CONSTRAINT "organization_sports_pkey" PRIMARY KEY ("organization_id","sport_id")
);

-- CreateTable
CREATE TABLE "sports" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" "sport_category" NOT NULL DEFAULT 'other',
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "status" "sport_status" NOT NULL DEFAULT 'active',

    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_series" (
    "id" UUID NOT NULL,
    "organizer_user_id" UUID,
    "organizer_org_id" UUID,
    "weekdays" INTEGER[],
    "until" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "event_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "organizer_user_id" UUID,
    "organizer_org_id" UUID,
    "sport_id" UUID NOT NULL,
    "series_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "place_text" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "participant_info" TEXT NOT NULL DEFAULT '',
    "mode" "event_mode" NOT NULL DEFAULT 'free',
    "apply_question" TEXT,
    "capacity" INTEGER,
    "level" "event_level" NOT NULL DEFAULT 'any',
    "first_timers_ok" BOOLEAN NOT NULL DEFAULT false,
    "bring" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirements" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL DEFAULT 0,
    "how_it_goes" TEXT NOT NULL DEFAULT '',
    "status" "event_status" NOT NULL DEFAULT 'published',
    "status_reason" TEXT,
    "status_changed_at" TIMESTAMPTZ NOT NULL,
    "previous_starts_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "participation_status" NOT NULL,
    "answer" TEXT,
    "decided_by" UUID,
    "decision_reason" TEXT,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "as_organization_id" UUID,
    "parent_id" UUID,
    "text" TEXT NOT NULL,
    "status" "message_status" NOT NULL DEFAULT 'visible',
    "moderation_reason" TEXT,
    "is_faq" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL,
    "edited_at" TIMESTAMPTZ,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "link" TEXT,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,
    "level" "skill_level" NOT NULL,
    "area" TEXT NOT NULL,
    "time_slots" JSONB NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "active_until" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "company_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_log" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "moderation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "helfigochi" (
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "vacation" BOOLEAN NOT NULL DEFAULT false,
    "equipped_accessory_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "helfigochi_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "helfigochi_ledger" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "revoke_reason" TEXT,

    CONSTRAINT "helfigochi_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "helfigochi_rules" (
    "source_type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "daily_cap" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "helfigochi_rules_pkey" PRIMARY KEY ("source_type")
);

-- CreateTable
CREATE TABLE "accessories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sport_category" "sport_category",
    "icon" TEXT NOT NULL,

    CONSTRAINT "accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_accessories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "accessory_id" UUID NOT NULL,
    "sport_id" UUID,
    "unlocked_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_state" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "clock_offset_seconds" INTEGER NOT NULL DEFAULT 0,
    "last_reset_at" TIMESTAMPTZ,
    "helfigochi_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "app_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_tokens" (
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "calendar_tokens_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "series_subscriptions" (
    "series_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "series_subscriptions_pkey" PRIMARY KEY ("series_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_owner_user_id_key" ON "organizations"("owner_user_id");

-- CreateIndex
CREATE INDEX "organizations_status_submitted_at_idx" ON "organizations"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sports_normalized_name_key" ON "sports"("normalized_name");

-- CreateIndex
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");

-- CreateIndex
CREATE INDEX "events_sport_id_idx" ON "events"("sport_id");

-- CreateIndex
CREATE INDEX "events_series_id_idx" ON "events"("series_id");

-- CreateIndex
CREATE INDEX "participations_event_id_status_created_at_id_idx" ON "participations"("event_id", "status", "created_at", "id");

-- CreateIndex
CREATE INDEX "participations_user_id_idx" ON "participations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "participations_event_user_not_cancelled_key" ON "participations"("event_id", "user_id") WHERE (status <> 'cancelled');

-- CreateIndex
CREATE INDEX "messages_event_id_created_at_idx" ON "messages"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "company_requests_sport_id_active_until_idx" ON "company_requests"("sport_id", "active_until");

-- CreateIndex
CREATE INDEX "moderation_log_object_type_object_id_idx" ON "moderation_log"("object_type", "object_id");

-- CreateIndex
CREATE INDEX "moderation_log_created_at_idx" ON "moderation_log"("created_at");

-- CreateIndex
CREATE INDEX "helfigochi_ledger_user_id_occurred_at_idx" ON "helfigochi_ledger"("user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "helfigochi_ledger_user_id_source_type_source_id_key" ON "helfigochi_ledger"("user_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "accessories_code_key" ON "accessories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_accessories_group_key" ON "user_accessories"("user_id", "accessory_id") WHERE (sport_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "user_accessories_sport_key" ON "user_accessories"("user_id", "accessory_id", "sport_id") WHERE (sport_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_tokens_token_hash_key" ON "calendar_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "user_sports" ADD CONSTRAINT "user_sports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sports" ADD CONSTRAINT "user_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_sports" ADD CONSTRAINT "organization_sports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_sports" ADD CONSTRAINT "organization_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sports" ADD CONSTRAINT "sports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_organizer_org_id_fkey" FOREIGN KEY ("organizer_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_org_id_fkey" FOREIGN KEY ("organizer_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "event_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participations" ADD CONSTRAINT "participations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participations" ADD CONSTRAINT "participations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participations" ADD CONSTRAINT "participations_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_as_organization_id_fkey" FOREIGN KEY ("as_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_requests" ADD CONSTRAINT "company_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_requests" ADD CONSTRAINT "company_requests_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_log" ADD CONSTRAINT "moderation_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helfigochi" ADD CONSTRAINT "helfigochi_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helfigochi" ADD CONSTRAINT "helfigochi_equipped_accessory_id_fkey" FOREIGN KEY ("equipped_accessory_id") REFERENCES "accessories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helfigochi_ledger" ADD CONSTRAINT "helfigochi_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_accessories" ADD CONSTRAINT "user_accessories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_accessories" ADD CONSTRAINT "user_accessories_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_accessories" ADD CONSTRAINT "user_accessories_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_tokens" ADD CONSTRAINT "calendar_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_subscriptions" ADD CONSTRAINT "series_subscriptions_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "event_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_subscriptions" ADD CONSTRAINT "series_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
