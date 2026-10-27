import { newParsedItem, parsedItemProblems } from './importRows';

describe('import review rows (WP26)', () => {
  it('a new row starts blank with quantity 1 and takes defaults', () => {
    expect(newParsedItem('id-1', { location: 'Truck' })).toEqual({
      id: 'id-1',
      name: '',
      category: '',
      quantity: 1,
      source: '',
      location: 'Truck',
      start_date: null,
      end_date: null,
    });
  });

  it('flags a blank name and a quantity under 1, in row order', () => {
    const rows = [
      newParsedItem('a', { name: 'Apple Box', quantity: 2 }),
      newParsedItem('b', { name: '   ' }),
      newParsedItem('c', { name: 'Sandbag', quantity: 0 }),
    ];
    expect(parsedItemProblems(rows)).toEqual([
      { index: 1, message: 'add a name or remove the row.' },
      { index: 2, message: 'quantity must be 1 or more.' },
    ]);
  });

  it('accepts complete rows', () => {
    expect(parsedItemProblems([newParsedItem('a', { name: 'Apple Box' })])).toEqual([]);
  });
});
