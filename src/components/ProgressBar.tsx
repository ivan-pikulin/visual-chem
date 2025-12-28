import { useAppStore } from '../store/useAppStore';

export function ProgressBar() {
  const { isLoading, progress, progressMessage } = useAppStore();

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Processing</h3>

        <div className="mb-2">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>{progressMessage}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-primary-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          Please wait while the analysis is running...
        </p>
      </div>
    </div>
  );
}
