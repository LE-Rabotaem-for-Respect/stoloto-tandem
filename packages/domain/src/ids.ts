// Та же форма, что принимает api (`@IsUUID('all')` в class-validator): версии 1–8 с
// вариантом RFC 4122, а также nil и max. Web отбрасывает остальное до запроса
const UUID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

/** Похоже ли значение на id записи, который примет api. */
export const isUuid = (value: string): boolean => UUID.test(value);
