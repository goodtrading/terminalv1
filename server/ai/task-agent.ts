export interface TaskRequest {
    goal: string;
  }
  
  export interface FileTask {
    file: string;
    objective: string;
    changes: string[];
  }
  
  export interface TaskPlan {
    goal: string;
    steps: string[];
    files: FileTask[];
  }
  
  export function buildTaskPlan(input: TaskRequest): TaskPlan {
    const goal = input.goal.toLowerCase();
  
    if (goal.includes("mainchart") || goal.includes("pantalla negra") || goal.includes("chart")) {
      return {
        goal: input.goal,
        steps: [
          "Normalize incoming live candle data",
          "Guard against out-of-order candle updates",
          "Prevent chart crash when invalid time is received",
        ],
        files: [
          {
            file: "client/src/components/terminal/MainChart.tsx",
            objective: "Stabilize live candle updates and prevent black-screen runtime crash",
            changes: [
              "Add normalizeCandle helper",
              "Wrap candleSeriesRef.current.update(...) in guard logic",
              "Skip malformed or older candle updates",
            ],
          },
        ],
      };
    }
  
    if (goal.includes("vacuum") && goal.includes("terminal-state")) {
      return {
        goal: input.goal,
        steps: [
          "Import LiquidityVacuumEngine",
          "Instantiate engine once",
          "Compute vacuum inside getTerminalState",
          "Return vacuum in API payload",
        ],
        files: [
          {
            file: "server/terminal-state.ts",
            objective: "Connect vacuum engine to terminal state output",
            changes: [
              "Import LiquidityVacuumEngine",
              "Create const vacuumEngine = new LiquidityVacuumEngine()",
              "Call vacuumEngine.update(...) inside getTerminalState",
              "Expose vacuum in returned state object",
            ],
          },
        ],
      };
    }
  
    if (goal.includes("ui derecha") || goal.includes("sidebar") || goal.includes("vacuum risk")) {
      return {
        goal: input.goal,
        steps: [
          "Read vacuum from terminal state",
          "Render vacuum risk",
          "Render vacuum proximity and thin liquidity",
        ],
        files: [
          {
            file: "client/src/components/terminal/RightSidebar.tsx",
            objective: "Show vacuum state in right-side UI panels",
            changes: [
              "Add vacuum section or extend Liquidity Map panel",
              "Render vacuumRisk",
              "Render vacuumProximity",
              "Render thinLiquidity/comment",
            ],
          },
        ],
      };
    }
  
    if (goal.includes("overlay") && goal.includes("vacuum")) {
      return {
        goal: input.goal,
        steps: [
          "Read vacuum zones from state",
          "Transform zone to chart overlay coordinates",
          "Render translucent vacuum band",
        ],
        files: [
          {
            file: "client/src/components/terminal/MainChart.tsx",
            objective: "Render vacuum overlay on chart",
            changes: [
              "Use vacuum.zone from terminal state",
              "Draw translucent zone",
              "Label zone as VACUUM ABOVE/BELOW",
            ],
          },
        ],
      };
    }
  
    return {
      goal: input.goal,
      steps: ["No specialized task mapping found"],
      files: [],
    };
  }