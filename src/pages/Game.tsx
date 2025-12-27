import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useGameState } from '@/hooks/useGameState';
import { useGameActions } from '@/hooks/useGameActions';
import { getFiveTrickPlayerPosition, CardPullState } from '@/lib/gameLogic';
import {
  WaitingPhase,
  TrumpSelectionPhase,
  DealingPhase,
  CardPullPhase,
  PlayingPhase,
  RedistributionPhase,
  FinishedPhase
} from '@/components/phases';

/**
 * ============================================================================
 * Game Page
 * ============================================================================
 *
 * Main game orchestrator that:
 * 1. Loads game state via useGameState hook
 * 2. Provides actions via useGameActions hook
 * 3. Routes to the appropriate phase component based on game status
 *
 * GAME PHASES:
 * - waiting: Waiting for 3 players to join
 * - dealing/trump_selection: 5-trick player picks trump
 * - dealing/dealing_3: Dealer deals final 2 cards
 * - dealing/card_pull: Over-scorers pull cards from under-scorers
 * - playing: Active gameplay
 * - redistribution: Round complete, showing results
 * - finished: Game over
 *
 * ============================================================================
 */
const Game = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // ----------------------------------------
  // State & Actions from hooks
  // ----------------------------------------
  const {
    gameState,
    players,
    hand,
    myPosition,
    currentTrick,
    isLoading,
    setHand,
    setCurrentTrick
  } = useGameState(roomId);

  const actions = useGameActions(
    roomId,
    gameState,
    players,
    hand,
    myPosition,
    setHand,
    currentTrick
  );

  // Reset isDealing when phase changes
  useEffect(() => {
    // This effect is now handled inside useGameActions
  }, [gameState?.dealing_phase]);

  // ----------------------------------------
  // Loading state
  // ----------------------------------------
  if (isLoading || !gameState) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        Loading...
      </div>
    );
  }

  // ----------------------------------------
  // Derived state
  // ----------------------------------------
  const isDealer = myPosition === gameState.dealer_index;
  const isFiveTrickPlayer = myPosition === getFiveTrickPlayerPosition(gameState.dealer_index);
  const myPlayerData = players.find(p => p.position === myPosition);

  // ----------------------------------------
  // Room ID copy handler
  // ----------------------------------------
  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Room ID copied to clipboard' });
  };

  // ----------------------------------------
  // Render
  // ----------------------------------------
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <GameHeader
          roomId={roomId}
          roundNumber={gameState.round_number}
          isDealer={isDealer}
          dealerIndex={gameState.dealer_index}
          copied={copied}
          onCopy={handleCopyRoomId}
          onLeave={() => navigate('/')}
        />

        {/* Player Scores */}
        <PlayerScores players={players} myPosition={myPosition} />

        {/* Phase-specific content */}
        <PhaseRouter
          gameState={gameState}
          players={players}
          hand={hand}
          myPosition={myPosition}
          currentTrick={currentTrick}
          isDealer={isDealer}
          isFiveTrickPlayer={isFiveTrickPlayer}
          myPlayerData={myPlayerData}
          actions={actions}
        />
      </div>
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface GameHeaderProps {
  roomId: string | undefined;
  roundNumber: number;
  isDealer: boolean;
  dealerIndex: number;
  copied: boolean;
  onCopy: () => void;
  onLeave: () => void;
}

function GameHeader({
  roomId,
  roundNumber,
  isDealer,
  dealerIndex,
  copied,
  onCopy,
  onLeave
}: GameHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-8">
      <div>
        <h1 className="text-3xl font-bold">3-2-5 Game</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Round {roundNumber} •{' '}
          {isDealer ? '🎴 You are dealer' : `Dealer: Player ${dealerIndex + 1}`}
        </p>
      </div>
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg border border-border">
          <span className="text-sm font-mono text-card-foreground">{roomId}</span>
          <Button variant="outline" size="icon" className="h-6 w-6" onClick={onCopy}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
        <Button variant="secondary" onClick={onLeave}>
          Leave Game
        </Button>
      </div>
    </div>
  );
}

