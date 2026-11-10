/**
 * scripts/test-download.js
 * End-to-end media download & stream verification test.
 */

const { app } = require('../src/server');

const TEST_PORT = 3124;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function testDownload() {
  console.log('====================================================');
  console.log(' Testing End-to-End Download Stream');
  console.log('====================================================');

  const server = app.listen(TEST_PORT, '127.0.0.1');

  try {
    // 1. Thumbnail Download Test
    console.log('[Test 1] Thumbnail direct stream...');
    const thumbRes = await fetch(`${BASE_URL}/api/download?type=thumbnail&url=https://www.youtube.com/watch?v=aqz-KE-bpKQ&thumbUrl=https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg`);
    console.log(`    Status: ${thumbRes.status}`);
    console.log(`    Content-Type: ${thumbRes.headers.get('content-type')}`);
    console.log(`    Content-Disposition: ${thumbRes.headers.get('content-disposition')}`);
    const thumbBytes = await thumbRes.arrayBuffer();
    console.log(`    Bytes received: ${thumbBytes.byteLength}`);
    if (thumbRes.status === 200 && thumbBytes.byteLength > 1000) {
      console.log('    ✓ PASS: Thumbnail streamed successfully');
    } else {
      throw new Error('Thumbnail stream failed');
    }

    // 2. Audio Extraction & Transcoding to MP3 Test
    console.log('\n[Test 2] MP3 Audio Extraction & Transcoding...');
    const testJobId = `job-test-${Date.now()}`;
    const audioRes = await fetch(`${BASE_URL}/api/download?jobId=${testJobId}&url=https://www.youtube.com/watch?v=aqz-KE-bpKQ&type=audio&quality=128k&format=mp3&filename=BigBuckBunny_Test`);
    console.log(`    Status: ${audioRes.status}`);
    console.log(`    Content-Type: ${audioRes.headers.get('content-type')}`);
    console.log(`    Content-Disposition: ${audioRes.headers.get('content-disposition')}`);
    const audioBuf = await audioRes.arrayBuffer();
    console.log(`    Bytes received: ${audioBuf.byteLength} bytes (~${(audioBuf.byteLength / 1024 / 1024).toFixed(2)} MB)`);

    if (audioRes.status === 200 && audioBuf.byteLength > 100000) {
      console.log('    ✓ PASS: MP3 audio downloaded, converted, and streamed successfully!');
    } else {
      throw new Error(`MP3 stream failed with status ${audioRes.status}`);
    }

    console.log('\n🎉 ALL DOWNLOAD TESTS PASSED!');
    process.exit(0);
  } finally {
    server.close();
  }
}

testDownload().catch(err => {
  console.error('Download test error:', err);
  process.exit(1);
});
