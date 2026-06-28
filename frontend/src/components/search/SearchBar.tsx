import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

const MIN_QUERY_LENGTH = 2;

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  // inputId avoids duplicate ids when SearchBar is rendered twice on the same
  // page (e.g. mobile and desktop header)
  inputId?: string;
}

export function SearchBar({
  onSearch,
  placeholder,
  inputId = 'article-search',
}: SearchBarProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('search.placeholder');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setError(t('search.minLength', { min: MIN_QUERY_LENGTH }));
      return;
    }
    setError('');
    onSearch(trimmed);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    if (error) setError('');
  }

  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1 w-full">
      <form onSubmit={handleSubmit} className="flex gap-2 w-full">
        <label htmlFor={inputId} className="sr-only">
          {t('search.label')}
        </label>
        <Input
          id={inputId}
          name={inputId}
          value={value}
          onChange={handleChange}
          placeholder={resolvedPlaceholder}
          className={['flex-1', error ? 'border-red-500 focus-visible:ring-red-400' : ''].join(' ')}
          autoComplete="off"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
        />
        <Button
          type="submit"
          className="bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white shrink-0"
        >
          {t('search.button')}
        </Button>
      </form>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-500 pl-1">
          {error}
        </p>
      )}
    </div>
  );
}
