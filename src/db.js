import Dexie from 'dexie';

export const db = new Dexie('ExcalidrawDB');

db.version(1).stores({
  projects: '++id, name, createdAt, updatedAt',
  scenes: 'projectId, elements, appState, files' // projectId is the primary key for scenes
});

// Helper functions for project management
export const getAllProjects = () => db.projects.toArray();
export const getProjectById = (id) => db.projects.get(id);
export const createProject = (name) => {
  const now = Date.now();
  return db.projects.add({
    name,
    createdAt: now,
    updatedAt: now
  });
};
export const deleteProject = async (id) => {
  await db.transaction('rw', db.projects, db.scenes, async () => {
    await db.projects.delete(id);
    await db.scenes.delete(id);
  });
};

export const saveScene = async (projectId, elements, appState, files) => {
  await db.scenes.put({
    projectId,
    elements: JSON.parse(JSON.stringify(elements)), // Ensure clone
    appState: JSON.parse(JSON.stringify(appState)),
    files: JSON.parse(JSON.stringify(files || {}))
  });
  await db.projects.update(projectId, { updatedAt: Date.now() });
};

export const getScene = (projectId) => db.scenes.get(projectId);
