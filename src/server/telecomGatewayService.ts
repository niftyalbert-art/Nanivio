import dotenv from 'dotenv';

dotenv.config();

export type TelecomProviderId = 'twilio' | 'infobip' | 'simulator';

export interface TelecomCarrierRoute {
  prefix: string;
  country: string;
  countryCode: string;
  flag: string;
  primaryProvider: TelecomProviderId;
  fallbackProvider: TelecomProviderId;
  supportedNetworks: string[];
  ratePerMinuteUSD: number;
  ratePerMinuteGHS: number;
  latencyMs: number;
  status: 'active' | 'standby';
}

export interface OutboundCallRequest {
  fromNumber?: string;
  toNumber: string;
  userId?: string;
  callerName?: string;
  sourceLang?: string;
  targetLang?: string;
  recordCall?: boolean;
}

export interface OutboundCallResult {
  success: boolean;
  callId: string;
  provider: TelecomProviderId;
  route: TelecomCarrierRoute;
  status: 'queued' | 'initiated' | 'ringing' | 'connected' | 'simulated';
  carrier: string;
  estimatedRateGHS: number;
  estimatedRateUSD: number;
  message: string;
  telecomReference?: string;
}

// Carrier routing table covering Africa and Global destinations
export const CARRIER_ROUTING_TABLE: TelecomCarrierRoute[] = [
  // West & Central Africa
  {
    prefix: '+233',
    country: 'Ghana',
    countryCode: 'GH',
    flag: '🇬🇭',
    primaryProvider: 'twilio',
    fallbackProvider: 'simulator',
    supportedNetworks: ['MTN Ghana', 'Telecel Ghana (Vodafone)', 'AT (AirtelTigo)', 'Glo Mobile'],
    ratePerMinuteUSD: 0.05,
    ratePerMinuteGHS: 0.75,
    latencyMs: 38,
    status: 'active',
  },
  {
    prefix: '+234',
    country: 'Nigeria',
    countryCode: 'NG',
    flag: '🇳🇬',
    primaryProvider: 'twilio',
    fallbackProvider: 'simulator',
    supportedNetworks: ['MTN Nigeria', 'Airtel Nigeria', 'Glo', '9mobile'],
    ratePerMinuteUSD: 0.06,
    ratePerMinuteGHS: 0.90,
    latencyMs: 45,
    status: 'active',
  },
  {
    prefix: '+254',
    country: 'Kenya',
    countryCode: 'KE',
    flag: '🇰🇪',
    primaryProvider: 'twilio',
    fallbackProvider: 'simulator',
    supportedNetworks: ['Safaricom', 'Airtel Kenya', 'Telkom Kenya'],
    ratePerMinuteUSD: 0.05,
    ratePerMinuteGHS: 0.75,
    latencyMs: 52,
    status: 'active',
  },
  {
    prefix: '+225',
    country: "Côte d'Ivoire",
    countryCode: 'CI',
    flag: '🇨🇮',
    primaryProvider: 'twilio',
    fallbackProvider: 'infobip',
    supportedNetworks: ['Orange CI', 'MTN CI', 'Moov Africa'],
    ratePerMinuteUSD: 0.08,
    ratePerMinuteGHS: 1.20,
    latencyMs: 48,
    status: 'active',
  },
  {
    prefix: '+221',
    country: 'Senegal',
    countryCode: 'SN',
    flag: '🇸🇳',
    primaryProvider: 'twilio',
    fallbackProvider: 'infobip',
    supportedNetworks: ['Orange Senegal', 'Free Senegal', 'Expresso'],
    ratePerMinuteUSD: 0.08,
    ratePerMinuteGHS: 1.20,
    latencyMs: 50,
    status: 'active',
  },
  {
    prefix: '+27',
    country: 'South Africa',
    countryCode: 'ZA',
    flag: '🇿🇦',
    primaryProvider: 'twilio',
    fallbackProvider: 'simulator',
    supportedNetworks: ['Vodacom', 'MTN South Africa', 'Telkom', 'Cell C'],
    ratePerMinuteUSD: 0.04,
    ratePerMinuteGHS: 0.60,
    latencyMs: 65,
    status: 'active',
  },
  {
    prefix: '+256',
    country: 'Uganda',
    countryCode: 'UG',
    flag: '🇺🇬',
    primaryProvider: 'twilio',
    fallbackProvider: 'simulator',
    supportedNetworks: ['MTN Uganda', 'Airtel Uganda'],
    ratePerMinuteUSD: 0.06,
    ratePerMinuteGHS: 0.90,
    latencyMs: 55,
    status: 'active',
  },
  {
    prefix: '+255',
    country: 'Tanzania',
    countryCode: 'TZ',
    flag: '🇹🇿',
    primaryProvider: 'twilio',
    fallbackProvider: 'simulator',
    supportedNetworks: ['Vodacom Tanzania', 'Tigo', 'Airtel Tanzania', 'Halotel'],
    ratePerMinuteUSD: 0.07,
    ratePerMinuteGHS: 1.05,
    latencyMs: 58,
    status: 'active',
  },

  // North America & Europe (Primary: Twilio / Infobip)
  {
    prefix: '+1',
    country: 'United States & Canada',
    countryCode: 'US',
    flag: '🇺🇸',
    primaryProvider: 'twilio',
    fallbackProvider: 'infobip',
    supportedNetworks: ['AT&T', 'Verizon', 'T-Mobile US', 'Rogers Canada', 'Bell Canada'],
    ratePerMinuteUSD: 0.02,
    ratePerMinuteGHS: 0.30,
    latencyMs: 25,
    status: 'active',
  },
  {
    prefix: '+44',
    country: 'United Kingdom',
    countryCode: 'GB',
    flag: '🇬🇧',
    primaryProvider: 'twilio',
    fallbackProvider: 'infobip',
    supportedNetworks: ['Vodafone UK', 'EE', 'O2 UK', 'Three UK', 'BT'],
    ratePerMinuteUSD: 0.03,
    ratePerMinuteGHS: 0.45,
    latencyMs: 30,
    status: 'active',
  },
  {
    prefix: '+33',
    country: 'France',
    countryCode: 'FR',
    flag: '🇫🇷',
    primaryProvider: 'twilio',
    fallbackProvider: 'infobip',
    supportedNetworks: ['Orange France', 'SFR', 'Bouygues Telecom', 'Free Mobile'],
    ratePerMinuteUSD: 0.03,
    ratePerMinuteGHS: 0.45,
    latencyMs: 32,
    status: 'active',
  },
  {
    prefix: '+49',
    country: 'Germany',
    countryCode: 'DE',
    flag: '🇩🇪',
    primaryProvider: 'twilio',
    fallbackProvider: 'infobip',
    supportedNetworks: ['Deutsche Telekom', 'Vodafone Germany', 'Telefónica O2'],
    ratePerMinuteUSD: 0.03,
    ratePerMinuteGHS: 0.45,
    latencyMs: 35,
    status: 'active',
  },
  {
    prefix: '+86',
    country: 'China',
    countryCode: 'CN',
    flag: '🇨🇳',
    primaryProvider: 'twilio',
    fallbackProvider: 'infobip',
    supportedNetworks: ['China Mobile', 'China Telecom', 'China Unicom'],
    ratePerMinuteUSD: 0.04,
    ratePerMinuteGHS: 0.60,
    latencyMs: 80,
    status: 'active',
  },
  {
    prefix: '+91',
    country: 'India',
    countryCode: 'IN',
    flag: '🇮🇳',
    primaryProvider: 'twilio',
    fallbackProvider: 'infobip',
    supportedNetworks: ['Jio', 'Airtel India', 'Vodafone Idea'],
    ratePerMinuteUSD: 0.03,
    ratePerMinuteGHS: 0.45,
    latencyMs: 70,
    status: 'active',
  },
  {
    prefix: '+971',
    country: 'United Arab Emirates',
    countryCode: 'AE',
    flag: '🇦🇪',
    primaryProvider: 'twilio',
    fallbackProvider: 'infobip',
    supportedNetworks: ['e& (Etisalat)', 'du'],
    ratePerMinuteUSD: 0.09,
    ratePerMinuteGHS: 1.35,
    latencyMs: 60,
    status: 'active',
  },
];

