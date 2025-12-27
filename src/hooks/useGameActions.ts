import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  Suit,
  shuffle,
  createDeck,
  evaluateTrick,
  isValidMove,
  getTargetTricks,
  getFiveTrickPlayerPosition,
  PreviousRoundResult,
  CardPullState,
  calculatePullEligibility,
  initializeCardPullState,
  canReturnCard,
} from '@/lib/gameLogic';
import { GameState, Player } from './useGameState';

// ============================================================================
// TYPES
// ============================================================================

export interface UseGameActionsReturn {
  // Dealing phase actions
  startGame: () => Promise<void>;
  selectTrump: (trump: Suit) => Promise<void>;
  dealFinalCards: () => Promise<void>;

  // Playing phase actions
  playCard: (card: Card) => Promise<void>;

  // Card pull actions
  selectPullTarget: (targetPosition: number) => Promise<void>;
  selectCardPosition: (cardIndex: number) => Promise<void>;
  returnCard: (returnCard: Card) => Promise<void>;

  // Round management
  startNewRound: () => Promise<void>;

  // Local state
  isDealing: boolean;
  selectedTrump: Suit | null;
  setSelectedTrump: (trump: Suit | null) => void;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Provides all game mutation actions.
 *
 * Each action:
 * - Validates the action is allowed
 * - Updates Supabase (room and/or players)
 * - Shows toast on errors
 *
 * Actions are grouped by game phase for clarity.
 */
export function useGameActions(
  roomId: string | undefined,
  gameState: GameState | null,
  players: Player[],
  hand: Card[],
  myPosition: number | null,
  setHand: (hand: Card[]) => void,
  currentTrick: Array<{ position: number; card: Card }>
): UseGameActionsReturn {
  const { toast } = useToast();
  const [isDealing, setIsDealing] = useState(false);
  const [selectedTrump, setSelectedTrump] = useState<Suit | null>(null);

  // ==========================================================================
  // DEALING PHASE ACTIONS
  // ==========================================================================

  /**
   * Starts the game by dealing first 5 cards to each player.
   * Can only be called when status is 'waiting' and 3 players are present.
   */
  const startGame = useCallback(async () => {
    if (!gameState || !roomId) return;

    // Guard: can only start from waiting
    if (gameState.status !== 'waiting') return;

    if (players.length !== 3) {
      toast({ title: 'Need 3 players to start', variant: 'destructive' });
      return;
    }

    // Create and shuffle deck
    const deck = shuffle(createDeck());

    // Deal first 5 cards to each player (15 total)
    const firstFiveHands: Card[][] = [[], [], []];
    for (let i = 0; i < 5; i++) {
      for (let player = 0; player < 3; player++) {
        firstFiveHands[player].push(deck[i * 3 + player]);
      }
    }

    // Store remaining 15 cards for later dealing phases
    const remainingCards = deck.slice(15);

    // Update room first (acts as lock to prevent race conditions)
    await supabase
      .from('rooms')
      .update({
        dealing_phase: 'trump_selection',
        status: 'dealing',
        remaining_cards: remainingCards as any
      })
      .eq('id', roomId);

    // Update each player's hand and target
    for (let i = 0; i < 3; i++) {
      await supabase
        .from('players')
        .update({
          hand: firstFiveHands[i] as any,
          target_tricks: getTargetTricks(i, gameState.dealer_index),
          tricks_won: 0
        })
        .eq('room_id', roomId)
        .eq('position', i);
    }
  }, [gameState, roomId, players, toast]);

  /**
   * 5-trick player selects trump suit and deals 3 more cards.
   */
  const selectTrump = useCallback(async (trump: Suit) => {
    if (!gameState || !roomId) return;

    // Guard: can only select trump during trump_selection phase
    if (gameState.dealing_phase !== 'trump_selection') return;

    const remainingCards = (gameState.remaining_cards || []) as unknown as Card[];

    if (remainingCards.length !== 15) {
      toast({ title: 'Error: Invalid remaining cards', variant: 'destructive' });
      return;
    }

    // Add 3 more cards to each player's hand
    const hands: Card[][] = players.map(p => [...(p.hand as unknown as Card[])]);
    for (let i = 0; i < 3; i++) {
      for (let player = 0; player < 3; player++) {
        hands[player].push(remainingCards[i * 3 + player]);
      }
    }

    // Store remaining 6 cards for final deal
    const finalCards = remainingCards.slice(9);

    // Update room first
    await supabase
      .from('rooms')
      .update({
        trump_suit: trump,
        dealing_phase: 'dealing_3',
        remaining_cards: finalCards as any
      })
      .eq('id', roomId);

    // Update players
    for (let i = 0; i < 3; i++) {
      await supabase
        .from('players')
        .update({ hand: hands[i] as any })
        .eq('room_id', roomId)
        .eq('position', i);
    }
  }, [gameState, roomId, players, toast]);

  /**
   * Dealer deals final 2 cards to each player.
   * May also trigger card pull phase if applicable.
   */
  const dealFinalCards = useCallback(async () => {
    if (!gameState || !roomId) return;

    // Guard: prevent double-dealing
    if (gameState.dealing_phase !== 'dealing_3' || isDealing) return;

    setIsDealing(true);

    const remainingCards = (gameState.remaining_cards || []) as unknown as Card[];

    if (remainingCards.length !== 6) {
      toast({ title: 'Error: Invalid remaining cards', variant: 'destructive' });
      setIsDealing(false);
      return;
    }

    // Add final 2 cards to each player
    const hands: Card[][] = players.map(p => [...(p.hand as unknown as Card[])]);
    for (let i = 0; i < 2; i++) {
      for (let player = 0; player < 3; player++) {
        hands[player].push(remainingCards[i * 3 + player]);
      }
    }

    // 5-trick player leads first trick
    const firstTrickLeader = getFiveTrickPlayerPosition(gameState.dealer_index);

    // Check if card pull phase should happen (round > 1 with over/under-scorers)
    const previousResults = gameState.previous_round_results as PreviousRoundResult[] | null;
    const shouldDoCardPull = gameState.round_number > 1 && previousResults && previousResults.length > 0;

    let cardPullState: CardPullState | null = null;
    let nextPhase = 'playing';
    let nextStatus = 'playing';

    if (shouldDoCardPull) {
      const { overScorers, underScorers } = calculatePullEligibility(previousResults, gameState.dealer_index);

      // Only do card pull if there are both over-scorers AND under-scorers
      if (overScorers.length > 0 && underScorers.length > 0) {
        cardPullState = initializeCardPullState(overScorers, underScorers);
        nextPhase = 'card_pull';
        nextStatus = 'dealing';
      }
    }

    // Update room
    const { error: roomError } = await supabase
      .from('rooms')
      .update({
        status: nextStatus,
        dealing_phase: nextPhase,
        current_player_index: firstTrickLeader,
        first_trick_leader: firstTrickLeader,
        remaining_cards: null,
        trump_led_at_start: null,
        card_pull_state: cardPullState as any
      })
      .eq('id', roomId);

    if (roomError) {
      toast({ title: `Error: ${roomError.message}`, variant: 'destructive' });
      setIsDealing(false);
      return;
    }

    // Update players
    for (let i = 0; i < 3; i++) {
      await supabase
        .from('players')
        .update({ hand: hands[i] as any })
        .eq('room_id', roomId)
        .eq('position', i);
    }
  }, [gameState, roomId, players, isDealing, toast]);

  // ==========================================================================
  // PLAYING PHASE ACTIONS
  // ==========================================================================

  /**
   * Plays a card in the current trick.
   * Validates the move, updates state, and handles trick completion.
   */
  const playCard = useCallback(async (card: Card) => {
    if (!gameState || !roomId || myPosition === null) return;

    // Guard: must be your turn
    if (myPosition !== gameState.current_player_index) {
      toast({ title: 'Not your turn', variant: 'destructive' });
      return;
    }

    // Guard: wait for previous trick to clear
    if (currentTrick.length >= 3) {
      toast({ title: 'Wait for the trick to clear', variant: 'destructive' });
      return;
    }

    // Validate the move
    const trickIndex = 10 - hand.length;
    const moveValidation = isValidMove(
      card,
      hand,
      currentTrick,
      gameState.trump_suit as Suit | null,
      trickIndex,
      gameState.trump_led_at_start
    );

    if (!moveValidation.valid) {
      toast({ title: moveValidation.reason || 'Invalid move', variant: 'destructive' });
      return;
    }

    // Update local state immediately
    const newTrick = [...currentTrick, { position: myPosition, card }];
    const newHand = hand.filter(c => !(c.suit === card.suit && c.rank === card.rank));
    setHand(newHand);

    // Handle trick completion (3 cards played)
    if (newTrick.length === 3) {
      const winnerPosition = evaluateTrick(newTrick, gameState.trump_suit as Suit | null);
      const winner = players[winnerPosition];

      // Update player's hand
      await supabase
        .from('players')
        .update({ hand: newHand as any })
        .eq('room_id', roomId)
        .eq('position', myPosition);

      // Update winner's trick count
      await supabase
        .from('players')
        .update({ tricks_won: winner.tricks_won + 1 })
        .eq('room_id', roomId)
        .eq('position', winnerPosition);

      // Save trick to history
      await supabase.from('tricks').insert({
        room_id: roomId,
        round_number: gameState.round_number,
        trick_number: 10 - newHand.length,
        cards_played: newTrick as any,
        winner_position: winnerPosition,
      });

      // Update room
      await supabase
        .from('rooms')
        .update({
          current_trick: newTrick as any,
          current_player_index: winnerPosition
        })
        .eq('id', roomId);

      // Check if round is over
      if (newHand.length === 0) {
        setTimeout(async () => {
          await supabase
            .from('rooms')
            .update({ current_trick: [] as any })
            .eq('id', roomId);
        }, 2000);
        await handleRoundEnd();
      } else {
        // Clear trick after delay
        setTimeout(async () => {
          await supabase
            .from('rooms')
            .update({ current_trick: [] as any })
            .eq('id', roomId);
        }, 2000);
      }
    } else {
      // Trick not complete - update and move to next player
      const isFirstCardOfFirstTrick = trickIndex === 0 && currentTrick.length === 0;
      const roomUpdate: any = {
        current_trick: newTrick as any,
        current_player_index: (gameState.current_player_index + 1) % 3
      };

      // Track if trump was led on first trick
      if (isFirstCardOfFirstTrick) {
        roomUpdate.trump_led_at_start = card.suit === gameState.trump_suit;
      }

      await supabase
        .from('players')
        .update({ hand: newHand as any })
        .eq('room_id', roomId)
        .eq('position', myPosition);

      await supabase
        .from('rooms')
        .update(roomUpdate)
        .eq('id', roomId);
    }
  }, [gameState, roomId, myPosition, hand, currentTrick, players, toast, setHand]);

  /**
   * Handles end of round: calculates scores, checks for winner, prepares next round.
   */
  const handleRoundEnd = async () => {
    if (!gameState || !roomId) return;

    // Calculate overachievement for each player
    const updatedPlayers = players.map(p => ({
      ...p,
      overachievement: p.tricks_won - p.target_tricks,
      overachievement_score: (p.overachievement_score || 0) + (p.tricks_won - p.target_tricks)
    }));

    // Check for winner (score >= 5)
    const winner = updatedPlayers.find(p => p.overachievement_score >= 5);

    if (winner) {
      toast({
        title: `${winner.name} wins the game!`,
        description: `Overachievement score: ${winner.overachievement_score}`
      });
      await supabase
        .from('rooms')
        .update({ status: 'finished', dealing_phase: 'finished' })
        .eq('id', roomId);
      return;
    }

    // Save results for card pull calculation
    const previousRoundResults: PreviousRoundResult[] = players.map(p => ({
      position: p.position,
      tricksWon: p.tricks_won,
      targetTricks: p.target_tricks
    }));

    // Rotate dealer: 5-trick player becomes new dealer
    const newDealerIndex = (gameState.dealer_index + 1) % 3;

    // Update player scores
    for (const player of updatedPlayers) {
      await supabase
        .from('players')
        .update({ overachievement_score: player.overachievement_score })
        .eq('room_id', roomId)
        .eq('position', player.position);
    }

    // Update room for redistribution phase
    await supabase
      .from('rooms')
      .update({
        dealer_index: newDealerIndex,
        round_number: gameState.round_number + 1,
        dealing_phase: 'redistribution',
        status: 'redistribution',
        previous_round_results: previousRoundResults as any
      })
      .eq('id', roomId);
  };

  // ==========================================================================
  // CARD PULL ACTIONS
  // ==========================================================================

  /**
   * Selects which under-scorer to pull a card from.
   */
  const selectPullTarget = useCallback(async (targetPosition: number) => {
    if (!gameState || !roomId || myPosition === null) return;

    const cardPullState = gameState.card_pull_state as CardPullState | null;
    if (!cardPullState || cardPullState.phase !== 'selecting_target') {
      toast({ title: 'Invalid action', variant: 'destructive' });
      return;
    }

    // Verify it's this player's turn to pull
    const currentPuller = cardPullState.pullers[cardPullState.currentPullerIndex];
    if (myPosition !== currentPuller.position) {
      toast({ title: 'Not your turn to pull', variant: 'destructive' });
      return;
    }

    // Verify target is an under-scorer
    const isValidTarget = cardPullState.underScorers.some(u => u.position === targetPosition);
    if (!isValidTarget) {
      toast({ title: 'Invalid target', variant: 'destructive' });
      return;
    }

    // Move to selecting_card phase
    const newState: CardPullState = {
      ...cardPullState,
      phase: 'selecting_card',
      selectedTarget: targetPosition
    };

    await supabase
      .from('rooms')
      .update({ card_pull_state: newState as any })
      .eq('id', roomId);
  }, [gameState, roomId, myPosition, toast]);

  /**
   * Selects which card position to pull from target's hand.
   */
  const selectCardPosition = useCallback(async (cardIndex: number) => {
    if (!gameState || !roomId || myPosition === null) return;

    const cardPullState = gameState.card_pull_state as CardPullState | null;
    if (!cardPullState || cardPullState.phase !== 'selecting_card' || cardPullState.selectedTarget === null) {
      toast({ title: 'Invalid action', variant: 'destructive' });
      return;
    }

    const currentPuller = cardPullState.pullers[cardPullState.currentPullerIndex];
    if (myPosition !== currentPuller.position) {
      toast({ title: 'Not your turn to pull', variant: 'destructive' });
      return;
    }

    // Get target's hand
    const targetPlayer = players.find(p => p.position === cardPullState.selectedTarget);
    if (!targetPlayer) {
      toast({ title: 'Target player not found', variant: 'destructive' });
      return;
    }

    const targetHand = targetPlayer.hand as unknown as Card[];
    if (cardIndex < 0 || cardIndex >= targetHand.length) {
      toast({ title: 'Invalid card position', variant: 'destructive' });
      return;
    }

    // Reveal the pulled card and move to returning_card phase
    const pulledCard = targetHand[cardIndex];
    const newState: CardPullState = {
      ...cardPullState,
      phase: 'returning_card',
      pulledCard,
      pulledCardIndex: cardIndex
    };

    await supabase
      .from('rooms')
      .update({ card_pull_state: newState as any })
      .eq('id', roomId);
  }, [gameState, roomId, myPosition, players, toast]);

  /**
   * Returns a card to complete the pull exchange.
   */
  const returnCard = useCallback(async (returnCardToGive: Card) => {
    if (!gameState || !roomId || myPosition === null) return;

    const cardPullState = gameState.card_pull_state as CardPullState | null;
    if (!cardPullState || cardPullState.phase !== 'returning_card' ||
        !cardPullState.pulledCard || cardPullState.selectedTarget === null) {
      toast({ title: 'Invalid action', variant: 'destructive' });
      return;
    }

    const currentPuller = cardPullState.pullers[cardPullState.currentPullerIndex];
    if (myPosition !== currentPuller.position) {
      toast({ title: 'Not your turn to pull', variant: 'destructive' });
      return;
    }

    // Validate return card
    const validation = canReturnCard(returnCardToGive, cardPullState.pulledCard, hand);
    if (!validation.valid) {
      toast({ title: validation.reason || 'Invalid return card', variant: 'destructive' });
      return;
    }

    const targetPlayer = players.find(p => p.position === cardPullState.selectedTarget);
    if (!targetPlayer) {
      toast({ title: 'Target player not found', variant: 'destructive' });
      return;
    }

    // Execute the swap
    // Puller: remove returnCard, add pulledCard
    const pullerNewHand = hand.filter(c => !(c.suit === returnCardToGive.suit && c.rank === returnCardToGive.rank));
    pullerNewHand.push(cardPullState.pulledCard);

    // Target: remove pulledCard, add returnCard
    const targetHand = targetPlayer.hand as unknown as Card[];
    const targetNewHand = targetHand.filter(c =>
      !(c.suit === cardPullState.pulledCard!.suit && c.rank === cardPullState.pulledCard!.rank)
    );
    targetNewHand.push(returnCardToGive);

    // Update local state
    setHand(pullerNewHand);

    // Update pulls remaining
    const updatedPullers = [...cardPullState.pullers];
    updatedPullers[cardPullState.currentPullerIndex] = {
      ...currentPuller,
      pullsRemaining: currentPuller.pullsRemaining - 1
    };

    // Determine next state
    let newState: CardPullState | null;

    if (updatedPullers[cardPullState.currentPullerIndex].pullsRemaining > 0) {
      // Same puller has more pulls
      newState = {
        ...cardPullState,
        pullers: updatedPullers,
        phase: 'selecting_target',
        selectedTarget: null,
        pulledCard: null,
        pulledCardIndex: null
      };
    } else {
      // Move to next puller
      const nextPullerIndex = cardPullState.currentPullerIndex + 1;
      if (nextPullerIndex < updatedPullers.length) {
        newState = {
          ...cardPullState,
          pullers: updatedPullers,
          currentPullerIndex: nextPullerIndex,
          phase: 'selecting_target',
          selectedTarget: null,
          pulledCard: null,
          pulledCardIndex: null
        };
      } else {
        // All pulls complete
        newState = null;
      }
    }

    // Update database
    await supabase
      .from('players')
      .update({ hand: pullerNewHand as any })
      .eq('room_id', roomId)
      .eq('position', myPosition);

    await supabase
      .from('players')
      .update({ hand: targetNewHand as any })
      .eq('room_id', roomId)
      .eq('position', cardPullState.selectedTarget);

    if (newState) {
      await supabase
        .from('rooms')
        .update({ card_pull_state: newState as any })
        .eq('id', roomId);
    } else {
      // Transition to playing phase
      await supabase
        .from('rooms')
        .update({
          status: 'playing',
          dealing_phase: 'playing',
          card_pull_state: null
        })
        .eq('id', roomId);
    }
  }, [gameState, roomId, myPosition, hand, players, toast, setHand]);

  // ==========================================================================
  // ROUND MANAGEMENT
  // ==========================================================================

  /**
   * Starts a new round after redistribution phase.
   */
  const startNewRound = useCallback(async () => {
    if (!gameState || !roomId) return;

    // Guard: can only start new round from redistribution
    if (gameState.status !== 'redistribution') return;

    setSelectedTrump(null);

    // Get latest dealer index
    const { data: latestRoom } = await supabase
      .from('rooms')
      .select('dealer_index')
      .eq('id', roomId)
      .single();

    if (!latestRoom) {
      toast({ title: 'Error fetching room state', variant: 'destructive' });
      return;
    }

    const currentDealerIndex = latestRoom.dealer_index;

    // Deal first 5 cards
    const deck = shuffle(createDeck());
    const firstFiveHands: Card[][] = [[], [], []];

    for (let i = 0; i < 5; i++) {
      for (let player = 0; player < 3; player++) {
        firstFiveHands[player].push(deck[i * 3 + player]);
      }
    }

    const remainingCards = deck.slice(15);

    // Update room
    await supabase
      .from('rooms')
      .update({
        dealing_phase: 'trump_selection',
        status: 'dealing',
        trump_suit: null,
        remaining_cards: remainingCards as any,
        current_trick: [] as any,
        trump_led_at_start: null
      })
      .eq('id', roomId);

    // Update players
    for (let i = 0; i < 3; i++) {
      await supabase
        .from('players')
        .update({
          hand: firstFiveHands[i] as any,
          target_tricks: getTargetTricks(i, currentDealerIndex),
          tricks_won: 0
        })
        .eq('room_id', roomId)
        .eq('position', i);
    }
  }, [gameState, roomId, toast]);

  return {
    startGame,
    selectTrump,
    dealFinalCards,
    playCard,
    selectPullTarget,
    selectCardPosition,
    returnCard,
    startNewRound,
    isDealing,
    selectedTrump,
    setSelectedTrump
  };
}
