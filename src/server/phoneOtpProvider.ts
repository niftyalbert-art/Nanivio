export interface PhoneOtpProvider {
  readonly name: 'didit';
  readonly maxAttempts?: number;
  send(phone: string): Promise<{ id: string; channel: 'sms' }>;
  check(id: string, phone: string, code: string): Promise<boolean>;
}
