import { TIME_ZONE } from '@tandem/domain';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { ICONS } from '../../shared/illustrations';
import type { IconName } from '../../shared/illustrations';
import { Icon } from '../../shared/ui/Icon';
import { useMarkAllRead, useNotifications } from './api';
import type { NotificationItem } from './api';

const isIcon = (name: string): name is IconName => (ICONS as readonly string[]).includes(name);

const when = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/** Счётчик непрочитанных у пункта «Уведомления» (ТЗ 3.3, колокольчик). */
export function UnreadBadge() {
  const notifications = useNotifications();
  const unread = notifications.data?.unread ?? 0;
  if (unread === 0) return null;
  return (
    <span className="badge">
      {unread > 99 ? '99+' : unread}
      <span className="visually-hidden"> непрочитанных</span>
    </span>
  );
}

function Row({ item }: { item: NotificationItem }) {
  const content = (
    <>
      {isIcon(item.icon) && <Icon name={item.icon} />}
      <span className="notification-text">{item.text}</span>
      <time className="notification-time" dateTime={item.createdAt}>
        {when.format(new Date(item.createdAt))}
      </time>
    </>
  );
  return (
    <li className={item.read ? 'notification' : 'notification notification-unread'}>
      {item.link ? (
        <Link className="notification-body" to={item.link}>
          {content}
        </Link>
      ) : (
        <div className="notification-body">{content}</div>
      )}
      {!item.read && <span className="visually-hidden">Новое</span>}
    </li>
  );
}

/** Центр уведомлений: пиктограмма типа и одна строка, переход на целевой экран. */
export function NotificationCenter() {
  const notifications = useNotifications();
  const markAllRead = useMarkAllRead();
  const unread = notifications.data?.unread ?? 0;
  const { mutate } = markAllRead;

  // Открыл центр — увидел: непрочитанные становятся прочитанными, подсветка остаётся до ухода
  useEffect(() => {
    if (unread > 0) mutate();
  }, [unread, mutate]);

  if (notifications.isPending) return <p role="status">Загрузка…</p>;
  if (notifications.isError) {
    return <p role="alert">Не удалось загрузить уведомления. Попробуйте обновить страницу</p>;
  }
  if (notifications.data.items.length === 0) {
    return <p>Уведомлений пока нет. Здесь появятся ответы на заявки и изменения мероприятий.</p>;
  }
  return (
    <ul className="notifications">
      {notifications.data.items.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </ul>
  );
}
