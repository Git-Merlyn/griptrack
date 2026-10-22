import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import PickerModal, { stringOptions } from './PickerModal';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const options = [
  { key: 't1', label: 'Grip' },
  { key: 't2', label: 'Electric' },
  { key: 't3', label: 'Camera' },
  { key: 't4', label: 'Art' },
  { key: '__none__', label: 'No team' },
];

describe('PickerModal', () => {
  it('shows every option — no 3-button cap like Android Alert', async () => {
    await render(
      <PickerModal visible title="Assign team" options={options} selectedKey="t4"
        onSelect={jest.fn()} onClose={jest.fn()} />
    );
    for (const o of options) expect(screen.getByText(o.label)).toBeTruthy();
    expect(screen.getByText('Assign team')).toBeTruthy();
  });

  it('selecting an option reports its key and closes', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await render(
      <PickerModal visible title="Assign team" options={options} selectedKey={null}
        onSelect={onSelect} onClose={onClose} />
    );
    await fireEvent.press(screen.getByText('No team'));
    expect(onSelect).toHaveBeenCalledWith('__none__');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks the current option as selected', async () => {
    await render(
      <PickerModal visible title="Assign team" options={options} selectedKey="t2"
        onSelect={jest.fn()} onClose={jest.fn()} />
    );
    const selected = screen.getAllByRole('button', { selected: true });
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('Electric');
  });

  it('can be dismissed with the labelled close button', async () => {
    const onClose = jest.fn();
    await render(
      <PickerModal visible title="Role" options={options} selectedKey={null}
        onSelect={jest.fn()} onClose={onClose} />
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the empty text when there are no options', async () => {
    await render(
      <PickerModal visible title="Location" options={[]} selectedKey={null}
        onSelect={jest.fn()} onClose={jest.fn()}
        emptyText="No locations set up yet." />
    );
    expect(screen.getByText('No locations set up yet.')).toBeTruthy();
  });
});

describe('stringOptions', () => {
  it('uses each string as both key and label', () => {
    expect(stringOptions(['A', 'B'])).toEqual([
      { key: 'A', label: 'A' },
      { key: 'B', label: 'B' },
    ]);
  });
});
