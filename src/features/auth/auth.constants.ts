export const DEFAULT_ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_TTL_DAYS = 7;
export const LOGIN_FAILED_THRESHOLD = 5;
export const LOCKOUT_MINUTES = 15;
export const REFRESH_COOKIE_NAME = 'refresh_token';
// Must be '/' (not '/auth'): the FE calls these endpoints through a reverse
// proxy under a '/api' prefix, so a browser/proxy-visible request path of
// '/api/auth/refresh' never matches a cookie scoped to '/auth' and the
// cookie silently stops being sent back (session appears lost on reload).
export const REFRESH_COOKIE_PATH = '/';
