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

// Панель error-страниц (404/route error) — см. docs/error-experience/spec.md,
// раздел «Дизайн» и п.5.6.4 (раунд 5, редизайн). Никакой сплошной
// карточки (bg/border/shadow) в любой из тем — раньше панель была всегда
// тёмной (bg-[#152236]) независимо от темы сайта, что в light выглядело
// чужеродно (canvas там не рендерится, тёмная «читалка» висела на пустой
// белой странице без причины), а в dark плоская заливка (в т.ч. 70%
// прозрачности, раунд 3) закрывала собой звёздное небо/чёрную дыру позади.
// Вместо карточки — по одному тихому, специфичному для темы акценту (общая
// метафора «сигнал потерян с орбиты», выраженная доступным для каждой темы
// инструментарием): light — статичное разорванное кольцо орбиты (SVG) за
// статус-лейблом; dark — мягкое гало (радиальный градиент на основе цвета
// фона, без острой границы) + угловые риски видоискателя вокруг всего блока.
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
    // fixed + top-14 (=header h-14) + h-[calc(100dvh-3.5rem)] (п.8.5.2,
    // docs/error-experience/spec.md) — раньше был document-flow div с
    // min-h-[70vh]: на iPad landscape Safari `vh` считается от высоты при
    // скрытой адресной строке, реально видимая область меньше на высоту
    // тулбара → появлялся паразитный скролл страницы, и панель (flow) при
    // прокрутке «уезжала» относительно чёрной дыры/канваса (StarFieldCanvas
    // — тоже `position: fixed`, сайт-вайд, не скроллится никогда). `dvh`
    // пересчитывается под реально видимую область — паразитный скролл
    // должен уйти сам; `fixed` — подстраховка на случай, если он всё же
    // где-то останется: панель и канвас теперь оба зафиксированы
    // относительно вьюпорта и не могут разъехаться. overflow-y-auto — на
    // случай легитимно длинного контента (другая локаль/очень короткий
    // вьюпорт) — скролл уйдёт ВНУТРЬ панели, а не потеряется совсем.
    // pt-[38px] ≈ условный «1см» от нижней рамки шапки — сохранён как есть.
    <div className="fixed inset-x-0 top-14 z-10 flex h-[calc(100dvh-3.5rem)] items-start justify-center overflow-y-auto px-4 pt-[38px]">
      <div className="relative w-full max-w-md px-6 py-8 text-center">
        {/* dark-only: мягкое гало вместо сплошной заливки — фон #0c1927
            (см. constants блока dark-темы), затухающий к прозрачности без
            жёсткой границы, чтобы не читаться как карточка */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden dark:block"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(12,25,39,0.65) 0%, rgba(12,25,39,0.32) 50%, transparent 78%)',
          }}
        />
        {/* dark-only: угловые риски видоискателя — статичный аналог «рамки
            прибора, потерявшего цель», не мешает анимации канваса позади */}
        <span aria-hidden="true" className="absolute left-2 top-2 hidden h-4 w-4 border-l border-t border-blue-500/40 dark:block" />
        <span aria-hidden="true" className="absolute right-2 top-2 hidden h-4 w-4 border-r border-t border-blue-500/40 dark:block" />
        <span aria-hidden="true" className="absolute bottom-2 left-2 hidden h-4 w-4 border-b border-l border-blue-500/40 dark:block" />
        <span aria-hidden="true" className="absolute bottom-2 right-2 hidden h-4 w-4 border-b border-r border-blue-500/40 dark:block" />

        <div className="relative">
          {/* h-32 w-32 — с запасом под самый длинный статус-лейбл проекта
              («TRANSMISSION INTERRUPTED», ~115px по замеру), не только под
              короткий «NO SIGNAL»: кольцо декоративное, но должно оставаться
              заметно больше текста в любом варианте, а не наполовину скрытым
              под ним (проверено вживую на обоих текстах) */}
          <div className="relative mx-auto mb-2 flex h-32 w-32 items-center justify-center">
            {/* light-only: разорванное кольцо орбиты — «сигнал потерян с орбиты» */}
            <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 text-slate-200 dark:hidden">
              <path d="M 50 6 A 44 44 0 1 1 6 50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="relative px-2 font-mono text-xs font-bold tracking-[0.2em] text-blue-800 dark:text-blue-400">
              {statusLabel}
            </p>
          </div>

          {monoLabel && monoValue && (
            <div className="mt-1 flex items-center justify-center gap-2 font-mono text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">{monoLabel} {monoValue}</span>
              {copyable && (
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label={t('errors.routeError.copyId')}
                  className="shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          )}

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
