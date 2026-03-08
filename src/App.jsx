import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';

// Polyfills for Excalidraw/Vite
if (typeof window !== 'undefined') {
  window.EXCALIDRAW_ASSET_PATH = "/";
  if (!window.process) window.process = { env: { NODE_ENV: 'development' } };
}

import {
  getAllProjects, createProject, deleteProject, renameProject,
  saveScene, getScene, getAllUsers, shareProject, unshareProject
} from './db';
import { auth } from './firebase';
import { onAuthStateChanged, signOut, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import AuthPage from './AuthPage';
import { Plus, Trash2, Folder, Sun, Moon, Layout, Settings, Save, Check, Loader, LogOut, Share2, Eye } from 'lucide-react';
import './index.css';

class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="loading-overlay">Algo salió mal al cargar la pizarra.</div>;
    return this.props.children;
  }
}

// Delete modal — uses the user's own login password via Firebase re-auth
function DeleteModal({ projectName, onConfirm, onCancel, error }) {
  const [password, setPassword] = useState('');
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Eliminar pizarra</h3>
        <p>Ingresa tu contraseña para eliminar <strong>{projectName}</strong>:</p>
        <input
          className="rename-input"
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onConfirm(password);
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Tu contraseña de acceso"
        />
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-danger" onClick={() => onConfirm(password)}>Eliminar</button>
          <button className="btn" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// Share modal — shows all registered users and lets owner toggle access
function ShareModal({ project, currentUser, onClose, onUpdate }) {
  const [allUsers, setAllUsers] = useState([]);
  const [sharedWith, setSharedWith] = useState(project.sharedWith || []);
  const [busy, setBusy] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    getAllUsers().then(users => {
      setAllUsers(users.filter(u => u.uid !== currentUser.uid));
      setLoadingUsers(false);
    });
  }, [currentUser.uid]);

  const handleToggle = async (targetUid) => {
    setBusy(true);
    if (sharedWith.includes(targetUid)) {
      await unshareProject(project.id, targetUid);
      setSharedWith(prev => prev.filter(uid => uid !== targetUid));
    } else {
      await shareProject(project.id, targetUid);
      setSharedWith(prev => [...prev, targetUid]);
    }
    setBusy(false);
    onUpdate(project.id, sharedWith.includes(targetUid)
      ? sharedWith.filter(uid => uid !== targetUid)
      : [...sharedWith, targetUid]);
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal--share">
        <h3>Compartir "{project.name}"</h3>
        <p>Los usuarios con acceso pueden ver la pizarra, pero no editarla ni eliminarla.</p>

        {loadingUsers ? (
          <p className="share-loading">Cargando usuarios...</p>
        ) : allUsers.length === 0 ? (
          <p className="share-empty">No hay otros usuarios registrados aún.</p>
        ) : (
          <div className="share-user-list">
            {allUsers.map(u => {
              const hasAccess = sharedWith.includes(u.uid);
              return (
                <div key={u.uid} className="share-user-item">
                  <span className="share-user-email">{u.email}</span>
                  <button
                    className={`btn ${hasAccess ? 'btn-danger' : 'btn-primary'} share-toggle-btn`}
                    onClick={() => handleToggle(u.uid)}
                    disabled={busy}
                  >
                    {hasAccess ? 'Quitar acceso' : 'Dar acceso'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = not logged in
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [newProjectName, setNewProjectName] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renamingName, setRenamingName] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'unsaved' | 'saving'
  const [deleteModal, setDeleteModal] = useState({ open: false, projectId: null, projectName: '' });
  const [deleteError, setDeleteError] = useState('');
  const [shareModal, setShareModal] = useState({ open: false, project: null });

  const saveTimeoutRef = useRef(null);
  const pendingSceneRef = useRef(null);
  const themeRef = useRef(theme);
  const lastElementsRef = useRef(null);
  const lastFilesRef = useRef(null);

  // Track auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      if (!u) {
        // Reset all state on logout
        setProjects([]);
        setActiveProjectId(null);
        setInitialData(null);
        setLoading(true);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => { themeRef.current = theme; }, [theme]);

  const activeProject = projects.find(p => p.id === activeProjectId) ?? null;
  const isActiveProjectOwned = activeProject?.isOwned ?? true;

  const flushPendingSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (pendingSceneRef.current) {
      const { projectId, elements, appState, files } = pendingSceneRef.current;
      pendingSceneRef.current = null;
      await saveScene(projectId, elements, appState, files);
    }
  }, []);

  const handleManualSave = useCallback(async () => {
    setSaveStatus('saving');
    await flushPendingSave();
    setSaveStatus('saved');
  }, [flushPendingSave]);

  const handleProjectSelect = useCallback(async (id) => {
    if (pendingSceneRef.current || saveTimeoutRef.current) {
      const ok = window.confirm('Tienes cambios sin guardar. ¿Guardar antes de cambiar de pizarra?');
      if (ok) {
        setSaveStatus('saving');
        await flushPendingSave();
        setSaveStatus('saved');
      } else {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        pendingSceneRef.current = null;
      }
    }

    setLoading(true);
    setActiveProjectId(id);
    setInitialData(null);
    setSaveStatus('saved');
    localStorage.setItem('lastProjectId', id.toString());

    const scene = await getScene(id);
    const currentTheme = themeRef.current;
    const defaultAppState = {
      theme: currentTheme,
      collaborators: new Map(),
      currentChartType: 'bar',
      activeTool: { type: 'selection' },
    };

    const cleanSceneData = (data) => {
      const appState = data?.appState || {};
      return {
        elements: data?.elements || [],
        appState: {
          ...defaultAppState,
          ...appState,
          theme: currentTheme,
          collaborators: new Map(),
        },
        files: data?.files || {}
      };
    };

    const cleaned = cleanSceneData(scene || {});
    lastElementsRef.current = cleaned.elements;
    lastFilesRef.current = cleaned.files;
    setInitialData(cleaned);
    setLoading(false);
  }, [flushPendingSave]);

  // Load projects once user is authenticated
  useEffect(() => {
    if (!user) return;
    const init = async () => {
      const allProjects = await getAllProjects(user.uid);
      setProjects(allProjects);

      const lastId = localStorage.getItem('lastProjectId');
      if (lastId && allProjects.find(p => p.id === lastId)) {
        handleProjectSelect(lastId);
      } else if (allProjects.length > 0) {
        handleProjectSelect(allProjects[0].id);
      } else {
        const newId = await createProject('Pizarra Inicial', user.uid);
        const updated = await getAllProjects(user.uid);
        setProjects(updated);
        handleProjectSelect(newId);
      }
    };
    init();
  }, [user, handleProjectSelect]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const handleConfirmCreate = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setNewProjectName(null);
    const id = await createProject(name, user.uid);
    const updated = await getAllProjects(user.uid);
    setProjects(updated);
    handleProjectSelect(id);
  };

  const handleDeleteClick = (e, id, name) => {
    e.stopPropagation();
    setDeleteError('');
    setDeleteModal({ open: true, projectId: id, projectName: name });
  };

  const handleDeleteConfirm = async (password) => {
    // Re-authenticate with Firebase using the user's own password
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
    } catch {
      setDeleteError('Contraseña incorrecta. Inténtalo de nuevo.');
      return;
    }

    const { projectId } = deleteModal;
    setDeleteModal({ open: false, projectId: null, projectName: '' });
    await deleteProject(projectId);
    const updated = await getAllProjects(user.uid);
    setProjects(updated);
    if (activeProjectId === projectId) {
      if (updated.length > 0) {
        handleProjectSelect(updated[0].id);
      } else {
        setActiveProjectId(null);
        setInitialData(null);
      }
    }
  };

  const handleStartRename = (e, id, currentName) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenamingName(currentName);
  };

  const handleConfirmRename = async (id) => {
    const name = renamingName.trim();
    if (name) {
      await renameProject(id, name);
      const updated = await getAllProjects(user.uid);
      setProjects(updated);
    }
    setRenamingId(null);
  };

  const handleShareUpdate = (projectId, newSharedWith) => {
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, sharedWith: newSharedWith } : p
    ));
  };

  const onExcalidrawChange = (elements, appState, files) => {
    if (!activeProjectId || !isActiveProjectOwned) return;

    if (elements === lastElementsRef.current && files === lastFilesRef.current) return;
    lastElementsRef.current = elements;
    lastFilesRef.current = files;

    const snapshot = { projectId: activeProjectId, elements, appState, files };
    pendingSceneRef.current = snapshot;
    setSaveStatus('unsaved');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      saveTimeoutRef.current = null;
      const pending = pendingSceneRef.current;
      if (!pending) return;
      setSaveStatus('saving');
      try {
        await saveScene(pending.projectId, pending.elements, pending.appState, pending.files);
        if (pendingSceneRef.current === pending) {
          pendingSceneRef.current = null;
          setSaveStatus('saved');
        }
      } catch (err) {
        console.error('[AutoSave] Error saving scene:', err);
        setSaveStatus('unsaved');
      }
    }, 1500);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Auth states
  if (user === undefined) {
    return <div className="loading-overlay">Cargando...</div>;
  }
  if (user === null) {
    return <AuthPage />;
  }
  if (loading && !initialData) {
    return <div className="loading-overlay">Cargando pizarra...</div>;
  }

  return (
    <div className="app-container">
      {deleteModal.open && (
        <DeleteModal
          projectName={deleteModal.projectName}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteModal({ open: false, projectId: null, projectName: '' })}
          error={deleteError}
        />
      )}

      {shareModal.open && shareModal.project && (
        <ShareModal
          project={shareModal.project}
          currentUser={user}
          onClose={() => setShareModal({ open: false, project: null })}
          onUpdate={handleShareUpdate}
        />
      )}

      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <Layout size={24} />
            <span>Pizarrita App</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="icon-btn" onClick={toggleTheme} title="Cambiar tema">
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <button className="icon-btn" onClick={() => signOut(auth)} title="Cerrar sesión">
              <LogOut size={20} />
            </button>
          </div>
        </div>

        <div className="project-list">
          {projects.map(project => (
            <div
              key={project.id}
              className={`project-item ${activeProjectId === project.id ? 'active' : ''}`}
              onClick={() => renamingId !== project.id && handleProjectSelect(project.id)}
            >
              <div className="project-info">
                {project.isOwned ? <Folder size={18} /> : <Eye size={18} />}
                {renamingId === project.id ? (
                  <input
                    className="rename-input"
                    value={renamingName}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                    onChange={e => setRenamingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleConfirmRename(project.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={() => handleConfirmRename(project.id)}
                  />
                ) : (
                  <span
                    onDoubleClick={e => project.isOwned && handleStartRename(e, project.id, project.name)}
                    title={project.isOwned ? 'Doble clic para renombrar' : 'Pizarra compartida contigo'}
                  >
                    {project.name}
                  </span>
                )}
              </div>

              {renamingId !== project.id && (
                <div className="project-actions">
                  {/* Save button — only for owned projects */}
                  {project.isOwned && activeProjectId === project.id && (
                    <button
                      className={`icon-btn save-btn save-btn--${saveStatus}`}
                      onClick={e => { e.stopPropagation(); handleManualSave(); }}
                      title={saveStatus === 'saved' ? 'Guardado' : saveStatus === 'saving' ? 'Guardando...' : 'Guardar cambios'}
                      disabled={saveStatus === 'saving'}
                    >
                      {saveStatus === 'saved' && <Check size={14} />}
                      {saveStatus === 'unsaved' && <Save size={14} />}
                      {saveStatus === 'saving' && <Loader size={14} className="spin" />}
                    </button>
                  )}

                  {/* Actions only for owned projects */}
                  {project.isOwned && (
                    <>
                      <button
                        className="icon-btn"
                        onClick={e => { e.stopPropagation(); setShareModal({ open: true, project }); }}
                        title="Compartir"
                      >
                        <Share2 size={14} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={e => handleStartRename(e, project.id, project.name)}
                        title="Renombrar"
                      >
                        <Settings size={14} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={e => handleDeleteClick(e, project.id, project.name)}
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          {newProjectName !== null ? (
            <div className="new-project-form">
              <input
                className="rename-input"
                autoFocus
                placeholder="Nombre de la pizarra"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirmCreate();
                  if (e.key === 'Escape') setNewProjectName(null);
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleConfirmCreate}>
                  Crear
                </button>
                <button className="btn" style={{ flex: 1 }} onClick={() => setNewProjectName(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => setNewProjectName('Nueva Pizarra')}>
              <Plus size={18} />
              Nueva Pizarra
            </button>
          )}
        </div>
      </div>

      <div className="main-content">
        {activeProjectId && initialData ? (
          <div className="excalidraw-wrapper">
            <ErrorBoundary key={activeProjectId}>
              <Excalidraw
                key={activeProjectId}
                initialData={initialData}
                onChange={onExcalidrawChange}
                theme={theme}
                viewModeEnabled={!isActiveProjectOwned}
              />
            </ErrorBoundary>
          </div>
        ) : (
          <div className="loading-overlay">Selecciona un proyecto para comenzar</div>
        )}
      </div>
    </div>
  );
}

export default App;
