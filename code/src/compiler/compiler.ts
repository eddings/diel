import { ANTLRInputStream, CommonTokenStream } from "antlr4ts";
import * as parser from "../parser/grammar/DIELParser";
import * as lexer from "../parser/grammar/DIELLexer";

import templateVisitor from "../parser/compileTemplate";
import Visitor from "../parser/generateIr";
import { DielConfig } from "../parser/dielTypes";
import { modifyIrFromCrossfilter } from "./codeGenSql";
import { LogInfo } from "../lib/messages";

export function getIR(code: string, config?: DielConfig) {
  LogInfo("Starting compilation");
  const inputStream = new ANTLRInputStream(code);
  const l = new lexer.DIELLexer(inputStream);
  const tokenStream = new CommonTokenStream(l);
  const p = new parser.DIELParser(tokenStream);
  const tree = p.queries();
  let visitor = new Visitor();
  // template pass
  let ir = visitor.visitQueries(tree);
  // now the templates has been filled in
  if (config) {
    ir.config = config;
  }
  ir = modifyIrFromCrossfilter(ir);
  return ir;
}