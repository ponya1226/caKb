import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: unknown, _errorInfo: ErrorInfo) {
    // UIが白画面で止まることを防ぐため、画面上の復旧導線だけを出す。
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="app-shell center-shell">
        <div className="loading-panel error-panel">
          <AlertTriangle size={32} aria-hidden="true" />
          <span>画面の読み込みに失敗しました</span>
          <p className="subtle-text">アプリを更新すると復旧する場合があります。</p>
          <button className="button button-primary" type="button" onClick={() => window.location.reload()}>
            <RefreshCw size={18} aria-hidden="true" />
            再読み込み
          </button>
        </div>
      </main>
    );
  }
}
