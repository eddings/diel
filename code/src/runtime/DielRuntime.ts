import { ANTLRInputStream, CommonTokenStream } from "antlr4ts";
import { DIELLexer } from "../parser/grammar/DIELLexer";
import { DIELParser } from "../parser/grammar/DIELParser";

import { loadPage } from "../notebook/index";
import { Database, Statement } from "sql.js";
import { RuntimeCell, DielRemoteAction, DielRemoteMessage, RelationObject, DielRuntimeConfig, TableMetaData, DbType, RecordObject, } from "./runtimeTypes";
import { OriginalRelation, DerivedRelation, RelationType, SelectionUnit } from "../parser/dielAstTypes";
import { generateSelectionUnit, generateSqlFromDielAst } from "../compiler/codegen/codeGenSql";
import Visitor from "../parser/generateAst";
import { CompileDiel } from "../compiler/DielCompiler";
import { log } from "../lib/dielUdfs";
import { downloadHelper, SetIntersection, SetUnion, SetDifference } from "../lib/dielUtils";
import { LogInternalError, LogTmp, ReportUserRuntimeError, LogWarning, QueryConsoleColorSpec } from "../lib/messages";
import { DielIr } from "../compiler/DielIr";
import { SqlJsGetObjectArrayFromQuery, processSqlMetaDataFromRelationObject } from "./runtimeHelper";
import { DielPhysicalExecution, DbIdType, LocalDbId } from "../compiler/DielPhysicalExecution";
import Remote from "./Remote";
import { simpleMaterializeAst } from "../compiler/passes/materialization";

const StaticSqlFile = "./src/compiler/codegen/static.sql";


export const SqliteMasterQuery = `
  SELECT sql, name FROM sqlite_master WHERE type='table' and sql not null`;

type ReactFunc = (v: any) => void;
type OutputConfig = {
  notNull?: boolean,
};
const defaultOuptConfig = {
  notNull: false,
};

type TickBind = {
  outputName: string,
  uiUpdateFunc: ReactFunc,
  outputConfig: OutputConfig
};

type DbMetaData = {
  dbType: DbType;
};

export type PhysicalMetaData = {
  dbs: Map<DbIdType, DbMetaData>;
  relationLocation: Map<string, TableMetaData>;
};

export type NewInputManyFuncType = (view: string, o: RelationObject, lineage?: number) => void;

/**
 * DielIr would now take an empty ast
 * - we would then progressively add queries, also contains the setup logic with the db here
 * - there would be no sql and ts generation here as a result
 * - also use the DielIr internal functions to add the new queries
 *
 * FIXME: fix the DIEL congfig logic
 */
export default class DielRuntime {
  ir: DielIr;
  physicalExecution: DielPhysicalExecution;
  // constraintsQueries: string[];
  dbEngines: Remote[];
  workerDbPaths: string[];
  // derived information from remotes, maps tables to their locations
  physicalMetaData: PhysicalMetaData;
  runtimeConfig: DielRuntimeConfig;
  cells: RuntimeCell[];
  db: Database;
  visitor: Visitor;
  protected boundFns: TickBind[];
  protected output: Map<string, Statement>;

  constructor(runtimeConfig: DielRuntimeConfig) {
    // temp, fixme
    (<any>window).diel = this;
    this.runtimeConfig = runtimeConfig;
    this.cells = [];
    this.visitor = new Visitor();
    this.dbEngines = [];
    // the following are run time bindings for the reactive layer
    // this.input = new Map();
    this.output = new Map();
    this.physicalMetaData = {
      dbs: new Map(),
      relationLocation: new Map()
    };
    this.boundFns = [];
    this.runOutput = this.runOutput.bind(this);
    this.tick = this.tick.bind(this);
    this.BindOutput = this.BindOutput.bind(this);
    this.setup();
  }

  public BindOutput(outputName: string, reactFn: ReactFunc, cIn = {} as OutputConfig) {
    if (!this.output.has(outputName)) {
      ReportUserRuntimeError(`output not defined ${outputName}, from current outputs of: [${Array.from(this.output.keys()).join(", ")}]`);
    }
    // immtable
    const outputConfig = Object.assign({}, defaultOuptConfig, cIn);
    this.boundFns.push({outputName: outputName, uiUpdateFunc: reactFn, outputConfig });
    const staticRemote = this.findRemoteForOutput(outputName);
    if (staticRemote) {
      this.findRemote(staticRemote).GetStaticViewsForOutput(outputName);
    }
  }

