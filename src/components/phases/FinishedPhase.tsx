import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Player } from '@/hooks/useGameState';

interface FinishedPhaseProps {
  players: Player[];
}

/**
 * Game over screen showing final standings.
 * Players are sorted by score (highest first) with winner highlighted.
 */
export function FinishedPhase({ players }: FinishedPhaseProps) {
  const navigate = useNavigate();

  // Sort players by score (highest first)
  const sortedPlayers = [...players].sort(
    (a, b) => (b.overachievement_score || 0) - (a.overachievement_score || 0)
  );

  return (
    <div className="text-center py-12">
      <h2 className="text-3xl font-bold mb-4">Game Over!</h2>

      <div className="space-y-2">
        {sortedPlayers.map((player, index) => (
          <div key={player.position} className="text-lg">
            {index === 0 ? '🏆 ' : `${index + 1}. `}
            {player.name}: {player.overachievement_score || 0} points
          </div>
        ))}
      </div>

      <Button onClick={() => navigate('/')} className="mt-8">
        Back to Lobby
      </Button>
    </div>
  );
}
