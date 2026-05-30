import axios, { AxiosInstance, AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// Endpoints that must never trigger a refresh-token retry. /auth/refresh
// itself is the obvious one; logging in/out shouldn't retry either.
const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/login', '/auth/logout', '/auth/register'];

type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

class ApiClient {
  private client: AxiosInstance;
  // In-flight refresh promise — used so a burst of 401s only triggers ONE
  // refresh call; all of them await the same result.
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor - Add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor - Handle 401 with one refresh attempt
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const original = error.config as RetryableConfig | undefined;
        const status = error.response?.status;

        if (status !== 401 || !original || original._retried) {
          return Promise.reject(error);
        }

        const url = original.url ?? '';
        if (NO_REFRESH_PATHS.some((p) => url.includes(p))) {
          this.handleAuthFailure();
          return Promise.reject(error);
        }

        original._retried = true;
        const newAccessToken = await this.refreshAccessToken();
        if (!newAccessToken) {
          this.handleAuthFailure();
          return Promise.reject(error);
        }

        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return this.client.request(original);
      },
    );
  }

  /**
   * Refresh access token, dedup-ed across concurrent 401s.
   * Returns the new access token, or null if refresh failed.
   */
  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) return null;

      try {
        // Use a bare axios call so the response interceptor doesn't recurse.
        const res = await axios.post<{
          success: boolean;
          data?: { accessToken?: string; refreshToken?: string };
        }>(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { timeout: 15000 });

        const accessToken = res.data?.data?.accessToken;
        const newRefresh = res.data?.data?.refreshToken;
        if (!accessToken) return null;

        this.setTokens(accessToken, newRefresh ?? refreshToken);
        return accessToken;
      } catch {
        return null;
      } finally {
        // Allow future refreshes after this one settles.
        setTimeout(() => {
          this.refreshPromise = null;
        }, 0);
      }
    })();

    return this.refreshPromise;
  }

  private handleAuthFailure(): void {
    this.clearTokens();
    if (typeof window === 'undefined') return;
    // Only bounce to /login if we're not already on a public page; otherwise
    // a 401 on a background call shouldn't disrupt the user.
    const path = window.location.pathname;
    const onPublic =
      path === '/' ||
      path.startsWith('/login') ||
      path.startsWith('/register') ||
      path.startsWith('/products') ||
      path.startsWith('/sellers/register') ||
      path.startsWith('/admin/login');
    if (!onPublic) {
      window.location.href = '/login';
    }
  }

  private getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('access_token');
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refresh_token');
  }

  private clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('access_token', token);
  }

  setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    // Signal to long-lived consumers (sockets) that the access token has
    // changed — they should reconnect with the new token.
    window.dispatchEvent(new CustomEvent('auth:tokens-changed'));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get<T = any>(url: string, config?: AxiosRequestConfig) {
    return this.client.get<T>(url, config);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return this.client.post<T>(url, data, config);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return this.client.patch<T>(url, data, config);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  put<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return this.client.put<T>(url, data, config);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete<T = any>(url: string, config?: AxiosRequestConfig) {
    return this.client.delete<T>(url, config);
  }
}

export const apiClient = new ApiClient();

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp?: string;
}

