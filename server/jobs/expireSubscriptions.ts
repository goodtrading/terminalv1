import { expireSubscriptionsPastDue } from "../services/subscriptionService";
import { db } from "../db";

const INTERVAL_MS = 5 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | undefined;

export function startExpireSubscriptionsJob(): void {
  if (!db) return;
  if (timer) return;
  const tick = () => {
    expireSubscriptionsPastDue()
      .then((n) => {
        if (n > 0) {
          console.log(`[SaaS] Marked ${n} subscription(s) expired`);
        }
      })
      .catch((e) => console.error("[SaaS] expireSubscriptions job:", e));
  };
  tick();
  timer = setInterval(tick, INTERVAL_MS);
}
