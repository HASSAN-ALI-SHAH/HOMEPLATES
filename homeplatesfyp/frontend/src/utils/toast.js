// src/utils/toast.js
export const toast = {
  success: (message) => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type: 'success' } }));
  },
  error: (message) => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type: 'error' } }));
  },
  info: (message) => {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type: 'info' } }));
  }
};
export default toast;
