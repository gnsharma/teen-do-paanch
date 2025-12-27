import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlayerHand } from '@/components/PlayerHand';
import { Card, Suit } from '@/lib/gameLogic';

interface TrumpSelectionPhaseProps {
  hand: Card[];
  isFiveTrickPlayer: boolean;
  selectedTrump: Suit | null;
  onSelectTrump: (trump: Suit) => void;
  onConfirmTrump: () => void;
}

/**
 * Phase where the 5-trick player selects the trump suit.
 * Shows the player's first 5 cards to help them decide.
 */
export function TrumpSelectionPhase({
  hand,
  isFiveTrickPlayer,
  selectedTrump,
  onSelectTrump,
  onConfirmTrump
}: TrumpSelectionPhaseProps) {
  if (isFiveTrickPlayer) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-lg">
          You are the 5-trick player. Look at your first 5 cards and select trump suit:
        </p>
        <div className="mb-4">
          <PlayerHand cards={hand} canPlay={false} />
        </div>
        <div className="flex gap-4 justify-center">
          <Select
            value={selectedTrump || undefined}
            onValueChange={(v) => onSelectTrump(v as Suit)}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select trump" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="♠">♠ Spades</SelectItem>
              <SelectItem value="♥">♥ Hearts</SelectItem>
              <SelectItem value="♦">♦ Diamonds</SelectItem>
              <SelectItem value="♣">♣ Clubs</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={onConfirmTrump} disabled={!selectedTrump}>
            Confirm Trump & Deal Remaining Cards
          </Button>
        </div>
      </div>
    );
  }

  // Non-5-trick player waits
  return (
    <div className="text-center py-12">
      <p className="text-lg">Waiting for 5-trick player to select trump suit...</p>
      <div className="mt-4">
        <PlayerHand cards={hand} canPlay={false} />
      </div>
    </div>
  );
}
