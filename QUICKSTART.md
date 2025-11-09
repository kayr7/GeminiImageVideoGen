# Quick Start Guide
# Gemini Image & Video Generation Platform

Get up and running in 5 minutes!

---

## Prerequisites

- **Docker** (recommended) OR **Node.js 18+**
- **Google Gemini API Key** - Get one at https://ai.google.dev/

---

## Option 1: Docker (Recommended) ⚡

### Step 1: Set Your API Key
```bash
cd /Users/kayrottmann/Coding/GeminiImagVideoGen
echo "GEMINI_API_KEY=your_api_key_here" > .env
```

### Step 2: Start the Application
```bash
docker-compose up -d
```

### Step 3: Access the Application
Open your browser and go to:
```
http://localhost:3000/HdMImageVideo
```

That's it! 🎉

---

## Option 2: Node.js (Without Docker) 🚀

### Step 1: Install Dependencies
```bash
cd /Users/kayrottmann/Coding/GeminiImagVideoGen
npm install
```

### Step 2: Set Your API Key
```bash
echo "GEMINI_API_KEY=your_api_key_here" > .env
```

### Step 3: Start Development Server
```bash
npm run dev
```

### Step 4: Access the Application
Open your browser and go to:
```
http://localhost:3000/HdMImageVideo
```

---

## What You Can Do

### 🖼️ Generate Images
1. Click **Image** in the navigation
2. Enter a description like "A beautiful sunset over mountains"
3. Choose quality and aspect ratio
4. Click **Generate Image**
5. Download your creation!

### 🎬 Create Videos
1. Click **Video** in the navigation
2. Choose **Text-to-Video** or **Image-to-Video**
3. Describe the video or upload an image
4. Select duration and quality
5. Click **Generate Video** (takes 2-5 minutes)
6. Watch and download!

### 🎵 Compose Music
1. Click **Music** in the navigation
2. Describe the music (mood, genre, instruments)
3. Select duration
4. Click **Generate Music**
5. Listen and download!

---

## Understanding Usage Limits

The app shows your current usage at the top of the page:

- **Images**: 50 per hour, 200 per day (default)
- **Videos**: 3 per hour, 10 per day (default)
- **Music**: 10 per hour, 50 per day (default)

These limits protect you from unexpected costs!

---

## Adjusting Rate Limits

Edit your `.env` file:

```bash
# Increase or decrease as needed
IMAGE_MAX_PER_HOUR=100
VIDEO_MAX_PER_HOUR=5
MUSIC_MAX_PER_HOUR=20
```

Then restart:
```bash
docker-compose restart
# OR
npm run dev
```

---

## Troubleshooting

### "Cannot connect to server"
- Make sure the application is running
- Check that port 3000 is not in use
- Try: `docker-compose logs` to see errors

### "Invalid API key"
- Verify your API key in `.env` is correct
- Make sure there are no extra spaces
- Get a new key from https://ai.google.dev/

### "Rate limit exceeded"
- Wait for the hourly reset
- Or increase limits in `.env`

### "Image/Video/Music not generating"
- Check your internet connection
- Verify your Gemini API has quota
- Check the browser console for errors

---

## Example Prompts

### Images 🖼️
- "A cyberpunk city at night with neon lights"
- "A cute corgi puppy playing in a field"
- "Abstract art with vibrant colors and geometric shapes"
- "A professional headshot with soft lighting"

### Videos 🎬
- "A butterfly landing on a flower in slow motion"
- "Time-lapse of clouds moving across the sky"
- "A camera flying through a futuristic city"
- "Ocean waves crashing on a beach at sunset"

### Music 🎵
- "Upbeat electronic dance music with synthesizers"
- "Calm piano melody perfect for studying"
- "Epic orchestral soundtrack for a movie trailer"
- "Smooth jazz with saxophone and piano"

---

## Next Steps

1. **Explore the Features**: Try all three generators
2. **Read the Documentation**: Check `README.md` for more details
3. **Customize Settings**: Adjust rate limits and preferences
4. **Deploy to Production**: See `DEPLOYMENT.md` for instructions

---

## Need Help?

- **Documentation**: See `/docs` folder
- **Architecture**: Read `docs/ARCHITECTURE.md`
- **FAQ**: Check `scripts/prfaq.md`
- **Deployment**: See `DEPLOYMENT.md`

---

## Important Notes

⚠️ **Content is not saved**: Download anything you want to keep!

⚠️ **Video generation is slow**: It can take 2-5 minutes

⚠️ **API costs**: Monitor your Gemini API usage to control costs

⚠️ **Rate limits**: Protect you from unexpected charges

---

## Stopping the Application

### Docker:
```bash
docker-compose down
```

### Node.js:
Press `Ctrl+C` in the terminal

---

## Enjoy! 🎉

You're all set to start generating amazing content with Google Gemini AI!

For questions or issues, check the documentation or the comprehensive FAQ in `scripts/prfaq.md`.

---

**Version**: 1.0.0  
**Last Updated**: November 8, 2025

