# bridge-tableau

Custom Tableau's Webdataconnector (WDC) implementation for Pryv

## Usage
1. In Tableau, under Connect/To a Server, choose Web Data Connector
2. A popup opens, paste the following URL and press "Enter" :
  > https://pryv.github.io/bridge-tableau/
3. (Optional) You can adapt the previous URL in order to pass custom settings:
  - If you already have a valid Pryv access (it will skip step 4) :
    > https://pryv.github.io/bridge-tableau/?username=YOURUSER&auth=YOURTOKEN
  - If you want to change the Pryv domain (default is pryv.me) :
    > https://pryv.github.io/bridge-tableau/?domain=YOURDOMAIN
  - Or both:
    > https://pryv.github.io/bridge-tableau/?username=YOURUSER&auth=YOURTOKEN&domain=YOURDOMAIN
4. Use the "Sign in" button to authorize Tableau to read your Pryv account
5. Click the "Get last 10'000 Data" to load your Pryv data in Tableau
6. You should now have access to 3 tables in Tableau:
  - Streams
  - Location Events
  - Numerical Events
