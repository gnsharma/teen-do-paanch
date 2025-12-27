import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PlayerHand } from '@/components/PlayerHand';
import { GameBoard } from '@/components/GameBoard';
import { Button } from '@/components/ui/button';
import {
  Card, shuffle, createDeck, evaluateTrick, isValidMove, getTargetTricks, getFiveTrickPlayerPosition, Suit,
  PreviousRoundResult, CardPullState, calculatePullEligibility, initializeCardPullState, canReturnCard, getValidReturnCards
} from '@/lib/gameLogic';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Check } from 'lucide-react';

const Game = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [playerName] = useState(() => localStorage.getItem('playerName') || 'Player');
  const [myPosition, setMyPosition] = useState<number | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [gameState, setGameState] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [currentTrick, setCurrentTrick] = useState<Array<{ position: number; card: Card }>>([]);
  const [selectedTrump, setSelectedTrump] = useState<Suit | null>(null);
  // Removed tricksPlayed local state - unreliable, use hand.length === 0 instead
  const [copied, setCopied] = useState(false);

  const loadGameState = useCallback(async () => {
    const { data: room } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('position');

    if (room) {
      setGameState(room);
      // Load current trick from database
      if (Array.isArray(room.current_trick)) {
        setCurrentTrick(room.current_trick as unknown as Array<{ position: number; card: Card }>);
      }
    }
    if (playersData) {
      setPlayers(playersData);
      const myPlayer = playersData.find(p => p.name === playerName);
      if (myPlayer) {
        setMyPosition(myPlayer.position);
        if (Array.isArray(myPlayer.hand)) {
          setHand(myPlayer.hand as unknown as Card[]);
        }
      }
    }
  }, [roomId, playerName]);

  useEffect(() => {
    if (!roomId) {
      navigate('/');
      return;
    }

    loadGameState();
  }, [roomId, loadGameState, navigate]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
        loadGameState();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, () => {
        loadGameState();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadGameState]);

  const handleStartGame = async () => {
    // Guard against double-starting
    if (gameState.status !== 'waiting') {
      return;
    }

    if (players.length !== 3) {
      toast({ title: 'Need 3 players to start', variant: 'destructive' });
      return;
    }

    // Deal first 5 cards to each player
    const deck = shuffle(createDeck());
    const firstFiveHands: Card[][] = [[], [], []];
    
    for (let i = 0; i < 5; i++) {
      for (let player = 0; player < 3; player++) {
        firstFiveHands[player].push(deck[i * 3 + player]);
      }
    }

    // Store remaining cards in room for second dealing phase
    const remainingCards = deck.slice(15);

    // Update players sequentially
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

    // Update room state
    await supabase
      .from('rooms')
      .update({
        dealing_phase: 'trump_selection',
        status: 'dealing',
        remaining_cards: remainingCards as any
      })
      .eq('id', roomId);
  };

  const handleSelectTrump = async () => {
    if (!selectedTrump) return;

    // Guard against double-dealing (race condition)
    if (gameState.dealing_phase !== 'trump_selection') {
      return;
    }

    // Get the stored remaining cards from the room
    const remainingCards = (gameState.remaining_cards || []) as unknown as Card[];

    if (remainingCards.length !== 15) {
      toast({ title: 'Error: Invalid remaining cards', variant: 'destructive' });
      return;
    }

    // Deal 3 cards to each player (first 9 of remaining 15)
    const hands: Card[][] = players.map(p => [...(p.hand as unknown as Card[])]);

    for (let i = 0; i < 3; i++) {
      for (let player = 0; player < 3; player++) {
        hands[player].push(remainingCards[i * 3 + player]);
      }
    }

    // Store remaining 6 cards for next phase (2 cards per player)
    const finalCards = remainingCards.slice(9);

    // Update players sequentially
    for (let i = 0; i < 3; i++) {
      await supabase
        .from('players')
        .update({ hand: hands[i] as any })
        .eq('room_id', roomId)
        .eq('position', i);
    }

    // Transition to dealing_3 phase
    await supabase
      .from('rooms')
      .update({
        trump_suit: selectedTrump,
        dealing_phase: 'dealing_3',
        remaining_cards: finalCards as any
      })
      .eq('id', roomId);
  };

  const handleDealFinalCards = async () => {
    // Guard against double-dealing (race condition when multiple clicks)
    if (gameState.dealing_phase !== 'dealing_3') {
      return;
    }

    // Get the stored remaining cards from the room (should be 6 cards)
    const remainingCards = (gameState.remaining_cards || []) as unknown as Card[];

    if (remainingCards.length !== 6) {
      toast({ title: 'Error: Invalid remaining cards', variant: 'destructive' });
      return;
    }

    // Deal 2 cards to each player
    const hands: Card[][] = players.map(p => [...(p.hand as unknown as Card[])]);

    for (let i = 0; i < 2; i++) {
      for (let player = 0; player < 3; player++) {
        hands[player].push(remainingCards[i * 3 + player]);
      }
    }

    // 5-trick player starts first trick
    const firstTrickLeader = getFiveTrickPlayerPosition(gameState.dealer_index);

    // Check if card pull phase applies (round > 1 and has previous results)
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
        nextStatus = 'dealing'; // Stay in dealing status during card pull
      }
    }

    // Update players sequentially
    for (let i = 0; i < 3; i++) {
      await supabase
        .from('players')
        .update({ hand: hands[i] as any })
        .eq('room_id', roomId)
        .eq('position', i);
    }

    // Transition to next phase (card_pull or playing)
    await supabase
      .from('rooms')
      .update({
        status: nextStatus,
        dealing_phase: nextPhase,
        current_player_index: firstTrickLeader,
        first_trick_leader: firstTrickLeader,
        remaining_cards: null,
        trump_led_at_start: null,  // Reset for new round
        card_pull_state: cardPullState as any
      })
      .eq('id', roomId);
  };

  const handlePlayCard = async (card: Card) => {
    if (myPosition !== gameState?.current_player_index) {
      toast({ title: 'Not your turn', variant: 'destructive' });
      return;
    }

    // Prevent playing while previous trick is still displayed (3 cards = complete trick)
    if (currentTrick.length >= 3) {
      toast({ title: 'Wait for the trick to clear', variant: 'destructive' });
      return;
    }

    // Calculate current trick index (0-9): 10 - hand.length gives us the current trick number
    const trickIndex = 10 - hand.length;

    const moveValidation = isValidMove(
      card,
      hand,
      currentTrick,
      gameState.trump_suit,
      trickIndex,
      gameState.trump_led_at_start
    );
    if (!moveValidation.valid) {
      toast({ title: moveValidation.reason || 'Invalid move', variant: 'destructive' });
      return;
    }

    const newTrick = [...currentTrick, { position: myPosition, card }];
    const newHand = hand.filter(c => !(c.suit === card.suit && c.rank === card.rank));
    setHand(newHand);

    if (newTrick.length === 3) {
      // Trick complete - evaluate winner
      const winnerPosition = evaluateTrick(newTrick, gameState.trump_suit);
      const winner = players[winnerPosition];

      // Update player's hand
      await supabase
        .from('players')
        .update({ hand: newHand as any })
        .eq('room_id', roomId)
        .eq('position', myPosition);

      // Update winner's tricks count
      await supabase
        .from('players')
        .update({ tricks_won: winner.tricks_won + 1 })
        .eq('room_id', roomId)
        .eq('position', winnerPosition);

      // Save trick to history (trick_number = 10 - cards remaining after this play)
      await supabase.from('tricks').insert({
        room_id: roomId as string,
        round_number: gameState.round_number,
        trick_number: 10 - newHand.length,
        cards_played: newTrick as any,
        winner_position: winnerPosition,
      });

      // Update room with completed trick and next player
      await supabase
        .from('rooms')
        .update({
          current_trick: newTrick as any,
          current_player_index: winnerPosition
        })
        .eq('id', roomId);

      // Check if round is over (all cards played = hand is empty)
      if (newHand.length === 0) {
        // Wait a moment to show the final trick, then end round
        setTimeout(async () => {
          await supabase
            .from('rooms')
            .update({ current_trick: [] as any })
            .eq('id', roomId);
        }, 2000);
        await handleRoundEnd();
      } else {
        // Schedule trick clearing after display delay
        setTimeout(async () => {
          await supabase
            .from('rooms')
            .update({ current_trick: [] as any })
            .eq('id', roomId);
        }, 2000);
      }
    } else {
      // Trick not complete
      // Determine if we need to set trump_led_at_start (first card of first trick)
      const isFirstCardOfFirstTrick = trickIndex === 0 && currentTrick.length === 0;
      const roomUpdate: any = {
        current_trick: newTrick as any,
        current_player_index: (gameState.current_player_index + 1) % 3
      };

      // Set trump_led_at_start when the first card of the round is played
      if (isFirstCardOfFirstTrick) {
        roomUpdate.trump_led_at_start = card.suit === gameState.trump_suit;
      }

      // Update player's hand
      await supabase
        .from('players')
        .update({ hand: newHand as any })
        .eq('room_id', roomId)
        .eq('position', myPosition);

      // Update room state
      await supabase
        .from('rooms')
        .update(roomUpdate)
        .eq('id', roomId);
    }
  };

  const handleRoundEnd = async () => {
    // Calculate overachievement scores
    const updatedPlayers = players.map(p => ({
      ...p,
      overachievement: p.tricks_won - p.target_tricks,
      overachievement_score: (p.overachievement_score || 0) + (p.tricks_won - p.target_tricks)
    }));

    // Check for winner (overachievement score >= 5)
    const winner = updatedPlayers.find(p => p.overachievement_score >= 5);

    if (winner) {
      toast({ title: `${winner.name} wins the game!`, description: `Overachievement score: ${winner.overachievement_score}` });
      await supabase
        .from('rooms')
        .update({ status: 'finished', dealing_phase: 'finished' })
        .eq('id', roomId);
      return;
    }

    // Save previous round results for card pull calculation
    const previousRoundResults: PreviousRoundResult[] = players.map(p => ({
      position: p.position,
      tricksWon: p.tricks_won,
      targetTricks: p.target_tricks
    }));

    // Rotate dealer position: the 5-trick player from this round becomes the new dealer
    // Since 5-trick player = (dealer + 1) % 3, new dealer = (dealer + 1) % 3
    const newDealerIndex = (gameState.dealer_index + 1) % 3;

    // Update all 3 players' overachievement scores sequentially
    for (const player of updatedPlayers) {
      await supabase
        .from('players')
        .update({ overachievement_score: player.overachievement_score })
        .eq('room_id', roomId)
        .eq('position', player.position);
    }

    // Update room state
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

  // ========== Card Pull Handlers ==========

  const handleSelectPullTarget = async (targetPosition: number) => {
    const cardPullState = gameState.card_pull_state as CardPullState | null;
    if (!cardPullState || cardPullState.phase !== 'selecting_target') {
      toast({ title: 'Invalid action', variant: 'destructive' });
      return;
    }

    // Verify this is the current puller
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

    // Update state to selecting_card phase
    const newState: CardPullState = {
      ...cardPullState,
      phase: 'selecting_card',
      selectedTarget: targetPosition
    };

    await supabase
      .from('rooms')
      .update({ card_pull_state: newState as any })
      .eq('id', roomId);
  };

  const handleSelectCardPosition = async (cardIndex: number) => {
    const cardPullState = gameState.card_pull_state as CardPullState | null;
    if (!cardPullState || cardPullState.phase !== 'selecting_card' || cardPullState.selectedTarget === null) {
      toast({ title: 'Invalid action', variant: 'destructive' });
      return;
    }

    // Verify this is the current puller
    const currentPuller = cardPullState.pullers[cardPullState.currentPullerIndex];
    if (myPosition !== currentPuller.position) {
      toast({ title: 'Not your turn to pull', variant: 'destructive' });
      return;
    }

    // Get target player's hand
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

    // Get the pulled card
    const pulledCard = targetHand[cardIndex];

    // Update state to returning_card phase with the revealed card
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
  };

  const handleReturnCard = async (returnCard: Card) => {
    const cardPullState = gameState.card_pull_state as CardPullState | null;
    if (!cardPullState || cardPullState.phase !== 'returning_card' || !cardPullState.pulledCard || cardPullState.selectedTarget === null) {
      toast({ title: 'Invalid action', variant: 'destructive' });
      return;
    }

    // Verify this is the current puller
    const currentPuller = cardPullState.pullers[cardPullState.currentPullerIndex];
    if (myPosition !== currentPuller.position) {
      toast({ title: 'Not your turn to pull', variant: 'destructive' });
      return;
    }

    // Validate return card
    const validation = canReturnCard(returnCard, cardPullState.pulledCard, hand);
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
    // Puller's new hand: remove returnCard, add pulledCard
    const pullerNewHand = hand.filter(c => !(c.suit === returnCard.suit && c.rank === returnCard.rank));
    pullerNewHand.push(cardPullState.pulledCard);

    // Target's new hand: remove pulledCard, add returnCard
    const targetHand = targetPlayer.hand as unknown as Card[];
    const targetNewHand = targetHand.filter(c => !(c.suit === cardPullState.pulledCard!.suit && c.rank === cardPullState.pulledCard!.rank));
    targetNewHand.push(returnCard);

    // Update local state immediately for responsiveness
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
      // Same puller has more pulls - reset to selecting_target
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
        // More pullers remain
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

    // Update puller's hand
    await supabase
      .from('players')
      .update({ hand: pullerNewHand as any })
      .eq('room_id', roomId)
      .eq('position', myPosition);

    // Update target's hand
    await supabase
      .from('players')
      .update({ hand: targetNewHand as any })
      .eq('room_id', roomId)
      .eq('position', cardPullState.selectedTarget);

    if (newState) {
      // Continue card pull phase
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
  };

  const handleStartNewRound = async () => {
    // Guard against double-starting new round
    if (gameState.status !== 'redistribution') {
      return;
    }

    setCurrentTrick([]);
    setSelectedTrump(null);

    // Refetch the latest room state to get the correct dealer_index
    // (handleRoundEnd updated it, but subscription may not have fired yet)
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

    // Deal first 5 cards for new round
    const deck = shuffle(createDeck());
    const firstFiveHands: Card[][] = [[], [], []];

    for (let i = 0; i < 5; i++) {
      for (let player = 0; player < 3; player++) {
        firstFiveHands[player].push(deck[i * 3 + player]);
      }
    }

    // Store remaining cards (15 cards: 3+2 per player to be dealt after trump selection)
    const remainingCards = deck.slice(15);

    // Update players sequentially
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

    // Update room state
    await supabase
      .from('rooms')
      .update({
        dealing_phase: 'trump_selection',
        status: 'dealing',
        trump_suit: null,
        remaining_cards: remainingCards as any,
        current_trick: [] as any,
        trump_led_at_start: null  // Reset for new round
      })
      .eq('id', roomId);
  };

  if (!gameState) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  const isDealer = myPosition === gameState.dealer_index;
  const isFiveTrickPlayer = myPosition === getFiveTrickPlayerPosition(gameState.dealer_index);
  const myPlayerData = players.find(p => p.position === myPosition);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">3-2-5 Game</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Round {gameState.round_number} • {isDealer ? '🎴 You are dealer' : `Dealer: Player ${gameState.dealer_index + 1}`}
            </p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg border border-border">
              <span className="text-sm font-mono text-card-foreground">
                {roomId}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  navigator.clipboard.writeText(roomId || '');
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                  toast({ title: 'Room ID copied to clipboard' });
                }}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Leave Game
            </Button>
          </div>
        </div>

        {/* Player Scores */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {players.map((player) => (
            <div 
              key={player.position}
              className={`p-4 rounded-lg border ${
                player.position === myPosition ? 'bg-primary/10 border-primary' : 'bg-card border-border'
              }`}
            >
              <div className={`font-semibold ${player.position === myPosition ? 'text-foreground' : 'text-card-foreground'}`}>
                {player.name}
              </div>
              <div className={`text-sm ${player.position === myPosition ? 'text-foreground/70' : 'text-card-foreground/70'}`}>
                Target: {player.target_tricks} • Won: {player.tricks_won}
              </div>
              <div className={`text-sm font-medium mt-1 ${player.position === myPosition ? 'text-foreground' : 'text-card-foreground'}`}>
                Score: {player.overachievement_score || 0}
              </div>
            </div>
          ))}
        </div>

        {gameState.status === 'waiting' && (
          <div className="text-center py-12">
            <p className="text-lg mb-4">
              Waiting for players... ({players.length}/3)
            </p>
            {players.length === 3 && (
              <Button onClick={handleStartGame} size="lg">
                Start Game
              </Button>
            )}
          </div>
        )}

        {gameState.dealing_phase === 'trump_selection' && isFiveTrickPlayer && (
          <div className="text-center py-12 space-y-4">
            <p className="text-lg">You are the 5-trick player. Look at your first 5 cards and select trump suit:</p>
            <div className="mb-4">
              <PlayerHand cards={hand} canPlay={false} />
            </div>
            <div className="flex gap-4 justify-center">
              <Select value={selectedTrump || undefined} onValueChange={(v) => setSelectedTrump(v as Suit)}>
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
              <Button onClick={handleSelectTrump} disabled={!selectedTrump}>
                Confirm Trump & Deal Remaining Cards
              </Button>
            </div>
          </div>
        )}

        {gameState.dealing_phase === 'trump_selection' && !isFiveTrickPlayer && (
          <div className="text-center py-12">
            <p className="text-lg">Waiting for 5-trick player to select trump suit...</p>
            <div className="mt-4">
              <PlayerHand cards={hand} canPlay={false} />
            </div>
          </div>
        )}

        {gameState.dealing_phase === 'dealing_3' && hand.length < 10 && (
          <div className="text-center py-12 space-y-4">
            <div className="bg-secondary px-6 py-3 rounded-lg border-2 border-primary inline-block mb-4">
              <div className="text-sm font-medium text-muted-foreground mb-1">Trump Suit</div>
              <div className="text-4xl">{gameState.trump_suit}</div>
            </div>
            <p className="text-lg">You now have {hand.length} cards.</p>
            <div className="mb-4">
              <PlayerHand cards={hand} canPlay={false} />
            </div>
            {isDealer ? (
              <Button onClick={handleDealFinalCards} size="lg">
                Deal Final 2 Cards
              </Button>
            ) : (
              <p className="text-muted-foreground">Waiting for dealer to deal final 2 cards...</p>
            )}
          </div>
        )}

        {gameState.dealing_phase === 'card_pull' && gameState.card_pull_state && (() => {
          const cardPullState = gameState.card_pull_state as CardPullState;
          const currentPuller = cardPullState.pullers[cardPullState.currentPullerIndex];
          const isMyTurn = myPosition === currentPuller?.position;
          const pullerName = players.find(p => p.position === currentPuller?.position)?.name || 'Unknown';
          const targetPlayer = players.find(p => p.position === cardPullState.selectedTarget);
          const validReturnCards = cardPullState.pulledCard ? getValidReturnCards(cardPullState.pulledCard, hand) : [];

          return (
            <div className="text-center py-8 space-y-6">
              {/* Trump display */}
              <div className="bg-secondary px-6 py-3 rounded-lg border-2 border-primary inline-block">
                <div className="text-sm font-medium text-muted-foreground mb-1">Trump Suit</div>
                <div className="text-4xl">{gameState.trump_suit}</div>
              </div>

              {/* Card Pull Header */}
              <div className="bg-amber-500/20 border border-amber-500 rounded-lg px-6 py-4 max-w-2xl mx-auto">
                <h2 className="text-xl font-bold text-amber-600 mb-2">Card Pull Phase</h2>
                <p className="text-sm text-muted-foreground">
                  {pullerName} has {currentPuller?.pullsRemaining} pull{currentPuller?.pullsRemaining !== 1 ? 's' : ''} remaining
                  (won {currentPuller?.extraTricks} extra trick{currentPuller?.extraTricks !== 1 ? 's' : ''} last round)
                </p>
              </div>

              {/* Phase: Selecting Target */}
              {cardPullState.phase === 'selecting_target' && (
                <div className="space-y-4">
                  {isMyTurn ? (
                    <>
                      <p className="text-lg font-medium">Select a player to pull a card from:</p>
                      <div className="flex gap-4 justify-center">
                        {cardPullState.underScorers.map(underScorer => {
                          const player = players.find(p => p.position === underScorer.position);
                          return (
                            <Button
                              key={underScorer.position}
                              onClick={() => handleSelectPullTarget(underScorer.position)}
                              variant="outline"
                              className="px-6 py-8 flex flex-col gap-2"
                            >
                              <span className="font-semibold">{player?.name}</span>
                              <span className="text-sm text-muted-foreground">Position {underScorer.position + 1}</span>
                            </Button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="text-lg text-muted-foreground">{pullerName} is selecting a player to pull from...</p>
                  )}
                </div>
              )}

              {/* Phase: Selecting Card */}
              {cardPullState.phase === 'selecting_card' && (
                <div className="space-y-4">
                  {isMyTurn ? (
                    <>
                      <p className="text-lg font-medium">Select a card from {targetPlayer?.name}'s hand:</p>
                      <div className="flex gap-2 justify-center flex-wrap">
                        {Array.from({ length: 10 }).map((_, index) => (
                          <button
                            key={index}
                            onClick={() => handleSelectCardPosition(index)}
                            className="w-16 h-24 bg-gradient-to-br from-blue-800 to-blue-950 rounded-lg border-2 border-blue-600 hover:border-amber-500 hover:scale-105 transition-all flex items-center justify-center shadow-lg cursor-pointer"
                          >
                            <span className="text-xs text-blue-300 font-mono">{index + 1}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-lg text-muted-foreground">
                        {pullerName} is selecting a card from {targetPlayer?.name}'s hand...
                      </p>
                      {myPosition === cardPullState.selectedTarget && (
                        <div className="mt-4">
                          <p className="text-sm text-amber-600 mb-2">Your cards (one will be pulled):</p>
                          <PlayerHand cards={hand} canPlay={false} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Phase: Returning Card */}
              {cardPullState.phase === 'returning_card' && cardPullState.pulledCard && (
                <div className="space-y-4">
                  {/* Show the pulled card to everyone */}
                  <div className="bg-card border rounded-lg p-4 max-w-md mx-auto">
                    <p className="text-sm text-muted-foreground mb-2">Card pulled from {targetPlayer?.name}:</p>
                    <div className="flex justify-center">
                      <div className={`w-20 h-28 rounded-lg border-2 flex items-center justify-center text-3xl font-bold shadow-lg ${
                        cardPullState.pulledCard.suit === '♥' || cardPullState.pulledCard.suit === '♦'
                          ? 'bg-white text-red-600 border-red-300'
                          : 'bg-white text-gray-900 border-gray-300'
                      }`}>
                        {cardPullState.pulledCard.rank}{cardPullState.pulledCard.suit}
                      </div>
                    </div>
                  </div>

                  {isMyTurn ? (
                    <>
                      <p className="text-lg font-medium">Select a card to return:</p>
                      <p className="text-sm text-muted-foreground">
                        You can return: the same card, a card of the same suit, or a different suit if you keep at least 2 of that suit
                      </p>
                      <div className="mt-4">
                        <PlayerHand
                          cards={hand}
                          canPlay={true}
                          onCardClick={handleReturnCard}
                          highlightCards={validReturnCards}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-lg text-muted-foreground">{pullerName} is selecting a card to return...</p>
                  )}
                </div>
              )}

              {/* Always show your hand at the bottom if not already shown */}
              {(cardPullState.phase !== 'returning_card' || !isMyTurn) && cardPullState.phase !== 'selecting_card' && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-2">Your Hand</h3>
                  <PlayerHand cards={hand} canPlay={false} />
                </div>
              )}
              {cardPullState.phase === 'selecting_card' && myPosition !== cardPullState.selectedTarget && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-2">Your Hand</h3>
                  <PlayerHand cards={hand} canPlay={false} />
                </div>
              )}
            </div>
          );
        })()}

        {gameState.status === 'playing' && (
          <>
            <GameBoard
              currentTrick={currentTrick}
              players={players}
              currentPlayerIndex={gameState.current_player_index}
              trump={gameState.trump_suit}
              myPosition={myPosition!}
            />

            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4 text-center">
                Your Hand {myPlayerData && `(${myPlayerData.tricks_won}/${myPlayerData.target_tricks} tricks)`}
              </h2>
              <PlayerHand
                cards={hand}
                onCardClick={handlePlayCard}
                canPlay={myPosition === gameState.current_player_index && currentTrick.length < 3}
              />
            </div>
          </>
        )}

        {gameState.status === 'redistribution' && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">Round {gameState.round_number - 1} Complete!</h2>
            <div className="space-y-2 mb-8">
              {players.map(p => {
                const diff = p.tricks_won - p.target_tricks;
                return (
                  <div key={p.position} className="text-lg">
                    {p.name}: {p.tricks_won}/{p.target_tricks} tricks
                    <span className={diff > 0 ? 'text-green-500 ml-2' : diff < 0 ? 'text-red-500 ml-2' : 'ml-2'}>
                      ({diff > 0 ? '+' : ''}{diff})
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Next round: {players.find(p => p.position === gameState.dealer_index)?.name} will be dealer (2 tricks)
            </p>
            <Button onClick={handleStartNewRound} size="lg">
              Start Round {gameState.round_number}
            </Button>
          </div>
        )}

        {gameState.status === 'finished' && (
          <div className="text-center py-12">
            <h2 className="text-3xl font-bold mb-4">Game Over!</h2>
            <div className="space-y-2">
              {players
                .sort((a, b) => (b.overachievement_score || 0) - (a.overachievement_score || 0))
                .map((player, index) => (
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
        )}
      </div>
    </div>
  );
};

export default Game;
