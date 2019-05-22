import { GetAllOutputs } from "../DielAstGetters";
import { LogInternalError, DielInternalErrorType } from "../../util/messages";
import { NodeDependencyAugmented, DependencyTree } from "../../runtime/runtimeTypes";
import { SqlOriginalRelation, SqlRelationType, SqlDerivedRelation } from "../../parser/sqlAstTypes";
import { LocalDbId } from "../DielPhysicalExecution";
import { RelationNameType, DbIdType, Column, DielDataType, CompositeSelection, Relation, RelationType, OriginalRelation, DielAst, BuiltInColumn, SetOperator, RelationReferenceType, JoinAst, AstType, JoinType, ExprType, FunctionType, ColumnSelection } from "../../parser/dielAstTypes";
import { DerivedRelation } from "../..";

export type SingleDistribution = {
  relationName: RelationNameType,
  // the first passes they might not be filled...
  from: DbIdType | null,
  to: DbIdType | null,
  // this is the relation that needs this relation being sent
  forRelationName: RelationNameType,
  finalOutputName: RelationNameType
};

type RecursiveEvalResult = {
  relationName: RelationNameType,
  dbId: DbIdType,
  fromDbId: DbIdType,
};

// keeping this functional so we can test it properly, this is why
// this has so many parameters
export function QueryDistributionRecursiveEval(
  distributions: SingleDistribution[],
  scope: {
    augmentedDep: Map<RelationNameType, NodeDependencyAugmented>,
    selectRelationEvalOwner: (dbIds: Set<DbIdType>) => DbIdType,
    outputName: RelationNameType,
    relationTypeLookup: (rName: RelationNameType) => RelationType,
  },
  relationId: RelationNameType,
  ): RecursiveEvalResult | null {
  // find where rel lives, need to access metadata, or just have it augmented with the metadata already?
  // base case
  const node = scope.augmentedDep.get(relationId);
  if (!node) {
    return LogInternalError(`Relation ${relationId} not found!`);
  }
  const sharedPartialDistributionObj = {
    forRelationName: node.relationName,
    finalOutputName: scope.outputName,
  };

  // base case
  if (node.dependsOn.length === 0) {
    distributions.push({
      relationName: node.relationName,
      from: node.remoteId,
      to: node.remoteId,
      ...sharedPartialDistributionObj
    });
    if (!node.remoteId) {
      return LogInternalError(`Node should be assigned here`);
    }
    return {
      relationName: node.relationName,
      dbId: node.remoteId,
      fromDbId: node.remoteId,
    };
  }
  // derived, need to look at the things it needs, then decide who should own this relation
  // logic that decides the relation
  const dependentRecResults = node.dependsOn
    .map(depRelation => QueryDistributionRecursiveEval(distributions, scope, depRelation));
  const owner = scope.selectRelationEvalOwner(new Set(dependentRecResults.filter(d => d).map(r => r!.dbId)));

  // we need to check to see if we need to apply the default policy here
  dependentRecResults.map(result => {
    if (result) {
      distributions.push({
        relationName: result.relationName,
        from: result.dbId,
        to: owner,
        ...sharedPartialDistributionObj
      });
    }
  });

  const rType = scope.relationTypeLookup(relationId);
  if (rType === RelationType.EventView || rType === RelationType.Output) {
    // add an additional shipping
    distributions.push({
      relationName: relationId,
      from: owner,
      to: LocalDbId,
      ...sharedPartialDistributionObj
    });
    return {
      relationName: node.relationName,
      dbId: LocalDbId,
      fromDbId: owner,
    };
  }

  return {
    relationName: node.relationName,
    dbId: owner,
    fromDbId: owner,
  };
}

/**
 * there might be corner cases where the view is not shipped e.g. here V1 might not be shipped? it is
 *     V2
 *    / \
 *   V1  R
 *  / \
 * I   R
 */
export function getShippingInfoFromDistributedEval() {

}

const EventColumns: Column[] = [
  {
    cName: BuiltInColumn.TIMESTEP,
    dataType: DielDataType.Number,
  },
  {
    cName: BuiltInColumn.REQUEST_TIMESTEP,
    dataType: DielDataType.Number,
  }
];

export function GetColumnsFromSelection(selection: CompositeSelection): Column[] | null {
  const originalColumns = selection[0].relation.derivedColumnSelections;
  if (!originalColumns) {
    return LogInternalError(`query not normalized and cannot be distributed to main`);
  }
  const columns = originalColumns.map(c => {
    if (!c.alias) LogInternalError(`Alias should be defined for selection:\n${JSON.stringify(selection)}`);
    return {
      cName: c.alias,
      dataType: c.expr.dataType,
    };
  });
  return columns;
}

export function getEventViewCacheName(tableName: string) {
  return `${tableName}Cache`;
}

export function getEventViewCacheReferenceName(tableName: string) {
  return `${tableName}Reference`;
}

export type CacheTriplet = {
  cacheTable: SqlOriginalRelation,
  referenceTable: SqlOriginalRelation,
  view: SqlDerivedRelation
}

