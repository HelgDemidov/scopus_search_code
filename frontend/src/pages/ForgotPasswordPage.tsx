import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { requestPasswordReset } from '../api/auth';

function makeSchema(t: TFunction) {
  return z.object({
    email: z.string().email(t('auth.errors.invalidEmail')),
  });
}
type FormData = z.infer<ReturnType<typeof makeSchema>>;

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = useMemo(() => makeSchema(t), [t]);

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
      setServerError(t('auth.errors.serverError'));
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold mb-4 text-slate-900 dark:text-slate-100">
            {t('forgotPassword.checkEmailTitle')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {t('forgotPassword.checkEmailBody')}
          </p>
          <Link
            to="/auth"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t('forgotPassword.backToSignIn')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2 text-slate-900 dark:text-slate-100">
          {t('forgotPassword.title')}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          {t('forgotPassword.subtitle')}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="reset-email"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {t('auth.labelEmail')}
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
            {isSubmitting ? t('forgotPassword.btnSending') : t('forgotPassword.btnSend')}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link
            to="/auth"
            className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
          >
            {t('forgotPassword.backToSignIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
