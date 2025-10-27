-- Create rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'dealing', 'playing', 'finished')),
  trump_suit TEXT CHECK (trump_suit IS NULL OR trump_suit IN ('♠', '♥', '♦', '♣')),
  dealer_index INTEGER DEFAULT 0,
  current_player_index INTEGER DEFAULT 0,
  current_round INTEGER DEFAULT 0
);

-- Create players table
CREATE TABLE IF NOT EXISTS public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 2),
  target_tricks INTEGER,
  tricks_won INTEGER DEFAULT 0,
  hand JSONB DEFAULT '[]'::jsonb,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, position)
);

-- Create tricks table to track each trick
CREATE TABLE IF NOT EXISTS public.tricks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  trick_number INTEGER NOT NULL,
  cards_played JSONB DEFAULT '[]'::jsonb,
  winner_position INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tricks ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow all operations for now (public game)
CREATE POLICY "Anyone can view rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can create rooms" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rooms" ON public.rooms FOR UPDATE USING (true);

CREATE POLICY "Anyone can view players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Anyone can join as player" ON public.players FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update players" ON public.players FOR UPDATE USING (true);

CREATE POLICY "Anyone can view tricks" ON public.tricks FOR SELECT USING (true);
CREATE POLICY "Anyone can create tricks" ON public.tricks FOR INSERT WITH CHECK (true);

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tricks;