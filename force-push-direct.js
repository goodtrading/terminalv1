// Direct force push using eval
import('./server/replit-push.js').then(({ replitPushService }) => {
  console.log('[DIRECT FORCE] Starting force push...');
  replitPushService.forceRealPush().then(() => {
    console.log('[DIRECT FORCE] Force push completed');
  }).catch((error) => {
    console.error('[DIRECT FORCE] Error:', error);
  });
}).catch((error) => {
  console.error('[DIRECT FORCE] Import error:', error);
});
