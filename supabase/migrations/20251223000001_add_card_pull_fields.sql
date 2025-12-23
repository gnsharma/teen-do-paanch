-- Add fields for card pull (extra trick adjustment) feature
-- previous_round_results stores each player's performance from the previous round
ALTER TABLE public.rooms
ADD COLUMN previous_round_results JSONB DEFAULT NULL;

-- card_pull_state tracks the current state of the card pull phase
ALTER TABLE public.rooms
ADD COLUMN card_pull_state JSONB DEFAULT NULL;

COMMENT ON COLUMN public.rooms.previous_round_results IS 'Previous round results for card pull calculation: [{position, tricksWon, targetTricks}]';
COMMENT ON COLUMN public.rooms.card_pull_state IS 'Card pull state machine: {pullers, underScorers, currentPullerIndex, phase, selectedTarget, pulledCard, pulledCardIndex}';
