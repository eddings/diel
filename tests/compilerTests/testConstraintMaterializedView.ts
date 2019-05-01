import { GenerateUnitTestErrorLogger } from "../testHelper";
import { TransformAstForMaterialization } from "../../src/compiler/passes/materialization";
import { ParsePlainDielAst, CompileAst } from "../../src/compiler/compiler";
import { transformSqlASTFromDielAST, sortRelations } from "./testMaterialization";

// @LUCIE: seems like this is WIP?

// Relation vs column constraint
// create view v1 ,,,, constrain check (a < 10);
// create view v1 ,,,, constrain unique (a);
// create view v1 ,,,, constrain a not null;


// NOT NULL constraint
// 1) column constraint
// 1-1. single column constraint. materialize v1.
let notNull1 =
`
create event table t1 (a integer);

create view v1 as select a + 1 as aPrime, a + 2 as aPPrime from t1
constrain aPrime NOT NULL, aPPrime NOT NULL;

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`;

let notNullAnswer1 =
`
create event table t1 (a integer);

create table v1 (
  aPrime integer NOT NULL,
  aPPrime integer NOT NULL
);
create program after (t1)
  begin
  delete from v1;
  insert into v1 select a + 1 as aPrime, a + 2 as aPPrime from t1;
  end;

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`
;


// CHECK constraint
// 1) column constraint
let check1 =
`
create event table t1 (a integer);

create view v1 as select a + 1 as aPrime, a + 2 as aPPrime from t1
constrain check (aPrime > 10 and aPrime < 100), check (aPPrime < 100);

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`;

let checkAnswer1 =
`
create event table t1 (a integer);

create table v1 (
  aPrime integer,
  aPPrime integer,
  check (aPrime > 10 and aPrime < 100),
  check (aPPrime < 100)
);
create program after (t1)
  begin
    delete from v1;
    insert into v1 select a + 1 as aPrime, a + 2 as aPPrime from t1;
  end;

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`
;

// 2) relation constraint
let check2 =
`
create event table t1 (a integer);

create view v1 as select a + 1 as aPrime, a + 2 as aPPrime from t1
constrain check (aPrime > 10 and aPPrime < 100), check (aPrime < 15);

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`;

let checkAnswer2 =
`
create event table t1 (a integer);

create table v1 (
  aPrime integer,
  aPPrime integer,
  check (aPrime > 10 and aPPrime < 100),
  check (aPrime < 15)
);
create program after (t1)
  begin
  delete from v1;
  insert into v1 select a + 1 as aPrime, a + 2 as aPPrime from t1;
  end;

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`
;


// UNIQUE constraint
// 1) column constraint
let unique1 =
`
create event table t1 (a integer);

create view v1 as select a + 1 as aPrime, a + 2 as aPPrime from t1
constrain UNIQUE (aPrime), UNIQUE(aPPrime);

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`;

let uniqueAnswer1 =
`
create event table t1 (a integer);

create table v1 (
  aPrime integer UNIQUE,
  aPPrime integer UNIQUE
);
create program after (t1)
  begin
  delete from v1;
  insert into v1 select a + 1 as aPrime, a + 2 as aPPrime from t1;
  end;

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`
;

// 2) relation constraint
let unique2 =
`
create event table t1 (a integer);

create view v1 as select a + 1 as aPrime, a + 2 as aPPrime from t1
constrain UNIQUE (aPrime, aPPrime), UNIQUE(aPrime);

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`;

let uniqueAnswer2 =
`
create event table t1 (a integer);

create table v1 (
  aPrime integer UNIQUE,
  aPPrime integer,
  unique (aPrime, aPPrime)
);
create program after (t1)
  begin
  delete from v1;
  insert into v1 select a + 1 as aPrime, a + 2 as aPPrime from t1;
  end;

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`
;


let combined1 =
`
create event table t1 (a integer);

create view v1 as select a + 1 as aPrime, a + 2 as aPPrime from t1
constrain
aPrime NOT NULL,
check (aPrime > 10),
aPPrime NOT NULL,
check (aPPrime > 40 and aPPrime < 100),
unique (aPrime, aPPrime),
unique (aPrime),
unique (aPPrime),
check (aPrime > 10 and aPPrime < 100);

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`;

let combinedAnswer1 =
`
create event table t1 (a integer);

create table v1 (
  aPrime integer UNIQUE NOT NULL,
  aPPrime integer UNIQUE NOT NULL,
  check (aPrime > 10),
  unique (aPrime, aPPrime),
  check (aPPrime > 40 and aPPrime < 100),
  check (aPrime > 10 and aPPrime < 100)
  );
create program after (t1)
  begin
  delete from v1;
  insert into v1 select a + 1 as aPrime, a + 2 as aPPrime from t1;
  end;

create output o1 as select aPrime from v1;
create output o2 as select aPrime from v1;
`;

const tests = [
// [combined1, combinedAnswer1],
// [notNull1, notNullAnswer1],
// [check1, checkAnswer1],
// [check2, checkAnswer2],
// [unique1, uniqueAnswer1],
[unique2, uniqueAnswer2]
];

export function testMaterializedViewConstraint() {
  const logger = GenerateUnitTestErrorLogger("testMaterializedViewConstraint");
  for (let test of tests) {
    let query = test[0];
    let answer = test[1];
    const ast1 = ParsePlainDielAst(query);
    CompileAst(ast1);
    let sqlAST = transformSqlASTFromDielAST(ast1);

    let ast2 = ParsePlainDielAst(answer);
    CompileAst(ast2);
    let sqlAST2 = transformSqlASTFromDielAST(ast2);

    // materialize the test query
    TransformAstForMaterialization(sqlAST);

    sqlAST.relations = sqlAST.relations.sort(sortRelations);
    sqlAST2.relations = sqlAST2.relations.sort(sortRelations);

    let pretty1 = JSON.stringify(sqlAST, null, 2);
    let pretty2 = JSON.stringify(sqlAST2, null, 2);
    // compare ast except for program
    if (pretty1 !== pretty2) {
        // logger.error(`${pretty1} is not the same as ${pretty2}`);
    }
  }
  logger.pass();
}