import { useEffect, useState } from 'react';

interface ErrorToastProps {
  message: string;
  secondsRemaining?: number;
  onDismiss: () => void;
}

export function ErrorToast({ message, secondsRemaining, onDismiss }: ErrorToastProps) {
  const [seconds, setSeconds] = useState(secondsRemaining || 0);

  useEffect(() => {
    if (!secondsRemaining) return;
    setSeconds(secondsRemaining);
    const interval = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) { clearInterval(interval); onDismiss(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining]);

  useEffect(() => {
    if (secondsRemaining) return; // auto-dismiss handled above
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [secondsRemaining]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-gray-900 border border-gray-700 text-white rounded-2xl shadow-2xl px-5 py-4 max-w-sm w-[90vw] flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <span className="text-2xl">
            {message.includes('limit') ? '⏳' :
             message.includes('offline') || message.includes('network') ? '📡' :
             message.includes('timeout') ? '🐢' : '⚠️'}
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium leading-snug">{message}</p>
            {seconds > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Try again in <span className="text-orange-400 font-bold">{seconds}s</span>
              </p>
            )}
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-500 hover:text-white text-lg leading-none mt-0.5"
          >×</button>
        </div>
        {seconds > 0 && (
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-400 rounded-full transition-all duration-1000"
              style={{ width: `${(seconds / (secondsRemaining || 1)) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
