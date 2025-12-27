import { GameBoard } from '@/components/GameBoard';
import { PlayerHand } from '@/components/PlayerHand';
import { Card } from '@/lib/gameLogic';
import { Player } from '@/hooks/useGameState';

interface PlayingPhaseProps {
  currentTrick: Array<{ position: number; card: Card }>;
  players: Player[];
  currentPlayerIndex: number;
  trumpSuit: string | null;
  myPosition: number;
  hand: Card[];
  myPlayerData: Player | undefined;
  onPlayCard: (card: Card) => void;
}

/**
 * Main gameplay phase where players take turns playing cards.
 * Displays the game board with current trick and player's hand.
 */
export function PlayingPhase({
  currentTrick,
  players,
  currentPlayerIndex,
  trumpSuit,
  myPosition,
  hand,
  myPlayerData,
  onPlayCard
}: PlayingPhaseProps) {
  const isMyTurn = myPosition === currentPlayerIndex;
  const canPlay = isMyTurn && currentTrick.length < 3;

  return (
    <>
      <GameBoard
        currentTrick={currentTrick}
        players={players}
        currentPlayerIndex={currentPlayerIndex}
        trump={trumpSuit}
        myPosition={myPosition}
      />

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4 text-center">
          Your Hand{' '}
          {myPlayerData && `(${myPlayerData.tricks_won}/${myPlayerData.target_tricks} tricks)`}
        </h2>
        <PlayerHand
          cards={hand}
          onCardClick={onPlayCard}
          canPlay={canPlay}
        />
      </div>
    </>
  );
}
