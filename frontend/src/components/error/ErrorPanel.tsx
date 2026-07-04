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
    <div className="relative z-10 flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-[#152236] p-6 text-center shadow-xl">
        <p className="font-mono text-xs tracking-widest text-amber-400">{statusLabel}</p>

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
