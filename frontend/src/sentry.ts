import * as Sentry from '@sentry/react';

export function stripQueryString(url?: string): string | undefined {
  return url?.split('?')[0];
}

// url.full не фильтруется sendDefaultPii=false (packages/core/data-collection —
// это поле остаётся нефильтрованным независимо от флага) — секреты в query-string
// (/reset-password?token=...) режем явно во всех трёх точках, где может всплыть URL
export function initSentry(): void {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1,
    // sendDefaultPii deprecated в @sentry/react ^10 (уберут в v11 в пользу
    // dataCollection) — оставлен, т.к. полностью рабочий в установленной версии
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.url) event.request.url = stripQueryString(event.request.url);
      return event;
    },
    beforeSendTransaction(event) {
      if (event.request?.url) event.request.url = stripQueryString(event.request.url);
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data?.url) breadcrumb.data.url = stripQueryString(breadcrumb.data.url);
      return breadcrumb;
    },
  });
}
