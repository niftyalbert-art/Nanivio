type Run = (name: string | undefined, args: unknown) => Promise<unknown>;
type Emit = (event: any) => void;

/** Gemini Live requires explicit function responses; the SDK does not execute tools. */
export function createGeminiReferenceBridge(run: Run, emit: Emit, isClosed: () => boolean) {
  const cancelled = new Set<string>();
  const seen = new Set<string>();
  return async (message: any) => {
    for (const id of message.toolCallCancellation?.ids || []) {
      if (typeof id === 'string' && cancelled.size < 100) cancelled.add(id);
    }
    const calls = (message.toolCall?.functionCalls || []).filter((call: any) =>
      typeof call.id === 'string' && typeof call.name === 'string' && !seen.has(call.id));
    if (seen.size + calls.length > 100) throw new Error('The session reference call limit was exceeded.');
    for (const call of calls) seen.add(call.id);
    if (!calls.length || isClosed()) return;
    const responses = await Promise.all(calls.map(async (call: any, index: number) => ({
      id: call.id, name: call.name,
      response: index >= 10 ? { error: 'Too many simultaneous reference lookups.' } : await run(call.name, call.args),
    })));
    if (!isClosed()) {
      const active = responses.filter(response => !cancelled.has(response.id));
      if (active.length) emit({ functionResponses: active });
    }
  };
}

/**
 * GPT-Live's Responses delegation wraps completed function items in response.event.
 * Arguments-done/lifecycle snapshots alone are not actionable function calls.
 */
export function createOpenAIReferenceBridge(run: Run, emit: Emit, isClosed: () => boolean) {
  const seen = new Set<string>();
  return async (envelope: any) => {
    if (isClosed() || envelope.type !== 'response.event' || envelope.event?.type !== 'response.output_item.done') return;
    const item = envelope.event.item;
    if (item?.type !== 'function_call' || typeof item.call_id !== 'string' || seen.has(item.call_id)) return;
    if (seen.size >= 100) throw new Error('The session reference call limit was exceeded.');
    seen.add(item.call_id);
    let output: unknown = { error: 'Invalid or excessive reference lookup arguments.' };
    if (seen.size <= 100 && typeof item.arguments === 'string' && item.arguments.length <= 2048) {
      try { output = await run(item.name, JSON.parse(item.arguments)); }
      catch { output = { error: 'Reference lookup could not be completed. Do not invent citations.' }; }
    }
    if (isClosed()) return;
    emit({ type: 'response.item.create', item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(output) } });
    // parallel_tool_calls is disabled in the session; each result resumes one backend call.
    emit({ type: 'response.create' });
  };
}
