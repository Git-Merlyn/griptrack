import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import TeachLayoutScreen from './TeachLayoutScreen';
import { columnList } from '../../../../supabase/functions/_shared/pdf/__fixtures__/synthetic.js';

jest.setTimeout(15000);

const mockInsert = jest.fn();
const mockUpdate = jest.fn();
let mockResult: { data: unknown; error: unknown } = { data: { id: 't1' }, error: null };
jest.mock('../../lib/supabase', () => {
  const chain = () => {
    const q: Record<string, unknown> = {};
    q.eq = () => q;
    q.select = () => q;
    q.maybeSingle = async () => mockResult;
    return q;
  };
  return {
    supabase: {
      from: () => ({
        insert: (row: unknown) => (mockInsert(row), chain()),
        update: (row: unknown) => (mockUpdate(row), chain()),
      }),
    },
  };
});
jest.mock('../../context/AuthContext', () => ({
  useAuthContext: () => ({ profile: { org_id: 'org-1', role: 'admin' } }),
}));
const mockParse = jest.fn();
jest.mock('../../hooks/usePDFImport', () => ({ parsePdfFile: (...a: unknown[]) => mockParse(...a) }));

const file = { uri: 'file:///cascade.pdf', name: 'cascade.pdf', size: 1 };
const navigation = { popTo: jest.fn() };

const renderScreen = (existing: { id: string; name: string; drift: boolean } | null = null) =>
  render(
    <TeachLayoutScreen
      navigation={navigation as never}
      route={{ key: 'k', name: 'TeachLayout', params: { pages: columnList, file, existing } } as never}
    />
  );

async function teach() {
  await fireEvent.press(screen.getByTestId('teach-line-2')); // the headings line
  await fireEvent.press(screen.getAllByLabelText('Item Description')[0]); // item name column
  await fireEvent.press(screen.getAllByLabelText('Qty')[1]); // quantity column
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockResult = { data: { id: 't1' }, error: null };
  mockParse.mockResolvedValue({ items: [{ id: 'x' }], layout: { id: 't1', name: 'CASCADE STUDIO RENTALS', drift: false }, pages: columnList, file });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

describe('TeachLayoutScreen (WP26 Phase 3b)', () => {
  it('previews rows once the name and quantity columns are picked', async () => {
    await renderScreen();
    expect(screen.queryByTestId('teach-count')).toBeNull();
    await teach();
    expect(screen.getByTestId('teach-count')).toHaveTextContent('4 items found on the first pages');
  });

  it('saves a new org layout and returns to the review with the PDF re-read', async () => {
    await renderScreen();
    await teach();
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Save layout'));
    });
    const row = mockInsert.mock.calls[0][0];
    expect(row).toMatchObject({ org_id: 'org-1', name: 'CASCADE STUDIO RENTALS' });
    expect(row.template.columns.name).toEqual({ x_min: 0, x_max: 213 });
    expect(mockParse).toHaveBeenCalledWith(file);
    expect(navigation.popTo).toHaveBeenCalledWith(
      'PDFReview',
      expect.objectContaining({ parsedItems: [{ id: 'x' }], layout: expect.objectContaining({ id: 't1' }) })
    );
  });

  it('re-teaching updates the layout that was used', async () => {
    await renderScreen({ id: 't9', name: 'Cascade', drift: true });
    await teach();
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Save layout'));
    });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cascade' }));
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('explains a refused save and stays on the screen', async () => {
    mockResult = { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
    await renderScreen();
    await teach();
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Save layout'));
    });
    expect(alertSpy).toHaveBeenCalledWith("Couldn't save the layout", 'new row violates row-level security policy');
    expect(navigation.popTo).not.toHaveBeenCalled();
  });
});
