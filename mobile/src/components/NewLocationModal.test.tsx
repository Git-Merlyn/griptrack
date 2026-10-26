import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import NewLocationModal from './NewLocationModal';

const mockAddLocation = jest.fn();
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../context/AuthContext', () => ({ useAuthContext: () => ({ profile: { org_id: 'org-1', role: 'owner' } }) }));
jest.mock('../hooks/useLocationMutations', () => ({ useLocationMutations: () => ({ addLocation: mockAddLocation }) }));
jest.mock('../lib/db', () => ({
  getAllLocationsByOrg: () => [
    { id: 'l1', org_id: 'org-1', name: 'Stage A', is_active: true },
    { id: 'l2', org_id: 'org-1', name: 'Old Shop', is_active: false },
  ],
}));

describe('NewLocationModal', () => {
  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    mockAddLocation.mockReset();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('creates the location and hands the trimmed name back', async () => {
    mockAddLocation.mockResolvedValue(undefined);
    const onCreated = jest.fn();
    await render(<NewLocationModal visible onClose={jest.fn()} onCreated={onCreated} />);
    await fireEvent.changeText(screen.getByLabelText('Location name'), '  G&E Truck ');
    await act(async () => { await fireEvent.press(screen.getByText('Add location')); });
    expect(mockAddLocation).toHaveBeenCalledWith('G&E Truck');
    expect(onCreated).toHaveBeenCalledWith('G&E Truck');
  });

  it('refuses a name that matches an archived location', async () => {
    const onCreated = jest.fn();
    await render(<NewLocationModal visible onClose={jest.fn()} onCreated={onCreated} />);
    await fireEvent.changeText(screen.getByLabelText('Location name'), 'old shop');
    await act(async () => { await fireEvent.press(screen.getByText('Add location')); });
    expect(mockAddLocation).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Location', expect.stringContaining('"Old Shop" already exists'));
  });

  it('shows the server message (e.g. the Free plan limit) and stays open', async () => {
    mockAddLocation.mockRejectedValue(new Error('Plan limit: the Free plan includes 1 active location.'));
    const onCreated = jest.fn();
    await render(<NewLocationModal visible onClose={jest.fn()} onCreated={onCreated} />);
    await fireEvent.changeText(screen.getByLabelText('Location name'), 'Stage B');
    await act(async () => { await fireEvent.press(screen.getByText('Add location')); });
    expect(onCreated).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Could not add location', expect.stringContaining('Plan limit:'));
  });
});
