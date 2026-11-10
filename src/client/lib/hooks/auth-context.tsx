import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SessionUser } from '@shared/types';

interface AuthState {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
}

const AuthContext = createContext<AuthState>({ user: null, setUser: () => {} });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** 用户状态唯一来源是 /api/session 查询，这里只做本地覆盖（登录/改名/退出要立刻生效）。只有换账号（id 变了）才用查询结果覆盖，否则每次会话重取都会把刚改好的昵称顶回去。 */
export function AuthProvider({ user: loaded, children }: { user: SessionUser | null; children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(loaded);
  const loadedId = loaded?.id ?? null;

  useEffect(() => {
    setUser((prev) => ((prev?.id ?? null) === loadedId ? prev : loaded));
  }, [loadedId, loaded]);

  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}

/** 把 auth 返回的 user 收成 SessionUser：缺 id/email 当未登录，昵称缺失退化邮箱前缀。 */
export function normalizeUser(raw: unknown): SessionUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const user = raw as Record<string, unknown>;
  if (typeof user.id !== 'string' || typeof user.email !== 'string') return null;
  return {
    id: user.id,
    name: typeof user.name === 'string' && user.name.trim() ? user.name.trim() : user.email.split('@')[0],
    email: user.email,
    image: typeof user.image === 'string' ? user.image : null,
  };
}
