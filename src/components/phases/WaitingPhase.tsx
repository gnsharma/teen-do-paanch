import { Button } from '@/components/ui/button';
import { Player } from '@/hooks/useGameState';

interface WaitingPhaseProps {
  players: Player[];
  onStartGame: () => void;
}

/**
 * Shown while waiting for 3 players to join.
 * Displays player count and Start Game button when ready.
 */
export function WaitingPhase({ players, onStartGame }: WaitingPhaseProps) {
  const canStart = players.length === 3;

  return (
    <div className="text-center py-12">
      <p className="text-lg mb-4">
        Waiting for players... ({players.length}/3)
      </p>
      {canStart && (
        <Button onClick={onStartGame} size="lg">
          Start Game
        </Button>
      )}
    </div>
  );
}
