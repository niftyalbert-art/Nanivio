/**
 * Nanivio Tech. Gh. — Company Vision & Ecosystem Architecture
 *
 * Official single-source-of-truth document defining Nanivio Tech. Gh.,
 * the Founder / Visionary Mr. Albert Kwabena Atta Panyi (Mr. Nifty),
 * the core philosophy, the expandable ecosystem pillars, and the
 * clear boundary between current operational capabilities and planned future features.
 */

export interface FounderInfo {
  fullName: string;
  popularName: string;
  title: string;
  visionSummary: string;
}

export interface CompanyVisionInfo {
  companyName: string;
  registration: string;
  headquarters: string;
  corePhilosophy: string[];
  officialTagline: string;
  missionDescription: string;
}

export interface EcosystemPillar {
  id: string;
  title: string;
  summary: string;
  currentCapabilities: string[];
  plannedFutureCapabilities: string[];
}

export const NANIVIO_FOUNDER: FounderInfo = {
  fullName: 'Mr. Albert Kwabena Atta Panyi',
  popularName: 'Mr. Nifty',
  title: 'Founder & Visionary of Nanivio Tech. Gh.',
  visionSummary:
    'Building technology without borders — connecting people, businesses, professionals, financial opportunities, and cultures through intelligent, unified digital systems.',
};

export const NANIVIO_COMPANY: CompanyVisionInfo = {
  companyName: 'Nanivio Tech. Gh.',
  registration: 'Ghanaian & Global Technology Enterprise',
  headquarters: 'Accra, Ghana',
  officialTagline: 'Technology without borders. Communication without barriers. Opportunity without limits.',
  corePhilosophy: [
    'Technology without borders.',
    'Communication without barriers.',
    'Opportunity without limits.',
    'Connecting People, Businesses, Expertise and Financial Opportunities Through Intelligent Technology.',
  ],
  missionDescription:
    'Nanivio Tech. Gh. is a technology company focused on developing connected digital solutions that bring communication, business services, professional expertise, financial technology, artificial intelligence, language technology, and other digital services together within one cohesive, borderless ecosystem.',
};

export const ECOSYSTEM_PILLARS: EcosystemPillar[] = [
  {
    id: 'communication',
    title: '1. Connected Communication',
    summary:
      'High-definition voice and video calls, one-on-one and group real-time messaging, and universal 10-digit Nanivio user identifiers (0486XXXXXX).',
    currentCapabilities: [
      'High-definition 1-on-1 audio and video calling',
      'Multilateral group audio and video conferences',
      'Universal 10-digit Nanivio IDs (e.g. 0486XXXXXX) for direct international dialing',
      'Real-time encrypted text, voice notes, and media messaging',
      'Online presence indicators and call history logging',
    ],
    plannedFutureCapabilities: [
      'Low-bandwidth satellite-relay call mode for remote border regions',
      'AI-assisted automated meeting minutes and action item extraction',
      'Enterprise contact centers and unified customer support inboxes',
    ],
  },
  {
    id: 'language',
    title: '2. Language & Translation (Langpretation)',
    summary:
      'Scalable internationalization separating App/Interface Language, User Speaking Language, and Translation Language across dozens of international and African languages.',
    currentCapabilities: [
      'Separation of App Language, Speaking Language, and Translation Language',
      'Extensible language registry supporting dozens of international and African languages (Twi/Akan, Yoruba, Hausa, Swahili, Igbo, French, Arabic, English, Spanish, etc.)',
      'Real-time Langpretation text and voice transcription with receiver-language prioritization',
      'Multilingual interface with persistent local storage and backend profile synchronization',
    ],
    plannedFutureCapabilities: [
      'Native on-device neural voice translation for offline rural environments',
      'Broadening African indigenous dialect acoustic models (e.g., Fante, Ga, Ewe, Dagbani, Wolof)',
      'Simultaneous voice synthesis preserving the speaker’s original vocal timbre',
    ],
  },
  {
    id: 'business',
    title: '3. Nanivio Business Ecosystem',
    summary:
      'An interactive business communication and service ecosystem for restaurants, supermarkets, automotive, real estate, retail, health, and African enterprises.',
    currentCapabilities: [
      'Interactive business profiles with verified credentials, opening hours, catalogs, and service lists',
      'Direct customer-to-business messaging and voice/video calling',
      'Categorized business discovery (Restaurants, Groceries, Automotive, Real Estate, Health, Retail, African & Local Enterprises)',
      'Promotions, offers, and verified customer review showcase',
    ],
    plannedFutureCapabilities: [
      'Automated table bookings and order fulfillment dispatch API',
      'Integrated merchant inventory management and customer relationship management (CRM)',
      'Enterprise business analytics and cross-border vendor supply chain settlements',
    ],
  },
  {
    id: 'experts',
    title: '4. Nanivio Experts & Professional Services',
    summary:
      'Verified platform for discovering and consulting lawyers, accountants, physicians, consultants, engineers, designers, and tutors with live translation.',
    currentCapabilities: [
      'Verified professional profiles with credentials, hourly/minute consultation rates, and client reviews',
      'Instant audio, video, and chat consultations with live Langpretation',
      'Categorized expert roster (Medicine, Law, Technology, Finance, Education, Business Advisory)',
      'Real-time availability status (Online / Busy / In Consultation)',
    ],
    plannedFutureCapabilities: [
      'Integrated legal contract co-drafting and secure digital escrow signing',
      'Verified continuous professional development (CPD) certification badges',
      'Multi-expert panel triage for cross-border telemedicine second opinions',
    ],
  },
  {
    id: 'fintech',
    title: '5. Nanivio Fintech & Digital Wallets',
    summary:
      'Secure multi-currency wallet management, instant mobile money integrations (MTN MoMo, Telecel Cash), and planned compliant cross-border financial services.',
    currentCapabilities: [
      'Multi-currency digital wallet display and balances (GHS, USD, EUR, NGN)',
      'Structured mobile money transfer proposals requiring explicit user confirmation before processing',
      'Consultation fee and minute pack settlement logging',
      'Tiered subscription plan quotas and billing management',
    ],
    plannedFutureCapabilities: [
      'Fully licensed cross-border remittances adhering to local central bank regulations',
      'Merchant QR code payment points of sale (PoS) for brick-and-mortar storefronts',
      'Virtual and physical debit cards for international commerce',
      'Enterprise escrow rails for international commodities and trade transactions',
    ],
  },
  {
    id: 'malvi',
    title: '6. Malvi — Nanivio AI Assistant & Navigation Layer',
    summary:
      'An intelligent, multilingual guide and system intelligence layer across Nanivio, understanding the company vision, founder identity, and ecosystem actions.',
    currentCapabilities: [
      'Four Knowledge Layers: Nanivio Ecosystem, Nanivio Tech. Gh., Founder Mr. Nifty, and Real User Assistance',
      'Direct conversational guidance in the user’s selected App Language (English, Twi, French, Spanish, Arabic, etc.)',
      'Context-aware assistance linking to live user wallets, chats, calls, and expert rosters',
      'Action proposals with explicit confirmation requirements for sensitive financial or administrative operations',
      'Truthful distinction between active operational features and planned future capabilities',
    ],
    plannedFutureCapabilities: [
      'Proactive calendar scheduling and automated cross-border appointment coordination',
      'Live voice-interactive conversation mode with continuous natural turn-taking',
      'Automated multi-currency price comparison and business discovery curation',
    ],
  },
];
