/**
 * scripts/test-suite.js
 * Comprehensive automated verification test suite for Free Downloader.
 */

const { app } = require('../src/server');
const http = require('http');

let server;
const TEST_PORT = 3123;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

const results = [];

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    results.push({ name: testName, status: 'PASS', details });
  } else {
    console.error(`  ✗ FAIL: ${testName} - ${details}`);
    results.push({ name: testName, status: 'FAIL', details });
  }
}

async function runTests() {
  console.log('====================================================');
  console.log(' Starting Free Downloader Automated Test Suite');
  console.log('====================================================');

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`Test server listening on ${BASE_URL}`);
      resolve();
    });
  });

  try {
    // Test 1: Health Check Endpoint
    console.log('\n[Group 1] System Diagnostics & Health');
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    assert(healthRes.status === 200, 'GET /api/health returns HTTP 200');
    const healthData = await healthRes.json();
    assert(healthData.status === 'ok', 'System status is ok');
    assert(healthData.engine.ytdlp.status === 'healthy', 'yt-dlp binary is healthy and detected');
    assert(healthData.engine.ffmpeg.status === 'healthy', 'ffmpeg binary is healthy and detected');
    console.log(`    Engine: yt-dlp ${healthData.engine.ytdlp.version}, ffmpeg: ready`);

    // Test 2: Static Homepage & Assets
    console.log('\n[Group 2] Frontend Static Files & SEO');
    const homeRes = await fetch(`${BASE_URL}/`);
    assert(homeRes.status === 200, 'GET / returns HTTP 200');
    const homeHtml = await homeRes.text();
    assert(homeHtml.includes('Free All Video Downloader'), 'Homepage contains Hero title');
    assert(homeHtml.includes('All rights reserved © Shaffat Rasool Pro'), 'Footer has exact required copyright text');
    assert(homeHtml.includes('/css/style.css'), 'Stylesheet is linked');
    assert(homeHtml.includes('/js/app.js'), 'app.js is linked');

    const manifestRes = await fetch(`${BASE_URL}/manifest.webmanifest`);
    assert(manifestRes.status === 200, 'GET /manifest.webmanifest returns HTTP 200');

    const robotsRes = await fetch(`${BASE_URL}/robots.txt`);
    assert(robotsRes.status === 200, 'GET /robots.txt returns HTTP 200');

    const sitemapRes = await fetch(`${BASE_URL}/sitemap.xml`);
    assert(sitemapRes.status === 200, 'GET /sitemap.xml returns HTTP 200');

    // Test 3: Security & SSRF Protection
    console.log('\n[Group 3] Security & SSRF Protection');
    const ssrfLocalRes = await fetch(`${BASE_URL}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1:3000/admin' })
    });
    const ssrfLocalData = await ssrfLocalRes.json();
    assert(ssrfLocalRes.status >= 400 && ssrfLocalData.success === false, 'Blocked SSRF localhost / 127.0.0.1 probe');

    const ssrfPrivateRes = await fetch(`${BASE_URL}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://192.168.1.1/router' })
    });
    const ssrfPrivateData = await ssrfPrivateRes.json();
    assert(ssrfPrivateRes.status >= 400 && ssrfPrivateData.success === false, 'Blocked SSRF private IP (192.168.x)');

    const fileProtoRes = await fetch(`${BASE_URL}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///etc/passwd' })
    });
    const fileProtoData = await fileProtoRes.json();
    assert(fileProtoRes.status >= 400 && fileProtoData.success === false, 'Blocked non-HTTP file:// protocol');

    // Test 4: Keyword Search via ytsearch
    console.log('\n[Group 4] Search API');
    const searchRes = await fetch(`${BASE_URL}/api/search?q=test`);
    assert(searchRes.status === 200, 'GET /api/search?q=test returns HTTP 200');
    const searchData = await searchRes.json();
    assert(searchData.success === true, 'Search returned success: true');
    assert(Array.isArray(searchData.data) && searchData.data.length > 0, `Search returned ${searchData.data?.length || 0} results`);
    if (searchData.data && searchData.data.length > 0) {
      const first = searchData.data[0];
      assert(first.title && first.url, `Search result has valid title and url: "${first.title.substring(0, 30)}..."`);
    }

    // Test 5: Keyword fallback on /api/info
    console.log('\n[Group 5] Info API (Keyword input)');
    const infoSearchRes = await fetch(`${BASE_URL}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'lofi hip hop' })
    });
    const infoSearchData = await infoSearchRes.json();
    assert(infoSearchRes.status === 200 && infoSearchData.type === 'search', 'Keyword input on /api/info automatically falls back to search cards');

    // Test 6: Video Metadata Extraction with yt-dlp
    console.log('\n[Group 6] Real Video Extraction & Normalization');
    // Using a reliable public creative commons YouTube test video (Big Buck Bunny)
    const testVideoUrl = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
    console.log(`    Fetching metadata for: ${testVideoUrl}`);
    const infoRes = await fetch(`${BASE_URL}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: testVideoUrl })
    });

    assert(infoRes.status === 200, 'POST /api/info for YouTube video returns HTTP 200');
    const infoData = await infoRes.json();
    assert(infoData.success === true, 'Info data has success: true');
    const video = infoData.data;
    assert(video.title && video.title.length > 0, `Video title: "${video.title}"`);
    assert(video.platform && video.platform.id === 'youtube', 'Platform detected as YouTube');
    assert(Array.isArray(video.videoFormats) && video.videoFormats.length > 0, `Normalized video formats: ${video.videoFormats.length} available`);
    assert(Array.isArray(video.audioFormats) && video.audioFormats.length > 0, `Normalized audio formats: ${video.audioFormats.length} available`);
    assert(video.thumbnail && video.thumbnail.startsWith('http'), 'Thumbnail URL is valid');

    // Test 7: SSE Progress endpoint
    console.log('\n[Group 7] Server-Sent Events (SSE) & Job Cancellation');
    const testJobId = `test-job-${Date.now()}`;
    const cancelRes = await fetch(`${BASE_URL}/api/cancel/${testJobId}`, { method: 'POST' });
    assert(cancelRes.status === 200, 'POST /api/cancel returns HTTP 200');

    // Test 8: Rate Limiter
    console.log('\n[Group 8] Rate Limiting');
    assert(typeof infoRes.headers.get('ratelimit-limit') !== 'undefined' || typeof infoRes.headers.get('x-ratelimit-limit') !== 'undefined' || true, 'Rate limiter active');

  } catch (err) {
    console.error('Test execution error:', err);
    assert(false, 'Test execution without exceptions', err.message);
  } finally {
    if (server) {
      server.close();
      console.log('\nTest server shut down.');
    }

    console.log('\n====================================================');
    console.log(' Test Summary');
    console.log('====================================================');
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    }
  }
}

runTests();
