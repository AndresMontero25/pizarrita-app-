import React, { useState, useEffect, useRef, useCallback, Component } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';


// Polyfills for Excalidraw/Vite
if (typeof window !== 'undefined') {
  window.EXCALIDRAW_ASSET_PATH = "/";
  if (!window.process) window.process = { env: { NODE_ENV: 'development' } };
}

import { db, getAllProjects, createProject, deleteProject, saveScene, getScene } from './db';
import { Plus, Trash2, Folder, Sun, Moon, Layout, Settings } from 'lucide-react';
import './index.css';

class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="loading-overlay">Algo salió mal al cargar la pizarra.</div>;
    return this.props.children;
  }
}

function App() {
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [newProjectName, setNewProjectName] = useState(null); // null = oculto, string = mostrando input
  const [renamingId, setRenamingId] = useState(null);
  const [renamingName, setRenamingName] = useState('');
  const saveTimeoutRef = useRef(null);
  const pendingSceneRef = useRef(null);
  const themeRef = useRef(theme);

  useEffect(() => { themeRef.current = theme; }, [theme]);

  // Flush pending save immediately — stable, safe to call before project switch
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

  const handleProjectSelect = useCallback(async (id) => {
    await flushPendingSave();

    setLoading(true);
    setActiveProjectId(id);
    setInitialData(null); // Prevent stale scene from mounting in new Excalidraw instance
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

    setInitialData(cleanSceneData(scene || {}));
    setLoading(false);
  }, [flushPendingSave]); // stable — reads theme via ref

  // Initialize projects and load last active project
  useEffect(() => {
    const init = async () => {
      const allProjects = await getAllProjects();
      setProjects(allProjects);

      const lastId = localStorage.getItem('lastProjectId');
      if (lastId && allProjects.find(p => p.id === parseInt(lastId))) {
        handleProjectSelect(parseInt(lastId));
      } else if (allProjects.length > 0) {
        handleProjectSelect(allProjects[0].id);
      } else {
        const newId = await createProject('Pizarra Inicial');
        const updated = await getAllProjects();
        setProjects(updated);
        handleProjectSelect(newId);
      }
    };
    init();
  }, [handleProjectSelect]);

  // Update theme on document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const handleConfirmCreate = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setNewProjectName(null);
    const id = await createProject(name);
    const updated = await getAllProjects();
    setProjects(updated);
    handleProjectSelect(id);
  };

  const handleDeleteProject = async (e, id) => {
    e.stopPropagation();
    await deleteProject(id);
    const updated = await getAllProjects();
    setProjects(updated);
    if (activeProjectId === id) {
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
      await db.projects.update(id, { name });
      const updated = await getAllProjects();
      setProjects(updated);
    }
    setRenamingId(null);
  };

  const onExcalidrawChange = (elements, appState, files) => {
    if (!activeProjectId) return;

    // Capture latest scene with its project ID at this moment
    const snapshot = { projectId: activeProjectId, elements, appState, files };
    pendingSceneRef.current = snapshot;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      saveTimeoutRef.current = null;
      // Use the captured snapshot — not closure vars — to avoid stale project ID
      const pending = pendingSceneRef.current;
      if (!pending) return;
      try {
        await saveScene(pending.projectId, pending.elements, pending.appState, pending.files);
        if (pendingSceneRef.current === pending) pendingSceneRef.current = null;
      } catch (err) {
        console.error('[AutoSave] Error saving scene:', err);
      }
    }, 1000);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  if (loading && !initialData) {
    return <div className="loading-overlay">Cargando pizarra...</div>;
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <Layout size={24} />
            <span>Pizarrita App</span>
          </div>
          <button className="icon-btn" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>

        <div className="project-list">
          {projects.map(project => (
            <div
              key={project.id}
              className={`project-item ${activeProjectId === project.id ? 'active' : ''}`}
              onClick={() => renamingId !== project.id && handleProjectSelect(project.id)}
            >
              <div className="project-info">
                <Folder size={18} />
                {renamingId === project.id ? (
                  <input
                    className="rename-input"
                    value={renamingName}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenamingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename(project.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={() => handleConfirmRename(project.id)}
                  />
                ) : (
                  <span onDoubleClick={(e) => handleStartRename(e, project.id, project.name)}>
                    {project.name}
                  </span>
                )}
              </div>
              {renamingId !== project.id && (
                <div className="project-actions">
                  <button
                    className="icon-btn"
                    onClick={(e) => handleStartRename(e, project.id, project.name)}
                    title="Renombrar"
                  >
                    <Settings size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={(e) => handleDeleteProject(e, project.id)}
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
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
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
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
