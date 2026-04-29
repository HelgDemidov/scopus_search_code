import { Component, type ReactNode } from 'react';
import type { ErrorInfo } from 'react';

type FallbackFn = (onReset: () => void) => ReactNode;

interface ErrorBoundaryProps {
  children: ReactNode;
  // Опционально: статический узел или функция, получающая onReset
  fallback?: ReactNode | FallbackFn;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Дефолтный fallback — минималистичный блок с кнопкой setState-сброса
function DefaultFallback({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Something went wrong while rendering this section.
      </p>
      <button
        onClick={onReset}
        className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

// React ErrorBoundary — class component (единственный способ перехватить render-ошибки).
// Изолирует падения чартов и ArticleList от остальной страницы.
// Принимает опциональный fallback: ReactNode или (onReset) => ReactNode.
// При отсутствии fallback показывает DefaultFallback с кнопкой «Try again».
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    // Переключаем флаг ошибки — React перерендерит с fallback
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Логируем для диагностики; не показываем toast —
    // render-ошибки принципиально отличаются от сетевых
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  handleReset() {
    this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return (fallback as FallbackFn)(this.handleReset);
      }
      if (fallback !== undefined) {
        return fallback;
      }
      return <DefaultFallback onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}
