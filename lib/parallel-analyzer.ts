export type ParallelPatternType =
  | "map-state"
  | "parallel-state"
  | "concurrent-branches"
  | "fan-out-fan-in"
  | "distributed-processing"
  | "foreach-parallel"
  | "scope-parallel"
  | "nested-parallel";

export type ExecutionMode = "truly-parallel" | "dependency-bound" | "sequential" | "conditional";

export interface ParallelConstruct {
  id: string;
  name: string;
  patternType: ParallelPatternType;
  executionMode: ExecutionMode;
  maxConcurrency: number;
  branches: BranchInfo[];
  dependencies: string[];
  dependents: string[];
  depth: number;
  containedIn?: string;
  confidenceScore: number;
  notes: string[];
}

export interface BranchInfo {
  name: string;
  actionCount: number;
  estimatedDuration: "fast" | "medium" | "slow";
  hasSideEffects: boolean;
  dependencies: string[];
}

export interface ConcurrencyModel {
  platform: "aws" | "azure";
  globalMaxConcurrency: number;
  constructs: ConstructConcurrency[];
  totalParallelPaths: number;
  maxParallelDepth: number;
  estimatedSpeedup: number;
}

export interface ConstructConcurrency {
  constructId: string;
  name: string;
  concurrencyType: string;
  maxConcurrency: number;
  configuredValue: number | "unlimited" | "default";
  recommendation: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: "sequential" | "parallel" | "conditional" | "fan-out" | "fan-in";
}

export interface ParallelAnalysisResult {
  constructs: ParallelConstruct[];
  dependencyGraph: DependencyEdge[];
  sourceConcurrencyModel: ConcurrencyModel;
  targetConcurrencyModel: ConcurrencyModel;
  overallConfidence: number;
  summary: string[];
  warnings: string[];
}

export function analyzeParallelExecution(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): ParallelAnalysisResult {
  const constructs: ParallelConstruct[] = [];
  const dependencyGraph: DependencyEdge[] = [];
  const summary: string[] = [];
  const warnings: string[] = [];

  let sourceParsed: Record<string, unknown>;
  let targetParsed: Record<string, unknown>;

  try { sourceParsed = JSON.parse(sourceCode); } catch { sourceParsed = {}; }
  try { targetParsed = JSON.parse(outputCode); } catch { targetParsed = {}; }

  if (direction === "aws-to-azure") {
    analyzeAslSource(sourceParsed, constructs, dependencyGraph, summary, warnings);
  } else {
    analyzeLogicAppsSource(sourceParsed, constructs, dependencyGraph, summary, warnings);
  }

  if (direction === "aws-to-azure") {
    analyzeLogicAppsTarget(targetParsed, constructs, dependencyGraph, summary, warnings);
  } else {
    analyzeAslTarget(targetParsed, constructs, dependencyGraph, summary, warnings);
  }

  const sourceConcurrencyModel = buildConcurrencyModel(
    direction === "aws-to-azure" ? "aws" : "azure",
    constructs,
    sourceCode
  );

  const targetConcurrencyModel = buildConcurrencyModel(
    direction === "aws-to-azure" ? "azure" : "aws",
    constructs,
    outputCode
  );

  const overallConfidence = computeOverallConfidence(constructs, sourceConcurrencyModel, targetConcurrencyModel);

  if (constructs.length === 0) {
    summary.push("No parallel execution patterns detected — workflow appears fully sequential");
  } else {
    summary.push(`Found ${constructs.length} parallel construct(s) across ${sourceConcurrencyModel.maxParallelDepth} nesting level(s)`);
    const trulyParallel = constructs.filter((c) => c.executionMode === "truly-parallel").length;
    const depBound = constructs.filter((c) => c.executionMode === "dependency-bound").length;
    if (trulyParallel > 0) summary.push(`${trulyParallel} construct(s) are truly parallel — concurrency preserved in target`);
    if (depBound > 0) summary.push(`${depBound} construct(s) are dependency-bound — sequential execution required`);
  }

  return {
    constructs,
    dependencyGraph,
    sourceConcurrencyModel,
    targetConcurrencyModel,
    overallConfidence,
    summary,
    warnings,
  };
}

