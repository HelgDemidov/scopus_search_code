import { Badge } from '../ui/badge';
import type { ArticleResponse } from '../../types/api';

interface ArticleCardProps {
  article: ArticleResponse;
}

// Флаг-эмодзи по коду ISO-3166-альфа (приближенно через Unicode regional indicators)
function getFlagEmoji(country: string): string {
  // Готовый маппинг наиболее частых стран в научной сфере
  const flags: Record<string, string> = {
    'United States': '🇺🇸', 'China': '🇨🇳', 'United Kingdom': '🇬🇧',
    'Germany': '🇩🇪', 'France': '🇫🇷', 'Canada': '🇨🇦',
    'Australia': '🇦🇺', 'India': '🇮🇳', 'Japan': '🇯🇵',
    'South Korea': '🇰🇷', 'Italy': '🇮🇹', 'Spain': '🇪🇸',
    'Netherlands': '🇳🇱', 'Switzerland': '🇨🇭', 'Sweden': '🇸🇪',
    'Brazil': '🇧🇷', 'Russia': '🇷🇺', 'Singapore': '🇸🇬',
    'Denmark': '🇩🇰', 'Finland': '🇫🇮', 'Norway': '🇳🇴',
    'Poland': '🇵🇱', 'Belgium': '🇧🇪', 'Austria': '🇦🇹',
    'Portugal': '🇵🇹', 'Israel': '🇮🇱', 'Turkey': '🇹🇷',
    'Greece': '🇬🇷', 'Czech Republic': '🇨🇿',
    'New Zealand': '🇳🇿', 'Mexico': '🇲🇽',
  };
  return flags[country] ?? '🌐';
}

export function ArticleCard({ article }: ArticleCardProps) {
  // Извлекаем только год из даты публикации
  const year = article.publication_date
    ? article.publication_date.slice(0, 4)
    : null;

  // Текст заголовка: кликабельный если есть DOI
  const titleEl = article.doi ? (
    <a
      href={`https://doi.org/${article.doi}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-sm leading-snug text-slate-900 hover:text-blue-800 dark:text-slate-100 dark:hover:text-blue-400 line-clamp-2 transition-colors"
    >
      {article.title}
    </a>
  ) : (
    <p className="font-semibold text-sm leading-snug text-slate-900 dark:text-slate-100 line-clamp-2">
      {article.title}
    </p>
  );

  return (
    // Разметка карточки по §7.2.6
    <div className="
      bg-slate-50 dark:bg-slate-800
      border border-slate-200 dark:border-slate-700
      rounded-lg p-3
      min-h-[80px] max-h-[100px]
      flex flex-col gap-1
      hover:border-blue-800 dark:hover:border-blue-500
      transition-colors
    ">
      {/* Заголовок */}
      {titleEl}

      {/* Вторая строка: автор, журнал италиком, год */}
      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
        {article.author && <span>{article.author}</span>}
        {article.author && article.journal && <span> · </span>}
        {article.journal && <em>{article.journal}</em>}
        {(article.author || article.journal) && year && <span> · </span>}
        {year && <span>{year}</span>}
      </p>

      {/* Нижняя строка: badges + цитирования + страна */}
      <div className="flex items-center gap-1 mt-auto flex-wrap">
        {/* Тип документа — нейтральный badge */}
        {article.document_type && (
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {article.document_type}
          </Badge>
        )}

        {/* Open Access — зеленый badge, только если true */}
        {article.open_access === true && (
          <Badge className="text-xs px-1.5 py-0 bg-emerald-700 text-white hover:bg-emerald-700 dark:bg-emerald-400 dark:text-slate-900">
            Open Access
          </Badge>
        )}

        {/* Цитирования */}
        {article.cited_by_count != null && article.cited_by_count > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-slate-400 dark:text-slate-500 ml-auto">
            {/* Иконка цитирования */}
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden="true">
              <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7ZM5 7h6M5 9.5h4" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {article.cited_by_count}
          </span>
        )}

        {/* Страна аффиляции (опционально) */}
        {article.affiliation_country && (
          <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto flex items-center gap-0.5">
            <span aria-label={article.affiliation_country}>
              {getFlagEmoji(article.affiliation_country)}
            </span>
            {article.affiliation_country}
          </span>
        )}
      </div>
    </div>
  );
}
