import { TIME_ZONE } from '@tandem/domain';

const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

export function App({ now = new Date() }: { now?: Date }) {
  return (
    <main>
      <h1>Столото: спорт вместе</h1>
      <p>Приложение в разработке. Здесь появятся мероприятия и запись на них.</p>
      <p>Сейчас в Красноярске {timeFormat.format(now)}</p>
    </main>
  );
}
