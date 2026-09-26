import { type Card, isRed, rankOf, suitOf } from '../game/cards';
import { useI18n } from '../i18n';
import { SUIT_SYMBOL, rankLabel } from './format';

/** A card face, drawn with CSS. Size comes from the --cw custom property. */
export function CardFace({ card }: { card: Card }) {
  const { t } = useI18n();
  const suit = suitOf(card);
  const rank = rankOf(card);
  const label = rankLabel(card, t);
  const symbol = SUIT_SYMBOL[suit];
  return (
    <div className={`card-face ${isRed(suit) ? 'red' : 'black'} ${rank >= 11 ? 'court' : ''}`}>
      <span className="corner tl">
        <b>{label}</b>
        <i>{symbol}</i>
      </span>
      <span className="center">{rank >= 11 ? <span className="court-letter">{label}</span> : symbol}</span>
      {rank >= 11 && <span className="court-suit">{symbol}</span>}
      <span className="corner br">
        <b>{label}</b>
        <i>{symbol}</i>
      </span>
    </div>
  );
}

export function CardBack() {
  return <div className="card-back" />;
}
