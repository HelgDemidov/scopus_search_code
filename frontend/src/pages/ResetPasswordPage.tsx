import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { confirmPasswordReset } from '../api/auth';

function makeSchema(t: TFunction) {
  return z
    .object({
      new_password: z
        .string()
        .min(8, t('auth.errors.passwordMin'))
        .regex(/[A-Z]/, t('auth.errors.passwordUpper'))
        .regex(/[a-z]/, t('auth.errors.passwordLower'))
        .regex(/[0-9]/, t('auth.errors.passwordDigit'))
        .regex(/[^A-Za-z0-9]/, t('auth.errors.passwordSpecial')),
      confirm_password: z.string(),
    })
    .refine((d) => d.new_password === d.confirm_password, {
      message: t('auth.errors.passwordsMismatch'),
      path: ['confirm_password'],
    });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

// Локальный show/hide компонент — не выносим в shared (YAGNI, используется только здесь)
function PasswordInput({ id, register }: { id: string; register: UseFormRegisterReturn }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        className="pr-10"
        {...register}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
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

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = useMemo(() => makeSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {t('resetPassword.invalidLink')}
          </p>
          <Link
            to="/forgot-password"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t('resetPassword.requestNew')}
          </Link>
        </div>
      </div>
    );
  }

  async function onSubmit(data: FormData) {
    if (!token) return;
    setServerError(null);
    try {
      await confirmPasswordReset(token, data.new_password);
      toast.success(t('resetPassword.successToast'));
      navigate('/auth', { replace: true });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 422) {
        setServerError(t('resetPassword.linkExpired'));
      } else {
        setServerError(t('auth.errors.serverError'));
      }
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2 text-slate-900 dark:text-slate-100">
          {t('resetPassword.title')}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          {t('resetPassword.subtitle')}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="new-password"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {t('resetPassword.labelNew')}
            </label>
            <PasswordInput id="new-password" register={register('new_password')} />
            {errors.new_password && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{errors.new_password.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="confirm-password"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {t('resetPassword.labelConfirm')}
            </label>
            <PasswordInput id="confirm-password" register={register('confirm_password')} />
            {errors.confirm_password && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{errors.confirm_password.message}</p>
            )}
          </div>

          {serverError && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {serverError}{' '}
              <Link to="/forgot-password" className="underline">
                {t('resetPassword.requestNewLink')}
              </Link>
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            {isSubmitting ? t('resetPassword.btnUpdating') : t('resetPassword.btnUpdate')}
          </Button>
        </form>
      </div>
    </div>
  );
}
