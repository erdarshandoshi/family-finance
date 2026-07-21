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
}
