import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onResetChat?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

const CHAT_STORAGE_KEYS = [
  'psi_model_console_threads_v1',
  'psi_model_console_active_thread_v1',
  'psi_model_console_threads',
  'psi_model_console_active_thread',
];

/**
 * React error boundary that prevents malformed API or storage payloads from causing a blank screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('FLARE Workspace ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleRecover = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  private handleResetChatAndReload = (): void => {
    try {
      CHAT_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
      if (this.props.onResetChat) {
        this.props.onResetChat();
      }
    } catch {
      // Ignore storage errors and reload cleanly
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const title = this.props.fallbackTitle || 'Workspace Recovery Mode';

    return (
      <div className="min-h-[360px] w-full flex items-center justify-center p-6 bg-[#FAFAFA] dark:bg-[#09090B] text-[#18181B] dark:text-[#FAFAFA]">
        <div className="max-w-lg w-full rounded-xl border border-[#E4E4E7] dark:border-[#27272A] bg-white/95 dark:bg-[#121216]/95 backdrop-blur-xl p-6 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                {title}
              </h2>
              <p className="mt-1.5 text-sm text-[#52525B] dark:text-[#A1A1AA] leading-relaxed">
                A view encountered an unexpected response format. Your loaded archive runs are safe, and you can retry rendering or reset cached chat sessions below.
              </p>
              {this.state.errorMessage && (
                <pre className="mt-3 p-3 rounded-lg bg-[#F4F4F5] dark:bg-[#18181B] border border-[#E4E4E7] dark:border-[#27272A] text-xs font-mono text-[#52525B] dark:text-[#A1A1AA] overflow-x-auto whitespace-pre-wrap break-words">
                  {this.state.errorMessage}
                </pre>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={this.handleResetChatAndReload}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#18181B] text-white dark:bg-[#FAFAFA] dark:text-[#09090B] hover:opacity-90 active:scale-[0.99] transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181B] dark:focus-visible:outline-[#FAFAFA]"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset Chat &amp; Reload</span>
                </button>
                <button
                  type="button"
                  onClick={this.handleRecover}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[#E4E4E7] dark:border-[#27272A] text-[#18181B] dark:text-[#FAFAFA] hover:bg-zinc-100 dark:hover:bg-zinc-800/90 active:scale-[0.99] transition-all duration-150 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry View</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
