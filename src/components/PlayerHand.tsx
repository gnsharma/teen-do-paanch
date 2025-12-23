import { Card as CardType } from '@/lib/gameLogic';
import { Card } from './Card';
import { cn } from '@/lib/utils';

interface PlayerHandProps {
  cards: CardType[];
  onCardClick?: (card: CardType) => void;
  canPlay?: boolean;
  className?: string;
  highlightCards?: CardType[];
}

export const PlayerHand = ({ cards, onCardClick, canPlay, className, highlightCards }: PlayerHandProps) => {
  const isHighlighted = (card: CardType) =>
    highlightCards?.some(hc => hc.suit === card.suit && hc.rank === card.rank) ?? false;

  return (
    <div className={cn('flex flex-wrap gap-2 justify-center', className)}>
      {cards.map((card, index) => (
        <Card
          key={`${card.rank}-${card.suit}-${index}`}
          card={card}
          onClick={() => onCardClick?.(card)}
          disabled={!canPlay}
          highlighted={isHighlighted(card)}
        />
      ))}
    </div>
  );
};
