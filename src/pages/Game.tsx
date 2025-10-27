import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PlayerHand } from '@/components/PlayerHand';
import { GameBoard } from '@/components/GameBoard';
import { Button } from '@/components/ui/button';
import { Card, dealCards, evaluateTrick, isValidMove, getTargetTricks, Suit } from '@/lib/gameLogic';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

  useEffect(() => {
    if (!roomId) {
      navigate('/');
      return;
    }

    loadGameState();
    subscribeToChanges();
  }, [roomId]);

  const loadGameState = async () => {
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

    if (room) setGameState(room);
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
  };

  const subscribeToChanges = () => {
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
  };

  const handleStartGame = async () => {
    if (players.length !== 3) {
      toast({ title: 'Need 3 players to start', variant: 'destructive' });
      return;
    }

    const hands = dealCards();
    
    for (let i = 0; i < 3; i++) {
      await supabase
        .from('players')
        .update({ 
          hand: hands[i] as any,
          target_tricks: getTargetTricks(i, gameState.dealer_index)
        })
        .eq('room_id', roomId)
        .eq('position', i);
    }

    await supabase
      .from('rooms')
      .update({ status: 'dealing' })
      .eq('id', roomId);
  };

  const handleSelectTrump = async () => {
    if (!selectedTrump) return;

    await supabase
      .from('rooms')
      .update({ 
        trump_suit: selectedTrump,
        status: 'playing'
      })
      .eq('id', roomId);
  };

  const handlePlayCard = async (card: Card) => {
    if (myPosition !== gameState?.current_player_index) {
      toast({ title: 'Not your turn', variant: 'destructive' });
      return;
    }

    if (!isValidMove(card, hand, currentTrick)) {
      toast({ title: 'Invalid move - must follow suit', variant: 'destructive' });
      return;
    }

    const newTrick = [...currentTrick, { position: myPosition, card }];
    setCurrentTrick(newTrick);
    setHand(hand.filter(c => !(c.suit === card.suit && c.rank === card.rank)));

    // Update player hand
    const newHand = hand.filter(c => !(c.suit === card.suit && c.rank === card.rank));
    await supabase
      .from('players')
      .update({ hand: newHand as any })
      .eq('room_id', roomId)
      .eq('position', myPosition);

    if (newTrick.length === 3) {
      // Evaluate trick
      const winnerPosition = evaluateTrick(newTrick, gameState.trump_suit);
      
      // Update winner's tricks
      await supabase
        .from('players')
        .update({ tricks_won: players[winnerPosition].tricks_won + 1 })
        .eq('room_id', roomId)
        .eq('position', winnerPosition);

      // Save trick to history
      await supabase.from('tricks').insert({
        room_id: roomId as string,
        round_number: gameState.current_round,
        trick_number: newTrick.length,
        cards_played: newTrick as any,
        winner_position: winnerPosition,
      });

      setTimeout(() => {
        setCurrentTrick([]);
      }, 2000);

      // Update current player
      await supabase
        .from('rooms')
        .update({ current_player_index: winnerPosition })
        .eq('id', roomId);
    } else {
      // Next player
      await supabase
        .from('rooms')
        .update({ current_player_index: (gameState.current_player_index + 1) % 3 })
        .eq('id', roomId);
    }
  };

  if (!gameState) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">3-2-5 Game</h1>
          <div className="flex gap-4 items-center">
            <div className="text-sm text-muted-foreground">
              Room: {roomId?.slice(0, 8)}...
            </div>
            <Button variant="outline" onClick={() => navigate('/')}>
              Leave Game
            </Button>
          </div>
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

        {gameState.status === 'dealing' && myPosition === gameState.dealer_index && !gameState.trump_suit && (
          <div className="text-center py-12 space-y-4">
            <p className="text-lg">You are the dealer. Select trump suit:</p>
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
                Confirm Trump
              </Button>
            </div>
          </div>
        )}

        {(gameState.status === 'playing' || gameState.trump_suit) && (
          <>
            <GameBoard
              currentTrick={currentTrick}
              players={players}
              currentPlayerIndex={gameState.current_player_index}
              trump={gameState.trump_suit}
              myPosition={myPosition!}
            />

            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4 text-center">Your Hand</h2>
              <PlayerHand
                cards={hand}
                onCardClick={handlePlayCard}
                canPlay={myPosition === gameState.current_player_index && gameState.status === 'playing'}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Game;
