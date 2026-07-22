export type MemberRelation = 'self' | 'wife' | 'kid';

export interface FamilyMember {
  id: string;
  name: string;
  relation: MemberRelation;
}

export interface FD {
  id: string;
  memberId: string;
  bankName: string;
  customerId: string;
  accountNumber: string;
  amountInvested: number;
  maturityAmount: number;
  dateOfInvestment: string;
  maturityDate: string;
  rateOfInterest: number;
  nominee?: string;
  isJoint?: boolean;
  jointHolderName?: string;
}

export interface Stock {
  id: string;
  memberId: string;
  symbol: string;
  stockName: string;
  isin: string;
  dateOfPurchase: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  dematAccount?: string;
}

export interface MutualFund {
  id: string;
  memberId: string;
  companyName: string;
  schemeName: string;
  isSIP: boolean;
  quantity: number;
  purchasePrice: number;
  dateOfPurchase: string;
  currentPrice: number;
  schemeCode?: string;
  nominee?: string;
  folioNumber?: string;
  remarks?: string;
  /** Legal holder when the fund is earmarked for another member (e.g. a minor's SIP held by a parent). */
  guardianMemberId?: string;
}

export interface PPFEntry {
  id: string;
  memberId: string;
  currentAmount: number;
  yearlyContribution: number;
  lastUpdated: string;
  accountNumber: string;
}

export interface PFEntry {
  id: string;
  memberId: string;
  currentAmount: number;
  employeeContribution: number;
  employerContribution: number;
  lastUpdated: string;
  uanNumber: string;
}

export interface InsurancePolicy {
  id: string;
  memberId: string;
  type: 'mediclaim' | 'term';
  insurer: string;
  policyNumber: string;
  planName: string;
  sumAssured: number;
  premiumAmount: number;
  premiumFrequency: 'monthly' | 'quarterly' | 'half-yearly' | 'annual';
  startDate: string;
  endDate: string;
  nominees: string;
  notes: string;
  coverageType: 'individual' | 'floater';
  policyTerm: number;
}

export type PostScheme = 'NSC' | 'KVP' | 'MIS' | 'TD' | 'SCSS' | 'RD' | 'SSY';

export interface PostInvestment {
  id: string;
  memberId: string;
  scheme: PostScheme;
  accountNumber: string;
  principal: number;
  monthlyDeposit: number;
  interestRate: number;
  startDate: string;
  maturityDate: string;
  maturityAmount: number;
  notes: string;
}

export type NPSFundManager =
  | 'SBI Pension' | 'LIC Pension' | 'UTI Retirement' | 'HDFC Pension'
  | 'ICICI Pru Pension' | 'Kotak Pension' | 'Aditya Birla Pension'
  | 'Max Life Pension' | 'Tata Pension' | 'DSP Pension';

export type NPSInvestmentOption = 'Active' | 'Auto-LC25' | 'Auto-LC50' | 'Auto-LC75';

export interface NPSEntry {
  id: string;
  memberId: string;
  pran: string;
  tier: 'I' | 'II';
  fundManager: NPSFundManager;
  investmentOption: NPSInvestmentOption;
  totalInvested: number;
  currentCorpus: number;
  equityPct?: number;
  corporateBondPct?: number;
  govtSecPct?: number;
  altAssetPct?: number;
  dateOfJoining: string;
  notes?: string;
}

export type JournalMood = 'happy' | 'excited' | 'funny' | 'calm' | 'sad' | 'surprised';

export interface JournalEntry {
  id: string;
  memberId: string;
  text: string;
  date: string;        // YYYY-MM-DD
  createdAt: string;   // ISO timestamp
  mood?: JournalMood;
  isMilestone: boolean;
  title?: string;
}

export type AssetKey = 'fd' | 'stocks' | 'mf' | 'ppf' | 'pf' | 'post' | 'nps';

export interface NetWorthSnapshot {
  date: string;   // YYYY-MM-DD (capture date)
  total: number;
  fd: number; stocks: number; mf: number; ppf: number; pf: number; post: number; nps: number;
}

export interface Goals {
  netWorthTarget?: number;
  targetDate?: string;                              // YYYY-MM-DD
  targetAllocation?: Partial<Record<AssetKey, number>>;  // percentages summing ~100
}

// ─── SIP automation: folio registry + review inbox ───────────────────────────

/**
 * Maps an AMC folio to the family member it's earmarked for (beneficiary) and the
 * legal holder (guardian). Set once, then reused to auto-attribute incoming SIPs.
 */
export interface FolioMapping {
  id: string;
  folioNumber: string;
  amc: string;
  schemeName: string;
  schemeCode?: string;          // mfapi.in code — enables live NAV + unit estimation
  memberId: string;             // beneficiary — whose tab it shows under
  guardianMemberId?: string;    // legal holder (e.g. parent for a minor's SIP)
  isSIP: boolean;
  sipAmount?: number;           // expected installment — helps match/validate
}

export type PendingSource = 'paste' | 'gmail' | 'sms';

/**
 * A parsed-but-unconfirmed SIP installment awaiting human review before it becomes
 * a real MF lot. Units/NAV may be estimated from mfapi.in when the AMC email omits them.
 */
export interface PendingTransaction {
  id: string;
  source: PendingSource;
  externalId?: string;          // gmail message id / dedupe fingerprint
  folioNumber: string;
  amc: string;
  schemeName: string;
  schemeCode?: string;
  memberId?: string;            // resolved beneficiary (from folio registry)
  guardianMemberId?: string;    // resolved guardian
  amount: number;
  installmentDate: string;      // ISO yyyy-mm-dd
  estimatedUnits?: number;
  estimatedNav?: number;
  navDate?: string;             // ISO date the NAV is sourced from (the "value date")
  unitsEstimated?: boolean;     // true = derived from a NAV lookup; false = stated in the email
  receivedAt?: string;          // ISO timestamp the email actually arrived
  isSIP: boolean;
  createdAt: string;            // ISO timestamp
  rawText?: string;
  warnings?: string[];          // e.g. "No folio mapping", "Units estimated from NAV"
  gmailAccount?: string;        // which Gmail inbox the email arrived in
}

export interface AppData {
  members: FamilyMember[];
  fds: FD[];
  stocks: Stock[];
  mfs: MutualFund[];
  ppf: PPFEntry[];
  pf: PFEntry[];
  insurances: InsurancePolicy[];
  postInvestments: PostInvestment[];
  nps: NPSEntry[];
  journal: JournalEntry[];
  snapshots?: NetWorthSnapshot[];
  goals?: Goals;
  folioMappings?: FolioMapping[];
  pendingTransactions?: PendingTransaction[];
}
