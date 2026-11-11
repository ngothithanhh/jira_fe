'use server';

/**
 * MOCK: Auth server actions
 * 
 * These functions have been replaced with mock implementations.
 * Data is stored in localStorage on the client side.
 */

import { cookies } from 'next/headers';

export async function getCurrent() {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get('token')?.value;

    if (!token) return null;

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api'}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.user) {
      data.user.$id = String(data.user.id);
    }
    return data.user;
  } catch {
    return null;
  }
}