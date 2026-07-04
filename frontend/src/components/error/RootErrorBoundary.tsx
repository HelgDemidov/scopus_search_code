import { Component, type ReactNode } from 'react';
import type { ErrorInfo } from 'react';

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
// Сознательно без i18n/Tailwind dark: variant и без переиспользования
// design-токенов остальных error-страниц: если сломалось что-то настолько
// базовое, что долетело досюда, нельзя полагаться ни на ThemeProvider
// (класс `dark` на <html>), ни на i18next — инлайн-стили и статичный
// двуязычный текст гарантируют, что сам fallback не сломается вторично.
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
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          background: '#0d1b2a',
          color: '#e2e8f0',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        <p style={{ letterSpacing: '0.1em', color: '#fbbf24', fontSize: '0.875rem' }}>
          STATUS: TRANSMISSION INTERRUPTED
        </p>
        <p style={{ fontSize: '1rem', maxWidth: '32rem' }}>
          Something broke before the app could load. / Приложение не смогло загрузиться.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            border: '1px solid #334155',
            background: '#152236',
            color: '#e2e8f0',
            borderRadius: '0.375rem',
            padding: '0.5rem 1.25rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Reload / Обновить страницу
        </button>
      </div>
    );
  }
}
