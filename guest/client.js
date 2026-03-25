// Three.js Background Animation
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Create particles with green theme
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

    // Gradient colors: green to teal
    if (i % 2 === 0) {
        colorObj.setHex(0x00ba7c); // Green
    } else {
        colorObj.setHex(0x0a2a1c); // Dark Green
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


// Client Functionality
const refreshBtn = document.getElementById('refresh-btn');
const messagesContainer = document.getElementById('messages-container');
const emptyState = document.getElementById('empty-state');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('error-message');
const messageCount = document.getElementById('message-count');

// Load messages
async function loadMessages() {
    loading.classList.remove('hidden');
    errorMessage.classList.add('hidden');

    try {
        const response = await fetch('/api/messages');
        const data = await response.json();

        messagesContainer.innerHTML = '';

        if (data.messages && data.messages.length > 0) {
            emptyState.classList.add('hidden');
            messageCount.textContent = `${data.messages.length} messages`;
            displayMessages(data.messages);
        } else {
            emptyState.classList.remove('hidden');
            messageCount.textContent = '0 messages';
        }
    } catch (err) {
        console.error('Failed to load messages:', err);
        errorMessage.textContent = 'Failed to load messages, please try again later';
        errorMessage.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
    }
}

function displayMessages(messages) {
    messages.forEach((message, index) => {
        const card = document.createElement('div');
        card.className = 'message-card';
        card.style.animationDelay = `${index * 0.1}s`;

        const date = new Date(message.created_at).toLocaleString('en-US');

        // Handle images
        let mediaHtml = '';
        if (message.images && message.images.length > 0) {
            mediaHtml += '<div class="message-images">';
            message.images.forEach(img => {
                mediaHtml += `<img src="${img}" alt="Image" loading="lazy">`;
            });
            mediaHtml += '</div>';
        }

        // Handle videos
        if (message.videos && message.videos.length > 0) {
            mediaHtml += '<div class="message-videos">';
            message.videos.forEach(video => {
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
        if (message.stats) {
            statsHtml = `
                <div class="message-stats">
                    <span>💬 ${message.stats.replies || 0}</span>
                    <span>🔁 ${message.stats.retweets || 0}</span>
                    <span>❤️ ${message.stats.likes || 0}</span>
                </div>
            `;
        }

        let userHeader = '';
        if (message.username) {
            userHeader = `<span class="message-username">@${message.username}</span>`;
        }

        card.innerHTML = `
            <div class="message-header">
                ${userHeader}
                <span class="message-date">${date}</span>
            </div>
            <div class="message-content">${formatMessageText(message.text)}</div>
            ${mediaHtml}
            ${statsHtml}
        `;

        messagesContainer.appendChild(card);
    });
}

function formatMessageText(text) {
    // Basic URL linking
    return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

// Refresh button
refreshBtn.onclick = () => {
    loadMessages();
};

// Auto-refresh every 30 seconds
setInterval(loadMessages, 30000);

// Initial load
loadMessages();
