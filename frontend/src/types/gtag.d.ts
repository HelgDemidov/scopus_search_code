// window.gtag / window.dataLayer — опциональны: могут не загрузиться
// если VITE_GA_MEASUREMENT_ID не задан или скрипт заблокирован
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export {};
