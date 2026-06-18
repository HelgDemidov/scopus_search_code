import { useState } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  // inputId avoids duplicate ids when SearchBar is rendered twice on the same
  // page (e.g. mobile and desktop header)
  inputId?: string;
}

export function SearchBar({
  onSearch,
  placeholder = 'Search articles…',
  inputId = 'article-search',
}: SearchBarProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSearch(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full">
      {/* Hidden label linked to the input via htmlFor — accessibility for screen readers */}
      <label htmlFor={inputId} className="sr-only">
        Search articles
      </label>
      <Input
        id={inputId}
        name={inputId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
        // autoComplete="off" — отключает браузерный кэш подсказок поисковых слов
        // (браузер не сохраняет введенные запросы и не предлагает их повторно).
        // Это улучшает конфиденциальность: история поиска одного пользователя
        // не просачивается другому пользователю того же браузерного профиля.
        //
        // Чтобы вернуть браузерные подсказки обратно — удали атрибут autoComplete
        // (или замени значение "off" на "on" / "search").
        // Важно: это исключительно клиентский механизм браузера, не связанный
        // с серверной историей поиска в таблице search_history.
        autoComplete="off"
      />
      <Button
        type="submit"
        className="bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white shrink-0"
      >
        Search
      </Button>
    </form>
  );
}
