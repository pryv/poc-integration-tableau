# bridge-tableau

Custom Web data connector ([WDC](http://tableau.github.io/webdataconnector/docs/)) implementation for Pryv and Tableau.

The connector uses WDC Version 2.2 and targets Tableau 10.0 and later.

_NOTE: Tableau refers to either [Tableau Desktop](https://www.tableau.com/products/desktop) or [Tableau Public](https://public.tableau.com/s/)._

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

## License

[Revised BSD license](https://github.com/pryv/documents/blob/master/license-bsd-revised.md)
