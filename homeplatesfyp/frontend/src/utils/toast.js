// src/utils/toast.js
import { toast as hotToast } from 'react-hot-toast';

export const toast = {
  success: (message) => {
    hotToast.success(message);
  },
  error: (message) => {
    hotToast.error(message);
  },
  info: (message) => {
    hotToast(message);
  }
};
export default toast;
