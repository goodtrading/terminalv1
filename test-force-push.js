const { replitPushService } = require('./server/replit-push.ts');

async function testForcePush() {
  console.log('[TEST FORCE PUSH] Starting...');
  
  try {
    // Reset cache for force send
    replitPushService.lastPayload = null;
    replitPushService.lastVisualPayload = null;
    replitPushService.lastPushTime = 0;
    
    console.log('[TEST FORCE PUSH] Cache reset, forcing push...');
    
    // Force push
    await replitPushService.forceRealPush();
    
    console.log('[TEST FORCE PUSH] Push completed');
    
    // Get status
    const status = replitPushService.getStatus();
    console.log('[TEST FORCE PUSH] Service status:', JSON.stringify(status, null, 2));
    
  } catch (error) {
    console.error('[TEST FORCE PUSH] Error:', error);
  }
}

testForcePush();
