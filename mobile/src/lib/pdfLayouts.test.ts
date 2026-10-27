import { applyTemplate, buildTemplate, defaultLayoutName } from './pdfLayouts';
import { columnList } from '../../../supabase/functions/_shared/pdf/__fixtures__/synthetic.js';

// The shared code runs in the app's JS engine too (WP26 Phase 3b).
describe('pdfLayouts (shared with web and server)', () => {
  it('builds and applies a template from teaching choices', () => {
    const { template, errors } = buildTemplate(columnList, {
      headerIndex: 2,
      nameColumn: 0,
      quantityColumn: 2,
      categoryColumn: 1,
      codeColumn: -1,
      categoryFrom: 'column',
      endIndex: -1,
      skipIndexes: [],
    });
    expect(errors).toBeUndefined();
    expect(applyTemplate(template!, columnList).rows.map((r: { name: string }) => r.name)).toEqual([
      'Apple Box Full',
      'Sandbag 25lb',
      'Stinger 25ft',
      'Furniture Pad',
    ]);
    expect(defaultLayoutName(columnList)).toBe('CASCADE STUDIO RENTALS');
  });
});
