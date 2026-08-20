import { GAMES } from './games';
import { t, tFmt } from './i18n';

export default function HallScreen({
  onEnter,
  onBack,
}: {
  onEnter: (gameId: string) => void;
  onBack: () => void;
}) {
  const available = GAMES.filter((g) => g.available);
  const modeLabel = (mode: string) => {
    if (mode === 'turn-based') return t('hall.mode.turnBased');
    if (mode === 'async') return t('hall.mode.async');
    return t('hall.mode.realtime');
  };
  return (
    <div className="page hall-page">
      <div className="hall-wrap">
        <header className="hall-header">
          <h1>{t('hall.title')}</h1>
          <p className="tagline">{t('hall.tagline')}</p>
          <div className="hall-actions">
            <button className="ghost-btn" onClick={onBack}>
              {t('hall.back')}
            </button>
          </div>
        </header>
        <div className="hall-grid">
          {available.map((g) => (
            <button key={g.id} className="hall-card playable" onClick={() => onEnter(g.id)}>
              <span className="hall-emoji">{g.emoji}</span>
              <span className="hall-name">{g.name}</span>
              <span className="hall-meta">
                {modeLabel(g.mode)}｜{tFmt('hall.playerCount', { min: g.minPlayers, max: g.maxPlayers })}
              </span>
              <span className="hall-desc">{g.description}</span>
              <span className="hall-cta">{t('hall.cta')}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
