CREATE TABLE IF NOT EXISTS brand_profiles.canvas_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_profile_id UUID NOT NULL REFERENCES brand_profiles.brand_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE brand_profiles.canvas_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view canvas rooms" ON brand_profiles.canvas_rooms
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM brand_profiles.permissions
            WHERE brand_profile_id = canvas_rooms.brand_profile_id
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Owners and admins can manage canvas rooms" ON brand_profiles.canvas_rooms
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM brand_profiles.permissions
            WHERE brand_profile_id = canvas_rooms.brand_profile_id
            AND user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

ALTER TABLE brand_profiles.canvas_sessions ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES brand_profiles.canvas_rooms(id) ON DELETE CASCADE;

DO $$
DECLARE
    session_rec RECORD;
    new_room_id UUID;
BEGIN
    FOR session_rec IN SELECT DISTINCT brand_profile_id FROM brand_profiles.canvas_sessions WHERE room_id IS NULL LOOP
        INSERT INTO brand_profiles.canvas_rooms (brand_profile_id, name)
        VALUES (session_rec.brand_profile_id, 'Main Workspace')
        RETURNING id INTO new_room_id;

        UPDATE brand_profiles.canvas_sessions
        SET room_id = new_room_id
        WHERE brand_profile_id = session_rec.brand_profile_id AND room_id IS NULL;
    END LOOP;
END $$;

ALTER TABLE brand_profiles.canvas_sessions DROP CONSTRAINT IF EXISTS canvas_sessions_pkey;
ALTER TABLE brand_profiles.canvas_sessions ADD PRIMARY KEY (brand_profile_id, room_id);

ALTER TABLE brand_profiles.canvas_sessions ALTER COLUMN room_id SET NOT NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE brand_profiles.canvas_rooms;
