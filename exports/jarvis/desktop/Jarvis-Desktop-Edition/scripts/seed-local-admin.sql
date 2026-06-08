-- Seed the single local desktop super-admin.
-- Optional: GET /api/auth/me upserts this same row on first load. Running it up
-- front just guarantees the row exists before the first request.
INSERT INTO users (clerk_user_id, email, role)
VALUES ('local-admin', 'admin@localhost', 'super-admin')
ON CONFLICT (clerk_user_id) DO UPDATE SET role = 'super-admin';
