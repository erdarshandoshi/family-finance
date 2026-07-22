import type { MutualFund } from '../types';

export interface MFGroup {
  key: string;
  schemeCode?: string;
  companyName: string;
  schemeName: string;
  memberId: string;
  isSIP: boolean;
  folioNumber?: string;
  nominee?: string;
  remarks?: string;
  guardianMemberId?: string;
  lots: MutualFund[];
  totalUnits: number;
  avgPurchaseNav: number;
  totalInvested: number;
  currentNav: number;
  totalCurrent: number;
  pl: number;
  plPct: number;
  earliestDate: string;
}

export function groupMutualFunds(mfs: MutualFund[]): MFGroup[] {
  const map = new Map<string, MFGroup>();

  for (const mf of mfs) {
    const key = mf.schemeCode
      ? `${mf.schemeCode}__${mf.memberId}`
      : `${mf.companyName}__${mf.schemeName}__${mf.memberId}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        schemeCode: mf.schemeCode,
        companyName: mf.companyName,
        schemeName: mf.schemeName,
        memberId: mf.memberId,
        isSIP: mf.isSIP,
        folioNumber: mf.folioNumber,
        nominee: mf.nominee,
        remarks: mf.remarks,
        guardianMemberId: mf.guardianMemberId,
        lots: [],
        totalUnits: 0,
        avgPurchaseNav: 0,
        totalInvested: 0,
        currentNav: 0,
        totalCurrent: 0,
        pl: 0,
        plPct: 0,
        earliestDate: mf.dateOfPurchase,
      });
    }

    const group = map.get(key)!;
    group.lots.push(mf);
    if (mf.folioNumber) group.folioNumber = mf.folioNumber;
    if (mf.nominee) group.nominee = mf.nominee;
    if (mf.remarks) group.remarks = mf.remarks;
    if (mf.guardianMemberId) group.guardianMemberId = mf.guardianMemberId;
    if (mf.dateOfPurchase < group.earliestDate) group.earliestDate = mf.dateOfPurchase;
  }

  for (const group of map.values()) {
    group.totalUnits = group.lots.reduce((s, l) => s + l.quantity, 0);
    group.totalInvested = group.lots.reduce((s, l) => s + l.quantity * l.purchasePrice, 0);
    group.avgPurchaseNav = group.totalUnits > 0 ? group.totalInvested / group.totalUnits : 0;
    group.currentNav = Math.max(...group.lots.map(l => l.currentPrice), 0);
    group.totalCurrent = group.totalUnits * group.currentNav;
    group.pl = group.totalCurrent - group.totalInvested;
    group.plPct = group.totalInvested > 0 ? (group.pl / group.totalInvested) * 100 : 0;
  }

  return Array.from(map.values());
}
