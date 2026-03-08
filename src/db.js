import { db } from './firebase';
import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, setDoc, query, orderBy,
  where, arrayUnion, arrayRemove
} from 'firebase/firestore';

// Register/update user in the users collection so others can find them
export const registerUser = async (uid, email) => {
  await setDoc(doc(db, 'users', uid), { email }, { merge: true });
};

// Returns all registered users
export const getAllUsers = async () => {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, email: d.data().email }));
};

// Returns owned projects + projects shared with the user, sorted by createdAt
export const getAllProjects = async (userId) => {
  const ownedQ = query(
    collection(db, 'projects'),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'asc')
  );
  const sharedQ = query(
    collection(db, 'projects'),
    where('sharedWith', 'array-contains', userId),
    orderBy('createdAt', 'asc')
  );

  const [ownedSnap, sharedSnap] = await Promise.all([getDocs(ownedQ), getDocs(sharedQ)]);
  const owned = ownedSnap.docs.map(d => ({ id: d.id, ...d.data(), isOwned: true }));
  const shared = sharedSnap.docs.map(d => ({ id: d.id, ...d.data(), isOwned: false }));

  // Merge and sort, avoid duplicates
  const seen = new Set(owned.map(p => p.id));
  const merged = [...owned, ...shared.filter(p => !seen.has(p.id))];
  return merged.sort((a, b) => a.createdAt - b.createdAt);
};

export const createProject = async (name, userId) => {
  const now = Date.now();
  const docRef = await addDoc(collection(db, 'projects'), {
    name,
    ownerId: userId,
    sharedWith: [],
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
};

export const deleteProject = async (id) => {
  const filesSnap = await getDocs(collection(db, 'scenes', id, 'files'));
  await Promise.all(filesSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'scenes', id));
  await deleteDoc(doc(db, 'projects', id));
};

export const renameProject = async (id, name) => {
  await updateDoc(doc(db, 'projects', id), { name, updatedAt: Date.now() });
};

export const shareProject = async (projectId, targetUid) => {
  await updateDoc(doc(db, 'projects', projectId), { sharedWith: arrayUnion(targetUid) });
};

export const unshareProject = async (projectId, targetUid) => {
  await updateDoc(doc(db, 'projects', projectId), { sharedWith: arrayRemove(targetUid) });
};

// Files are stored in a subcollection to avoid Firestore's 1MB document limit
export const saveScene = async (projectId, elements, appState, files) => {
  await setDoc(doc(db, 'scenes', projectId), {
    elements: JSON.stringify(elements),
    appState: JSON.stringify(appState),
    updatedAt: Date.now(),
  });

  const filesCol = collection(db, 'scenes', projectId, 'files');
  const fileEntries = Object.entries(files || {});
  const currentIds = new Set(fileEntries.map(([id]) => id));

  const existingSnap = await getDocs(filesCol);
  const deleteOld = existingSnap.docs
    .filter(d => !currentIds.has(d.id))
    .map(d => deleteDoc(d.ref));

  const upsertNew = fileEntries.map(([fileId, fileData]) =>
    setDoc(doc(db, 'scenes', projectId, 'files', fileId), {
      dataURL: fileData.dataURL || '',
      mimeType: fileData.mimeType || '',
      created: fileData.created || Date.now(),
    })
  );

  await Promise.all([...deleteOld, ...upsertNew]);
  await updateDoc(doc(db, 'projects', projectId), { updatedAt: Date.now() });
};

export const getScene = async (projectId) => {
  const sceneSnap = await getDoc(doc(db, 'scenes', projectId));
  if (!sceneSnap.exists()) return null;

  const data = sceneSnap.data();
  const filesSnap = await getDocs(collection(db, 'scenes', projectId, 'files'));
  const files = {};
  filesSnap.docs.forEach(d => { files[d.id] = { id: d.id, ...d.data() }; });

  return {
    elements: JSON.parse(data.elements || '[]'),
    appState: JSON.parse(data.appState || '{}'),
    files,
  };
};
