import {
  canManageInventory,
  canSwitchTeams,
  isOrgAdmin,
  canReviewRequests,
  canManageTeams,
  canEditLocations,
  canDeleteLocations,
} from './types';
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

// These mirror specific RLS policies (see the comments in shared/roles.ts).
// ALL_ROLES order: owner, admin, department_head, crew.
describe('RLS-matching helpers', () => {
  it('canReviewRequests: owner/admin only — department heads cannot review (M12)', () => {
    expect(ALL_ROLES.map(canReviewRequests)).toEqual([true, true, false, false]);
  });

  it('canManageTeams: owner/admin only (L24)', () => {
    expect(ALL_ROLES.map(canManageTeams)).toEqual([true, true, false, false]);
  });

  it('canEditLocations: owner/admin/department_head (dept-head insert/update policies)', () => {
    expect(ALL_ROLES.map(canEditLocations)).toEqual([true, true, true, false]);
  });

  it('canDeleteLocations: owner/admin only — no dept-head DELETE policy (L40)', () => {
    expect(ALL_ROLES.map(canDeleteLocations)).toEqual([true, true, false, false]);
  });
});
