(function(){
  var httpServer, httpsServer, sockjsServer, connection, config, serializeMessage, unserializeMessage, debug, error, fs, http, https, sockjs, _, onFileChange, EventEmitter2, allEvents, Event, clientPath, commonCodePath, createClient, isOpened, lastId, connections, printConfig, attachSockJS, self;
  config = {
    bindIp: '0.0.0.0',
    host: 'localhost',
    port: 9999,
    injectUrl: null,
    debug: true
  };
  serializeMessage = function(event){
    return JSON.stringify(event);
  };
  unserializeMessage = function(data){
    return import$(new Event, JSON.parse(data));
  };
  debug = function(){
    if (config.debug) {
      return console.log.apply(this, ["SOCKJS"].concat(Array.prototype.slice.call(arguments)));
    }
  };
  error = function(){
    return console.log.apply(this, arguments);
  };
  fs = require('fs');
  http = require('http');
  https = require('https');
  sockjs = require('sockjs');
  _ = require('lodash');
  onFileChange = require('on-file-change');
  EventEmitter2 = require('eventemitter2').EventEmitter2;
  allEvents = new EventEmitter2({
    wildcard: true
  });
  Event = (function(){
    Event.displayName = 'Event';
    var prototype = Event.prototype, constructor = Event;
    prototype.connId = -1;
    prototype.eventId = -1;
    prototype.msgId = -1;
    prototype.message = "";
    prototype.respond = function(responseMessage){
      var newEvent;
      newEvent = new Event;
      newEvent.connId = this.connId;
      newEvent.eventId = this.eventId;
      newEvent.msgId = this.msgId;
      newEvent.message = responseMessage;
      debug({
        type: "respond",
        newEvent: newEvent
      });
      return self.sendEvent(newEvent);
    };
    function Event(){}
    return Event;
  }());
  clientPath = __dirname + "/../client/sockjs-eventbus.js";
  commonCodePath = __dirname + "/common.js";
  createClient = function(){
    var injectedUrl, commonCode, clientCode;
    injectedUrl = (config.injectUrl
      ? config.injectUrl
      : "http://" + config.host + ":" + config.port) + "/sockjs";
    debug("Creating client with url `" + injectedUrl + "`");
    commonCode = fs.readFileSync(commonCodePath, "utf8");
    commonCode = "\n// COMMON CODE BEGIN\n" + commonCode + "// COMMON CODE END\n\n";
    clientCode = fs.readFileSync(clientPath, "utf8");
    clientCode = clientCode.replace(/\{URL_INJECTED_BY_BACKEND\}/, injectedUrl);
    clientCode = clientCode.replace(/"\{CLIENT_SERVER_COMMON_CODE_INJECTED_BY_BACKEND\}"/, commonCode);
    fs.writeFileSync(__dirname + "/../client/sockjs-eventbus.generated.js", clientCode, "utf8");
    return onFileChange(clientPath, createClient);
  };
  function httpRequestHandler(req, res){
    return fs.readFile(__dirname + "/../client/sockjs-eventbus.generated.js", "binary", function(err, file){
      if (err) {
        res.writeHead(500, {
          "Content-Type": "text/plain"
        });
        if (DEBUG) {
          res.write(err + "\n");
        } else {
          res.write('error');
        }
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/javascript"
      });
      res.write(file, "binary");
      return res.end();
    });
  }
  isOpened = false;
  lastId = 0;
  connections = {};
  printConfig = function(config){
    return _.each(config, function(v, k){
      if (k !== 'cert' && k !== 'key') {
        return debug("config." + k + " = " + v);
      }
    });
  };
  attachSockJS = function(sockjsServer, httpServer, ip, port){
    sockjsServer.installHandlers(httpServer, {
      prefix: '/sockjs'
    });
    debug("http server listen " + ip + ":" + port);
    return httpServer.listen(port, ip);
  };
  self = module.exports = {
    hlInit: function(_config){
      _config || (_config = {});
      import$(config, _config);
      debug("Initializing");
      printConfig(config);
      createClient();
      sockjsServer = sockjs.createServer();
      sockjsServer.on('connection', function(conn){
        connections[conn.id] = conn;
        conn.isOpened = true;
        debug({
          type: "onConnection",
          msg: "Client connected",
          connId: conn.id
        });
        conn.on('data', function(data){
          return self.incomingMessageHandler(conn.id, data);
        });
        return conn.on('close', function(){
          conn.isOpened = false;
          return debug({
            type: "connectionClosed",
            connId: conn.id
          });
        });
      });
      if (config.sslMode) {
        debug("Creating HTTPS Server");
        httpsServer = https.createServer({
          cert: config.cert,
          key: config.key
        }, httpRequestHandler);
        attachSockJS(sockjsServer, httpsServer, config.bindIp, config.sslPort);
      }
      if (!config.sslMode || config.httpMode) {
        debug("Creating HTTP Server");
        httpServer = http.createServer(httpRequestHandler);
        attachSockJS(sockjsServer, httpServer, config.bindIp, config.port);
      }
    },
    hlUnload: function(){
      debug("Closing server");
      if (httpServer != null) {
        httpServer.close();
      }
      if (httpsServer != null) {
        httpsServer.close();
      }
    },
    sendEvent: function(event){
      var c;
      debug({
        fn: "sendEvent",
        event: event
      });
      c = connections[event.connId];
      if (!c) {
        error({
          event: event,
          fn: "sendEvent",
          error: "no connection of {connId}"
        });
        return;
      }
      if (c.isOpened) {
        c.write(serializeMessage(event));
      } else {
        error({
          event: event,
          fn: "sendEvent",
          error: "connection not opened"
        });
      }
    },
    incomingMessageHandler: function(connId, data){
      var event;
      debug({
        connId: connId,
        data: data,
        fn: "incomingMessageHandler",
        type: "rawData"
      });
      event = unserializeMessage(data);
      event.connId = connId;
      debug({
        connId: connId,
        event: event,
        fn: "incomingMessageHandler",
        type: "parsedData"
      });
      allEvents.emit(event.eventId, event.message, event);
    },
    on: function(eventId, callback){
      debug({
        fn: 'on',
        eventId: eventId
      });
      return allEvents.addListener(eventId + ".*", callback);
    },
    broadcastMessage: function(eventId, message){
      debug({
        fn: 'broadcastMessage',
        eventId: eventId,
        message: message
      });
      return _.each(_.filter(connections, function(it){
        return it.isOpened;
      }), function(conn){
        var event;
        event = {
          connId: conn.id,
          eventId: eventId,
          msgId: -1,
          message: message
        };
        debug({
          type: "broadcastMessageSingle",
          event: event
        });
        self.sendEvent(event);
      });
    },
    removeListener: function(eventId, callback){
      return allEvents.removeListener(eventId, callback);
    }
  };
  function import$(obj, src){
    var own = {}.hasOwnProperty;
    for (var key in src) if (own.call(src, key)) obj[key] = src[key];
    return obj;
  }
}).call(this);