interface PlayerScoresProps {
  players: any[];
  myPosition: number | null;
}

function PlayerScores({ players, myPosition }: PlayerScoresProps) {
  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      {players.map((player) => (
        <div
          key={player.position}
          className={`p-4 rounded-lg border ${
            player.position === myPosition
              ? 'bg-primary/10 border-primary'
              : 'bg-card border-border'
          }`}
        >
          <div
            className={`font-semibold ${
              player.position === myPosition ? 'text-foreground' : 'text-card-foreground'
            }`}
          >
            {player.name}
          </div>
          <div
            className={`text-sm ${
              player.position === myPosition
                ? 'text-foreground/70'
                : 'text-card-foreground/70'
            }`}
          >
            Target: {player.target_tricks} • Won: {player.tricks_won}
          </div>
          <div
            className={`text-sm font-medium mt-1 ${
              player.position === myPosition ? 'text-foreground' : 'text-card-foreground'
            }`}
          >
            Score: {player.overachievement_score || 0}
          </div>
        </div>
      ))}
    </div>
  );
}

interface PhaseRouterProps {
  gameState: any;
  players: any[];
  hand: any[];
  myPosition: number | null;
  currentTrick: any[];
  isDealer: boolean;
  isFiveTrickPlayer: boolean;
  myPlayerData: any;
  actions: ReturnType<typeof useGameActions>;
}

/**
 * Routes to the appropriate phase component based on game state.
 * This is the main decision point for what UI to show.
 */
function PhaseRouter({
  gameState,
  players,
  hand,
  myPosition,
  currentTrick,
  isDealer,
  isFiveTrickPlayer,
  myPlayerData,
  actions
}: PhaseRouterProps) {
  // Waiting for players
  if (gameState.status === 'waiting') {
    return <WaitingPhase players={players} onStartGame={actions.startGame} />;
  }

  // Trump selection
  if (gameState.dealing_phase === 'trump_selection') {
    return (
      <TrumpSelectionPhase
        hand={hand}
        isFiveTrickPlayer={isFiveTrickPlayer}
        selectedTrump={actions.selectedTrump}
        onSelectTrump={actions.setSelectedTrump}
        onConfirmTrump={() => actions.selectedTrump && actions.selectTrump(actions.selectedTrump)}
      />
    );
  }

  // Deal final 2 cards
  if (gameState.dealing_phase === 'dealing_3') {
    return (
      <DealingPhase
        hand={hand}
        trumpSuit={gameState.trump_suit}
        isDealer={isDealer}
        isDealing={actions.isDealing}
        onDealFinalCards={actions.dealFinalCards}
      />
    );
  }

  // Card pull phase
  if (gameState.dealing_phase === 'card_pull' && gameState.card_pull_state) {
    return (
      <CardPullPhase
        cardPullState={gameState.card_pull_state as CardPullState}
        players={players}
        hand={hand}
        myPosition={myPosition}
        trumpSuit={gameState.trump_suit}
        onSelectTarget={actions.selectPullTarget}
        onSelectCard={actions.selectCardPosition}
        onReturnCard={actions.returnCard}
      />
    );
  }

  // Active gameplay
  if (gameState.status === 'playing') {
    return (
      <PlayingPhase
        currentTrick={currentTrick}
        players={players}
        currentPlayerIndex={gameState.current_player_index}
        trumpSuit={gameState.trump_suit}
        myPosition={myPosition!}
        hand={hand}
        myPlayerData={myPlayerData}
        onPlayCard={actions.playCard}
      />
    );
  }

  // Round complete
  if (gameState.status === 'redistribution') {
    return (
      <RedistributionPhase
        players={players}
        roundNumber={gameState.round_number}
        dealerIndex={gameState.dealer_index}
        onStartNewRound={actions.startNewRound}
      />
    );
  }

  // Game over
  if (gameState.status === 'finished') {
    return <FinishedPhase players={players} />;
  }

  // Fallback
  return <div>Unknown game state</div>;
}

export default Game;
