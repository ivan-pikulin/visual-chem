import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import {
  ScatterPlot,
  SettingsPanel,
  AnalysisPanel,
  ProgressBar,
  ErrorMessage,
  DataView,
  DatasetSelector,
} from './components';
import './index.css';

type MainTab = 'data' | 'analysis' | 'plot';

function App() {
  const { datasets, dataset, needsAnalysis } = useAppStore();
  const [mainTab, setMainTab] = useState<MainTab>('data');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

  // Auto-switch to analysis tab when analysis is needed
  useEffect(() => {
    if (needsAnalysis) {
      setMainTab('analysis');
    }
  }, [needsAnalysis]);

  // Switch to plot when first dataset is loaded with coordinates
  useEffect(() => {
    if (dataset?.molecules.some(m => m.coordinates)) {
      setMainTab('plot');
    }
  }, [dataset?.molecules]);

  const toggleLeftSidebar = useCallback(() => {
    setLeftSidebarOpen((prev) => !prev);
  }, []);

  const toggleRightSidebar = useCallback(() => {
    setRightSidebarOpen((prev) => !prev);
  }, []);

  const hasData = datasets.length > 0;

  return (
    <div className="app-container">
      {/* Header with tabs */}
      <header className="app-header">
        <div className="header-left">
          {mainTab === 'plot' && (
            <button
              className={`icon-button ${leftSidebarOpen ? 'active' : ''}`}
              onClick={toggleLeftSidebar}
              title="Toggle datasets"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
          )}
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

        <div className="header-right">
          {mainTab === 'plot' && (
            <button
              className={`icon-button ${rightSidebarOpen ? 'active' : ''}`}
              onClick={toggleRightSidebar}
              title="Toggle settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Main content area */}
      <main className="app-main">
        {mainTab === 'data' ? (
          <DataView onGoToPlot={() => setMainTab('plot')} />
        ) : mainTab === 'analysis' ? (
          <div className="analysis-view">
            <div className="analysis-view-content">
              <AnalysisPanel />
            </div>
          </div>
        ) : (
          <>
            {/* Left Sidebar - Dataset Selector */}
            <aside className={`sidebar sidebar-left ${leftSidebarOpen ? 'open' : ''}`}>
              <div className="sidebar-content">
                <div className="sidebar-header">
                  <h2>Datasets</h2>
                  <button className="icon-button-sm" onClick={toggleLeftSidebar}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="sidebar-body">
                  <DatasetSelector />
                </div>
              </div>
            </aside>

            {/* Plot Area */}
            <div className={`plot-container ${leftSidebarOpen ? 'with-left-sidebar' : ''} ${rightSidebarOpen ? 'with-right-sidebar' : ''}`}>
              <ScatterPlot />
            </div>

            {/* Right Sidebar - Settings */}
            <aside className={`sidebar sidebar-right ${rightSidebarOpen ? 'open' : ''}`}>
              <div className="sidebar-content">
                <div className="sidebar-header">
                  <h2>Settings</h2>
                  <button className="icon-button-sm" onClick={toggleRightSidebar}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="sidebar-body">
                  <SettingsPanel />
                </div>
              </div>
            </aside>
          </>
        )}
      </main>

      {/* Overlays */}
      <ProgressBar />
      <ErrorMessage />
    </div>
  );
}

export default App;
