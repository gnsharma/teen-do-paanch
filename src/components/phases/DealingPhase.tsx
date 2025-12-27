import { Button } from '@/components/ui/button';
import { PlayerHand } from '@/components/PlayerHand';
import { Card } from '@/lib/gameLogic';

interface DealingPhaseProps {
  hand: Card[];
  trumpSuit: string | null;
  isDealer: boolean;
  isDealing: boolean;
  onDealFinalCards: () => void;
}

/**
 * Phase where dealer deals the final 2 cards to each player.
 * Shows the selected trump suit prominently.
 */
export function DealingPhase({
  hand,
  trumpSuit,
  isDealer,
  isDealing,
  onDealFinalCards
}: DealingPhaseProps) {
  return (
    <div className="text-center py-12 space-y-4">
      {/* Trump indicator */}
      <div className="bg-secondary px-6 py-3 rounded-lg border-2 border-primary inline-block mb-4">
        <div className="text-sm font-medium text-muted-foreground mb-1">Trump Suit</div>
        <div className="text-4xl">{trumpSuit}</div>
      </div>

      <p className="text-lg">You now have {hand.length} cards.</p>

      <div className="mb-4">
        <PlayerHand cards={hand} canPlay={false} />
      </div>

      {hand.length < 10 ? (
        isDealer ? (
          <Button onClick={onDealFinalCards} size="lg" disabled={isDealing}>
            {isDealing ? 'Dealing...' : 'Deal Final 2 Cards'}
          </Button>
        ) : (
          <p className="text-muted-foreground">
            Waiting for dealer to deal final 2 cards...
          </p>
        )
      ) : (
        <p className="text-muted-foreground">Starting game...</p>
      )}
    </div>
  );
}
