import type { DeletionFileTransport, OwnedFile } from './accountDeletionOperations';
import { DeletionBlocked } from './accountDeletionWorker';

function safeFile(file: OwnedFile) {
  let url: URL;
  try { url = new URL(file.url); } catch { throw new DeletionBlocked('REVIEW_REQUIRED'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
    !(url.hostname === 'stream-io-cdn.com' || url.hostname.endsWith('.stream-io-cdn.com')) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(file.channel_id))
    throw new DeletionBlocked('REVIEW_REQUIRED');
  return url;
}

export function createDeletionFileTransport(
  remove: (channelId: string, url: string) => Promise<void>,
  request: typeof fetch = fetch,
): DeletionFileTransport {
  return {
    async remove(file) {
      safeFile(file);
      await remove(file.channel_id, file.url);
    },
    async absent(file) {
      const url = safeFile(file);
      const response = await request(url, {
        method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(5000),
        // No server credentials are ever sent to a CDN.
      });
      // Signed-link expiry (401/403), redirects, errors and method refusal do
      // not establish file deletion.
      return response.status === 404 || response.status === 410;
    },
  };
}
