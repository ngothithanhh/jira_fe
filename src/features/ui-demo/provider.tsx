'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { createSeed } from './fixtures';
import { findUser } from './logic';
import type { ActionContext, ActionResult, DemoState, DemoUser } from './types';

/** Kịch bản duyệt trạng thái trang; chỉ đổi cách hiển thị, không ghi đè dữ liệu mẫu. */
export type Scenario = 'normal' | 'loading' | 'empty' | 'error' | 'forbidden' | 'not-found';

type DemoContextValue = {
  state: DemoState;
  me: DemoUser | undefined;
  scenario: Scenario;
  setScenario: (scenario: Scenario) => void;
  /** Chạy transition thuần với người dùng phiên hiện tại; thành công mới thay state. */
  exec: (fn: (state: DemoState, ctx: ActionContext) => ActionResult) => ActionResult;
  /** exec + toast: lỗi hiện thông báo cụ thể, thành công hiện message nếu có. */
  act: (fn: (state: DemoState, ctx: ActionContext) => ActionResult, success?: string) => ActionResult;
  reset: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

/** Object URL đang được state tham chiếu (tệp đính kèm cục bộ và avatar). */
function objectUrls(state: DemoState) {
  return new Set(
    [...state.attachments.map((a) => a.objectUrl), ...state.users.map((u) => u.avatarUrl)].filter(
      (url): url is string => !!url && url.startsWith('blob:'),
    ),
  );
}

/**
 * Nguồn dữ liệu duy nhất của mọi trang /ui-review. State chỉ sống trong bộ nhớ:
 * tải lại trang hoặc Reset đưa về seed; không ghi localStorage, cookie hay token.
 * Transition được tính bên ngoài setState từ ref state mới nhất, nên StrictMode không chạy lặp side effect.
 */
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(createSeed);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const ref = useRef(state);

  const commit = useCallback((next: DemoState) => {
    const before = objectUrls(ref.current);
    const after = objectUrls(next);
    // Thu hồi URL của tệp/avatar không còn được tham chiếu để không rò bộ nhớ.
    for (const url of before) if (!after.has(url)) URL.revokeObjectURL(url);
    ref.current = next;
    setState(next);
  }, []);

  const exec = useCallback(
    (fn: (s: DemoState, ctx: ActionContext) => ActionResult) => {
      const current = ref.current;
      const result = fn(current, { actorId: current.session?.userId ?? null, now: new Date().toISOString() });
      if (result.ok && result.state !== current) commit(result.state);
      return result;
    },
    [commit],
  );

  const act = useCallback(
    (fn: (s: DemoState, ctx: ActionContext) => ActionResult, success?: string) => {
      const result = exec(fn);
      if (!result.ok) toast.error(result.message);
      else if (success) toast.success(success);
      return result;
    },
    [exec],
  );

  const reset = useCallback(() => {
    commit(createSeed());
    setScenario('normal');
  }, [commit]);

  // Provider unmount (rời /ui-review): thu hồi mọi Object URL còn lại.
  useEffect(
    () => () => {
      for (const url of objectUrls(ref.current)) URL.revokeObjectURL(url);
    },
    [],
  );

  const value = useMemo<DemoContextValue>(
    () => ({ state, me: findUser(state, state.session?.userId), scenario, setScenario, exec, act, reset }),
    [state, scenario, exec, act, reset],
  );
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

/** Dừng khi dùng ngoài /ui-review để trang thật không âm thầm rơi về dữ liệu mẫu. */
export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error('DemoProvider là bắt buộc cho các trang /ui-review.');
  return value;
}
