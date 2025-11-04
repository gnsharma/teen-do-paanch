import { Card as CardType } from '@/lib/gameLogic';
import { Card } from './Card';
import { cn } from '@/lib/utils';

interface GameBoardProps {
  currentTrick: Array<{ position: number; card: CardType }>;
  players: Array<{ name: string; position: number; tricksWon: number; targetTricks: number }>;
  currentPlayerIndex: number;
  trump: string | null;
  myPosition: number;
}

export const GameBoard = ({ currentTrick, players, currentPlayerIndex, trump, myPosition }: GameBoardProps) => {
  return (
    <div className="flex flex-col items-center gap-8 py-8">
      {/* Trump indicator */}
      {trump && (
        <div className="bg-secondary px-6 py-3 rounded-lg border-2 border-primary">
          <div className="text-sm font-medium text-muted-foreground mb-1">Trump Suit</div>
          <div className="text-4xl">{trump}</div>
        </div>
      )}

      {/* Current trick area */}
      <div className="relative w-64 h-64 bg-secondary/30 rounded-full border-2 border-primary/50 flex items-center justify-center">
        <div className="text-center">
          {currentTrick.length === 0 ? (
            <div className="text-muted-foreground">Waiting for cards...</div>
          ) : (
            <div className="flex gap-4 flex-wrap justify-center">
              {currentTrick.map((play, index) => (
                <div key={index} className="flex flex-col items-center gap-2">
                  <Card card={play.card} isPlayed />
                  <div className="text-xs text-muted-foreground">
                    {players.find(p => p.position === play.position)?.name || 'Player'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Players info */}
      <div className="flex gap-8 justify-center flex-wrap">
        {players.map((player) => {
          const isCurrentPlayer = player.position === currentPlayerIndex;
          const isMe = player.position === myPosition;
          
          return (
            <div
              key={player.position}
              className={cn(
                'bg-secondary px-6 py-4 rounded-lg border-2 transition-all',
                isCurrentPlayer && 'border-primary animate-glow-pulse',
                !isCurrentPlayer && 'border-border',
                isMe && 'bg-accent/20'
              )}
            >
              <div className="font-bold text-lg text-secondary-foreground">
                {player.name}
                {isMe && ' (You)'}
              </div>
              <div className="text-sm text-secondary-foreground/80 mt-1">
                Target: {player.targetTricks} | Won: {player.tricksWon}
              </div>
              {isCurrentPlayer && (
                <div className="text-xs text-primary font-semibold mt-2">
                  Current Turn
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
