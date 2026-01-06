import { useState, useCallback, useRef, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { useAppStore } from './store/useAppStore';
import {
  ScatterPlot,
  AnalysisPanel,
  ProgressBar,
  ErrorMessage,
  DataView,
  PlotToolbar,
  PlotSidebar,
} from './components';
import { isVChemFile, loadProject } from './lib/project';
import {
  initProjectManager,
  destroyProjectManager,
  subscribeToProjectState,
  saveProject as saveProjectManaged,
  openProject,
  openProjectFromPath,
} from './lib/projectManager';
import './index.css';

type MainTab = 'data' | 'analysis' | 'plot';

function App() {
  const { datasets, needsAnalysis, setError, loadProjectState } = useAppStore();
  const [mainTab, setMainTab] = useState<MainTab>('data');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectIsDirty, setProjectIsDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle opening file from deep link / file association
  const handleOpenFromPath = useCallback(async (filePath: string) => {
    try {
      // Extract path from file:// URL if needed
      let path = filePath;
      if (path.startsWith('file://')) {
        path = decodeURIComponent(path.replace('file://', ''));
      }

      if (path.endsWith('.vchem')) {
        const opened = await openProjectFromPath(path);
        if (opened) {
          const state = useAppStore.getState();
          if (state.datasets.some(d => d.molecules.some(m => m.coordinates))) {
            setMainTab('plot');
          }
        }
      }
    } catch (error) {
      setError(`Failed to open project: ${error}`);
    }
  }, [setError]);

  // Initialize project manager
  useEffect(() => {
    initProjectManager();

    const unsubscribe = subscribeToProjectState((state) => {
      setProjectIsDirty(state.isDirty);
    });

    // Listen for deep link events (file associations)
    let deepLinkUnlisten: (() => void) | undefined;
    let eventUnlisten: (() => void) | undefined;

    const setupDeepLink = async () => {
      try {
        // Check for URLs passed at startup
        const { getCurrent } = await import('@tauri-apps/plugin-deep-link');
        const initialUrls = await getCurrent();
        if (initialUrls && initialUrls.length > 0) {
          for (const url of initialUrls) {
            handleOpenFromPath(url);
          }
        }

        // Listen for future deep link events
        deepLinkUnlisten = await onOpenUrl((urls) => {
          for (const url of urls) {
            handleOpenFromPath(url);
          }
        });

        // Listen for startup event from backend (backup)
        eventUnlisten = await listen<string>('deep-link-open', (event) => {
          handleOpenFromPath(event.payload);
        });
      } catch (e) {
        console.warn('Deep link setup failed:', e);
      }
    };

    setupDeepLink();

    return () => {
      unsubscribe();
      deepLinkUnlisten?.();
      eventUnlisten?.();
      destroyProjectManager();
    };
  }, [handleOpenFromPath]);

  // Handle save project (Tauri native dialog)
  const handleSaveProject = useCallback(async () => {
    try {
      await saveProjectManaged();
    } catch (error) {
      setError(`Failed to save project: ${error}`);
    }
  }, [setError]);

  // Handle open project (Tauri native dialog)
  const handleOpenProjectNative = useCallback(async () => {
    try {
      const opened = await openProject();
      if (opened) {
        // Switch to plot tab if we have coordinates
        const state = useAppStore.getState();
        if (state.datasets.some(d => d.molecules.some(m => m.coordinates))) {
          setMainTab('plot');
        }
      }
    } catch (error) {
      setError(`Failed to open project: ${error}`);
    }
  }, [setError]);

  // Fallback: Handle open project via file input (for web or fallback)
  const handleOpenProject = useCallback(() => {
    // Try native dialog first, fallback to file input
    handleOpenProjectNative().catch(() => {
      fileInputRef.current?.click();
    });
  }, [handleOpenProjectNative]);

  // Handle file selection for project open (fallback for web)
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isVChemFile(file)) {
      try {
        const projectData = await loadProject(file);
        loadProjectState(projectData);
        // Switch to plot tab if we have coordinates
        if (projectData.datasets.some(d => d.molecules.some(m => m.coordinates))) {
          setMainTab('plot');
        }
      } catch (error) {
        setError(`Failed to open project: ${error}`);
      }
    }

    // Reset input
    e.target.value = '';
  }, [loadProjectState, setError]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const hasData = datasets.length > 0;

  return (
    <div className="app-container">
      {/* Header with tabs */}
      <header className="app-header">
        <div className="header-left">
          {/* Hidden file input for project open */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".vchem"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            className="header-btn"
            onClick={handleOpenProject}
            title="Open Project (.vchem)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            className={`header-btn ${projectIsDirty ? 'dirty' : ''}`}
            onClick={handleSaveProject}
            disabled={datasets.length === 0}
            title="Save Project (Cmd+S)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            {projectIsDirty && <span className="dirty-indicator" />}
          </button>
        </div>

        {/* Center tabs */}
        <div className="header-tabs">
          <button
            className={`header-tab ${mainTab === 'data' ? 'active' : ''}`}
            onClick={() => setMainTab('data')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Data
          </button>
          <button
            className={`header-tab ${mainTab === 'analysis' ? 'active' : ''} ${!hasData ? 'disabled' : ''} ${needsAnalysis && hasData ? 'attention' : ''}`}
            onClick={() => hasData && setMainTab('analysis')}
            disabled={!hasData}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Analysis
            {needsAnalysis && hasData && <span className="tab-badge" />}
          </button>
          <button
            className={`header-tab ${mainTab === 'plot' ? 'active' : ''} ${!hasData ? 'disabled' : ''}`}
            onClick={() => hasData && setMainTab('plot')}
            disabled={!hasData}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="7.5" cy="7.5" r="2" />
              <circle cx="16.5" cy="16.5" r="2" />
              <circle cx="18" cy="6" r="1.5" />
              <circle cx="6" cy="18" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
            </svg>
            Plot
          </button>
        </div>

        <div className="header-right" />
      </header>

      {/* Main content area */}
      <main className="app-main">
        {mainTab === 'data' ? (
          <DataView onGoToAnalysis={() => setMainTab('analysis')} />
        ) : mainTab === 'analysis' ? (
          <div className="analysis-view">
            <div className="analysis-view-content">
              <AnalysisPanel
                onGoToData={(datasetId) => {
                  if (datasetId) {
                    useAppStore.getState().setActiveDataset(datasetId);
                  }
                  setMainTab('data');
                }}
                onGoToPlot={() => setMainTab('plot')}
              />
            </div>
          </div>
        ) : (
          <div className="plot-view">
            <div className="plot-container">
              <ScatterPlot />
              <PlotToolbar onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
            </div>
            <PlotSidebar className={sidebarOpen ? '' : 'closed'} onClose={toggleSidebar} />
          </div>
        )}
      </main>

      {/* Overlays */}
      <ProgressBar />
      <ErrorMessage />
    </div>
  );
}

export default App;
