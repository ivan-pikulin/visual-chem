import { useState, useCallback } from 'react';
import { useAppStore } from './store/useAppStore';
import {
  ScatterPlot,
  FileUpload,
  SettingsPanel,
  ProgressBar,
  DatasetInfo,
  ErrorMessage,
} from './components';
import './index.css';

function App() {
  const { dataset } = useAppStore();
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

  const toggleLeftSidebar = useCallback(() => {
    setLeftSidebarOpen((prev) => !prev);
  }, []);

  const toggleRightSidebar = useCallback(() => {
    setRightSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <button
            className="icon-button"
            onClick={toggleLeftSidebar}
            title="Toggle data panel"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              {/* Coordinate axes */}
              <path d="M3 3v18h18" strokeLinecap="round" />
              {/* Scatter points */}
              <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" opacity="0.4" />
              <circle cx="18" cy="8" r="1.5" fill="currentColor" stroke="none" opacity="0.4" />
              {/* Benzene ring as main element */}
              <path d="M12 6l3.5 2v4l-3.5 2-3.5-2V8z" strokeLinejoin="round" />
              <path d="M10.5 8.5l3 0M10.5 11.5l3 0" strokeWidth="1" opacity="0.6" />
            </svg>
            <span className="logo-text">VisualChem</span>
          </div>
        </div>
        <div className="header-right">
          {dataset && (
            <span className="dataset-badge">
              {dataset.name}
            </span>
          )}
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
        </div>
      </header>

      {/* Main content area */}
      <main className="app-main">
        {/* Left Sidebar - Data */}
        <aside className={`sidebar sidebar-left ${leftSidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-content">
            <div className="sidebar-header">
              <h2>Data</h2>
              <button className="icon-button-sm" onClick={toggleLeftSidebar}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="sidebar-body">
              {!dataset && <FileUpload />}
              {dataset && <DatasetInfo />}
            </div>
          </div>
        </aside>

        {/* Plot Area - Fullscreen */}
        <div className="plot-container">
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

        {/* Sidebar backdrop for mobile */}
        {(leftSidebarOpen || rightSidebarOpen) && (
          <div
            className="sidebar-backdrop"
            onClick={() => {
              setLeftSidebarOpen(false);
              setRightSidebarOpen(false);
            }}
          />
        )}
      </main>

      {/* Overlays */}
      <ProgressBar />
      <ErrorMessage />
    </div>
  );
}

export default App;
