const express = require('express');
const path = require('path');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');

chromium.use(stealth);

const app = express();
const port = 3000;

app.use(express.json());
// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// Nitter Instances (Prioritized list)
const NITTER_INSTANCES = [
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
    'https://xcancel.com',
    'https://nitter.lucabased.xyz',
    'https://nitter.moomoo.me',
    'https://nitter.freedit.eu',
];

// Helper to restore original Twitter image URLs from Nitter proxy
function restoreImageUrl(src) {
    if (!src) return null;
    try {
        // Decode URI if it looks encoded (like %2F)
        let decoded = decodeURIComponent(src);
        
        // Match pbs.twimg.com patterns in Nitter proxy URLs
        // Example: /pic/media%2FF... -> https://pbs.twimg.com/media/F...
        if (decoded.includes('/pic/media/')) {
            const mediaPart = decoded.split('/pic/media/')[1].split('?')[0];
            return `https://pbs.twimg.com/media/${mediaPart}?name=medium`;
        }
        
        if (decoded.includes('/pic/amplify_video_thumb/')) {
            const thumbPart = decoded.split('/pic/amplify_video_thumb/')[1].split('?')[0];
            return `https://pbs.twimg.com/amplify_video_thumb/${thumbPart}/img/K9C2TYCZ7HcfM56D.jpg?name=small`;
        }

        // Handle hex encoded URLs if any (found in some xcancel nodes)
        if (decoded.includes('/pic/enc/')) {
             // Hex decoding could be complex, for now we fallback to wsrv.nl proxy
        }

        return src;
    } catch (e) {
        return src;
    }
}

// Helper to proxy image via wsrv.nl to bypass CORS/ORB
function proxyUrl(url) {
    if (!url) return null;
    
    // For images, wsrv.nl is great
    if (url.startsWith('https://pbs.twimg.com') || url.includes('/pic/')) {
        return `https://wsrv.nl/?url=${encodeURIComponent(url)}&default=https://abs.twimg.com/errors/logo46x38.png`;
    }
    
    // For videos, wsrv.nl might not work well for streaming large files, but we can try a different approach or just use it for bypass.
    // However, wsrv.nl is primarily for images.
    // Twitter videos (video.twimg.com) often have strict CORS/Referer policies.
    // A better way for videos might be to use a different CORS proxy if available, or just try to force it.
    // Let's try to use 'corsproxy.io' or similar public proxy for videos if direct fails.
    // Or, actually, wsrv.nl does NOT support video proxying officially.
    
    // Let's try a different trick: Use a public CORS proxy for videos
    if (url.includes('video.twimg.com')) {
        return `https://corsproxy.io/?${encodeURIComponent(url)}`;
    }

    return url;
}
async function fetchDirect(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        const title = $('title').text();
        
        // Check for Cloudflare or error pages
        if (title.includes('Just a moment') || title.includes('Verifying your browser') || title.includes('Attention Required')) {
            return null;
        }
        
        if ($('.timeline').length > 0) {
            return response.data;
        }
        
        return null;
    } catch (error) {
        console.log(`Direct fetch failed: ${error.message}`);
        return null;
    }
}

