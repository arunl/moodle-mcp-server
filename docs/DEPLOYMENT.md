# Deploying MCP Connector to Fly.io

This guide walks you through deploying mcpconnector.io to Fly.io with Turso database.

## Cost: $0/month (Free Tier)

| Service | Free Tier |
|---------|-----------|
| Fly.io | 3 VMs, 256MB RAM each |
| Turso | 9GB storage, 500M reads/month |
| GitHub Actions | Unlimited for public repos |

---

## Prerequisites

1. [Fly.io account](https://fly.io/app/sign-up) (free)
2. [Turso account](https://turso.tech) (free)
3. [Google Cloud Console](https://console.cloud.google.com) project
4. GitHub repository

---

## Step 1: Create Turso Database

```bash
# Install Turso CLI
# macOS
brew install tursodatabase/tap/turso

# Windows (via scoop)
scoop install turso

# Linux
curl -sSfL https://get.tur.so/install.sh | bash
```

```bash
# Login to Turso
turso auth login

# Create database
turso db create mcpconnector

# Get connection URL
turso db show mcpconnector --url
# Output: libsql://mcpconnector-yourname.turso.io

# Get auth token
turso db tokens create mcpconnector
# Output: eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
```

Save these values - you'll need them for Fly.io secrets.

---

## Step 2: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Web application**
6. Add authorized redirect URIs:
   - `https://mcpconnector.io/auth/google/callback`
   - `http://localhost:8080/auth/google/callback` (for dev)
7. Copy the **Client ID** and **Client Secret**

---

## Step 3: Deploy to Fly.io

```bash
# Install Fly CLI
# macOS
brew install flyctl

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Linux
curl -L https://fly.io/install.sh | sh
```

```bash
# Login to Fly
fly auth login

# Navigate to server directory
cd server

# Launch app (first time only)
fly launch --name mcpconnector --region dfw --no-deploy

# Set secrets
fly secrets set \
  DATABASE_URL="libsql://mcpconnector-yourname.turso.io" \
  DATABASE_AUTH_TOKEN="your-turso-token" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  GOOGLE_CLIENT_ID="your-google-client-id" \
  GOOGLE_CLIENT_SECRET="your-google-client-secret" \
  SERVER_URL="https://mcpconnector.io"

# Deploy
fly deploy
```

---

## Step 4: Configure Custom Domain

```bash
# Add your domain to Fly
fly certs add mcpconnector.io
fly certs add www.mcpconnector.io
```

### DNS Configuration at DreamHost

Add these DNS records for `mcpconnector.io`:

| Type | Name | Value |
|------|------|-------|
| A | @ | `66.241.124.xxx` (from `fly ips list`) |
| AAAA | @ | `2a09:8280:1::xxx` (from `fly ips list`) |
| CNAME | www | mcpconnector.fly.dev |

Get your IPs:
```bash
fly ips list
```

---

## Step 5: Set Up Auto-Deploy from GitHub

1. Get your Fly API token:
```bash
fly tokens create deploy -x 999999h
```

2. In your GitHub repo, go to **Settings** → **Secrets and variables** → **Actions**

3. Add secret:
   - Name: `FLY_API_TOKEN`
   - Value: (paste the token from step 1)

4. Push to `main` branch - it will auto-deploy!

---

## Step 6: Initialize Database

```bash
# Push schema to Turso
cd server
npm install
npm run db:push
```

---

## Verify Deployment

```bash
# Check app status
fly status

# View logs
fly logs

# Open in browser
fly open
```

Visit `https://mcpconnector.io` - you should see the landing page!

---

## Monitoring

```bash
# Real-time logs
fly logs -f

# Check metrics
fly dashboard
```

---

## Updating

Just push to GitHub:
```bash
git add .
git commit -m "Update feature"
git push origin main
```

GitHub Actions will automatically deploy to Fly.io.

---

## Troubleshooting

### "Connection refused" errors
```bash
fly status  # Check if app is running
fly logs    # Check for errors
```

### Database errors
```bash
# Verify Turso connection
turso db shell mcpconnector
.tables
```

### SSL certificate issues
```bash
fly certs check mcpconnector.io
```

---

## Scaling (When Needed)

```bash
# Scale up (still free for small instances)
fly scale count 2

# Upgrade machine size (costs money)
fly scale vm shared-cpu-1x --memory 512
```

---

## Removing Secrets from Git History

If you accidentally commit secrets (API keys, OAuth credentials, etc.) to git, GitHub's push protection will block the push. Here's how to remove them from history:

### When GitHub Blocks Your Push

You'll see an error like:
```
remote: error: GH013: Repository rule violations found
remote: - GITHUB PUSH PROTECTION
remote:   Push cannot contain secrets
```

### Option 1: Quick Fix (If You'll Rotate Credentials)

1. Click the GitHub-provided links to allow the push temporarily
2. Push your code
3. **Immediately rotate the credentials** in their source (Google Cloud Console, etc.)
4. Update Fly.io secrets with new credentials:
   ```bash
   fly secrets set GOOGLE_CLIENT_ID="new-id" GOOGLE_CLIENT_SECRET="new-secret"
   ```

### Option 2: Remove from Git History (Recommended)

This completely removes the file from all commits:

```bash
# 1. Stash any uncommitted changes
git stash --include-untracked

# 2. Remove the file from ALL commits in history
#    (set FILTER_BRANCH_SQUELCH_WARNING=1 to suppress warning)
# On Windows PowerShell:
$env:FILTER_BRANCH_SQUELCH_WARNING=1
git filter-branch --force --index-filter `
  "git rm --cached --ignore-unmatch <filename>" `
  --prune-empty --tag-name-filter cat -- --all

# On macOS/Linux:
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch <filename>" \
  --prune-empty --tag-name-filter cat -- --all

# 3. Force push to overwrite remote history
git push origin <branch> --force

# 4. Restore your stashed changes
git stash pop

# 5. Clean up the backup refs created by filter-branch
git for-each-ref --format="%(refname)" refs/original/ | xargs -n 1 git update-ref -d
```

### Preventing Future Accidents

1. **Add secrets to `.gitignore` BEFORE creating them:**
   ```gitignore
   # Secrets
   .env
   .env.*
   *.pem
   *-credentials.json
   start-dev-server.sh
   ```

2. **Use environment variables** instead of hardcoding secrets

3. **Use `.env.example`** with placeholder values for documentation

### Important Notes

- **`.gitignore` only prevents future tracking** - it doesn't remove already-committed files
- **Always rotate credentials** after they've been in git history (even if removed)
- **Force push rewrites history** - coordinate with team members if sharing the branch