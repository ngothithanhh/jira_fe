import axios from 'axios';

// Create an Axios instance
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized or specific JWT expiration errors that might come as 500
    const isUnauthorized = error.response && error.response.status === 401;
    const isJwtError = error.response && 
      (error.response.status === 500 || error.response.status === 403) && 
      typeof error.response.data?.message === 'string' && 
      error.response.data.message.toLowerCase().includes('jwt');

    const isLoginRequest = /\/auth\/(login|register)(?:\?|$)/.test(error.config?.url || '');
    if ((isUnauthorized || isJwtError) && !isLoginRequest) {
      // Clear token and redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        
        // Only redirect if we are not already on the sign-in or sign-up page
        if (!window.location.pathname.includes('/sign-in') && !window.location.pathname.includes('/sign-up')) {
          window.location.href = '/sign-in';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
