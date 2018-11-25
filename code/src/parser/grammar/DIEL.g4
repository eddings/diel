grammar DIEL;

queries : (
          outputStmt
           | viewStmt
           | programStmt
           | staticTableStmt
           | crossfilterStmt
           | templateStmt
           | insertQuery
           //  the rest does not require templating
           | dynamicTableStmt
           | inputStmt
           | registerTypeUdf
           | registerTypeTable
           | dropQuery
          )+;

staticTableStmt
  : CREATE TABLE IDENTIFIER AS selectQuery DELIM    # staticTableStmtSelect
  | CREATE WEBWORKER? TABLE IDENTIFIER relationDefintion DELIM # staticTableStmtDefined
  ;

registerTypeUdf
  : REGISTER UDF IDENTIFIER TYPE dataType DELIM
  ;

registerTypeTable
  : REGISTER WEBWORKER? TABLE tableName=IDENTIFIER '(' columnDefinition (',' columnDefinition)* ')' DELIM
  ;

templateStmt
  : CREATE TEMPLATE templateName=IDENTIFIER
    '(' IDENTIFIER (',' IDENTIFIER)* ')'
    (selectQuery | joinClause | relationDefintion)
    DELIM
  ;

crossfilterStmt
  : CREATE CROSSFILTER crossfilterName=IDENTIFIER ON relation=IDENTIFIER
    BEGIN crossfilterChartStmt+ END
    DELIM
  ;

crossfilterChartStmt
  : CREATE XCHART chart=IDENTIFIER
    AS definitionQuery=selectQuery
    WITH PREDICATE predicateClause=joinClause
    DELIM
  ;

dataType
  : INT | TEXT | BOOLEAN
  ;

columnDefinition
  : IDENTIFIER dataType columnConstraints*
  ;

constraintDefinition
  : PRIMARY KEY '(' IDENTIFIER (ASC|DESC)? (',' IDENTIFIER (ASC|DESC)?)* ')'
  | UNIQUE '(' IDENTIFIER (',' IDENTIFIER)*  ')'
  | CHECK (expr)
  ;

inputStmt
  : CREATE INPUT IDENTIFIER relationDefintion DELIM
  ;

dynamicTableStmt
  : CREATE DYNAMIC TABLE IDENTIFIER relationDefintion DELIM
  ;

relationDefintion
  :  '(' columnDefinition (',' columnDefinition)* (',' constraintDefinition)* ')' # relationDefintionSimple
  | templateQuery        # relationDefintionTemplate
  ;

outputStmt
  : CREATE OUTPUT IDENTIFIER AS selectQuery
    constraintClause
    DELIM
  ;

constraintClause
  :  CONSTRAIN (VIEW (viewConstraints)*)?
    (CHECK (expr))*
  ;

columnConstraints
  : UNIQUE
  | PRIMARY KEY
  | NOT NULL
  ;

viewConstraints
  : NOT NULL
  | SINGLE LINE
  ;

viewStmt
  : CREATE PUBLIC? VIEW IDENTIFIER AS selectQuery
    constraintClause
    DELIM
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
  | templateQuery                    # selectQueryTemplate
  ;

templateQuery
  : USE TEMPLATE templateName=IDENTIFIER '(' variableAssignment (',' variableAssignment)* ')'
  ;

dropQuery
  : DROP TABLE IDENTIFIER
  ;

variableAssignment
  : variable=IDENTIFIER '=' assignment=STRING
  ;

compositeSelect
  : setOp selectUnitQuery
  ;

setOp
  : UNION
  | INTERSECT
  | UNION ALL 
  | EXCEPT
  ;

selectUnitQuery
  : SELECT
    selectColumnClause (',' selectColumnClause)*
    (
      FROM
      relationReference
      joinClause*
      whereClause?
      groupByClause?
      orderByClause?
      limitClause?
    )?
  ;

// the seclectClauseCase is here and not in expr since it would allow for illegal expr
selectColumnClause
  : expr (AS IDENTIFIER)?  # selectClauseSpecific
  | (IDENTIFIER '.')? STAR # selectClauseAll
  ;

whereClause
  : WHERE expr
  ;

groupByClause
  : GROUP BY expr (',' expr)*
  ;

orderByClause
  : ORDER BY expr (',' expr)* (ASC|DESC)
  ;