// Fallback Default Route for any unlisted country
export const DEFAULT_GLOBAL_ROUTE: TelecomCarrierRoute = {
  prefix: '+',
  country: 'Global International PSTN',
  countryCode: 'GLOBAL',
  flag: '🌐',
  primaryProvider: 'twilio',
  fallbackProvider: 'infobip',
  supportedNetworks: ['International Tier-1 Telecom Interconnects'],
  ratePerMinuteUSD: 0.08,
  ratePerMinuteGHS: 1.20,
  latencyMs: 65,
  status: 'active',
};

class TelecomGatewayManager {
  private activeCalls = new Map<string, any>();

  /**
   * Determine the best carrier route for any given destination phone number
   */
  public resolveCarrierRoute(rawNumber: string): {
    route: TelecomCarrierRoute;
    normalizedNumber: string;
    detectedCarrier: string;
  } {
    let clean = rawNumber.trim().replace(/[^\d+]/g, '');
    
    // Auto-prefix '+' if missing
    if (!clean.startsWith('+')) {
      // If it starts with '0' (e.g. Ghana local '024...'), assume Ghana +233
      if (clean.startsWith('0') && clean.length === 10) {
        clean = '+233' + clean.substring(1);
      } else {
        clean = '+' + clean;
      }
    }

    // Match longest prefix first
    const matchedRoute = CARRIER_ROUTING_TABLE.slice()
      .sort((a, b) => b.prefix.length - a.prefix.length)
      .find((r) => clean.startsWith(r.prefix)) || DEFAULT_GLOBAL_ROUTE;

    // Detect carrier network from prefix heuristics
    let detectedCarrier = matchedRoute.supportedNetworks[0] || 'Local Cellular Network';
    if (matchedRoute.countryCode === 'GH') {
      const sub = clean.replace('+233', '0').substring(0, 3);
      if (['024', '054', '055', '059', '053'].includes(sub)) detectedCarrier = 'MTN Ghana';
      else if (['020', '050'].includes(sub)) detectedCarrier = 'Telecel Ghana (Vodafone)';
      else if (['027', '057', '026', '056'].includes(sub)) detectedCarrier = 'AT (AirtelTigo)';
      else if (['023'].includes(sub)) detectedCarrier = 'Glo Mobile Ghana';
    } else if (matchedRoute.countryCode === 'NG') {
      const sub = clean.replace('+234', '0').substring(0, 4);
      if (['0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906'].includes(sub)) detectedCarrier = 'MTN Nigeria';
      else if (['0802', '0808', '0708', '0812', '0701', '0902', '0907', '0901'].includes(sub)) detectedCarrier = 'Airtel Nigeria';
      else if (['0805', '0807', '0705', '0815', '0811', '0905'].includes(sub)) detectedCarrier = 'Glo Nigeria';
      else if (['0809', '0818', '0817', '0909', '0908'].includes(sub)) detectedCarrier = '9mobile';
    }

    return {
      route: matchedRoute,
      normalizedNumber: clean,
      detectedCarrier,
    };
  }

