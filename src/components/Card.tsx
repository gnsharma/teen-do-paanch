import { Card as CardType } from '@/lib/gameLogic';
import { cn } from '@/lib/utils';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  isPlayed?: boolean;
}

export const Card = ({ card, onClick, disabled, className, isPlayed }: CardProps) => {
  const isRed = card.suit === '♥' || card.suit === '♦';
  
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={cn(
        'relative w-16 h-24 bg-card rounded-lg border-2 border-border',
        'flex flex-col items-center justify-center',
        'transition-all duration-200',
        !disabled && onClick && 'cursor-pointer hover:scale-110 hover:-translate-y-2 hover:shadow-lg',
        disabled && 'opacity-50 cursor-not-allowed',
        isPlayed && 'animate-card-play',
        !isPlayed && 'animate-card-deal',
        className
      )}
    >
      <div className={cn(
        'text-2xl font-bold',
        isRed ? 'text-[hsl(var(--red-suit))]' : 'text-[hsl(var(--black-suit))]'
      )}>
        {card.rank}
      </div>
      <div className={cn(
        'text-3xl',
        isRed ? 'text-[hsl(var(--red-suit))]' : 'text-[hsl(var(--black-suit))]'
      )}>
        {card.suit}
      </div>
    </div>
  );
};
