// Central Axios instance used by every component. Keeping this in one place
// means the JWT header + logout-on-401 behaviour only has to be written once.
import { authStore, logout } from './store.js';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      logout();
      window.location.hash = '#/login';
    }
    return Promise.reject(error);
  }
);

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err && err.response && err.response.data && err.response.data.error) {
    return err.response.data.error;
  }
  return fallback;
}

/**
 * Download a protected file (resume, offer letter, report, CSV export).
 *
 * A plain `<a href="/api/...">` can't carry the JWT — the browser navigates
 * to it directly, bypassing the Axios instance (and its Authorization
 * header) entirely, which is why those links returned "Missing
 * Authorization Header". Fetching as a blob through `api` keeps the request
 * authenticated, then we hand the browser a local object URL to save.
 */
export async function downloadFile(url, fallbackFilename = 'download') {
  const response = await api.get(url, { responseType: 'blob' });

  let filename = fallbackFilename;
  const disposition = response.headers['content-disposition'];
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    if (match && match[1]) filename = decodeURIComponent(match[1]);
  }

  const blobUrl = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
  return filename;
}

export default api;
