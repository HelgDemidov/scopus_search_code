import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '../../lib/utils';
import { swapLocaleInPath } from '../../utils/localeRouting';

// code — канонический i18next-код (сравнение с i18n.language); urlLang —
// его lowercase URL-сегмент, передаётся в swapLocaleInPath (docs/i18n-url-routing/spec.md §5).
const LANGS = [
  { code: 'en',      urlLang: 'en',      label: 'EN' },
  { code: 'ru',      urlLang: 'ru',      label: 'РУ' },
  { code: 'sr-Latn', urlLang: 'sr-latn', label: 'CG' },
] as const;

interface LanguageSwitcherProps {
  /** 'lg' — touch target ≥44×44 (WCAG 2.2, §4.3 ТЗ docs/layout-overhaul/spec.md),
   * используется в MobileNavSheet. Дефолт 'sm' — прежний размер, десктопная
   * шапка не меняется. */
  size?: 'sm' | 'lg';
}

export function LanguageSwitcher({ size = 'sm' }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const current = LANGS.find((l) => l.code === i18n.language) ?? LANGS[0];

  // URL — источник истины (§1/§5 ТЗ): меняем только языковой сегмент пути,
  // LocaleLayout сам подхватит i18n.changeLanguage из нового :lang.
  // Не useLocalizedNavigate — тот резолвит путь через ТЕКУЩИЙ :lang и задвоил
  // бы префикс (swapLocaleInPath уже возвращает полный путь с НОВЫМ языком).
  function handleSelect(urlLang: (typeof LANGS)[number]['urlLang']) {
    navigate(swapLocaleInPath(location.pathname, urlLang) + location.search);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('a11y.switchLanguage')}
        className={cn(
          'flex items-center gap-1 rounded-md text-xs font-semibold cursor-pointer',
          'bg-transparent border-0 transition-colors',
          'text-slate-500 dark:text-slate-400',
          'hover:bg-slate-100 hover:text-slate-900',
          'dark:hover:bg-slate-800 dark:hover:text-slate-100',
          'focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600',
          size === 'lg' ? 'min-h-11 min-w-11 justify-center px-3 text-sm' : 'px-2 py-1.5',
        )}
      >
        {current.label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[4rem]">
        {LANGS.map(({ code, urlLang, label }) => (
          <DropdownMenuItem
            key={code}
            onClick={() => handleSelect(urlLang)}
            aria-current={i18n.language === code ? 'true' : undefined}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