export function GetSqlOriginalRelationFromDielRelation(relation: Relation, addTimeColumns?: boolean): SqlOriginalRelation | null {
  switch (relation.relationType) {
    // when we turn an event into a table, the table is dynamic!
    case RelationType.EventTable: {
      const i = relation as OriginalRelation;
      return {
        relationType: SqlRelationType.Table,
        isDynamic: true,
        rName: i.rName,
        columns: addTimeColumns ? i.columns.concat(EventColumns) : i.columns
      };
    }
    case RelationType.ExistingAndImmutable:
    case RelationType.Table: {
      const i = relation as OriginalRelation;
      return {
        relationType: SqlRelationType.Table,
        rName: i.rName,
        columns: i.columns
      };
    }
    // when we turn a view into a table, the table is dynamic!
    case RelationType.Output:
    case RelationType.DerivedTable:
    case RelationType.View:
    case RelationType.EventView:
      const derived = relation as DerivedRelation;
      const originalColumns = GetColumnsFromSelection(derived.selection.compositeSelections);
      if (!originalColumns) {
        return LogInternalError(`Original columns not defined for ${relation.rName}`);
      }
      let createSpec: SqlOriginalRelation = {
        relationType: SqlRelationType.Table,
        isDynamic: true,
        rName: relation.rName,
        columns: addTimeColumns ? originalColumns.concat(EventColumns) : originalColumns
      };
      return createSpec;
    default:
      return LogInternalError(`Should all be handled, but ${relation.relationType} was not, for ${relation.rName}`, DielInternalErrorType.UnionTypeNotAllHandled);
  }
}

function makeCacheJoinClause(
  cacheRelationName: string,
  referenceRelationName: string): JoinAst {
  const dataId = "REQUEST_TIMESTEP"
  let returnVal: JoinAst = {
    astType: AstType.Join,
    joinType: JoinType.Inner,
    relation: {
      relationName: referenceRelationName,
      relationReferenceType: RelationReferenceType.Direct
    },
    predicate: {
      dataType: DielDataType.Boolean,
      exprType: ExprType.Func,
      functionType: FunctionType.Compare,
      functionReference: "=",
      args: [{
          exprType: ExprType.Column,
          relationName: cacheRelationName,
          columnName: dataId, 
          dataType: DielDataType.Number,
          hasStar: false
        }, { 
          exprType: ExprType.Column,
          relationName: referenceRelationName,
          columnName: dataId,
          dataType: DielDataType.Number,
          hasStar: false
        }
      ]
    }
  };
  return returnVal;
}


function getEventDerivedColumnSelections(
  cacheTableName: string,
  originalColumns:  Column[] 
  ): ColumnSelection[] {

    var cols: ColumnSelection[] = [];
    originalColumns.forEach(function(c) {
      cols.push({
          expr: {
            exprType: ExprType.Column,
            columnName: c.cName,
            relationName: cacheTableName,
            dataType: c.dataType,
      },
      alias: c.cName
    });
      
    })

   return cols;
}



export function GetCachedEventView(relation: DerivedRelation, addTimeColumns: boolean): CacheTriplet {
  const cacheName = getEventViewCacheName(relation.rName);
  const refName = getEventViewCacheReferenceName(relation.rName);
  const viewName = relation.rName;

  let originalColumns = GetColumnsFromSelection ( 
    relation.selection.compositeSelections
  ); 

  originalColumns.push({
    cName: "REQUEST_TIMESTEP",
    dataType: DielDataType.Number
  })

  const cacheTable: SqlOriginalRelation = {
    rName: cacheName,
    relationType: SqlRelationType.Table,
    columns: originalColumns
  }

  const referenceTable: SqlOriginalRelation = {
    rName: refName,
    relationType: SqlRelationType.Table,
    columns: [
      {
        cName: "TIMESTEP",
        dataType: DielDataType.Number
      }, {
        cName: "REQUEST_TIMESTEP",
        dataType: DielDataType.Number
      }
    ]
  }

  const view: SqlDerivedRelation = {
    rName: viewName,
    relationType: SqlRelationType.View,
    selection: [{
      op: SetOperator.NA,
      relation: {
        baseRelation: {
          relationName: cacheName,
          relationReferenceType: RelationReferenceType.Direct
        },

        columnSelections: getEventDerivedColumnSelections(cacheName, originalColumns),
        derivedColumnSelections: getEventDerivedColumnSelections(cacheName, originalColumns),
        joinClauses: [makeCacheJoinClause(cacheName, refName)],
      }
    }]
  }
  return {
    cacheTable: cacheTable,
    referenceTable: referenceTable,
    view: view
  };
  //return as an object.
}

/**
 * We need the relation, but also additional information about how it should be mapped.
 * @param relation
 */
export function GetSqlDerivedRelationFromDielRelation(relation: Relation): SqlDerivedRelation | null {
  switch (relation.relationType) {
    case RelationType.EventTable:
    case RelationType.Table:
    case RelationType.ExistingAndImmutable:
      return LogInternalError(`Cannot make table into views`);

    case RelationType.DerivedTable:
      return {
        rName: relation.rName,
        relationType: SqlRelationType.Table,
        selection: (relation as DerivedRelation).selection.compositeSelections
      };
    case RelationType.EventView:
    case RelationType.Output:
    case RelationType.DerivedTable:
    case RelationType.EventView:
    case RelationType.View: {
      return {
        rName: relation.rName,
        relationType: SqlRelationType.View,
        selection: (relation as DerivedRelation).selection.compositeSelections
      };
    }
    default:
      return LogInternalError(`Should all be handled, but ${relation.relationType} was not`, DielInternalErrorType.UnionTypeNotAllHandled);
  }
}

// only create tables for what outputs depend on
// and intersect that too, just just onestep is fine
export function findOutputDep(ast: DielAst, depTree: DependencyTree) {
  const outputDep = new Set<string>();
  GetAllOutputs(ast).map(o => {
    const dep = depTree.get(o.rName);
    if (dep) {
      dep.dependsOn.map(d => outputDep.add(d));
    } else {
      LogInternalError(`Dep for ${o.rName} not found`, DielInternalErrorType.RelationNotFound);
    }
  });
  return outputDep;
}