const express = require('express');
const cors = require('cors')
const bcrypt = require ('bcrypt');
const app = express();
const validator = require("email-validator");
const database = require('./db/db');
const userRouter = require('./routes/users');
const net = require('net');
const {spawn} = require('child_process');
var cookieParser = require('cookie-parser');
var  compression = require('compression');

async function insertPlayer(username,password,email,db,callback){
  var returnCode = 0;
    var dbRes = await db.query(`SELECT COUNT(*) FROM(SELECT username FROM mafiadata.usertable as users WHERE username = ? OR email = ? LIMIT 1) as subquery;`,[username,password]);
    if(dbRes[0][0]['COUNT(*)'] === 0){
  bcrypt.genSalt(10, (err, salt)=> {
    if(!err){
      bcrypt.hash(password, salt, async(err, hash)=> {
        try{
        var dbRes  = await db.query('insert into mafiadata.usertable (username,passwordhash,email,bio) values (?,?,?,NULL)',
        [username, hash, email]);
        if(dbRes[0]['affectedRows'] === 1){
        await generateLoginCookie(username,db,(cb)=>{
            if(cb.cmd === -1){
              callback({cmd:-1});
            }
            else{
              callback({cmd:1,cookie:cb.cookie});
            }
          })
        }
      }
      catch(e){
          callback({cmd:-1})
      }
      });
    }
  });
}
}

async function comparePassword(username,password,db,callback){
  var dbRes = await db.query(`SELECT passwordhash FROM mafiadata.usertable as users WHERE username = ? LIMIT 1;`,[username]);
  if(dbRes[0][0]['passwordhash']){
    bcrypt.compare(password, dbRes[0][0]['passwordhash'], async (err, result)=> {
      if(result){
        await generateLoginCookie(username,db,(ret)=>{
          if(ret.cmd === 1){
            callback({cmd:1,cookie:ret.cookie});
          }
          else{
            callback({cmd:-1});
          }
        })
      }
      else{
        callback({cmd:-1})
      }
  });
  }
  else{
    callback({cmd:-1});
  }
}

async function generateLoginCookie(username,db,callback){
var dbRes = await db.query('SELECT username FROM mafiadata.usertable WHERE username = ? LIMIT 1',[username]);
var writeUsername = dbRes[0][0]['username']
var date = new Date();
      bcrypt.hash((writeUsername + date.toString()), 10, async(err, hash)=> {
        try{
        var innerRes = await db.query('UPDATE mafiadata.usertable SET cookie = ? WHERE username = ?',
        [hash,writeUsername]);
        if(innerRes[0]['affectedRows'] === 1){
          callback({cmd:1,cookie:hash})
        }
      }
      catch(e){
          callback({cmd:-1})
      }
      });
}

async function getUser(id,db,callback){
    try{

	var res = await db.query("SELECT username, bio,wins,losses,desertions,points,gems FROM mafiadata.usertable WHERE playerid = ? LIMIT 1",[id]);
  var writeUsername = res[0][0]['username'];
      var bio = res[0][0]['bio'];
      var wins = res[0][0]['wins'];
      var losses = res[0][0]['losses'];
      var desertions = res[0][0]['desertions'];
      var points = res[0][0]['points'];
      var gems = res[0][0]['gems'];
      callback({cmd:1,username:writeUsername,bio:bio,wins:wins,losses:losses,desertions:desertions,points:points,gems:gems});
}
catch(e){
  callback({cmd:-1})
}
}

async function getGames(db,page,bmcookie,callback){
  try {
    var left,right;
    if(page === 1){
      left = 0;
      right = 10;
    }
    else{
      left = page-1 * 10;
      right = page * 10;
    }
      var res = await db.query("SELECT * FROM mafiadata.games ORDER BY gameId DESC LIMIT ?,?",[left,right]);
    gameArray = [];
    var gamePromise = res[0].map(async(games) => {
      var res = await db.query("SELECT COUNT(*) FROM(SELECT mafiadata.gameplayers.uuid FROM mafiadata.games JOIN mafiadata.gameplayers WHERE gameplayers.gameId = games.gameId AND games.gameId = ?) as subquery",[games.gameId])
      var secondRes = await db.query("SELECT * FROM mafiadata.gameRoles WHERE gameId = ?",[games.gameId]);
	var roles = []
      var promises = secondRes[0].map((item)=>{
        roles.push(item['roleConfig']);
      })
      await Promise.all(promises);
      gameArray.push({gameId:games.gameId,maxPlayers:games.maxPlayers,currentPlayers:res[0][0]['COUNT(*)'],roles:roles});
})
await Promise.all(gamePromise);
await verifyUser(bmcookie,db,async(ret)=>{
  if(ret.cmd === -1){
    callback({cmd:-1});
  }
  else{
    var countRes = await db.query("SELECT COUNT(*) FROM (SELECT * FROM mafiadata.playersocket WHERE playersocket.uuid = ?) as subquery", [ret.playerid]);
    if(countRes[0][0]['COUNT(*)'] !== 0){
       var currentGame = await db.query(`SELECT g.gameId
FROM mafiadata.games AS g, mafiadata.playersocket AS ps
WHERE g.gameId = ps.gameId
LIMIT 1`);
var secondRes = await db.query("SELECT * FROM mafiadata.gameRoles WHERE gameId = ?",[currentGame[0][0]['gameId']]);
var roles = []
promises = secondRes[0].map((item)=>{
  roles.push(item['roleConfig']);
})
await Promise.all(promises);
      var game = {gameId:currentGame[0][0]['gameId'],
                  maxPlayers: currentGame[0][0]['maxPlayers'],
                  currentPlayers: currentGame[0][0]['currentPlayers'],
                  roles:roles}
                  callback({cmd:2,gameArray:gameArray,currentGame:game});

    }
    else{
      callback({cmd:1,gameArray:gameArray});
    }
  }
});
  }
  catch(e){
          callback({cmd:-1});
  }
}


