import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import PDFReviewScreen from './PDFReviewScreen';
import { ParsedPDFItem } from '../../lib/types';

jest.setTimeout(15000);

const mockAddMultiple = jest.fn();
let mockId = 0;
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../hooks/useEquipmentMutations', () => ({
  useEquipmentMutations: () => ({ addMultipleItems: mockAddMultiple }),
}));
jest.mock('../../context/SyncContext', () => ({ useSyncContext: () => ({ isOnline: true }) }));
jest.mock('../../lib/db', () => ({ generateId: () => `new-${++mockId}` }));

const parsed: ParsedPDFItem[] = [
  {
    id: 'p1',
    name: 'Apple Box',
    category: 'Grip',
    quantity: 4,
    source: '',
    location: 'Truck',
    start_date: '2026-11-01',
    end_date: '2026-11-08',
  },
];

const navigation = { navigate: jest.fn() };
const renderScreen = () =>
  render(
    <PDFReviewScreen
      navigation={navigation as never}
      route={{ key: 'k', name: 'PDFReview', params: { parsedItems: parsed } } as never}
    />
  );

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  mockAddMultiple.mockReset().mockResolvedValue(undefined);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

describe('PDFReviewScreen add row (WP26)', () => {
  it('adds a blank row that takes the parsed dates', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add row'));
    expect(screen.getByText('2 items')).toBeTruthy();
    expect(screen.getAllByPlaceholderText('Item name')).toHaveLength(2);
  });

  it('refuses to import a row with no name', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add row'));
    await act(async () => {
      await fireEvent.press(screen.getByText('Import 2 Items'));
    });
    expect(alertSpy).toHaveBeenCalledWith('Fix these rows first', 'Item 2: add a name or remove the row.');
    expect(mockAddMultiple).not.toHaveBeenCalled();
  });

  it('imports the added row once it has a name', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Add row'));
    await fireEvent.changeText(screen.getAllByPlaceholderText('Item name')[1], 'Wedge');
    await act(async () => {
      await fireEvent.press(screen.getByText('Import 2 Items'));
    });
    // The new row has no location yet: confirm the "Unassigned" prompt.
    expect(alertSpy.mock.calls[0][0]).toBe('Continue without locations?');
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => unknown }[];
    await act(async () => {
      await buttons.find((b) => b.text === 'Import')?.onPress?.();
    });
    expect(mockAddMultiple).toHaveBeenCalledTimes(1);
    const rows = mockAddMultiple.mock.calls[0][0] as ParsedPDFItem[];
    expect(rows[1]).toMatchObject({
      name: 'Wedge',
      quantity: 1,
      start_date: '2026-11-01',
      end_date: '2026-11-08',
    });
  });
});
