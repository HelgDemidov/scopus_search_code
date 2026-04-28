import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useAuthStore } from '../stores/authStore';
import { login, register as registerUser } from '../api/auth';

// Zod schema for the sign-in form
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Zod schema for the registration form — mirrors the backend Pydantic validator requirements
const registerSchema = z
  .object({
    username: z.string().min(2, 'Username must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Minimum 8 characters')
      .regex(/[A-Z]/, 'At least one uppercase letter required')
      .regex(/[a-z]/, 'At least one lowercase letter required')
      .regex(/[0-9]/, 'At least one digit required')
      .regex(/[^A-Za-z0-9]/, 'At least one special character required (!@#$%^&* etc.)'),
    password_confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: 'Passwords do not match',
    path: ['password_confirm'],
  });

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

// Sign-in form
function SignInForm() {
  const navigate = useNavigate();
  const { setToken, fetchUser } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginFormData) {
    setServerError(null);
    try {
      const { access_token } = await login({ email: data.email, password: data.password });
      setToken(access_token);
      await fetchUser();
      navigate('/');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setServerError(
        status === 401
          ? 'Invalid email or password'
          : 'Server error. Please try again.',
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="login-email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Email
        </label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{errors.email.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="login-password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Password
        </label>
        <PasswordInput id="login-password" register={register('password')} />
        {errors.password && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{errors.password.message}</p>
        )}
      </div>

      {serverError && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{serverError}</p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

// Registration form
function CreateAccountForm() {
  const navigate = useNavigate();
  const { setToken, fetchUser } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(data: RegisterFormData) {
    setServerError(null);
    try {
      // Step 1: register — JSON body
      await registerUser({
        username: data.username,
        email: data.email,
        password: data.password,
        password_confirm: data.password_confirm,
      });

      // Step 2: auto-login
      const { access_token } = await login({ email: data.email, password: data.password });
      setToken(access_token);
      await fetchUser();
      navigate('/');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown } };
      const status = axiosErr?.response?.status;
      const data = axiosErr?.response?.data as {
        detail?: string | Array<{ msg: string }>;
      } | undefined;

      if (status === 409) {
        setServerError('An account with this email already exists');
      } else if (status === 422) {
        // Pydantic returns detail as an array of objects with a msg field
        const detail = data?.detail;
        if (Array.isArray(detail) && detail.length > 0) {
          // Strip the "Value error, " prefix added by Pydantic
          setServerError(detail[0].msg.replace(/^Value error,\s*/i, ''));
        } else if (typeof detail === 'string') {
          setServerError(detail);
        } else {
          setServerError('Please check that all fields are filled in correctly');
        }
      } else {
        setServerError('Server error. Please try again.');
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="reg-username" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Username
        </label>
        <Input id="reg-username" placeholder="johndoe" {...register('username')} />
        {errors.username && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{errors.username.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reg-email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Email
        </label>
        <Input id="reg-email" type="email" autoComplete="email" placeholder="you@example.com" {...register('email')} />
        {errors.email && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{errors.email.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reg-password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Password
        </label>
        <PasswordInput id="reg-password" register={register('password')} />
        {errors.password && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{errors.password.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reg-confirm" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Confirm password
        </label>
        <PasswordInput id="reg-confirm" register={register('password_confirm')} />
        {errors.password_confirm && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{errors.password_confirm.message}</p>
        )}
      </div>

      {serverError && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{serverError}</p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400">
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}

// Helper component: password field with show/hide toggle
function PasswordInput({
  id,
  register,
}: {
  id: string;
  register: UseFormRegisterReturn;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete="current-password"
        className="pr-10"
        {...register}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
      >
        {show ? (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4" aria-hidden="true">
            <path d="M3 3l14 14M10 4C5.5 4 2 10 2 10s1 1.5 2.5 2.5M17.5 7.5C18.5 9 18 10 18 10c-1 1.5-4 5.5-8 5.5a6.5 6.5 0 0 1-2.5-.5" strokeLinecap="round" />
            <circle cx="10" cy="10" r="2" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4" aria-hidden="true">
            <path d="M2 10s3.5-6 8-6 8 6 8 6-3.5 6-8 6-8-6-8-6Z" />
            <circle cx="10" cy="10" r="2.5" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get('error') === 'oauth_failed';

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Page heading */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Welcome to Scopus Search
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Sign in to access live Scopus search
          </p>
        </div>

        {/* OAuth error */}
        {oauthError && (
          <div className="mb-4 rounded-md bg-rose-50 dark:bg-rose-900/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
            Google sign-in failed. Please try again.
          </div>
        )}

        {/* Google OAuth button */}
        <button
          onClick={() => { window.location.href = '/auth/google/login'; }}
          className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="relative my-4 flex items-center gap-2">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span className="text-xs text-slate-400">&mdash; or &mdash;</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Sign In / Create Account tabs */}
        <Tabs defaultValue="signin">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="signin" className="flex-1">Sign in</TabsTrigger>
            <TabsTrigger value="register" className="flex-1">Register</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <SignInForm />
          </TabsContent>
          <TabsContent value="register">
            <CreateAccountForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
