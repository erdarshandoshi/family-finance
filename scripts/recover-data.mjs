// Data recovery script: reads current Firestore state for the owner's UID.
// Run: node scripts/recover-data.mjs <UID>
// The UID is the owner's Google sub (numeric string). Find it from browser console:
//   JSON.parse(localStorage.getItem('ff_auth'))?.user?.uid

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCTjfk2P59AadOp4Mbxy3p0B-BGWTf8w2k',
  authDomain: 'family-finance-132be.firebaseapp.com',
  projectId: 'family-finance-132be',
  appId: '1:699062524230:web:eb722c84663de46ddd2d47',
};

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node scripts/recover-data.mjs <UID>');
  console.error('Find UID in browser console: JSON.parse(localStorage.getItem("ff_auth"))?.user?.uid');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const snap = await getDoc(doc(db, 'users', uid));
if (!snap.exists()) {
  console.log('No Firestore document found for this UID.');
} else {
  const data = snap.data();
  const counts = {
    members: data.members?.length ?? 0,
    fds: data.fds?.length ?? 0,
    stocks: data.stocks?.length ?? 0,
    mfs: data.mfs?.length ?? 0,
    ppf: data.ppf?.length ?? 0,
    pf: data.pf?.length ?? 0,
    insurances: data.insurances?.length ?? 0,
    postInvestments: data.postInvestments?.length ?? 0,
    nps: data.nps?.length ?? 0,
  };
  console.log('Current Firestore data for UID', uid, ':');
  console.log(JSON.stringify(counts, null, 2));

  const total = counts.fds + counts.stocks + counts.mfs + counts.ppf + counts.pf + counts.insurances + counts.postInvestments + counts.nps;
  if (total === 0) {
    console.log('\n⚠️  Data appears to be empty. Recovery needed.');
    console.log('To recover: open the app in the browser (Chrome), go to DevTools > Console, run:');
    console.log('  const d = JSON.parse(localStorage.getItem("family-finance-data")); console.log(JSON.stringify({fds: d?.fds?.length, stocks: d?.stocks?.length, mfs: d?.mfs?.length}))');
    console.log('If localStorage has data, simply refreshing the app (with the reverted code deployed) will auto-restore it to Firestore.');
  } else {
    console.log('\n✓ Data looks intact with', total, 'investment entries.');
  }
}
process.exit(0);
