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
  await deleteDoc(doc(db, 'projects', id));
  await deleteDoc(doc(db, 'scenes', id));
};

export const renameProject = async (id, name) => {
  await updateDoc(doc(db, 'projects', id), { name, updatedAt: Date.now() });
};

export const saveScene = async (projectId, elements, appState, files) => {
  await setDoc(doc(db, 'scenes', projectId), {
    elements: JSON.stringify(elements),
    appState: JSON.stringify(appState),
    files: JSON.stringify(files || {}),
  });
  await updateDoc(doc(db, 'projects', projectId), { updatedAt: Date.now() });
};

export const getScene = async (projectId) => {
  const snap = await getDoc(doc(db, 'scenes', projectId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    elements: JSON.parse(data.elements || '[]'),
    appState: JSON.parse(data.appState || '{}'),
    files: JSON.parse(data.files || '{}'),
  };
};
