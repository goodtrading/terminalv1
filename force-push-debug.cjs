const { replitPushService } = require('./server/replit-push.ts');

async function testPush() {
  console.log('[FORCE PUSH DEBUG] Starting forceRealPush...');
  
  try {
    // Reset all caches to force send
    replitPushService.lastPayload = null;
    replitPushService.lastVisualPayload = null;
    replitPushService.lastPushTime = 0;
    
    // Force the push
    await replitPushService.forceRealPush();
    
    console.log('[FORCE PUSH DEBUG] Push completed successfully');
    
    // Get status
    const status = replitPushService.getStatus();
    console.log('[FORCE PUSH DEBUG] Service status:', status);
    
  } catch (error) {
    console.error('[FORCE PUSH DEBUG] Error:', error);
  }
}

testPush();
