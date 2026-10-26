import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import WaitingForInviteScreen from './WaitingForInviteScreen';

jest.setTimeout(15000);

const mockRetry = jest.fn();
const mockSignOut = jest.fn();
const mockDiscard = jest.fn();
const mockInvoke = jest.fn();
jest.mock('../../context/AuthContext', () => ({
  useAuthContext: () => ({
    session: { user: { id: 'u1', email: 'pat@example.test' } },
    retryBootstrap: mockRetry,
    signOut: mockSignOut,
  }),
}));
jest.mock('../../context/SyncContext', () => ({ useSyncContext: () => ({ discardLocalData: mockDiscard }) }));
jest.mock('../../lib/invokeFn', () => ({ invokeFn: (...a: unknown[]) => mockInvoke(...a) }));

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockRetry.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

/** Press the button with this text in the most recent Alert. */
async function pressAlertButton(text: string) {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as { text: string; onPress?: () => unknown }[];
  await act(async () => {
    await buttons.find((b) => b.text === text)?.onPress?.();
  });
}

describe('WaitingForInviteScreen (WP25)', () => {
  it('shows the email to be invited', async () => {
    await render(<WaitingForInviteScreen />);
    expect(screen.getByTestId('waiting-email')).toHaveTextContent('pat@example.test');
  });

  it('Check again re-runs the bootstrap and says when there is no invite yet', async () => {
    await render(<WaitingForInviteScreen />);
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Check again'));
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/No invite yet/)).toBeTruthy();
  });

  it('Sign out signs out', async () => {
    await render(<WaitingForInviteScreen />);
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Sign out'));
    });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('Delete account calls delete-account after confirmation, then signs out', async () => {
    mockInvoke.mockResolvedValue({ ok: true });
    await render(<WaitingForInviteScreen />);
    await fireEvent.press(screen.getByLabelText('Delete account'));
    await pressAlertButton('Delete');
    expect(mockInvoke).toHaveBeenCalledWith('delete-account');
    expect(mockDiscard).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('a failed delete explains and keeps the user signed in', async () => {
    mockInvoke.mockRejectedValue(new Error('Server unavailable'));
    await render(<WaitingForInviteScreen />);
    await fireEvent.press(screen.getByLabelText('Delete account'));
    await pressAlertButton('Delete');
    expect(alertSpy).toHaveBeenLastCalledWith('Cannot delete yet', 'Server unavailable');
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
