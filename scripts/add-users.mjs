// One-shot script to add users to Firestore access-control list
// Run: node scripts/add-users.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCTjfk2P59AadOp4Mbxy3p0B-BGWTf8w2k',
  authDomain: 'family-finance-132be.firebaseapp.com',
  projectId: 'family-finance-132be',
  appId: '1:699062524230:web:eb722c84663de46ddd2d47',
};

const EMAILS_TO_ADD = [
  'niyaatipatel@gmail.com',
  'darshandoshi1990@gmail.com',
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ref = doc(db, 'users', 'access-control');
const snap = await getDoc(ref);

const existing = snap.exists() ? (snap.data().emails ?? []) : [];
console.log('Current access list:', existing.length === 0 ? '(empty — open access)' : existing);

const toAdd = EMAILS_TO_ADD.filter(e => !existing.includes(e));
if (toAdd.length === 0) {
  console.log('Both emails already in the list. Nothing to do.');
  process.exit(0);
}

// Only write if the list is already restricted; if empty, Firestore allows everyone anyway
if (existing.length === 0) {
  console.log('Firestore list is empty (open access mode) — no update needed. VITE_ALLOWED_EMAILS fix is sufficient.');
  process.exit(0);
}

const updated = [...existing, ...toAdd];
await setDoc(ref, { emails: updated });
console.log('Updated access list:', updated);
console.log('Done. Both users now have access.');
process.exit(0);