async function createGameQuery(body,db,callback){
    var dbRes = await db.query("SELECT COUNT(*) FROM(SELECT * FROM mafiadata.gametablequeue as ports) as subquery");
    var wait = new Promise(
	async (resolve,reject)=>{
	    while(dbRes[0][0]['COUNT(*)'] === 0){
		dbRes = await db.query("SELECT COUNT(*) FROM(SELECT * FROM mafiadata.gametablequeue as ports) as subquery");
	    }
	    resolve()
	});
    await wait;
    var dbRes = await db.query("SELECT PORT FROM mafiadata.gametablequeue LIMIT 1;");
    var port = dbRes[0][0].PORT
    await db.query("DELETE FROM mafiadata.gametablequeue WHERE port = ?",[port]);
    var s = net.Socket();
    s.connect(port, "127.0.0.1");
    var socketConnection = new Promise((resolve,reject)=>{
	s.on('connect', ()=>{
	var buffer = Buffer.alloc(256).fill('\0');
	var game = {
	    cmd: 0,
	    roles:body.roles,
	    settings:body.settings
	}
	buffer.write(JSON.stringify(game))    
	s.write(buffer,async (err,data)=>{
	    s.destroy();
	    resolve();
	});
    })
    });
    await socketConnection;
    callback({cmd:1})
}

async function verifyUser(cookie,db,callback){
  try{
    if(cookie.length < 5){
      return callback({cmd:-1});
    }
    var res = await db.query("SELECT playerid FROM mafiadata.usertable WHERE cookie = ? LIMIT 1",[cookie]);
    var playerid = res[0][0]['playerid']
    callback({cmd:1,playerid:playerid});
  }
  catch(e){
    callback({cmd:-1})
  }
}

