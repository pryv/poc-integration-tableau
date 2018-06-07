# bridge-tableau

Custom Web data connector ([WDC](http://tableau.github.io/webdataconnector/docs/)) implementation for Pryv and Tableau.

The connector uses WDC Version 2.2 and targets Tableau 10.0 and later.

_NOTE: Tableau refers either to [Tableau Desktop](https://www.tableau.com/products/desktop), for which you can have a free 14-day trial or [Tableau Public](https://public.tableau.com/s/), which you can use for free but with restrictions._

## Usage
1. In Tableau, under Connect/To a Server, choose Web Data Connector.
2. A popup opens, paste the following URL and press "Enter" :
    > https://pryv.github.io/bridge-tableau/
3. (Optional) You can adapt the previous URL in order to pass custom settings:
    - If you already have a valid Pryv access (it skips steps 4 and 5) :
        > https://pryv.github.io/bridge-tableau/?username=YOURUSER&auth=YOURTOKEN
    - If you want to change the Pryv domain (default is pryv.me) :
        > https://pryv.github.io/bridge-tableau/?domain=YOURDOMAIN
    - Or both :
        > https://pryv.github.io/bridge-tableau/?username=YOURUSER&auth=YOURTOKEN&domain=YOURDOMAIN
4. Use the "Sign in" button to login to your  Pryv account and authorize Tableau to access it.
5. Click the "Get last 10'000 Data" to retrieve some of your Pryv data in Tableau.
6. You should now have access to 3 tables in Tableau :
    - Streams
    - Location Events
    - Numerical Events
7. Double-click on any of these tables to add them in the schema view, you can also join multiple tables.
8. Click on "Update now" to fill the tables with data.
9. Click the sheet tab to begin your analysis in a new worksheet.
10. Here is some additional links to get started with Tableau:
    - [Get Started with Tableau Desktop](https://onlinehelp.tableau.com/current/guides/get-started-tutorial/en-us/get-started-tutorial-home.html)
    - [Build a Basic View to Explore Your Data](https://onlinehelp.tableau.com/current/pro/desktop/en-us/getstarted_buildmanual_ex1basic.html)

## Contribute

This paragraph contains some pointers to help understanding the connector code,
in case you want to fork it and adapt it to your own needs.

### Tableau part

First of all, we include the [Tableau WDC sdk](https://connectors.tableau.com/libs/tableauwdc-2.2.latest.js) in the index.html. It gives access to a tableau object, which will be used to define the Tableau logic.
```
<script src="https://connectors.tableau.com/libs/tableauwdc-2.2.latest.js" type="text/javascript"></script>
```

#### Initialization

In connector.js, we first instanciate our Tableau connector:
```
var myConnector = tableau.makeConnector();
```

We then define the myConnector.init function, which will be called at the start of every Tableau phase (see Phases [1](#phase-1:-authentication) and [2](#phase-2:-data-gathering)).
The main tasks of this function is to tell tableau that we want a custom authentication type  (see Phases [1](#phase-1:-authentication)):
```
tableau.authType = tableau.authTypeEnum.custom;
```
and to save Pryv's credentials in Tableau so that they persist between phases.

Finally, we define the myConnector.getData/getSchema functions (see Phase [2](#phase-2:-data-gathering)) and conclude the connector initialization by registering it:
```
tableau.registerConnector(myConnector);
```

#### Phase 1: Authentication

By default, the connector will start with Tableau authentication phase, which will show a popup with a form to provide Tableau credentials.

We have to replace this default authentication phase with Pryv authentication (see [Pryv authentication](#authentication)), by telling Tableau that we want a custom authentication type (as explained in [Initialization](#initialization)) or directly by aborting the current Tableau phase:
```
tableau.abortForAuth();
```

Once authenticated, we show a submit button (declared in index.html) that will call Tableau submit function on user click and start the data gathering phase:
```
<button id="submitButton" onclick="tableau.submit();">Get last 10'000 Data</button>
```

#### Phase 2: Data gathering

In order to complete the configuration of the Tableau connector logic, we have to provide two additional functions that will be called to gather and structure the data, once authentication is sucessful.

##### Schema definition

Firstly, we define our data schema in myConnector.getSchema function, by enumerating the tables in which we will store the data and their corresponding columns.
Tables are simple objects containing an id, an alias and an array of column :
```
var streamTable = {
	id: "stream",
	alias: "Streams table",
	columns: stream_cols
};
```
A column is defined by an id, an alias, a data type and can optionnaly specify a foreign key (a relation to another column) :
```
{
	id: "parentId",
	alias: "parentId",
	dataType: tableau.dataTypeEnum.string,
	foreignKey: {tableId: 'stream', columnId: 'id'}
}
```

In our case, the schema contains the following three tables:
- streamTable: classifies Pryv Streams in the following columns:
	- id: id of the Stream
	- name: name of the Stream
	- parentId: id of the parent Stream, foreign key with the other stream ids
- eventNumTable: classifies Pryv numerical Events in the following columns:
	- id: id of the Event
	- streamId: id of the Stream, foreign key with the stream table
	- time: timestamp of the Event
	- duration: duration of the Event
	- type: type of the Event, in this case any numerical type
	- content: content of the Event, the actual numeric measurement
- eventLocationTable: classifies Pryv location Events, the columns are similar to eventNumTable but for:
	- type: in this case a location type, such as 'position/wgs84'
	- latitude: first part of the Event's content
	- longitude: second part of the Event's content

##### Retrieving the data

Secondly, we define how and where Tableau will retrieve data by implementing myConnector.getData function.

Since this function will be called once for each table of our schema, we have to check the current table id and call the according retrieval method:
```
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
```

The exact implementation of the retrieval methods will be covered in Pryv part (see [Pryv data gathering](#data-gathering)).

### Pryv part

For Pryv logic, we import the our javascript library in the index.html. It gives access to a pryv object that will be used for authentication/connection to Pryv as well as for some utility functions. We also add a login button in the index.html (#pryv-button) that will allow the user to authenticate with a Pryv account.

#### Initialization

In a first step, we configure some settings for the Pryv authentication (see [Authorize your app in API reference](http://api.pryv.com/getting-started/javascript/#authorize-your-app)):
- **Domain** corresponding to the Pryv platform on which your user is registered.
- **Id** of the application (connector).
- Array of **Permissions** to be granted to the connector, where each **Permission** indicates:
	- **streamId**: an ids array of Pryv streams that we want to access from Tableau.
	- **level**: the access level of the access we will grant (read/manage/contribute).
- A set of **callbacks** that will be called during the authentication process (see [Pryv authentication](#authentication)).

The utility function getSettingsFromURL() parses some custom parameters that the user may provide in the connector URL to further configure the Pryv authentication (see [Usage](#usage), step 3).

#### Authentication

As soon as the Tableau connector opens, it will start the Pryv authentication flow (if not already authenticated) by calling pryvAuthSetup(). Two situations can be observed:
- If the user provided an existing Pryv access through the connector URL (see [Usage](#usage), step 3), it will bypass Pryv authentication and directly jumps to data gathering by calling tableau.submit().
- Otherwise, it will call pryv.Auth.setup(authSettings), which will activate the Pryv login button (#pryv-button) and start the authentication flow.

##### Phase 1: needSignin

The first callback that will trigger is needSignin, which indicates that the user did not authorize the Tableau connector to access the Pryv account yet. In this phase, we simply reset the authentication state (in case a previous session still exists) by calling resetAuthState() and tell Tableau to abort its current phase for custom authentication (tableau.abortForAuth()).

From there, the connector just wait that the user login with a Pryv account. On sucessful login, the user will be asked to accept the permissions requested by Tableau connector.

##### Phase 2: signedIn

Once the user accepts, an access will be granted and it will trigger the signedIn callback, which receives the newly opened Pryv connection and shows the Pryv logout button (#pryv-logout).

Finally, connection to Pryv is cached using  getPYConnection() function, which serves in fact three roles:
- If a Pryv connection is already open, it stores the corresponding Pryv credentials as Tableau credentials, so that the session persists during phases and navigation in Tableau.
- If Tableau credentials exists but we lost the connection to Pryv, it opens a new Pryv connection using the same credentials.
- Finally, it returns the current Pryv connection.

#### Data gathering

We implemented three functions that define how Tableau will collect data and fill each table we previously delcared during [schema definition](#schema-definition).

##### Get Streams

The getStreams function uses the current Pryv connection to GET Streams and then calls appendStreams to parse the resulting Streams and append them as rows of the corresponding table (table.appendRows).

##### Get Location Events

The getLocationEvents uses the getEvents function to GET Events, which is similar to getStreams, but provides an additional Pryv Filter to limit the results to the last 10'000 Events of type location ('position/wgs84').

Again similarly to Streams, we call appendEvents to parse the resulting Events and append them as rows of the corresponding table.

##### Get Numerical Events

Finally, retrieval of numerical Events through getNumEvents follows the same method as for location Events with the only difference that we use this time a post-filtering function to limit the resulting Events to numerical measurements:
```
var postFilter = function (event) {
	return (!isNaN(parseFloat(event.content))
		&& isFinite(event.content));
};
```

While Pryv Filters will perform the filtering on the API side, the post-filtering are applied by the connector, after the Events have been retrieved from Pryv. It allows to further filter the results when it is not possible only with Pryv filter.

## License

[Revised BSD license](https://github.com/pryv/documents/blob/master/license-bsd-revised.md)
