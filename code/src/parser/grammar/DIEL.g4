grammar DIEL;

queries : (inputStmt | outputStmt | programStmt | tableStmt | viewStmt | crossfilterStmt | templateStmt) +;

templateStmt
  : CREATE TEMPLATE templateName=IDENTIFIER '(' IDENTIFIER (',' IDENTIFIER)* ')' selectQuery
  ;

crossfilterStmt
  : CREATE CROSSFILTER crossfilterName=IDENTIFIER ON relation=IDENTIFIER
    BEGIN crossfilterChartStmt+ END ';'
  ;

crossfilterChartStmt
  : OUTPUT chart=IDENTIFIER
    AS definitionQuery=selectQuery
    WITH PREDICATE predicateClause=joinClause ';'
  ;

columnType
  : INT | TEXT | BOOLEAN
  ;
  
columnDefinition
  : IDENTIFIER columnType
  ;

inputStmt
  : CREATE INPUT relationDefintion
  ;

tableStmt
  : CREATE TABLE relationDefintion
  | CREATE TABLE AS compositeSelect
  ;

relationDefintion
  : IDENTIFIER '(' columnDefinition (',' columnDefinition)* ')' DELIM
  ;

outputStmt
  : CREATE OUTPUT IDENTIFIER AS selectQuery ';'
  ;
  
viewStmt
  : CREATE VIEW IDENTIFIER AS selectQuery ';'
  ;

programStmt
  : CREATE PROGRAM programBody ';'                  # programStmtGeneral
  | CREATE PROGRAM AFTER IDENTIFIER programBody ';' # programStmtSpecific
  ;

programBody
  : BEGIN (insertQuery | selectQuery)+ END
  ;

selectQuery
  : selectUnitQuery compositeSelect* # selectQueryDirect
  | USE TEMPLATE templateName=IDENTIFIER '(' variableAssignment (',' variableAssignment)* ')'   # selectQueryTemplate
  ;

variableAssignment
  : variable=STRING '=' assignment=STRING
  ;

compositeSelect
  : compoundOp=(UNION|INTERSECT) selectUnitQuery
  ;

selectUnitQuery
  : SELECT selectClause (',' selectClause)* selectBody # selectQuerySpecific
  | SELECT STAR selectBody                             # selectQueryAll
  | SELECT value (',' value)*                          # selectQueryStatic
  ;

selectBody
  : FROM relationReference joinClause* whereClause? groupByClause? orderByClause? limitClause?
  ;

groupByClause
  : GROUP BY expr (',' expr)*
  ;

orderByClause
  : ORDER BY expr (',' expr)* (ASC|DESC)
  ;

insertQuery
  : INSERT INTO relation=IDENTIFIER '(' column=IDENTIFIER (',' column=IDENTIFIER)* ')' insertBody DELIM
  ;

insertBody
  : VALUES '(' value (',' value)* ')' # insertQueryDirect
  | selectUnitQuery                   # insertQuerySelect
  ;

value
  : NUMBER # valueNumber
  | STRING # valueString
  ;

joinClause
  : (LEFT OUTER)? JOIN relationReference (ON predicates)?
  ;

whereClause
  : WHERE predicates
  ;

limitClause
  : LIMIT NUMBER                  # limitClauseSimple
  | LIMIT '(' selectUnitQuery ')' # limitClauseQuery
  ;

relationReference
  : relation=IDENTIFIER (AS? alias=IDENTIFIER)?  # relationReferenceSimple
  | '(' selectQuery ')' (AS? alias=IDENTIFIER)?  # relationReferenceSubQuery
  ;

// the seclectClauseCase is here and not in expr since it would allow for illegal expr
selectClause
  : expr (AS IDENTIFIER)?
  ;

expr
  : unitExpr                                         # exprSimple
  | value                                             # exprStatic
  | function=IDENTIFIER '(' (funExpr)?  ')'           # exprFunction
  | expr mathOp expr                                  # exprMath
  | CASE WHEN predicates THEN expr ELSE expr END      # exprWhen
  | 'group_concat' '(' unitExpr ('||' unitExpr)*  ')' # exprGroupConcat
  ;

unitExpr
  : columnSelection # unitExprColumn
  | NUMBER          # unitExprNumber
  | STRING          # unitExprString
  ;

