import { useState, useCallback } from 'react';

interface ToastState {
  message: string;
  secondsRemaining?: number;
}

// Parses server/network errors into user-friendly messages
function parseError(error: any): { message: string; secondsRemaining?: number } {
  const msg = error?.message || error?.error || String(error || '');
  const status = error?.status || error?.code;

  // Rate limit
  if (status === 429 || msg.includes('limit') || msg.includes('Too many')) {
    return {
      message: "You've reached the AI generation limit. Please wait a moment before trying again.",
      secondsRemaining: 60,
    };
  }

  // Network offline
  if (!navigator.onLine || msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
    return { message: "You're offline. Your action has been saved and will sync when you reconnect." };
  }

  // Timeout
  if (msg.includes('timeout') || msg.includes('504')) {
    return { message: "The AI is taking longer than usual. Please try again in a moment." };
  }

  // Auth errors
  if (status === 401 || status === 403 || msg.includes('auth') || msg.includes('JWT')) {
    return { message: "Your session expired. Please sign in again." };
  }

  // Supabase/DB errors
  if (msg.includes('supabase') || msg.includes('database') || status === 500) {
    return { message: "Something went wrong on our end. Please try again shortly." };
  }

  // AI content errors
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('SAFETY')) {
    return { message: "This word couldn't be processed. Please try a different word." };
  }

  // Generic
  return { message: "Something didn't work as expected. Please try again." };
}

export function useErrorToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showError = useCallback((error: any) => {
    const parsed = parseError(error);
    setToast(parsed);
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return { toast, showError, dismiss };
}
