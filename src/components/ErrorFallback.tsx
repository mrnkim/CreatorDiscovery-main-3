import React from 'react';
import { FallbackProps } from 'react-error-boundary';

const ErrorFallback: React.FC<FallbackProps> = ({ error, resetErrorBoundary }) => {
  return (
    <div className="flex flex-col items-center justify-center p-4 border border-red-300 rounded-md bg-red-50 text-red-700">
      <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
      <p className="text-sm mb-4">{error.message}</p>
      <button
        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        onClick={resetErrorBoundary}
      >
        Try again
      </button>
    </div>
  );
};

export default ErrorFallback;
