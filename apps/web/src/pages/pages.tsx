import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  LoginForm,
  QuickLogin,
  RegisterForm,
  RequireAuth,
  safeNext,
  useMe,
} from '../features/auth';

function useReturnAfterSignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  return { next, done: () => void navigate(next, { replace: true }) };
}

export function LoginPage() {
  const { next, done } = useReturnAfterSignIn();
  const registerLink = next === '/' ? '/register' : `/register?next=${encodeURIComponent(next)}`;
  return (
    <div className="page page-narrow">
      <h1>Вход</h1>
      <LoginForm onSignedIn={done} />
      <p>
        Нет аккаунта? <Link to={registerLink}>Зарегистрироваться</Link>
      </p>
      <QuickLogin onSignedIn={done} />
    </div>
  );
}

export function RegisterPage() {
  const { next, done } = useReturnAfterSignIn();
  const loginLink = next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
  return (
    <div className="page page-narrow">
      <h1>Регистрация</h1>
      <RegisterForm onSignedIn={done} />
      <p>
        Уже есть аккаунт? <Link to={loginLink}>Войти</Link>
      </p>
    </div>
  );
}

/** Раздел, наполнение которого появится вместе со своим модулем. */
function Section({ title, text }: { title: string; text: string }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}

export const FeedPage = () => (
  <Section title="Найти занятие" text="Здесь будет лента мероприятий с поиском и фильтрами." />
);

export const EventPage = () => (
  <Section title="Мероприятие" text="Здесь будет карточка мероприятия." />
);

export const MyParticipationsPage = () => (
  <RequireAuth>
    <Section title="Мои записи" text="Здесь будут ваши записи и заявки." />
  </RequireAuth>
);

export const CreateEventPage = () => (
  <RequireAuth>
    <Section title="Создать мероприятие" text="Здесь будет форма создания мероприятия." />
  </RequireAuth>
);

export const NotificationsPage = () => (
  <RequireAuth>
    <Section title="Уведомления" text="Здесь будут уведомления о ваших записях и мероприятиях." />
  </RequireAuth>
);

const ROLE_TITLES = { user: 'Пользователь', org: 'Организация', admin: 'Администратор' } as const;

function Profile() {
  const me = useMe();
  if (!me.data) return null;
  return (
    <div className="page">
      <h1>Профиль</h1>
      <dl className="facts">
        <dt>Имя</dt>
        <dd>{me.data.name}</dd>
        <dt>Почта</dt>
        <dd>{me.data.email}</dd>
        <dt>Тип аккаунта</dt>
        <dd>{ROLE_TITLES[me.data.role]}</dd>
        {me.data.organization && (
          <>
            <dt>Организация</dt>
            <dd>{me.data.organization.name}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export const ProfilePage = () => (
  <RequireAuth>
    <Profile />
  </RequireAuth>
);

export const NotFoundPage = () => (
  <div className="page">
    <h1>Страница не найдена</h1>
    <p>
      <Link to="/">Перейти к поиску занятий</Link>
    </p>
  </div>
);
