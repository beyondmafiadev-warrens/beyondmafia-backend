const db = require("./db");

(async function(){
var con = await db.getDatabase();
})()