function analyzeAslSource(
  parsed: Record<string, unknown>,
  constructs: ParallelConstruct[],
  graph: DependencyEdge[],
  summary: string[],
  warnings: string[]
) {
  const states = (parsed.States || {}) as Record<string, Record<string, unknown>>;
  const stateNames = Object.keys(states);

  for (const [name, state] of Object.entries(states)) {
    const sType = (state.Type as string) || "";

    if (sType === "Parallel") {
      const branches = (state.Branches || []) as Record<string, unknown>[];
      const branchInfos: BranchInfo[] = branches.map((branch, idx) => {
        const bStates = (branch.States || {}) as Record<string, Record<string, unknown>>;
        const stateCount = Object.keys(bStates).length;
        const hasSideEffects = Object.values(bStates).some(
          (s) => s.Type === "Task" && /lambda|sqs|sns|s3|dynamodb/i.test((s.Resource as string) || "")
        );
        return {
          name: `Branch_${idx + 1}`,
          actionCount: stateCount,
          estimatedDuration: stateCount > 5 ? "slow" : stateCount > 2 ? "medium" : "fast",
          hasSideEffects,
          dependencies: [],
        };
      });

      const deps = findAslDependencies(name, states);
      const dependents = findAslDependents(name, states);

      constructs.push({
        id: `par-${constructs.length}`,
        name,
        patternType: "parallel-state",
        executionMode: "truly-parallel",
        maxConcurrency: branches.length,
        branches: branchInfos,
        dependencies: deps,
        dependents,
        depth: 0,
        confidenceScore: 95,
        notes: [`${branches.length} branches execute concurrently`, "All branches must complete before workflow continues (fan-in)"],
      });

      for (let i = 0; i < branchInfos.length; i++) {
        for (let j = i + 1; j < branchInfos.length; j++) {
          graph.push({ from: `${name}/${branchInfos[i].name}`, to: `${name}/${branchInfos[j].name}`, type: "parallel" });
        }
      }

      for (const dep of deps) graph.push({ from: dep, to: name, type: "sequential" });
      for (const dt of dependents) graph.push({ from: name, to: dt, type: "fan-in" });

      summary.push(`Parallel state '${name}': ${branches.length} concurrent branches`);
    }

    if (sType === "Map") {
      const maxConcurrency = (state.MaxConcurrency as number) || 0;
      const iterator = state.Iterator as Record<string, unknown> | undefined;
      const itemProcessor = state.ItemProcessor as Record<string, unknown> | undefined;
      const processor = iterator || itemProcessor;
      const processorStates = processor ? Object.keys((processor.States || {}) as Record<string, unknown>).length : 0;

      const deps = findAslDependencies(name, states);
      const dependents = findAslDependents(name, states);

      const executionMode: ExecutionMode = maxConcurrency === 1 ? "sequential" : "truly-parallel";

      constructs.push({
        id: `par-${constructs.length}`,
        name,
        patternType: "map-state",
        executionMode,
        maxConcurrency: maxConcurrency || -1,
        branches: [{
          name: "Iterator",
          actionCount: processorStates,
          estimatedDuration: processorStates > 3 ? "slow" : "medium",
          hasSideEffects: true,
          dependencies: [],
        }],
        dependencies: deps,
        dependents,
        depth: 0,
        confidenceScore: maxConcurrency > 0 ? 90 : 85,
        notes: [
          maxConcurrency === 0 ? "Unlimited concurrency (default)" : maxConcurrency === 1 ? "Sequential execution (MaxConcurrency=1)" : `MaxConcurrency=${maxConcurrency}`,
          `Iterator processes ${processorStates} state(s) per item`,
        ],
      });

      for (const dep of deps) graph.push({ from: dep, to: name, type: "fan-out" });
      for (const dt of dependents) graph.push({ from: name, to: dt, type: "fan-in" });

      summary.push(`Map state '${name}': ${maxConcurrency === 0 ? "unlimited" : `max ${maxConcurrency}`} concurrency`);

      if (maxConcurrency === 0) {
        warnings.push(`Map state '${name}' has unlimited concurrency — may overwhelm downstream services. Consider setting explicit limit.`);
      }
    }

    // Detect fan-out patterns (Task → multiple Next states via Choice)
    if (sType === "Choice") {
      const choices = (state.Choices || []) as Record<string, unknown>[];
      const targets = new Set<string>();
      for (const choice of choices) {
        if (choice.Next) targets.add(choice.Next as string);
      }
      if (state.Default) targets.add(state.Default as string);

      if (targets.size > 2) {
        constructs.push({
          id: `par-${constructs.length}`,
          name,
          patternType: "concurrent-branches",
          executionMode: "conditional",
          maxConcurrency: 1,
          branches: Array.from(targets).map((t) => ({
            name: t,
            actionCount: 1,
            estimatedDuration: "medium" as const,
            hasSideEffects: false,
            dependencies: [],
          })),
          dependencies: findAslDependencies(name, states),
          dependents: Array.from(targets),
          depth: 0,
          confidenceScore: 70,
          notes: [
            `Choice routes to ${targets.size} possible branches`,
            "Only one branch executes per invocation — NOT parallel",
            "Target should use If/Switch (mutually exclusive)",
          ],
        });
      }
    }
  }

  // Detect distributed processing: multiple Task states with same resource type
  const taskStates = Object.entries(states).filter(([, s]) => s.Type === "Task");
  const resourceGroups: Record<string, string[]> = {};
  for (const [name, state] of taskStates) {
    const resource = (state.Resource as string) || "";
    const serviceMatch = resource.match(/arn:aws:states:::(\w+)/);
    if (serviceMatch) {
      const svc = serviceMatch[1];
      if (!resourceGroups[svc]) resourceGroups[svc] = [];
      resourceGroups[svc].push(name);
    }
  }

  for (const [svc, names] of Object.entries(resourceGroups)) {
    if (names.length >= 3) {
      const areDependencyChained = names.every((n, i) => {
        if (i === 0) return true;
        return states[names[i - 1]]?.Next === n;
      });

      if (!areDependencyChained) {
        constructs.push({
          id: `par-${constructs.length}`,
          name: `${svc}_distributed`,
          patternType: "distributed-processing",
          executionMode: areDependencyChained ? "dependency-bound" : "truly-parallel",
          maxConcurrency: names.length,
          branches: names.map((n) => ({
            name: n, actionCount: 1, estimatedDuration: "medium" as const,
            hasSideEffects: true, dependencies: [],
          })),
          dependencies: [],
          dependents: [],
          depth: 0,
          confidenceScore: 65,
          notes: [
            `${names.length} tasks target the same service (${svc})`,
            areDependencyChained ? "Tasks are sequentially chained" : "Tasks may execute concurrently if branches allow",
          ],
        });
      }
    }
  }
}

