const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/mobile/state',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('=== MOBILE API RESPONSE ===');
    console.log(data);
    
    // Save to file for analysis
    require('fs').writeFileSync('mobile-response.json', data);
    console.log('\n=== RESPONSE SAVED TO mobile-response.json ===');
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.on('timeout', () => {
  console.error('Request timed out');
  req.destroy();
});

req.end();
