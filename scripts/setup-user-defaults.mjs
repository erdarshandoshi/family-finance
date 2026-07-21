// Sets userMemberDefaults in users/app-config so secondary users land on the right tab.
// Run: node scripts/setup-user-defaults.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCTjfk2P59AadOp4Mbxy3p0B-BGWTf8w2k',
  authDomain: 'family-finance-132be.firebaseapp.com',
  projectId: 'family-finance-132be',
  appId: '1:699062524230:web:eb722c84663de46ddd2d47',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ref = doc(db, 'users', 'app-config');
const snap = await getDoc(ref);
const existing = snap.exists() ? snap.data() : {};

const updated = {
  ...existing,
  userMemberDefaults: {
    ...(existing.userMemberDefaults ?? {}),
    'niyaatipatel@gmail.com':   'wife',
    'darshandoshi1990@gmail.com': 'kid',
  },
};

await setDoc(ref, updated);
console.log('app-config updated:', JSON.stringify(updated, null, 2));
process.exit(0);