(async function(){
    app.use(compression());
    app.use(cors({origin:"https://www.beyondmafia.live/"}))
    app.use(cookieParser());
    app.use(express.json());
    var db = await database.getDatabase();
    await database.init(db); 
    app.post('/users/register', async(req, res)=>{
    const username = req.body.username;
    const password = req.body.password;
    const email = req.body.email;
    var resJson = {};
    if(username.length > 28 || password.length > 72 || !validator.validate(email)){
      resJson['0'] = -1;
      return res.status(401).json(resJson);
    }
    else{
    await insertPlayer(username,password,email,db,(ret)=>{

      if(ret.cmd === -1 ){
      return res.status(401).json(resJson);
    }
    else{
      resJson['0'] = 1;
      resJson['cookie'] = ret.cookie;
      return res.status(200).json(resJson);
    }
  });
}
})
app.post('/getUser', async(req,res)=>{
  var resJson = {};
  await getUser(req.body.id,db,(ret)=>{
    if(ret.cmd === -1){
    return res.status(401).json(resJson);
  }
  else{
    resJson['0'] = 1;
    resJson['username'] = ret.username;
      resJson['bio'] = ret.bio;
      resJson['wins'] = ret.wins;
      resJson['losses'] = ret.losses;
      resJson['desertions'] = ret.desertions;
      resJson['points'] = ret.points;
      resJson['gems'] = ret.gems;
    return res.status(200).json(resJson);
  }
  })
})

app.get('/verifyUser', async(req,res)=>{
    var resJson = {};
await verifyUser(req.headers.bmcookie, db, (ret)=>{
  if(ret.cmd === -1){
  return res.status(401).json(resJson);
}
else{
  resJson['0'] = 1;
  resJson['playerid'] = ret.playerid;
  return res.status(200).json(resJson);
}
})
})

app.post('/getGames',async(req,res)=>{
  getGames(db,req.body.page,req.headers.bmcookie,(callback)=>{
    if(callback.cmd === -1){
      return res.status(401).json(callback);
    }
    else{
      return res.status(200).json(callback);
    }
  })
});

    
    app.post('/createGame',  async (req,res)=>{
	spawn('./engine');
	try{
	var promise = new Promise(async(resolve,reject)=>{
	    createGameQuery(req.body,db,async(callback)=>{
		if(callback.cmd === -1){
		    res.status(401).json(callback);
		    resolve()
		}
		else{
		    res.status(200).json(callback);
		    resolve();
		}
	    });
	})
	await promise;
    }
    catch(e){
	res.status(401)
    }
})

    app.post('/joinGame', async (req,res)=>{
	try{
  var dbRes = await db.query("SELECT PORT FROM mafiadata.games WHERE gameId = ?",[req.body.gameId]);
  var port = dbRes[0][0].PORT
  var s = net.Socket();
	    s.connect(port, "127.0.0.1");
	    s.on('error', async(err) =>{ return res.status(401)})
  s.on('connect', async ()=>{
      var buffer = Buffer.alloc(256).fill('\0');
      await verifyUser(req.headers.bmcookie,db,async(ret)=>{
        if(ret.cmd === -1){
          return res.status(401).json(ret);
        }
        else{
          var check = await db.query("SELECT COUNT(*) FROM(SELECT * FROM mafiadata.playersocket as websocket WHERE uuid = ?) as subquery",[ret.playerid]);
          if(check[0][0]['COUNT(*)'] > 0){
              return res.status(401).json({cmd:-2,msg:"You are already in a game!"});
          }
          var cmd = {
            cmd: 1,
            playerid: ret.playerid
          }

          buffer.write(JSON.stringify(cmd));
          s.write(buffer,async (err,data)=>{
            var dbRes = await db.query("SELECT COUNT(*) FROM(SELECT * FROM mafiadata.playersocket as websocket) as subquery");
            var wait = new Promise(
              async (resolve,reject)=>{
              while(dbRes[0][0]['COUNT(*)'] === 0){
              dbRes = await db.query("SELECT COUNT(*) FROM(SELECT * FROM mafiadata.playersocket as websocket) as subquery");
            }
            resolve()
          });
          await wait;
            var websocketRes = await db.query("SELECT websocketport FROM mafiadata.playersocket WHERE uuid = ?",[ret.playerid]);
            res.status(200).json({cmd:1})
          });
        }
      })
  });
	}
	catch(e){
	    res.status(401).json({cmd:-1});
	}
})
    
app.post('/users/login', async(req,res)=>{
  await comparePassword(req.body.username,req.body.password,db,async(ret)=>{
    if(ret.cmd === -1){
      return res.status(401);
    }
    else{
      var resJson = {};
      resJson['0'] = 1;
      resJson['cookie'] = ret.cookie;
      return res.status(200).json(resJson);
    }
  });
});

    app.post('/leaveGame', async(req,res)=>{
	try{
  await verifyUser(req.headers.bmcookie,db,async(ret)=>{
    if(ret.cmd === -1){
      return res.status(401).json(ret);
    }
    else{
      if(req.body.playerid === ret.playerid){
        var dbRes = await db.query("SELECT PORT FROM mafiadata.games WHERE gameId = ?",[req.body.gameId]);
        var port = dbRes[0][0].PORT
        var s = net.Socket();
          s.connect(port, "127.0.0.1");
	  s.on('error', async(err) => {return res.status(401)})
        s.on('connect', async ()=>{
            var buffer = Buffer.alloc(256).fill('\0');
            var check = await db.query("SELECT COUNT(*) FROM(SELECT * FROM mafiadata.playersocket as websocket WHERE uuid = ?) as subquery",[ret.playerid]);
            if(check[0][0]['COUNT(*)'] === 1){
              var cmd = {
                cmd: -1,
                playerid: ret.playerid
              }
              buffer.write(JSON.stringify(cmd));
              s.write(buffer,async (err,data)=>{
                if(err){
                  return res.status(401);
                }
                else{
                  return res.status(200).json({cmd:1});
                }
              });
            }
            else{
              return res.status(401);
            }
          });
      }
      else{
        return res.status(401);
      }
    }
  })
	}
	catch(e){
	    return res.status(401);
	}
})
app.get('/getSocket', async(req,res)=>{
  await verifyUser(req.headers.bmcookie,db,async(ret)=>{
    if(ret.cmd === -1){
      return res.status(401).json(ret);
    }
    else{
      var websocketRes = await db.query("SELECT websocketport FROM mafiadata.playersocket WHERE uuid = ?",[ret.playerid]);
      res.status(200).json({cmd:1,port:websocketRes[0][0]['websocketport']});
    }
})
});
    app.listen('3001', '0.0.0.0' ,() =>{
    console.log("Server is listening on PORT: 3001")
});
})();
