# Google OAuth Setup Guide

This guide will walk you through creating a Google OAuth Client ID for your FrozenNuray application.

## Prerequisites
- A Google account (Gmail account works)
- Access to Google Cloud Console

---

## Step-by-Step Instructions

### Step 1: Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. If this is your first time, you may see a welcome screen - click "Get Started"

### Step 2: Create a New Project (or Select Existing)

1. **Click on the project dropdown** at the top of the page (it may show "Select a project" or an existing project name)
2. Click **"New Project"**
3. Fill in the project details:
   - **Project name**: `FrozenNuray` (or any name you prefer)
   - **Organization**: Leave as default (if you have one)
   - **Location**: Leave as default
4. Click **"Create"**
5. Wait a few seconds for the project to be created
6. **Select your new project** from the dropdown at the top

### Step 3: Enable Google+ API / Google Identity Services

**Note**: Google+ API is deprecated, but we need to enable the Google Identity Services API instead.

1. In the left sidebar, click **"APIs & Services"** → **"Library"**
2. In the search bar, type: **"Google Identity Services API"** or **"Google+ API"**
3. Click on **"Google Identity Services API"** (or Google+ API if that's what shows up)
4. Click the **"Enable"** button
5. Wait for it to enable (usually takes a few seconds)

**Alternative**: You can also search for "OAuth" and enable "Google OAuth2 API"

### Step 4: Configure OAuth Consent Screen

1. In the left sidebar, go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"External"** (unless you have a Google Workspace account, then you can use "Internal")
3. Click **"Create"**
4. Fill in the required information:
   - **App name**: `FrozenNuray` (or your app name)
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
5. Click **"Save and Continue"**
6. On the "Scopes" page, click **"Save and Continue"** (we'll add scopes later if needed)
7. On the "Test users" page, click **"Save and Continue"** (for development, you can add test users later)
8. Review and click **"Back to Dashboard"**

### Step 5: Create OAuth 2.0 Client ID

1. In the left sidebar, go to **"APIs & Services"** → **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"** from the dropdown
4. If you see a warning about OAuth consent screen, click **"Configure Consent Screen"** and complete Step 4 above, then come back

5. **Application type**: Select **"Web application"**
6. **Name**: Enter `FrozenNuray Web Client` (or any name)
7. **Authorized JavaScript origins**:
   - Click **"+ ADD URI"**
   - Add: `http://localhost:3000`
   - (For production, you'll add your production domain later)
8. **Authorized redirect URIs**:
   - Click **"+ ADD URI"**
   - Add: `http://localhost:3000` (or leave empty - @react-oauth/google handles this automatically)
   - **Note**: For OAuth 2.0 with @react-oauth/google, you might not need redirect URIs, but it's good to add them
9. Click **"Create"**

### Step 6: Copy Your Client ID

1. A popup will appear showing your credentials:
   - **Your Client ID**: This is what you need! (It looks like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`)
   - **Your Client Secret**: You don't need this for frontend OAuth
2. **Copy the Client ID** (click the copy icon or select and copy)
3. Click **"OK"**

---

## Step 7: Add Client ID to Your Project

### Option A: Using Terminal

1. Navigate to your frontend directory:
   ```bash
   cd /Users/apple/frozen-nuray/frontend-web
   ```

2. Create `.env.local` file (if it doesn't exist):
   ```bash
   touch .env.local
   ```

3. Add your Client ID:
   ```bash
   echo "NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id-here" >> .env.local
   ```
   
   **Replace `your-client-id-here` with your actual Client ID**

### Option B: Using a Text Editor

1. Open your project in a text editor (VS Code, etc.)
2. In the `frontend-web` folder, create a new file named `.env.local`
3. Add this line:
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id-here
   ```
4. Replace `your-client-id-here` with your actual Client ID from Step 6
5. Save the file

### Example `.env.local` file:
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
```

---

## Step 8: Restart Your Development Server

1. Stop your frontend server (if running) - Press `Ctrl+C` in the terminal
2. Start it again:
   ```bash
   cd /Users/apple/frozen-nuray/frontend-web
   npm run dev
   ```

3. The Google OAuth button should now work!

---

## Step 9: Test Google OAuth

1. Go to `http://localhost:3000/register` or `http://localhost:3000/login`
2. Click the **"Continue with Google"** button
3. You should see a Google sign-in popup
4. Sign in with your Google account
5. You should be redirected back and logged in!

---

## Troubleshooting

### Issue: "Error 400: redirect_uri_mismatch"
**Solution**: Make sure you added `http://localhost:3000` to both:
- Authorized JavaScript origins
- Authorized redirect URIs

### Issue: "OAuth consent screen not configured"
**Solution**: Complete Step 4 (Configure OAuth Consent Screen) above

### Issue: Button still shows "Not Configured"
**Solution**: 
1. Make sure `.env.local` file exists in `frontend-web/` folder
2. Make sure the variable name is exactly: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
3. Restart your dev server after adding the Client ID

### Issue: "This app isn't verified"
**Solution**: This is normal for development. Click "Advanced" → "Go to FrozenNuray (unsafe)" to continue. For production, you'll need to verify your app with Google.

---

## For Production Deployment

When you deploy to production:

1. Go back to Google Cloud Console → Credentials
2. Edit your OAuth Client ID
3. Add your production domain to:
   - **Authorized JavaScript origins**: `https://yourdomain.com`
   - **Authorized redirect URIs**: `https://yourdomain.com`
4. Update your production `.env` file with the same Client ID

---

## Security Notes

- **Never commit `.env.local` to Git** - it's already in `.gitignore`
- The Client ID is safe to expose in frontend code (it's public)
- The Client Secret (if you see it) should NEVER be exposed in frontend code
- For production, consider using environment variables in your hosting platform

---

## Quick Reference

- **Google Cloud Console**: https://console.cloud.google.com/
- **OAuth Consent Screen**: APIs & Services → OAuth consent screen
- **Credentials**: APIs & Services → Credentials
- **Your Client ID location**: Credentials → OAuth 2.0 Client IDs → Your Client Name

---

## Need Help?

If you encounter any issues:
1. Check that your Client ID is correct (no extra spaces)
2. Verify the `.env.local` file is in the correct location (`frontend-web/.env.local`)
3. Make sure you restarted the dev server after adding the Client ID
4. Check the browser console for any error messages

