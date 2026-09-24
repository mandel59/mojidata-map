import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadDatabase } from './data';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="startup" role="alert">
        <h1>画面を表示できません</h1>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>再読み込み</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const root = createRoot(document.getElementById('root')!);
root.render(
  <div className="startup" role="status">
    <span className="brand-mark">字</span>
    <h1>Mojidata Map</h1>
    <p>Unicode データを読み込み中…</p>
  </div>,
);
loadDatabase()
  .then((db) =>
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App db={db} />
        </ErrorBoundary>
      </StrictMode>,
    ),
  )
  .catch((error) =>
    root.render(
      <div className="startup" role="alert">
        <h1>データを読み込めません</h1>
        <p>{String(error)}</p>
        <button onClick={() => location.reload()}>再試行</button>
      </div>,
    ),
  );
