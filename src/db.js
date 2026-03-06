import { db } from './firebase';
import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, setDoc, query, orderBy
} from 'firebase/firestore';

const projectsCol = collection(db, 'projects');

export const getAllProjects = async () => {
  const q = query(projectsCol, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const createProject = async (name) => {
  const now = Date.now();
  const docRef = await addDoc(projectsCol, { name, createdAt: now, updatedAt: now });
  return docRef.id;
};

export const deleteProject = async (id) => {
  // Delete files subcollection first
  const filesSnap = await getDocs(collection(db, 'scenes', id, 'files'));
  await Promise.all(filesSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'scenes', id));
  await deleteDoc(doc(db, 'projects', id));
};

export const renameProject = async (id, name) => {
  await updateDoc(doc(db, 'projects', id), { name, updatedAt: Date.now() });
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

  // Remove orphaned files
  const existingSnap = await getDocs(filesCol);
  const deleteOld = existingSnap.docs
    .filter(d => !currentIds.has(d.id))
    .map(d => deleteDoc(d.ref));

  // Upsert current files
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

export const getDeletePassword = async () => {
  const snap = await getDoc(doc(db, 'config', 'settings'));
  if (!snap.exists()) return 'borrado123';
  return snap.data().deletePassword || 'borrado123';
};
