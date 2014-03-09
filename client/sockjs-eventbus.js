(function(){
  var client, url, DEBUG, debug, error, Events, events, messageId, messages, isConnected, isConnecting, ifConnected, serializeMessage, unserializeMessage, wrapperFactory, self;
  url = "{URL_INJECTED_BY_BACKEND}";
  DEBUG = true;
  debug = function(){
    if (DEBUG) {
      return console.log.apply(console, ["SOCKJS"].concat(Array.prototype.slice.call(arguments)));
    }
  };
  error = function(){
    if (DEBUG) {
      return console.error.apply(console, ["SOCKJS"].concat(Array.prototype.slice.call(arguments)));
    }
  };
  "{CLIENT_SERVER_COMMON_CODE_INJECTED_BY_BACKEND}";
  Events = (function(superclass){
    Events.displayName = 'Events';
    var prototype = extend$(Events, superclass).prototype, constructor = Events;
    function Events(){}
    return Events;
  }(EventEmitter2));
  events = new Events();
  messageId = 0;
  messages = {};
  isConnected = false;
  isConnecting = false;
  ifConnected = function(){
    var obj;
    obj = {
      yes: function(fn){
        if (isConnected) {
          if (typeof fn == 'function') {
            fn();
          }
        }
        return obj;
      },
      no: function(fn){
        if (!isConnected) {
          if (typeof fn == 'function') {
            fn();
          }
        }
        return obj;
      }
    };
    return obj;
  };
  serializeMessage = function(event){
    return JSON.stringify(event);
  };
  unserializeMessage = function(data){
    return JSON.parse(data);
  };
  wrapperFactory = function(callback){
    if (!_.isFunction(callback)) {
      return null;
    }
    return function(){
      var args;
      args = arguments;
      return self.config.updateDom(function(){
        debug("Apply", callback);
        callback.apply(undefined, args);
      });
    };
  };
  self = window.sockJsEventBus = {
    config: {
      updateDom: function(fn){
        return typeof fn == 'function' ? fn() : void 8;
      }
    },
    init: function(callback, config){
      if (config) {
        import$(self.config, config);
      } else if (_.isPlainObject(callback)) {
        import$(self.config, callback);
        callback = undefined;
      }
      if (self.config.$scope) {
        self.config.updateDom = function(fn){
          return self.config.$scope.$apply(fn);
        };
      }
      ifConnected().no(function(){
        isConnecting = true;
        events.emit('connecting');
        client = new SockJS(url);
        client.onopen = function(){
          isConnected = true;
          isConnecting = false;
          events.emit('connected');
          debug('open');
          if (typeof callback == 'function') {
            callback();
          }
        };
        client.onmessage = function(e){
          var data;
          data = e.data;
          self.incomingMessageHandler(data);
        };
        client.onclose = function(){
          isConnected = false;
          isConnecting = false;
          events.emit('disconnected');
          debug('close');
        };
        return client.onerror = function(err){
          debug('error', err);
        };
      }).yes(function(){
        debug("client already connected");
        return typeof callback == 'function' ? callback() : void 8;
      });
    },
    unload: function(){
      return client != null ? client.close() : void 8;
    },
    incomingMessageHandler: function(data){
      var event;
      event = unserializeMessage(data);
      debug({
        fn: "incomingMessageHandler",
        data: data,
        event: event
      });
      return events.emit(event.eventId, event.message, event);
    },
    subscribe: function(eventId, callback){
      var wrapper;
      debug({
        fn: "subscribe",
        eventId: eventId,
        callback: callback
      });
      wrapper = wrapperFactory(callback);
      events.on(eventId, wrapper);
      return wrapper;
    },
    unsubscribe: function(eventId, callback){
      debug({
        fn: "unsubscribe",
        eventId: eventId,
        callback: callback
      });
      events.removeListener(eventId, callback);
    },
    unsubscribeAll: function(eventId){
      debug({
        fn: "unsubscribeAll",
        eventId: eventId
      });
      events.removeAllListeners(eventId);
    },
    once: function(eventId, callback){
      var wrapper;
      wrapper = wrapperFactory(callback);
      return events.once(eventId, wrapper);
    },
    _once: function(eventId, callback){
      return events.once(eventId, callback);
    },
    _errorHandler: function(err){
      return error(err);
    },
    send: function(eventId, message, callback){
      var dfd, wrapper, _send;
      debug('send', {
        type: "send",
        eventId: eventId,
        message: message
      });
      dfd = $.Deferred();
      wrapper = wrapperFactory(callback);
      _send = function(){
        var newEventId, event;
        messageId++;
        newEventId = eventId + "." + messageId;
        self._once(newEventId, function(response){
          dfd.resolve(response);
          return typeof wrapper == 'function' ? wrapper(response) : void 8;
        });
        event = {
          eventId: newEventId,
          msgId: messageId,
          message: message
        };
        return client.send(serializeMessage(event));
      };
      ifConnected().yes(_send).no(function(){
        debug("Not connected, isConnecting = " + isConnecting);
        if (isConnecting) {
          return events.once('connected', _send);
        } else {
          return self.init(_send);
        }
      });
      return dfd.fail(function(err){
        return self._errorHandler(err);
      });
    }
  };
  function extend$(sub, sup){
    function fun(){} fun.prototype = (sub.superclass = sup).prototype;
    (sub.prototype = new fun).constructor = sub;
    if (typeof sup.extended == 'function') sup.extended(sub);
    return sub;
  }
  function import$(obj, src){
    var own = {}.hasOwnProperty;
    for (var key in src) if (own.call(src, key)) obj[key] = src[key];
    return obj;
  }
}).call(this);
