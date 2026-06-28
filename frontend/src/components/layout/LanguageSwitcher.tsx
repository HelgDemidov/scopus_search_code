import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const LANGS = [
  { code: 'en',      label: 'EN' },
  { code: 'ru',      label: 'РУ' },
  { code: 'sr-Latn', label: 'CG' },
] as const;

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = LANGS.find((l) => l.code === i18n.language) ?? LANGS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('a11y.switchLanguage')}
        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold cursor-pointer
                   bg-transparent border-0 transition-colors
                   text-slate-500 dark:text-slate-400
                   hover:bg-slate-100 hover:text-slate-900
                   dark:hover:bg-slate-800 dark:hover:text-slate-100
                   focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
      >
        {current.label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[4rem]">
        {LANGS.map(({ code, label }) => (
          <DropdownMenuItem
            key={code}
            onClick={() => void i18n.changeLanguage(code)}
            aria-current={i18n.language === code ? 'true' : undefined}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
