/**
 * MOCK: Auth data and functions
 * This module provides mock authentication without backend
 */

// Using native crypto.randomUUID() instead of uuid package

export interface MockUser {
  $id: string;
  name: string;
  email: string;
  createdAt: string;
}

const MOCK_USERS = [
  {
    $id: 'user_demo_001',
    name: 'Demo User',
    email: 'demo@example.com',
    password: 'Demo123!',
    createdAt: new Date().toISOString(),
  },
  {
    $id: 'user_demo_002',
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'Admin123!',
    createdAt: new Date().toISOString(),
  },
];

const STORAGE_KEY_AUTH = 'mock_auth_session';
const STORAGE_KEY_USER = 'mock_current_user';
const COOKIE_AUTH = 'mock_auth_session';
const COOKIE_USER = 'mock_current_user';

export async function mockRegister(
  name: string,
  email: string,
  password: string,
): Promise<{ data: MockUser }> {
  // MOCK: Check if user exists
  const existingUser = MOCK_USERS.find((u) => u.email === email);
  if (existingUser) {
    throw new Error('User with that email already exists');
  }

  // MOCK: Create new user
  const newUser: MockUser = {
    $id: `user_${crypto.randomUUID()}`,
    name,
    email,
    createdAt: new Date().toISOString(),
  };

  MOCK_USERS.push({ ...newUser, password } as any);

  // Set cookies and localStorage for auth
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_AUTH, `session_${newUser.$id}`);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
    
    // Set cookies so they're sent to the server
    document.cookie = `${COOKIE_AUTH}=session_${newUser.$id}; path=/; Max-Age=86400`;
    document.cookie = `${COOKIE_USER}=${encodeURIComponent(JSON.stringify(newUser))}; path=/; Max-Age=86400`;
  }

  return { data: newUser };
}

export async function mockLogin(
  email: string,
  password: string,
): Promise<{ data: MockUser }> {
  // MOCK: Find user
  const user = MOCK_USERS.find((u) => u.email === email);

  if (!user || (user as any).password !== password) {
    throw new Error('Invalid email or password');
  }

  const { password: _, ...userWithoutPassword } = user as any;

  // Set cookies and localStorage for auth
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_AUTH, `session_${user.$id}`);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userWithoutPassword));
    
    // Set cookies so they're sent to the server
    document.cookie = `${COOKIE_AUTH}=session_${user.$id}; path=/; Max-Age=86400`;
    document.cookie = `${COOKIE_USER}=${encodeURIComponent(JSON.stringify(userWithoutPassword))}; path=/; Max-Age=86400`;
  }

  return { data: userWithoutPassword };
}

export async function mockLogout(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_AUTH);
    localStorage.removeItem(STORAGE_KEY_USER);
    
    // Clear cookies
    document.cookie = `${COOKIE_AUTH}=; path=/; Max-Age=0`;
    document.cookie = `${COOKIE_USER}=; path=/; Max-Age=0`;
  }
}

export async function mockGetCurrent(): Promise<{ data: MockUser | null }> {
  // Try to read from cookies (server-side)
  try {
    const { cookies: cookieFn } = await import('next/headers');
    const cookieStore = await cookieFn();
    const userCookie = cookieStore.get(COOKIE_USER);
    
    if (userCookie?.value) {
      return { data: JSON.parse(decodeURIComponent(userCookie.value)) };
    }
  } catch {
    // Not in server context, try localStorage
  }

  // Fall back to localStorage (client-side)
  if (typeof window === 'undefined') {
    return { data: null };
  }

  const session = localStorage.getItem(STORAGE_KEY_AUTH);
  if (!session) {
    return { data: null };
  }

  const userJson = localStorage.getItem(STORAGE_KEY_USER);
  if (!userJson) {
    return { data: null };
  }

  try {
    return { data: JSON.parse(userJson) };
  } catch {
    return { data: null };
  }
}

export function getCurrentUserSync(): MockUser | null {
  // Try localStorage first (client-side)
  if (typeof window !== 'undefined') {
    const userJson = localStorage.getItem(STORAGE_KEY_USER);
    if (userJson) {
      try {
        return JSON.parse(userJson);
      } catch {
        return null;
      }
    }
  }

  return null;
}
