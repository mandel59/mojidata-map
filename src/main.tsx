import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LocaleProvider } from './intl/LocaleProvider';
import { i18n, tr } from './intl/i18n';
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
        <h1>{tr('画面を表示できません')}</h1>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>{tr('再読み込み')}</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
document.documentElement.lang = i18n.language;
const root = createRoot(document.getElementById('root')!);
root.render(
  <div className="startup" role="status">
    <span className="brand-mark">字</span>
    <h1>Mojidata Map</h1>
    <p>{tr('Unicode データを読み込み中…')}</p>
  </div>,
);
loadDatabase()
  .then((db) =>
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <LocaleProvider>
            <App db={db} />
          </LocaleProvider>
        </ErrorBoundary>
      </StrictMode>,
    ),
  )
  .catch((error) =>
    root.render(
      <div className="startup" role="alert">
        <h1>{tr('データを読み込めません')}</h1>
        <p>{String(error)}</p>
        <button onClick={() => location.reload()}>{tr('再試行')}</button>
      </div>,
    ),
  );