// Helper to scrape tweets via Playwright (Robust fallback)
async function scrapeTweetsPlaywright(username) {
    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });

        let html = '';
        let success = false;
        let lastError = '';
        let successfulInstance = '';

        for (const instance of NITTER_INSTANCES) {
            try {
                const url = `${instance}/${username}`;
                console.log(`Trying instance: ${instance}`);
                
                // Try direct fetch first (it's much faster)
                const directHtml = await fetchDirect(url);
                if (directHtml) {
                    console.log(`Direct fetch successful on ${instance}`);
                    html = directHtml;
                    success = true;
                    successfulInstance = instance;
                    break;
                }

                // Fallback to Playwright for Cloudflare bypass
                console.log(`Direct fetch failed on ${instance}, trying Playwright...`);
                const page = await context.newPage();

                // Reduce timeout to 15s for faster failure
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

                // Wait for Cloudflare challenge if present
                const title = await page.title();
                if (title.includes('Just a moment') || title.includes('Verifying your browser')) {
                    console.log('Cloudflare challenge detected, waiting for completion...');
                    // Use a shorter timeout for the challenge
                    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
                }

                // Check for timeline
                try {
                    await page.waitForSelector('.timeline', { timeout: 8000 });
                    html = await page.content();
                    success = true;
                    successfulInstance = instance;
                    await page.close();
                    break;
                } catch (e) {
                    console.log(`Timeline not found on ${instance} after Playwright bypass attempt.`);
                    await page.close();
                }
            } catch (err) {
                console.error(`Error on ${instance}:`, err.message);
                lastError = err.message;
            }
        }

        if (!success) {
            throw new Error(`Failed to scrape from all instances. Last error: ${lastError}`);
        }

        const $ = cheerio.load(html);
        const tweets = [];

        $('.timeline-item').each((i, el) => {
            if ($(el).hasClass('show-more')) return;

            const $el = $(el);
            const id = $el.find('.tweet-link').attr('href')?.split('/').pop();
            const text = $el.find('.tweet-content').text().trim();
            const dateStr = $el.find('.tweet-date a').attr('title');
            let date;
            try {
                // Nitter dates are usually in "Feb 16, 2026 · 10:42 PM UTC" format
                // Ensure we parse it as UTC to avoid local timezone shifts
                let cleanDateStr = dateStr.replace('·', '').trim();
                // If it ends with UTC, Date.parse handles it well, but let's be explicit
                if (!cleanDateStr.endsWith('UTC') && !cleanDateStr.endsWith('GMT')) {
                     // Some instances might return local time or different format
                     // Just try standard parsing first
                }
                
                const parsedDate = new Date(cleanDateStr);
                
                // Check if date is valid
                if (isNaN(parsedDate.getTime())) {
                    throw new Error('Invalid date');
                }
                date = parsedDate.toISOString();
            } catch (e) {
                console.log(`Failed to parse date "${dateStr}", using current time.`);
                date = new Date().toISOString();
            }
            
            // Images & Videos
            const images = [];
            const videos = [];

            // Extract Images
            $el.find('.attachment.image img, .still-image img, .card-image img').each((j, img) => {
                let src = $(img).attr('src');
                if (src) {
                    // Normalize relative URL
                    if (!src.startsWith('http')) {
                        src = successfulInstance + (src.startsWith('/') ? '' : '/') + src;
                    }
                    
                    // Try to restore original URL and then proxy it
                    let originalUrl = restoreImageUrl(src);
                    let proxiedUrl = proxyUrl(originalUrl);
                    
                    if (proxiedUrl && !images.includes(proxiedUrl)) {
                        images.push(proxiedUrl);
                    }
                }
            });

            // Extract Videos
            $el.find('.video-container, .video-player').each((j, container) => {
                const $container = $(container);
                // Nitter videos are often proxied or inside iframe/video tags
                const $video = $container.find('video');
                let videoUrl = $video.find('source').attr('src') || $video.attr('src');
                let posterUrl = $video.attr('poster');

                // Fallback: check for data-url or other attributes
                if (!videoUrl) {
                    videoUrl = $container.attr('data-url') || $container.find('source').attr('data-src');
                }

                if (videoUrl) {
                    // Try to restore original Twitter video URL if it's a direct mp4 link
                    if (videoUrl.includes('video.twimg.com')) {
                        // Already original, proxy it
                        videoUrl = proxyUrl(videoUrl);
                    } else if (!videoUrl.startsWith('http')) {
                        videoUrl = successfulInstance + (videoUrl.startsWith('/') ? '' : '/') + videoUrl;
                    }
                    
                    if (posterUrl && !posterUrl.startsWith('http')) {
                        posterUrl = successfulInstance + (posterUrl.startsWith('/') ? '' : '/') + posterUrl;
                    }
                    
                    // Proxy poster too
                    if (posterUrl) {
                        posterUrl = proxyUrl(restoreImageUrl(posterUrl));
                    }

                    videos.push({
                        url: videoUrl,
                        poster: posterUrl
                    });
                }
            });

            // Stats
            const stats = {
                replies: parseInt($el.find('.icon-comment').parent().text().trim()) || 0,
                retweets: parseInt($el.find('.icon-retweet').parent().text().trim()) || 0,
                likes: parseInt($el.find('.icon-heart').parent().text().trim()) || 0,
            };

            if (id && text) {
                tweets.push({
                    id,
                    username, // Add username to tweet object for sorting display
                    text,
                    created_at: date,
                    images,
                    videos,
                    stats
                });
            }
        });

        return tweets;

    } catch (error) {
        console.error('Scraping failed:', error);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

// API Endpoints
const USERS_FILE = path.join(__dirname, 'users.json');

// Get all users
app.get('/api/users', (req, res) => {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }));
        }
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read users file' });
    }
});

// Add user
app.post('/api/users', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });
    
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }));
        }
        const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        
        if (!data.users.includes(username)) {
            data.users.push(username);
            fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
        }
        
        res.json({ success: true, users: data.users });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save user' });
    }
});

// Delete user
app.delete('/api/users/:username', (req, res) => {
    const { username } = req.params;
    try {
        if (!fs.existsSync(USERS_FILE)) return res.json({ users: [] });
        
        const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        data.users = data.users.filter(u => u !== username);
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
        
        res.json({ success: true, users: data.users });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Messages file for push notifications
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Get all messages (for client)
app.get('/api/messages', (req, res) => {
    try {
        if (!fs.existsSync(MESSAGES_FILE)) {
            fs.writeFileSync(MESSAGES_FILE, JSON.stringify({ messages: [] }));
        }
        const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read messages file' });
    }
});

// Push a message (from admin)
app.post('/api/messages', (req, res) => {
    const { id, username, text, images, videos, stats, created_at } = req.body;
    if (!id || !text) return res.status(400).json({ error: 'Message ID and text are required' });

    try {
        if (!fs.existsSync(MESSAGES_FILE)) {
            fs.writeFileSync(MESSAGES_FILE, JSON.stringify({ messages: [] }));
        }
        const data = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));

        // Check if message already exists
        if (!data.messages.find(m => m.id === id)) {
            const message = {
                id,
                username: username || '',
                text,
                images: images || [],
                videos: videos || [],
                stats: stats || { replies: 0, retweets: 0, likes: 0 },
                created_at: created_at || new Date().toISOString(),
                pushed_at: new Date().toISOString()
            };
            data.messages.unshift(message); // Add to beginning
            fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2));
        }

        res.json({ success: true, messages: data.messages });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save message' });
    }
});

// Delete a message
app.delete('/api/messages/:id', (req, res) => {
    const { id } = req.params;
    try {
        if (!fs.existsSync(MESSAGES_FILE)) return res.json({ messages: [] });

        const data = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
        data.messages = data.messages.filter(m => m.id !== id);
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2));

        res.json({ success: true, messages: data.messages });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Clear all messages
app.delete('/api/messages', (req, res) => {
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify({ messages: [] }));
        res.json({ success: true, messages: [] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear messages' });
    }
});

app.get('/api/tweets', async (req, res) => {
    const username = req.query.username;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        console.log(`Fetching tweets for ${username}...`);
        const tweets = await scrapeTweetsPlaywright(username);
        
        if (tweets.length === 0) {
             return res.json({ data: [] });
        }

        res.json({ data: tweets });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Failed to fetch tweets: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
