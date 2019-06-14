import { STRICT } from "../runtime/DielRuntime";

export const FgRed = "\x1b[31m";
export const FgGreen = "\x1b[32m";
export const FgBlue = "\x1b[34m";
export const FgGray = "\x1b[90m";
export const Underscore = "\x1b[4m";
export const FgCyan = "\x1b[36m";
export const FgMagenta = "\x1b[35m";

export const BgRed = "\x1b[41m";
export const BgGreen = "\x1b[42m";
export const BgYellow = "\x1b[43m";

export const Reset = "\x1b[0m";

export enum DielInternalErrorType {
  Untitled = "Untitled",
  ArgNull = "ArgNull",
  TypeError = "TypeError",
  RelationNotFound = "RelationNotFound",
  NotImplemented = "NotImplemented",
  UnionTypeNotAllHandled = "UnionTypeNotAllHandled",
  MalFormedAst = "MalFormedAst",
  TestError = "TestError"
}

export enum DielInternalWarningType {
  Untitled = "Untitled",
  ArgNull = "ArgNull"
}

export function PrintCode(code: string) {
  const codeWithLine = code.split("\n").map((c, i) => `${i + 1}\t${c}`).join("\n");
  console.log(`DIEL Code\n%s}`, codeWithLine);
}

export function LogSetup(m: string) {
  console.log(`${FgMagenta}${m}${Reset}`);
}

export function LogExecutionTrace(m: string, obj?: any) {
  // return null;
  console.log(`${FgGray}%s${Reset}`, m, obj ? obj : "");
}

export function LogTest(m: string, obj?: any) {
  console.log(`${FgCyan}%s${Reset}`, m, obj ? obj : "");
}

export function LogInternalError(m: string, errorType = DielInternalErrorType.Untitled): null {
  const message = `Error[${errorType}]: ${m}`;
  if (STRICT) {
    debugger;
    throw new Error(message);
  } else {
    console.log(`${FgRed}${message}${Reset}`);
  }
  return null;
}

export function LogInternalWarning(m: string, wariningType = DielInternalWarningType.Untitled) {
  console.log(`${FgMagenta}[${wariningType}]%s${Reset}`, m);
}

export function LogInfo(m: string, obj?: any) {
  if (obj) {
    console.log(`${FgBlue}%s${Reset}`, m, obj);
  } else {
    console.log(`${FgBlue}%s${Reset}`, m);
  }
}

export function LogTmp(m: string) {
  console.log(`${FgGray}${m}${Reset}`);
}

export function LogStandout(m: string) {
  console.log(`${BgYellow}%s${Reset}`, m);
}

export function ReportDielBasicParsingError(m: string) {
  console.log(`${FgRed}Parsing error from user provided code:\n%s${Reset}`, m);
  if (STRICT) throw new Error();
}

export function ReportUserRuntimeWarning(m: string): null {
  console.log(`${FgMagenta}[User Error]%s${Reset}`, m);
  return null;
}

// note that this is in browser
export function ReportUserRuntimeError(m: string): null {
  if (STRICT) throw new Error(m);
  console.log(`${BgYellow}[User Error]%s${Reset}`, m);
  return null;
}

// both warning and error
export enum UserErrorType {
  UndefinedScale = "UndefinedScale",
}

// TODO: this should also report the line of the code
// the input should be more structured
export function ReportDielUserError(m: string, q?: string, errorType?: UserErrorType): null {
  console.log(`${FgRed}%s${Reset}`, m);
  if (STRICT) throw new Error();
  return null;
}

export function ReportDielUserWarning(m: string, q?: string) {
  console.log(`User Warning: ${FgMagenta}%s${Reset}`, m);
  if (q) console.log(`\nQuery: ${FgMagenta}%s${Reset}\n`, q);
}

export function sanityAssert(b: boolean, msg: string) {
  if (!b) {
    LogInternalError(`Assertion error: ${msg}`);
  }
}