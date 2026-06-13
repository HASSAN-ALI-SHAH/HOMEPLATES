import axios from 'axios';
import { toast } from './utils/toast';

const API = axios.create({ baseURL: 'http://localhost:5000' });

// Request Interceptor: Attach token dynamically
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Capture session expiry (401 Unauthorized)
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Avoid redirect loops or duplicate logs if we're already on the login page
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/admin-entry') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        toast.error("Session expired! Please login again.");
        
        const isAdminRoute = currentPath.startsWith('/admin');
        setTimeout(() => {
          window.location.href = isAdminRoute ? '/admin-entry' : '/login';
        }, 1500);
      }
    }
    return Promise.reject(error);
  }
);

export default API;