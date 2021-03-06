import { getTopologicalOrder } from "../src/compiler/passes/passesHelper";
import { SingleDistribution, QueryDistributionRecursiveEval } from "../src/compiler/passes/distributeQueries";
import { DbIdType, RelationNameType, RelationType  } from "../src/parser/dielAstTypes";
import { LocalDbId } from "../src/compiler/DielPhysicalExecution";
import { BgGreen, Reset } from "../src/util/messages";
import { DependencyTree, NodeDependencyAugmented } from "../src/runtime/runtimeTypes";



export function testTopologicalSort() {
  const depTree: DependencyTree = new Map([
    ["v1", {
      relationName: "v1",
      isDynamic: false,
      dependsOn: ["v2"],
      isDependedBy: []
    }],
    ["v2", {
      relationName: "v2",
      isDynamic: false,
      dependsOn: ["v3"],
      isDependedBy: ["v1"]
    }],
    ["v3", {
      relationName: "v3",
      isDynamic: false,
      dependsOn: ["v4"],
      isDependedBy: ["v2"]
    }],
    ["v4", {
      relationName: "v4",
      isDynamic: false,
      dependsOn: [],
      isDependedBy: ["v3"]
    }],
  ]);
  const sorted = getTopologicalOrder(depTree);
  console.log("sorted", sorted);
  if (sorted[0] !== "v4" || sorted[1] !== "v3" || sorted[2] !== "v2" || sorted[3] !== "v1") {
    throw new Error(`testTopologicalSort failed`);
  }
}

export function testDistributionLogc() {
  // set up
  const augmentedDep = new Map<RelationNameType, NodeDependencyAugmented>();
  const depI1: NodeDependencyAugmented = {
    relationName: "i1",
    remoteId: LocalDbId,
    dependsOn: [],
    isDynamic: true,
    isDependedBy: ["v1"]
  };
  const depI2: NodeDependencyAugmented = {
    relationName: "i2",
    remoteId: LocalDbId,
    isDynamic: true,
    dependsOn: [],
    isDependedBy: ["v1"]
  };
  const depR1: NodeDependencyAugmented = {
    relationName: "r1",
    remoteId: 2,
    isDynamic: false,
    dependsOn: [],
    isDependedBy: ["v1"]
  };
  const depV1: NodeDependencyAugmented = {
    relationName: "v1",
    isDynamic: false,
    dependsOn: ["i1", "i2", "r1"],
    isDependedBy: ["o1"]
  };
  const depE1: NodeDependencyAugmented = {
    relationName: "e1",
    isDynamic: false,
    dependsOn: ["i1", "i2", "r1"],
    isDependedBy: []
  };
  const depO1: NodeDependencyAugmented = {
    relationName: "o1",
    isDynamic: false,
    dependsOn: ["e1"],
    isDependedBy: []
  };
  augmentedDep.set("i1", depI1);
  augmentedDep.set("i2", depI2);
  augmentedDep.set("r1", depR1);
  augmentedDep.set("v1", depV1);
  augmentedDep.set("e1", depE1);
  augmentedDep.set("o1", depO1);

  // as a simple hack for testing, encode the remoteId by the size of the original Id
  function selectRelationEvalOwner (dbIds: Set<DbIdType>): DbIdType {
    return Math.max(...Array.from(dbIds));
  }
  const distributions: SingleDistribution[] = [];
  const relationTypeLookup = (rName: string) => {
    if (rName[0] === "o") return RelationType.Output;
    if (rName[0] === "v") return RelationType.View;
    if (rName[0] === "i") return RelationType.EventTable;
    if (rName[0] === "e") return RelationType.EventView;
    return RelationType.Table;
  };
  const scope = {
    augmentedDep,
    selectRelationEvalOwner,
    relationTypeLookup,
    outputName: "dummy"
  };
  QueryDistributionRecursiveEval(distributions, scope, "o1");
  const expected = [
    {
      relationName: "i1",
      from: 1,
      to: 1
    },
    {
      relationName: "i2",
      from: 1,
      to: 1
    },
    {
      relationName: "r1",
      from: 2,
      to: 2
    },
    {
      relationName: "i1",
      from: 1,
      to: 2
    },
    {
      relationName: "i2",
      from: 1,
      to: 2
    },
    {
      relationName: "r1",
      from: 2,
      to: 2
    },
    {
      relationName: "e1",
      from: 2,
      to: 1
    },
    {
      relationName: "e1",
      from: 1,
      to: 1
    },
    {
      relationName: "o1",
      from: 1,
      to: 1
    }
  ];
  // DO assertions
  if (expected.length !== distributions.length) {
    throw new Error(`Distribution incorrect length, expected ${JSON.stringify(expected, null, 2)}, but got ${JSON.stringify(distributions, null, 2)}`);
  }
  expected.map(e => {
    const f = distributions.find(d => (e.relationName === d.relationName) && (e.to === d.to) && (d.from === e.from));
    if (!f) {
      throw new Error(`Distribution incorrect! Expected to find ${JSON.stringify(e, null, 2)}`);
    }
  });
  console.log(`${BgGreen}Passed testDistributionLogc!${Reset}`);
}

// @LUCIE care to take a stab?

export function testDistributionLogcComplex() {
  // TODO
}

export function testDependencyGraph() {
  // TODO
}