import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import SignUpScreen, { CONFIRM_EMAIL_NOTICE } from './SignUpScreen';

jest.setTimeout(15000);

const mockSignUp = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signUp: (...a: unknown[]) => mockSignUp(...a) } } }));

const navigation = { navigate: jest.fn() };
const renderScreen = () =>
  render(<SignUpScreen navigation={navigation as never} route={{ key: 'k', name: 'SignUp' } as never} />);

async function fill(name: string, email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Full name'), name);
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
  await act(async () => {
    await fireEvent.press(screen.getByLabelText('Create account'));
  });
}

beforeEach(() => {
  mockSignUp.mockReset();
  navigation.navigate.mockReset();
});

describe('SignUpScreen (WP25)', () => {
  it('signs up as crew with the trimmed name and email', async () => {
    mockSignUp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
    await renderScreen();
    await fill('  Pat Grip ', ' pat@example.test ', 'longenough');
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'pat@example.test',
      password: 'longenough',
      options: { data: { full_name: 'Pat Grip', signup_role: 'crew' } },
    });
    // A session came back: RootNavigator takes over, no navigation here.
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('goes back to sign-in with a notice when the email needs confirming', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
    await renderScreen();
    await fill('Pat', 'pat@example.test', 'longenough');
    expect(navigation.navigate).toHaveBeenCalledWith('SignIn', {
      email: 'pat@example.test',
      notice: CONFIRM_EMAIL_NOTICE,
    });
  });

  it('refuses a short password without calling the server', async () => {
    await renderScreen();
    await fill('Pat', 'pat@example.test', 'short');
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy();
  });

  it('shows the server error', async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: { message: 'User already registered' } });
    await renderScreen();
    await fill('Pat', 'pat@example.test', 'longenough');
    expect(screen.getByText('User already registered')).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
