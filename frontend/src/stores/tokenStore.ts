// Изолированный держатель AT: нет зависимостей → нет циклов.
// client.ts вызывает getToken() в request interceptor;
// authStore.ts вызывает setTokenValue()/clearTokenValue() при setToken/logout.
// Цепочка client.ts → authStore → api/users → client.ts разорвана.

let _token: string | null = null;

export const getToken        = (): string | null => _token;
export const setTokenValue   = (token: string): void => { _token = token; };
export const clearTokenValue = (): void => { _token = null; };
