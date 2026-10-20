import { DEMO_ACCOUNTS, demoAccountEmail } from '@tandem/domain';
import { Link, useNavigate } from 'react-router';
import { useStandInfo } from '../../shared/clock';
import { FormMessage, formError, useDemoLogin } from '../auth';
import { Markdown } from './markdown';
import {
  BACKGROUND_PEOPLE,
  CHECK_ROUTES,
  STANDS,
  type CheckRoute,
  type CheckStep,
  type StepWho,
} from './routes';
import scenariosSource from '../../../../../docs/scenarios.md?raw';
import './check.css';

const DEMO_PASSWORD = 'demo';

const whoName = (who: StepWho) =>
  'account' in who
    ? (DEMO_ACCOUNTS.find((account) => account.key === who.account)?.name ?? who.account)
    : BACKGROUND_PEOPLE[who.person];

function SignIn({ step }: { step: CheckStep }) {
  const demoLogin = useDemoLogin();
  const navigate = useNavigate();
  const { who } = step;
  if (!('account' in who)) {
    return (
      <span className="check-credentials">
        Войти: {`${who.person}@demo`}, пароль {DEMO_PASSWORD}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className="button check-sign-in"
        disabled={demoLogin.isPending}
        onClick={() =>
          demoLogin.mutate(
            { account: who.account },
            { onSuccess: () => navigate(step.path ?? '/') },
          )
        }
      >
        Войти как {whoName(who)}
      </button>
      {/* Например, демо-данные не сброшены и аккаунта нет — как у быстрого входа */}
      <FormMessage text={formError(demoLogin.error).message} />
    </>
  );
}

function Route({ route, demoMode }: { route: CheckRoute; demoMode: boolean }) {
  const titleId = `check-route-${route.id.replace('.', '-')}`;
  return (
    <section className="check-route" aria-labelledby={titleId}>
      <h2 id={titleId}>
        {route.kind} {route.id}. {route.title}
      </h2>
      {route.note && <p className="check-note">{route.note}</p>}
      <ol className="check-steps">
        {route.steps.map((step, index) => (
          <li key={index} className="check-step">
            <span className="check-who">{whoName(step.who)}</span>
            <span className="check-arrow" aria-hidden="true">
              →
            </span>
            <span className="check-action">{step.action}</span>
            <span className="check-arrow" aria-hidden="true">
              →
            </span>
            <span className="check-expected">
              <span className="visually-hidden">Ожидаемый результат: </span>
              {step.expected}
            </span>
            <span className="check-tools">
              {demoMode && <SignIn step={step} />}
              {step.path && <Link to={step.path}>Открыть экран</Link>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Stands({ current }: { current: string | null }) {
  const { protocol, hostname } = window.location;
  return (
    <section className="check-stands" aria-label="Стенды">
      <h2>Стенды</h2>
      <p>У каждого проверяющего свой стенд: сброс и перемотка часов другие стенды не трогают.</p>
      <ul>
        {STANDS.map((stand) => (
          <li key={stand.id}>
            <a href={`${protocol}//${hostname}:${stand.port}/check`}>
              {stand.id === current ? `${stand.id} — вы здесь` : stand.id}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «Как проверить» (ТЗ 4.6): сценарии схемой-маршрутом, вход под нужным аккаунтом, стенды. */
export function CheckPage() {
  const stand = useStandInfo();
  const demoMode = stand.data?.demoMode ?? false;
  return (
    <div className="check-page">
      <h1>Как проверить</h1>
      {demoMode ? (
        <p>
          Перед каждым сценарием — «Сбросить демо-данные» в демо-панели. Демо-аккаунты:{' '}
          {DEMO_ACCOUNTS.map((account) => demoAccountEmail(account.key)).join(', ')}, пароль{' '}
          {DEMO_PASSWORD}.
        </p>
      ) : (
        // Вне демо-режима демо-аккаунтов нет: их почты и пароль только сбили бы с толку
        <p>Сценарии проходят на демо-стенде: там есть демо-аккаунты и сброс данных.</p>
      )}
      <p>
        Подробные шаги и демо-данные — <Link to="/check/scenarios">docs/scenarios.md</Link>.
      </p>
      <Stands current={stand.data?.standId ?? null} />
      {CHECK_ROUTES.map((route) => (
        <Route key={route.id} route={route} demoMode={demoMode} />
      ))}
    </div>
  );
}

/** `docs/scenarios.md` из репозитория — тот же текст, что в README, внутри приложения. */
export function ScenariosPage() {
  return (
    <div className="check-page check-document">
      <p>
        <Link to="/check">← Как проверить</Link>
      </p>
      <Markdown source={scenariosSource} />
    </div>
  );
}
