import { useState } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  // inputId позволяет избежать дублирования id если SearchBar рендерится
  // дважды на одной странице (например, мобильный и десктопный хедер)
  inputId?: string;
}

export function SearchBar({
  onSearch,
  placeholder = 'Поиск статей\u2026',
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
      {/* Скрытый label связан с полем через htmlFor — доступность для скринридеров */}
      <label htmlFor={inputId} className="sr-only">
        Поиск статей
      </label>
      <Input
        id={inputId}
        name={inputId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
      />
      <Button
        type="submit"
        className="bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white shrink-0"
      >
        Найти
      </Button>
    </form>
  );
}
