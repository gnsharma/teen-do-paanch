import { Button } from '@/components/ui/button';
import { Player } from '@/hooks/useGameState';

interface RedistributionPhaseProps {
  players: Player[];
  roundNumber: number;
  dealerIndex: number;
  onStartNewRound: () => void;
}

/**
 * Shown between rounds to display results and allow starting the next round.
 * Shows each player's performance (won/target) and their score change.
 */
export function RedistributionPhase({
  players,
  roundNumber,
  dealerIndex,
  onStartNewRound
}: RedistributionPhaseProps) {
  const nextDealer = players.find(p => p.position === dealerIndex);

  return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-bold mb-4">Round {roundNumber - 1} Complete!</h2>

      {/* Player results */}
      <div className="space-y-2 mb-8">
        {players.map(p => {
          const diff = p.tricks_won - p.target_tricks;
          return (
            <div key={p.position} className="text-lg">
              {p.name}: {p.tricks_won}/{p.target_tricks} tricks
              <span
                className={
                  diff > 0
                    ? 'text-green-500 ml-2'
                    : diff < 0
                    ? 'text-red-500 ml-2'
                    : 'ml-2'
                }
              >
                ({diff > 0 ? '+' : ''}{diff})
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Next round: {nextDealer?.name} will be dealer (2 tricks)
      </p>

      <Button onClick={onStartNewRound} size="lg">
        Start Round {roundNumber}
      </Button>
    </div>
  );
}
