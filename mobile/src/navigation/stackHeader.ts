/** Shared header look for the app's native stacks (Inventory, Settings). */
export const STACK_HEADER = {
  headerStyle: { backgroundColor: '#1a1d23' },
  headerTintColor: '#4debf9',
  headerTitleStyle: { color: '#f1f5f9', fontWeight: '600' as const },
  // iOS 26 draws a Liquid Glass disc behind header buttons by default, which
  // shows as a pale grey circle on this dark header (Chris, 2026-10-26).
  // Our buttons draw their own icons; no effect before iOS 26 or on Android.
  headerRightBackgroundVisible: false,
};