  /**
   * GetView need to know if it's dependent on an event table
   *   in which case it will go and fetch the depdent events which are NOT depent on inputs
   *   it will also remember if this was done before
   *   add these special cases into physical execution logic
   * @param view
   */
  public GetView(view: string): RelationObject {
    // FIXME: refactor OuptConfig, not really needed
    return this.simpleGetLocal(view, defaultOuptConfig);
  }

  // verbose just to make sure that the exported type is kept in sync
  public NewInputMany: NewInputManyFuncType = (view: string, o: any, lineage?: number) => {
    this.newInputHelper(view, o, lineage);
  }

  // FIXME: gotta do some run time type checking here!
  // also fixme should use codegen and not string manipulation?
  // very inefficient, fixme
  public NewInput(i: string, o: any) {
    this.newInputHelper(i, [o]);
    // let tsI = Object.assign({$ts: timeNow()}, o);
    // TODO: check if the objects match
    // then add the dollar signs
    // const inStmt = this.input.get(i);

    // if (!inStmt) {
    //   ReportUserRuntimeError(`Input ${i} not found`);
    //   return;
    // }
    // const keys = Object.keys(o);
    // let newO: any = {};
    // keys.map(k => newO[`$${k}`] = o[k]);
    // inStmt.run(newO);
  }

  // FIXME: use AST instead of string manipulation...
  private newInputHelper(eventName: string, objs: any[], lineage?: number) {
    let columnNames: string[] = [];
    const eventDefinition = this.ir.GetEventByName(eventName);
    if (eventDefinition) {
      if (eventDefinition.relationType === RelationType.EventTable) {
        columnNames = (eventDefinition as OriginalRelation).columns.map(c => c.name);
      } else {
        columnNames = (eventDefinition as DerivedRelation)
          .selection.compositeSelections[0]
          .relation.derivedColumnSelections.map(c => c.alias);
      }
      // ${r.columns.map(c => c.name).map(v => `$${v}`).join(", ")}
      const rowQuerys = objs.map(o => {
        let values = ["max(timestep)"];
        columnNames.map(cName => {
          const raw = o[cName];
          if ((raw === null) || (raw === undefined)) {
            ReportUserRuntimeError(`We expected the input ${cName}, but it was not defined in the object.`);
          }
          if (typeof raw === "string") {
            values.push(`'${raw}'`);
          } else {
            values.push(raw);
          }
        });
        if (lineage) {
          return `select ${values.join(",")}, ${lineage} from allInputs`;
        } else {
          return `select ${values.join(",")} from allInputs`;
        }
      });
      // lazy
      let insertQuery;
      if (lineage) {
        insertQuery = `insert into ${eventName} (timestep, ${columnNames.join(", ")}, lineage)
        ${rowQuerys.join("\nUNION\n")};`;
      } else {
        insertQuery = `insert into ${eventName} (timestep, ${columnNames.join(", ")})
        ${rowQuerys.join("\nUNION\n")};`;
      }
      const finalQuery = `${insertQuery}
      insert into allInputs (inputRelation) values ('${eventName}');`;
      console.log(`%c ${finalQuery}`, QueryConsoleColorSpec);
      this.db.exec(finalQuery);
    } else {
      ReportUserRuntimeError(`Event ${eventName} is not defined`);
    }
  }

  // helper function to find Remotes that are in charge of the output
  findRemoteForOutput(output: string): DbIdType | null {
    for (let i = 0; i < this.dbEngines.length; i ++) {
      const remote = this.dbEngines[i];
      if (remote.staticShare.has(output)) {
        return remote.id;
      }
    }
    return null;
  }
  /**
   * this is the execution logic
   *   where we do distributed query execution
   *   and possibly materialization (basically can be in SQL triggers or our own even handling layer)
   */
  runOutput(b: TickBind) {
    const r = this.simpleGetLocal(b.outputName, b.outputConfig);
    if (r) {
      b.uiUpdateFunc(r);
    }
    return;
  }

  // this should only be ran once?
  tick() {
    const boundFns = this.boundFns;
    const runOutput = this.runOutput;
    const dependencies = this.ir.dependencies.inputDependenciesOutput;
    return (input: string) => {
      // note for Lucie: add constraint checking
      console.log(`%c tick ${input}`, "color: blue");
      const inputDep = dependencies.get(input);
      boundFns.map(b => {
        if (inputDep.has(b.outputName)) {
          runOutput(b);
        }
      });
    };
  }

  downloadDB() {
    let dRaw = this.db.export();
    let blob = new Blob([dRaw]);
    downloadHelper(blob,  "session");
  }

