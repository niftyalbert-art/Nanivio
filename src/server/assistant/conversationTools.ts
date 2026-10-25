import { conversationMemoryContext, memoryQuery, readConversationMemory } from './conversationMemory.ts';
import { MEMORY_TOOL_NAME } from './conversationMemory.ts';
import { claimResearch, researchPublicWeb, WEB_TOOL_NAME } from './webResearch.ts';
import { createReferenceToolRunner } from './referenceTools.ts';

export function createConversationTools(owner: string, notify: (payload: Record<string, unknown>) => void, closed: () => boolean) {
  const reference = createReferenceToolRunner(notify, closed);
  let active = false, used = 0, startedAt = 0;
  return async (name: string | undefined, args: unknown) => {
    if (closed()) return { error: 'The conversation has ended.' };
    if (name === MEMORY_TOOL_NAME) {
      try {
        const state = await readConversationMemory(owner, memoryQuery((args as any)?.query));
        return { enabled: state.enabled, context: conversationMemoryContext(state), found: state.messages.length };
      } catch { return { error: 'Saved account history is unavailable. Do not claim to remember it.' }; }
    }
    if (name !== WEB_TOOL_NAME) return reference(name, args);
    if (active || used >= 6 || Date.now() - startedAt < 3000) return { error: 'Web research limit reached. Use the available evidence or wait before another lookup.' };
    active = true; used++; startedAt = Date.now();
    notify({ status: 'searching', results: [], unavailable: [] });
    try {
      claimResearch(owner);
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
