import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import IconButton from './IconButton';

// @expo/vector-icons pulls in expo-font → expo-asset, which jest cannot
// resolve in this project; the icon glyph is irrelevant to these tests.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('IconButton', () => {
  it('is announced as a button with its label', async () => {
    const onPress = jest.fn();
    await render(<IconButton icon="trash-outline" label="Delete location" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Delete location' });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
