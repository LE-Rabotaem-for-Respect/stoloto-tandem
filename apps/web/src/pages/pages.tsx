import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  LoginForm,
  QuickLogin,
  RegisterForm,
  RequireAuth,
  pendingActionFrom,
  safeNext,
  useMe,
} from '../features/auth';
import { FeedScreen } from '../features/feed';
import { NotificationCenter } from '../features/notifications';
import { MyParticipations } from '../features/participations';

function useReturnAfterSignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const next = safeNext(params.get('next'));
  // Отложенное действие гостя передаётся дальше только успешным входом и только на его страницу
  const pending = pendingActionFrom(location.state);
  const carry =
    pending && new URL(next, window.location.origin).pathname === pending.path
      ? { pendingAction: pending }
      : null;
  return {
    next,
    // Переход между входом и регистрацией несёт действие с собой
    carry,
    done: () => void navigate(next, { replace: true, state: carry }),
  };
}

export function LoginPage() {
  const { next, carry, done } = useReturnAfterSignIn();
  const me = useMe();
  // Уже вошедшему форма не нужна — сразу туда, куда он шёл
  if (me.data) return <Navigate to={next} replace />;
  const registerLink = next === '/' ? '/register' : `/register?next=${encodeURIComponent(next)}`;
  return (
    <div className="page page-narrow">
      <h1>Вход</h1>
      <LoginForm onSignedIn={done} />
      <p>
        Нет аккаунта?{' '}
        <Link to={registerLink} state={carry} replace>
          Зарегистрироваться
        </Link>
      </p>
      <QuickLogin onSignedIn={done} />
    </div>
  );
}

export function RegisterPage() {
  const { next, carry, done } = useReturnAfterSignIn();
  const me = useMe();
  if (me.data) return <Navigate to={next} replace />;
  const loginLink = next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
  return (
    <div className="page page-narrow">
      <h1>Регистрация</h1>
      <RegisterForm onSignedIn={done} />
      <p>
        Уже есть аккаунт?{' '}
        <Link to={loginLink} state={carry} replace>
          Войти
        </Link>
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

export const FeedPage = () => <FeedScreen />;

export const EventPage = () => (
  <Section title="Мероприятие" text="Здесь будет карточка мероприятия." />
);

export const MyParticipationsPage = () => (
  <RequireAuth>
    <div className="page">
      <h1>Мои записи</h1>
      <MyParticipations />
    </div>
  </RequireAuth>
);

export const CreateEventPage = () => (
  <RequireAuth>
    <Section title="Создать мероприятие" text="Здесь будет форма создания мероприятия." />
  </RequireAuth>
);

export const NotificationsPage = () => (
  <RequireAuth>
    <div className="page">
      <h1>Уведомления</h1>
      <NotificationCenter />
    </div>
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
            <dd>
              <Link to="/organization">{me.data.organization.name}</Link>
            </dd>
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
