import { DielIr } from "../parser/dielTypes";
import { ReportDielUserError } from "../lib/messages";

// this pass should inforce the following constraints:
// - there should only be one program that's generic
// - all the columns should match the columsn that exists in the actual tables
// - check that the generic program does not reference the relation new
// - also make sure that the number of inserts match the number of selects in a state program

export function sanityIr(ir: DielIr) {
  // TODO: no relation has no columns
  ir.dynamicTables.map(r => {
    if (r.columns.length === 0) {
      ReportDielUserError(`Table ${r.name} contains no columns`);
    }
  });
  return true;
  // TODO: all referenced columns actually exists; do a typo check, also do a name check to see if it exists in other tables
  // TODO: make sure that there is only one general program
  // TODO: check that static tables are not inserted from any inputs
}