function analyzeLogicAppsSource(
  parsed: Record<string, unknown>,
  constructs: ParallelConstruct[],
  graph: DependencyEdge[],
  summary: string[],
  warnings: string[]
) {
  const actions = (parsed.actions || (parsed.definition as Record<string, unknown>)?.actions || {}) as Record<string, Record<string, unknown>>;
  analyzeLogicAppsActions(actions, constructs, graph, summary, warnings, 0);
}

function analyzeLogicAppsActions(
  actions: Record<string, Record<string, unknown>>,
  constructs: ParallelConstruct[],
  graph: DependencyEdge[],
  summary: string[],
  warnings: string[],
  depth: number
) {
  // Find actions with no runAfter or empty runAfter — they run in parallel
  const rootActions: string[] = [];
  const dependencyMap: Record<string, string[]> = {};

  for (const [name, action] of Object.entries(actions)) {
    const runAfter = (action.runAfter || {}) as Record<string, unknown>;
    const deps = Object.keys(runAfter);
    dependencyMap[name] = deps;
    if (deps.length === 0) rootActions.push(name);
  }

  if (rootActions.length > 1) {
    constructs.push({
      id: `par-${constructs.length}`,
      name: "Root_Parallel_Branches",
      patternType: "concurrent-branches",
      executionMode: "truly-parallel",
      maxConcurrency: rootActions.length,
      branches: rootActions.map((n) => ({
        name: n, actionCount: 1, estimatedDuration: "medium" as const,
        hasSideEffects: true, dependencies: [],
      })),
      dependencies: [],
      dependents: [],
      depth,
      confidenceScore: 90,
      notes: [`${rootActions.length} actions start simultaneously (no runAfter dependencies)`],
    });

    for (let i = 0; i < rootActions.length; i++) {
      for (let j = i + 1; j < rootActions.length; j++) {
        graph.push({ from: rootActions[i], to: rootActions[j], type: "parallel" });
      }
    }

    summary.push(`${rootActions.length} root-level actions execute in parallel`);
  }

  // Find convergence points (fan-in): actions with multiple runAfter entries
  for (const [name, deps] of Object.entries(dependencyMap)) {
    if (deps.length > 1) {
      for (const dep of deps) {
        graph.push({ from: dep, to: name, type: "fan-in" });
      }
    } else if (deps.length === 1) {
      graph.push({ from: deps[0], to: name, type: "sequential" });
    }
  }

  // Find parallel groups (actions that share the same single dependency)
  const depGrouped: Record<string, string[]> = {};
  for (const [name, deps] of Object.entries(dependencyMap)) {
    if (deps.length === 1) {
      const key = deps[0];
      if (!depGrouped[key]) depGrouped[key] = [];
      depGrouped[key].push(name);
    }
  }

  for (const [parent, children] of Object.entries(depGrouped)) {
    if (children.length > 1) {
      constructs.push({
        id: `par-${constructs.length}`,
        name: `After_${parent}`,
        patternType: "concurrent-branches",
        executionMode: "truly-parallel",
        maxConcurrency: children.length,
        branches: children.map((n) => ({
          name: n, actionCount: 1, estimatedDuration: "medium" as const,
          hasSideEffects: true, dependencies: [parent],
        })),
        dependencies: [parent],
        dependents: [],
        depth,
        confidenceScore: 88,
        notes: [`${children.length} actions fan-out after '${parent}' completes`],
      });

      for (let i = 0; i < children.length; i++) {
        for (let j = i + 1; j < children.length; j++) {
          graph.push({ from: children[i], to: children[j], type: "parallel" });
        }
        graph.push({ from: parent, to: children[i], type: "fan-out" });
      }
    }
  }

  for (const [name, action] of Object.entries(actions)) {
    const aType = (action.type as string) || "";

    if (aType === "Foreach") {
      const rt = action.runtimeConfiguration as Record<string, unknown> | undefined;
      const conc = rt?.concurrency as Record<string, unknown> | undefined;
      const repetitions = (conc?.repetitions as number) || 0;
      const isSequential = action.operationOptions === "Sequential";

      constructs.push({
        id: `par-${constructs.length}`,
        name,
        patternType: "foreach-parallel",
        executionMode: isSequential ? "sequential" : "truly-parallel",
        maxConcurrency: isSequential ? 1 : repetitions || 20,
        branches: [{
          name: "ForEachBody",
          actionCount: action.actions ? Object.keys(action.actions as Record<string, unknown>).length : 0,
          estimatedDuration: "medium",
          hasSideEffects: true,
          dependencies: [],
        }],
        dependencies: Object.keys((action.runAfter || {}) as Record<string, unknown>),
        dependents: [],
        depth,
        confidenceScore: 92,
        notes: [
          isSequential ? "Sequential execution (operationOptions: Sequential)" : `Parallel with ${repetitions || "default (20)"} repetitions`,
        ],
      });

      if (action.actions) {
        analyzeLogicAppsActions(
          action.actions as Record<string, Record<string, unknown>>,
          constructs, graph, summary, warnings, depth + 1
        );
      }
    }

    if (aType === "Scope" && action.actions) {
      const innerActions = action.actions as Record<string, Record<string, unknown>>;
      const innerRoots = Object.entries(innerActions).filter(
        ([, a]) => Object.keys((a.runAfter || {}) as Record<string, unknown>).length === 0
      );

      if (innerRoots.length > 1) {
        constructs.push({
          id: `par-${constructs.length}`,
          name,
          patternType: "scope-parallel",
          executionMode: "truly-parallel",
          maxConcurrency: innerRoots.length,
          branches: innerRoots.map(([n]) => ({
            name: n, actionCount: 1, estimatedDuration: "medium" as const,
            hasSideEffects: true, dependencies: [],
          })),
          dependencies: Object.keys((action.runAfter || {}) as Record<string, unknown>),
          dependents: [],
          depth,
          confidenceScore: 85,
          notes: [`Scope '${name}' has ${innerRoots.length} parallel inner actions`],
        });
      }

      analyzeLogicAppsActions(innerActions, constructs, graph, summary, warnings, depth + 1);
    }
  }
}

