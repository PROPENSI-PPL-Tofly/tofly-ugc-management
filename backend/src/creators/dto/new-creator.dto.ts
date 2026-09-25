// The request and response of onboarding a creator. Field names match the Add Creator form's
// CreatorFormInput (frontend/src/lib/creator-form.ts) one for one, so the form value can be
// sent as it is once the deadlines the admin scheduled are added to it.

export interface NewCreator {
  name: string;
  email: string;
  /** ISO calendar days (`YYYY-MM-DD`). */
  contractStart: string;
  contractEnd: string;
  /** Days between the auto-generated deadlines. */
  interval: number;
  /** How many Evergreen contents the contract commits to; one per deadline. */
  quota: number;
  fixedRate: number;
  socialPlatform: 'instagram' | 'tiktok';
  socialUsername: string;
  /** Probation or regular; informational only, no rule reads it. */
  contractType: 'probation' | 'regular';
  /** One ISO calendar day per Evergreen content: auto-generated slots plus manual ones. */
  deadlines: string[];
}

export interface OnboardedContent {
  id: string;
  name: string;
  deadline: string;
}

export interface OnboardedCreator {
  id: string;
  /** The whitelisted login. */
  email: string;
  contractId: string;
  contents: OnboardedContent[];
}
