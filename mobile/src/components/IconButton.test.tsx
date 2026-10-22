import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import IconButton from './IconButton';

// @expo/vector-icons pulls in expo-font → expo-asset, which jest cannot
// resolve in this project; the icon glyph is irrelevant to these tests.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('IconButton', () => {
  it('is announced as a button with its label', () => {
    const onPress = jest.fn();
    render(<IconButton icon="trash-outline" label="Delete location" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Delete location' });
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
