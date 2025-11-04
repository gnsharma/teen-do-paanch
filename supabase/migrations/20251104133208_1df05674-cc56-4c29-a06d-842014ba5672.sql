-- Add remaining_cards column to store cards for second dealing phase
ALTER TABLE public.rooms 
ADD COLUMN remaining_cards jsonb DEFAULT NULL;

COMMENT ON COLUMN public.rooms.remaining_cards IS 'Stores the remaining 15 cards after first 5-card deal, before trump selection';