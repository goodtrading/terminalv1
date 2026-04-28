const { spawn } = require('child_process');
const http = require('http');

console.log('Starting server...');

// Start the server
const server = spawn('npm', ['run', 'dev'], {
  stdio: 'pipe',
  shell: true
});

let serverOutput = '';
server.stdout.on('data', (data) => {
  serverOutput += data.toString();
  console.log('Server:', data.toString().trim());
  
  // Try to get mobile response when server is ready
  if (serverOutput.includes('Server running') || serverOutput.includes('listening')) {
    console.log('Server appears to be ready, testing mobile endpoint...');
    
    setTimeout(() => {
      testMobileEndpoint();
    }, 2000);
  }
});

server.stderr.on('data', (data) => {
  console.error('Server Error:', data.toString().trim());
});

function testMobileEndpoint() {
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
      console.log('\n=== MOBILE API RESPONSE ===');
      console.log(data);
      console.log('=== END RESPONSE ===');
      
      // Save response
      require('fs').writeFileSync('mobile-response.json', data);
      console.log('\nResponse saved to mobile-response.json');
      
      // Kill server
      server.kill();
      process.exit(0);
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e.message);
    server.kill();
    process.exit(1);
  });

  req.on('timeout', () => {
    console.error('Request timed out');
    req.destroy();
    server.kill();
    process.exit(1);
  });

  req.end();
}

// Timeout after 30 seconds
setTimeout(() => {
  console.log('Timeout reached, killing server...');
  server.kill();
  process.exit(1);
}, 30000);
