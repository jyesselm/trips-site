# trips-site

The public half of our trips site: a login screen and a viewer, and nothing
else. GitHub Pages serves this.

No trip content lives here, deliberately. The itineraries sit in a Supabase
table behind Row Level Security, and an unauthenticated visitor who views
source or curls this site gets an empty shell. The authoring copies live in
the private `trips` repo.

- `index.html` - the three screens: sign in, trip list, trip viewer
- `app.js` - auth, fetching, hash routing
- `config.js` - Supabase project URL and anon key, both public by design

`config.js` holding the anon key is not a leak. That key grants exactly what
RLS allows, which is nothing at all until someone on the allowlist signs in.

Setup lives in the private repo's `DEPLOY.md`.
