'use client';

import { useEffect } from 'react';
import { ConnectedError, connectedRequest } from '../client';
import type { VerificationView } from './contract';

export const REGISTRATION = 'auth/registration';
export const ACCOUNT_EMAIL = 'account/email-verification';
const ID_HEADER = 'X-Jira-Challenge-Id';

export type RegistrationInput = { email: string; password: string; userName: string; fullName: string };

export function startRegistration(form: RegistrationInput) {
  return registrationWrite<VerificationView>('auth/register', form);
}

export function registrationWrite<T>(route: string, data: object) {
  const send = () => connectedRequest<T>(route, { method: 'POST', body: JSON.stringify(data) }, false);
  return navigator.locks ? navigator.locks.request('jira-registration', send) : send();
}

export function verificationStatus(route: string, id?: string, signal?: AbortSignal) {
  return connectedRequest<VerificationView>(route + '/status', {
    headers: id ? { [ID_HEADER]: id } : {}, signal,
  }, false);
}

export function verificationMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Chưa xác nhận được kết quả. Vui lòng kiểm tra trạng thái.';
}

export function isUncertain(error: unknown) {
  return error instanceof ConnectedError && (error.status === 0 || error.status >= 500);
}

/** Chỉ đọc trạng thái giao thư đang chờ, tối đa 60 giây cho mỗi lần enqueue. */
export function useDeliveryPoll(path: string, view: VerificationView | null, busy: boolean,
                                update: (view: VerificationView) => void, current?: () => boolean) {
  const { challengeId, state, deliveryState, expiresAt } = view ?? {};
  useEffect(() => {
    if (busy || !challengeId || state !== 'PENDING' || !deliveryState
      || !['QUEUED', 'SENDING', 'RETRY_WAIT'].includes(deliveryState)) return;
    const controller = new AbortController();
    let remaining = 20;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (controller.signal.aborted || (current && !current()) || !expiresAt || Date.parse(expiresAt) <= Date.now()) return;
      try {
        const next = await verificationStatus(path, challengeId, controller.signal);
        if (!controller.signal.aborted && (!current || current())) update(next);
        if (next.state !== 'PENDING' || !['QUEUED', 'SENDING', 'RETRY_WAIT'].includes(next.deliveryState ?? '')) return;
      } catch (error) {
        if (error instanceof ConnectedError && [400, 401, 409, 410].includes(error.status)) return;
      }
      if (!controller.signal.aborted && --remaining > 0) timer = setTimeout(poll, 3000);
    }
    timer = setTimeout(poll, 3000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [path, challengeId, state, deliveryState, expiresAt, busy, update, current]);
}
