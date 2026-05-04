import { renderHook, act } from '@testing-library/react-native';
import { useBulkSelection } from './useBulkSelection';

describe('useBulkSelection', () => {
  it('starts with bulkMode false and empty selection', () => {
    const { result } = renderHook(() => useBulkSelection());
    expect(result.current.bulkMode).toBe(false);
    expect(result.current.selectedIds).toEqual([]);
  });

  it('enterBulkMode sets bulkMode true with no initial id', () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => { result.current.enterBulkMode(); });
    expect(result.current.bulkMode).toBe(true);
    expect(result.current.selectedIds).toEqual([]);
  });

  it('enterBulkMode pre-selects the initial id', () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => { result.current.enterBulkMode('item-1'); });
    expect(result.current.bulkMode).toBe(true);
    expect(result.current.selectedIds).toEqual(['item-1']);
  });

  it('exitBulkMode clears mode and selection', () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => { result.current.enterBulkMode('item-1'); });
    act(() => { result.current.exitBulkMode(); });
    expect(result.current.bulkMode).toBe(false);
    expect(result.current.selectedIds).toEqual([]);
  });

  it('toggleSelected adds an unselected id', () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => { result.current.toggleSelected('item-1'); });
    expect(result.current.selectedIds).toContain('item-1');
  });

  it('toggleSelected removes an already-selected id', () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => { result.current.toggleSelected('item-1'); });
    act(() => { result.current.toggleSelected('item-1'); });
    expect(result.current.selectedIds).not.toContain('item-1');
  });

  it('isSelected returns true for selected id and false otherwise', () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => { result.current.toggleSelected('item-1'); });
    expect(result.current.isSelected('item-1')).toBe(true);
    expect(result.current.isSelected('item-2')).toBe(false);
  });

  it('selectAllVisible replaces selection with given ids', () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => { result.current.toggleSelected('item-old'); });
    act(() => { result.current.selectAllVisible(['item-1', 'item-2', 'item-3']); });
    expect(result.current.selectedIds).toEqual(['item-1', 'item-2', 'item-3']);
    expect(result.current.isSelected('item-old')).toBe(false);
  });

  it('clearSelection empties selectedIds without changing bulkMode', () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => { result.current.enterBulkMode('item-1'); });
    act(() => { result.current.clearSelection(); });
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.bulkMode).toBe(true);
  });

  it('multiple toggles accumulate correctly', () => {
    const { result } = renderHook(() => useBulkSelection());
    act(() => {
      result.current.toggleSelected('a');
      result.current.toggleSelected('b');
      result.current.toggleSelected('c');
    });
    expect(result.current.selectedIds).toHaveLength(3);
    act(() => { result.current.toggleSelected('b'); });
    expect(result.current.selectedIds).toHaveLength(2);
    expect(result.current.selectedIds).not.toContain('b');
  });
});
