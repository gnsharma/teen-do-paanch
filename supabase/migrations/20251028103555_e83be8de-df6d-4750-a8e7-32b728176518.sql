-- Add current_trick to rooms table to track cards played in the current trick
ALTER TABLE public.rooms 
ADD COLUMN current_trick jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.rooms.current_trick IS 'Array of {position: number, card: Card} objects for the current trick in progress';