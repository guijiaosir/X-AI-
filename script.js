// Three.js Background Animation
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Create particles with more variety
const geometry = new THREE.BufferGeometry();
const vertices = [];
const colors = [];
const colorObj = new THREE.Color();

for (let i = 0; i < 1500; i++) {
    vertices.push(
        (Math.random() - 0.5) * 2500,
        (Math.random() - 0.5) * 2500,
        (Math.random() - 0.5) * 2500
    );
    
    // Gradient colors: blue to cyan
    if (i % 2 === 0) {
        colorObj.setHex(0x1d9bf0); // Twitter Blue
    } else {
        colorObj.setHex(0x0a2635); // Dark Blue
    }
    colors.push(colorObj.r, colorObj.g, colorObj.b);
}

geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({ 
    vertexColors: true, 
    size: 2.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);

camera.position.z = 800;

// Mouse interaction
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;

window.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX - window.innerWidth / 2) * 0.5;
    mouseY = (event.clientY - window.innerHeight / 2) * 0.5;
});

function animate() {
    requestAnimationFrame(animate);
    
    targetX = mouseX * 0.05;
    targetY = mouseY * 0.05;

    particles.rotation.y += 0.0008;
    particles.rotation.x += 0.0004;

    // Gentle camera sway
    camera.position.x += (targetX - camera.position.x) * 0.02;
    camera.position.y += (-targetY - camera.position.y) * 0.02;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});


// Search Functionality
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModal = document.querySelector('.close-modal');
const addUserBtn = document.getElementById('add-user-btn');
const newUserInput = document.getElementById('new-user-input');
const userListContainer = document.getElementById('user-list');
const todayOnlyToggle = document.getElementById('today-only-toggle');
const fetchAllBtn = document.getElementById('fetch-all-btn');
const resultsContainer = document.getElementById('results-container');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('error-message');

// Modal Logic
settingsBtn.onclick = () => {
    settingsModal.classList.add('show');
    loadUsers();
}
closeModal.onclick = () => settingsModal.classList.remove('show');
window.onclick = (e) => {
    if (e.target == settingsModal) settingsModal.classList.remove('show');
}

// User Management
async function loadUsers() {
    const res = await fetch('/api/users');
    const data = await res.json();
    renderUserList(data.users);
}

function renderUserList(users) {
    userListContainer.innerHTML = '';
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <span>${user}</span>
            <button onclick="deleteUser('${user}')">Delete</button>
        `;
        userListContainer.appendChild(div);
    });
}

addUserBtn.onclick = async () => {
    const username = newUserInput.value.trim();
    if (!username) return;
    
    await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    
    newUserInput.value = '';
    loadUsers();
}

async function deleteUser(username) {
    if(!confirm(`Are you sure you want to delete ${username}?`)) return;
    await fetch(`/api/users/${username}`, { method: 'DELETE' });
    loadUsers();
}

// Fetch All Users - Sequential with real-time display
fetchAllBtn.onclick = async () => {
    resultsContainer.innerHTML = '';
    errorMessage.classList.add('hidden');

    try {
        const res = await fetch('/api/users');
        const { users } = await res.json();

        if (users.length === 0) {
            errorMessage.textContent = 'Please add users in settings first.';
            errorMessage.classList.remove('hidden');
            return;
        }

        // Create progress bar
        const progressDiv = document.createElement('div');
        progressDiv.className = 'progress-container';
        progressDiv.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" id="progress-fill"></div>
            </div>
            <div class="progress-text" id="progress-text">Preparing... (0/${users.length})</div>
        `;
        resultsContainer.appendChild(progressDiv);

        // Create container for tweets (will be sorted later)
        const tweetsContainer = document.createElement('div');
        tweetsContainer.id = 'tweets-buffer';
        tweetsContainer.style.display = 'none';
        resultsContainer.appendChild(tweetsContainer);

        let allTweets = [];
        let successCount = 0;
        let failCount = 0;

        // Fetch users sequentially for real-time feedback
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const progressFill = document.getElementById('progress-fill');
            const progressText = document.getElementById('progress-text');

            // Update progress
            const percent = Math.round(((i) / users.length) * 100);
            progressFill.style.width = `${percent}%`;
            progressText.textContent = `Fetching @${user} (${i + 1}/${users.length})`;

            try {
                const response = await fetch(`/api/tweets?username=${encodeURIComponent(user)}`);
                const data = await response.json();

                if (data.data && data.data.length > 0) {
                    const userTweets = data.data.map(t => ({...t, username: user}));

                    // Filter by Today if toggle is enabled
                    let tweetsToAdd = userTweets;
                    if (todayOnlyToggle.checked) {
                        const now = new Date();
                        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                        tweetsToAdd = userTweets.filter(tweet => {
                            const tweetDate = new Date(tweet.created_at).getTime();
                            return tweetDate >= startOfDay;
                        });
                    }

                    if (tweetsToAdd.length > 0) {
                        allTweets = allTweets.concat(tweetsToAdd);
                        successCount++;

                        // Update progress text with tweet count
                        progressText.innerHTML = `Fetching @${user} (${i + 1}/${users.length}) - <span style="color:#00ba7c">+${tweetsToAdd.length} tweets</span>`;
                    } else {
                        progressText.innerHTML = `Fetching @${user} (${i + 1}/${users.length}) - <span style="color:#8899a6">No tweets today</span>`;
                    }
                } else {
                        progressText.innerHTML = `Fetching @${user} (${i + 1}/${users.length}) - <span style="color:#8899a6">No data</span>`;
                }
            } catch (e) {
                console.error(`Failed to fetch ${user}:`, e);
                failCount++;
                progressText.innerHTML = `Fetching @${user} (${i + 1}/${users.length}) - <span style="color:#f4212e">Failed</span>`;
            }

            // Small delay to show progress
            await new Promise(r => setTimeout(r, 100));
        }

        // Update progress to 100%
        document.getElementById('progress-fill').style.width = '100%';

        // Remove progress bar after a short delay
        await new Promise(r => setTimeout(r, 500));
        progressDiv.remove();

        if (allTweets.length === 0) {
            errorMessage.innerHTML = todayOnlyToggle.checked
                ? `No updates today.<br><span style="color:#8899a6">Success: ${successCount}, Failed: ${failCount}</span>`
                : `No tweets found. Please check your network or try again later.<br><span style="color:#8899a6">Success: ${successCount}, Failed: ${failCount}</span>`;
            errorMessage.classList.remove('hidden');
            return;
        }

        // Sort by date: Newest first
        allTweets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Display summary
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'fetch-summary';
        summaryDiv.innerHTML = `Fetch complete: ${allTweets.length} tweets | Success: ${successCount} | Failed: ${failCount}`;
        resultsContainer.appendChild(summaryDiv);

        // Display tweets
        displayTweets(allTweets, true);

    } catch (err) {
        console.error(err);
        errorMessage.textContent = 'Failed to fetch user list: ' + err.message;
        errorMessage.classList.remove('hidden');
    }
};

