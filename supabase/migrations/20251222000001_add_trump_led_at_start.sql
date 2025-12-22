-- Add trump_led_at_start column to track if trump was led on the first trick of a round
ALTER TABLE public.rooms
ADD COLUMN trump_led_at_start BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.rooms.trump_led_at_start IS 'True if trump was led on the first trick of the round. If true, all subsequent trick leaders must lead trump if they have any.';