  simpleGetLocal(view: string, c: OutputConfig): RelationObject {
    const s = this.output.get(view);
    if (s) {
      s.bind({});
      let r = [];
      while (s.step()) {
        r.push(s.getAsObject());
      }
      if (c.notNull && r.length === 0) {
        throw new Error(`${view} should not be null`);
      }
      if (r.length > 0) {
        return r;
      } else {
        ReportUserRuntimeError(`${view} did not return any results.`);
      }
    } else {
      ReportUserRuntimeError(`${view} does not exist.`);
    }
    return null;
  }


  /**
   * sets up both the maindb and the worker
   * TODO: a local SQLite/Postgres instance
   */
  private async setup() {
    console.log(`Setting up DielRuntime with ${JSON.stringify(this.runtimeConfig)}`);
    await this.setupMainDb();
    await this.setupRemotes();
    await this.initialCompile();
    this.setupUDFs();
    const materialization = simpleMaterializeAst(this.ir);
    console.log(JSON.stringify(materialization, null, 2));
    // now parse DIEL
    // below are logic for the physical execution of the programs
    // we first do the distribution
    this.physicalExecution = new DielPhysicalExecution(this.ir, this.physicalMetaData);
    // now execute the physical views and programs
    this.updateRemotesBasedOnPhysicalExecution();
    this.executeToDBs();
    this.setupAllInputOutputs();
    loadPage();
  }

  async initialCompile() {
    this.visitor = new Visitor();
    // this adds the initial reigstration queries
    // first for local db
    const tableDefinitions = SqlJsGetObjectArrayFromQuery(this.db, SqliteMasterQuery);
    let code = processSqlMetaDataFromRelationObject(tableDefinitions);
    // processSqliteMasterMetaData(r).queries;
    // then for remotes
    for (let i = 0; i < this.dbEngines.length; i ++) {
      const db = this.dbEngines[i];
      const metadata = await db.getMetaData();
      code += metadata.map(m => m["sql"] + ";").join("\n");
      metadata.map(m => {
        const name = m["name"].toString();
        if (this.physicalMetaData.relationLocation.has(name)) {
          LogInternalError(`DBs should not have the same table names`);
        } else {
          this.physicalMetaData.relationLocation.set(name, {
            dbId: db.id
          });
        }
      });
    }
    for (let i = 0; i < this.runtimeConfig.dielFiles.length; i ++) {
      const f = this.runtimeConfig.dielFiles[i];
      code += await (await fetch(f)).text();
    }
    // read the files in now
    const codeWithLine = code.split("\n");
    console.log(`%c DIEL Code Generated:\n${codeWithLine.map((c, i) => `${i + 1}\t${c}`).join("\n")}`, "color: green");
    const inputStream = new ANTLRInputStream(code);
    const p = new DIELParser(new CommonTokenStream(new DIELLexer(inputStream)));
    const tree = p.queries();
    let ast = this.visitor.visitQueries(tree);
    this.ir = CompileDiel(new DielIr(ast));
  }

  async setupRemotes() {
    const inputCallback = this.NewInputMany.bind(this);
    let counter = LocalDbId;
    const workerWaiting = this.runtimeConfig.workerDbPaths
      ? this.runtimeConfig.workerDbPaths.map(path => {
        counter++;
        const remote = new Remote(DbType.Worker, counter, inputCallback);
        this.dbEngines.push(remote);
        return remote.setup(path);
      })
      : [];
    const socketWaiting = this.runtimeConfig.socketConnections
      ? this.runtimeConfig.socketConnections.map(socket => {
        counter++;
        const remote = new Remote(DbType.Socket, counter, inputCallback);
        this.dbEngines.push(remote);
        return remote.setup(socket.url, socket.dbName);
      })
      : [];
    await Promise.all(workerWaiting.concat(socketWaiting));
    return;
  }

  updateRemotesBasedOnPhysicalExecution() {

  }

  setupUDFs() {
    this.db.create_function("log", log);
    this.db.create_function("tick", this.tick());
    this.db.create_function("shipWorkerInput", this.shipWorkerInput.bind(this));
  }

  shipWorkerInput(inputName: string, timestep: number) {
    const remotesToShipTo = this.physicalExecution.getShippingInformationForInput(inputName);
    const shareQuery = `select * from ${inputName}`;
    let tableRes = this.db.exec(shareQuery)[0];
    if ((!tableRes) || (!tableRes.values)) {
      LogWarning(`Query ${shareQuery} has NO result`);
    }
    // FIXME: have more robust typing instead of quoting everything; look up types...
    const values = tableRes.values.map((d: any[]) => `(${d.map((v: any) => (v === null) ? "null" : `'${v}'`).join(", ")})`);
    let sql = `
      DELETE from ${inputName};
      INSERT INTO ${inputName} VALUES ${values};
    `;
    remotesToShipTo.forEach((remoteId => {
      const remote = this.findRemote(remoteId);
      if (remote) {
        const msg: DielRemoteMessage = {
          id: {
            lineage: timestep,
            input: inputName,
            remoteAction: DielRemoteAction.ShareInputAfterTick
          },
          sql,
        };
        remote.SendMsg(msg);
      }
    }));
  }

