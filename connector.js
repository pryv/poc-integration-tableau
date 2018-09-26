// Define our custom Web Data Connector
// It uses version 2.x of the WDC sdk and targets Tableau 10.0 and later
(function(){
  
  //--- Authentication setup ---//

  // Specific username used when providing multiple sharings
  var kPYSharingsUsername = "Pryv Sharings";
  // Campaign manager endpoint used to retrieve sharings from a campaign
  var campaignManagerUrl = 'pryvcampaign://';
  var pyConnections = [];
  var settings = getSettingsFromURL();
  var domain = settings.domain || 'pryv.me';
  var registerUrl = 'reg.' + domain;
  
  // Initialize Pryv auth settings
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
      needSignin: function () {},
      signedIn: onSignedIn,
      refused: function (reason) {},
      error: function (code, message) {}
    }
  };
    
  // Called when web page first loads
  // and when the Pryv auth flow returns to the page
  $(document).ready(function() {
    updateUI();
    initSelectors();
    $('#pryv-logout').click(logout);
    $('#useSharingLink').click(loadPryvSharings);
    $("#submitButton").click(validateAndSubmit);
  });
  
  // Logout current connection(s) (from login and/or sharings)
  function logout() {
    // Logout Pryv account, not applicable for connection via sharings    
    if (pryv.Auth.connection != null) {
      pryv.Auth.logout();
    }
    resetAuthState();
    updateUI();
    var urlParameters = window.location.href.split(/[?#]/);
    // If url contains parameters, clear them and reload the page
    if (urlParameters.length > 1) {
      window.location = urlParameters[0];
    }
  }
  
  // Initialize date and limit selectors
  function initSelectors() {
    var currentDate = new Date();
    var currentYear = currentDate.getFullYear();
    $("#timeSelectorFrom").combodate({
      value: new Date(0),
      smartDays: true,
      maxYear: currentYear
    });
    $("#timeSelectorTo").combodate({
      value: currentDate,
      smartDays: true,
      maxYear: currentYear
    });
    $("#noLimit").change(function() {
      $("#limitSelector").prop('disabled', this.checked);
    });
  }

  // Initialize Pryv connections from sharings
  // Optionally retrieve the sharings from a campaign manager link
  function loadPryvSharings() {
    var sharingLink = $('#sharingLink').val();
    if (!sharingLink) {
      return tableau.abortWithError('Please provide a sharing link.');
    }
    
    // Clean-up and create a coma separated list
    var sharings = sharingLink.split(/[\s,\n]+/).filter(function(el) {return el.length != 0});


    // If using a campaign manager link, we need to retrieve sharings from it first.
    // Then a second call to this function is required to actually load the sharings.
    if (sharings.length > 0 && sharings[0].substring(0, campaignManagerUrl.length) === campaignManagerUrl) {
      sharings = getSharingsFromCampaignManager(sharings);
      return;
    }
    
    saveCredentials(kPYSharingsUsername, sharings.join(','));
    getPYConnections();
    updateUI();
  }



  
  // Specific call to retrieve sharings from a campaign manager link
  function getSharingsFromCampaignManager (sharingLinks) {
      var CMlink = sharingLinks[0].substring(campaignManagerUrl.length);

      var baseurl = CMlink.split('?')[0];

      /**
       * WARNING Campaign manager is hard-coded !! CM should send the domain alognside the user
       */
      $.ajax({
        type: 'GET',
        url: baseurl + '?username=' + getParameterByName('username', CMlink),
        headers: {
          "authorization": getParameterByName('auth', CMlink),
        }
      }).done(function(data) {
        var sharings = "";
        data.invitations.map(function (invitation) {
          // add only if token is valid
          if (invitation.accessToken && invitation.status === 'accepted') {
            sharings += 'https://' + invitation.requestee.pryvUsername + '.' + domain + '/#/sharings/'
              + invitation.accessToken + "\n";
          }
        });
        $("#sharingLink").val(sharings);
      }).fail(function(xhr, status, error) {
        tableau.abortWithError(error);
      });
  }
  
  // Validate filtering parameters and save them for next phase (data gathering)
  // and submit to Tableau
  function validateAndSubmit() {
    var tempFrom = parseInt($("#timeSelectorFrom").combodate('getValue', 'X'));
    var tempTo = parseInt($("#timeSelectorTo").combodate('getValue', 'X'));
    if (isNaN(tempFrom) || isNaN(tempTo) || tempTo - tempFrom < 0) {
      return tableau.abortWithError('Invalid from/to, please make sure "from" is earlier than "to".');
    }
    var options = {
      fromTime: tempFrom,
      toTime: tempTo
    };
    if ($("#noLimit").is(':checked') === false) {
      var tempLimit = parseInt($("#limitSelector").val());
      if (isNaN(tempLimit) || tempLimit < 1) {
        return tableau.abortWithError('Invalid limit, please provide a number greater than 0.');
      }
      options.limit = tempLimit;
    }
    tableau.connectionData = JSON.stringify(options);
    tableau.connectionName = "Pryv WDC " + tableau.username;
    tableau.submit();
  }
  
  // 
  function pryvAuthSetup() {
    // If auth settings are provided in the URL,
    // we can just use them to create a connection to Pryv (no need to login).
    if (settings.username!=null && settings.auth!=null) {
      $("#authDiv").hide();
      var connection = new pryv.Connection(settings);
      // Make sure that the Pryv user/token pair is valid
      connection.accessInfo(function (err,res) {
        if (err) return tableau.abortWithError('Pryv user/token pair is invalid!');
        onSignedIn(connection);
      });
    }
    // Or login with a Pryv account
    else {
      pryv.Auth.config.registerURL = {host: registerUrl, 'ssl': true};
      pryv.Auth.setup(authSettings);
    }
  }
  
  // Retrieves custom settings from URL querystring
  // Allows to adapt Pryv domain or provide an existing Pryv access
  // Url parameter is optional, default is `document.location` if available
  function getSettingsFromURL(url) {
    var urlInfo = pryv.utility.urls.parseClientURL(url);
    var queryString = urlInfo.parseQuery();
    var settings = {
      username : url ? urlInfo.username : queryString.username,
      domain: url ? urlInfo.domain: queryString.domain,
      auth: url ? urlInfo.parseSharingTokens()[0]: queryString.auth
    };
    return settings;
  }
  
  // Returns the current Pryv connection and is able to either:
  // - Save auth/username from current Pryv connection(s) as Tableau credentials
  // - Or open new Pryv connection(s) from saved Tableau credentials
  function getPYConnections() {
    // We have a Pryv connection but no saved Tableau credentials
    if (pyConnections.length == 1 && !tableau.password) {
      // Saving auth/username as Tableau credentials
      var token = pyConnections[0].auth;
      var user = pyConnections[0].username + '.' + domain;
      saveCredentials(user, token);
    }
    // We do not have a Pryv connection but saved Tableau credentials
    else if (pyConnections.length == 0 && tableau.password) {
      // We have multiple sharings saved as Tableau credentials
      // So multiple Pryv connections to create
      if (tableau.username === kPYSharingsUsername) {
        var sharingURLS = tableau.password.split(',');
        for (var i = 0; i < sharingURLS.length; i++ ) {
          var sharingSettings = getSettingsFromURL(sharingURLS[i]);
          pyConnections.push(new pryv.Connection({
            url: 'https://' + sharingSettings.username + '.' + sharingSettings.domain + '/',
            auth: sharingSettings.auth
          }));
        }
      }
      // We have a single Pryv connection to create from Tableau credentials
      else {
        pyConnections.push(new pryv.Connection({
          url: 'https://' + tableau.username + '/',
          auth: tableau.password
        }));
      }
    }
    
    // Logout current connection(s) if one of them is invalid
    checkConnectionsValidity(logout);

    return pyConnections;
  }

  // Check the validity of all current Pryv connections and call a fallback
  // function if one of them is invalid.
  // Invalid connections may most likely arise with invalid sharings or expired accesses.
  function checkConnectionsValidity(fallback) {
    pyConnections.forEach(function(connection) {
      connection.accessInfo(function (err,res) {
        if (err) {
          tableau.abortWithError('Connection to Pryv is invalid (some of the sharings may be invalid)!');
          fallback();
        }
      });
    });
  }

  // Apply function f on each current Pryv connections.
  function foreachConnectionSync(f, done) {
    var connections = getPYConnections();
    var i = 0;
    function loop () {
      if (i >= connections.length) return done();
      var connection  = connections[i];
      i++;
      f(connection, loop);
    }
    loop();
  }
  
  // Reset auth state by erasing saved Tableau credentials and Pryv connections.
  function resetAuthState() {
    if (tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
      tableau.abortForAuth();
      saveCredentials(null, null);
      pyConnections = [];
    }
  }
  
  // Adapt UI according to current auth state
  function updateUI() {
    if(tableau.password) {
      $('#submitDiv').show();
      $('#pryv-logout').show();
      $('#sharingDiv').hide();
      if (tableau.username === kPYSharingsUsername) {
        $('#loginDiv').hide();
        updateSharingsLabels();
        $('#sharingsLabelDiv').show();
      }
    } else {
      $('#submitDiv').hide();
      $('#pryv-logout').hide();
      $('#sharingsLabelDiv').hide();
      $('#sharingsLabelDiv').html('');
      $('#sharingDiv').show();
      $('#loginDiv').show();
    }
  }
  
  // Print currently loaded sharings
  function updateSharingsLabels () {
    var sharings = tableau.password.split(',');
    var txt = 'From ' + sharings.length + ' sharing';
    txt += sharings.length === 1 ? ': ' : 's: '
    txt += sharings.slice(0,5).map(function(el) {
      return getSettingsFromURL(el).username
    }).join(', ');
    if (sharings.length > 6) txt += ', ...';
    $('#sharingsLabelDiv').html(txt);
  }
  
  // Saving Pryv username and auth token as Tableau credentials
  function saveCredentials(username, token) {
    tableau.username = username;
    tableau.password = token;
  }
  
  // Pryv callback triggered when the user is signed in.
  function onSignedIn(connection, langCode) {
    saveCredentials(null, null);
    pyConnections = [connection];
    getPYConnections();
    updateUI();
  }
  
  //--- Tableau connector setup ---//
  
  var myConnector = tableau.makeConnector();
  
  // Init function for connector, called during every phase but
  // only called when running inside the simulator or tableau
  myConnector.init = function(initCallback) {
    tableau.authType = tableau.authTypeEnum.custom;

    getPYConnections();
    updateUI();
    
    if (tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
      pryvAuthSetup();
    }

    if (tableau.phase == tableau.phaseEnum.gatherDataPhase) {
      // If API that WDC is using has an enpoint that checks
      // the validity of an access token, that could be used here.
      // Then the WDC can call tableau.abortForAuth if that access token
      // is invalid.
    }
    
    initCallback();
  };
  
  // Declare the data schema to Tableau
  myConnector.getSchema = function(schemaCallback) {
    
    // Usernames table
    var username_cols = [{
      id: "id",
      dataType: tableau.dataTypeEnum.string
    },{
      id: "username",
      dataType: tableau.dataTypeEnum.string
    }
    ];

    var usernamesTable = {
      id: "users",
      alias: "Users",
      columns: username_cols
    };

    // Numerical events table
    var event_num_cols = [{
      id: "username",
      alias: "username",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: {tableId: 'users', columnId: 'id'},
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: "id",
      dataType: tableau.dataTypeEnum.string
    }, {
      id: "streamId",
      alias: "streamId",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: {tableId: 'stream', columnId: 'id'},
      columnRole: tableau.columnRoleEnum.dimension
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
      dataType: tableau.dataTypeEnum.string,
      columnRole: tableau.columnRoleEnum.dimension
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
    
    // Location events table
    var event_location_cols = [{
      id: "username",
      alias: "username",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: {tableId: 'users', columnId: 'id'},
      columnRole: tableau.columnRoleEnum.dimension
    }, {
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
      dataType: tableau.dataTypeEnum.string,
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: "latitude",
      alias: "latitude",
      columnRole: "dimension",
      dataType: tableau.dataTypeEnum.float
    }, {
      id: "longitude",
      alias: "longitude",
      columnRole: "dimension",
      dataType: tableau.dataTypeEnum.float
    }];

    var eventLocationTable = {
      id: "eventLocation",
      alias: "Location Events",
      columns: event_location_cols
    };
    
    // Streams table
    var stream_cols = [{
      id: "username",
      alias: "username",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: {tableId: 'users', columnId: 'id'},
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: "id",
      dataType: tableau.dataTypeEnum.string
    },  {
      id: "name",
      alias: "name",
      dataType: tableau.dataTypeEnum.string,
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: "parentId",
      alias: "parentId",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: {tableId: 'stream', columnId: 'id'},
      columnRole: tableau.columnRoleEnum.dimension
    }];

    var streamTable = {
      id: "stream",
      alias: "Streams table",
      columns: stream_cols
    };
    
    schemaCallback([usernamesTable, streamTable, eventNumTable, eventLocationTable]);
  };
  
  // This function actually makes the Pryv API calls, 
  // parses the results and passes them back to Tableau
  myConnector.getData = function(table, doneCallback) {
    // Multiple tables for WDC work by calling getData multiple times with a different id
    // so we want to make sure we are getting the correct table data per getData call
    switch (table.tableInfo.id) {
      case 'users':
        getUsers(table, doneCallback);
        break;
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
  
  // Retrieves Users from Pryv connections
  function getUsers(table, doneCallback) {
    tableau.reportProgress("Retrieving users");
    foreachConnectionSync(function (connection, done) {
      tableau.reportProgress("Retrieving users:" + connection.username);
      var u = userNameForConnection(connection);
        table.appendRows([{id: u , username: u}]);
        done();
      }, doneCallback);
  }

  // Collect location Events
  function getLocationEvents(table, doneCallback) {
    var locationTypes = ['position/wgs84'];
    var pryvFilter = getPryvFilter(locationTypes);
    getEvents(pryvFilter, null, table, doneCallback);
  }
  
  // Collect numerical Events
  function getNumEvents(table, doneCallback) {
    var pryvFilter = getPryvFilter();
    var postFilter = function (event) {
      return (!isNaN(parseFloat(event.content)) && isFinite(event.content));
    };
    getEvents(pryvFilter, postFilter, table, doneCallback);
  }
  
  // Create a Pryv filter according to date and limit selectors
  // and optionally a types parameter
  function getPryvFilter(types) {
    var filtering = JSON.parse(tableau.connectionData);
    if (types) {
      filtering.types = types;
    }
    return new pryv.Filter(filtering);
  }
  
  // Retrieves Events from Pryv
  function getEvents(pryvFilter, postFilter, table, doneCallback) {
    tableau.reportProgress("Retrieving events");
    foreachConnectionSync(function (connection, done) {
      tableau.reportProgress("Retrieving events for " + connection.username);
      var username = userNameForConnection(connection);
      connection.events.get(pryvFilter, function (err, events) {
        if (err) {
          tableau.abortWithError(JSON.stringify(err));
          return done();
        }
        if (events == null || events.length < 1) {
          return done();
        }
        if (postFilter) {
          events = events.filter(postFilter);
        }
        appendEvents(username, table, events);
        done();
      });
    }, doneCallback);
  }
  
  // Retrieves Streams from Pryv
  function getStreams(table, doneCallback) {
    foreachConnectionSync(function (connection, done) {
      tableau.reportProgress("Retrieving streams for " + connection.username);
      var username = userNameForConnection(connection);
      connection.streams.get(null, function (err, streams) {
        if (err) {
          tableau.abortWithError(JSON.stringify(err));
          return done();
        }
        if (streams == null || streams.length < 1) {
          return done();
        }

        var tableData = [];
        appendStreams(username, tableData, streams);
        // Fill the Table rows with Pryv data
        table.appendRows(tableData);
        done();
      });
    }, doneCallback);
  }
    
  // Append Pryv Streams to Tableau table
  function appendStreams(username, tableD, streamsArray) {
    for (var i = 0; i < streamsArray.length; i++) {
      var stream = streamsArray[i];
      tableD.push(
        {
          username: username,
          id: stream.id,
          parentId: stream.parentId,
          name: stream.name
        }
      );
      appendStreams(username, tableD, stream.children);
    }
  }
  
  // Append Pryv Events to Tableau table
  function appendEvents(username, table, eventsArray) {
    var tableData = [];
    for (var i = 0; i < eventsArray.length; i++) {
      var event = eventsArray[i];
      var eventData = {
        username: username,
        id: event.id,
        streamId: event.streamId,
        type: event.type,
        time: dateFormat(event.timeLT),
        duration: event.duration
      };
      var content = event.content;
      if(content != null && typeof content === 'object') {
        $.extend(eventData, content);
      } else {
        eventData.content = content;
      }
      tableData.push(eventData);
    }
    // Fill the Table rows with Pryv data
    table.appendRows(tableData);
  }
  
  //--- Helpers ---//
  
  // Converts Pryv timestamps to Tableau dates format
  function dateFormat(time) {
    return moment(new Date(time)).format("Y-MM-DD HH:mm:ss")
  }
  
  // Extract URL parameters value by name
  function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
      results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
  }
  
  // Compute username for provided connection (username.domain)
  function userNameForConnection(connection) {
    return connection.username + '.' + connection.settings.domain;
  }
  
})();