import { useEffect, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { setMessageBottom } from '../stores/blackHoleStore';

// Меряет нижнюю границу контента ErrorPanel (вплоть до ряда кнопок) и пишет
// её в blackHoleStore — адаптивная геометрия ЧД (§4.4 ТЗ, docs/layout-
// overhaul/spec.md, Шаг 5) использует значение как floor, чтобы дыра не
// наезжала на сообщение. Пересчёт — ТОЛЬКО по этим событиям (не per-frame):
// mount, resize/orientationchange, смена языка i18n (RU/sr-Latn переносят
// статус-лейбл на 2 строки — высота меняется), document.fonts.ready (веб-
// шрифты грузятся асинхронно, до их загрузки высота текста иная — FOUT-сдвиг).
export function useBlackHoleMessageAnchor(ref: RefObject<HTMLElement | null>): void {
  const { i18n } = useTranslation();

  useEffect(() => {
    let cancelled = false;

    function measure() {
      if (cancelled) return;
      const el = ref.current;
      if (!el) return;
      setMessageBottom(el.getBoundingClientRect().bottom);
    }

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    i18n.on('languageChanged', measure);
    // document.fonts может отсутствовать в очень старых браузерах — опционально
    document.fonts?.ready?.then(measure);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      i18n.off('languageChanged', measure);
      setMessageBottom(null);
    };
  }, [ref, i18n]);
}