function analyzeLogicAppsTarget(
  parsed: Record<string, unknown>,
  constructs: ParallelConstruct[],
  graph: DependencyEdge[],
  summary: string[],
  warnings: string[]
) {
  const actions = (parsed.actions || {}) as Record<string, Record<string, unknown>>;

  for (const [name, action] of Object.entries(actions)) {
    const aType = (action.type as string) || "";

    if (aType === "Foreach") {
      const rt = action.runtimeConfiguration as Record<string, unknown> | undefined;
      const conc = rt?.concurrency as Record<string, unknown> | undefined;
      const repetitions = conc?.repetitions as number | undefined;
      const isSequential = action.operationOptions === "Sequential";

      if (isSequential) {
        const sourceConstruct = constructs.find(
          (c) => c.name === name && c.executionMode === "truly-parallel"
        );
        if (sourceConstruct) {
          warnings.push(
            `'${name}' was parallel in source (Map/MaxConcurrency=${sourceConstruct.maxConcurrency}) but is sequential in target. ` +
            `Set runtimeConfiguration.concurrency.repetitions = ${sourceConstruct.maxConcurrency > 0 ? sourceConstruct.maxConcurrency : 20} to preserve parallel behavior.`
          );
        }
      }

      if (!isSequential && !repetitions) {
        warnings.push(
          `'${name}' Foreach has no explicit concurrency setting — Logic Apps defaults to 20 parallel iterations. ` +
          `Set repetitions explicitly if source had a specific MaxConcurrency.`
        );
      }
    }
  }

  // Check for sequential chains that were parallel in source
  const actionEntries = Object.entries(actions);
  for (const [name, action] of actionEntries) {
    const runAfter = (action.runAfter || {}) as Record<string, unknown>;
    const deps = Object.keys(runAfter);
    if (deps.length === 1) {
      const sourceConstruct = constructs.find(
        (c) => c.patternType === "parallel-state" && c.branches.some((b) => b.name === name)
      );
      if (sourceConstruct) {
        warnings.push(
          `'${name}' appears sequentially chained in target but was part of Parallel state '${sourceConstruct.name}' in source`
        );
      }
    }
  }
}

