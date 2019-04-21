import { Relation, ExprType, ExprRelationAst, ExprFunAst, ExprAst, ExprParen,  DbIdType, RelationIdType, SelectionUnit, RelationReference, RelationType } from "../../parser/dielAstTypes";
import { LogInternalError } from "../../util/messages";
import { } from "../DielPhysicalExecution";

/**
 * If there is a subquery, then use alias, otherwise use the original relation name
 * @param r relation reference
 */
export function getRelationReferenceName(r: RelationReference) {
  const n = r.subquery ? r.alias : r.relationName;
  if (!n) {
    LogInternalError(`RelationReference either does not have an alias or name:\n ${JSON.stringify(r)}`);
  }
  return n;
}

export interface NodeDependencyAugmented extends NodeDependency {
  relationName: string;
  remoteId?: DbIdType; // only has remoteId if it's an original table
  relationType: RelationType;
}

export type NodeDependency = {
  dependsOn: RelationIdType[],
  isDependedBy: RelationIdType[]
};

export type DependencyTree = Map<RelationIdType, NodeDependency>;

export interface DependencyInfo {
  // both ways for easy access
  depTree: DependencyTree;
  topologicalOrder: string[];
  inputDependenciesOutput: Map<string, Set<string>>;
  inputDependenciesAll: Map<string, Set<string>>;
}

function getRelationReferenceDep(r: RelationReference): string[] {
  if (r.relationName) {
    return [r.relationName];
  } else {
    // subquery!
    return r.subquery.compositeSelections.reduce((acc, c) => acc.concat(getSelectionUnitDep(c.relation)), []);
  }
}

function getExprDep(depAcc: string[], e: ExprAst): void {
  if (!e) {
    debugger;
  }
  switch (e.exprType) {
    case ExprType.Relation:
      const relationExpr = e as ExprRelationAst;
      relationExpr.selection.compositeSelections.map(newE => {
        depAcc.push(...getSelectionUnitDep(newE.relation));
      });
      break;
    case ExprType.Func:
      const whereFuncExpr = (e as ExprFunAst);
      whereFuncExpr.args.map(newE => {
        getExprDep(depAcc, newE);
      });
      break;
    case ExprType.Parenthesis:
      getExprDep(depAcc, (e as ExprParen).content);
      break;
    default:
      return;
      // do nothing for now
  }
}

// recursive!
export function getSelectionUnitDep(s: SelectionUnit): string[] {
  let deps = getRelationReferenceDep(s.baseRelation);
  // the predicates on joins might have dependencies too... #FIXMELATER
  s.joinClauses.map(j => {
    deps = deps.concat(getRelationReferenceDep(j.relation));
  });
  if (s.whereClause) {
    getExprDep(deps, s.whereClause);
  }
  return deps;
}


export function getTopologicalOrder(depTree: DependencyTree) {
  // lots of redundancy for access
  // this code is so dumb
  let visitedStringToNumber = new Map<string, number>();
  let visitedArray: { visited: boolean, relationName: string }[] = [];
  let topoSorted: string[] = [];
  let i = 0;
  for (let key of depTree.keys()) {
    visitedStringToNumber.set(key, i);
    i += 1;
    visitedArray.push({visited: false, relationName: key});
  }
  let hasUnmarked = visitedArray.filter(v => !v.visited);
  let loopCount = 1;
  while (hasUnmarked.length > 0) {
    topoVisit(hasUnmarked[0].relationName);
    hasUnmarked = visitedArray.filter(v => !v.visited);
    loopCount += 1;
    if (loopCount > 1000) { // this is brittle, and temporarily for debugging #FIXME
      LogInternalError(`Too many loops in toplogical sort`);
    }
  }
  function topoVisit(relation: string) {
    loopCount += 1;
    if (loopCount > 1000) { // this is brittle, and temporarily for debugging #FIXME
      debugger;
      LogInternalError(`Too many loops in toplogical sort`);
    }
    if (!visitedStringToNumber.has(relation)) {
      // this should be the case where a static relation is referred
      // in which case we can just skip; enhance later #FIXMELATER
      return;
    }
    const idx = visitedStringToNumber.get(relation);
    if (visitedArray[idx].visited) {
      return;
    }
    // ugh of vs in
    for (let d of depTree.get(relation).dependsOn) {
      topoVisit(d);
    }
    visitedArray[idx].visited = true;
    topoSorted.push(relation);
  }
  // there are no dangling leaves; they will just have no dependencies
  return topoSorted;
}


/**
 * take in dependency tree and a relation definition lookup function
 *          o1
 *         /
 * t1 -> v1 - o2
 * @param ast
 */
export function getRelationsToMateralize(
  depTree: DependencyTree,
  getRelationDef: (rName: RelationIdType) => Relation
): string[] {
  // originalRelations: OriginalRelation[]; -> t1
  // views: DerivedRelation[]; -> v1 & o1 & o2 will be
  // differentiate views and outputs by relationType field
  // programs: ProgramsIr; -> trigger to update the table will be
  // dependecy helpers
  // generateDependenciesByName

  // const materializationInfo: Map<RelationIdType, Set<RelationIdType>> = new Map();
  // // visit the depTree from Ir, then visit each node;
  // function findMaterializationKeyorSet(rName: string) {
  //   if (!materializationInfo.has(rName)) {
  //     materializationInfo.set(rName, new Set());
  //   }
  //   return materializationInfo.get(rName);
  // }
  let toMAterialize: RelationIdType[] = [];
  depTree.forEach((nodeDep, relationName) => {
    // look up current relationName
    const rDef = getRelationDef(relationName);
    // if the node is a view
    if (rDef && ((rDef.relationType === RelationType.EventView)
     || (rDef.relationType === RelationType.View)
    //  || (rDef.relationType === RelationType.Output)
     )) {
       // and if the view is dependent on by at least two views/outputs, mark it as to materialize
       if (nodeDep.isDependedBy.length > 1) {
        toMAterialize.push(relationName);
        // const dependentInputs = findMaterializationKeyorSet(rDef.name);
        // // check for its dependencies
        // nodeDep.dependsOn.map(dName => {
        //   if ((getRelationDef(dName).relationType === RelationType.EventTable)
        //     || (getRelationDef(dName).relationType === RelationType.Table)) {
        //       dependentInputs.add(dName);
        //     }
        // });
       }
     }
  });
  return toMAterialize;
}