const http = require('http');
const fs = require('fs');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/mobile/state',
  method: 'GET'
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
    fs.writeFileSync('mobile-response.json', data);
    console.log('\n=== RESPONSE SAVED TO mobile-response.json ===');
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
