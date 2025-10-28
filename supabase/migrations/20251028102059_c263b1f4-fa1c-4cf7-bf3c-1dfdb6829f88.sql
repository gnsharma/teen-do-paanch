-- Add missing columns for proper 3-2-5 gameplay

-- Add overachievement score tracking to players
ALTER TABLE players 
ADD COLUMN overachievement_score integer DEFAULT 0;

-- Add dealing phase and first trick leader to rooms
ALTER TABLE rooms 
ADD COLUMN dealing_phase text DEFAULT 'waiting',
ADD COLUMN first_trick_leader integer DEFAULT NULL,
ADD COLUMN round_number integer DEFAULT 1;

-- Add comment for dealing_phase values
COMMENT ON COLUMN rooms.dealing_phase IS 'Values: waiting, first_five, trump_selection, second_five, playing, redistribution, round_complete';