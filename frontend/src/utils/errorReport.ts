// Breadcrumb ring-buffer + mailto-билдер для "Report this issue"
// (docs/error-experience/spec.md). Без нового backend — переиспользует
// VITE_SUPPORT_EMAIL (тот же адрес, что FROM_EMAIL/Brevo-алерты issue #48).

const BREADCRUMB_KEY = 'error_breadcrumb';
const BREADCRUMB_MAX = 10;

interface BreadcrumbEntry {
  path: string;
  ts: number;
}

// sessionStorage может быть недоступен (приватный режим Safari и т.п.) —
// breadcrumb необязателен для отчёта об ошибке, поэтому молча деградируем
export function recordBreadcrumb(path: string): void {
  try {
    const entries = getBreadcrumbs();
    entries.push({ path, ts: Date.now() });
    sessionStorage.setItem(BREADCRUMB_KEY, JSON.stringify(entries.slice(-BREADCRUMB_MAX)));
  } catch {
    // no-op — см. комментарий выше
  }
}

export function getBreadcrumbs(): BreadcrumbEntry[] {
  try {
    const raw = sessionStorage.getItem(BREADCRUMB_KEY);
    return raw ? (JSON.parse(raw) as BreadcrumbEntry[]) : [];
  } catch {
    return [];
  }
}

interface BuildReportMailtoParams {
  requestId?: string;
  message?: string;
}

// null, если VITE_SUPPORT_EMAIL не задан — вызывающий код скрывает кнопку
// (тот же graceful degradation паттерн, что redis_client=None на бэкенде)
export function buildReportMailto(params: BuildReportMailtoParams): string | null {
  const supportEmail: string | undefined = import.meta.env.VITE_SUPPORT_EMAIL;
  if (!supportEmail) return null;

  const breadcrumbs = getBreadcrumbs()
    .map((b) => `  ${new Date(b.ts).toISOString()} — ${b.path}`)
    .join('\n');

  const bodyLines = [
    `URL: ${window.location.href}`,
    `Timestamp: ${new Date().toISOString()}`,
    params.requestId ? `Request ID: ${params.requestId}` : null,
    params.message ? `Error: ${params.message}` : null,
    breadcrumbs ? `\nRecent navigation:\n${breadcrumbs}` : null,
  ].filter((line): line is string => line !== null);

  const subject = 'Scopus Search — error report';
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
}
