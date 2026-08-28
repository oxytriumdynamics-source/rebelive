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

// ─── API Base ──────────────────────────────────────────

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1',
  withCredentials: true, // send cookies (refresh token)
});

// Attach access token if present
API.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';
  window.location.href = `${apiBase}/auth/google`;
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
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('accessToken', action.payload);
      }
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
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('accessToken');
      }
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
        // After register, user is NOT yet verified — don't set isAuthenticated
        if (payload.accessToken) {
          state.accessToken = payload.accessToken;
          sessionStorage.setItem('accessToken', payload.accessToken);
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
          sessionStorage.setItem('accessToken', payload.accessToken);
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
          sessionStorage.setItem('accessToken', payload.accessToken);
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
        state.isAuthenticated = true;
        state.emailVerified = payload.emailVerified;
      })
      .addCase(getMe.rejected, (state) => {
        state.loading = false;
        state.user = null;
        state.isAuthenticated = false;
      });

    // ── Logout ────────────────────────────────────────
    builder
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.emailVerified = false;
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('accessToken');
        }
      });
  },
});

export const { setAccessToken, clearAuth, clearError } = authSlice.actions;
export default authSlice.reducer;
