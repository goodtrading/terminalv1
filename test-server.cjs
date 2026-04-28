const http = require('http');

// Test if server is running
const testServer = () => {
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/mobile/state',
    method: 'GET',
    timeout: 3000
  };

  const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('=== SERVER IS RUNNING - MOBILE API RESPONSE ===');
      console.log(data);
      console.log('=== END RESPONSE ===');
      process.exit(0);
    });
  });

  req.on('error', (e) => {
    console.error('=== SERVER NOT RUNNING ===');
    console.error(`Error: ${e.message}`);
    console.log('Please start the server with: npm run dev');
    process.exit(1);
  });

  req.on('timeout', () => {
    console.error('Request timed out');
    req.destroy();
    process.exit(1);
  });

  req.end();
};

testServer();
