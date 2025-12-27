-- ============================================================================
-- 3-2-5 (Teen Do Paanch) Database Schema
-- ============================================================================
--
-- This is the complete schema for the 3-2-5 card game.
-- Uses the 'api' schema (exposed via PostgREST config).
--
-- TABLES:
-- - api.rooms: Game rooms with game state
-- - api.players: Players in each room with their hands and scores
-- - api.tricks: History of tricks played (for reference/replay)
--
-- ============================================================================

-- Create the api schema
CREATE SCHEMA IF NOT EXISTS api;

-- ============================================================================
-- ROOMS TABLE
-- ============================================================================
-- Stores game state for each room/game session

CREATE TABLE IF NOT EXISTS api.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Game status
  status TEXT DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'dealing', 'playing', 'redistribution', 'finished')),

  -- Dealing phase within 'dealing' status
  -- Values: trump_selection, dealing_3, card_pull, playing, finished, redistribution
  dealing_phase TEXT DEFAULT 'waiting',

  -- Trump suit for the current round
  trump_suit TEXT CHECK (trump_suit IS NULL OR trump_suit IN ('♠', '♥', '♦', '♣')),

  -- Player positions (0, 1, 2)
  dealer_index INTEGER DEFAULT 0,
  current_player_index INTEGER DEFAULT 0,
  first_trick_leader INTEGER DEFAULT NULL,

  -- Round tracking
  round_number INTEGER DEFAULT 1,

  -- Current trick in progress: [{position: number, card: {suit, rank}}]
  current_trick JSONB DEFAULT '[]'::jsonb,

  -- Remaining cards to deal (between dealing phases)
  remaining_cards JSONB DEFAULT NULL,

  -- Trump leading rule: true if trump was led on first trick of round
  -- If true: must lead trump on later tricks (if you have any)
  -- If false: cannot lead trump (unless you only have trump)
  trump_led_at_start BOOLEAN DEFAULT NULL,

  -- Card pull (extra trick adjustment) state
  -- Previous round results: [{position, tricksWon, targetTricks}]
  previous_round_results JSONB DEFAULT NULL,
  -- Card pull state machine: {pullers, underScorers, currentPullerIndex, phase, selectedTarget, pulledCard, pulledCardIndex}
  card_pull_state JSONB DEFAULT NULL
);

-- ============================================================================
-- PLAYERS TABLE
-- ============================================================================
-- Stores player information and their hand/score for each game

CREATE TABLE IF NOT EXISTS api.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES api.rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 2),

  -- Current round targets and progress
  target_tricks INTEGER,        -- 2, 3, or 5 depending on position relative to dealer
  tricks_won INTEGER DEFAULT 0,

  -- Current hand: [{suit: '♠'|'♥'|'♦'|'♣', rank: 'A'|'K'|...|'7'}]
  hand JSONB DEFAULT '[]'::jsonb,

  -- Cumulative game score (first to +5 wins)
  overachievement_score INTEGER DEFAULT 0,

  joined_at TIMESTAMPTZ DEFAULT now(),

  -- One player per position per room
  UNIQUE(room_id, position)
);

-- ============================================================================
-- TRICKS TABLE
-- ============================================================================
-- Historical record of all tricks played (for reference/replay)

CREATE TABLE IF NOT EXISTS api.tricks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES api.rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  trick_number INTEGER NOT NULL,  -- 1-10 within a round
  cards_played JSONB DEFAULT '[]'::jsonb,  -- [{position, card}]
  winner_position INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Public game - allow all operations for now

ALTER TABLE api.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE api.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE api.tricks ENABLE ROW LEVEL SECURITY;

-- Rooms policies
CREATE POLICY "Anyone can view rooms" ON api.rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can create rooms" ON api.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update rooms" ON api.rooms FOR UPDATE USING (true);

-- Players policies
CREATE POLICY "Anyone can view players" ON api.players FOR SELECT USING (true);
CREATE POLICY "Anyone can join as player" ON api.players FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update players" ON api.players FOR UPDATE USING (true);

-- Tricks policies
CREATE POLICY "Anyone can view tricks" ON api.tricks FOR SELECT USING (true);
CREATE POLICY "Anyone can create tricks" ON api.tricks FOR INSERT WITH CHECK (true);

-- ============================================================================
-- REALTIME
-- ============================================================================
-- Enable realtime subscriptions for live game updates

ALTER PUBLICATION supabase_realtime ADD TABLE api.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE api.players;
ALTER PUBLICATION supabase_realtime ADD TABLE api.tricks;

-- ============================================================================
-- GRANT ACCESS TO API ROLES
-- ============================================================================
-- Allow the API roles to access the api schema

GRANT USAGE ON SCHEMA api TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA api TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA api TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA api TO anon, authenticated, service_role;

-- For future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA api GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA api GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA api GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
