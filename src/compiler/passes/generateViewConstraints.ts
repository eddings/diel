import { DielDataType, RelationType, DerivedRelation, CompositeSelection, SelectionUnit, ColumnSelection, RelationSelection, RelationReference, GroupByAst } from "../../parser/dielAstTypes";
import {generateViewConstraintSelection, generateExpr} from "../../compiler/codegen/codeGenSql";
import { DielAst, RelationConstraints, ExprAst, ExprParen, ExprColumnAst, ExprValAst, ExprType, FunctionType, BuiltInFunc, ExprFunAst } from "../../parser/dielAstTypes";
import { GetAllDerivedViews } from "../DielIr";

/**
 * Takes in an ast and check if its views broke their constraints.
 * If they did, return a map of view names to list of select queries for constraint checking
 * Map { view name => [[generated select query, which constraint was broken]] }
 */
export function checkViewConstraint(ast: DielAst): Map<string, string[][]> {
  let ret = new Map<string, string[][]>();

  // Handling multiple view statements
  const views = GetAllDerivedViews(ast);

  for (let view of views) {
    let viewConstraint = view.constraints;
    let queries = [] as string[][];
    let selClause;

    // Only when there is a constraint on view
    if (viewConstraint) {
      let composite_selections = view.selection.compositeSelections as CompositeSelection;

      // 1. handle null constraint
      selClause = getSelectClauseAST(composite_selections);
      let nullQueries = getNullQuery(viewConstraint, selClause);
      queries = queries.concat(nullQueries);

      // 2. handle unique constraint
      selClause = getSelectClauseAST(composite_selections);
      let uniqueQueries = getUniqueQuery(viewConstraint, selClause);
      queries = queries.concat(uniqueQueries);

      // 3. handle check constraint
      selClause = getSelectClauseAST(composite_selections);
      let checkQueries = getCheckQuery(viewConstraint, selClause);
      queries = queries.concat(checkQueries);
    }
    ret.set(view.name, queries);
  }
  return ret;
}

/**
 * Takes in a selection clause ast and copy/re-format so that
 * it can go inside where clause.
 * e.g) where (select a1, a2 from t1 where a1 < 10)
 */
function getSelectClauseAST(fromSel: CompositeSelection): SelectionUnit {
    let columnSel = {} as ColumnSelection;
    columnSel.expr = {
      exprType: ExprType.Column,
      dataType: DielDataType.TBD,
      hasStar: true
    } as ExprAst;

    let baseRelation = {
      subquery: {
        compositeSelections: fromSel
      } as RelationSelection
    } as RelationReference;

    let selUnit;
    selUnit = {
      columnSelections: [columnSel],
      baseRelation: baseRelation,
      derivedColumnSelections: [],
      joinClauses: [],
      groupByClause: null,
      orderByClause: null,
      limitClause: null
    } as SelectionUnit;
    return selUnit;
}

function getCheckQuery(view_constraint: RelationConstraints, selUnit: SelectionUnit): string[][] {
  let exprAsts = view_constraint.exprChecks;
  let ret = [] as string[][];
  let whichConstraint: string;
  if (exprAsts && exprAsts.length > 0) {
    let i, exprAst, whereClause;
    // iterate over check constraints
    for (i = 0; i < exprAsts.length; i++) {
      // ast for where clause
      exprAst = exprAsts[i] as ExprParen;

      // where in the query it was broken
      whichConstraint = "CHECK " + generateExpr(exprAst);
      whereClause = {
        exprType: ExprType.Func,
        dataType: DielDataType.Boolean,
        functionType: FunctionType.Custom,
        functionReference: "NOT",
        args: [exprAst.content] // strip out parenthesis
      } as ExprFunAst;

      // ast for the whole clause
      selUnit.whereClause = whereClause;
      let str = generateViewConstraintSelection(selUnit);
      ret.push([str, whichConstraint]);
    }
  }
  return ret;
}


