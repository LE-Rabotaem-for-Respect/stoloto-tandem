import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DemoAccountKey } from '@tandem/domain';
import { ApiRequestError, apiRequest } from '../../shared/api';

/** Текущий пользователь — ответ `GET /me` (только свои поля, без хеша пароля). */
export interface Me {
  id: string;
  role: 'user' | 'org' | 'admin';
  name: string;
  email: string;
  city: string | null;
  bio: string | null;
  settings: unknown;
  organization: { id: string; name: string; status: string } | null;
}

/** Режим стенда — из `GET /clock`, а не из сборки: образ один на все стенды. */
export interface StandInfo {
  now: string;
  demoMode: boolean;
  standId: string | null;
  lastResetAt: string | null;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface RegisterBody {
  accountType: 'person' | 'organization';
  name: string;
  email: string;
  password: string;
  organizationName?: string;
}

export const ME_KEY = ['me'] as const;
const STAND_KEY = ['clock'] as const;

/** `null` — гость. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await apiRequest<Me>('/me');
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export function useStandInfo() {
  return useQuery({
    queryKey: STAND_KEY,
    queryFn: () => apiRequest<StandInfo>('/clock'),
    staleTime: 60_000,
  });
}

// После входа под другим аккаунтом данные прежнего пользователя в кеше не нужны
function useSignIn<Body>(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Body) => apiRequest<Me>(path, { method: 'POST', body }),
    onSuccess: (me) => {
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== STAND_KEY[0] });
      client.setQueryData(ME_KEY, me);
    },
  });
}

export const useLogin = () => useSignIn<LoginBody>('/auth/login');
export const useRegister = () => useSignIn<RegisterBody>('/auth/register');
export const useDemoLogin = () => useSignIn<{ account: DemoAccountKey }>('/auth/demo-login');

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<undefined>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== STAND_KEY[0] });
      client.setQueryData(ME_KEY, null);
    },
  });
}
