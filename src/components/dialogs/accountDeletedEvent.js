export const ACCOUNT_DELETED_EVENT = "griptrack:account-deleted";

/** Call right before signing out a deleted account (shows AccountDeletedOverlay). */
export function announceAccountDeleted() {
  window.dispatchEvent(new Event(ACCOUNT_DELETED_EVENT));
}
