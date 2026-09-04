export const getApiEndpoints = () => {
  const endpoints = [];
  if (import.meta.env.VITE_BACKEND_URL) endpoints.push(import.meta.env.VITE_BACKEND_URL.replace(/\/$/, ''));
  if (import.meta.env.VITE_API_BASE_URL) endpoints.push(import.meta.env.VITE_API_BASE_URL.replace(/\/$/, ''));

  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      endpoints.push('http://127.0.0.1:5000');
      endpoints.push('http://localhost:5000');
    } else if (!window.location.hostname.includes('vercel.app')) {
      endpoints.push(`http://${window.location.hostname}:5000`);
    }
  }

  endpoints.push('http://127.0.0.1:5000');
  endpoints.push('http://localhost:5000');

  return [...new Set(endpoints)];
};

export async function fetchWithFailover(path, options = {}) {
  const endpoints = getApiEndpoints();
  let lastError = null;

  for (const base of endpoints) {
    try {
      const url = `${base}${path.startsWith('/') ? path : '/' + path}`;
      const res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
        },
      });
      const data = await res.json();
      return { res, data, baseUrl: base };
    } catch (err) {
      lastError = err;
      console.warn(`[ApiResolver] Failed to fetch ${base}${path}:`, err.message);
    }
  }

  throw lastError || new Error('Failed to connect to backend server on all endpoints.');
}
