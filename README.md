# עיתון אישי - התקציר הבוקר

Personal morning digest that scrapes Ynet news, learns your preferences based on reading behavior, and delivers one personalized summary link every morning.

## Features

- **Daily Ynet Scraping**: Automated scraping via Cloudflare Worker cron job (6am Israel time)
- **Machine Learning Preferences**: Tracks which articles you open and read
- **Personalized Ranking**: Articles ranked based on your reading history
- **Morning Digest Link**: Single personalized link delivered daily
- **Privacy-Focused**: All data stored in Cloudflare KV, no external tracking
- **Hebrew RTL Support**: Full right-to-left layout for Hebrew content
- **Mobile-First**: Clean, distraction-free reading experience

## Tech Stack

- **Cloudflare Workers**: Backend API and cron jobs
- **Cloudflare Pages**: Static frontend hosting
- **Cloudflare KV**: User preferences and reading history storage
- **Vanilla JavaScript**: No frameworks, pure JS
- **Ynet RSS/Scraping**: Hebrew news source

## Prerequisites

- Node.js 16+ and npm
- Cloudflare account (free tier works)
- Wrangler CLI installed globally: `npm install -g wrangler`
- Authenticated with Wrangler: `wrangler login`

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd personal-morning-digest
npm install
```

### 2. Create Cloudflare KV Namespaces

You need to create KV namespaces for storing user data, articles, and digests:

```bash
# Create production KV namespaces
wrangler kv:namespace create USERS
wrangler kv:namespace create ARTICLES
wrangler kv:namespace create DIGESTS

# Create preview (dev) KV namespaces
wrangler kv:namespace create USERS --preview
wrangler kv:namespace create ARTICLES --preview
wrangler kv:namespace create DIGESTS --preview
```

Wrangler will output namespace IDs like:
```
{ binding = "USERS", id = "abc123..." }
{ binding = "ARTICLES", id = "def456..." }
{ binding = "DIGESTS", id = "ghi789..." }
```

### 3. Update wrangler.toml

Open `worker/wrangler.toml` and replace the placeholder namespace IDs with your actual IDs from step 2:

```toml
[[kv_namespaces]]
binding = "USERS"
id = "your-production-users-namespace-id"
preview_id = "your-preview-users-namespace-id"

[[kv_namespaces]]
binding = "ARTICLES"
id = "your-production-articles-namespace-id"
preview_id = "your-preview-articles-namespace-id"

[[kv_namespaces]]
binding = "DIGESTS"
id = "your-production-digests-namespace-id"
preview_id = "your-preview-digests-namespace-id"
```

### 4. Configure Environment Variables

Create a `.dev.vars` file in the project root for local development:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set your secrets:

```
USER_ID_SALT=your-random-string-for-hashing-user-ids
DIGEST_LINK_SECRET=your-random-secret-for-digest-links
```

Generate random secrets:
```bash
# Generate random strings for secrets
openssl rand -hex 32
```

For production, set secrets using Wrangler:

```bash
wrangler secret put USER_ID_SALT
# Enter your random string when prompted

