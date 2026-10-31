/**
 * Persistence is the send boundary. A failed/offline recipient notification
 * must not turn a durably saved message into a failed send.
 */
export async function confirmSavedChat(
  acknowledge: () => void,
  notifyRecipients: () => Promise<void>,
  onNotificationFailure: () => void,
): Promise<void> {
  acknowledge();
  try {
    await notifyRecipients();
  } catch {
    onNotificationFailure();
  }
}
