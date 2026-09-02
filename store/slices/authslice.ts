import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import axios from 'axios';

// ─── Types ─────────────────────────────────────────────

export interface PersonalityType {
  id: string;
  name: string;
  slug: string;
  cardImage: string;
  colorHex: string;
  description: string;
  tagline?: string | null;
  traits: string[];
}

export interface UserPreference {
  id: string;
  userId: string;
  personalityTypeId?: string | null;
  personalityType?: PersonalityType | null;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: string;
  emailVerified: boolean;
  avatarUrl?: string | null;
  authProvider: string;
  createdAt: string;
  lastLoginAt?: string | null;
  preferences?: UserPreference | null;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  emailVerified: boolean;
  loading: boolean;
  error: string | null;
  otpSent: boolean;
  otpVerifying: boolean;
  otpError: string | null;
}

// ─── Storage helper ────────────────────────────────────
// localStorage persists across browser closes, unlike sessionStorage.

const TOKEN_KEY = 'accessToken';

function saveToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

// ─── API Base ──────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

const API = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // send cookies (refresh token)
});

// ── Request interceptor: attach stored access token ──
API.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor: silent token refresh on 401 ──
// When the 15-min access token expires, automatically call /auth/refresh
// (which uses the 7-day httpOnly refresh cookie) to get a new token, then
// retry the original request. This keeps the user logged in across sessions.

let isRefreshing = false;
let refreshQueue: Array<(newToken: string | null) => void> = [];

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean };

    const is401 = error.response?.status === 401;
    const isRefreshEndpoint = original?.url?.includes('/auth/refresh');
    const alreadyRetried = original?._retry;

    if (!is401 || isRefreshEndpoint || alreadyRetried) {
      return Promise.reject(error);
    }

    // If a refresh is already in flight, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push((newToken) => {
          if (newToken) {
            original.headers.Authorization = `Bearer ${newToken}`;
            resolve(API(original));
          } else {
            reject(error);
          }
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      // Use a plain axios call (not API) to avoid triggering this interceptor again
      const { data } = await axios.post(
        `${API_BASE}/auth/refresh`,
        {},
        { withCredentials: true },
      );
      const newToken: string = data.data.accessToken;
      saveToken(newToken);

      // Drain the queue with the new token
      refreshQueue.forEach((cb) => cb(newToken));
      refreshQueue = [];

      // Retry the original request
      original.headers.Authorization = `Bearer ${newToken}`;
      return API(original);
    } catch {
      // Refresh failed (expired / revoked refresh token) — force logout
      clearToken();
      refreshQueue.forEach((cb) => cb(null));
      refreshQueue = [];
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);

// ─── Async Thunks ──────────────────────────────────────

/** Register a new user */
export const registerUser = createAsyncThunk(
  'auth/register',
  async (
    payload: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      phone: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const { data } = await API.post('/auth/register', payload);
      return data.data as { user: AuthUser; accessToken: string; emailVerified: boolean };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        return rejectWithValue(err.response?.data?.message ?? 'Registration failed');
      }
      return rejectWithValue('Registration failed');
    }
  },
);

/** Login with email + password */
export const loginUser = createAsyncThunk(
  'auth/login',
  async (payload: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const { data } = await API.post('/auth/login', payload);
      return data.data as { user: AuthUser; accessToken: string; emailVerified: boolean };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        return rejectWithValue(err.response?.data?.message ?? 'Login failed');
      }
      return rejectWithValue('Login failed');
    }
  },
);

/** Send / resend OTP to email */
export const sendOtp = createAsyncThunk(
  'auth/sendOtp',
  async (email: string, { rejectWithValue }) => {
    try {
      const { data } = await API.post('/auth/send-otp', { email });
      return data.message as string;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        return rejectWithValue(err.response?.data?.message ?? 'Could not send OTP');
      }
      return rejectWithValue('Could not send OTP');
    }
  },
);

/** Verify OTP code */
export const verifyOtp = createAsyncThunk(
  'auth/verifyOtp',
  async (payload: { email: string; otp: string }, { rejectWithValue }) => {
    try {
      const { data } = await API.post('/auth/verify-otp', payload);
      return data.data as { user: AuthUser; accessToken: string; emailVerified: boolean };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        return rejectWithValue(err.response?.data?.message ?? 'OTP verification failed');
      }
      return rejectWithValue('OTP verification failed');
    }
  },
);

/** Fetch current user from /me */
export const getMe = createAsyncThunk('auth/getMe', async (_, { rejectWithValue }) => {
  try {
    const { data } = await API.get('/auth/me');
    return data.data.user as AuthUser;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return rejectWithValue(err.response?.data?.message ?? 'Session expired');
    }
    return rejectWithValue('Session expired');
  }
});

/** Logout */
export const logoutUser = createAsyncThunk('auth/logout', async (_, { rejectWithValue }) => {
  try {
    await API.post('/auth/logout');
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      return rejectWithValue(err.response?.data?.message ?? 'Logout failed');
    }
    return rejectWithValue('Logout failed');
  }
});

