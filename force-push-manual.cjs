// Manual force push by calling the service directly
const { spawn } = require('child_process');

console.log('Starting manual force push...');

// Start Node.js process with inline code
const child = spawn('node', ['-e', `
  (async () => {
    try {
      // Import the service directly
      const { replitPushService } = await import('./server/replit-push.js');
      
      console.log('[MANUAL FORCE] Starting force push...');
      
      // Force the push
      await replitPushService.forceRealPush();
      
      console.log('[MANUAL FORCE] Force push completed');
    } catch (error) {
      console.error('[MANUAL FORCE] Error:', error);
    }
  })();
`], {
  cwd: process.cwd(),
  stdio: 'inherit'
});

child.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});

child.on('error', (err) => {
  console.error('Failed to start subprocess:', err);
});
