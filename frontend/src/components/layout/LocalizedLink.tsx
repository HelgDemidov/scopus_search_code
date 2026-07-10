import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';
import { useLocalizedPath } from '../../hooks/useLocalizedPath';

interface LocalizedLinkProps extends Omit<LinkProps, 'to'> {
  to: string;
}

// forwardRef обязателен — Header.tsx/MobileNavSheet.tsx оборачивают некоторые
// из этих ссылок в Radix asChild-триггеры (Button/DropdownMenuItem), которым
// нужна рабочая ref-цепочка (см. память feedback-shadcn-button-forwardref).
export const LocalizedLink = forwardRef<HTMLAnchorElement, LocalizedLinkProps>(
  function LocalizedLink({ to, ...props }, ref) {
    const resolve = useLocalizedPath();
    return <Link ref={ref} to={resolve(to)} {...props} />;
  },
);
