import { Button } from '@/components/ui/button';
import { PlayerHand } from '@/components/PlayerHand';
import { Card, CardPullState, getValidReturnCards } from '@/lib/gameLogic';
import { Player } from '@/hooks/useGameState';

interface CardPullPhaseProps {
  cardPullState: CardPullState;
  players: Player[];
  hand: Card[];
  myPosition: number | null;
  trumpSuit: string | null;
  onSelectTarget: (targetPosition: number) => void;
  onSelectCard: (cardIndex: number) => void;
  onReturnCard: (card: Card) => void;
}

/**
 * Card pull phase UI - handles the 3-phase card exchange process.
 *
 * Phases:
 * 1. selecting_target - Over-scorer chooses which under-scorer to pull from
 * 2. selecting_card - Over-scorer selects a card position (face-down)
 * 3. returning_card - Over-scorer sees the card and chooses what to return
 */
export function CardPullPhase({
  cardPullState,
  players,
  hand,
  myPosition,
  trumpSuit,
  onSelectTarget,
  onSelectCard,
  onReturnCard
}: CardPullPhaseProps) {
  const currentPuller = cardPullState.pullers[cardPullState.currentPullerIndex];
  const isMyTurn = myPosition === currentPuller?.position;
  const pullerName = players.find(p => p.position === currentPuller?.position)?.name || 'Unknown';
  const targetPlayer = players.find(p => p.position === cardPullState.selectedTarget);
  const validReturnCards = cardPullState.pulledCard
    ? getValidReturnCards(cardPullState.pulledCard, hand)
    : [];

  return (
    <div className="text-center py-8 space-y-6">
      {/* Trump display */}
      <div className="bg-secondary px-6 py-3 rounded-lg border-2 border-primary inline-block">
        <div className="text-sm font-medium text-muted-foreground mb-1">Trump Suit</div>
        <div className="text-4xl">{trumpSuit}</div>
      </div>

      {/* Card Pull Header */}
      <div className="bg-amber-500/20 border border-amber-500 rounded-lg px-6 py-4 max-w-2xl mx-auto">
        <h2 className="text-xl font-bold text-amber-600 mb-2">Card Pull Phase</h2>
        <p className="text-sm text-muted-foreground">
          {pullerName} has {currentPuller?.pullsRemaining} pull
          {currentPuller?.pullsRemaining !== 1 ? 's' : ''} remaining
          (won {currentPuller?.extraTricks} extra trick
          {currentPuller?.extraTricks !== 1 ? 's' : ''} last round)
        </p>
      </div>

      {/* Phase 1: Selecting Target */}
      {cardPullState.phase === 'selecting_target' && (
        <SelectingTargetUI
          isMyTurn={isMyTurn}
          pullerName={pullerName}
          underScorers={cardPullState.underScorers}
          players={players}
          onSelectTarget={onSelectTarget}
        />
      )}

      {/* Phase 2: Selecting Card */}
      {cardPullState.phase === 'selecting_card' && (
        <SelectingCardUI
          isMyTurn={isMyTurn}
          pullerName={pullerName}
          targetPlayer={targetPlayer}
          myPosition={myPosition}
          selectedTarget={cardPullState.selectedTarget}
          hand={hand}
          onSelectCard={onSelectCard}
        />
      )}

      {/* Phase 3: Returning Card */}
      {cardPullState.phase === 'returning_card' && cardPullState.pulledCard && (
        <ReturningCardUI
          isMyTurn={isMyTurn}
          pullerName={pullerName}
          targetPlayer={targetPlayer}
          pulledCard={cardPullState.pulledCard}
          hand={hand}
          validReturnCards={validReturnCards}
          onReturnCard={onReturnCard}
        />
      )}

      {/* Show hand when not already displayed */}
      {shouldShowHand(cardPullState, isMyTurn, myPosition) && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-2">Your Hand</h3>
          <PlayerHand cards={hand} canPlay={false} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface SelectingTargetUIProps {
  isMyTurn: boolean;
  pullerName: string;
  underScorers: { position: number }[];
  players: Player[];
  onSelectTarget: (position: number) => void;
}

function SelectingTargetUI({
  isMyTurn,
  pullerName,
  underScorers,
  players,
  onSelectTarget
}: SelectingTargetUIProps) {
  if (!isMyTurn) {
    return (
      <p className="text-lg text-muted-foreground">
        {pullerName} is selecting a player to pull from...
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-lg font-medium">Select a player to pull a card from:</p>
      <div className="flex gap-4 justify-center">
        {underScorers.map(underScorer => {
          const player = players.find(p => p.position === underScorer.position);
          return (
            <Button
              key={underScorer.position}
              onClick={() => onSelectTarget(underScorer.position)}
              variant="outline"
              className="px-6 py-8 flex flex-col gap-2"
            >
              <span className="font-semibold">{player?.name}</span>
              <span className="text-sm text-muted-foreground">
                Position {underScorer.position + 1}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

interface SelectingCardUIProps {
  isMyTurn: boolean;
  pullerName: string;
  targetPlayer: Player | undefined;
  myPosition: number | null;
  selectedTarget: number | null;
  hand: Card[];
  onSelectCard: (index: number) => void;
}

function SelectingCardUI({
  isMyTurn,
  pullerName,
  targetPlayer,
  myPosition,
  selectedTarget,
  hand,
  onSelectCard
}: SelectingCardUIProps) {
  if (!isMyTurn) {
    return (
      <>
        <p className="text-lg text-muted-foreground">
          {pullerName} is selecting a card from {targetPlayer?.name}'s hand...
        </p>
        {myPosition === selectedTarget && (
          <div className="mt-4">
            <p className="text-sm text-amber-600 mb-2">Your cards (one will be pulled):</p>
            <PlayerHand cards={hand} canPlay={false} />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-lg font-medium">Select a card from {targetPlayer?.name}'s hand:</p>
      <div className="flex gap-2 justify-center flex-wrap">
        {Array.from({ length: 10 }).map((_, index) => (
          <button
            key={index}
            onClick={() => onSelectCard(index)}
            className="w-16 h-24 bg-gradient-to-br from-blue-800 to-blue-950 rounded-lg border-2 border-blue-600 hover:border-amber-500 hover:scale-105 transition-all flex items-center justify-center shadow-lg cursor-pointer"
          >
            <span className="text-xs text-blue-300 font-mono">{index + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface ReturningCardUIProps {
  isMyTurn: boolean;
  pullerName: string;
  targetPlayer: Player | undefined;
  pulledCard: Card;
  hand: Card[];
  validReturnCards: Card[];
  onReturnCard: (card: Card) => void;
}

function ReturningCardUI({
  isMyTurn,
  pullerName,
  targetPlayer,
  pulledCard,
  hand,
  validReturnCards,
  onReturnCard
}: ReturningCardUIProps) {
  const isRed = pulledCard.suit === '♥' || pulledCard.suit === '♦';

  return (
    <div className="space-y-4">
      {/* Show the pulled card */}
      <div className="bg-card border rounded-lg p-4 max-w-md mx-auto">
        <p className="text-sm text-muted-foreground mb-2">
          Card pulled from {targetPlayer?.name}:
        </p>
        <div className="flex justify-center">
          <div
            className={`w-20 h-28 rounded-lg border-2 flex items-center justify-center text-3xl font-bold shadow-lg ${
              isRed
                ? 'bg-white text-red-600 border-red-300'
                : 'bg-white text-gray-900 border-gray-300'
            }`}
          >
            {pulledCard.rank}{pulledCard.suit}
          </div>
        </div>
      </div>

      {isMyTurn ? (
        <>
          <p className="text-lg font-medium">Select a card to return:</p>
          <p className="text-sm text-muted-foreground">
            You can return: the same card, a card of the same suit, or a different suit
            if you keep at least 2 of that suit
          </p>
          <div className="mt-4">
            <PlayerHand
              cards={hand}
              canPlay={true}
              onCardClick={onReturnCard}
              highlightCards={validReturnCards}
            />
          </div>
        </>
      ) : (
        <p className="text-lg text-muted-foreground">
          {pullerName} is selecting a card to return...
        </p>
      )}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function shouldShowHand(
  cardPullState: CardPullState,
  isMyTurn: boolean,
  myPosition: number | null
): boolean {
  // Don't show if we're returning a card and it's our turn (hand is already shown)
  if (cardPullState.phase === 'returning_card' && isMyTurn) {
    return false;
  }

  // Don't show if we're the target being pulled from (hand is already shown)
  if (cardPullState.phase === 'selecting_card' && myPosition === cardPullState.selectedTarget) {
    return false;
  }

  return true;
}
