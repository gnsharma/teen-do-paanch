import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/lib/gameLogic';

// ============================================================================
// TYPES
// ============================================================================

export interface Player {
  position: number;
  name: string;
  hand: Card[];
  tricks_won: number;
  target_tricks: number;
  overachievement_score: number;
}

export interface GameState {
  id: string;
  status: 'waiting' | 'dealing' | 'playing' | 'redistribution' | 'finished';
  dealing_phase: 'trump_selection' | 'dealing_3' | 'card_pull' | 'playing' | 'finished' | 'redistribution';
  dealer_index: number;
  current_player_index: number;
  first_trick_leader: number;
  trump_suit: string | null;
  trump_led_at_start: boolean | null;
  round_number: number;
  current_trick: Array<{ position: number; card: Card }>;
  remaining_cards: Card[] | null;
  previous_round_results: any;
  card_pull_state: any;
}

export interface UseGameStateReturn {
  gameState: GameState | null;
  players: Player[];
  hand: Card[];
  myPosition: number | null;
  currentTrick: Array<{ position: number; card: Card }>;
  isLoading: boolean;
  setHand: React.Dispatch<React.SetStateAction<Card[]>>;
  setCurrentTrick: React.Dispatch<React.SetStateAction<Array<{ position: number; card: Card }>>>;
  loadGameState: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Manages game state loading and real-time subscriptions.
 *
 * Responsibilities:
 * - Loads initial game state from Supabase
 * - Subscribes to real-time updates for rooms and players
 * - Provides current player's position and hand
 * - Cleans up subscriptions on unmount
 */
export function useGameState(roomId: string | undefined): UseGameStateReturn {
  const navigate = useNavigate();
  const [playerName] = useState(() => localStorage.getItem('playerName') || 'Player');
  const [myPosition, setMyPosition] = useState<number | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentTrick, setCurrentTrick] = useState<Array<{ position: number; card: Card }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ----------------------------------------
  // Load game state from database
  // ----------------------------------------
  const loadGameState = useCallback(async () => {
    if (!roomId) return;

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
      setGameState(room as unknown as GameState);
      if (Array.isArray(room.current_trick)) {
        setCurrentTrick(room.current_trick as unknown as Array<{ position: number; card: Card }>);
      }
    }

    if (playersData) {
      setPlayers(playersData as unknown as Player[]);
      const myPlayer = playersData.find(p => p.name === playerName);
      if (myPlayer) {
        setMyPosition(myPlayer.position);
        if (Array.isArray(myPlayer.hand)) {
          setHand(myPlayer.hand as unknown as Card[]);
        }
      }
    }

    setIsLoading(false);
  }, [roomId, playerName]);

  // ----------------------------------------
  // Redirect if no roomId
  // ----------------------------------------
  useEffect(() => {
    if (!roomId) {
      navigate('/');
      return;
    }
    loadGameState();
  }, [roomId, loadGameState, navigate]);

  // ----------------------------------------
  // Subscribe to real-time changes
  // ----------------------------------------
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => loadGameState()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => loadGameState()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadGameState]);

  return {
    gameState,
    players,
    hand,
    myPosition,
    currentTrick,
    isLoading,
    setHand,
    setCurrentTrick,
    loadGameState
  };
}
