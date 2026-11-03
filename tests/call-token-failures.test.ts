import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { AgoraTokenConfigurationError, generateAgoraRtcToken } from '../src/server/agoraService.ts';
import { CommunicationAccessError } from '../src/server/communicationAccess.ts';
import { classifyCallTokenFailure } from '../src/server/callTokenFailure.ts';
import { CallMediaSetupError, callMediaErrorMessage, callMediaFailureDetails } from '../src/lib/callMediaErrors.ts';

// Synthetic credentials only. These tests never contact Agora or a database.
const appId = 'a'.repeat(32);
const appCertificate = 'b'.repeat(32);
const { AccessToken2, kRtcServiceType } = createRequire(import.meta.url)('agora-token/src/AccessToken2.js');

test('real token builder signs short call leases with matching relative privilege expiry', () => {
  const result = generateAgoraRtcToken({
    appId: ` ${appId}\n`, appCertificate: ` ${appCertificate}\n`,
    channelName: 'nanivio_call_fixture', uid: 'fixture-user',
    expireTimeSeconds: 60, minimumExpireSeconds: 1,
  });
  const parsed = new AccessToken2('', '', 0, 0);
  assert.equal(parsed.from_string(result.token), true);
  assert.equal(parsed.verifySignature(appCertificate), true);
  assert.equal(parsed.appId.toString(), appId);
  assert.equal(parsed.expire, 60);
  const rtc = parsed.services.find((service: any) => service.service_type() === kRtcServiceType);
  assert.ok(rtc);
  const privileges = Object.values(rtc.__privileges);
  assert.ok(privileges.length >= 3);
  // Agora's AccessToken2 encodes privilege TTLs, not Unix timestamps.
  for (const expiry of privileges) assert.equal(expiry, 60);
  assert.equal(result.isMock, false);
});

test('malformed configured keys fail explicitly instead of silently returning an empty token', () => {
  for (const bad of ['not-an-app-id', '"'+appId+'"']) {
    assert.throws(() => generateAgoraRtcToken({
      appId: bad, appCertificate, channelName: 'fixture', uid: 'fixture',
    }), (error: unknown) => error instanceof AgoraTokenConfigurationError
      && error.code === 'CALL_CONFIGURATION_INVALID');
  }
});

test('call token failures retain allowance, permission, setup and temporary status', () => {
  const cases = [
    [new CommunicationAccessError(402, 'private'), 402, 'CALL_ALLOWANCE_REQUIRED'],
    [new CommunicationAccessError(403, 'private'), 403, 'CALL_NOT_AUTHORIZED'],
    [new CommunicationAccessError(409, 'private'), 409, 'CALL_NOT_READY'],
    [new CommunicationAccessError(503, 'private', 'COMMUNICATION_SETUP_REQUIRED'), 503, 'CALL_USAGE_SETUP_REQUIRED'],
    [new CommunicationAccessError(503, 'private'), 503, 'CALL_USAGE_UNAVAILABLE'],
    [new AgoraTokenConfigurationError('CALL_CONFIGURATION_INVALID'), 503, 'CALL_CONFIGURATION_INVALID'],
    [new Error('private provider details'), 500, 'CALL_TOKEN_UNAVAILABLE'],
  ] as const;
  for (const [error, status, code] of cases) {
    const result = classifyCallTokenFailure(error);
    assert.equal(result.status, status);
    assert.equal(result.code, code);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test('audio and video show only allowlisted support diagnostics, not raw upstream details', () => {
  for (const type of ['audio', 'video'] as const) {
    const error = new CallMediaSetupError('token', new Error('private provider details'),
      503, 'CALL_USAGE_SETUP_REQUIRED');
    const message = callMediaErrorMessage(error, type);
    assert.match(message, /administrator update/);
    assert.match(message, /Support code: CALL_USAGE_SETUP_REQUIRED/);
    assert.doesNotMatch(message, /private provider/);
    assert.equal(callMediaFailureDetails(error).supportCode, 'CALL_USAGE_SETUP_REQUIRED');
    const unknown = new CallMediaSetupError('token', new Error('private'), 500, 'private-value');
    assert.doesNotMatch(callMediaErrorMessage(unknown, type), /private-value/);
    assert.doesNotMatch(JSON.stringify(callMediaFailureDetails(unknown)), /private-value/);
    assert.match(callMediaErrorMessage(new CallMediaSetupError('token', new Error('private'), 402), type),
      /caller needs an active calling allowance/);
  }
});
