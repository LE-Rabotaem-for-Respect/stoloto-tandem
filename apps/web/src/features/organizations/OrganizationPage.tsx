import { ORGANIZATION_STATUS_VIEW, organizationMachine } from '@tandem/domain';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import {
  Field,
  OrganizationStepper,
  PrimaryButton,
  StatusBadge,
  TextAreaField,
} from '../../shared/ui';
import { RequireAuth, useMe } from '../auth';
import { FormMessage, formError } from '../auth/forms';
import { useOrganization, useOrganizationActions } from './api';
import type { OrganizationProfile, OrganizationSport, OwnOrganization } from './api';
import { SportsPicker } from './SportsPicker';

/** Что делать дальше — одной строкой под степпером (ТЗ 2.9). */
const NEXT_STEP: Record<OwnOrganization['status'], string> = {
  draft:
    'Заполните профиль и отправьте его на проверку — после одобрения можно публиковать мероприятия.',
  pending: 'Профиль на проверке у администратора. Решение придёт в уведомления.',
  needs_changes: 'Администратор просит исправить профиль. Внесите правки и отправьте снова.',
  rejected: 'Заявка отклонена. Исправьте профиль по причине выше и отправьте снова.',
  approved: 'Организация допущена: мероприятия создаются обычным экраном и выходят от её имени.',
};

type ProfileForm = Omit<OrganizationProfile, 'sportIds'> & { sports: OrganizationSport[] };

function toForm(organization: OwnOrganization): ProfileForm {
  return {
    name: organization.name,
    description: organization.description,
    city: organization.city,
    contacts: organization.contacts,
    website: organization.website ?? '',
    representativeName: organization.representativeName,
    representativeRole: organization.representativeRole,
    sports: organization.sports,
  };
}

function toProfile({ sports, ...form }: ProfileForm): OrganizationProfile {
  return { ...form, sportIds: sports.map((sport) => sport.id) };
}

function ProfileEditor({ organization }: { organization: OwnOrganization }) {
  const [form, setForm] = useState(() => toForm(organization));
  const [saved, setSaved] = useState(false);
  const { save, submit } = useOrganizationActions(organization.id);
  const pending = save.isPending || submit.isPending;
  const error = formError(submit.error ?? save.error);
  const canSubmit = organizationMachine.canTransition(organization.status, 'submit', {});
  const set = (patch: Partial<ProfileForm>) => {
    setSaved(false);
    setForm((current) => ({ ...current, ...patch }));
  };
  const text = (field: keyof Omit<ProfileForm, 'sports'>) => ({
    value: form[field],
    error: error.fields[field],
    onChange: (event: { target: { value: string } }) => set({ [field]: event.target.value }),
  });

  const onSave = (event: FormEvent) => {
    event.preventDefault();
    submit.reset();
    save.mutate(toProfile(form), { onSuccess: () => setSaved(true) });
  };
  const onSubmit = () => {
    save.reset();
    submit.mutate(toProfile(form));
  };

  return (
    <form className="form org-form" onSubmit={onSave} noValidate>
      <h2>Профиль организации</h2>
      <Field label="Название" maxLength={120} required {...text('name')} />
      <TextAreaField
        label="Чем занимается организация"
        maxLength={2000}
        rows={5}
        required
        {...text('description')}
      />
      <Field label="Город" maxLength={80} required {...text('city')} />
      <TextAreaField label="Контакты" maxLength={300} rows={3} required {...text('contacts')} />
      <Field
        label="Сайт (необязательно)"
        type="url"
        inputMode="url"
        placeholder="https://"
        {...text('website')}
      />
      <Field label="Представитель" maxLength={120} required {...text('representativeName')} />
      <Field label="Роль представителя" maxLength={120} required {...text('representativeRole')} />
      <SportsPicker
        value={form.sports}
        onChange={(sports) => set({ sports })}
        error={error.fields.sportIds}
      />
      <FormMessage text={error.message} />
      {saved && (
        <p className="form-saved" role="status">
          Сохранено
        </p>
      )}
      <div className="org-form-actions">
        {canSubmit && (
          <PrimaryButton disabled={pending} onClick={onSubmit}>
            Отправить на проверку
          </PrimaryButton>
        )}
        <button className="button" type="submit" disabled={pending}>
          Сохранить
        </button>
      </div>
    </form>
  );
}

function OwnOrganizationScreen({ id }: { id: string }) {
  const organization = useOrganization<OwnOrganization>(id);
  if (organization.isPending) return <p role="status">Загрузка…</p>;
  if (organization.isError) {
    return (
      <div role="alert">
        <p>{organization.error.message}</p>
        <button className="button" type="button" onClick={() => void organization.refetch()}>
          Повторить
        </button>
      </div>
    );
  }
  const data = organization.data;
  const view = ORGANIZATION_STATUS_VIEW[data.status];
  return (
    <>
      <OrganizationStepper status={data.status} reason={data.decisionReason} />
      <StatusBadge view={view} />
      <p>{NEXT_STEP[data.status]}</p>
      {data.status === 'approved' && (
        <div className="org-approved">
          <Link className="button button-primary" to="/create">
            Создать мероприятие
          </Link>
          <Link className="button" to={`/organizations/${data.id}`}>
            Публичная страница
          </Link>
        </div>
      )}
      {/* Форма заново заполняется после смены статуса: перед глазами — то, что сохранено */}
      <ProfileEditor key={data.status} organization={data} />
    </>
  );
}

function OrganizationSection() {
  const me = useMe();
  const organization = me.data?.organization;
  return (
    <div className="page">
      <h1>Моя организация</h1>
      {organization ? (
        <OwnOrganizationScreen id={organization.id} />
      ) : (
        <p>Этот раздел — для аккаунтов организаций.</p>
      )}
    </div>
  );
}

/** Контур организации (ТЗ 2.9): профиль, отправка на проверку, решение. */
export const OrganizationPage = () => (
  <RequireAuth>
    <OrganizationSection />
  </RequireAuth>
);
