import crypto from 'node:crypto';
import WebSocket from 'ws';

export function peer(origin, account) {
  const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/ws');
  const events = [];
  socket.on('message', message => {
    try { events.push(JSON.parse(message.toString())); } catch {}
  });
  const wait = async (type, callId, milliseconds = 12000) => {
    const end = Date.now() + milliseconds;
    while (Date.now() < end) {
      const index = events.findIndex(e => e.type === type && (!callId || e.payload?.callId === callId));
      if (index >= 0) return events.splice(index, 1)[0].payload;
      if (socket.readyState === WebSocket.CLOSED) throw new Error('WebSocket closed');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`No ${type} event within ${milliseconds}ms`);
  };
  const send = (type, payload) => socket.send(JSON.stringify({ type, payload }));
  return {
    socket, events, wait, send,
    async connect() {
      await new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      send('auth:presence', { token: account.token });
      return wait('auth:presence_ack');
    },
  };
}

export async function runChecks({ accounts, origin, originName, request }) {
  const checks = [];
  const connections = [];
  const active = [];
  const check = (name, passed, detail = {}) => checks.push({ name, passed, ...detail });
  const localAccounts = [];
  try {
    for (const account of accounts) {
      const login = await request(origin, '/api/auth/signin', null, {
        identifier: account.user.nvId, password: account.password,
      });
      check(`Account ${account.label}: password sign-in by Nanivio number`,
        login.status === 200 && login.data.user?.id === account.user.id && Boolean(login.data.session?.token),
        { status: login.status });
      if (!login.data.session?.token) {
        return { origin: originName, checks, blocked: 'The two test accounts could not authenticate on this origin.' };
      }
      account.token = login.data.session.token;
      localAccounts.push({ ...account, token: login.data.session.token });
    }
    for (const account of localAccounts) {
      const session = await request(origin, '/api/auth/session', account);
      check(`Account ${account.label}: real authenticated session`,
        session.status === 200 && session.data.user?.id === account.user.id,
        { status: session.status, role: session.data.user?.role });
      const admin = await request(origin, '/api/admin/users', account);
      check(`Account ${account.label}: non-admin access stays blocked`, [401, 403].includes(admin.status), { status: admin.status });
    }
    const [a, b] = localAccounts.map(account => peer(origin, account));
    connections.push(a, b);
    const presence = await Promise.all([a.connect(), b.connect()]);
    check('Both real sessions authenticate on WebSocket', presence.every(p => p.status === 'ONLINE'));

    for (const callType of ['audio', 'video']) {
      const callId = `qa_${crypto.randomUUID()}`;
      const channelName = `nanivio_call_${callId}`;
      active.push({ a, callId });
      a.send('call:initiate', { callId, channelName, callType, recipientNvId: accounts[1].user.nvId });
      const [ringing, incoming] = await Promise.all([a.wait('call:ringing', callId), b.wait('call:incoming', callId)]);
      check(`${callType}: invite routes by authenticated Nanivio number`,
        ringing.deliveredToLiveRecipient === true && incoming.caller?.id === accounts[0].user.id);
      b.send('call:accept', { callId });
      const [accepted, connected] = await Promise.all([a.wait('call:accepted', callId), b.wait('call:connected', callId)]);
      check(`${callType}: recipient accepts and both sides are connected`,
        accepted.channelName === channelName && connected.channelName === channelName);
      for (const account of localAccounts) {
        const token = await request(origin, '/api/agora/token', account, { channelName });
        check(`${callType}: account ${account.label} receives a real credential-signed RTC token`,
          token.status === 200 && token.data.success === true && Boolean(token.data.token),
          { status: token.status, providerChannelJoinVerified: false });
        const join = await request(origin, '/api/agora/join', account, { channelName, callType });
        check(`${callType}: account ${account.label} registers with the app's channel endpoint`,
          join.status === 200 && join.data.success === true, { status: join.status });
      }
      a.send('call:end', { callId });
      const ended = await b.wait('call:ended', callId);
      check(`${callType}: hangup reaches the other participant`, ended.endedBy === accounts[0].user.id);
      for (const account of localAccounts) {
        await request(origin, '/api/agora/leave', account, { channelName });
      }
    }

    const declineId = `qa_${crypto.randomUUID()}`;
    active.push({ a, callId: declineId });
    a.send('call:initiate', { callId: declineId, callType: 'audio', recipientNvId: accounts[1].user.nvId });
    await b.wait('call:incoming', declineId);
    b.send('call:decline', { callId: declineId, reason: 'Dedicated live QA decline check' });
    await a.wait('call:declined', declineId);
    check('Recipient decline reaches the caller', true);

    if (originName === 'workspace') {
      const timeoutId = `qa_${crypto.randomUUID()}`;
      active.push({ a, callId: timeoutId });
      a.send('call:initiate', { callId: timeoutId, callType: 'audio', recipientNvId: accounts[1].user.nvId });
      await b.wait('call:incoming', timeoutId);
      const [callerTimeout, recipientTimeout] = await Promise.all([
        a.wait('call:ended', timeoutId, 35000), b.wait('call:ended', timeoutId, 35000),
      ]);
      check('Unanswered call expires on both peers after the server ringing timeout',
        callerTimeout.reason === 'NO_ANSWER' && recipientTimeout.reason === 'NO_ANSWER');
    }

    const disconnectId = `qa_${crypto.randomUUID()}`;
    active.push({ a, callId: disconnectId });
    a.send('call:initiate', { callId: disconnectId, callType: 'audio', recipientNvId: accounts[1].user.nvId });
    await b.wait('call:incoming', disconnectId);
    b.send('call:accept', { callId: disconnectId });
    await a.wait('call:accepted', disconnectId);
    b.socket.close();
    try {
      await a.wait('call:ended', disconnectId, 5000);
      check('Disconnect terminates the call on the remaining participant', true);
    } catch {
      check('Disconnect terminates the call on the remaining participant', false,
        { detail: 'No call:ended event arrived within 5 seconds after the callee socket closed.' });
    }
    a.send('call:end', { callId: disconnectId });
    for (const account of localAccounts) {
      await request(origin, '/api/agora/leave', account, { channelName: `nanivio_call_${disconnectId}` });
    }

    const meterBefore = await request(origin, '/api/billing/langpretation/meter', localAccounts[0]);
    const translation = await request(origin, '/api/translate', localAccounts[0], {
      text: `Hello. Today is ${new Date().toISOString().slice(0, 10)}. Thank you for your help.`,
      sourceLang: 'en', targetLang: 'ak',
    });
    check('Actual English-to-Twi translation provider returns output',
      translation.status === 200 && translation.data.success === true &&
      Boolean(translation.data.translatedText) && !translation.data.untranslated,
      { status: translation.status, provider: translation.data.provider,
        translatedText: translation.data.translatedText, cached: translation.data.cached === true });
    {
      const sunbird = await request(origin, '/api/translate', localAccounts[0], {
        text: 'Good morning. Thank you for your help.', sourceLang: 'en', targetLang: 'lg',
      });
      check('Actual English-to-Luganda provider returns output',
        sunbird.status === 200 && sunbird.data.success === true &&
        Boolean(sunbird.data.translatedText) && !sunbird.data.untranslated,
        { status: sunbird.status, provider: sunbird.data.provider,
          translatedText: sunbird.data.translatedText, cached: sunbird.data.cached === true });
    }
    const meterAfter = await request(origin, '/api/billing/langpretation/meter', localAccounts[0]);
    check('Authenticated quota meter is readable',
      meterBefore.status === 200 && meterAfter.status === 200,
      { beforeStatus: meterBefore.status, afterStatus: meterAfter.status,
        quotaConsumptionVerified: false });
    return { origin: originName, checkedAt: new Date().toISOString(), checks,
      notVerified: ['Physical media capture and playback',
        'Authoritative quota consumption during real media',
        ...(originName === 'render' ? ['Timeout on the unchanged Render version'] : []),
        'See the separate authenticated browser run for UI and provider channel joins'] };
  } catch (error) {
    check('Live suite completed', false, { detail: error.message });
    return { origin: originName, checks, blocked: 'A live scenario failed; remaining scenarios were not assumed to pass.' };
  } finally {
    for (const { a, callId } of active) {
      if (a.socket.readyState === WebSocket.OPEN) a.send('call:end', { callId });
    }
    for (const connection of connections) connection.socket.close();
  }
}
