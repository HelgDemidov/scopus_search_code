import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { requestPasswordReset } from '../api/auth';

const schema = z.object({
  email: z.string().email('Invalid email address'),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError(null);
    try {
      await requestPasswordReset(data.email);
      setSent(true);
    } catch {
      setServerError('Server error. Please try again.');
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-slate-100">
            Check your email
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            If this address is registered, you&apos;ll receive a reset link shortly.
          </p>
          <Link
            to="/auth"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2 text-slate-900 dark:text-slate-100">
          Reset your password
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reset-email"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Email
            </label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{errors.email.message}</p>
            )}
          </div>

          {serverError && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{serverError}</p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link
            to="/auth"
            className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
