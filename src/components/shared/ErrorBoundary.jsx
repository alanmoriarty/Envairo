import React from 'react';
import { RefreshCw, Tv, AlertCircle } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary atrapó un error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center p-8 text-white select-none">
          <div className="flex flex-col items-center max-w-md text-center space-y-6 animate-fade-in">
            <div className="p-4 bg-danger/20 text-danger rounded-full border border-danger/30">
              <AlertCircle size={48} />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Reconectando Pantalla...</h2>
              <p className="text-sm text-text-muted">
                Se detectó una interrupción en el reproductor de video. Reanudando automáticamente.
              </p>
            </div>

            <button
              onClick={this.handleReload}
              className="btn-accent px-6 py-3 font-semibold text-sm flex items-center gap-2 rounded-xl shadow-glow-sm"
            >
              <RefreshCw size={18} className="animate-spin-slow" />
              Reconectar Ahora
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