funExpr
  : expr (',' expr)* 
  | STAR
  | relation=IDENTIFIER '.' STAR
  ;

columnSelection
  : IDENTIFIER                                 # columnSelectionSimple
  | relation=IDENTIFIER '.' column=IDENTIFIER  # columnSelectionReference
  | IDENTIFIER '.' STAR                        # columnSelectionAll
  ;

predicates
  : singlePredicate                # predicateClauseSingle
  | predicates AND singlePredicate # predicateClauseAnd
  | predicates OR singlePredicate  # predicateClauseOr
  ;

singlePredicate
  : expr compareOp expr                     # singlePredicateColumns
  | expr IS (NOT)? NULL                     # singlePredicateNull
  | expr compareOp NUMBER                   # singlePredicateNumber
  | expr compareOp '(' selectUnitQuery ')'  # singlePredicateSubQuery
  | NOT EXIST '(' selectUnitQuery ')'       # singlePredicateNotExist
  ;

mathOp
  : '+' #mathOpAdd
  | '-' #mathOpSub
  | '*' #mathOpMul
  | '/' #mathOpDiv
  ;

// still need to do has, exists etc.
compareOp
  : '='     # compareOpEqual
  | '>='    # compareOpGE
  | '>'     # compareOpGreater
  | '<='    # compareOpLE
  | '<'     # compareOpLess
  | funExpr # compareOpFunction 
  ;

CREATE: 'CREATE' | 'create';
INPUT: 'INPUT' | 'input';
CROSSFILTER: 'CROSSFILTER' | 'crossfilter';
PREDICATE : 'PREDICATE' | 'predicate';
TEMPLATE: 'TEMPLATE' | 'template';
USE: 'USE' | 'use';

// SQL
TABLE: 'TABLE' | 'table';
VIEW: 'VIEW' | 'view';
INT: 'NUMBER' | 'number';
TEXT: 'STRING' | 'string';
BOOLEAN: 'BOOLEAN' | 'boolean';
OUTPUT: 'OUTPUT' | 'output';
PROGRAM: 'PROGRAM' | 'program';
AFTER: 'AFTER' | 'after';
BEGIN: 'BEGIN' | 'begin';
END: 'END' | 'end';
WITH: 'WITH' | 'with';
INSERT: 'INSERT' | 'insert';
INTO: 'INTO' | 'into';
STAR: '*';
VALUES: 'VALUES' | 'values';
AS: 'AS' | 'as';
SELECT: 'SELECT' | 'select';
FROM: 'FROM' | 'from';
JOIN: 'JOIN' | 'join';
ON: 'ON' | 'on';
WHERE: 'WHERE' | 'where';
LIMIT: 'LIMIT' | 'limit';
EXIST: 'EXIST' | 'exist';
GROUP: 'GROUP' | 'group';
BY: 'BY' | 'by';
AND: 'AND' | 'and';
OR: 'OR' | 'or';
MINUS: '-';
DELIM: ';';
INTERSECT : 'INTERSECT' | 'intersect';
UNION: 'UNION' | 'union';
LEFT: 'LEFT' | 'left';
OUTER: 'OUTER' | 'outer';
CASE: 'CASE' | 'case';
WHEN: 'WHEN' | 'when';
THEN: 'THEN' | 'then';
ELSE: 'ELSE' | 'else';
IS: 'IS' | 'is';
NULL: 'NULL' | 'null';
NOT: 'NOT' | 'not';
ORDER: 'ORDER' | 'order';
ASC: 'ASC' | 'asc';
DESC: 'DESC' | 'desc';

fragment DIGIT
  : [0-9]
  ;

fragment LETTER
  : [A-Z]
  | [a-z]
  ;

SIMPLE_COMMENT
  : '--' ~[\r\n]* '\r'? '\n'? -> channel(HIDDEN)
  ;

NUMBER
  : MINUS? (DIGIT)+
  ;

STRING
  : '\'' IDENTIFIER '\''
  ;

IDENTIFIER
  : (LETTER | DIGIT | '_')+
  | '${' (LETTER | DIGIT | '_')+ '}'
  ;

WS  
  : (' ' | '\t' | '\r'| '\n' | EOF ) -> channel(HIDDEN)
  ;