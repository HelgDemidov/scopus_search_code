import { Component, type ReactNode } from 'react';
import type { ErrorInfo } from 'react';
import blackHoleSnapshot from '../../assets/black-hole-pre-accretion-disk.webp';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Последний рубеж — единственная страховка для крэшей ВНЕ роутера
// (ThemeProvider/StarFieldCanvas в App.tsx). errorElement в router.tsx их
// не увидит, т.к. они рендерятся рядом с <RouterProvider>, не внутри него.
//
// Сознательно без i18n и без ЛЮБЫХ стилей/токенов, зависящих от рантайма
// (Tailwind dark: variant, shadcn CSS-переменные --primary и т.п., useTheme()):
// если сломалось что-то настолько базовое, что долетело досюда, нельзя
// полагаться ни на ThemeProvider (класс `dark` на <html> мог не успеть/не
// смочь примениться), ни на i18next. Статичный двуязычный текст и
// статичные (не dark:-префиксные) Tailwind-классы с буквальными цветами —
// они компилируются в CSS на этапе сборки и не зависят от того, что делает
// React в момент краха. Типографика/палитра при этом подогнаны вручную под
// тёмную схему остальных error-страниц (ErrorPanel.tsx) — этот fallback
// всегда рендерится на фоне #0c1927, светлого варианта у него нет и не
// планируется (см. обсуждение 2026-07-10).
export class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary] Fatal render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 sm:gap-2 bg-[#0c1927] px-8 py-12 text-center font-sans">
        {/* Снимок чёрной дыры до аккреционного диска (коммит 3c3ae97, до
            0462441) — statичный webp, не сам StarFieldCanvas: рендерить
            живой canvas здесь означало бы зависеть от того же React-дерева
            (App.tsx), которое только что упало. В document-flow НАД текстом
            (не absolute/fixed позади него) — гарантирует отсутствие
            перекрытия с текстом/кнопкой на любой ширине вьюпорта, включая
            узкий мобильный, без измерения координат: рост картинки раздвигает
            flex-колонку симметрично вокруг центра вьюпорта (justify-center),
            отступ до текстового блока — фиксированный gap, не абсолютные
            координаты. На ≥sm разрешено сузить именно этот gap (sm:gap-2) —
            крупная вставка на десктопе может подходить почти вплотную к
            полотну сообщения, не перекрывая его; на мобильном gap-4 оставлен
            как был. Размеры: 160px база / 208px (+30%) на мобильном не
            изменились относительно десктопного шага, десктоп 208→364px
            (+75%) — оба увеличения по явному запросу 2026-07-10. */}
        <img
          src={blackHoleSnapshot}
          alt=""
          aria-hidden="true"
          className="h-52 w-52 shrink-0 sm:h-[364px] sm:w-[364px]"
        />

        <div className="flex flex-col items-center gap-4 sm:gap-5">
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-blue-400 sm:text-sm">
            STATUS: TRANSMISSION INTERRUPTED
          </p>

          {/* Два отдельных <p>, не одна строка через "/": гарантирует, что
              слова разных языков никогда не смешаются на одной строке при
              переносе (то же решение, что для AnonHero, см. SearchPage.tsx).
              <br className="sm:hidden" /> в первом <p> — принудительный
              перенос ПОСЛЕ "before" на узких экранах (не после "could", как
              вышло бы само по себе): пустой display:none на ≥sm возвращает
              фразу в одну строку, там места достаточно. */}
          <div className="max-w-md sm:max-w-lg space-y-1 text-sm text-slate-400 sm:text-base">
            <p>
              Something broke before<br className="sm:hidden" /> the app could load.
            </p>
            <p>Приложение не смогло загрузиться.</p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-slate-700 bg-blue-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-400 sm:px-6 sm:py-2.5 sm:text-base"
          >
            <span className="block">Reload</span>
            <span className="block text-xs font-normal opacity-90 sm:text-sm">Обновить страницу</span>
          </button>
        </div>
      </div>
    );
  }
}
