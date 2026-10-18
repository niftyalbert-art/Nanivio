export interface PhoneVerificationDiagnosticEvent {
  id: string;
  createdAt: string;
  provider: 'prelude';
  operation: 'send' | 'check';
  status: number;
  code: string;
  message: string;
  requestId?: string;
}

export interface PhoneVerificationDiagnostics {
  events: PhoneVerificationDiagnosticEvent[];
  startedAt: string;
  storage: 'process-local';
  capacity: number;
  retentionHours: number;
}
