import { locationPickerOptions, newLocationNameError, NEW_LOCATION_KEY } from './locationOptions';
import { canEditLocations } from './types';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('locationPickerOptions', () => {
  it('puts "+ New location…" first for people who may create locations', () => {
    const opts = locationPickerOptions(['Stage A', 'Truck'], true);
    expect(opts[0]).toEqual({ key: NEW_LOCATION_KEY, label: '+ New location…' });
    expect(opts.slice(1).map((o) => o.key)).toEqual(['Stage A', 'Truck']);
  });

  it('never offers it when the user may not create locations', () => {
    const opts = locationPickerOptions(['Stage A'], false);
    expect(opts.map((o) => o.key)).toEqual(['Stage A']);
  });

  it('matches the role rule: owner, admin and dept head yes; crew no (D22)', () => {
    expect(canEditLocations('owner')).toBe(true);
    expect(canEditLocations('admin')).toBe(true);
    expect(canEditLocations('department_head')).toBe(true);
    expect(canEditLocations('crew')).toBe(false);
  });
});

describe('newLocationNameError', () => {
  it('rejects an empty name', () => {
    expect(newLocationNameError('   ', ['A'])).toMatch(/enter a location name/);
  });

  it('rejects a duplicate, ignoring case and spaces, archived names included', () => {
    expect(newLocationNameError('  stage a ', ['Stage A', 'Old Shop'])).toMatch(/"Stage A" already exists/);
  });

  it('accepts a new name', () => {
    expect(newLocationNameError('G&E Truck', ['Stage A'])).toBeNull();
  });
});