function getNullQuery(view_constraint: RelationConstraints, selUnit: SelectionUnit): string[][] {
  // console.log(JSON.stringify(view_constraint, null, 2));
  let ret = [] as string[][];
  if (view_constraint.notNull && view_constraint.notNull.length > 0) {

    let notNullColumns = view_constraint.notNull;
    let i;
    for (let i in notNullColumns) {
      // formating the AST for whereclause
      let whereClause = {
        exprType : ExprType.Func,
        dataType : DielDataType.Boolean,
        functionType : FunctionType.BuiltIn,
        functionReference : BuiltInFunc.ValueIsNull,
        args : [] as ExprValAst[]
      } as ExprFunAst;

      // format argument AST
      let whereClauseArg;
      let cname = notNullColumns[i];

      // generate original query
      let originalAST = {
        exprType: ExprType.Func,
        functionType: FunctionType.BuiltIn,
        functionReference: BuiltInFunc.ValueIsNotNull,
        args: [{
          exprType: ExprType.Column,
          columnName: cname,
          hasStar: false
        } as ExprAst]
      } as ExprAst;

      // console.log(generateExpr(originalAST));
      let whichConstraint = cname + " NOT NULL";

      whereClauseArg = {
        exprType: ExprType.Column,
        dataType: DielDataType.TBD,
        hasStar: false,
        columnName: cname
      } as ExprColumnAst;

      whereClause.args.push(whereClauseArg);

      // formatting the rest of the selection unit for Not NULl
      selUnit.whereClause = whereClause;

      // Generate proper query from AST
      let str = generateViewConstraintSelection(selUnit);
      ret.push([str, whichConstraint]);
    }
  }
  return ret;
}

function getUniqueQuery (view_constraints: RelationConstraints, selUnit: SelectionUnit): string[][] {
  let ret = [] as string[][];
  let uniques = view_constraints.uniques;

  // check if unique constraint exists
  if (uniques && uniques.length > 0) {
    let str, i, j, groupbyArgs, groupbyColName, groupByClause, groupbySel, predicateSel;
    // uniques = [ [ 'a1', 'a2' ], [ 'a3' ] ]

    for (i = 0; i < uniques.length; i++) {
      groupbyArgs = uniques[i];
      // which constraint it was broken
      let whichConstraint = `UNIQUE (${groupbyArgs})`;
      let groupbySelections = [] as ExprColumnAst[];


      // format groupby AST
      // which coloum to group by
      groupbyArgs.map(function(colName) {
        let expr = {
          exprType: ExprType.Column,
          dataType: DielDataType.TBD,
          hasStar: false,
          columnName: colName
        } as ExprColumnAst;
        groupbySelections.push(expr);
      });


      // format having clause AST
      predicateSel = {
        exprType: ExprType.Func,
        functionType: FunctionType.Logic,
        functionReference: ">",
        dataType: DielDataType.Boolean,
        args : [
          {
            exprType: ExprType.Func,
            dataType: DielDataType.TBD,
            functionType: FunctionType.Custom,
            functionReference: "COUNT",
            args: [{
                    exprType: ExprType.Column,
                    dataType: DielDataType.TBD,
                    hasStar: true
                }]
          },
          {
            exprType: ExprType.Val,
            dataType: DielDataType.Number,
            value: 1
          } as ExprValAst
        ] as ExprAst[]
      } as ExprFunAst;

      // format the whole groupby clause AST
      groupByClause = {
        selections: groupbySelections,
        predicate: predicateSel
      } as GroupByAst;


      selUnit.groupByClause = groupByClause;

      // change selUnit select clause
      let selectColumns = [] as ColumnSelection[];
      groupbySelections.map(expr => {
        selectColumns.push({expr});
      });
      selectColumns.push({
        expr: {
          exprType: ExprType.Func,
          dataType: DielDataType.TBD,
          functionType: FunctionType.Custom,
          functionReference: "COUNT",
          args: [
            {
              exprType: ExprType.Column,
              dataType: DielDataType.TBD,
              hasStar: true
            }]}} as ColumnSelection);

      selUnit.columnSelections = selectColumns as ColumnSelection[];

      // Generate proper query from AST
      str = generateViewConstraintSelection(selUnit);
      ret.push([str, whichConstraint]);

    }
  }
  return ret;
}