insertQuery
  : INSERT INTO relation=IDENTIFIER
    '(' column=IDENTIFIER (',' column=IDENTIFIER)* ')' 
    insertBody
    DELIM
  ;

insertBody
  : VALUES '(' value (',' value)* ')' # insertQueryDirect
  | selectUnitQuery                   # insertQuerySelect
  ;

joinClause
  : (((LEFT OUTER)? JOIN) | ',') relationReference (ON expr)? # joinClauseBasic
  | templateQuery                                             # joinClauseTemplate
  ;

limitClause
  : LIMIT expr
  ;

relationReference
  : relation=IDENTIFIER (AS? alias=IDENTIFIER)?  # relationReferenceSimple
  | '(' selectQuery ')' (AS? alias=IDENTIFIER)?  # relationReferenceSubQuery
  ;

expr
  : unitExpr                                 # exprSimple
  | '(' expr ')'                             # exprParenthesis
  | function=IDENTIFIER '(' (expr ((COMMA|PIPE) expr))? ')' # exprFunction
  | expr (mathOp | compareOp | logicOp) expr          # exprBinOp
  | expr IS (NOT)? NULL                      # exprNull
  | (NOT)? EXIST '(' selectUnitQuery ')'     # exprExist
  | CASE WHEN expr THEN expr ELSE expr END   # exprWhen
  ;

unitExpr
  : columnSelection          # unitExprColumn
  | '(' selectUnitQuery ')'  # unitExprSubQuery // check to make sure it's a single value
  | value                    # unitExprValue
  ;

columnSelection
  : IDENTIFIER                                 # columnSelectionSimple
  | relation=IDENTIFIER '.' column=IDENTIFIER  # columnSelectionReference
  | IDENTIFIER '.' STAR                        # columnSelectionAll
  ;

value
  : NUMBER # valueNumber
  | STRING # valueString
  ;

mathOp
  : '+' 
  | '-' 
  | '*' 
  | '/' 
  ;

// still need to do has, exists etc.
compareOp
  : '='     
  | '!='    
  | '>='    
  | '>'     
  | '<='    
  | '<'     
  ;

logicOp
  : AND
  | OR
  ;


INPUT: 'INPUT' | 'input';
CROSSFILTER: 'CROSSFILTER' | 'crossfilter';
PREDICATE : 'PREDICATE' | 'predicate';
CONSTRAIN: 'CONSTRAIN' | 'constrain';
TEMPLATE: 'TEMPLATE' | 'template';
USE: 'USE' | 'use';
XCHART: 'XCHART' | 'xchart';
NAME: 'NAME' | 'name';
STATIC: 'STATIC' | 'static';
PUBLIC: 'PUBLIC' | 'public';
SINGLE: 'SINGLE' | 'single';
LINE: 'LINE' | 'line';
DYNAMIC: 'DYNAMIC' | 'dynamic';
REGISTER: 'REGISTER' | 'register';
TYPE: 'TYPE' | 'type';
UDF: 'UDF' | 'udf';
WEBWORKER: 'WEBWORKER' | 'webworker' | 'WebWorker';

// SQL
CREATE: 'CREATE' | 'create';
EXCEPT: 'EXCEPT' | 'except';
ALL: 'ALL' | 'all';
DROP: 'DROP' | 'drop';
CHECK: 'CHECK' | 'check';
UNIQUE: 'UNIQUE' | 'unique';
PRIMARY: 'PRIMARY' | 'primary';
FOREIGN: 'FOREIGN' | 'foreign';
REFERENCES: 'REFERENCES' | 'references';
KEY: 'KEY' | 'key';
TABLE: 'TABLE' | 'table';
VIEW: 'VIEW' | 'view';
INT: 'NUMBER' | 'number' | 'INTEGER' | 'integer' | 'INT' | 'int';
TEXT: 'STRING' | 'string' | 'TEXT' | 'text';
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
COMMA: ',';
PIPE: '||';
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
  : (LETTER | DIGIT | '_')* '{' (LETTER | DIGIT | '_')+ '}' (LETTER | DIGIT | '_')*
  | (LETTER | DIGIT | '_')+
  ;

test: STRING | IDENTIFIER;

WS  
  : (' ' | '\t' | '\r'| '\n' | EOF ) -> channel(HIDDEN)
  ;