import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Lobby } from '@/components/Lobby';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleCreateRoom = async (playerName: string) => {
    try {
      const { data: room, error } = await supabase
        .from('rooms')
        .insert({
          status: 'waiting',
          dealer_index: 0,
          current_player_index: 0,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('players').insert({
        room_id: room.id,
        name: playerName,
        position: 0,
      });

      localStorage.setItem('playerName', playerName);
      navigate(`/game/${room.id}`);
    } catch (error: any) {
      toast({
        title: 'Error creating room',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleJoinRoom = async (roomId: string, playerName: string) => {
    try {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        throw new Error('Room not found');
      }

      const { data: existingPlayers } = await supabase
        .from('players')
        .select('position')
        .eq('room_id', roomId);

      if (existingPlayers && existingPlayers.length >= 3) {
        throw new Error('Room is full');
      }

      const takenPositions = existingPlayers?.map(p => p.position) || [];
      const availablePosition = [0, 1, 2].find(pos => !takenPositions.includes(pos));

      await supabase.from('players').insert({
        room_id: roomId,
        name: playerName,
        position: availablePosition,
      });

      localStorage.setItem('playerName', playerName);
      navigate(`/game/${roomId}`);
    } catch (error: any) {
      toast({
        title: 'Error joining room',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return <Lobby onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />;
};

export default Index;