wrangler secret put DIGEST_LINK_SECRET
# Enter your random string when prompted
```

### 5. Deploy the Worker

Deploy to Cloudflare Workers:

```bash
cd worker
wrangler deploy
```

The worker will be deployed with:
- Cron trigger: Daily at 6:00 AM Israel time (4:00 AM UTC)
- API routes: `/api/*` for tracking and user management
- Digest routes: `/digest/:id` for personalized digests

### 6. Deploy the Frontend (Cloudflare Pages)

Option A: Connect GitHub repository to Cloudflare Pages (recommended)
1. Push your code to GitHub
2. Go to Cloudflare Dashboard → Pages
3. Create new project → Connect to Git
4. Select your repository
5. Build settings:
   - Build command: (leave empty - static files)
   - Build output directory: `/public`
6. Deploy

Option B: Direct deploy using Wrangler
```bash
wrangler pages deploy public --project-name=morning-digest
```

### 7. Configure Custom Domain (Optional)

In Cloudflare Dashboard:
1. Go to Workers & Pages → Your worker
2. Click "Triggers" tab
3. Add custom domain (e.g., `digest.yourdomain.com`)

Update `wrangler.toml` route if needed:
```toml
routes = [
  { pattern = "digest.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

## Development

### Local Development

Run the worker locally with live reload:

```bash
cd worker
wrangler dev
```

This starts a local server at `http://localhost:8787`

For the frontend, use any static server:

```bash
# Using Python
python -m http.server 8000 -d public

# Using Node.js http-server
npx http-server public -p 8000
```

Then visit `http://localhost:8000`

### Testing the Cron Job Manually

Trigger the cron job manually without waiting for scheduled time:

```bash
curl -X POST http://localhost:8787/__scheduled
```

Or in production:
```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/__scheduled \
  -H "X-Cron-Secret: your-secret-here"
```

### Inspecting KV Data

View stored data:

```bash
# List all keys in a namespace
wrangler kv:key list --binding=USERS

# Get specific key value
wrangler kv:key get "user:email@example.com" --binding=USERS

# Delete a key
wrangler kv:key delete "user:email@example.com" --binding=USERS
```

## Hebrew Text Handling Notes

### RTL Layout

All pages use `dir="rtl"` attribute for proper Hebrew text display:
- Text flows right-to-left
- UI elements (buttons, forms) are mirrored
- CSS uses logical properties (`inline-start`, `inline-end`)

### Encoding

- All files use UTF-8 encoding
- HTML includes `<meta charset="UTF-8">`
- Worker responses set `Content-Type: text/html; charset=utf-8`
- Ensure your editor saves files as UTF-8

### Text Processing

When scraping Ynet:
- Hebrew text is preserved as-is (UTF-8)
- Remove HTML tags but keep Hebrew characters
- Normalize whitespace while respecting Hebrew word boundaries
- Store as UTF-8 in KV (Cloudflare KV supports Unicode)

### Testing Hebrew Text

```javascript
// Test Hebrew text in Worker
const hebrewText = "שלום עולם";
console.log(hebrewText); // Should display correctly in logs

// Test in KV
await env.USERS.put("test", JSON.stringify({ name: "ישראל" }));
const data = await env.USERS.get("test", "json");
console.log(data.name); // Should output: ישראל
```

## Cron Schedule Configuration

The worker runs daily at 6:00 AM Israel time (4:00 AM UTC):

```toml
[triggers]
crons = ["0 4 * * *"]
```

### Adjusting Schedule

To change the time, modify the cron expression in `wrangler.toml`:

```toml
# Format: minute hour day month day-of-week
# Examples:
"0 4 * * *"   # 4:00 AM UTC (6:00 AM Israel, standard time)
"0 3 * * *"   # 3:00 AM UTC (5:00 AM Israel, standard time)
"0 5 * * *"   # 5:00 AM UTC (7:00 AM Israel, standard time)
"0 6 * * 1-5" # 6:00 AM UTC, Monday-Friday only
```

**Note**: Israel observes daylight saving time. The cron runs at UTC time, so:
- Standard time (winter): 4:00 AM UTC = 6:00 AM Israel
- Daylight time (summer): 4:00 AM UTC = 7:00 AM Israel

Consider using `"0 3 * * *"` (3:00 AM UTC) if you want consistent 6:00 AM delivery year-round.

### Verify Cron is Active

After deployment, check cron status:

```bash
wrangler tail
```

This shows live logs including cron executions.

## Privacy & Data Management

### User Data Storage

All user data is stored in Cloudflare KV:
- **USERS namespace**: User profiles, preferences, reading history
- **ARTICLES namespace**: Cached Ynet articles (expires after 7 days)
- **DIGESTS namespace**: Generated digest data (expires after 30 days)

### Data Retention

Configure TTL (time-to-live) in `worker/storage.js`:
- Articles: 7 days (604800 seconds)
- Digests: 30 days (2592000 seconds)
- User data: Never expires (manual deletion only)

### GDPR Compliance

To delete user data:

```bash
# Get user ID from email
wrangler kv:key get "user:email@example.com" --binding=USERS

# Delete user profile
wrangler kv:key delete "user:email@example.com" --binding=USERS

# Delete user history
wrangler kv:key delete "history:USER_ID" --binding=USERS

# Delete user preferences
wrangler kv:key delete "preferences:USER_ID" --binding=USERS
```

Or use the admin API (add to worker if needed).

## Respecting Ynet's Terms

### Rate Limiting

The scraper implements rate limiting:
- Maximum 1 request per second
- Delays between requests to avoid overwhelming servers
- Respects `robots.txt` (configured in `worker/scraper.js`)

### robots.txt Compliance

Check Ynet's robots.txt: `https://www.ynet.co.il/robots.txt`

Current implementation:
- Uses RSS feeds (publicly available)
- Does not scrape login-protected content
- Caches articles to minimize requests
- User-Agent string identifies the bot

### Best Practices

- Only scrape once per day (cron job)
- Cache articles in KV to avoid repeated requests
- Use RSS feeds when possible (less load on servers)
- Don't scrape during peak hours (6am is off-peak)
- Monitor for rate limiting responses (429 status)

## Troubleshooting

### Worker Not Deploying

```bash
# Check for syntax errors
wrangler deploy --dry-run

# View detailed logs
wrangler tail --format=pretty
```

### Cron Not Running

```bash
# Check cron configuration
wrangler deployments list

# Manually trigger to test
curl -X POST https://your-worker.workers.dev/__scheduled
```

### KV Data Not Persisting

```bash
# Verify namespace bindings
wrangler kv:namespace list

# Check if data is being written
wrangler kv:key list --binding=USERS --prefix="user:"
```

### Hebrew Text Not Displaying

- Verify UTF-8 encoding in editor
- Check browser DevTools for encoding errors
- Ensure HTML has `<meta charset="UTF-8">`
- Test with: `console.log("בדיקה")` should display correctly

### Articles Not Scraping

```bash
# Test scraper manually
wrangler dev

# In another terminal
curl http://localhost:8787/api/test-scrape
```

Check logs for:
- Network errors (timeout, DNS)
- Parsing errors (Ynet changed HTML structure)
- Rate limiting (429 responses)

## Project Structure

```
personal-morning-digest/
├── worker/
│   ├── index.js          # Main Worker entry point
│   ├── scraper.js        # Ynet scraping logic
│   ├── learning.js       # Preference learning algorithm
│   ├── digest.js         # Digest generation
│   ├── storage.js        # KV storage abstraction
│   └── wrangler.toml     # Worker configuration
├── public/
│   ├── index.html        # Landing page
│   ├── digest.html       # Digest reader
│   └── manifest.json     # PWA manifest
├── package.json
├── README.md
├── .gitignore
├── .env.example
└── .dev.vars.example
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## License

MIT License - feel free to use and modify for personal or commercial projects.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**בוקר טוב וקריאה נעימה!** 📰☕