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
}

export interface Stock {
  id: string;
  memberId: string;
  stockName: string;
  dateOfPurchase: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
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

export interface AppData {
  members: FamilyMember[];
  fds: FD[];
  stocks: Stock[];
  mfs: MutualFund[];
  ppf: PPFEntry[];
  pf: PFEntry[];
}
