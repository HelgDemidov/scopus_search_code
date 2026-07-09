import { forwardRef, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface ErrorPanelProps {
  statusLabel: string;
  monoLabel?: string;
  monoValue?: string;
  copyable?: boolean;
  title: string;
  description: string;
  children?: ReactNode; // кнопки действий
  // Переопределяет layout ряда кнопок (по умолчанию — по центру).
  // NotFoundPage (п.9.4, docs/error-experience/spec.md) выравнивает кнопки
  // по краям того же `max-w-sm`-блока, что и description — RouteErrorPage
  // с его 3 кнопками остаётся на дефолтном центрировании без изменений.
  actionsClassName?: string;
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
// forwardRef (см. [[feedback-shadcn-button-forwardref]]) — ref пробрасывается
// на контейнер контента (статус/title/description/кнопки), НЕ на внешнюю
// fixed-обёртку: useBlackHoleMessageAnchor (§4.4 ТЗ, docs/layout-overhaul/
// spec.md, Шаг 5) меряет через него нижнюю границу СООБЩЕНИЯ (вплоть до ряда
// кнопок) — внешняя обёртка включает лишний py-8, который не относится к
// видимому контенту.
export const ErrorPanel = forwardRef<HTMLDivElement, ErrorPanelProps>(function ErrorPanel({
  statusLabel, monoLabel, monoValue, copyable, title, description, children, actionsClassName,
}, ref) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [actionsWidth, setActionsWidth] = useState<number | null>(null);
  // §10.4 post-prod (docs/layout-overhaul/spec.md): выравнивание ряда кнопок
  // по ширине текста description — десктопный приём (см. actionsClassName
  // ветку ниже). Ниже sm кнопки растягиваются flex-1 на всю ширину ряда, там
  // maxWidth-ограничение только мешало бы (актуально для узкого экрана,
  // где description часто переносится на 2 строки — сам layout уже другой).
  const isDesktopWidth = useMediaQuery('(min-width: 640px)');

  const handleCopy = async () => {
    if (!monoValue) return;
    await navigator.clipboard.writeText(monoValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Ряд кнопок выравнивается по фактической ширине ОТРИСОВАННОГО текста
  // description (п.9.4, docs/error-experience/spec.md), не по ширине его
  // max-w-sm блока — текст центрирован внутри блока и почти всегда УЖЕ
  // самого блока (в EN — на ~16.5px с каждой стороны), поэтому выравнивание
  // по границам блока визуально «разъезжалось» с видимым текстом. Меряем
  // через Range.getClientRects() (не getBoundingClientRect самого <p> — тот
  // отдаёт ширину БЛОКА, не текста); берём максимум среди строк на случай
  // переноса (RU переносится на 2 строки на типичных вьюпортах) — все
  // строки центрируются в одном и том же блоке, поэтому у самой широкой
  // строки те же левая/правая границы, что нужны и для более коротких. Включено
  // только когда передан actionsClassName (сейчас — только NotFoundPage);
  // RouteErrorPage с его 3 кнопками под другим текстом не должен ужиматься.
  useLayoutEffect(() => {
    if (!actionsClassName) return;
    function measure() {
      const el = descRef.current;
      const textNode = el?.firstChild;
      if (!el || !textNode) return;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      // jsdom (юнит-тесты) не реализует лэйаут — getClientRects там либо
      // отсутствует, либо возвращает не-итерируемое значение; в реальном
      // браузере всегда доступен и итерируем. Тихо пропускаем измерение
      // вместо падения — actionsWidth остаётся null, ряд кнопок просто не
      // получает style-ограничение по ширине.
      let rects: ArrayLike<{ width: number }> | undefined;
      try {
        rects = range.getClientRects();
      } catch {
        return;
      }
      if (!rects || typeof rects.length !== 'number') return;
      let max = 0;
      for (let i = 0; i < rects.length; i++) max = Math.max(max, rects[i].width);
      if (max > 0) setActionsWidth(max);
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [actionsClassName, description]);

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
    // pt-[38px] ≈ условный «1см» от нижней рамки шапки — сохранён как есть на
    // ≥sm; ниже sm поджат до pt-6 (§10.4 post-prod, docs/layout-overhaul/
    // spec.md) — на узких экранах панель занимала >50% высоты вьюпорта
    // (цель ~40%), верхний отступ был частью проблемы.
    <div className="fixed inset-x-0 top-14 z-10 flex h-[calc(100dvh-3.5rem)] items-start justify-center overflow-y-auto px-4 pt-6 sm:pt-[38px]">
      <div className="relative w-full max-w-md px-6 py-6 text-center sm:py-8">
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

        <div ref={ref} className="relative">
          {/* h-32 w-32 — с запасом под самый длинный статус-лейбл проекта
              («TRANSMISSION INTERRUPTED», ~115px по замеру), не только под
              короткий «NO SIGNAL»: кольцо декоративное, но должно оставаться
              заметно больше текста в любом варианте, а не наполовину скрытым
              под ним (проверено вживую на обоих текстах). Только в light —
              в dark этот резерв держит место под light-only SVG-кольцо ниже,
              которого в dark нет вообще, поэтому статус-лейбл «висел» в
              пустом круге (п.9.3, docs/error-experience/spec.md, вариант А):
              dark:h-auto/w-auto убирает фиксированный резерв, текст занимает
              только свою естественную высоту — панель и её нижние угловые
              риски (позиционированы от той же обёртки) подтягиваются вверх
              сами, без отдельной правки */}
          <div className="relative mx-auto mb-2 flex h-32 w-32 items-center justify-center dark:h-auto dark:w-auto dark:py-1">
            {/* light-only: разорванное кольцо орбиты — «сигнал потерян с орбиты» */}
            <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 text-slate-200 dark:hidden">
              <path d="M 50 6 A 44 44 0 1 1 6 50" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {/* whitespace-pre-line — только RU статус-лейбл содержит явный
                \n (п.9.5, docs/error-experience/spec.md): "НЕТ СИГНАЛА"
                помещалось в одну строку впритык к light-only кольцу, в
                отличие от sr-Latn "NEMA SIGNALA", который переносится сам
                по себе на узком w-32 (128px). dark:whitespace-normal —
                разбивка нужна ТОЛЬКО в light: кольца там нет, упираться не
                во что, а после dark:w-auto (см. обёртку выше) на широком
                инертном блоке "NEMA SIGNALA" тоже сама умещается в одну
                строку — обе локали ведут себя одинаково в dark без доп.
                правок именно для sr-Latn */}
            <p className="relative whitespace-pre-line px-2 font-mono text-xs font-bold tracking-[0.2em] text-blue-800 dark:whitespace-normal dark:text-blue-400">
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

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:mt-4">{title}</h1>
          <p ref={descRef} className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>

          {/* Ряд не переносится (flex-nowrap, w-full) на ВСЕХ размерах: дети —
              flex-1 basis-0 (см. NotFoundPage) — всегда делят ширину ряда
              поровну, включая ≥sm (пост-пост-фикс 2026-07-09, docs/layout-
              overhaul/spec.md §10): раньше на ≥sm кнопки возвращались к
              авто-ширине + flex-wrap, из-за чего Go home (короче) оставался
              узким, а между кнопками зиял widerpromежуток (justify-between
              разносил их к краям maxWidth-контейнера). Теперь maxWidth
              (по факт. ширине description через actionsWidth, только на ≥sm)
              по-прежнему задаёт ОБЩУЮ ширину пары, но сама пара внутри неё —
              равноширокая и сближенная, с зазором ровно gap. RouteErrorPage
              (без actionsClassName, 3 кнопки) не переносится на эту ветку
              вообще — остаётся на исходном центрированном flex-wrap. */}
          <div
            className={cn(
              'flex items-center',
              // gap-4 ниже sm, gap-3 на ≥sm: кнопки flex-1 basis-0 внутри
              // фикс-ширины ряда (w-full, либо напрямую, либо через maxWidth)
              // — рост gap НЕ раздвигает внешние края ряда (те всегда =
              // границам контейнера, см. §10.4), а забирает место ровно у
              // внутренних/смежных краёв кнопок (симметрично, т.к. у обеих
              // одинаковый flex-grow). Кнопки визуально стягиваются к своим
              // внешним краям, не наоборот.
              actionsClassName
                ? 'mt-4 w-full flex-nowrap gap-4 sm:mt-6 sm:gap-3'
                : 'mt-6 flex-wrap gap-3 justify-center',
              actionsClassName,
            )}
            style={isDesktopWidth && actionsWidth ? { maxWidth: actionsWidth } : undefined}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
});
