/* global $, tableau, moment, pryv */
// Define our custom Web Data Connector
// It uses version 2.x of the WDC sdk and targets Tableau 10.0 and later
(function () {
  // ---------------------------------- UI AN PAGE LOAD ------------------------------------------- //

  // Called when web page first loads
  // and when the Pryv auth flow returns to the page
  $(document).ready(function () {
    $('#serviceInfoSelectorForm').val(pryvServiceInfoUrl);
    updateUI('document.ready');
    initTimeSelectors();
    $('#pryv-resetState').click(resetState);
    $('#useApiEndpointsButton').click(loadPryvApiEndpoints);
    $('#submitButton').click(validateAndSubmit);
    $('#serviceInfoLoadButton').click(pryvAuthSetup);
    $('#loadExtraApiEndpointsButton').click(loadExtraPryvApiEndpoints);
  });

  // Adapt UI according to current auth state
  function updateUI (from) {
    console.log('UPDATE UI', from, tableau.password);
    if (tableau.password) {
      $('#submitDiv').show();
      $('#pryv-resetState').show();
      $('#apiEndpointsDiv').hide();
      if (tableau.username === kPYApiEndpointsUsername) {
        $('#loginDiv').hide();
      }
    } else {
      $('#submitDiv').hide();
      $('#pryv-resetState').hide();
      $('#apiEndpointsDiv').show();
      $('#loginDiv').show();
    }
  }

  // Initialize date and limit selectors
  function initTimeSelectors () {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    $('#timeSelectorFrom').combodate({
      value: new Date(0),
      smartDays: true,
      maxYear: currentYear
    });
    $('#timeSelectorTo').combodate({
      value: currentDate,
      smartDays: true,
      maxYear: currentYear
    });
    $('#noLimit').change(function () {
      $('#limitSelector').prop('disabled', this.checked);
    });
  }

  // ----------------------------------- Pryv Authentication setup ----------------------------------//

  // Specific username used when providing multiple apiEndpoints
  const kPYApiEndpointsUsername = 'Pryv ApiEndpoints';
  let pryvServiceInfoUrl = pryv.Browser.serviceInfoFromUrl() ||
    pryv.Browser.CookieUtils.get('pryvServiceInfoUrl') ||
    'https://reg.pryv.me/service/info';

  console.log('Loading with serviceInfoUrl', {
    serviceInfoUrl: pryvServiceInfoUrl,
    cookie: pryv.Browser.CookieUtils.get('pryvServiceInfoUrl'),
    browser: pryv.Browser.serviceInfoFromUrl()
  });

  // Initialize Pryv auth settings
  const authSettings = {
    spanButtonID: 'pryv-button',
    onStateChange: function (state) {
      console.log('##pryvAuthStateChange \t ' + JSON.stringify(state));
      if (state.id === pryv.Browser.AuthStates.AUTHORIZED) {
        // fill the apiEndpoints TextArea with the apiEndpoint
        $('#apiEndpointsTextArea').val(state.apiEndpoint);
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

  // Called at boot or when the LoadService Button is pressed
  function pryvAuthSetup () {
    pryvServiceInfoUrl = $('#serviceInfoSelectorForm').val();
    pryv.Browser.CookieUtils.set('pryvServiceInfoUrl', pryvServiceInfoUrl);

    console.log(authSettings, pryvServiceInfoUrl, pryv.utils.getQueryParamsFromURL(document.location.href));
    pryv.Browser.setupAuth(authSettings, pryvServiceInfoUrl).then(function (auth) {
      const urlParameters = window.location.href.split(/[?#]/);
      // If url contains parameters, clear them and reload the page
      if (urlParameters.length > 1) {
        window.location = urlParameters[0];
      }
    });
  }

  // resetState current connection(s) (from login and/or apiEndpoints)
  function resetState () {
    // Reset current endPoints
    saveApiEndpoints(null);
    // Reset tableau auth Process
    tableau.abortForAuth();
    pyConnections = [];
    updateUI('resetState');
  }

  // When "Use apiEndpoint is clicked"
  // Initialize Pryv connections from apiEndpoints
  // Optionally retrieve the apiEndpoints from a campaign manager link
  function loadPryvApiEndpoints () {
    const apiEndpointsString = $('#apiEndpointsTextArea').val();
    if (!apiEndpointsString) {
      return tableau.abortWithError('Please provide a apiEndpoint link.');
    }

    // Clean-up and create a coma separated list
    const apiEndpoints = apiEndpointsString.split(/[\s,\n]+/).filter(function (el) { return el.length !== 0; });

    saveApiEndpoints(apiEndpoints);
    updateUI('loadPryvApiEndpoints');

    // check api Enpoints
    checkPryvApiEndpoints();
  }

  // check apiEndpoints
  async function checkPryvApiEndpoints () {
    const apiEndpointsCheckSpan = $('#apiEndpointsCheck');
    apiEndpointsCheckSpan.html('');

    const apiConnections = getPYConnections();
    for (const apiConnection of apiConnections) {
      try {
        const info = await apiConnection.accessInfo();
        console.log(info);
        addCheck(apiConnection, true, info.name || info.id);
      } catch (e) {
        console.log('Error checking apiEndpoint', e);
        let errorMsg = e.message || e.toString() || 'Unknown error';
        if (errorMsg.length > 47) {
          errorMsg = errorMsg.substring(0, 100) + '...';
        }
        addCheck(apiConnection, false, errorMsg);
      }
    }

    function addCheck (apiConnection, sucess, message) {
      let line = sucess ? '✅' : '❌';
      line += ' ' + apiConnection.apiEndpoint + ' <b>' + message + '</b><br>\n';
      apiEndpointsCheckSpan.append(line);
    }
  }

  // When "Load extra apiEnpoints is clicked"
  // Check in the apiEnpoints referenced if we can find "credentials/pryv-api-endpoints"
  async function loadExtraPryvApiEndpoints () {
    console.log('loadExtraPryvApiEndpoints');
    const textarea = $('#apiEndpointsTextArea');
    const apiEndpointsString = textarea.val();
    if (!apiEndpointsString) {
      return tableau.abortWithError('Please provide a apiEndpoint link.');
    }

    // Clean-up and create a coma separated list
    let apiEndpoints = apiEndpointsString.split(/[\s,\n]+/).filter(function (el) { return el.length !== 0; });

    function addLineToTextArea (line) {
      textarea.val(textarea.val() + '\n' + line);
    }

    const queryAllCredentials = {
      types: ['credentials/pryv-api-endpoint'],
      limit: 10000
    };

    for (const apiEndpoint of apiEndpoints) {
      const connection = new pryv.Connection(apiEndpoint);
      console.log('loadExtraPryvApiEndpoint for', apiEndpoint);
      try {
        var apiEndpoints = await connection.getEventsStreamed(queryAllCredentials, function (event) {
          console.log('loadExtraPryvApiEndpoint event', event);
          addLineToTextArea(event.content);
        });
      } catch (e) {
        console.log('Error while loading extra apiEndpoints', e);
      }
    }
  }

  // Validate filtering parameters and save them for next phase (data gathering)
  // and submit to Tableau
  function validateAndSubmit () {
    const tempFrom = parseInt($('#timeSelectorFrom').combodate('getValue', 'X'));
    const tempTo = parseInt($('#timeSelectorTo').combodate('getValue', 'X'));
    if (isNaN(tempFrom) || isNaN(tempTo) || tempTo - tempFrom < 0) {
      return tableau.abortWithError('Invalid from/to, please make sure "from" is earlier than "to".');
    }
    const options = {
      fromTime: tempFrom,
      toTime: tempTo
    };
    if ($('#noLimit').is(':checked') === false) {
      const tempLimit = parseInt($('#limitSelector').val());
      if (isNaN(tempLimit) || tempLimit < 1) {
        return tableau.abortWithError('Invalid limit, please provide a number greater than 0.');
      }
      options.limit = tempLimit;
    }
    tableau.connectionData = JSON.stringify(options);
    tableau.connectionName = 'Pryv WDC ' + tableau.username;
    tableau.submit();
  }

  // ------------------------------  Connections and apiEndpoint Management ------------------------------ //

  // Saving Pryv username and auth token as Tableau credentials
  function saveApiEndpoints (apiEndpoints) {
    tableau.username = kPYApiEndpointsUsername;
    if (apiEndpoints != null && apiEndpoints.length >= 1) {
      tableau.password = apiEndpoints.join(',');
    } else {
      tableau.password = null;
    }
    console.log('SAVE API ENDPOINTS', tableau.password);
  }

  // Returns the current Pryv connections from tableau credentials
  // caches them for further use
  const pyConnections = [];
  function getPYConnections () {
    // return known connections
    if (pyConnections.length > 0) {
      return pyConnections;
    }
    // We do not have a Pryv connection but saved Tableau credentials
    if (tableau.password) {
      if (tableau.username === kPYApiEndpointsUsername) {
        const apiEndpoints = tableau.password.split(',');
        for (let i = 0; i < apiEndpoints.length; i++) {
          pyConnections.push(new pryv.Connection(apiEndpoints[i]));
        }
      }
    }
    return pyConnections;
  }

  // Utility to Apply function f on each current Pryv connections.
  let connectionsChecked = false;
  async function foreachConnectionSync (f, done) {
    const connections = getPYConnections();
    let i = 0;

    if (connectionsChecked) {
      loop();
    } else {
      const apiConnections = getPYConnections();
      for (const apiConnection of apiConnections) {
        try {
          const info = await apiConnection.accessInfo();
          apiConnection.ISVALIDWITHID = info.id;
        } catch (e) {

        }
      }
      connectionsChecked = true;
      loop();
    }

    function loop () {
      if (i >= connections.length) return done();
      const connection = connections[i];
      i++;
      if (connection.ISVALIDWITHID) {
        f(connection, loop);
      } else {
        loop();
      }
    }
  }

  // -------------------------------- Tableau connector setup ---------------------------------//

  const myConnector = tableau.makeConnector();

  // Init function for connector, called during every phase but
  // only called when running inside the simulator or tableau
  myConnector.init = function (initCallback) {
    tableau.authType = tableau.authTypeEnum.custom;

    updateUI('init');

    if (tableau.phase === tableau.phaseEnum.interactivePhase || tableau.phase === tableau.phaseEnum.authPhase) {
      pryvAuthSetup(); // load service info from server and setup Pryv Auth
    }

    if (tableau.phase === tableau.phaseEnum.gatherDataPhase) {
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
    const usernameCols = [{
      id: 'id',
      dataType: tableau.dataTypeEnum.string
    }, {
      id: 'username',
      dataType: tableau.dataTypeEnum.string
    }
    ];

    const usernamesTable = {
      id: 'users',
      alias: 'Users',
      columns: usernameCols
    };

    // Numerical events table
    const eventNumCols = [{
      id: 'username',
      alias: 'username',
      dataType: tableau.dataTypeEnum.string,
      foreignKey: { tableId: 'users', columnId: 'id' },
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: 'id',
      dataType: tableau.dataTypeEnum.string
    }, {
      id: 'streamId',
      alias: 'streamId',
      dataType: tableau.dataTypeEnum.string,
      foreignKey: { tableId: 'stream', columnId: 'id' },
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: 'time',
      alias: 'time',
      dataType: tableau.dataTypeEnum.datetime
    }, {
      id: 'duration',
      alias: 'duration',
      dataType: tableau.dataTypeEnum.float
    }, {
      id: 'type',
      alias: 'type',
      dataType: tableau.dataTypeEnum.string,
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: 'content',
      alias: 'content',
      dataType: tableau.dataTypeEnum.float,
      columnRole: tableau.columnRoleEnum.measure
    }];

    const eventNumTable = {
      id: 'eventNum',
      alias: 'Numerical Events',
      columns: eventNumCols
    };

    // Location events table
    const eventLocationCols = [{
      id: 'username',
      alias: 'username',
      dataType: tableau.dataTypeEnum.string,
      foreignKey: { tableId: 'users', columnId: 'id' },
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: 'id',
      dataType: tableau.dataTypeEnum.string
    }, {
      id: 'streamId',
      alias: 'streamId',
      dataType: tableau.dataTypeEnum.string,
      foreignKey: { tableId: 'stream', columnId: 'id' }
    }, {
      id: 'time',
      alias: 'time',
      dataType: tableau.dataTypeEnum.datetime
    }, {
      id: 'duration',
      alias: 'duration',
      dataType: tableau.dataTypeEnum.float
    }, {
      id: 'type',
      alias: 'type',
      dataType: tableau.dataTypeEnum.string,
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: 'latitude',
      alias: 'latitude',
      columnRole: 'dimension',
      dataType: tableau.dataTypeEnum.float
    }, {
      id: 'longitude',
      alias: 'longitude',
      columnRole: 'dimension',
      dataType: tableau.dataTypeEnum.float
    }];

    const eventLocationTable = {
      id: 'eventLocation',
      alias: 'Location Events',
      columns: eventLocationCols
    };

    // Streams table
    const streamCols = [{
      id: 'username',
      alias: 'username',
      dataType: tableau.dataTypeEnum.string,
      foreignKey: { tableId: 'users', columnId: 'id' },
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: 'id',
      dataType: tableau.dataTypeEnum.string
    }, {
      id: 'name',
      alias: 'name',
      dataType: tableau.dataTypeEnum.string,
      columnRole: tableau.columnRoleEnum.dimension
    }, {
      id: 'parentId',
      alias: 'parentId',
      dataType: tableau.dataTypeEnum.string,
      foreignKey: { tableId: 'stream', columnId: 'id' },
      columnRole: tableau.columnRoleEnum.dimension
    }];

    const streamTable = {
      id: 'stream',
      alias: 'Streams table',
      columns: streamCols
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
  };

  tableau.registerConnector(myConnector);

  // ------------------------------------ Data loaders -----------------------------------//

  // Retrieves Users from Pryv connections
  function getUsers (table, doneCallback) {
    tableau.reportProgress('Retrieving users');
    foreachConnectionSync(function (connection, done) {
      tableau.reportProgress('Retrieving users:' + connection.apiEndpoint);
      const u = userNameForConnection(connection);
      table.appendRows([{ id: u, username: u }]);
      done();
    }, doneCallback);
  }

  // Collect location Events
  function getLocationEvents (table, doneCallback) {
    const locationTypes = ['position/wgs84'];
    const pryvFilter = getPryvFilter(locationTypes);
    getEvents(pryvFilter, function () { return true; }, table, doneCallback);
  }

  // Collect numerical Events
  function getNumEvents (table, doneCallback) {
    const pryvFilter = getPryvFilter();
    const postFilter = function (event) {
      return (!isNaN(parseFloat(event.content)) && isFinite(event.content));
    };
    getEvents(pryvFilter, postFilter, table, doneCallback);
  }

  // Create a Pryv filter according to date and limit selectors
  // and optionally a types parameter
  function getPryvFilter (types) {
    const filtering = JSON.parse(tableau.connectionData);
    if (types) {
      filtering.types = types;
    }
    console.log('GET FILTERING', filtering);
    return filtering;
  }

  // Retrieves Events from Pryv
  function getEvents (pryvFilter, postFilter, table, doneCallback) {
    const events = [];
    tableau.reportProgress('Retrieving events');
    foreachConnectionSync(function (connection, done) {
      tableau.reportProgress('Retrieving events for ' + connection.apiEndpoint);
      const username = userNameForConnection(connection);
      let count = 0;
      connection.getEventsStreamed(pryvFilter, function forEachEvent (event) {
        if (postFilter(event)) {
          tableau.reportProgress('Retrieving events for ' + connection.apiEndpoint + ': ' + count);
          count++;
          events.push(event);
        }
      }).then(function (res) {
        appendEvents(username, table, events);
        console.log('GET EVENTS DONE', res);
        done();
      });
    }, doneCallback);
  }

  // Retrieves Streams from Pryv
  function getStreams (table, doneCallback) {
    foreachConnectionSync(function (connection, done) {
      tableau.reportProgress('Retrieving streams for ' + connection.apiEndpoint);
      const username = userNameForConnection(connection);
      const apiCalls = [{ method: 'streams.get', params: {} }];
      connection.api(apiCalls).then(function (res) {
        console.log('Streams GET response: ', res);
        const streams = res[0].streams;
        if (streams == null || streams.length < 1) {
          return done();
        }

        const tableData = [];
        appendStreams(username, tableData, streams);
        // Fill the Table rows with Pryv data
        table.appendRows(tableData);
        done();
      });
    }, doneCallback);
  }

  // Append Pryv Streams to Tableau table
  function appendStreams (username, tableD, streamsArray) {
    for (let i = 0; i < streamsArray.length; i++) {
      const stream = streamsArray[i];
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
  function appendEvents (username, table, eventsArray) {
    const tableData = [];
    for (let i = 0; i < eventsArray.length; i++) {
      const event = eventsArray[i];
      const eventData = {
        username: username,
        id: event.id,
        streamId: event.streamId,
        type: event.type,
        time: dateFormat(event.time * 1000),
        duration: event.duration
      };
      const content = event.content;
      if (content != null && typeof content === 'object') {
        $.extend(eventData, content);
      } else {
        eventData.content = content;
      }
      console.log('APPEND EVENT', eventData);
      tableData.push(eventData);
    }
    // Fill the Table rows with Pryv data
    table.appendRows(tableData);
  }

  // --- Helpers ---//

  // Converts Pryv timestamps to Tableau dates format
  function dateFormat (time) {
    return moment(new Date(time)).format('Y-MM-DD HH:mm:ss');
  }

  // Compute username for provided connection (username.domain)
  function userNameForConnection (connection) {
    return connection.apiEndpoint.split('/')[2];
  }
})();
