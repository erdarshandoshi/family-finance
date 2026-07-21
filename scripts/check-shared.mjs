import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

const cfg = {
  apiKey: 'AIzaSyCTjfk2P59AadOp4Mbxy3p0B-BGWTf8w2k',
  authDomain: 'family-finance-132be.firebaseapp.com',
  projectId: 'family-finance-132be',
  appId: '1:699062524230:web:eb722c84663de46ddd2d47',
};
const db = getFirestore(initializeApp(cfg));

function count(d) {
  return (d?.fds?.length??0)+(d?.stocks?.length??0)+(d?.mfs?.length??0)
        +(d?.ppf?.length??0)+(d?.pf?.length??0)+(d?.insurances?.length??0)
        +(d?.postInvestments?.length??0)+(d?.nps?.length??0);
}

for (const p of ['shared-family','shared-family_bk','app-config']) {
  const snap = await getDoc(doc(db,'users',p));
  if (!snap.exists()) { console.log(`users/${p}: not found`); continue; }
  const d = snap.data();
  const n = count(d);
  console.log(`users/${p}: ${n} investments | members: ${d.members?.map(m=>m.name).join(', ')||'none'}`);
  if (p === 'app-config') console.log('  config:', JSON.stringify(d));
}
process.exit(0);
