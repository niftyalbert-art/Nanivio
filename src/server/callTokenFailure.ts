import { CommunicationAccessError } from './communicationAccess.ts';
import { AgoraTokenConfigurationError } from './agoraService.ts';
import { CALL_TOKEN_ERRORS, type CallTokenErrorCode } from '../shared/callTokenErrors.ts';

export function classifyCallTokenFailure(error: unknown) {
  let status = 500;
  let code: CallTokenErrorCode = 'CALL_TOKEN_UNAVAILABLE';
  if (error instanceof AgoraTokenConfigurationError) {
    status = 503;
    code = error.code;
  } else if (error instanceof CommunicationAccessError) {
    status = error.status;
    if (status === 402) code = 'CALL_ALLOWANCE_REQUIRED';
    else if (status === 403) code = 'CALL_NOT_AUTHORIZED';
    else if (status === 409) code = 'CALL_NOT_READY';
    else {
      status = 503;
      code = error.code === 'COMMUNICATION_SETUP_REQUIRED'
        ? 'CALL_USAGE_SETUP_REQUIRED' : 'CALL_USAGE_UNAVAILABLE';
    }
  }
  return { status, code, error: CALL_TOKEN_ERRORS[code] };
}
