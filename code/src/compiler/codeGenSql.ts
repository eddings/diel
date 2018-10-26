import { ANTLRInputStream, CommonTokenStream } from "antlr4ts";
import * as parser from "../parser/grammar/DIELParser";
import * as lexer from "../parser/grammar/DIELLexer";
import Visitor from "../parser/generateIr";
import { DielIr, ProgramSpecIr, DataType } from "../parser/dielTypes";
import * as fs from "fs";
import { LogInfo } from "../util/messages";

// then there will another pass where we do the networking logic.
// export function setupNetworking(ir: DielIr) {
// }

function triggerGeneric(program: ProgramSpecIr) {
  return `
create trigger allInputsTrigger after insert on allInputs
  begin
    select tick();
    ${program ? program.selectPrograms.map(insert => insert.query).join("\n") : ""}
    ${program ? program.insertPrograms.map(insert => insert.query).join("\n") : ""}
  end;`;
}

/**
 * simple case: latest X -> select * from X where timestep = select max(timestep) from X
 * filter case: latest X where P -> AND P
 */
// function transpileLatest() {
// }

function triggerTemplate(ir: DielIr) {
  let triggers = ir.inputs.map(i => {
    // also need to get the individual programs
    const matchingTrigger = ir.programs.filter(p => p.input === i.name);
    let programs = "";
    if (matchingTrigger.length > 0) {
      programs += matchingTrigger[0].insertPrograms.map(insert => insert.query).join("\n");
      programs += matchingTrigger[0].selectPrograms.map(insert => insert.query).join("\n");
    }
    return `
create trigger ${i.name}Trigger after insert on ${i.name}
begin
  insert into allInputs (timestep) values (null);
  ${programs}
end;
      `;
  });
  return triggers;
}

export function modifyIrFromCrossfilter(ir: DielIr) {
  // filtered & unfiltered
  // register filtered to output
  // returning arrays of arrays, should be flattened for execution
  ir.crossfilters.map(i => {
    return i.charts.map(c => {
      const viewQuery = `create view ${c.chartName}Unfiltered as ${c.definition};`;
      const viewIr = _getViewIr(viewQuery, ir);
      ir.views.push(viewIr);
      const otherCharts = i.charts.filter(c2 => c2.chartName !== c.chartName);
      const filteredJoins = otherCharts.map(o => o.predicate).join("\n");
      const outputQuery = `
          create output ${c.chartName}Filtered as
            select ${viewIr.selectQuery}
            from ${i.relation}
            ${filteredJoins}
            ${viewIr.selectBody.joinQuery}
            ${viewIr.selectBody.whereQuery}
            ${viewIr.selectBody.groupByQuery}
            ${viewIr.selectBody.orderByQuery}
           ;`;
      const outputIr = _getOutputIr(outputQuery, ir);
      ir.outputs.push(outputIr);
    });
  });
  return ir;
}

function _parse(query: string) {
  const inputStream = new ANTLRInputStream(query);
  const l = new lexer.DIELLexer(inputStream);
  const tokenStream = new CommonTokenStream(l);
  return new parser.DIELParser(tokenStream);
}

function _getOutputIr(outputQuery: string, ir: DielIr) {
  LogInfo(`Parsing Output\n ${outputQuery}`);
  const p = _parse(outputQuery);
  const tree = p.outputStmt();
  let visitor = new Visitor();
  visitor.setContext(ir);
  return visitor.visitOutputStmt(tree);
}

function _getViewIr(viewQuery: string, ir: DielIr) {
  LogInfo(`Parsing View\n ${viewQuery}`);
  const p = _parse(viewQuery);
  const tree = p.viewStmt();
  let visitor = new Visitor();
  visitor.setContext(ir);
  return visitor.visitViewStmt(tree);
}


// TODO
// function generateAsyncSql() {
// }
const TypeConversionLookUp = new Map<DataType, string>([
  [DataType.String, "TEXT"], [DataType.Number, "REAL"], [DataType.Boolean, "INTEGER"]
]);

export function genSql(ir: DielIr) {
  const inputQueries = ir.inputs.map(r => {
    return `
create table ${r.name} (timestep integer, timestamp real, ${r.columns.map(c => `${c.name} ${TypeConversionLookUp.get(c.type)}`).join(", ")})`;
  });
  const tableQueries = ir.tables.map(r => {
    if (r.query) {
      return r.query;
    } else {
      return `
create table ${r.name} (${r.columns.map(c => `${c.name} ${TypeConversionLookUp.get(c.type)}`).join(", ")})`;
    }
  });
  const viewQueries = ir.views.concat(ir.outputs).map(r => `
create view ${r.name} as ${r.query};`);
  const specificTriggers = triggerTemplate(ir);
  const genericProgramList = ir.programs.filter(p => (p.input) ? false : true);
  const genericProgram = genericProgramList.length > 0 ? genericProgramList[0] : null;
  const genericTrigger = triggerGeneric(genericProgram);
  const staticQueries = fs.readFileSync("./src/compiler/static.sql", "utf8");
  return [staticQueries, ...inputQueries, ...tableQueries, ...viewQueries, genericTrigger, ...specificTriggers];
}