function analyzeAslTarget(
  parsed: Record<string, unknown>,
  constructs: ParallelConstruct[],
  _graph: DependencyEdge[],
  _summary: string[],
  warnings: string[]
) {
  const states = (parsed.States || {}) as Record<string, Record<string, unknown>>;

  for (const [name, state] of Object.entries(states)) {
    if (state.Type === "Map") {
      const maxConc = state.MaxConcurrency as number | undefined;
      const sourceConstruct = constructs.find(
        (c) => c.name === name && c.patternType === "foreach-parallel"
      );
      if (sourceConstruct && sourceConstruct.executionMode === "truly-parallel" && maxConc === 1) {
        warnings.push(`'${name}' was parallel Foreach (repetitions=${sourceConstruct.maxConcurrency}) but target Map has MaxConcurrency=1`);
      }
    }
  }
}

function buildConcurrencyModel(
  platform: "aws" | "azure",
  constructs: ParallelConstruct[],
  code: string
): ConcurrencyModel {
  const constructModels: ConstructConcurrency[] = [];
  let totalParallelPaths = 0;
  let maxDepth = 0;

  for (const c of constructs) {
    if (c.depth > maxDepth) maxDepth = c.depth;
    if (c.executionMode === "truly-parallel") totalParallelPaths += c.maxConcurrency;

    let concurrencyType = "";
    let configuredValue: number | "unlimited" | "default" = "default";
    let recommendation = "";

    if (platform === "aws") {
      if (c.patternType === "map-state") {
        concurrencyType = "MaxConcurrency";
        configuredValue = c.maxConcurrency === -1 ? "unlimited" : c.maxConcurrency;
        recommendation = c.maxConcurrency === -1 || c.maxConcurrency === 0
          ? "Set explicit MaxConcurrency to prevent downstream throttling"
          : `MaxConcurrency=${c.maxConcurrency} — appropriate for bounded workloads`;
      } else if (c.patternType === "parallel-state") {
        concurrencyType = "Parallel.Branches";
        configuredValue = c.branches.length;
        recommendation = `${c.branches.length} branches — all execute concurrently (fan-in at completion)`;
      } else {
        concurrencyType = "Implicit";
        configuredValue = c.maxConcurrency;
        recommendation = "Execution mode determined by state machine topology";
      }
    } else {
      if (c.patternType === "foreach-parallel" || c.patternType === "map-state") {
        concurrencyType = "runtimeConfiguration.concurrency.repetitions";
        configuredValue = c.executionMode === "sequential" ? 1 : c.maxConcurrency > 0 ? c.maxConcurrency : "default";
        recommendation = c.executionMode === "sequential"
          ? "Sequential — set repetitions > 1 to parallelize"
          : `repetitions=${c.maxConcurrency > 0 ? c.maxConcurrency : 20} — match source concurrency`;
      } else if (c.patternType === "concurrent-branches" || c.patternType === "scope-parallel") {
        concurrencyType = "runAfter topology";
        configuredValue = c.branches.length;
        recommendation = `${c.branches.length} actions fan-out — preserved via runAfter graph`;
      } else {
        concurrencyType = "Implicit";
        configuredValue = c.maxConcurrency;
        recommendation = "Concurrency determined by action dependency graph";
      }
    }

    constructModels.push({
      constructId: c.id,
      name: c.name,
      concurrencyType,
      maxConcurrency: c.maxConcurrency,
      configuredValue,
      recommendation,
    });
  }

  const globalMax = constructs.reduce((max, c) => {
    if (c.executionMode === "truly-parallel") return Math.max(max, c.maxConcurrency);
    return max;
  }, 1);

  const parallelConstructs = constructs.filter((c) => c.executionMode === "truly-parallel");
  const estimatedSpeedup = parallelConstructs.length > 0
    ? Math.min(parallelConstructs.reduce((sum, c) => sum + Math.min(c.maxConcurrency, 10), 0) / parallelConstructs.length, 10)
    : 1;

  return {
    platform,
    globalMaxConcurrency: globalMax,
    constructs: constructModels,
    totalParallelPaths,
    maxParallelDepth: maxDepth + 1,
    estimatedSpeedup: Math.round(estimatedSpeedup * 10) / 10,
  };
}

