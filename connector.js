// Define our custom Web Data Connector
// It uses version 2.x of the WDC sdk and targets Tableau 10.0 and later
(function(){

  var myConnector = tableau.makeConnector();
  var pyConnection = null;
  
  //--- Pryv auth setup ---//
  
  var settings = getSettingsFromURL();
  var domain = settings.domain || 'pryv.me';
  var registerUrl = 'reg.' + domain;
  var authSettings = {
    requestingAppId: 'tableau-demo',
    requestedPermissions: [
      {
        streamId: '*',
        level: 'read'
      }
    ],
    returnURL: 'self#',
    spanButtonID: 'pryv-button',
    callbacks: {
      initialization: function () {},
      needSignin: onNeedSignin,
      needValidation: null,
      signedIn: onSignedIn,
      refused: function (reason) {},
      error: function (code, message) {}
    }
  };
  
  // Called when web page first loads
  // and when the Pryv auth flow returns to the page
  $(document).ready(function() {
    if (! tableau.password) {
      $('#submitButton').hide();
      $('#pryv-logout').hide();
    }
    $('#pryv-logout').click(function() {
      $('#pryv-logout').hide();
      pryv.Auth.logout();
      resetAuthState();
    });
    pryvAuthSetup();
  });
  
  function pryvAuthSetup() {
    if (settings.username!=null && settings.auth!=null) {
      // User already provided a Pryv access, Pryv auth not needed
      var connection = new pryv.Connection(settings);
      onSignedIn(connection);
    }
    else {
      pryv.Auth.config.registerURL = {host: registerUrl, 'ssl': true};
      pryv.Auth.setup(authSettings);
    }
  }
  
  // Retrieves custom settings from URL querystring
  // Allows to adapt Pryv domain or provide an existing Pryv access
  function getSettingsFromURL() {
    var settings = {
      username : pryv.utility.urls.parseClientURL().parseQuery().username,
      auth: pryv.utility.urls.parseClientURL().parseQuery().auth,
      domain: pryv.utility.urls.parseClientURL().parseQuery().domain
    };
    return settings;
  }
  
  // Returns the current Pryv connection and is able to either:
  // - Save auth/username from current Pryv connection as Tableau credentials
  // - Or open a new Pryv connection from saved Tableau credentials
  function getPYConnection() {
    if (pyConnection) {
      // We have a Pryv connection but no saved Tableau credentials
      if (! tableau.password) {
        // Saving auth/username as Tableau credentials
        tableau.password = pyConnection.auth;
        var domain = settings.domain || pyConnection.domain;
        tableau.username = pyConnection.username + '.' + domain;
      }
    }
    // We do not have a Pryv connection but saved Tableau credentials
    else if (tableau.password) {
      // Opening a new Pryv connection
      pyConnection = new pryv.Connection({
        url: 'https://' + tableau.username + '/',
        auth: tableau.password
      });
    }
    return pyConnection;
  }
  
  function resetAuthState() {
    if (tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
      tableau.password = null;
      tableau.username = null;
      tableau.abortForAuth();
      pyConnection = null;
    }
  }
  
  // Pryv callback triggered when the user need to sign in.
  function onNeedSignin(popupUrl, pollUrl, pollRateMs) {
    $('#submitButton').hide();
    resetAuthState();
  }
  
  // Pryv callback triggered when the user is signed in.
  function onSignedIn(connection, langCode) {
    pyConnection = connection;
    tableau.password = null;
    tableau.username = null;
    getPYConnection();
    tableau.abortForAuth();
    $('#submitButton').show();
    $('#pryv-logout').show();
  }
  
  //--- Connector setup ---//
  
  // Init function for connector, called during every phase but
  // only called when running inside the simulator or tableau
  myConnector.init = function(initCallback) {
    tableau.authType = tableau.authTypeEnum.custom;

    getPYConnection();

    // If we are in the auth phase we only want to show the UI needed for auth
    if (tableau.phase == tableau.phaseEnum.authPhase) {
      $("#submitButton").hide();
    }

    if (tableau.phase == tableau.phaseEnum.gatherDataPhase) {
      // If API that WDC is using has an enpoint that checks
      // the validity of an access token, that could be used here.
      // Then the WDC can call tableau.abortForAuth if that access token
      // is invalid.
    }

    // If we are not in the data gathering phase, we want to store the token
    // This allows us to access the token in the data gathering phase
    if (tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
      if (tableau.password) {
        $('#submitButton').show();
      } else {
        $('#submitButton').hide();
      }
    }
    
    initCallback();
  };
  
  // Declare the data schema to Tableau
  myConnector.getSchema = function(schemaCallback) {
    var event_num_cols = [{
      id: "id",
      dataType: tableau.dataTypeEnum.string
    }, {
      id: "streamId",
      alias: "streamId",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: {tableId: 'stream', columnId: 'id'}
    }, {
      id: "time",
      alias: "time",
      dataType: tableau.dataTypeEnum.datetime
    }, {
      id: "duration",
      alias: "duration",
      dataType: tableau.dataTypeEnum.float
    }, {
      id: "type",
      alias: "type",
      dataType: tableau.dataTypeEnum.string
    }, {
      id: "content",
      alias: "content",
      dataType: tableau.dataTypeEnum.float,
      columnRole: tableau.columnRoleEnum.measure
    }];

    var eventNumTable = {
      id: "eventNum",
      alias: "Numerical Events",
      columns: event_num_cols
    };

    var event_location_cols = [{
      id: "id",
      dataType: tableau.dataTypeEnum.string
    }, {
      id: "streamId",
      alias: "streamId",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: {tableId: 'stream', columnId: 'id'}
    }, {
      id: "time",
      alias: "time",
      dataType: tableau.dataTypeEnum.datetime
    }, {
      id: "duration",
      alias: "duration",
      dataType: tableau.dataTypeEnum.float
    }, {
      id: "type",
      alias: "type",
      dataType: tableau.dataTypeEnum.string
    }, {
      id: "lat",
      alias: "latitude",
      columnRole: "dimension",
      dataType: tableau.dataTypeEnum.float
    }, {
      id: "lon",
      alias: "longitude",
      columnRole: "dimension",
      dataType: tableau.dataTypeEnum.float
    }];

    var eventLocationTable = {
      id: "eventLocation",
      alias: "Location Events",
      columns: event_location_cols
    };

    var stream_cols = [{
      id: "id",
      dataType: tableau.dataTypeEnum.string
    }, {
      id: "name",
      alias: "name",
      dataType: tableau.dataTypeEnum.string
    }, {
      id: "parentId",
      alias: "parentId",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: {tableId: 'stream', columnId: 'id'}
    }];

    var streamTable = {
      id: "stream",
      alias: "Streams table",
      columns: stream_cols
    };
    schemaCallback([streamTable, eventNumTable, eventLocationTable]);
  };
  
  // This function actually makes the Pryv API calls, 
  // parses the results and passes them back to Tableau
  myConnector.getData = function(table, doneCallback) {
    // Multiple tables for WDC work by calling getData multiple times with a different id
    // so we want to make sure we are getting the correct table data per getData call
    switch (table.tableInfo.id) {
      case 'stream':
        getStreams(table, doneCallback);
        break;
      case 'eventNum':
        getNumEvents(table, doneCallback);
        break;
      case 'eventLocation':
        getLocationEvents(table, doneCallback);
        break;
    }
  }
  
  tableau.registerConnector(myConnector);
  
  //--- Data loaders ---//
  
  // Collects location Events
  function getLocationEvents(table, doneCallback) {
    var tableData = [];
    getEvents(function (events) {
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        if (event.type === 'position/wgs84') {
          tableData.push({
            id: event.id,
            streamId: event.streamId,
            type: event.type,
            lat: event.content.latitude,
            lon: event.content.longitude,
            time: dateFormat(event.timeLT),
            duration: event.duration
          });
        }
      }
      // Once we have all the data parsed, we send it to the Tableau table object
      table.appendRows(tableData);
      doneCallback();
    });
  }
  
  // Collects numerical Events
  function getNumEvents(table, doneCallback) {
    var tableData = [];
    getEvents(function (events) {
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        if (!isNaN(parseFloat(event.content)) && isFinite(event.content)) {
          tableData.push({
            id: event.id,
            streamId: event.streamId,
            type: event.type,
            content: event.content,
            time: dateFormat(event.timeLT),
            duration: event.duration
          });
        }
      }
      // Once we have all the data parsed, we send it to the Tableau table object
      table.appendRows(tableData);
      doneCallback();
    });
  }
  
  // Retrieves Events from Pryv
  var events;
  function getEvents(doneCallback) {
    if (events) return doneCallback(events);
    var filter = new pryv.Filter({limit : 10000});
    getPYConnection().events.get(filter, function (err, es) {
      if (err) {
        tableau.abortWithError(err.toString());
      }
      if (! es) {
        es = [];
      }
      var events = es;
      return doneCallback(events);
    });
  }
  
  // Retrieves Streams from Pryv
  function getStreams(table, doneCallback) {
    getPYConnection().streams.get(null, function(err, streams) {
      if (err) {
        tableau.abortWithError(err.toString());
      }
      if (! streams) {
        return  doneCallback();
      }
      function addChilds(tableD, streamArray) {
        for (var i = 0; i < streamArray.length; i++) {
          var stream = streamArray[i];
          tableD.push(
            {
              id: stream.id,
              parentId: stream.parentId,
              name: stream.name
            }
          );
          addChilds(tableD, stream.children);
        }
      }
      
      var tableData = [];
      addChilds(tableData, streams);
      // Once we have all the data parsed, we send it to the Tableau table object
      table.appendRows(tableData);
      doneCallback();
    });
  }
  
  //--- Helpers ---//
  
  // Converts Pryv timestamps to Tableau dates format
  function dateFormat(time) {
    return moment(new Date(time)).format("Y-MM-DD HH:mm:ss")
  }
  
})();