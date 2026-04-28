const { replitPushService } = require('./server/replit-push.ts');

replitPushService.forceRealPush().catch(console.error);
