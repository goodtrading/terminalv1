// Direct test without imports - just call the service directly
const https = require('https');
const http = require('http');

async function testDirectPush() {
  console.log('[DIRECT PUSH TEST] Starting...');
  
  try {
    // Get current mobile state from our API
    const mobileResponse = await fetch('http://localhost:5000/api/mobile/state');
    const mobileData = await mobileResponse.json();
    
    console.log('[DIRECT PUSH TEST] Mobile API data:', JSON.stringify(mobileData, null, 2));
    
    // Build Replit payload manually
    const payload = {
      marketState: {
        bias: mobileData.data?.bias?.type || "NEUTRAL",
        gamma: mobileData.data?.market?.gammaRegime === "LONG GAMMA" ? "LONG" : "NEUTRAL",
        zone: `$${Math.round(mobileData.data?.market?.gammaFlip || 0).toLocaleString()}`,
        scenario: "DIRECT_TEST",
        setup: "Direct push test",
        probability: 100,
        outlook: "TEST",
        timeframe: "TEST",
        gammaLevel: Math.round((mobileData.data?.market?.totalGex || 0) / 1000000),
        netGamma: `$${((mobileData.data?.market?.totalGex || 0) / 1000000000).toFixed(1)}B`
      },
      alerts: [{
        id: "direct-test-001",
        text: "Direct push test from terminal",
        status: "active",
        type: "scenario"
      }],
      zones: [{
        label: "DIRECT_TEST_ZONE",
        price: Math.round(mobileData.data?.market?.gammaFlip || 0).toString(),
        type: "resistance",
        distance: `${((mobileData.data?.market?.distanceToFlip || 0) / (mobileData.data?.market?.spot || 1) * 100).toFixed(1)}%`
      }]
    };
    
    console.log('[DIRECT PUSH TEST] Payload to send:', JSON.stringify(payload, null, 2));
    
    // Send to Replit
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: 'c813f257-1316-4114-9d3f-82ebf0011163-00-2vbfcbfkjn2ef.kirk.replit.dev',
      port: 443,
      path: '/api/terminal/push',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Terminal-Key': 'gt_9f2c1d7a4b6e8f1c3a5d9e2b7f4a6c1d'
      }
    };
    
    const req = https.request(options, (res) => {
      console.log(`[DIRECT PUSH TEST] Status: ${res.statusCode}`);
      console.log(`[DIRECT PUSH TEST] Headers:`, res.headers);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`[DIRECT PUSH TEST] Response: ${data}`);
      });
    });
    
    req.on('error', (e) => {
      console.error(`[DIRECT PUSH TEST] Error: ${e.message}`);
    });
    
    req.write(postData);
    req.end();
    
    console.log('[DIRECT PUSH TEST] Push sent');
    
  } catch (error) {
    console.error('[DIRECT PUSH TEST] Error:', error);
  }
}

testDirectPush();
