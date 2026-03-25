<?php
// Simple API proxy to fetch tweets
header('Content-Type: application/json');

// Load configuration
$config = require 'config.php';
$bearer_token = $config['bearer_token'];

// Check if username is provided
if (!isset($_GET['username'])) {
    echo json_encode(['error' => 'Username is required']);
    exit;
}

$username = $_GET['username'];

// Mock data mode if no valid token is provided
if ($bearer_token === 'YOUR_BEARER_TOKEN_HERE' || empty($bearer_token)) {
    // Return mock data for demonstration purposes
    $mock_data = [
        'data' => [
            [
                'id' => '1234567890',
                'text' => "Hello Twitter! This is a mock tweet because no API key was provided. #mock #twitter",
                'created_at' => date('Y-m-d\TH:i:s\Z', strtotime('-1 hour'))
            ],
            [
                'id' => '1234567891',
                'text' => "Learning Three.js is fun! Check out this cool visualization.",
                'created_at' => date('Y-m-d\TH:i:s\Z', strtotime('-5 hours'))
            ],
            [
                'id' => '1234567892',
                'text' => "Just released a new update for my project. #coding #developer",
                'created_at' => date('Y-m-d\TH:i:s\Z', strtotime('-1 day'))
            ],
             [
                'id' => '1234567893',
                'text' => "PHP is still great for quick backend tasks. Don't believe the haters!",
                'created_at' => date('Y-m-d\TH:i:s\Z', strtotime('-2 days'))
            ]
        ],
        'meta' => [
            'result_count' => 4
        ]
    ];
    // Simulate network delay
    sleep(1);
    echo json_encode($mock_data);
    exit;
}

// Real API request
// 1. Get User ID from Username
$user_url = "https://api.twitter.com/2/users/by/username/$username";
$ch = curl_init($user_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer $bearer_token"
]);

$user_response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($http_code !== 200) {
    echo json_encode(['error' => 'Failed to fetch user', 'details' => json_decode($user_response)]);
    exit;
}

$user_data = json_decode($user_response, true);
if (!isset($user_data['data']['id'])) {
    echo json_encode(['error' => 'User not found']);
    exit;
}

$user_id = $user_data['data']['id'];

// 2. Get Tweets by User ID
$tweets_url = "https://api.twitter.com/2/users/$user_id/tweets?max_results=10&tweet.fields=created_at,public_metrics";
$ch = curl_init($tweets_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer $bearer_token"
]);

$tweets_response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($http_code !== 200) {
    echo json_encode(['error' => 'Failed to fetch tweets', 'details' => json_decode($tweets_response)]);
    exit;
}

echo $tweets_response;
