qb-report
=========

[![npm license](https://img.shields.io/npm/l/qb-report.svg)](https://www.npmjs.com/package/qb-report) [![npm version](https://img.shields.io/npm/v/qb-report.svg)](https://www.npmjs.com/package/qb-report) [![npm downloads](https://img.shields.io/npm/dm/qb-report.svg)](https://www.npmjs.com/package/qb-report)

A lightweight, promise based abstraction layer for Quick Base Reports

Written in TypeScript, targets Nodejs and the Browser

This library targets the new RESTful JSON-based API, not the old XML-based API. If you want to use the old XML-based API, then please use [v2.x](https://github.com/tflanagan/node-qb-table/tree/v2.x/) of the `QBTable` library.

```
IE 11 Users, if you are receiving this error:
XMLHttpRequest: Network Error 0x80070005, Access is denied.

This is not a limitation of the library, just how Quick Base's new API works.
In order to use the new RESTful JSON-based API in Internet Explorer, you must
change a security setting:

- Go to Internet Options -> Security -> Custom Level
- Scroll down to and find the "Miscellaneous" section
- Ensure "Access data sources across domains" is set to "Enable"
- Click "OK", "Yes", "OK"
```

Install
-------
```
# Install
$ npm install qb-report
```

Documentation
-------------

[TypeDoc Documentation](https://tflanagan.github.io/node-qb-report/)

Server-Side Example
-------------------
```typescript
import { QBReport } from 'qb-report';
import { QuickBase } from 'quickbase';

const quickbase = new QuickBase({
    realm: 'www',
    userToken: 'xxxxxx_xxx_xxxxxxxxxxxxxxxxxxxxxxxxxx'
    // Use tempToken if utilizing an authentication token sent
    // up from client-side code. If possible, this is preferred.
    // tempToken: 'xxxxxx_xxx_xxxxxxxxxxxxxxxxxxxxxxxxxx'
});

const qbReport = new QBReport({
	quickbase: quickbase,
	dbid: 'xxxxxxxxx',
	reportId: 1
});

(async () => {
    try {
        const results = await qbReport.load();

        console.log(qbReport.records);
    }catch(err){
        console.error(err);
    }
})();
```

Client-Side Example
-------------------
Import `QBReport` by loading `qb-report.browserify.min.js`

```javascript
var quickbase = new QuickBase({
    realm: 'www'
});

var qbReport = new QBReport({
	quickbase: quickbase,
	dbid: 'xxxxxxxxx',
	reportId: 1
});

// Using a Temporary Token
quickbase.getTempTokenDBID({
    dbid: 'xxxxxxxxx'
}).then(function(results){
    return qbReport.load();
}).then(function(results){
    console.log(results.records);
}).catch(function(err){
    console.error(err);
});
```

License
-------
Copyright 2019 Tristian Flanagan

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
