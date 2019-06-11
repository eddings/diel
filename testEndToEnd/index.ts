import * as path from "path";

import { DielRuntime, DbSetupConfig, DbType, RelationObject } from "../src";
import { LocalDbId } from "../build/src/compiler/DielPhysicalExecution";

/**
 * LUCIE TODO:
 * - put the worker.sql.js file into endToEnd
 * - put the data (.sqlite files) into the /data dir (cp from diel-gallery)
 * - put the .diel into the current dir (cp from diel-gallery)
 */

const jsFile = path.resolve(__dirname, "../../..//node_modules/sql.js/js/worker.sql.js");

const dbConfigs: DbSetupConfig[] = [{
    dbType: DbType.Worker,
    jsFile,
    dataFile: path.resolve(__dirname, "../../testEndToEnd/data/students.sqlite")
  },
];

const mainDbPath: string = null;

//const dielFiles = [path.resolve(__dirname, "../../testEndToEnd/diel/simple.diel")];
// const dielFiles = [path.resolve(__dirname, "../../testEndToEnd/diel/flights-remote.diel")];
 const dielFiles = [path.resolve(__dirname, "../../testEndToEnd/diel/students.diel")];

//const dielFiles = [path.resolve(__dirname, "../../testEndToEnd/diel/order.diel")];

const isCaching = true

export const diel = new DielRuntime({
  isStrict: true,
  showLog: true,
  setupCb: testClass,
  caching: isCaching,
  dielFiles,
  mainDbPath,
  dbConfigs,
});

async function testClass() {
  console.log(`Cache test with${isCaching ? "" : " no"} caching starting`);

  diel.BindOutput("o2", (o: RelationObject) => {
    console.log("o2 results!", o);
  });

  diel.NewInput("name_choice", {first_name: "Alice"});
  diel.NewInput("name_choice", {first_name: "Bob"});
  diel.NewInput("name_choice", {first_name: "Alice"});
}

async function testCache() {
  console.log(`Cache test with${isCaching ? "" : " no"} caching starting`);

  diel.BindOutput("o1", (o: RelationObject) => {
    console.log("results!", o);
  let results = JSON.stringify(diel.db.exec("select pos from o1")[0])
  console.log(`${results} should be 109`)
  });

  diel.NewInput("click", {num: 10});

  diel.NewInput("slider", {position: 105});
  let results = JSON.stringify(diel.db.exec("select pos from o1")[0])
  console.log(`${results} should be 105`)
 
  diel.NewInput("slider", {position: 103});
  results = JSON.stringify(diel.db.exec("select pos from o1")[0])
  console.log(`${results} should be 103`)
 
  diel.NewInput("slider", {position: 109});
  console.log(`${diel.db.exec("select pos from o1")} should be 109`)
  results = JSON.stringify(diel.db.exec("select pos from o1")[0])
  console.log(`${results} should be 109`)

   /*
  const rName = await diel.AddOutputRelationByString(`
    select datum from data; 
  `);
  */
}

async function runTest() {
  console.log("DIEL runtime test starting");
  diel.BindOutput("o1", (o: RelationObject) => {
    console.log("results!", o);
  });
  // make assertions about the setup
  // e.g. the ASTs in diel.physicalExecution

  // bind custom outputs
  // diel.BindOutput("allOriginAirports", (o: RelationObject) => {
  //   console.log("allOriginAirports results!", o);
  // });
  // diel.physicalExecution.getAstFromDbId(LocalDbId)
  // change runtime values
  // diel.NewInput("zoomScatterItx", {minDelay: 0, maxDelay: 100, minDistance: 0, maxDistance: 800});
  // diel.NewInput("originSelectionEvent", {origin: "LAX"});

  // AssertDefaultAsyncPolicy
  // at this point we know that the flights table is remote.
  // we are going to create an output

  // let's try adding dynamically
  // const rName = await diel.AddOutputRelationByString(`
  //   select distinct origin from flights where delay < 100;
  // `);
  // diel.BindOutput(rName, (data: RelationObject) => {
  //   console.log("AddOutputRelationByString function returned data", data);
  // });

  // const rName2 = await diel.AddOutputRelationByString(`
  //   select delay, distance from flights limit 20;
  // `);
  // diel.BindOutput(rName2, (data: RelationObject) => {
  //   console.log("delay distance function returned data", data);
  // });
}