  /**
   * Inspect current credentials status across all providers
   */
  public getGatewayConfigStatus() {
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    const infobipApiKey = process.env.INFOBIP_API_KEY;
    const infobipBaseUrl = process.env.INFOBIP_BASE_URL;

    return {
      twilio: {
        id: 'twilio' as TelecomProviderId,
        name: 'Twilio Global Telecom Backbone',
        region: 'Global PSTN (180+ Countries, US, UK, Europe, Africa, Asia)',
        isConfigured: !!(twilioAccountSid && twilioAuthToken),
        accountSid: twilioAccountSid ? `${twilioAccountSid.substring(0, 6)}...` : 'Not Set',
        callerId: twilioPhoneNumber || '+1XXXXXXXXXX',
        protocol: 'WebRTC / Programmable Voice / SIP Trunking',
      },
      infobip: {
        id: 'infobip' as TelecomProviderId,
        name: 'Infobip Global Enterprise Voice',
        region: 'Global & International Interconnects',
        isConfigured: !!(infobipApiKey && infobipBaseUrl),
        baseUrl: infobipBaseUrl || 'Not Set',
        protocol: 'Infobip Voice API',
      },
      multiCarrierRouter: {
        autoFailover: true,
        smartRoutingActive: true,
        totalConfiguredRoutes: CARRIER_ROUTING_TABLE.length,
        defaultFallback: 'Twilio / High-Fidelity Telecom Sandbox',
      },
    };
  }

