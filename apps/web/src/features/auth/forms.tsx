import { DEMO_ACCOUNTS } from '@tandem/domain';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiRequestError } from '../../shared/api';
import { Field } from '../../shared/ui/Field';
import { useDemoLogin, useLogin, useRegister, useStandInfo } from './api';
import type { RegisterBody } from './api';

interface FormError {
  message?: string;
  fields: Record<string, string>;
}

function formError(error: unknown): FormError {
  if (!error) return { fields: {} };
  if (error instanceof ApiRequestError) {
    // Ошибки полей показываются у полей; общий текст — когда полей нет
    const hasFields = Object.keys(error.fields).length > 0;
    return { message: hasFields ? undefined : error.message, fields: error.fields };
  }
  return { message: 'Что-то пошло не так. Попробуйте ещё раз', fields: {} };
}

function FormMessage({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="form-error" role="alert">
      {text}
    </p>
  );
}

export function LoginForm({ onSignedIn }: { onSignedIn(): void }) {
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const error = formError(login.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: onSignedIn });
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field
        label="Почта"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={error.fields.email}
        required
      />
      <Field
        label="Пароль"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={error.fields.password}
        required
      />
      <FormMessage text={error.message} />
      <button className="button button-primary" type="submit" disabled={login.isPending}>
        Войти
      </button>
    </form>
  );
}

/** «Быстрый вход для проверки» (ТЗ 2.6, 4.6): только на демо-стенде. */
export function QuickLogin({ onSignedIn }: { onSignedIn(): void }) {
  const stand = useStandInfo();
  const demoLogin = useDemoLogin();
  if (!stand.data?.demoMode) return null;
  const error = formError(demoLogin.error);

  return (
    <section className="quick-login" aria-labelledby="quick-login-title">
      <h2 id="quick-login-title">Быстрый вход для проверки</h2>
      <ul className="quick-login-list">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.key}>
            <button
              className="button quick-login-button"
              type="button"
              disabled={demoLogin.isPending}
              onClick={() => demoLogin.mutate({ account: account.key }, { onSuccess: onSignedIn })}
            >
              <span className="quick-login-name">{account.name}</span>
              <span className="quick-login-role">{account.role}</span>
            </button>
          </li>
        ))}
      </ul>
      <FormMessage text={error.message} />
    </section>
  );
}

export function RegisterForm({ onSignedIn }: { onSignedIn(): void }) {
  const register = useRegister();
  const [form, setForm] = useState<RegisterBody>({
    accountType: 'person',
    name: '',
    email: '',
    password: '',
    organizationName: '',
  });
  const error = formError(register.error);
  const isOrganization = form.accountType === 'organization';
  const set = (patch: Partial<RegisterBody>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const { organizationName, ...person } = form;
    register.mutate(isOrganization ? { ...person, organizationName } : person, {
      onSuccess: onSignedIn,
    });
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <fieldset className="choice">
        <legend>Кто вы</legend>
        <label className="choice-option">
          <input
            type="radio"
            name="accountType"
            checked={!isOrganization}
            onChange={() => set({ accountType: 'person' })}
          />
          Я — человек
        </label>
        <label className="choice-option">
          <input
            type="radio"
            name="accountType"
            checked={isOrganization}
            onChange={() => set({ accountType: 'organization' })}
          />
          Я — организация
        </label>
      </fieldset>
      {isOrganization && (
        <Field
          label="Название организации"
          value={form.organizationName}
          onChange={(event) => set({ organizationName: event.target.value })}
          error={error.fields.organizationName}
          required
        />
      )}
      <Field
        label={isOrganization ? 'Ваше имя (представитель)' : 'Имя'}
        autoComplete="name"
        value={form.name}
        onChange={(event) => set({ name: event.target.value })}
        error={error.fields.name}
        required
      />
      <Field
        label="Почта"
        type="email"
        autoComplete="email"
        value={form.email}
        onChange={(event) => set({ email: event.target.value })}
        error={error.fields.email}
        required
      />
      <Field
        label="Пароль, не короче 8 символов"
        type="password"
        autoComplete="new-password"
        value={form.password}
        onChange={(event) => set({ password: event.target.value })}
        error={error.fields.password}
        required
      />
      <FormMessage text={error.message} />
      <button className="button button-primary" type="submit" disabled={register.isPending}>
        Зарегистрироваться
      </button>
    </form>
  );
}
