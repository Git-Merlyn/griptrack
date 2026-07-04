import { canManageInventory, canSwitchTeams, isOrgAdmin } from './types';
import type { Role } from './types';

const ALL_ROLES: Role[] = ['owner', 'admin', 'department_head', 'crew'];

describe('canManageInventory', () => {
  it('returns true for owner, admin, and department_head', () => {
    expect(canManageInventory('owner')).toBe(true);
    expect(canManageInventory('admin')).toBe(true);
    expect(canManageInventory('department_head')).toBe(true);
  });

  it('returns false for crew', () => {
    expect(canManageInventory('crew')).toBe(false);
  });

  it('covers all roles', () => {
    const results = ALL_ROLES.map(canManageInventory);
    expect(results).toEqual([true, true, true, false]);
  });
});

describe('canSwitchTeams', () => {
  it('returns true for owner and admin', () => {
    expect(canSwitchTeams('owner')).toBe(true);
    expect(canSwitchTeams('admin')).toBe(true);
  });

  it('returns false for department_head and crew', () => {
    expect(canSwitchTeams('department_head')).toBe(false);
    expect(canSwitchTeams('crew')).toBe(false);
  });

  it('covers all roles', () => {
    const results = ALL_ROLES.map(canSwitchTeams);
    expect(results).toEqual([true, true, false, false]);
  });
});

describe('isOrgAdmin', () => {
  it('returns true for owner and admin', () => {
    expect(isOrgAdmin('owner')).toBe(true);
    expect(isOrgAdmin('admin')).toBe(true);
  });

  it('returns false for department_head and crew', () => {
    expect(isOrgAdmin('department_head')).toBe(false);
    expect(isOrgAdmin('crew')).toBe(false);
  });

  it('covers all roles', () => {
    const results = ALL_ROLES.map(isOrgAdmin);
    expect(results).toEqual([true, true, false, false]);
  });
});
