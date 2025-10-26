import axios from 'axios';

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://api.mightyrankings.com/api/',
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
  timeout: 120_000, // 120s
});

// tiny 1-retry backoff on timeouts / 5xx
axiosClient.interceptors.response.use(undefined, async (err) => {
  const cfg = err.config;
  const retriable = err.code === 'ECONNABORTED' || (err.response && err.response.status >= 500);
  if (!cfg || cfg.__retried || !retriable) throw err;
  cfg.__retried = true;
  await new Promise(r => setTimeout(r, 1000));
  return axiosClient(cfg);
});

export default axiosClient;
