import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PlayerHand } from '@/components/PlayerHand';
import { GameBoard } from '@/components/GameBoard';
import { Button } from '@/components/ui/button';
import { Card, shuffle, createDeck, evaluateTrick, isValidMove, getTargetTricks, getFiveTrickPlayerPosition, Suit } from '@/lib/gameLogic';
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

  // Debounce ref for preventing cascading reloads
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Debounced version to prevent cascading reloads from multiple subscription triggers
  const loadGameStateDebounced = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      loadGameState();
    }, 50);
  }, [loadGameState]);

  useEffect(() => {
    if (!roomId) {
      navigate('/');
      return;
    }

    loadGameState();

    // Cleanup debounce on unmount
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [roomId, loadGameState, navigate]);

  // Subscribe to realtime changes with debounced handler
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
        loadGameStateDebounced();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, () => {
        loadGameStateDebounced();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadGameStateDebounced]);

  const handleStartGame = async () => {
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

    // Parallelize all database updates
    await Promise.all([
      // Update all 3 players in parallel
      ...Array.from({ length: 3 }, (_, i) =>
        supabase
          .from('players')
          .update({
            hand: firstFiveHands[i] as any,
            target_tricks: getTargetTricks(i, gameState.dealer_index),
            tricks_won: 0
          })
          .eq('room_id', roomId)
          .eq('position', i)
      ),
      // Update room state
      supabase
        .from('rooms')
        .update({
          dealing_phase: 'trump_selection',
          status: 'dealing',
          remaining_cards: remainingCards as any
        })
        .eq('id', roomId)
    ]);
  };

  const handleSelectTrump = async () => {
    if (!selectedTrump) return;

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

    // Parallelize all database updates
    await Promise.all([
      // Update all 3 players with 8 cards each
      ...Array.from({ length: 3 }, (_, i) =>
        supabase
          .from('players')
          .update({ hand: hands[i] as any })
          .eq('room_id', roomId)
          .eq('position', i)
      ),
      // Transition to dealing_3 phase
      supabase
        .from('rooms')
        .update({
          trump_suit: selectedTrump,
          dealing_phase: 'dealing_3',
          remaining_cards: finalCards as any
        })
        .eq('id', roomId)
    ]);
  };

  const handleDealFinalCards = async () => {
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

    // Parallelize all database updates
    await Promise.all([
      // Update all 3 players with full 10 cards each
      ...Array.from({ length: 3 }, (_, i) =>
        supabase
          .from('players')
          .update({ hand: hands[i] as any })
          .eq('room_id', roomId)
          .eq('position', i)
      ),
      // Transition to playing phase
      supabase
        .from('rooms')
        .update({
          status: 'playing',
          dealing_phase: 'playing',
          current_player_index: firstTrickLeader,
          first_trick_leader: firstTrickLeader,
          remaining_cards: null
        })
        .eq('id', roomId)
    ]);
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

    const moveValidation = isValidMove(card, hand, currentTrick, gameState.trump_suit);
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

      // Parallelize all database operations for completed trick
      await Promise.all([
        // Update player's hand
        supabase
          .from('players')
          .update({ hand: newHand as any })
          .eq('room_id', roomId)
          .eq('position', myPosition),
        // Update winner's tricks count
        supabase
          .from('players')
          .update({ tricks_won: winner.tricks_won + 1 })
          .eq('room_id', roomId)
          .eq('position', winnerPosition),
        // Save trick to history (trick_number = 10 - cards remaining after this play)
        supabase.from('tricks').insert({
          room_id: roomId as string,
          round_number: gameState.round_number,
          trick_number: 10 - newHand.length,
          cards_played: newTrick as any,
          winner_position: winnerPosition,
        }),
        // Update room with completed trick and next player
        supabase
          .from('rooms')
          .update({
            current_trick: newTrick as any,
            current_player_index: winnerPosition
          })
          .eq('id', roomId)
      ]);

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
      // Trick not complete - parallelize hand update and room update
      await Promise.all([
        supabase
          .from('players')
          .update({ hand: newHand as any })
          .eq('room_id', roomId)
          .eq('position', myPosition),
        supabase
          .from('rooms')
          .update({
            current_trick: newTrick as any,
            current_player_index: (gameState.current_player_index + 1) % 3
          })
          .eq('id', roomId)
      ]);
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

    // Rotate dealer position: the 5-trick player from this round becomes the new dealer
    // Since 5-trick player = (dealer + 1) % 3, new dealer = (dealer + 1) % 3
    const newDealerIndex = (gameState.dealer_index + 1) % 3;

    // Parallelize all score updates and room update
    await Promise.all([
      // Update all 3 players' overachievement scores
      ...updatedPlayers.map(player =>
        supabase
          .from('players')
          .update({ overachievement_score: player.overachievement_score })
          .eq('room_id', roomId)
          .eq('position', player.position)
      ),
      // Update room state
      supabase
        .from('rooms')
        .update({
          dealer_index: newDealerIndex,
          round_number: gameState.round_number + 1,
          dealing_phase: 'redistribution',
          status: 'redistribution'
        })
        .eq('id', roomId)
    ]);
  };

  const handleStartNewRound = async () => {
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

    // Parallelize all database updates
    await Promise.all([
      // Update all 3 players in parallel
      ...Array.from({ length: 3 }, (_, i) =>
        supabase
          .from('players')
          .update({
            hand: firstFiveHands[i] as any,
            target_tricks: getTargetTricks(i, currentDealerIndex),
            tricks_won: 0
          })
          .eq('room_id', roomId)
          .eq('position', i)
      ),
      // Update room state
      supabase
        .from('rooms')
        .update({
          dealing_phase: 'trump_selection',
          status: 'dealing',
          trump_suit: null,
          remaining_cards: remainingCards as any,
          current_trick: [] as any
        })
        .eq('id', roomId)
    ]);
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

        {gameState.dealing_phase === 'dealing_3' && (
          <div className="text-center py-12 space-y-4">
            <div className="bg-secondary px-6 py-3 rounded-lg border-2 border-primary inline-block mb-4">
              <div className="text-sm font-medium text-muted-foreground mb-1">Trump Suit</div>
              <div className="text-4xl">{gameState.trump_suit}</div>
            </div>
            <p className="text-lg">3 more cards have been dealt. You now have 8 cards.</p>
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
