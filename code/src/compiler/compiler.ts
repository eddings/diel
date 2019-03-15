/// <reference path="../@types/sql-formatter/index.d.ts" />a
import { ANTLRInputStream, CommonTokenStream } from "antlr4ts";
import * as parser from "../parser/grammar/DIELParser";
import * as lexer from "../parser/grammar/DIELLexer";
import Visitor from "../parser/generateAst";
import { inferTypeForSelection } from "./passes/inferType";
import { diel } from "../notebook/setup";

export function parse(code: string) {
  const inputStream = new ANTLRInputStream(code);
  const l = new lexer.DIELLexer(inputStream);
  const tokenStream = new CommonTokenStream(l);
  return new parser.DIELParser(tokenStream);
}

export function getSelectionUnitAst(code: string) {
  const inputStream = new ANTLRInputStream(code);
  const l = new lexer.DIELLexer(inputStream);
  const tokenStream = new CommonTokenStream(l);
  const p = new parser.DIELParser(tokenStream);
  const tree = p.selectUnitQuery();
  let visitor = new Visitor();
  let selectionUnitAst = visitor.visitSelectUnitQuery(tree);
  // FIXME: limitation: do not use stars
  // normalizeColumnSelection
  inferTypeForSelection(selectionUnitAst, {ir: diel.ir});
  // inferType
  return selectionUnitAst;
}

