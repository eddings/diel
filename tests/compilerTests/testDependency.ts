import { DerivedRelation, Relation } from "../../src/parser/dielAstTypes";
import { GetAllDerivedViews } from "../../src/compiler/DielIr";
import { GetDependenciesFromViewList, getOriginalRelationsDependedOn } from "../../src/compiler/passes/dependency";
import { IsSetIdentical } from "../../src/util/dielUtils";
import { GenerateUnitTestErrorLogger } from "../testHelper";
import { getDielIr } from "../../build/src/compiler/compiler";

export function testGetOriginalRelationsDependedOn() {
  const logger = GenerateUnitTestErrorLogger("testGetOriginalRelationsDependedOn", q1);
  let ir = getDielIr(q1);
  let ast = ir.ast;
  const views = GetAllDerivedViews(ast);
  const deps = GetDependenciesFromViewList(views);

  let originalRelations = [] as string[];
  ir.GetOriginalRelations().forEach(function(value: Relation) {
    originalRelations.push(value.rName);
  });

  views.forEach(function(view: DerivedRelation) {
    let dependedTables = getOriginalRelationsDependedOn(view, deps, originalRelations);
    if (!IsSetIdentical(answer.get(view.rName), dependedTables)) {
      logger.error(`Two sets are not the same.`, {expected: answer.get(view.rName), got: dependedTables});
    }
  });
  logger.pass();
}

let answer = new Map<string, Set<string>>();
answer.set("v1", new Set(["t1"]));
answer.set("v2", new Set(["t1"]));
answer.set("v3", new Set(["t1", "t2"]));
answer.set("v4", new Set(["t1", "t2"]));
answer.set("v5", new Set(["t1", "t2", "t3"]));
answer.set("v6", new Set(["t1", "t2"]));


/**
 *
     t1   t2
      | \ /
     v1  v3
       \   \
       v2   v4   t3
         /  \  /
        v6  v5
*/
let q1 =
`
create event table t1 (a integer);
create event table t2 (b integer);
create event table t3 (c integer);

create view v1 as select * from t1;
create view v2 as select * from v1;
create view v3 as select * from t1 join t2 on t1.a = t2.b;
create view v4 as select * from v3;
create view v5 as select * from v4, t3;
create view v6 as select * from v4;
`;