  /**
   * Initiate Outbound Voice Call using Multi-Carrier Routing
   */
  public async initiateOutboundCall(request: OutboundCallRequest): Promise<OutboundCallResult> {
    const { route, normalizedNumber, detectedCarrier } = this.resolveCarrierRoute(request.toNumber);
    const callId = `call_nv_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    const config = this.getGatewayConfigStatus();
    let selectedProvider: TelecomProviderId = route.primaryProvider;

    // Only real carrier providers may originate a PSTN call. Never report a simulated call as successful.
    if (selectedProvider === 'twilio' && !config.twilio.isConfigured) {
      if (config.infobip.isConfigured) selectedProvider = 'infobip';
      else throw new Error('No production PSTN provider is configured for this route. Configure Twilio or Infobip.');
    }
    if (selectedProvider === 'simulator') {
      throw new Error('PSTN simulator is disabled in production.');
    }

    if (selectedProvider !== 'twilio') {
      throw new Error(`Configured PSTN provider ${selectedProvider} has no production call-origination adapter in this build.`);
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const configuredFrom = process.env.TWILIO_PHONE_NUMBER;
    const fromNumber = request.fromNumber || configuredFrom;
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio production voice is not fully configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER.');
    }

    const twiml = `<Response><Dial><Number>${normalizedNumber}</Number></Dial></Response>`;
    const body = new URLSearchParams({ To: normalizedNumber, From: fromNumber, Twiml: twiml });
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.sid) {
      throw new Error(`Twilio call creation failed (${response.status}): ${data?.message || 'No call SID returned'}`);
    }

    const callRecord = {
      callId: String(data.sid), toNumber: normalizedNumber, fromNumber,
      callerName: request.callerName || 'Nanivio User', provider: 'twilio' as TelecomProviderId,
      carrier: detectedCarrier, country: route.country, sourceLang: request.sourceLang || 'en',
      targetLang: request.targetLang || 'ak', startTime: Date.now(), status: String(data.status || 'queued'),
      rateGHS: route.ratePerMinuteGHS, rateUSD: route.ratePerMinuteUSD, telecomReference: String(data.sid),
    };
    this.activeCalls.set(callRecord.callId, callRecord);

    return {
      success: true, callId: callRecord.callId, provider: 'twilio', route,
      status: ['queued','initiated','ringing','connected'].includes(String(data.status)) ? String(data.status) as any : 'queued',
      carrier: detectedCarrier, estimatedRateGHS: route.ratePerMinuteGHS, estimatedRateUSD: route.ratePerMinuteUSD,
      message: `Live PSTN call created through Twilio to ${normalizedNumber}.`, telecomReference: String(data.sid),
    };
  }

  public getActiveCall(callId: string) {
    return this.activeCalls.get(callId) || null;
  }

  public endCall(callId: string) {
    const call = this.activeCalls.get(callId);
    if (call) {
      call.status = 'completed';
      call.endTime = Date.now();
      call.durationSeconds = Math.round((call.endTime - call.startTime) / 1000);
      this.activeCalls.delete(callId);
      return call;
    }
    return null;
  }
}

export const telecomGateway = new TelecomGatewayManager();
