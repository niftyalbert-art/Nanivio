import { conversationMemoryContext, memoryQuery, readConversationMemory } from './conversationMemory.ts';
import { MEMORY_TOOL_NAME } from './conversationMemory.ts';
import { claimResearch, researchPublicWeb, WEB_TOOL_NAME } from './webResearch.ts';
import { createReferenceToolRunner } from './referenceTools.ts';
import { MEDIA_TOOL, researchPublicMedia } from './mediaResearch.ts';
import { MAPS_TOOL, prepareDrivingRoute } from './mapTools.ts';
import { claimMalviRequest } from './liveUsage.ts';

export function createConversationTools(owner: string, notify: (payload: Record<string, unknown>) => void, closed: () => boolean) {
  const reference = createReferenceToolRunner(notify, closed);
  let active = false, used = 0, startedAt = 0;
  return async (name: string | undefined, args: unknown) => {
    if (closed()) return { error: 'The conversation has ended.' };
    if (name === MAPS_TOOL.name) {
      try {
        const result = prepareDrivingRoute(args);
        notify({ status: 'complete', results: [], assets: result });
        return result;
      } catch (error) { return { error: (error as Error).message }; }
    }
    if (name === MEMORY_TOOL_NAME) {
      try {
        const state = await readConversationMemory(owner, memoryQuery((args as any)?.query));
        return { enabled: state.enabled, context: conversationMemoryContext(state), found: state.messages.length };
      } catch { return { error: 'Saved account history is unavailable. Do not claim to remember it.' }; }
    }
    if (![WEB_TOOL_NAME, MEDIA_TOOL.name].includes(name || '')) {
      try { await claimMalviRequest(owner, 'research'); }
      catch { return { error: 'Research is unavailable or its account safety limit has been reached. Do not invent research results.' }; }
      return reference(name, args);
    }
    if (active || used >= 6 || Date.now() - startedAt < 3000) return { error: 'Web research limit reached. Use the available evidence or wait before another lookup.' };
    active = true; used++; startedAt = Date.now();
    notify({ status: 'searching', results: [], unavailable: [] });
    try {
      claimResearch(owner);
      await claimMalviRequest(owner, 'research');
      if (name === MEDIA_TOOL.name) {
        const result = await researchPublicMedia(args);
        if (closed()) return { error: 'The conversation has ended.' };
        notify({ status: result.items.length ? 'complete' : 'empty', results: [], assets: { media: result.items, limitation: result.limitation } });
        return result;
      }
      const result = await researchPublicWeb(args);
      if (closed()) return { error: 'The conversation has ended.' };
      notify({ status: result.verified ? 'complete' : 'empty', ...result, unavailable: [] });
      return result;
    } catch {
      if (!closed()) notify({ status: 'unavailable', results: [], unavailable: [] });
      return { error: 'Public web research failed. Do not claim that an internet lookup succeeded or invent citations.' };
    } finally { active = false; }
  };
}
