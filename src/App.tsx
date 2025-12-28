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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg
                className="w-8 h-8 text-primary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                />
              </svg>
              <h1 className="text-2xl font-bold text-gray-900">VisualChem</h1>
            </div>
            <p className="text-sm text-gray-500">
              Molecular Dataset Visualization
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-80 flex-shrink-0 space-y-4">
            {!dataset && <FileUpload />}
            {dataset && <DatasetInfo />}
            <SettingsPanel />
          </div>

          {/* Plot Area */}
          <div className="flex-1 bg-white rounded-lg shadow" style={{ minHeight: '600px' }}>
            <ScatterPlot />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 pb-4 text-center text-sm text-gray-500">
        <p>
          Built with RDKit.js, UMAP, t-SNE, and Plotly
        </p>
      </footer>

      {/* Overlays */}
      <ProgressBar />
      <ErrorMessage />
    </div>
  );
}

export default App;