  findRemote(remoteId: DbIdType) {
    // some increment logic...
    const r = this.dbEngines[remoteId - 1];
    if (!r) {
      LogInternalError(`Remote ${remoteId} not found`);
    }
    return r;
  }

  /**
   * returns the DIEL code that will be ran to register the tables
   */
  private async setupMainDb() {
    // let dielCode = "";
    if (!this.runtimeConfig.mainDbPath) {
      this.db = new Database();
    } else {
      const response = await fetch(this.runtimeConfig.mainDbPath);
      const bufferRaw = await response.arrayBuffer();
      const buffer = new Uint8Array(bufferRaw);
      this.db = new Database(buffer);
      // debug
      (<any>window).mainDb = this.db;
      // FIXME: might have some weird issues with types of DIEL tables?
    }
    // and run the static file that we need
    const staticQuery = await (await fetch(StaticSqlFile)).text();
    this.db.run(staticQuery);
    return;
  }

  setupAllInputOutputs() {
    // this.ir.GetInputs().map(i => this.setupNewInput(i));
    this.ir.GetAllViews().map(o => this.setupNewOutput(o));
  }

  /**
   * output tables HAVE to be local tables
   *   since they are synchronous --- if they are over other tables
   *   it would be handled via some trigger programs
   */
  private setupNewOutput(r: DerivedRelation) {
    const q = `select * from ${r.name}`;
    this.output.set(
      r.name,
      this.dbPrepare(q)
    );
  }

  private dbPrepare(q: string) {
    try {
      return this.db.prepare(q);
    } catch (e) {
      console.log(`%c Had error ${e} while running query ${q}`, "color: red");
    }
  }

  /**
   * returns the results as an array of objects (sql.js)
   */
  ExecuteAstQuery(ast: SelectionUnit): RelationObject {
    const queryString = generateSelectionUnit(ast);
    return this.ExecuteStringQuery(queryString);
  }

  ExecuteStringQuery(q: string): RelationObject {
    let r: RelationObject = [];
    this.db.each(q, (row) => { r.push(row as RecordObject); }, () => {});
    return r;
  }

  // TODO low pri
  // ChangeQueryVersion(qId: QueryId, ) {
  // }

  AddQuery() {
    throw new Error(`not implemnted`);
    // const cId = this.generateQId();
    // const name = this.createCellName(cId);
  }

  ChangeQuery() {
    throw new Error(`not implemnted`);
    // const q = this.getQueryById(qId);
    // q.versions.push(query);
    // q.currentVersionIdx += 1;
    // bookkeeping the views?
    // refresh the annotation
  }

  // takes in teh SqlIrs in different environments and sticks them into the databases
  // FIXME: better async handling
  // also should fix the async logic
  executeToDBs() {
    LogTmp(`Executing queries to db`);
    const mainSqlQUeries = generateSqlFromDielAst(this.physicalExecution.getLocalDbAst());
    for (let s of mainSqlQUeries) {
      try {
        console.log(`%c Running Query in Main:\n${s}`, "color: purple");
        this.db.run(s);
      } catch (error) {
        LogInternalError(`Error while running\n${s}\n${error}`);
      }
    }
    // now execute to worker!
    this.physicalExecution.dbExecutionSpecs.forEach((remoteInfo, id) => {
      const remoteInstance = this.findRemote(id);
      const replace = remoteInstance.remoteType === DbType.Socket;
      const queries = generateSqlFromDielAst(remoteInfo.ast, replace);
      if (remoteInstance) {
        if (queries && queries.length > 0) {
          const sql = queries.join(";\n");
          console.log(`%c Running Query in Remote[${id}]:\n${sql}`, "color: pink");
          const msg: DielRemoteMessage = {
            id: {
              remoteAction: DielRemoteAction.DefineRelations
            },
            // action: "run",
            sql
          };
          remoteInstance.SendMsg(msg);
        }
      } else {
        LogInternalError(`Remote ${id} is not found!`);
      }
    });
  }

  // used for debugging
  inspectQueryResult(query: string) {
    let r = this.db.exec(query)[0];
    if (r) {
      console.log(r.columns.join("\t"));
      console.log(JSON.stringify(r.values).replace(/\],\[/g, "\n").replace("[[", "").replace("]]", "").replace(/,/g, "\t"));
      // console.table(r.columns);
      // console.table(r.values);
    } else {
      console.log("No results");
    }
  }
}