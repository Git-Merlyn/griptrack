import React from 'react';
import { render, screen } from '@testing-library/react-native';
import RootNavigator from './RootNavigator';

const mockAuth = jest.fn();
jest.mock('../context/AuthContext', () => ({ useAuthContext: () => mockAuth() }));
jest.mock('../screens/auth/OrgUnavailableScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return function OrgUnavailableScreen() {
    return <Text>org-unavailable</Text>;
  };
});
jest.mock('../screens/auth/WaitingForInviteScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return function WaitingForInviteScreen() {
    return <Text>waiting-for-invite</Text>;
  };
});
jest.mock('./AuthStack', () => () => null);
jest.mock('./AppNavigator', () => () => null);


const signedInNoOrg = {
  session: { user: { id: 'u1' } },
  profile: null,
  loading: false,
  offline: false,
};

describe('RootNavigator, signed in with no org', () => {
  it('shows the waiting screen for a crew sign-up (WP25)', async () => {
    mockAuth.mockReturnValue({ ...signedInNoOrg, awaitingInvite: true });
    await render(<RootNavigator />);
    expect(screen.getByText('waiting-for-invite')).toBeTruthy();
  });

  it('shows the error screen otherwise (L59)', async () => {
    mockAuth.mockReturnValue({ ...signedInNoOrg, awaitingInvite: false });
    await render(<RootNavigator />);
    expect(screen.getByText('org-unavailable')).toBeTruthy();
  });
});