function computeOverallConfidence(
  constructs: ParallelConstruct[],
  source: ConcurrencyModel,
  target: ConcurrencyModel
): number {
  if (constructs.length === 0) return 100;

  let totalScore = 0;
  let totalWeight = 0;

  for (const c of constructs) {
    const weight = c.patternType === "parallel-state" || c.patternType === "map-state" ? 3
      : c.patternType === "foreach-parallel" ? 2 : 1;
    totalScore += c.confidenceScore * weight;
    totalWeight += weight;
  }

  let baseConfidence = totalWeight > 0 ? totalScore / totalWeight : 100;

  // Penalty if source and target concurrency models diverge
  for (const sc of source.constructs) {
    const tc = target.constructs.find((t) => t.name === sc.name);
    if (tc) {
      const sourceVal = typeof sc.configuredValue === "number" ? sc.configuredValue : 20;
      const targetVal = typeof tc.configuredValue === "number" ? tc.configuredValue : 20;
      if (sourceVal > 1 && targetVal === 1) baseConfidence -= 15;
      else if (Math.abs(sourceVal - targetVal) > 5) baseConfidence -= 5;
    }
  }

  return Math.max(0, Math.min(100, Math.round(baseConfidence)));
}

function findAslDependencies(stateName: string, states: Record<string, Record<string, unknown>>): string[] {
  const deps: string[] = [];
  for (const [name, state] of Object.entries(states)) {
    if (name === stateName) continue;
    if (state.Next === stateName) deps.push(name);
    if (state.Type === "Choice") {
      const choices = (state.Choices || []) as Record<string, unknown>[];
      if (choices.some((c) => c.Next === stateName) || state.Default === stateName) {
        deps.push(name);
      }
    }
  }
  return deps;
}

function findAslDependents(stateName: string, states: Record<string, Record<string, unknown>>): string[] {
  const state = states[stateName];
  if (!state) return [];
  const dependents: string[] = [];
  if (state.Next) dependents.push(state.Next as string);
  if (state.Type === "Choice") {
    const choices = (state.Choices || []) as Record<string, unknown>[];
    for (const c of choices) {
      if (c.Next) dependents.push(c.Next as string);
    }
    if (state.Default) dependents.push(state.Default as string);
  }
  return dependents;
}
