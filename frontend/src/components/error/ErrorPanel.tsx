import { useState, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ErrorPanelProps {
  statusLabel: string;
  monoLabel?: string;
  monoValue?: string;
  copyable?: boolean;
  title: string;
  description: string;
  children?: ReactNode; // кнопки действий
}

// Общая «readout»-панель для error-страниц (404/route error) — см.
// docs/error-experience/spec.md, раздел «Дизайн». Токены — те же, что и в
// остальном тёмном режиме (#152236/slate-700), telemetry-строка — font-mono.
// Панель всегда тёмная независимо от темы сайта (сигнатурный «космический»
// вид не завязан на light/dark toggle) — только статус-лейбл ниже теперь
// theme-aware (голубой кнопок дневной/ночной версии, см. п.3 доработки).
export function ErrorPanel({
  statusLabel, monoLabel, monoValue, copyable, title, description, children,
}: ErrorPanelProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!monoValue) return;
    await navigator.clipboard.writeText(monoValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    // pt-[38px] ≈ условный «1см» от нижней рамки шапки (header h-14+border,
    // фиксированная высота на всех вьюпортах — единое значение уже даёт
    // пропорциональный результат и на мобильном, отдельный брейкпоинт не нужен)
    <div className="relative z-10 flex min-h-[70vh] items-start justify-center px-4 pt-[38px]">
      {/*
        70% прозрачности — ТОЛЬКО в dark: там за панелью реально есть что
        показать (StarFieldCanvas рендерится исключительно в dark-теме).
        В light фона-«под спектаклем» нет вообще (просто белая страница), а
        текст (slate-100/slate-400) рассчитан на непрозрачную тёмную панель —
        с прозрачностью в light он терял контраст почти до нечитаемости
        (проверено: заголовок/описание становились еле видны на просвечивающем
        белом). Поэтому light остаётся полностью непрозрачным, как было.
      */}
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-[#152236] p-6 text-center shadow-xl dark:bg-[#152236]/30">
        <p className="text-lg font-bold tracking-widest text-blue-800 dark:text-blue-500">{statusLabel}</p>

        {monoLabel && monoValue && (
          <div className="mt-2 flex items-center justify-center gap-2 font-mono text-xs text-slate-400">
            <span className="truncate">{monoLabel} {monoValue}</span>
            {copyable && (
              <button
                type="button"
                onClick={handleCopy}
                aria-label={t('errors.routeError.copyId')}
                className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        )}

        <h1 className="mt-4 text-lg font-semibold text-slate-100">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">{description}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {children}
        </div>
      </div>
    </div>
  );
}
