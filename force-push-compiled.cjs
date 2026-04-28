// Force push using compiled JS
const fs = require('fs');
const path = require('path');

// Read the TypeScript file and compile it on the fly
const tsFilePath = path.join(__dirname, 'server', 'replit-push.ts');
const tsContent = fs.readFileSync(tsFilePath, 'utf8');

// Simple TypeScript to JavaScript conversion (basic)
const jsContent = tsContent
  .replace(/interface\s+\w+\s*{[^}]*}/g, '') // Remove interfaces
  .replace(/:\s*\w+(\[\])?/g, '') // Remove type annotations
  .replace(/private\s+/g, '') // Remove private modifiers
  .replace(/readonly\s+/g, '') // Remove readonly modifiers
  .replace(/export\s+/g, '') // Remove export keywords
  .replace(/import\s+.*?from\s+['"][^'"]*['"];?/g, ''); // Remove imports

// Add required imports at the top
const finalContent = `
const { getTerminalState } = require('./server/terminal-state.js');

${jsContent}

// Export the service
global.replitPushService = new ReplitPushService();
`;

// Write temporary JS file
const tempJsPath = path.join(__dirname, 'temp-replit-push.js');
fs.writeFileSync(tempJsPath, finalContent);

// Execute the force push
try {
  require(tempJsPath);
  global.replitPushService.forceRealPush().then(() => {
    console.log('[COMPILED FORCE] Force push completed');
  }).catch((error) => {
    console.error('[COMPILED FORCE] Error:', error);
  });
} catch (error) {
  console.error('[COMPILED FORCE] Setup error:', error);
} finally {
  // Clean up temp file
  fs.unlinkSync(tempJsPath);
}
