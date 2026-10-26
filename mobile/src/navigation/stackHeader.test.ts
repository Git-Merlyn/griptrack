import { STACK_HEADER } from './stackHeader';

describe('STACK_HEADER', () => {
  it('hides the iOS 26 glass background behind header buttons', () => {
    expect(STACK_HEADER.headerRightBackgroundVisible).toBe(false);
  });

  it('keeps the dark header look', () => {
    expect(STACK_HEADER.headerStyle.backgroundColor).toBe('#1a1d23');
    expect(STACK_HEADER.headerTintColor).toBe('#4debf9');
  });
});