/** Initiate Google OAuth — this just redirects the browser */
export function googleLogin(): void {
  window.location.href = `${API_BASE}/auth/google`;
}

/** Claim a persona for a logged-in user (called after signup or manually) */
export const claimPersona = createAsyncThunk(
  'auth/claimPersona',
  async (personaSlug: string, { rejectWithValue }) => {
    try {
      const { data } = await API.post('/quiz/claim-persona', { personaSlug });
      return data.data.personalityType as PersonalityType;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        return rejectWithValue(err.response?.data?.message ?? 'Could not claim persona');
      }
      return rejectWithValue('Could not claim persona');
    }
  },
);

// ─── Slice ─────────────────────────────────────────────

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  emailVerified: false,
  loading: false,
  error: null,
  otpSent: false,
  otpVerifying: false,
  otpError: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Manually set access token (e.g., from Google OAuth callback) */
    setAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
      saveToken(action.payload);
    },
    /** Clear all auth state (client-side logout) */
    clearAuth(state) {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.emailVerified = false;
      state.error = null;
      state.otpSent = false;
      state.otpError = null;
      clearToken();
    },
    clearError(state) {
      state.error = null;
      state.otpError = null;
    },
  },
  extraReducers: (builder) => {
    // ── Register ──────────────────────────────────────
    builder
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.user = payload.user;
        state.emailVerified = payload.emailVerified ?? false;
        // Keep access token in Redux memory ONLY — do NOT persist to localStorage.
        // If the user navigates away before verifying OTP, the home page will NOT
        // find a token and will NOT call getMe(), preventing a bypass of the OTP gate.
        if (payload.accessToken) {
          state.accessToken = payload.accessToken;
        }
        state.otpSent = true; // OTP is sent right after register
      })
      .addCase(registerUser.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload as string;
      });

    // ── Login ─────────────────────────────────────────
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.user = payload.user;
        state.emailVerified = payload.emailVerified ?? false;

        if (payload.emailVerified && payload.accessToken) {
          state.accessToken = payload.accessToken;
          state.isAuthenticated = true;
          saveToken(payload.accessToken); // persists across browser closes
        } else {
          // Not verified — frontend will switch to OTP stage
          state.otpSent = true;
        }
      })
      .addCase(loginUser.rejected, (state, { payload }) => {
        state.loading = false;
        state.error = payload as string;
      });

    // ── Send OTP ──────────────────────────────────────
    builder
      .addCase(sendOtp.pending, (state) => {
        state.otpError = null;
      })
      .addCase(sendOtp.fulfilled, (state) => {
        state.otpSent = true;
      })
      .addCase(sendOtp.rejected, (state, { payload }) => {
        state.otpError = payload as string;
      });

    // ── Verify OTP ────────────────────────────────────────
    builder
      .addCase(verifyOtp.pending, (state) => {
        state.otpVerifying = true;
        state.otpError = null;
      })
      .addCase(verifyOtp.fulfilled, (state, { payload }) => {
        state.otpVerifying = false;
        state.user = payload.user;
        state.emailVerified = true;
        state.isAuthenticated = true;
        state.otpSent = false;
        if (payload.accessToken) {
          state.accessToken = payload.accessToken;
          saveToken(payload.accessToken); // persists across browser closes
        }
        // Auto-claim pending persona if the user just signed up
        // The claimPersona thunk will be dispatched by the component after this
      })
      .addCase(verifyOtp.rejected, (state, { payload }) => {
        state.otpVerifying = false;
        state.otpError = payload as string;
      });

    // ── Claim Persona ─────────────────────────────────────
    builder
      .addCase(claimPersona.fulfilled, (state, { payload }) => {
        // Update the user's preferences with the newly claimed personality type
        if (state.user) {
          state.user = {
            ...state.user,
            preferences: {
              ...(state.user.preferences ?? { id: '', userId: state.user.id }),
              personalityType: payload,
              personalityTypeId: payload.id,
            },
          };
        }
      });

    // ── Get Me ────────────────────────────────────────
    builder
      .addCase(getMe.pending, (state) => {
        state.loading = true;
      })
      .addCase(getMe.fulfilled, (state, { payload }) => {
        state.loading = false;
        state.user = payload;
        state.emailVerified = payload.emailVerified;
        if (payload.emailVerified) {
          // Fully verified — grant authentication
          state.isAuthenticated = true;
        } else {
          // Account exists but email not yet verified.
          // Clear any stale token from localStorage so the home page
          // won't keep trying to auto-login this unverified user.
          state.isAuthenticated = false;
          state.accessToken = null;
          clearToken();
        }
      })
      .addCase(getMe.rejected, (state) => {
        state.loading = false;
        state.user = null;
        state.isAuthenticated = false;
        // Don't clear localStorage here — the refresh interceptor will
        // have already attempted a refresh. If it also failed, the token
        // was cleared by the interceptor. If the error was transient
        // (network), we don't want to force logout.
      });

    // ── Logout ────────────────────────────────────────
    builder
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.emailVerified = false;
        clearToken(); // remove persisted token
      });
  },
});

export const { setAccessToken, clearAuth, clearError } = authSlice.actions;
export default authSlice.reducer;