async function fetchAndDisplayUserTweets(username) {
    // Deprecated in favor of fetchAllBtn logic, but kept for single user search compatibility
    // ... (rest of function if needed, or we can just redirect searchBtn to use similar logic)
}

function displayTweets(tweets, showUsername = false) {
    tweets.forEach(tweet => {
        const card = document.createElement('div');
        card.className = 'tweet-card';
        card.dataset.tweetId = tweet.id;

        const date = new Date(tweet.created_at).toLocaleString('en-US');

        // Handle images
        let mediaHtml = '';
        if (tweet.images && tweet.images.length > 0) {
            mediaHtml += '<div class="tweet-images">';
            tweet.images.forEach(img => {
                mediaHtml += `<img src="${img}" alt="Tweet Image" loading="lazy">`;
            });
            mediaHtml += '</div>';
        }

        // Handle videos
        if (tweet.videos && tweet.videos.length > 0) {
            mediaHtml += '<div class="tweet-videos">';
            tweet.videos.forEach(video => {
                mediaHtml += `
                    <video controls poster="${video.poster || ''}">
                        <source src="${video.url}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>`;
            });
            mediaHtml += '</div>';
        }

        // Handle stats
        let statsHtml = '';
        if (tweet.stats) {
            statsHtml = `
                <div class="tweet-stats">
                    <span>💬 ${tweet.stats.replies || 0}</span>
                    <span>🔁 ${tweet.stats.retweets || 0}</span>
                    <span>❤️ ${tweet.stats.likes || 0}</span>
                </div>
            `;
        }

        let userHeader = '';
        if (showUsername && tweet.username) {
            userHeader = `<div style="color: #1d9bf0; font-weight: bold; margin-bottom: 5px;">@${tweet.username}</div>`;
        }

        // Store tweet data as JSON attribute for push function
        const tweetDataJson = encodeURIComponent(JSON.stringify(tweet));

        card.innerHTML = `
            <div class="tweet-header">
                ${userHeader}
                <span class="tweet-date">${date}</span>
            </div>
            <div class="tweet-content">${formatTweetText(tweet.text)}</div>
            ${mediaHtml}
            ${statsHtml}
            <div class="tweet-actions">
                <button class="push-btn" onclick="pushMessage(this)" data-tweet='${tweetDataJson}'>Push to Client</button>
            </div>
        `;

        // Add animation delay
        card.style.opacity = 0;
        card.style.transform = 'translateY(20px)';
        resultsContainer.appendChild(card);

        // Trigger reflow
        card.offsetHeight;

        card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        card.style.opacity = 1;
        card.style.transform = 'translateY(0)';
    });
}

// Push message to client
async function pushMessage(btn) {
    const tweetData = JSON.parse(decodeURIComponent(btn.dataset.tweet));

    try {
        btn.disabled = true;
        btn.textContent = 'Pushing...';

        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: tweetData.id,
                username: tweetData.username,
                text: tweetData.text,
                images: tweetData.images,
                videos: tweetData.videos,
                stats: tweetData.stats,
                created_at: tweetData.created_at
            })
        });

        const result = await response.json();

        if (result.success) {
            btn.textContent = 'Pushed ✓';
            btn.classList.add('pushed');
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        console.error('Push failed:', err);
        btn.textContent = 'Push Failed';
        btn.disabled = false;
        setTimeout(() => {
            btn.textContent = 'Push to Client';
        }, 2000);
    }
}

function formatTweetText(text) {
    // Basic URL linking
    return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: #1d9bf0;">$1</a>');
}
