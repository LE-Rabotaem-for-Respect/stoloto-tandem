import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiRequest } from '../api';

/** Ответ `GET /clock`: «сейчас» сервера и режим стенда (не из сборки: образ один на все стенды). */
export interface StandInfo {
  now: string;
  demoMode: boolean;
  standId: string | null;
  lastResetAt: string | null;
}

interface ClockSnapshot extends StandInfo {
  /** Разница часов сервера (с демо-сдвигом) и браузера, мс. */
  offsetMs: number;
}

export const CLOCK_KEY = ['clock'] as const;

export function useStandInfo() {
  return useQuery({
    queryKey: CLOCK_KEY,
    queryFn: async (): Promise<ClockSnapshot> => {
      const info = await apiRequest<StandInfo>('/clock');
      return { ...info, offsetMs: Date.parse(info.now) - Date.now() };
    },
    staleTime: 60_000,
  });
}

/**
 * «Сейчас» для интерфейса — время сервера (DECISION-002): в демо-режиме оно
 * перематывается, и «через 2 дня» или «Идёт» должны меняться вместе с ним.
 * Пока ответа нет — часы браузера. Обновляется раз в минуту.
 */
export function useClock(): Date {
  const stand = useStandInfo();
  const offsetMs = stand.data?.offsetMs ?? 0;
  // Состояние — только тик часов браузера; сдвиг сервера прибавляется при чтении
  const [browserNow, setBrowserNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setBrowserNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return new Date(browserNow + offsetMs);
}
