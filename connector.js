/* global Pryv $ */
// Define our custom Web Data Connector
// It uses version 2.x of the WDC sdk and targets Tableau 10.0 and later
(function () {

  //--- Authentication setup ---//

  // Specific username used when providing multiple apiEndpoints
  var kPYApiEndpointsUsername = "Pryv ApiEndpoints";
  // Campaign manager endpoint used to retrieve apiEndpoints from a campaign
  var campaignManagerUrl = 'pryvcampaign://';
  var pryvServiceInfoUrl =  Pryv.Browser.serviceInfoFromUrl() || 
    Pryv.Browser.CookieUtils.get('pryvServiceInfoUrl') || 
    'https://reg.pryv.me/service/info';
  $('#serviceInfoSelectorFrom').val(pryvServiceInfoUrl);

  // Initialize Pryv auth settings
  var authSettings = {
    spanButtonID: 'pryv-button',
    onStateChange: function (state) {
      console.log('##pryvAuthStateChange \t ' + JSON.stringify(state));
      if (state.id === Pryv.Browser.AuthStates.AUTHORIZED) {
        onSignedIn(state.apiEndpoint);
        console.log('# Auth succeeded for user ' + state.apiEndpoint);
      }
    },
    authRequest: {
      requestingAppId: 'tableau-demo',
      requestedPermissions: [
        {
          streamId: '*',
          level: 'read'
        }
      ],
      languageCode: 'en',
      returnURL: 'self#'
    }
  };
  // will be called during initalization
  function pryvAuthSetup() {
    console.log(authSettings, pryvServiceInfoUrl, Pryv.utils.getQueryParamsFromURL(document.location.href));
    Pryv.Browser.setupAuth(authSettings, pryvServiceInfoUrl);
  }

  // Called when web page first loads
  // and when the Pryv auth flow returns to the page
  $(document).ready(function () {
    updateUI('document.ready');
    initSelectors();
    $('#pryv-logout').click(logout);
    $('#useApiEndpointLink').click(loadPryvApiEndpoints);
    $("#submitButton").click(validateAndSubmit);
    $("#serviceInfoLoadButton").click(loadServiceInfo);
  });

  // Logout current connection(s) (from login and/or apiEndpoints)
  function logout() {
    resetAuthState();
    updateUI('logout');
    var urlParameters = window.location.href.split(/[?#]/);
    // If url contains parameters, clear them and reload the page
    if (urlParameters.length > 1) {
      window.location = urlParameters[0];
    }
  }

  function loadServiceInfo() {
    pryvServiceInfoUrl = $('#serviceInfoSelectorFrom').val();
    Pryv.Browser.CookieUtils.set('pryvServiceInfoUrl', pryvServiceInfoUrl);
    pryvAuthSetup();
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
    $("#noLimit").change(function () {
      $("#limitSelector").prop('disabled', this.checked);
    });
  }

  // Initialize Pryv connections from apiEndpoints
  // Optionally retrieve the apiEndpoints from a campaign manager link
  function loadPryvApiEndpoints() {
    var apiEndpointsString = $('#apiEndpointsTextArea').val();
    if (!apiEndpointsString) {
      return tableau.abortWithError('Please provide a apiEndpoint link.');
    }

    // Clean-up and create a coma separated list
    var apiEndpoints = apiEndpointsString.split(/[\s,\n]+/).filter(function (el) { return el.length != 0 });

    // If using a campaign manager link, we need to retrieve apiEndpoints from it first.
    // Then a second call to this function is required to actually load the apiEndpoints.
    if (apiEndpoints.length > 0 && apiEndpoints[0].substring(0, campaignManagerUrl.length) === campaignManagerUrl) {
      apiEndpoints = getApiEndpointsFromCampaignManager(apiEndpoints);
      return;
    }

    saveApiEndpoints(apiEndpoints);
    updateUI();
  }




  // Specific call to retrieve apiEndpoints from a campaign manager link
  function getApiEndpointsFromCampaignManager(apiEndpoints) {
    var CMlink = apiEndpoints[0].substring(campaignManagerUrl.length);

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
    }).done(function (data) {
      var apiEndpointsText = "";
      data.invitations.map(function (invitation) {
        // add only if token is valid
        if (invitation.accessToken && invitation.status === 'accepted') {
          apiEndpointsText += 'https://'  + invitation.accessToken + '@' + invitation.requestee.pryvUsername + '.' + domain + '\n';
        }
      });
      $('#apiEndpointsTextArea').val(apiEndpointsText);
    }).fail(function (xhr, status, error) {
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

  

  // Returns the current Pryv connection and is able to either:
  // - Save auth/username from current Pryv connection(s) as Tableau credentials
  // - Or open new Pryv connection(s) from saved Tableau credentials
  var pyConnections = [];
  function getPYConnections() {
    // return known connections
    if (pyConnections.length > 0) {
     return pyConnections;
    }
    // We do not have a Pryv connection but saved Tableau credentials
    if (tableau.password) {
      if (tableau.username === kPYApiEndpointsUsername) {
        var apiEndpoints = tableau.password.split(',');
        for (var i = 0; i < apiEndpoints.length; i++) {
          pyConnections.push(new Pryv.Connection(apiEndpoints[i]));
        }
      }
    }
    return pyConnections;
  }

  // Apply function f on each current Pryv connections.
  function foreachConnectionSync(f, done) {
    var connections = getPYConnections();
    var i = 0;
    function loop() {
      if (i >= connections.length) return done();
      var connection = connections[i];
      i++;
      f(connection, loop);
    }
    loop();
  }

  // Reset auth state by erasing saved Tableau credentials and Pryv connections.
  function resetAuthState() {
    saveApiEndpoints(null);
    //if (tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
      tableau.abortForAuth();
    //}
    pyConnections = [];
  }

  // Adapt UI according to current auth state
  function updateUI(from) {
    console.log('UPDATE UI', from, tableau.password);
    if (tableau.password) {
      $('#submitDiv').show();
      $('#pryv-logout').show();
      $('#apiEndpointsDiv').hide();
      if (tableau.username === kPYApiEndpointsUsername) {
        $('#loginDiv').hide();
      }
    } else {
      $('#submitDiv').hide();
      $('#pryv-logout').hide();
      $('#apiEndpointsDiv').show();
      $('#loginDiv').show();
    }
  }

  // Saving Pryv username and auth token as Tableau credentials
  function saveApiEndpoints(apiEndpoints) {
    tableau.username = kPYApiEndpointsUsername;
    if (apiEndpoints != null && apiEndpoints.length >= 1) {
      tableau.password = apiEndpoints.join(',');
    } else {
      tableau.password = null;
    }
    console.log('SAVE API ENDPOINTS', tableau.password);
  }

  // Pryv callback triggered when the user is signed in.
  function onSignedIn(apiEndpoint) {
    $('#apiEndpointsTextArea').val(apiEndpoint);
  }

  //--- Tableau connector setup ---//

  var myConnector = tableau.makeConnector();

  // Init function for connector, called during every phase but
  // only called when running inside the simulator or tableau
  myConnector.init = function (initCallback) {
    tableau.authType = tableau.authTypeEnum.custom;

    updateUI('init');

    if (tableau.phase == tableau.phaseEnum.interactivePhase || tableau.phase == tableau.phaseEnum.authPhase) {
      loadServiceInfo(); // load service info from server and setup Pryv Auth
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
  myConnector.getSchema = function (schemaCallback) {

    // Usernames table
    var username_cols = [{
      id: "id",
      dataType: tableau.dataTypeEnum.string
    }, {
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
      foreignKey: { tableId: 'users', columnId: 'id' },
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: "id",
      dataType: tableau.dataTypeEnum.string
    }, {
      id: "streamId",
      alias: "streamId",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: { tableId: 'stream', columnId: 'id' },
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
      foreignKey: { tableId: 'users', columnId: 'id' },
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: "id",
      dataType: tableau.dataTypeEnum.string
    }, {
      id: "streamId",
      alias: "streamId",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: { tableId: 'stream', columnId: 'id' }
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
      foreignKey: { tableId: 'users', columnId: 'id' },
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: "id",
      dataType: tableau.dataTypeEnum.string
    }, {
      id: "name",
      alias: "name",
      dataType: tableau.dataTypeEnum.string,
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: "parentId",
      alias: "parentId",
      dataType: tableau.dataTypeEnum.string,
      foreignKey: { tableId: 'stream', columnId: 'id' },
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
  myConnector.getData = function (table, doneCallback) {
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
      table.appendRows([{ id: u, username: u }]);
      done();
    }, doneCallback);
  }

  // Collect location Events
  function getLocationEvents(table, doneCallback) {
    var locationTypes = ['position/wgs84'];
    var pryvFilter = getPryvFilter(locationTypes);
    getEvents(pryvFilter, function() { return true; }, table, doneCallback);
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
    console.log('GET FILTERING', filtering);
    return filtering;
  }

  // Retrieves Events from Pryv
  function getEvents(pryvFilter, postFilter, table, doneCallback) {
    const events = [];
    tableau.reportProgress("Retrieving events");
    foreachConnectionSync(function (connection, done) {
      tableau.reportProgress("Retrieving events for " + connection.username);
      var username = userNameForConnection(connection);
      connection.getEventsStreamed(pryvFilter, function forEachEvent(event) {
        if (postFilter(event)) {
          events.push(event);
        }
      }).then(function(res) {
        appendEvents(username, table, events);
        console.log('GET EVENTS DONE', res);
        done();
      });

    }, doneCallback);
  }

  // Retrieves Streams from Pryv
  function getStreams(table, doneCallback) {
    foreachConnectionSync(function (connection, done) {
      tableau.reportProgress("Retrieving streams for " + connection.username);
      var username = userNameForConnection(connection);
      var apiCalls = [{method: 'streams.get', params: {}}];
      connection.api(apiCalls).then(function (res) {
        console.log('Streams GET response: ', res);
        var streams = res[0].streams;
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
      if (content != null && typeof content === 'object') {
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
    return connection.apiEndpoint.split('/')[2];
  }

})();