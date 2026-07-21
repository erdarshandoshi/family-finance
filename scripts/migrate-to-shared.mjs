// Finds all existing data across old Firestore paths and writes the richest
// copy into users/shared-family so all family members can access it.
// Run: node scripts/migrate-to-shared.mjs <uid>
// Get UID from browser console: JSON.parse(localStorage.getItem('ff_auth'))?.user?.uid

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
  console.error('Usage: node scripts/migrate-to-shared.mjs <uid>');
  console.error('Get UID: open app in Chrome → F12 → Console → JSON.parse(localStorage.getItem("ff_auth"))?.user?.uid');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

function count(data) {
  return (data?.fds?.length ?? 0) + (data?.stocks?.length ?? 0) + (data?.mfs?.length ?? 0)
       + (data?.ppf?.length ?? 0) + (data?.pf?.length ?? 0) + (data?.insurances?.length ?? 0)
       + (data?.postInvestments?.length ?? 0) + (data?.nps?.length ?? 0);
}

async function tryGet(path) {
  try {
    const snap = await getDoc(doc(db, 'users', path));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// Read all candidate sources
const sources = {
  'shared-family':    await tryGet('shared-family'),
  'shared-family_bk': await tryGet('shared-family_bk'),
  [`${uid}`]:         await tryGet(uid),
  [`${uid}_bk`]:      await tryGet(uid + '_bk'),
};

console.log('\nData counts found across all sources:');
let best = null, bestCount = -1, bestSource = 'none';
for (const [src, data] of Object.entries(sources)) {
  const n = count(data);
  console.log(`  users/${src}: ${data ? n + ' investments' : '(not found)'}`);
  if (data && n > bestCount) { best = data; bestCount = n; bestSource = src; }
}

if (!best || bestCount === 0) {
  console.log('\n⚠️  No investment data found in any Firestore document.');
  console.log('The data may only exist in browser localStorage.');
  console.log('→ Open the app as Darshan, refresh once — it will auto-restore from localStorage.');
  process.exit(0);
}

console.log(`\n✓ Best source: users/${bestSource} with ${bestCount} investments`);

// Write to shared-family (primary) and shared-family_bk (backup)
const clean = JSON.parse(JSON.stringify(best));
await setDoc(doc(db, 'users', 'shared-family'), clean);
console.log('✓ Written to users/shared-family');

await setDoc(doc(db, 'users', 'shared-family_bk'), {
  ...clean,
  _savedAt: new Date().toISOString(),
  _count: bestCount,
});
console.log('✓ Written to users/shared-family_bk (backup)');

console.log('\n✅ Migration complete. All 3 family members can now access this data.');
process.exit(0);
