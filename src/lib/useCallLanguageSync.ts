import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { SUPPORTED_LANGUAGES, type CallSession, type SupportedLanguageCode } from '../types';
import { realtimeClient } from './realtimeClient';

/** Call language updates are participant-scoped, not stale invitation metadata. */
export function useCallLanguageSync(
  call: CallSession | null, language: SupportedLanguageCode, userId: string,
  setCall: Dispatch<SetStateAction<CallSession | null>>, transport = realtimeClient,
) {
  useEffect(() => transport.on('call:participant_language', payload => {
    if (!SUPPORTED_LANGUAGES.some(item => item.code === payload?.language)) return;
    setCall(previous => previous?.id === payload.callId && previous.participants.some(person => person.id === payload.userId)
      ? { ...previous,
        host: previous.host.id === payload.userId ? { ...previous.host, myLanguage: payload.language } : previous.host,
        participants: previous.participants.map(person => person.id === payload.userId ? { ...person, myLanguage: payload.language } : person) }
      : previous);
  }), [setCall, transport]);
  useEffect(() => {
    const send = () => {
      if (call && !['ended', 'declined'].includes(call.status) && call.participants.some(person => person.id === userId))
        transport.send('call:language', { callId: call.id, language });
    };
    send();
    return transport.on('auth:presence_ack', send);
  }, [call?.id, call?.status, language, userId, transport]);
}
