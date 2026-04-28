// Manual force push using ESM import
const { spawn } = require('child_process');

console.log('Starting manual force push...');

// Start Node.js process with ESM and proper module resolution
const child = spawn('node', ['--experimental-modules', '-e', `
  (async () => {
    try {
      // Import the service using relative path from server directory
      const { replitPushService } = await import('./server/replit-push.ts');
      
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
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: '--loader ts-node/esm'
  }
});

child.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});

child.on('error', (err) => {
  console.error('Failed to start subprocess:', err);
});
