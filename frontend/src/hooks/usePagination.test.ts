import { renderHook } from '@testing-library/react';
import { usePagination } from './usePagination';

describe('usePagination', () => {

  // Граничный кейс: пустой список
  it('total=0 → totalPages=1, hasPrev=false, hasNext=false', () => {
    const { result } = renderHook(() => usePagination(0, 1, 10));
    expect(result.current.totalPages).toBe(1);
    expect(result.current.hasPrev).toBe(false);
    expect(result.current.hasNext).toBe(false);
    expect(result.current.pages).toEqual([1]);
  });

  // Ровно одна страница
  it('total=10, size=10 → totalPages=1', () => {
    const { result } = renderHook(() => usePagination(10, 1, 10));
    expect(result.current.totalPages).toBe(1);
  });

  // Переход через порог
  it('total=11, size=10 → totalPages=2, page=1 hasNext=true', () => {
    const { result } = renderHook(() => usePagination(11, 1, 10));
    expect(result.current.totalPages).toBe(2);
    expect(result.current.hasNext).toBe(true);
    expect(result.current.hasPrev).toBe(false);
  });

  // ≤7 страниц — нет ellipsis, все номера подряд
  it('total=70, size=10 → pages=[1..7], нет ellipsis', () => {
    const { result } = renderHook(() => usePagination(70, 1, 10));
    expect(result.current.pages).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.current.pages).not.toContain('ellipsis');
  });

  // Первая страница из 10 → ellipsis только справа
  it('total=100, page=1, size=10 → ellipsis только справа', () => {
    const { result } = renderHook(() => usePagination(100, 1, 10));
    const { pages } = result.current;
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(10);
    const ellipsisCount = pages.filter(p => p === 'ellipsis').length;
    // Слева от окна [1,2] расстояние до 1 не больше 1 — ellipsis не нужен
    expect(ellipsisCount).toBe(1);
  });

  // Середина → ellipsis с обеих сторон
  it('total=100, page=5, size=10 → ellipsis с обеих сторон', () => {
    const { result } = renderHook(() => usePagination(100, 5, 10));
    const { pages } = result.current;
    const ellipsisCount = pages.filter(p => p === 'ellipsis').length;
    expect(ellipsisCount).toBe(2);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(10);
  });

  // Последняя страница → ellipsis только слева
  it('total=100, page=10, size=10 → ellipsis только слева', () => {
    const { result } = renderHook(() => usePagination(100, 10, 10));
    const { pages } = result.current;
    const ellipsisCount = pages.filter(p => p === 'ellipsis').length;
    expect(ellipsisCount).toBe(1);
    // Предпоследний элемент — не ellipsis (между окном [9,10] и последней нет пропуска)
    expect(pages[pages.length - 2]).not.toBe('ellipsis');
  });

  // Нестандартный size
  it('total=50, page=2, size=25 → totalPages=2, hasPrev=true, hasNext=false', () => {
    const { result } = renderHook(() => usePagination(50, 2, 25));
    expect(result.current.totalPages).toBe(2);
    expect(result.current.hasPrev).toBe(true);
    expect(result.current.hasNext).toBe(false);
  });

  // Реактивность: rerender с новым page пересчитывает результат
  it('rerender с новым page обновляет hasPrev/hasNext', () => {
    const { result, rerender } = renderHook(
      ({ p }: { p: number }) => usePagination(100, p, 10),
      { initialProps: { p: 1 } }
    );
    expect(result.current.hasPrev).toBe(false);
    rerender({ p: 5 });
    expect(result.current.hasPrev).toBe(true);
    expect(result.current.hasNext).toBe(true);
  });
});
