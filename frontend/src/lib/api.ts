import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

export function msToTimestamp(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  const secStr = String(seconds).padStart(2, '0');
  return millis === 0
    ? `${minutes}:${secStr}`
    : `${minutes}:${secStr}.${String(millis).padStart(3, '0').replace(/0+$/, '')}`;
}

export function formatRating(r: number | null): string {
  if (r === null) return '—';
  return r.toFixed(1);
}
