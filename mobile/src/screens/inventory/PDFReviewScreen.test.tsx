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
jest.mock('../../context/AuthContext', () => ({
  useAuthContext: () => ({ profile: { org_id: 'org-1', role: 'admin' } }),
}));
jest.mock('../../lib/db', () => ({ generateId: () => `new-${++mockId}` }));
const mockRpc = jest.fn((..._args: unknown[]) => Promise.resolve({ data: null, error: null }));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

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
const renderScreen = (layout: { id: string; name: string; drift: boolean } | null = null) =>
  render(
    <PDFReviewScreen
      navigation={navigation as never}
      route={{ key: 'k', name: 'PDFReview', params: { parsedItems: parsed, layout } } as never}
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

describe('PDFReviewScreen saved layout (WP26 Phase 3)', () => {
  it('says which saved layout read the PDF and counts the import', async () => {
    await renderScreen({ id: 't1', name: 'Cascade', drift: false });
    expect(screen.getByTestId('layout-note')).toHaveTextContent('Read with your saved layout "Cascade".');
    await act(async () => {
      await fireEvent.press(screen.getByText('Import 1 Item'));
    });
    expect(mockAddMultiple).toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('record_pdf_template_use', { p_template: 't1', p_ok: true });
  });

  it('warns when the layout no longer fits', async () => {
    await renderScreen({ id: 't1', name: 'Cascade', drift: true });
    expect(screen.getByTestId('layout-note')).toHaveTextContent(/seems to have changed/);
  });

  it('says nothing for the general reader', async () => {
    await renderScreen(null);
    expect(screen.queryByTestId('layout-note')).toBeNull();
  });
});

describe('PDFReviewScreen teach entry (WP26 Phase 3b)', () => {
  const pages = [[{ str: 'Qty', transform: [1, 0, 0, 1, 480, 700], width: 18 }]];
  const file = { uri: 'file:///x.pdf', name: 'x.pdf', size: 1 };

  it('offers to teach the layout when the server sent the pages', async () => {
    navigation.navigate.mockReset();
    await render(
      <PDFReviewScreen
        navigation={navigation as never}
        route={{ key: 'k', name: 'PDFReview', params: { parsedItems: parsed, layout: null, pages, file } } as never}
      />
    );
    await fireEvent.press(screen.getByText("Rows look wrong? Teach this supplier's layout"));
    expect(navigation.navigate).toHaveBeenCalledWith('TeachLayout', { pages, file, existing: null });
  });

  it('shows no teach entry without pages (CSV, or an older function)', async () => {
    await renderScreen(null);
    expect(screen.queryByText(/Teach/)).toBeNull();
  });
});
