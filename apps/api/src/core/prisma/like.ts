/** Текст для LIKE/ILIKE: символы % и _ из ввода — обычные буквы, а не шаблон. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);
