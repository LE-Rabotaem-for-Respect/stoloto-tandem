// Без секрета сессий api не стартует (DECISION-002): тестам, которые собирают
// приложение целиком, — один общий тестовый секрет
process.env.SESSION_SECRET ??= 'test-session-secret-for-api-unit-tests';
