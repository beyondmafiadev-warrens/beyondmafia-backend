const mysql = require('mysql2/promise');


async function initalizationQuery(con){
var createSchema = `CREATE SCHEMA IF NOT EXISTS mafiadata`
await con.execute(createSchema);
var createUserTable = `CREATE TABLE IF NOT EXISTS mafiadata.usertable(
  playerid INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(28) NOT NULL,
  passwordhash VARCHAR(256) NOT NULL,
  email VARCHAR(50) NOT NULL,
  bio VARCHAR(300),
  cookie VARCHAR(256),
  UNIQUE(playerid),
  UNIQUE(email),
  UNIQUE(username))
  `
await con.execute(createUserTable);
var createGamesTable =  `CREATE TABLE IF NOT EXISTS mafiadata.games
(gameId int AUTO_INCREMENT PRIMARY KEY,
port int,
maxPlayers int,
rankedGame bool,
lockedGame bool,
startedGame bool,
gameEnded bool
)`
con.execute(createGamesTable)
var createGamePlayersTable =  `CREATE TABLE IF NOT EXISTS mafiadata.gameplayers
(gameId int unsigned,
uuid int
)`
con.execute(createGamePlayersTable)
var createGameRolesTable = `
CREATE TABLE IF NOT EXISTS mafiadata.gameRoles
(gameId int,
roleConfig  int unsigned
)`
con.execute(createGameRolesTable)
var createGameQueue = `
CREATE TABLE IF NOT EXISTS mafiadata.gametablequeue  (port INT)`
con.execute(createGameQueue)
var playerSocket = `CREATE TABLE IF NOT EXISTS mafiadata.playersocket
(gameId int,
websocketport int,
uuid int unsigned,
UNIQUE(uuid)
)`
con.execute(playerSocket)
}
async function getDatabase(){
var con = await mysql.createConnection({
    host: "127.0.0.1",
	port: "3306",
    user: "ENTER USERNAME",
    password: "ENTER PASSWORD"
  });
  await initalizationQuery(con);
  return con;
}

exports.getDatabase = getDatabase;
