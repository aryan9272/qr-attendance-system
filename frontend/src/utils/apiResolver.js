let cachedWorkingBase = null;

export const getApiEndpoints = () => {
  const endpoints = [];

  // Prioritize previously verified working base URL
  if (cachedWorkingBase) {
    endpoints.push(cachedWorkingBase);
  }

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

  return [...new Set(endpoints.filter(Boolean))];
};

export async function fetchWithFailover(path, options = {}) {
  const endpoints = getApiEndpoints();
  let lastError = null;
  const method = (options.method || 'GET').toUpperCase();
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  for (const base of endpoints) {
    let res = null;
    try {
      const url = `${base}${path.startsWith('/') ? path : '/' + path}`;
      res = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
        },
      });

      const contentType = res.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: text };
        }
      }

      // If we received a response from this server, cache it as working
      cachedWorkingBase = base;
      return { res, data, baseUrl: base };
    } catch (err) {
      lastError = err;
      console.warn(`[ApiResolver] Failed to fetch ${base}${path}:`, err.message);

      // CRITICAL: If the request was mutating and a response was already received from the server
      // (e.g., error during JSON parse or non-200), DO NOT replay the mutation on another host!
      if (isMutating && res) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Failed to connect to backend server on all endpoints.');
}
