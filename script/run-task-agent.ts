import { buildTaskPlan } from "../server/ai/task-agent";

const goal = process.argv.slice(2).join(" ").trim();

if (!goal) {
  console.error('Usage: npm run task:agent -- "your task here"');
  process.exit(1);
}

const plan = buildTaskPlan({ goal });

console.log("\n===== TASK AGENT PLAN =====\n");
console.log(JSON.stringify(plan, null, 2));
console.log("\n===========================\n");